// GET /api/google/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD (end exclusive, dates in America/New_York)
import { verifyUser, json, unauthorized, cached } from '../_lib/supabase.js';
import { fetchEvents, GoogleAuthError } from '../_lib/google.js';
import { startOfDayInTz, isoDateInTz, addDays, daysBetween } from '../../lib.js';

const TZ = 'America/New_York';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const user = await verifyUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const start = url.searchParams.get('start') || isoDateInTz(new Date(), TZ);
  const end = url.searchParams.get('end') || addDays(start, 2);
  if (!ISO.test(start) || !ISO.test(end) || daysBetween(start, end) < 1 || daysBetween(start, end) > 62) {
    return json({ error: 'start/end must be YYYY-MM-DD, 1–62 days apart' }, 400);
  }
  try {
    const events = await cached(`g:${user.id}:cal:${start}:${end}`, 60_000, () => fetchEvents(
      user.id, startOfDayInTz(start, TZ).toISOString(), startOfDayInTz(end, TZ).toISOString(),
    ));
    return json({ connected: true, start, end, events });
  } catch (err) {
    if (err instanceof GoogleAuthError) return json({ connected: false, reconnect: true, error: err.message, events: [] });
    console.error('calendar failed', err);
    return json({ error: 'Calendar is unavailable right now.' }, 502);
  }
}
