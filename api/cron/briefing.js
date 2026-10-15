// Morning briefing generator.
//   GET  /api/cron/briefing  — Vercel cron (Authorization: Bearer $CRON_SECRET)
//   POST /api/cron/briefing  — "Regenerate now" from the page (Supabase JWT) or manual curl with the cron secret
// Gathers today's data in America/New_York, asks Claude for {headline, body_md}, and upserts `briefings`.
// If the Claude call fails for any reason, a computed fallback row is written instead.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient, verifyUser, bearer, json, unauthorized } from '../_lib/supabase.js';
import { fetchEvents, fetchAttentionThreads, getTokenRow } from '../_lib/google.js';
import {
  TZ, classifyDayShape, statsFrom, buildUserMessage, buildFallback, cleanOutput, dayWindow,
  SYSTEM_PROMPT, OUTPUT_SCHEMA,
} from '../_lib/briefing.js';
import { isoDateInTz } from '../../lib.js';

const MODEL = 'claude-sonnet-5-5';

function isCronSecret(request) {
  const secret = process.env.CRON_SECRET;
  const given = bearer(request);
  if (!secret || !given) return false;
  const a = Buffer.from(given); const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The app has exactly one user: first google_tokens row, else the first auth user. */
async function resolveSingleUserId() {
  const db = adminClient();
  const { data: tok } = await db.from('google_tokens').select('user_id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (tok?.user_id) return tok.user_id;
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw error;
  return data?.users?.[0]?.id || null;
}

async function gather(userId) {
  const db = adminClient();
  const w = dayWindow();

  const [tasksRes, doneRes, notesRes, projRes, tokenRow] = await Promise.all([
    db.from('tasks').select('id,title,status,priority,due_date,due_time,project_id').eq('user_id', userId).neq('status', 'done').lte('due_date', w.date),
    db.from('tasks').select('id,title,project_id,completed_at').eq('user_id', userId).eq('status', 'done')
      .gte('completed_at', w.startYesterday.toISOString()).lt('completed_at', w.startToday.toISOString()),
    db.from('notes').select('title,body').eq('user_id', userId).eq('pinned', true).order('updated_at', { ascending: false }).limit(5),
    db.from('projects').select('id,name,business').eq('user_id', userId).eq('status', 'active').order('sort_order'),
    getTokenRow(userId).catch(() => null),
  ]);
  for (const r of [tasksRes, doneRes, notesRes, projRes]) if (r.error) throw r.error;

  const projName = new Map((projRes.data || []).map((p) => [p.id, p.name]));
  const withProject = (t) => ({ ...t, project: projName.get(t.project_id) || null });
  const open = (tasksRes.data || []).map(withProject);

  let events = []; let threads = []; const googleErrors = [];
  if (tokenRow?.refresh_token) {
    const [ev, th] = await Promise.allSettled([
      fetchEvents(userId, w.startToday.toISOString(), w.endTomorrow.toISOString()),
      fetchAttentionThreads(userId, tokenRow.account_email),
    ]);
    if (ev.status === 'fulfilled') events = ev.value; else googleErrors.push(`calendar: ${ev.reason?.message}`);
    if (th.status === 'fulfilled') threads = th.value; else googleErrors.push(`gmail: ${th.reason?.message}`);
  }
  const dayOf = (e) => (e.allDay ? e.start : isoDateInTz(new Date(e.start), TZ));
  const overlaps = (e, iso) => (e.allDay ? e.start <= iso && (e.end || e.start) > iso : dayOf(e) === iso);
  const eventsToday = events.filter((e) => overlaps(e, w.date));
  const eventsTomorrow = events.filter((e) => overlaps(e, w.tomorrow));

  return {
    date: w.date,
    eventsToday,
    eventsTomorrow,
    dayShape: classifyDayShape(eventsToday, w.date),
    threads,
    tasksOverdue: open.filter((t) => t.due_date < w.date),
    tasksDueToday: open.filter((t) => t.due_date === w.date),
    tasksDoneYesterday: (doneRes.data || []).map(withProject),
    notesPinned: (notesRes.data || []).map((n) => ({ title: n.title || '', excerpt: String(n.body || '').slice(0, 200) })),
    projectsActive: projRes.data || [],
    googleErrors,
  };
}

async function askClaude(data) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(data) }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
  });
  if (response.stop_reason === 'refusal') throw new Error(`model declined (${response.stop_details?.category || 'no category'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('model output was truncated');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = cleanOutput(JSON.parse(text));
  if (!out) throw new Error('model output did not match the expected shape');
  return out;
}

async function generate(userId) {
  const data = await gather(userId);
  let result; let source = 'claude'; let error = null;
  try {
    result = await askClaude(data);
  } catch (err) {
    console.error('briefing: Claude call failed, writing fallback', err?.message || err);
    result = buildFallback(data);
    source = 'fallback';
    error = String(err?.message || err).slice(0, 300);
  }
  const row = {
    user_id: userId,
    briefing_date: data.date,
    headline: result.headline,
    body_md: result.body_md,
    day_shape: data.dayShape,
    stats: { ...statsFrom(data), source },
    generated_at: new Date().toISOString(),
  };
  const { data: saved, error: dbErr } = await adminClient()
    .from('briefings').upsert(row, { onConflict: 'user_id,briefing_date' }).select().single();
  if (dbErr) throw dbErr;
  return { ok: true, source, error, google_errors: data.googleErrors, briefing: saved };
}

async function handle(request) {
  let userId = null;
  if (isCronSecret(request)) {
    userId = await resolveSingleUserId();
    if (!userId) return json({ error: 'no user found — create your account in Supabase first' }, 400);
  } else {
    const user = await verifyUser(request);
    if (!user) return unauthorized();
    userId = user.id;
  }
  try {
    return json(await generate(userId));
  } catch (err) {
    console.error('briefing failed', err);
    return json({ ok: false, error: 'briefing generation failed' }, 500);
  }
}

export const GET = handle;
export const POST = handle;
