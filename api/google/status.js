// GET /api/google/status → { connected, email, scopes }
import { verifyUser, json, unauthorized, cached } from '../_lib/supabase.js';
import { getTokenRow } from '../_lib/google.js';

export async function GET(request) {
  const user = await verifyUser(request);
  if (!user) return unauthorized();
  const status = await cached(`g:${user.id}:status`, 60_000, async () => {
    const row = await getTokenRow(user.id);
    return row?.refresh_token
      ? { connected: true, email: row.account_email, scopes: row.scopes || [] }
      : { connected: false, email: null, scopes: [] };
  });
  return json(status);
}
