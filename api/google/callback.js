// GET /api/google/callback?code&state — Google redirects here after consent.
import { adminClient, bust } from '../_lib/supabase.js';
import { verifyState, exchangeCode, fetchAccountEmail, getTokenRow, SCOPES } from '../_lib/google.js';

export async function GET(request) {
  const url = new URL(request.url);
  const appUrl = (process.env.APP_URL || url.origin).replace(/\/+$/, '');
  const back = (params) => Response.redirect(`${appUrl}/?${new URLSearchParams(params)}#profile`, 302);
  if (url.searchParams.get('error')) return back({ google: 'error', reason: url.searchParams.get('error') });

  const userId = verifyState(url.searchParams.get('state'));
  if (!userId) return back({ google: 'error', reason: 'expired or invalid sign-in state, try again' });
  const code = url.searchParams.get('code');
  if (!code) return back({ google: 'error', reason: 'missing code' });

  try {
    const t = await exchangeCode(code);
    const scopes = (t.scope || '').split(' ').filter(Boolean);
    const email = await fetchAccountEmail(t.access_token);
    const existing = await getTokenRow(userId);
    const refresh = t.refresh_token || existing?.refresh_token;
    if (!refresh) return back({ google: 'error', reason: 'Google did not return a refresh token; remove Daybook at myaccount.google.com/permissions and retry' });

    const { error } = await adminClient().from('google_tokens').upsert({
      user_id: userId,
      account_email: email,
      refresh_token: refresh,
      access_token: t.access_token,
      expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
      scopes,
    });
    if (error) throw error;
    bust(`g:${userId}`);

    const missing = SCOPES.filter((s) => !scopes.includes(s) && !s.endsWith('userinfo.email'));
    if (missing.length) {
      return back({ google: 'error', reason: `connected, but ${missing.map((s) => s.split('/').pop().split('.')[0]).join(' and ')} access was not granted` });
    }
    return back({ google: 'connected' });
  } catch (err) {
    console.error('google callback failed', err);
    return back({ google: 'error', reason: 'token exchange failed' });
  }
}
