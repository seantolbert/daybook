// Server-only Supabase helpers. The service-role key never leaves Vercel.
import { createClient } from '@supabase/supabase-js';

let admin = null;

/** Service-role client (bypasses RLS). Only for google_tokens, briefings, and the cron's reads. */
export function adminClient() {
  if (!admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export function bearer(request) {
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Resolve the Supabase user from `Authorization: Bearer <access token>`, or null. */
export async function verifyUser(request) {
  const token = bearer(request);
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const unauthorized = () => json({ error: 'unauthorized' }, 401);

/** Tiny per-instance memo cache (best effort; instances are reused under Fluid compute). */
const memo = new Map();
export async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  memo.set(key, { value, expires: Date.now() + ttlMs });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return value;
}
export function bust(prefix) {
  for (const k of memo.keys()) if (k.startsWith(prefix)) memo.delete(k);
}
