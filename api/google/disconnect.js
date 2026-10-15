// POST /api/google/disconnect → revoke the Google grant and delete the stored tokens.
import { verifyUser, json, unauthorized, adminClient, bust } from '../_lib/supabase.js';
import { getTokenRow, revokeToken } from '../_lib/google.js';

export async function POST(request) {
  const user = await verifyUser(request);
  if (!user) return unauthorized();
  const row = await getTokenRow(user.id);
  if (row) await revokeToken(row.refresh_token || row.access_token);
  const { error } = await adminClient().from('google_tokens').delete().eq('user_id', user.id);
  if (error) return json({ error: error.message }, 500);
  bust(`g:${user.id}`);
  return json({ ok: true });
}
