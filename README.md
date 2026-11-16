# Ayal

**Skills from people next door.** Neighbours in one locality list what they're good at (tutoring, errands, home cooking, repairs…) and send each other requests. Phone numbers are never shared: a provider accepts a request, then both sides chat inside the app.

This repo is the **lean MVP** for a single-locality pilot in **Kaloor, Kochi**.

- [1. What's in this build](#1-whats-in-this-build)
- [2. The stack, and why](#2-the-stack-and-why)
- [3. How a request travels through the system](#3-how-a-request-travels-through-the-system)
- [4. Folder map](#4-folder-map)
- [5. How each feature works](#5-how-each-feature-works)
- [6. The database](#6-the-database)
- [7. Security model](#7-security-model)
- [8. Set up](#8-set-up)
- [9. Day-to-day operations](#9-day-to-day-operations)
- [10. Testing the database rules](#10-testing-the-database-rules)
- [11. Extending it](#11-extending-it)
- [12. Troubleshooting](#12-troubleshooting)

---

## 1. What's in this build

| In this build | Left for later |
| --- | --- |
| Google sign-in, then phone OTP before the first request or listing | Push and SMS alerts |
| GPS-suggested locality with a "Location verified" badge | "Also serves" up to 2 nearby localities |
| Browse any locality, filter by category, 20 per page | Reviews and ratings |
| Up to 3 listings per person, edit, pause, delete | Admin screen (use the Supabase dashboard) |
| Request → accept/decline → live chat → mark done / call off | Native Android/iOS apps |
| 48-hour expiry, open-request limits, report and block | Malayalam / Tamil UI |
| Email alerts (optional), account deletion, installable PWA | Payments |

---

## 2. The stack, and why

```
 Phone browser ──► Next.js app on Vercel ──► Supabase
                    (pages + server actions)   ├─ Auth      Google sign-in, phone OTP, sessions
                          │                    ├─ Postgres  data + all rules (RLS + functions)
                          │                    │   └─ PostGIS   "which locality is this point in?"
                          │                    │   └─ pg_cron   expires stale requests
                          └──► Resend (email)  └─ Realtime  live chat
```

| Piece | What it does here | Why this choice |
| --- | --- | --- |
| **Next.js 15 (App Router)** | Renders every page on the server, runs *server actions* for form submissions, and ships small client components only where needed (GPS, OTP, chat). | One codebase for UI and server logic; no separate API to maintain. |
| **TypeScript** | Types across pages, actions and database rows. | Catches mistakes before runtime. |
| **Tailwind CSS 4** | Styling. Design tokens (colours, fonts) and small reusable classes (`btn-primary`, `card`, `input`, `chip`) live in `src/app/globals.css`. | Fast to change; no component library to fight. |
| **Supabase Auth** | Google OAuth sign-in, then links a phone number to the same account with an OTP. Sessions live in cookies managed by `@supabase/ssr`. | Auth and database in one service, and the database can read who is calling (`auth.uid()`). |
| **Postgres (Supabase)** | All data. All business rules, via row-level security (RLS) and `security definer` functions. | Rules can't be bypassed from the browser. Relational data (users ↔ listings ↔ requests ↔ messages) fits SQL. |
| **PostGIS** | Geography types and distance/containment queries for localities. | Accurate "is this GPS point in Kaloor?" checks in one query. |
| **pg_cron** | Runs `expire_requests()` every 15 minutes. | No external scheduler needed. |
| **Supabase Realtime** | Streams new `messages` rows and `requests` status changes to the open chat page. Respects RLS. | Live chat without running a websocket server. |
| **Resend** | Sends request alert emails. Optional. | Free tier is enough for a pilot; simple API. |
| **Vercel** | Hosts the Next.js app. | Zero-config deploys from GitHub; built-in DDoS protection and CDN. |

**Who talks to whom**

- The **browser** talks to Supabase directly only for: Google sign-in redirect, phone OTP, the GPS lookup (`locality_for_point`), and chat (read, send, live updates). All of these are protected by RLS.
- Everything else goes **browser → Next.js server action → Supabase**, using the signed-in user's session (so RLS still applies).
- The **secret key** (`SUPABASE_SECRET_KEY`) is used in exactly one place: `src/lib/email.ts`, to look up the recipient's email address for an alert. It never reaches the browser.

---

## 3. How a request travels through the system

Example: Anu (Kaloor) asks Arjun (Kaloor) for maths tuition.

1. **Anu taps "Send request"** on `/listing/[id]`. The form posts to the `createRequest` server action (`src/app/actions.ts`).
2. **The action calls `create_request(listing_id, message)`** in Postgres as Anu. The function checks, in order: signed in · has a profile · phone verified · listing exists, isn't paused or hidden · not her own listing · listing's locality = her home locality · neither has blocked the other · under her open-request limit (2 in week one, then 5) · no open request already on this listing. Any failure raises a plain-English error that the form shows.
3. **The row is inserted** with `status = 'pending'` and `expires_at = now() + 48h`, and a `request_new` row goes into `notifications` for Arjun.
4. **The action emails Arjun** (if email is configured and he hasn't turned alerts off), then redirects Anu to `/requests/[id]`.
5. **Arjun sees a badge** on "Requests" (unread notifications count in the header). On `/requests` he sees Anu's member-since date, completed-jobs count and location badge.
6. **Arjun taps Accept** → `respondRequest` → `respond_request(id, true)`. The function confirms he's the provider, it's still pending and not expired, sets `accepted`, notifies Anu; the action emails her.
7. **Chat opens** on `/requests/[id]` for both. Messages are inserted straight from the browser into `messages`; RLS only allows it while the request is `accepted` and nobody is blocked. Realtime pushes each new row to the other person.
8. **Either taps "Mark as done"** → `mark_request_done`. Status becomes `done`, the chat becomes read-only, and Anu's completed count goes up.

Other endings: Arjun declines (`declined`), Anu withdraws (`cancelled`), either calls off an accepted job (`cancelled`), or nobody answers for 48 hours and pg_cron marks it `expired`.

```
pending ──accept──► accepted ──done──► done
   │                   │
   ├─decline─► declined └─call off─► cancelled
   ├─withdraw► cancelled
   └─48h────► expired
```

---

## 4. Folder map

```
supabase/migrations/
  20261116000001_schema.sql   tables, indexes, RLS policies, functions, grants, cron, realtime
  20261116000002_seed.sql     10 Kochi localities (Kaloor open) + 12 categories

src/
  middleware.ts               refreshes the session cookie on every request; guards signed-in pages
  app/
    layout.tsx                header, footer, metadata
    page.tsx                  home: GPS suggests a locality to browse
    l/[slug]/page.tsx         browse a locality: category chips, 20 per page
    listing/[id]/             listing detail + RequestForm (shows why you can't request, if you can't)
    login/                    Google button
    auth/callback/route.ts    swaps Google's code for a session; sends new users to onboarding
    onboarding/               name, date of birth, home locality (GPS)
    verify-phone/             phone OTP form
    me/listings/              list, new, [id]/edit, pause/resume/delete
    requests/                 inbox (received / sent) + [id] page with Chat
    account/                  name, email alerts, change locality, phone status, blocks, sign out, delete
    safety/ terms/ privacy/   static pages (terms and privacy are drafts)
    actions.ts                ALL server actions
    manifest.ts               PWA manifest
    globals.css               design tokens + utility classes
  components/                 Header, Avatar, ListingCard, BrowsePicker, HomeLocalityField,
                              useGpsLocality, RequestActions, ReportForm, SubmitButton, …
  lib/
    supabase/server.ts        Supabase client acting as the signed-in user (server)
    supabase/client.ts        same, in the browser
    supabase/middleware.ts    session refresh + route guard
    supabase/admin.ts         secret-key client, used only for alert emails
    viewer.ts                 getViewer(): who's signed in, their profile, phone status
    queries.ts                shared selects (listing cards, localities, categories)
    requests.ts               shared request select + type
    email.ts                  sendRequestAlert()
    format.ts                 dates, initials, status labels
    env.ts                    env vars and constants
    types.ts                  row types
```

---

## 5. How each feature works

### Sign-in (Google)
`/login` → `GoogleButton` calls `supabase.auth.signInWithOAuth({ provider: 'google' })` → Google → Supabase → `/auth/callback?code=…`. The callback exchanges the code for a session cookie. If the user has no row in `profiles`, they go to `/onboarding`; otherwise back to where they came from (`next`, validated so it can't redirect off-site).

`src/middleware.ts` runs on every request: it refreshes the session cookie and redirects signed-out visitors away from `/me`, `/requests`, `/account`, `/onboarding` and `/verify-phone`.

### Onboarding (18+, home locality)
`OnboardingForm` posts name, date of birth, home locality and (if GPS matched) lat/lng to `completeOnboarding` → `complete_onboarding()` in Postgres. The function refuses under-18s and closed localities, creates `profiles` (public) and `profiles_private` (date of birth, alert setting), and sets `location_verified` by checking the point against the locality. Coordinates are discarded. The Google photo URL is saved as the profile photo.

### Phone verification (OTP)
Asked only before the first listing or request. `PhoneOtpForm` calls `supabase.auth.updateUser({ phone: '+91…' })`, which texts a code, then `verifyOtp({ type: 'phone_change' })`. Supabase sets `phone_confirmed_at`; the database function `has_verified_phone()` reads it. While DLT registration is pending, use Supabase **test phone numbers** with fixed codes (see setup).

### Locality and GPS
`useGpsLocality` asks the browser for a high-accuracy fix and calls `locality_for_point(lat, lng)`, which returns up to two candidates, nearest first. Two results means you're near a border, so both are offered.

- **Home page** (`BrowsePicker`): picks the locality to *browse*, saved in a cookie. No account needed.
- **Onboarding/Account** (`HomeLocalityField`): picks the *home* locality. Lat/lng are sent only if they match the choice and the fix is precise (accuracy ≤ 1 km; laptops usually aren't), so the server can set the badge.
- Matching uses the locality's drawn `boundary` if present, otherwise the nearest `center` within `radius_m`, plus 300 m of slack.
- `change_home_locality()` allows one change per 30 days, pauses the user's listings and closes their open requests.

### Browsing
`/l/[slug]` queries `listings` for that locality (not paused, not hidden), newest first, 20 per page, optionally filtered by category. Anyone can browse; RLS hides listings between people who have blocked each other. Closed localities show "coming soon".

### Listings
`/me/listings/new` requires a verified phone. `saveListing` inserts or updates; a database trigger forces `locality_id` to the owner's home locality, enforces the 3-listing cap and the phone check. Owners can change only title, description, price, availability, category and paused flag; `is_hidden` is admin-only.

### Requests
Covered step by step in [section 3](#3-how-a-request-travels-through-the-system). Buttons live in `RequestActions`; each calls a server action, which calls one Postgres function. `/requests` marks notifications read when opened.

### Chat
`Chat.tsx` loads existing messages server-side, then subscribes to Realtime for new `messages` rows and `requests` updates on that request. Sending inserts directly into `messages`; RLS checks the request is accepted, you're one of the two people, and nobody has blocked the other. `sender_id` defaults to the caller and can't be set by the client.

### Report and block
`ReportForm` inserts into `reports` (reporter is always the caller). Block inserts into `blocks`; afterwards neither person sees the other's listings and no messages can be sent between them. Unblock from `/account`.

### Email alerts
`sendRequestAlert()` runs inside server actions after: new request, accepted, declined, cancelled. It skips silently if `RESEND_API_KEY`/`EMAIL_FROM` aren't set or the user turned alerts off, and never throws, so a failed email never breaks the action.

### Account deletion
`delete_my_account()` deletes the `auth.users` row; foreign keys cascade to profiles, listings, requests, messages, notifications, reports and blocks.

---

## 6. The database

| Table | Holds | Who can read | Who can write |
| --- | --- | --- | --- |
| `localities` | The 10 named localities: centre, radius, optional boundary, open/closed | Everyone | Admin (SQL) |
| `categories` | The 12 categories | Everyone | Admin (SQL) |
| `profiles` | Public profile: name, photo, home locality, verified badge, joined date | Everyone | Owner (name, photo only); functions |
| `profiles_private` | Date of birth, email-alert setting | Owner, admins | Owner (alert setting only); functions |
| `user_roles` | Admin flag | Nobody via the API | You, in the dashboard |
| `listings` | Skills on offer | Everyone (active ones); owner (all of theirs) | Owner (limited columns); trigger sets locality |
| `requests` | Who asked whom, message, status, timestamps | The two people, admins | Functions only |
| `messages` | Chat lines | The two people, admins | The two people, only while accepted |
| `notifications` | In-app alerts (unread badge) | Owner | Functions; owner marks read |
| `reports` | Safety reports | Reporter, admins | Any signed-in user |
| `blocks` | Who blocked whom | The blocker | The blocker |

**Functions (the only way to change requests and localities):** `complete_onboarding`, `reverify_location`, `change_home_locality`, `create_request`, `respond_request`, `cancel_request`, `mark_request_done`, `expire_requests` (cron only), `delete_my_account`. Helpers: `locality_for_point`, `point_in_locality`, `has_verified_phone`, `is_admin`, `is_blocked_between`, `seeker_completed_count`, `notify` (internal).

**Indexes:** browse (`locality_id, category_id, created_at` for active listings), owner listings, requests by seeker and by provider, messages by request, notifications by user, spatial indexes on locality centre and boundary. A partial unique index allows only one open request per seeker per listing.

---

## 7. Security model

- **Default deny.** The migration revokes all table and function access from `anon` and `authenticated`, then grants back exactly what's needed, including column-level grants (e.g. owners may update a listing's title but not `is_hidden` or `locality_id`). It re-revokes functions after creating them, because Supabase grants new functions to everyone by default.
- **No direct state changes.** Request status can only change through functions that check who's calling.
- **Privacy by design.** Phone numbers stay in Supabase Auth and appear in no table. GPS coordinates are never stored. Date of birth sits in `profiles_private`, readable only by its owner.
- **Abuse limits.** One phone per account, open-request caps, 30-day locality cooldown, 3-listing cap, length limits on every text field.
- **Safe redirects.** Every `next=` parameter is checked to be an internal path.
- **Secrets.** Only `NEXT_PUBLIC_*` variables reach the browser. The secret key is server-only (`import "server-only"`).

What's **not** covered yet: captcha on sign-in (Google OAuth makes bot sign-ups costly, and phone OTP needs a signed-in user; turn on Supabase's auth rate limits), and image uploads (photos come from Google, so there's no EXIF/location risk yet).

---

## 8. Set up

About an hour, once.

### 8.1 Supabase project
1. Create a project at [supabase.com](https://supabase.com), region Mumbai.
2. **Database → Extensions:** enable `postgis` and `pg_cron`.
3. **SQL editor:** run `supabase/migrations/20261116000001_schema.sql`, then `20261116000002_seed.sql`. (Or with the CLI: `supabase link` then `supabase db push`.)

### 8.2 Google sign-in
1. [Google Cloud Console](https://console.cloud.google.com/) → create an OAuth client, type *Web application*.
2. Authorised redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Supabase **Authentication → Sign In / Providers → Google:** paste the client ID and secret, enable.
4. **Authentication → URL Configuration:** Site URL = your app URL; Redirect URLs: `http://localhost:3000/**` and your production URL `/**`.

### 8.3 Phone OTP (test numbers first)
1. **Authentication → Sign In / Providers → Phone:** enable. Supabase asks for an SMS provider; until DLT is done, you can select Twilio with placeholder values.
2. Same panel: add **test phone numbers with fixed OTPs**, e.g. `919876543210=123456`. No SMS is sent for these.
3. **Authentication → Rate Limits:** keep SMS low (e.g. 30/hour) so nobody can run up a bill.
4. For real SMS in India: register your sender ID and OTP template on a DLT portal through your SMS provider (Twilio, MSG91…), then put real credentials in the Phone panel.

### 8.4 Email alerts (optional)
Create a [Resend](https://resend.com) account, verify a sending domain, create an API key, then set `RESEND_API_KEY` and `EMAIL_FROM`. Without them, alerts are skipped and everything else works.

### 8.5 Run locally
```bash
cp .env.example .env.local   # fill in values from Supabase → Project Settings → API
npm install
npm run dev                  # http://localhost:3000
```
GPS needs HTTPS or `localhost`. To test the badge on a phone, deploy first or use a tunnel.

| Variable | Where it comes from | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API | browser + server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API ("publishable", or "anon" on older projects) | browser + server |
| `SUPABASE_SECRET_KEY` | Supabase → API ("secret", or "service_role") | server only, email lookups |
| `NEXT_PUBLIC_SITE_URL` | your app URL | links in emails |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | email alerts |

### 8.6 Deploy on Vercel
Import the GitHub repo in Vercel, add the variables above (set `NEXT_PUBLIC_SITE_URL` to the Vercel URL), deploy, then add that URL to Supabase Redirect URLs (8.2 step 4).

---

## 9. Day-to-day operations

All in the Supabase **SQL editor**.

```sql
-- Make yourself admin (find your id in Authentication → Users)
insert into user_roles (user_id, role) values ('<your-user-id>', 'admin');

-- Open reports
select * from reports where status = 'open' order by created_at desc;
update reports set status = 'actioned' where id = 12;

-- Hide a listing
update listings set is_hidden = true where id = '<listing-id>';

-- Remove a person entirely (cascades to everything they own)
delete from auth.users where id = '<user-id>';

-- Open another locality
update localities set is_active = true where slug = 'vyttila';

-- Draw a real boundary (geometry JSON from geojson.io)
update localities
set boundary = st_multi(st_geomfromgeojson('<geometry JSON>'))::geography
where slug = 'kaloor';

-- Pilot health
select status, count(*) from requests group by status;
select count(*) from listings where not is_paused and not is_hidden;
```

---

## 10. Testing the database rules

The rules were tested against a local Postgres 16 + PostGIS that mimics Supabase (roles `anon`/`authenticated`, `auth.users`, `auth.uid()`, default grants). Checks that pass:

- under-18 and closed-locality onboarding are refused
- listing without a verified phone, for someone else, or setting `is_hidden`/`locality_id` is refused
- inserting or updating `requests` directly is refused; only the provider can accept
- duplicate open requests are refused; requests outside your home locality are refused
- messages before acceptance, or with a spoofed `sender_id`, are refused
- outsiders see no requests, messages, other people's private profiles, or roles
- blocking hides listings both ways
- 30-day locality cooldown works; changing locality pauses listings
- `expire_requests()` expires stale requests; account deletion cascades
- internal functions (`notify`, `expire_requests`, the trigger) can't be called from the API

To re-run something similar, use the Supabase CLI's local stack (`supabase start`) and run SQL as a user with `set role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', false);`.

---

## 11. Extending it

- **Service areas** (serve up to 2 localities within ~5 km): add `listing_service_areas(listing_id, locality_id)`, a distance check on insert, and change the locality check in `create_request` and the browse query.
- **Reviews:** a `reviews` table keyed by `request_id` (unique), insert allowed only for the seeker of a `done` request.
- **Push notifications:** store a web-push subscription in `profiles_private`; send from the same places as email.
- **Admin screen:** pages under `/admin` gated by `is_admin()`, reading `reports`.
- **Languages:** move UI strings into a dictionary (e.g. `next-intl`) and add Malayalam and Tamil.

---

## 12. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Google sign-in returns to `/login?error=1` | Redirect URL missing in Supabase URL Configuration, or wrong Google redirect URI |
| "Send code" fails | Phone provider not enabled, number not in test list, or SMS rate limit hit |
| Everyone shows "Self-selected" | Testing on a laptop (imprecise location) or over plain HTTP |
| Chat doesn't update live | Realtime publication missing: re-run the last block of the schema migration |
| Requests never expire | `pg_cron` not enabled before running the migration: enable it, then run `select cron.schedule('ayal-expire-requests', '*/15 * * * *', 'select public.expire_requests()');` |
| Project went offline | Supabase free projects pause after a week of no activity; upgrade before the pilot |
| No alert emails | `RESEND_API_KEY`/`EMAIL_FROM` not set, domain not verified, or the user turned alerts off |
