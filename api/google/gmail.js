// GET /api/google/gmail → { threads: [{threadId, from, subject, snippet, date, url}] } (max 10, metadata only)
import { verifyUser, json, unauthorized, cached } from '../_lib/supabase.js';
import { fetchAttentionThreads, getTokenRow, GoogleAuthError } from '../_lib/google.js';

export async function GET(request) {
  const user = await verifyUser(request);
  if (!user) return unauthorized();
  try {
    const threads = await cached(`g:${user.id}:gmail`, 60_000, async () => {
      const row = await getTokenRow(user.id);
      if (!row?.refresh_token) throw new GoogleAuthError('Google is not connected.');
      return fetchAttentionThreads(user.id, row.account_email);
    });
    return json({ connected: true, threads });
  } catch (err) {
    if (err instanceof GoogleAuthError) return json({ connected: false, reconnect: true, error: err.message, threads: [] });
    console.error('gmail failed', err);
    return json({ error: 'Gmail is unavailable right now.' }, 502);
  }
}
