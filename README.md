# Daybook

Personal life-dashboard PWA: tasks, notes, projects, files, Google Calendar + Gmail (read-only), and an AI morning briefing.

- **Frontend:** static `index.html` + `styles.css` + `app.js`. Vanilla JS, no build step. Supabase JS from jsDelivr.
- **Server:** Vercel functions in `/api` (Node, ESM). Google OAuth, Calendar, Gmail, and the briefing cron run only here.
- **Data:** Supabase Postgres (RLS), Auth, Storage, Realtime.

The browser only ever holds the Supabase URL and anon/publishable key. Google tokens, the service-role key and the Anthropic key live only in Vercel env vars.

---

## One-time setup (by hand)

Work through these in order. Total time is about 30 minutes. You need the Vercel URL before setting up Google, so step 1 is creating the Vercel project.

### 1. Reserve the Vercel URL

1. Push this repo to GitHub (private is fine).
2. In Vercel: **Add New → Project → Import** the repo.
   - Framework preset: **Other**. Leave Build Command and Output Directory **empty** (the repo root is served as-is; `/api/*.js` become functions).
3. Deploy once. It will load but can't sign in yet. Note the production URL, e.g. `https://daybook-xyz.vercel.app`. This is your **APP_URL**.

### 2. Supabase project and your single user

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a region near you (e.g. `us-east-1`) and save the DB password somewhere.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**. It's safe to re-run. It creates the tables, RLS policies, realtime publication and the private `files` bucket.
3. **Authentication → Users → Add user → Create new user**: your email and a strong password, with **Auto Confirm User** checked.
4. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". This matters because the anon key is public by design, and with sign-ups on, anyone could create an account. (RLS would still keep them out of your data.)
5. **Authentication → URL Configuration**:
   - Site URL: `APP_URL`
   - Redirect URLs: add `APP_URL/**` and `http://localhost:3000/**` (needed for the magic-link option).
6. **Project Settings → API Keys**: copy
   - Project URL → `SUPABASE_URL`
   - `anon` key (or the newer **publishable** key `sb_publishable_…`) → `SUPABASE_ANON_KEY`
   - `service_role` key (or the newer **secret** key `sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY`. **Never paste this into the frontend.**
7. Open `index.html`, find the `<script type="application/json" id="daybook-config">` block near the top, and paste in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Commit and push.

### 3. Google Cloud OAuth client (Calendar + Gmail, read-only)

1. <https://console.cloud.google.com> → create a project named "Daybook".
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **Google Auth Platform** (formerly "OAuth consent screen"):
   - **Branding:** app name "Daybook", your email as support and developer contact.
   - **Audience:** User type **External**. Add your Gmail address under **Test users**.
   - **Data Access → Add or remove scopes:** add
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/userinfo.email`
   - **Important: Audience → Publish app** (status "In production"). In **Testing** status, Google expires refresh tokens after **7 days** when restricted scopes like Gmail are requested, so the daily briefing would silently stop. Publishing without verification is fine for personal use. When you connect, Google will show "Google hasn't verified this app". Click **Advanced → Go to Daybook (unsafe)**. You don't need to submit for verification.
     - If your Google account is a Workspace account, you can choose user type **Internal** instead. Internal needs no publishing and shows no warning.
4. **Clients → Create client → Web application**:
   - Authorized redirect URIs:
     - `APP_URL/api/google/callback` (e.g. `https://daybook-xyz.vercel.app/api/google/callback`)
     - `http://localhost:3000/api/google/callback` (optional, for `vercel dev`)
   - Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client secret** → `GOOGLE_CLIENT_SECRET`.

### 4. Anthropic API key

<https://console.anthropic.com> → **API Keys → Create key** → `ANTHROPIC_API_KEY`. The briefing uses `claude-sonnet-5-5`, about one short call per day.

### 5. Vercel environment variables

Vercel → Project → **Settings → Environment Variables**. Add each of these for **Production** (and Preview if you use previews):

| Key | Value |
|---|---|
| `SUPABASE_URL` | from step 2.6 |
| `SUPABASE_ANON_KEY` | from step 2.6 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 2.6. Mark it **Sensitive** |
| `GOOGLE_CLIENT_ID` | from step 3.4 |
| `GOOGLE_CLIENT_SECRET` | from step 3.4. Sensitive |
| `GOOGLE_REDIRECT_URI` | `APP_URL/api/google/callback` |
| `ANTHROPIC_API_KEY` | from step 4. Sensitive |
| `CRON_SECRET` | output of `openssl rand -hex 32`. Sensitive |
| `OAUTH_STATE_SECRET` | another `openssl rand -hex 32`. Sensitive |
| `APP_URL` | e.g. `https://daybook-xyz.vercel.app` (no trailing slash) |

Then **Deployments → ⋯ → Redeploy** so the functions pick up the variables.

### 6. First run

1. Open `APP_URL` and sign in with the user from step 2.3.
2. **Profile → Connect Google** → approve. You'll land back on the app with Google connected.
3. Trigger the first briefing, either:
   - **Profile → Regenerate now**, or
   - from a terminal:
     ```sh
     curl -X POST "$APP_URL/api/cron/briefing" -H "Authorization: Bearer $CRON_SECRET"
     ```
   It returns JSON with `ok`, `source` (`claude` or `fallback`) and the headline. Home should show it right away.
4. Install it:
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Laptop (Chrome/Edge):** the install icon in the address bar, or ⋮ → **Install Daybook**.

---

## Morning briefing schedule

`vercel.json` schedules `/api/cron/briefing` at `30 10 * * *`. **Vercel cron runs in UTC only**, so the briefing lands at:

- **6:30 AM Eastern** during daylight time (mid-March to early November)
- **5:30 AM Eastern** in winter (EST)

On the **Hobby** plan, Vercel only guarantees the job fires sometime within that hour (10:00–10:59 UTC). On Pro it fires at the scheduled minute. Either way it lands before your morning. The function always computes "today" in `America/New_York`.

If the Claude call fails, the route still writes a plain briefing ("3 events, 4 tasks due" plus lists built from the data), so Home never comes up empty.

## Local development

```sh
npm install
cp .env.example .env.local   # fill it in
npx vercel dev               # http://localhost:3000, serves static + /api
```

For the Google redirect to work locally, set `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback` and `APP_URL=http://localhost:3000` in `.env.local`.

`npm test` runs the small Node unit tests (markdown escaping, day-shape classification, fallback briefing).

## Security notes

- Every string that comes from you, Google or the database goes through `esc()` before it touches the DOM. The markdown renderer escapes first and then applies a small whitelist (headings, bold, lists, `http(s)` links).
- Calendar and email text is wrapped in a JSON data block in the briefing prompt. The system prompt says outright that this text is data, never instructions.
- `google_tokens` has RLS enabled with no client policies and no grants to `anon`/`authenticated`. Only the service role can read it.
- No message bodies are fetched or stored. Gmail is read with `format=metadata` (From, Subject, Date) plus Google's snippet.
- Disconnect (Profile) revokes the Google token and deletes the row.

## Layout

```
index.html            app shell + config block
styles.css / app.js   split out of index.html per the spec's size rule
manifest.webmanifest, sw.js, icons/
api/_lib/             supabase.js (service client, verifyUser), google.js, briefing.js helpers
api/google/           auth, callback, calendar, gmail, status, disconnect
api/cron/briefing.js  scheduled + on-demand briefing
supabase/schema.sql
```
