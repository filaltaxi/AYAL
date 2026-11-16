# Ayal

**Skills from people next door.** Neighbours in one locality list what they're good at (tutoring, errands, home cooking, repairs…) and send each other requests. Phone numbers are never shared: a provider accepts a request, then both sides chat inside the app.

This is **v1, the full MVP** for a pilot in **Kaloor, Kochi**. The earlier lean build is tagged [`lean-mvp`](../../tree/lean-mvp).

- [1. What's in this build](#1-whats-in-this-build)
- [2. The stack, and why](#2-the-stack-and-why)
- [3. How a request travels through the system](#3-how-a-request-travels-through-the-system)
- [4. Folder map](#4-folder-map)
- [5. How each feature works](#5-how-each-feature-works)
- [6. The database](#6-the-database)
- [7. Security and privacy model](#7-security-and-privacy-model)
- [8. Set up](#8-set-up)
- [9. Running the pilot (admin)](#9-running-the-pilot-admin)
- [10. Tests and CI](#10-tests-and-ci)
- [11. What's still left](#11-whats-still-left)
- [12. Troubleshooting](#12-troubleshooting)

---

## 1. What's in this build

| Area | What people get |
| --- | --- |
| Sign-in | Google sign-in, then phone OTP before the first request or listing. 18+ only |
| Locality | GPS suggests the locality; "Location verified" badge when it matches; change once every 30 days |
| Browse | Any locality, category chips, **text search**, 20 per page, local providers first |
| Listings | Up to 3 per person; pause, edit, delete; **also serve up to 2 open localities within 5 km**; **weekly view counts** |
| Requests | Request → accept/decline → live chat → mark done / call off; 48-hour expiry; open-request limits |
| Trust | **Reviews and star ratings**, **neighbour vouches**, **provider profile pages**, seeker track record, report and block |
| Alerts | **Phone push notifications** (incl. new chat messages) and email, sent after the page responds |
| Admin | **Dashboard**: pilot stats, reports queue, hide listings, suspend people, open/close localities, waitlist counts |
| Coming soon | Closed localities collect a **waitlist** ("23 neighbours are waiting for Vyttila") |
| Account | Edit name, alerts, change locality, unblock, delete account (the other side keeps its history) |
| Quality | ~100 database rule tests, GitHub Actions CI, error and loading screens, installable PWA with app icons |

### What changed from the lean MVP (review fixes)
1. **Stale requests can't lock people out.** Requests past 48 hours expire on their own the next time anyone involved acts, even if the scheduler isn't running.
2. **Deleting keeps the other side's history.** Deleting a listing or an account cancels open requests and tells the other person; their requests and chat stay, showing "Former member".
3. **Profiles aren't public by default.** A profile is visible only while the person has a live listing, or to people who share a request with them.
4. **No raw database errors on screen.** Only messages Ayal raises on purpose are shown.
5. **Alerts never slow an action.** Email and push go out after the response (`after()`).
6. **Chat messages alert the other person** (one alert until they read it).
7. Smaller: one batched query for track records, GPS check on Account only when tapped, error/loading screens.

---

## 2. The stack, and why

```
 Phone browser ──► Next.js app on Vercel ──► Supabase
   (PWA + push)     pages, server actions      ├─ Auth      Google sign-in, phone OTP, sessions
                    after(): push + email      ├─ Postgres  data + every rule (RLS + functions)
                          │                    │   ├─ PostGIS  "which locality is this point in?", 5 km checks
                          │                    │   └─ pg_cron  expires stale requests (optional now)
                          │                    └─ Realtime  live chat
                          ├──► Web push (browser push services, VAPID keys)
                          └──► Resend (email)
```

| Piece | What it does here | Why this choice |
| --- | --- | --- |
| **Next.js 15 (App Router)** | Server-renders pages, runs server actions for every change, client components only where needed (GPS, OTP, chat, push). | One codebase for UI and server logic. |
| **TypeScript + Tailwind 4** | Types everywhere; design tokens and small utility classes in `globals.css`. | Fast to change, no component library. |
| **Supabase Auth** | Google OAuth, then links a phone via OTP. Sessions in cookies (`@supabase/ssr`). | Auth and DB in one place; the DB knows who is calling (`auth.uid()`). |
| **Postgres + RLS** | All data, all rules. Row-level security for reads; `security definer` functions for every state change. | Rules can't be bypassed from the browser. |
| **PostGIS** | Locality matching from GPS, distances between localities. | Correct geography in one query. |
| **Supabase Realtime** | Streams new messages and request status to an open chat. Respects RLS. | Live chat without a socket server. |
| **web-push (VAPID)** | Sends phone notifications to subscribed browsers; `public/sw.js` shows them. | Free, no app store, works on Android and on iPhone once added to the Home Screen. |
| **Resend** | Request emails. Optional. | Free tier fits a pilot. |
| **Vercel** | Hosts the app. | Zero-config deploys; built-in DDoS protection and CDN. |

**Who talks to whom**
- The **browser** talks to Supabase directly only for: Google sign-in, phone OTP, the GPS lookup, reading chat + live updates, and saving/removing its push subscription. All protected by RLS.
- Everything else is **browser → server action → Supabase**, using the signed-in user's session, so RLS still applies.
- The **secret key** is used only in `src/lib/notify.ts`, after the response, to find who to alert (email address, push devices). It never reaches the browser.

---

## 3. How a request travels through the system

Example: Vinu (Vyttila) asks Ravi (Kaloor, also serves Vyttila) for maths tuition.

1. **Vinu taps "Send request"** → `createRequest` server action → `create_request()` in Postgres.
2. **The function checks, in order:** signed in · profile · verified phone · not suspended · message 5–500 chars · *expires Vinu's own stale requests* · listing exists, live, owner not suspended · not his own · **listing's locality is Vinu's home, or one of its service areas** · nobody blocked anybody · under the open-request cap (2 in week one, then 5) · no open request already on this listing.
3. **The request is stored** with a snapshot of the listing title and `expires_at = now() + 48h`; a `request_new` notification is written for Ravi.
4. **After the response,** `alertUser()` sends Ravi a push and an email.
5. **Ravi opens Requests:** stale requests are expired, he sees Vinu's member-since date, jobs done and location badge.
6. **Ravi accepts** → `respond_request()` → Vinu is alerted. Chat opens.
7. **Messages** go through `send_message()`: it checks the request is accepted and nobody is blocked, stores the message, and raises **one** `message_new` alert until the other person reads it. Realtime shows it live; seeing it live clears the alert.
8. **Either marks it done** → `mark_request_done()`. Vinu can now **review** Ravi (once, within 30 days).

```
pending ──accept──► accepted ──done──► done ──► review (seeker, once)
   │                   │
   ├─decline─► declined └─call off─► cancelled
   ├─withdraw► cancelled
   └─48h────► expired          (also: listing deleted / account deleted / suspended → closed, other side told)
```

---

## 4. Folder map

```
supabase/
  migrations/
    20261116000001_schema.sql   lean-MVP tables, RLS, request functions
    20261116000002_seed.sql     10 Kochi localities (Kaloor open) + 12 categories
    20261116000003_v1.sql       review fixes + v1 features + the complete grant list
  tests/
    00_supabase_shim.sql        enough of Supabase to run on plain Postgres (roles, auth.uid())
    01_helpers.sql              assertion helpers
    10_rules_test.sql           ~100 checks that try to break the rules
scripts/test-db.sh              runs migrations + tests on a throwaway database
.github/workflows/ci.yml        type-check, lint, build, database tests

public/sw.js                    service worker: shows push notifications, opens the right page
src/
  middleware.ts                 refreshes the session; guards signed-in pages
  app/
    page.tsx                    home: GPS suggests a locality
    l/[slug]/                   browse + search a locality; waitlist if closed
    listing/[id]/               listing detail + send request (counts a view)
    u/[id]/                     provider profile: stats, listings, reviews, vouch
    me/listings/                my skills: create, edit, service areas, pause, delete, views
    requests/                   inbox (received / sent) + [id]: chat, review, report, block
    account/                    profile, push toggle, email alerts, locality, phone, blocks, delete
    admin/                      pilot dashboard (admins only)
    login/ auth/callback/ onboarding/ verify-phone/
    safety/ terms/ privacy/     static pages (terms and privacy are drafts)
    actions.ts                  ALL server actions
    error.tsx loading.tsx       error and loading screens
  components/                   Header, ListingCard, Trust (stars, vouches), PushToggle, WaitlistButton,
                                BrowsePicker, HomeLocalityField, useGpsLocality, RequestActions, ReportForm…
  lib/
    notify.ts                   alertUser(): push + email after the response
    queries.ts                  browse, track records, reviews, nearby localities
    requests.ts                 request select + types
    viewer.ts                   who's signed in (+ isAdmin); friendlyError()
    supabase/                   server, browser, middleware and secret-key clients
```

---

## 5. How each feature works

**Sign-in and onboarding.** Google → `/auth/callback` exchanges the code for a session → new people go to `/onboarding` (name, date of birth, home locality with GPS) → `/verify-phone` links a phone with an OTP (`updateUser({ phone })` + `verifyOtp({ type: 'phone_change' })`). The phone is asked only before the first listing or request.

**Locality and GPS.** `locality_for_point()` returns up to two candidates (two = near a border, so both are offered). Matching uses a drawn `boundary` if present, else the nearest centre within `radius_m` + 300 m. Coordinates are sent only if they match the choice and the fix is precise (≤ 1 km), and they're discarded after the check.

**Browse and search.** `browse_listings(locality, category, query, limit, offset)` runs *as the caller*, so blocks, suspension and paused listings are filtered by RLS. It returns the locality's own listings first, then nearby providers who serve it, each with owner, category and track record. Search is a case-insensitive match on title and description, with `%` and `_` escaped.

**Service areas.** On the listing form a provider can tick up to 2 *open* localities within 5 km of home (`nearby_localities()`, PostGIS distance between centres). `set_listing_service_areas()` enforces the rules. Requests from those localities are allowed; cards there say "Lives in Kaloor · serves Vyttila". Changing home locality clears them.

**Reviews.** After a job is marked done, the seeker can rate 1–5 stars with an optional comment, once, within 30 days (`leave_review()`). Reviews show on the provider's profile with the reviewer's name (`provider_reviews()`); averages come from `people_stats()`.

**Vouches.** On a provider's profile, a neighbour in the **same** locality with a verified phone and at least a week on Ayal can vouch (or take it back) via `toggle_vouch()`. Only the count is public.

**Profiles.** `/u/[id]` shows name, badge, home locality, rating, jobs done, vouches, live listings and reviews. Visible only if the person has a live listing or you share a request with them.

**Listing views.** The listing page calls `record_listing_view()` (owner's own views don't count). "My skills" shows views in the last 7 days. No viewer identity is stored.

**Waitlist.** A closed locality's page shows how many neighbours are waiting and lets signed-in people join (`locality_interest`). Admins see counts per locality.

**Alerts.** Every action that should notify someone calls `alertUser(userId, kind)`. It runs after the response: push to every device the person turned on (expired devices are removed automatically), plus email for request events if configured and not switched off. Push text never contains names or message text, since it shows on lock screens. The in-app badge comes from the `notifications` table.

**Push setup on a device.** Account → "Turn on notifications": registers `/sw.js`, asks permission, subscribes with the VAPID public key and saves it via `save_push_subscription()`. On iPhone this only works after "Add to Home Screen".

**Report, block, suspend.** Reports go to the admin queue with context. Blocking hides both people from each other and closes chat. Suspension (admin) hides the person's listings and profile, closes their open requests and stops them messaging, listing, requesting, reviewing or vouching.

**Account deletion.** `delete_my_account()` deletes the auth user. A trigger first closes their open requests and tells the other side; their profile, listings, messages, devices and reviews they received go; requests stay with the other person (as "Former member"), and reviews they wrote stay without their name.

---

## 6. The database

| Table | Holds | Read by | Written by |
| --- | --- | --- | --- |
| `localities` | Named localities: centre, radius, optional boundary, open/closed | Everyone | Admin functions |
| `categories` | 12 categories | Everyone | You (SQL) |
| `profiles` | Name, photo, home locality, badge, joined date | Self; anyone if they have a live listing; people sharing a request; admins | Owner (name, photo); functions |
| `profiles_private` | Date of birth, email-alert setting, suspension | Owner, admins | Owner (alert setting); functions |
| `user_roles` | Admin flag | Nobody via the API | You, in the dashboard |
| `listings` | Skills on offer | Everyone (live, owner not suspended, not blocked); owner; admins | Owner (limited columns); trigger sets locality |
| `listing_service_areas` | Extra localities a listing serves | Whoever can see the listing | `set_listing_service_areas()` |
| `requests` | Parties, message, status, listing title snapshot, timestamps | The two people, admins | Functions only |
| `messages` | Chat | The two people, admins | `send_message()` only |
| `notifications` | In-app alerts (badge, unread dots) | Owner | Functions; owner marks read |
| `reviews` | Ratings and comments | Reviewer, provider, admins (public via `provider_reviews()`) | `leave_review()` |
| `vouches` | Who vouched for whom | Voucher, provider, admins (public as a count) | `toggle_vouch()` |
| `listing_daily_views` | Views per listing per day | The listing's owner, admins | `record_listing_view()` |
| `locality_interest` | Waitlist for closed localities | Self, admins (public as a count) | Self |
| `push_subscriptions` | Push devices | Owner | `save_/delete_push_subscription()` |
| `reports` | Safety reports | Reporter, admins | Any signed-in person; admins resolve |
| `blocks` | Who blocked whom | The blocker | The blocker |

**Functions people can call:** `complete_onboarding`, `reverify_location`, `change_home_locality`, `create_request`, `respond_request`, `cancel_request`, `mark_request_done`, `expire_my_stale_requests`, `send_message`, `leave_review`, `toggle_vouch`, `set_listing_service_areas`, `save_push_subscription`, `delete_push_subscription`, `delete_my_account`, plus read helpers (`browse_listings`, `people_stats`, `provider_reviews`, `nearby_localities`, `locality_for_point`, `locality_waitlist`, `record_listing_view`) and `admin_*` (which check `is_admin()` themselves).
**Internal only:** `notify`, `close_open_requests_for`, `expire_requests` (scheduler), `point_in_locality`, `assert_*`, trigger functions.

---

## 7. Security and privacy model

- **Default deny.** Migration 3 revokes every table, sequence and function grant from `anon`/`authenticated` and re-grants an explicit, complete list (column-level where needed). Supabase grants new objects to everyone by default; this undoes that.
- **No direct state changes.** Request status, messages, reviews, vouches, service areas and suspensions change only through functions that check who's calling.
- **Privacy by design.** Phone numbers stay in Supabase Auth. GPS coordinates are never stored. Date of birth is owner-only. Profiles are visible only with a live listing or a shared request. Push text never includes names or messages. View counts don't record viewers.
- **Abuse limits.** One phone per account, open-request caps, 30-day locality cooldown, 3 listings, 2 service areas within 5 km, vouching needs a week and a verified phone, length limits on every text.
- **Safe errors and redirects.** Only intentional (`P0001`) database messages reach the screen; every `next=` is checked to be internal.
- **Secrets.** Only `NEXT_PUBLIC_*` reach the browser. The secret key and VAPID private key are server-only.

Still to add: captcha on sign-in (turn on Supabase's auth rate limits meanwhile), and a lawyer's review of `/terms` and `/privacy`.

---

## 8. Set up

About an hour, once. New setup and upgrading from `lean-mvp` are the same: run any migrations you haven't run, in order.

### 8.1 Supabase
1. Create a project at [supabase.com](https://supabase.com), region Mumbai.
2. **Database → Extensions:** enable `postgis` and `pg_cron`.
3. **SQL editor:** run `supabase/migrations/…001_schema.sql`, `…002_seed.sql`, then `…003_v1.sql`. (Or `supabase link` then `supabase db push`.)

### 8.2 Google sign-in
1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth client, type *Web application*, redirect URI `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
2. Supabase **Authentication → Sign In / Providers → Google:** paste client ID and secret.
3. **Authentication → URL Configuration:** Site URL = your app; Redirect URLs `http://localhost:3000/**` and your production URL `/**`.

### 8.3 Phone OTP (test numbers first)
1. **Authentication → Sign In / Providers → Phone:** enable (pick Twilio with placeholders until DLT is done).
2. Add **test phone numbers with fixed OTPs**, e.g. `919876543210=123456`. No SMS is sent for these.
3. **Authentication → Rate Limits:** keep SMS low (e.g. 30/hour).
4. For real SMS in India: register a sender ID and OTP template on DLT through your SMS provider, then add real credentials.

### 8.4 Phone notifications (web push)
```bash
npx web-push generate-vapid-keys
```
Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in `VAPID_PRIVATE_KEY`, and a contact in `VAPID_SUBJECT` (`mailto:you@…`). Generate once and keep them: changing them invalidates every device that turned notifications on.

### 8.5 Email (optional)
[Resend](https://resend.com): verify a domain, create an API key, set `RESEND_API_KEY` and `EMAIL_FROM`.

### 8.6 Run locally
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000
```

| Variable | Where from | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API | browser + server |
| `SUPABASE_SECRET_KEY` | Supabase → API ("secret"/"service_role") | server: alerts only |
| `NEXT_PUBLIC_SITE_URL` | your app URL | links in emails |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` | push |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | email |

GPS and push need HTTPS or `localhost`. To test on a phone, deploy first.

### 8.7 Deploy on Vercel
Import the repo, add the variables, deploy, then add the Vercel URL to Supabase Redirect URLs.

### 8.8 Make yourself admin
SQL editor: `insert into user_roles (user_id, role) values ('<your auth user id>', 'admin');` An **Admin** link then appears in the header.

---

## 9. Running the pilot (admin)

The **Admin** page (`/admin`) covers day-to-day work:
- **At a glance:** people (and new this week), verified phones, live listings, requests this week, acceptance rate, reviews, open reports, suspensions.
- **Reports:** each with the reason and what was reported (listing title, message text, person). Hide/unhide a listing, suspend the person (with a private reason), mark actioned, dismiss, reopen.
- **Localities:** residents, live listings, waitlist and whether a boundary is drawn; open or close each one.
- **Suspended people:** unsuspend.

Still done in SQL:
```sql
-- Draw a real boundary (geometry JSON from geojson.io)
update localities set boundary = st_multi(st_geomfromgeojson('<geometry JSON>'))::geography where slug = 'kaloor';
-- Remove a person entirely
delete from auth.users where id = '<user-id>';
```

---

## 10. Tests and CI

`supabase/tests/10_rules_test.sql` runs the real migrations on a throwaway Postgres + PostGIS that imitates Supabase (roles, `auth.uid()`, Supabase's permissive default grants) and makes about 100 checks, mostly by trying to break things: under-18 sign-up, listing without a phone, faking a request status, spoofing a chat sender, requesting outside your locality, reviewing someone else's job, vouching from another locality, reading other people's chats, devices or view counts, calling internal or admin functions, and more. It also checks the behaviours: stale requests expiring on their own, history kept after deletes, suspension hiding people, service areas and search.

```bash
# needs any Postgres 16 + PostGIS you can throw away (NOT your Supabase project)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db
```

GitHub Actions (`.github/workflows/ci.yml`) runs type-check, lint, build, and the database tests on every push.

---

## 11. What's still left

- **SMS / WhatsApp alerts** — need DLT registration and a paid provider; plug into `src/lib/notify.ts` next to push and email.
- **Malayalam and Tamil** — move UI strings into a dictionary (e.g. `next-intl`).
- **Captcha** on sign-in, **masked calling**, **payments**, **native apps**.
- **Photo uploads** (strip location data from images first).
- **Accurate boundaries** for each locality (drawn by hand; see section 9).

---

## 12. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Google sign-in returns to `/login?error=1` | Redirect URL missing in Supabase URL Configuration, or wrong Google redirect URI |
| "Send code" fails | Phone provider not enabled, number not in the test list, or SMS rate limit hit |
| Everyone shows "Self-selected" | Testing on a laptop (imprecise location) or over plain HTTP |
| "Phone notifications aren't set up" | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` missing |
| No push on iPhone | Ayal must be added to the Home Screen and opened from there first |
| Chat doesn't update live | Realtime publication missing: re-run the last block of migration 1 |
| Requests show "expired" late | `pg_cron` not enabled; they still expire as soon as anyone involved opens Requests |
| Project went offline | Supabase free projects pause after a week of no activity; upgrade before the pilot |
| No alert emails | `RESEND_API_KEY`/`EMAIL_FROM` not set, domain not verified, or the person turned emails off |
