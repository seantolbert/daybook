// Pure helpers shared by the app and the Node tests. No DOM, no globals.

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escape any value for safe use in HTML text or a quoted attribute. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESC[c]);
}

/** Only allow http(s) and mailto URLs; anything else becomes ''. Returns the raw (unescaped) URL. */
export function safeUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

/** Only allow #rgb / #rrggbb colors, for use inside style attributes. */
export function safeColor(color, fallback = '#8B7CF6') {
  return typeof color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()) ? color.trim() : fallback;
}

// ---------------------------------------------------------------------------
// Markdown (tiny, safe): headings, bold, italics-free, lists, links. Escape first.
// ---------------------------------------------------------------------------
function inline(escaped) {
  // escaped text in → HTML out. Links: [text](https://...) — url is already escaped, so quotes are inert.
  let out = escaped.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
    const raw = href.replace(/&amp;/g, '&');
    if (!/^(https?:\/\/|mailto:)/i.test(raw) || !safeUrl(raw)) return text;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  return out;
}

/** Render a small, whitelisted subset of markdown. Everything is escaped before any tag is produced. */
export function renderMarkdown(md) {
  const lines = esc(md || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let list = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    let m;
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if ((m = line.match(/^\s{0,3}(#{1,4})\s+(.*)$/))) {
      flushPara();
      closeList();
      const level = Math.min(m[1].length + 2, 6); // # → h3 … keep headings small inside cards
      html.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
      html.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
      html.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return html.join('');
}

/** Split markdown into sections at headings (or a bold-only line). Returns [{title, body}] — raw md. */
export function splitSections(md) {
  const sections = [];
  let cur = { title: '', body: [] };
  for (const line of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(/^\s{0,3}#{1,4}\s+(.*)$/) || line.match(/^\s*\*\*([^*]+)\*\*\s*:?\s*$/);
    if (h) {
      if (cur.title || cur.body.join('').trim()) sections.push(cur);
      cur = { title: h[1].trim(), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  if (cur.title || cur.body.join('').trim()) sections.push(cur);
  return sections.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}

// ---------------------------------------------------------------------------
// Dates — everything keyed by ISO date strings (YYYY-MM-DD) in a fixed time zone.
// ---------------------------------------------------------------------------
const dtfCache = new Map();
function dtf(timeZone, opts) {
  const key = timeZone + JSON.stringify(opts);
  if (!dtfCache.has(key)) dtfCache.set(key, new Intl.DateTimeFormat('en-US', { timeZone, ...opts }));
  return dtfCache.get(key);
}

/** ISO date (YYYY-MM-DD) for an instant in a time zone. */
export function isoDateInTz(date, timeZone) {
  const parts = dtf(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since local midnight for an instant in a time zone. */
export function minutesInTz(date, timeZone) {
  const parts = dtf(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return (get('hour') % 24) * 60 + get('minute');
}

/** Offset of a time zone from UTC at a given instant, in minutes (e.g. -240 for EDT). */
export function tzOffsetMinutes(date, timeZone) {
  const parts = dtf(timeZone, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant of local midnight starting `iso` in a time zone. */
export function startOfDayInTz(iso, timeZone) {
  const guess = new Date(`${iso}T00:00:00Z`);
  const off = tzOffsetMinutes(guess, timeZone);
  const first = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMinutes(first, timeZone); // handles DST boundary days
  return off2 === off ? first : new Date(guess.getTime() - off2 * 60000);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Monday of the week containing iso. */
export function mondayOf(iso) {
  const wd = weekdayOf(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtDate(iso, { long = false, weekday = false } = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const w = weekday ? `${(long ? DAYS_LONG : DAYS)[weekdayOf(iso)]}, ` : '';
  return `${w}${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${d}`;
}

export function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export const dayShort = (iso) => DAYS[weekdayOf(iso)];

/** "14:30" / "14:30:00" → "2:30 PM" */
export function fmtClock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/** Minutes since midnight → "2:30 PM" */
export function fmtMinutes(min) {
  return fmtClock(`${Math.floor(min / 60) % 24}:${min % 60}`);
}

/** Instant → "2:30 PM" in time zone */
export function fmtInstant(date, timeZone) {
  return fmtMinutes(minutesInTz(date, timeZone));
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function timeAgo(date, now = new Date()) {
  const s = Math.round((now - date) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function greeting(minutes) {
  if (minutes < 5 * 60) return 'Good night';
  if (minutes < 12 * 60) return 'Good morning';
  if (minutes < 17 * 60) return 'Good afternoon';
  return 'Good evening';
}

/** Normalize a tag: trimmed, lowercased, no leading '#', max 32 chars. */
export function normTag(t) {
  return String(t || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase().slice(0, 32);
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // RFC4122 v4 fallback
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
