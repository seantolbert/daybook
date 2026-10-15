// Google OAuth + read-only Calendar/Gmail access. Server only; tokens never reach the browser.
import crypto from 'node:crypto';
import { adminClient } from './supabase.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_TTL_MS = 10 * 60 * 1000;

export class GoogleAuthError extends Error {
  constructor(message) { super(message); this.name = 'GoogleAuthError'; }
}

// ---------------------------------------------------------------------------
// OAuth state: HMAC-signed {userId, expiry, nonce}
// ---------------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function stateKey() {
  const k = process.env.OAUTH_STATE_SECRET;
  if (!k) throw new Error('OAUTH_STATE_SECRET is not set');
  return k;
}

export function signState(userId) {
  const payload = b64url(JSON.stringify({ u: userId, e: Date.now() + STATE_TTL_MS, n: crypto.randomBytes(8).toString('hex') }));
  const sig = b64url(crypto.createHmac('sha256', stateKey()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [payload, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', stateKey()).update(payload).digest();
  let given;
  try { given = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof u === 'string' && Date.now() < e ? u : null;
  } catch { return null; }
}

export function consentUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...body,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || `http_${res.status}`;
    if (err === 'invalid_grant') throw new GoogleAuthError('Google access was revoked or expired — reconnect in Profile.');
    throw new Error(`Google token error: ${err}${data.error_description ? ` (${data.error_description})` : ''}`);
  }
  return data;
}

export function exchangeCode(code) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: process.env.GOOGLE_REDIRECT_URI });
}

export async function fetchAccountEmail(accessToken) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

export async function revokeToken(token) {
  if (!token) return;
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Token storage + refresh
// ---------------------------------------------------------------------------
export async function getTokenRow(userId) {
  const { data, error } = await adminClient().from('google_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** A valid access token, refreshed when within 60 s of expiry (and persisted). */
export async function getAccessToken(userId, { force = false } = {}) {
  const row = await getTokenRow(userId);
  if (!row?.refresh_token) throw new GoogleAuthError('Google is not connected.');
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : 0;
  if (!force && row.access_token && expiresAt - Date.now() > 60_000) return row.access_token;

  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  const update = {
    access_token: t.access_token,
    expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
  };
  if (t.refresh_token) update.refresh_token = t.refresh_token; // Google may rotate it
  if (t.scope) update.scopes = t.scope.split(' ');
  const { error } = await adminClient().from('google_tokens').update(update).eq('user_id', userId);
  if (error) throw error;
  return t.access_token;
}

async function gget(userId, url) {
  let token = await getAccessToken(userId);
  let res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    token = await getAccessToken(userId, { force: true });
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const e = new Error(`Google API ${res.status}: ${body.error?.message || res.statusText}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
function meetLink(ev) {
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video' && p.uri);
  if (video) return video.uri;
  // Zoom/Teams links pasted into location/description
  const m = `${ev.location || ''} ${ev.description || ''}`.match(/https:\/\/[\w.-]*(zoom\.us|teams\.microsoft\.com|meet\.google\.com|whereby\.com)\/[^\s"<>)]+/i);
  return m ? m[0] : null;
}

/**
 * Events from the primary calendar plus any calendar the user has marked `selected`.
 * Returns normalized events; never includes descriptions or attendee lists.
 */
export async function fetchEvents(userId, timeMin, timeMax) {
  const list = await gget(userId, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250');
  const calendars = (list.items || []).filter((c) => c.primary || c.selected);
  const results = await Promise.all(calendars.map(async (cal) => {
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
    });
    try {
      const data = await gget(userId, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`);
      return (data.items || [])
        .filter((ev) => ev.status !== 'cancelled')
        .filter((ev) => !(ev.attendees || []).some((a) => a.self && a.responseStatus === 'declined'))
        .map((ev) => {
          const allDay = !!ev.start?.date;
          return {
            id: `${cal.id}:${ev.id}`,
            title: ev.summary || '(No title)',
            start: allDay ? ev.start.date : ev.start?.dateTime,
            end: allDay ? ev.end?.date : ev.end?.dateTime,
            allDay,
            location: ev.location || null,
            calendarId: cal.id,
            calendarName: cal.summaryOverride || cal.summary || '',
            primary: !!cal.primary,
            color: cal.backgroundColor || null,
            meetUrl: meetLink(ev),
            htmlLink: ev.htmlLink || null,
          };
        });
    } catch (err) {
      console.warn('calendar fetch failed', cal.id, err.message);
      return [];
    }
  }));
  return results.flat().sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

// ---------------------------------------------------------------------------
// Gmail (metadata only — never message bodies)
// ---------------------------------------------------------------------------
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodeEntities = (s) => String(s || '')
  .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function parseFrom(from) {
  const m = String(from || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].toLowerCase() };
  return { name: String(from || '').trim(), email: String(from || '').trim().toLowerCase() };
}

export async function fetchAttentionThreads(userId, accountEmail) {
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const queries = [
    'is:unread newer_than:2d -category:promotions -category:social',
    'to:me newer_than:3d -from:me',
  ];
  const lists = await Promise.all(queries.map((q) => gget(userId, `${base}/threads?${new URLSearchParams({ q, maxResults: '15' })}`)));
  const ids = [...new Set(lists.flatMap((l) => (l.threads || []).map((t) => t.id)))].slice(0, 25);
  const me = String(accountEmail || '').toLowerCase();

  const threads = await Promise.all(ids.map(async (id) => {
    const params = new URLSearchParams({ format: 'metadata' });
    ['From', 'Subject', 'Date'].forEach((h) => params.append('metadataHeaders', h));
    try {
      const t = await gget(userId, `${base}/threads/${id}?${params}`);
      const msgs = t.messages || [];
      const last = msgs[msgs.length - 1];
      if (!last) return null;
      const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      const from = parseFrom(header(last, 'From'));
      if (me && from.email === me) return null; // last word is mine — nothing waiting on me
      return {
        threadId: id,
        from: from.name,
        fromEmail: from.email,
        subject: header(msgs[0], 'Subject') || header(last, 'Subject') || '(no subject)',
        snippet: decodeEntities(last.snippet).slice(0, 200),
        date: new Date(Number(last.internalDate)).toISOString(),
        unread: msgs.some((m) => (m.labelIds || []).includes('UNREAD')),
        url: `https://mail.google.com/mail/u/0/?authuser=${encodeURIComponent(me)}#all/${id}`,
      };
    } catch (err) {
      console.warn('gmail thread failed', id, err.message);
      return null;
    }
  }));
  return threads.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}
