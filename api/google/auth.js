// GET /api/google/auth → { url } for the Google consent screen. Requires the caller's Supabase JWT.
import { verifyUser, json, unauthorized } from '../_lib/supabase.js';
import { signState, consentUrl } from '../_lib/google.js';

export async function GET(request) {
  const user = await verifyUser(request);
  if (!user) return unauthorized();
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
    return json({ error: 'Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI).' }, 500);
  }
  return json({ url: consentUrl(signState(user.id)) });
}
