# Ayal

Skills from people next door. Neighbours in one locality list what they're good at (tutoring, errands, home cooking, repairs…) and send each other requests. Phone numbers are never shared: a provider accepts a request, then both sides chat in the app.

This is the **lean MVP** for a single-locality pilot (Kaloor, Kochi).

| In this build | Left for later |
| --- | --- |
| Google sign-in, phone OTP before first request or listing | Push and SMS alerts |
| GPS-suggested locality with "Location verified" badge | "Also serves" nearby localities |
| Browse any locality, filter by category, 20 per page | Reviews |
| Up to 3 listings per person, pause/resume | Admin page (use the Supabase dashboard) |
| Request → accept/decline → live chat → mark done | Native apps |
| 48-hour expiry, open-request limits, report and block | Regional languages |
| Email alerts (optional), account deletion, installable PWA | |

**Stack:** Next.js 15 (App Router) · Tailwind CSS 4 · Supabase (Postgres + PostGIS, Auth, Realtime) · Resend for email · Vercel hosting.

---

## How it's put together

- **All rules live in the database.** Row-level security decides who can read what. Every request state change (send, accept, decline, cancel, done, expire) goes through a Postgres function in `supabase/migrations/…_schema.sql`, so nobody can fake a status from the browser.
- **Locality isolation.** You can browse anywhere, but a request only goes through if your home locality matches the listing's. The database checks this, not the app.
- **Location privacy.** GPS coordinates go to `locality_for_point` / `complete_onboarding` to decide the badge and are never stored.
- **Phone privacy.** Numbers stay in Supabase Auth. No table exposes them.

```
src/app/
  page.tsx                 home: GPS suggests a locality
  l/[slug]/                browse a locality
  listing/[id]/            listing + send request
  login/, auth/callback/   Google sign-in
  onboarding/              name, date of birth (18+), home locality
  verify-phone/            phone OTP
  me/listings/             my skills: create, edit, pause, delete
  requests/                inbox (received / sent), request page + live chat
  account/                 profile, email alerts, change locality, blocks, delete account
  actions.ts               server actions (call the database functions, send email alerts)
supabase/migrations/       schema, rules, functions, seed data
```

---

## Set up (about an hour, once)

### 1. Supabase project
1. Create a project at [supabase.com](https://supabase.com) (region: Mumbai).
2. **Database → Extensions:** enable `postgis` and `pg_cron`.
3. **SQL editor:** run `supabase/migrations/20261116000001_schema.sql`, then `20261116000002_seed.sql`. (Or use the Supabase CLI: `supabase link` then `supabase db push`.)

### 2. Google sign-in
1. In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth client (type: Web application).
2. Authorised redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. In Supabase **Authentication → Sign In / Providers → Google**, paste the client ID and secret and enable it.
4. **Authentication → URL Configuration:** set Site URL to your app URL and add `http://localhost:3000/**` and your production URL `/**` to Redirect URLs.

### 3. Phone OTP (test numbers for now)
1. **Authentication → Sign In / Providers → Phone:** enable it. Supabase needs an SMS provider selected; until your DLT registration is done you can pick Twilio with placeholder values.
2. In the same panel, add **test phone numbers with fixed OTPs**, e.g. `919876543210=123456`. These work without sending any SMS. Use them for yourself and pilot testers.
3. **Authentication → Rate Limits:** keep the SMS limit low (e.g. 30/hour) so nobody can run up a bill.
4. Later, for real SMS in India: register your sender ID and OTP template on a DLT portal (through your SMS provider, e.g. Twilio or MSG91), then put the real credentials in this panel.

### 4. Email alerts (optional)
1. Create a [Resend](https://resend.com) account, verify a sending domain, create an API key.
2. Put `RESEND_API_KEY` and `EMAIL_FROM` in your env. Without them, alerts are skipped silently and everything else works.

### 5. Run it
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```
GPS needs HTTPS or localhost. To test the "Location verified" badge on your phone, deploy first (step 6) or use a tunnel.

### 6. Deploy on Vercel
1. Import the GitHub repo in Vercel.
2. Add the variables from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to the Vercel URL).
3. Add the Vercel URL to Supabase Redirect URLs (step 2.4).

### 7. Make yourself admin
In the SQL editor: `insert into user_roles (user_id, role) values ('<your auth user id>', 'admin');`
Admins can read reports and all rows. To hide a listing: `update listings set is_hidden = true where id = '…';`
To review reports: `select * from reports where status = 'open' order by created_at desc;`

---

## Localities

`supabase/migrations/…_seed.sql` creates 10 Kochi localities. Only **Kaloor** is open; the rest show "coming soon".

Until you draw boundaries, a GPS point belongs to the nearest locality centre within `radius_m` (plus 300 m of slack, which is where the "near the border?" choice comes from). The centres are approximate. To make it accurate, draw each locality in [geojson.io](https://geojson.io) along main roads, rail lines and backwaters, then:

```sql
update localities
set boundary = st_multi(st_geomfromgeojson('<paste the geometry JSON>'))::geography
where slug = 'kaloor';
```

To open another locality: `update localities set is_active = true where slug = 'vyttila';`

---

## Before the pilot

- [ ] Draw the Kaloor boundary (above).
- [ ] Have a lawyer review `/terms` and `/privacy` (they're marked as drafts).
- [ ] Check your Supabase plan's Realtime connection limit and turn on daily backups (paid plan).
- [ ] Set cost alerts on Supabase, Vercel and your SMS provider.
- [ ] Recruit 30+ listings across 6+ categories before announcing.
