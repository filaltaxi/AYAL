-- Ayal — core schema, access rules and server functions.
-- Run on Supabase (SQL editor or `supabase db push`). Safe to read top to bottom:
--   1. extensions   2. tables   3. helper functions   4. row-level security
--   5. server functions (all state changes go through these)   6. jobs + realtime

-- ─────────────────────────────────────────────────────────────
-- 1. Extensions
-- ─────────────────────────────────────────────────────────────
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- 2. Tables
-- ─────────────────────────────────────────────────────────────

-- The named localities (Kaloor, Vyttila, ...). Matching uses `boundary` when
-- you have drawn one; until then the nearest `center` within `radius_m`.
create table public.localities (
  id          serial primary key,
  slug        text not null unique,
  name        text not null,
  city        text not null,
  district    text not null,
  state       text not null,
  center      extensions.geography(Point, 4326) not null,
  radius_m    integer not null default 1500 check (radius_m between 200 and 10000),
  boundary    extensions.geography(MultiPolygon, 4326),
  is_active   boolean not null default false,   -- only active localities can be joined
  sort        integer not null default 100
);
create index localities_center_idx on public.localities using gist (center);
create index localities_boundary_idx on public.localities using gist (boundary);

create table public.categories (
  id        serial primary key,
  slug      text not null unique,
  name      text not null,
  icon      text not null,
  sort      integer not null default 100,
  is_active boolean not null default true
);

-- What other users can see about a person.
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 2 and 40),
  photo_url           text check (photo_url is null or char_length(photo_url) <= 500),
  home_locality_id    integer not null references public.localities (id),
  location_verified   boolean not null default false,
  locality_changed_at timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- Only the owner (and admins) can read this.
create table public.profiles_private (
  id           uuid primary key references auth.users (id) on delete cascade,
  dob          date not null,
  notify_email boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Roles are set by you in the Supabase dashboard; the app can never write them.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role    text not null check (role in ('admin'))
);

create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  locality_id  integer not null references public.localities (id),
  category_id  integer not null references public.categories (id),
  title        text not null check (char_length(title) between 3 and 80),
  description  text not null check (char_length(description) between 10 and 1000),
  price_text   text not null check (char_length(price_text) between 1 and 60),
  availability text not null default '' check (char_length(availability) <= 120),
  is_paused    boolean not null default false,
  is_hidden    boolean not null default false,  -- set by admins only
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index listings_browse_idx on public.listings (locality_id, category_id, created_at desc)
  where not is_paused and not is_hidden;
create index listings_owner_idx on public.listings (owner_id);

create table public.requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  seeker_id    uuid not null references public.profiles (id) on delete cascade,
  provider_id  uuid not null references public.profiles (id) on delete cascade,
  locality_id  integer not null references public.localities (id),
  message      text not null check (char_length(message) between 5 and 500),
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined','expired','cancelled','done')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  closed_at    timestamptz,
  expires_at   timestamptz not null default now() + interval '48 hours'
);
create index requests_seeker_idx on public.requests (seeker_id, created_at desc);
create index requests_provider_idx on public.requests (provider_id, created_at desc);
create unique index requests_one_open_per_listing
  on public.requests (seeker_id, listing_id) where status in ('pending','accepted');

create table public.messages (
  id         bigserial primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_request_idx on public.messages (request_id, id);

create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('request_new','request_accepted','request_declined',
                                           'request_cancelled','request_done','request_expired')),
  request_id uuid references public.requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.reports (
  id          bigserial primary key,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('user','listing','message','request')),
  target_id   text not null check (char_length(target_id) <= 64),
  reason      text not null check (char_length(reason) between 5 and 500),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ─────────────────────────────────────────────────────────────
-- 3. Helper functions
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.has_verified_phone()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users where id = auth.uid() and phone_confirmed_at is not null);
$$;

-- True if either user has blocked the other.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Which locality is this point in? Returns up to 2 candidates, nearest first.
-- Two rows means the point is near a border: let the person choose.
-- The point is never stored.
create or replace function public.locality_for_point(p_lat double precision, p_lng double precision)
returns table (id integer, slug text, name text, distance_m integer, is_active boolean)
language sql stable security definer set search_path = public, extensions as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select l.id, l.slug, l.name, round(st_distance(l.center, pt.g))::integer, l.is_active
  from public.localities l, pt
  where case
          when l.boundary is not null then st_dwithin(l.boundary, pt.g, 300)
          else st_dwithin(l.center, pt.g, l.radius_m + 300)
        end
  order by case when l.boundary is not null and st_covers(l.boundary, pt.g) then 0 else 1 end,
           st_distance(l.center, pt.g)
  limit 2;
$$;

-- Is the point inside (or within 300 m of) this locality?
create or replace function public.point_in_locality(p_locality_id integer, p_lat double precision, p_lng double precision)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select p_lat is not null and p_lng is not null and exists (
    select 1 from public.locality_for_point(p_lat, p_lng) c where c.id = p_locality_id
  );
$$;

-- How many requests this seeker has completed (shown to providers).
create or replace function public.seeker_completed_count(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.requests where seeker_id = p_user and status = 'done';
$$;

-- Listing owner must have a verified phone; locality always = owner's home; max 3 listings.
create or replace function public.listings_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.has_verified_phone() then
      raise exception 'Verify your phone number before creating a listing' using errcode = 'P0001';
    end if;
    if (select count(*) from public.listings where owner_id = new.owner_id) >= 3 then
      raise exception 'You can have at most 3 listings' using errcode = 'P0001';
    end if;
    select home_locality_id into new.locality_id from public.profiles where id = new.owner_id;
    if new.locality_id is null then
      raise exception 'Finish setting up your profile first' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger listings_before_write before insert or update on public.listings
  for each row execute function public.listings_before_write();

-- ─────────────────────────────────────────────────────────────
-- 4. Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.localities       enable row level security;
alter table public.categories       enable row level security;
alter table public.profiles         enable row level security;
alter table public.profiles_private enable row level security;
alter table public.user_roles       enable row level security;
alter table public.listings         enable row level security;
alter table public.requests         enable row level security;
alter table public.messages         enable row level security;
alter table public.notifications    enable row level security;
alter table public.reports          enable row level security;
alter table public.blocks           enable row level security;

-- Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- Reference data: readable by everyone.
grant select on public.localities, public.categories to anon, authenticated;
create policy "localities readable" on public.localities for select using (true);
create policy "categories readable" on public.categories for select using (true);

-- Public profiles: readable by everyone; owners may change only name and photo.
grant select on public.profiles to anon, authenticated;
grant update (display_name, photo_url) on public.profiles to authenticated;
create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles self update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Private profile: owner only (admins via is_admin()).
grant select on public.profiles_private to authenticated;
grant update (notify_email) on public.profiles_private to authenticated;
create policy "private self read" on public.profiles_private for select
  using (id = auth.uid() or public.is_admin());
create policy "private self update" on public.profiles_private for update
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: no grants, no policies. Only you, via the dashboard.

-- Listings: open browsing; owners see their own paused/hidden ones; blocked pairs never see each other.
grant select on public.listings to anon, authenticated;
grant insert (owner_id, category_id, title, description, price_text, availability, is_paused)
  on public.listings to authenticated;
grant update (category_id, title, description, price_text, availability, is_paused)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;
create policy "listings readable" on public.listings for select using (
  owner_id = auth.uid()
  or public.is_admin()
  or (not is_paused and not is_hidden
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), owner_id)))
);
create policy "listings owner insert" on public.listings for insert
  with check (owner_id = auth.uid());
create policy "listings owner update" on public.listings for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "listings owner delete" on public.listings for delete
  using (owner_id = auth.uid());

-- Requests: only the two parties can read; all writes go through functions.
grant select on public.requests to authenticated;
create policy "requests parties read" on public.requests for select
  using (seeker_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

-- Messages: parties read; parties write only while the request is accepted and nobody is blocked.
grant select on public.messages to authenticated;
grant insert (request_id, body) on public.messages to authenticated;
grant usage on sequence public.messages_id_seq to authenticated;
create policy "messages parties read" on public.messages for select using (
  public.is_admin() or exists (
    select 1 from public.requests r
    where r.id = request_id and (r.seeker_id = auth.uid() or r.provider_id = auth.uid())
  )
);
create policy "messages parties write" on public.messages for insert with check (
  sender_id = auth.uid() and exists (
    select 1 from public.requests r
    where r.id = request_id
      and r.status = 'accepted'
      and (r.seeker_id = auth.uid() or r.provider_id = auth.uid())
      and not public.is_blocked_between(r.seeker_id, r.provider_id)
  )
);

-- Notifications: own only; may mark read.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "notifications own read" on public.notifications for select using (user_id = auth.uid());
create policy "notifications own update" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reports: anyone signed in can file; you see your own; admins see all.
grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;
grant usage on sequence public.reports_id_seq to authenticated;
create policy "reports own insert" on public.reports for insert with check (reporter_id = auth.uid());
create policy "reports own read" on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());

-- Blocks: manage your own.
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;
create policy "blocks own read" on public.blocks for select using (blocker_id = auth.uid());
create policy "blocks own insert" on public.blocks for insert with check (blocker_id = auth.uid());
create policy "blocks own delete" on public.blocks for delete using (blocker_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 5. Server functions (the only way to change requests and localities)
-- ─────────────────────────────────────────────────────────────

create or replace function public.notify(p_user uuid, p_type text, p_request uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, request_id) values (p_user, p_type, p_request);
$$;

-- First-time setup after Google sign-in. Must be 18+.
create or replace function public.complete_onboarding(
  p_display_name text, p_dob date, p_locality_id integer,
  p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = 'P0001'; end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Profile already set up' using errcode = 'P0001';
  end if;
  if p_dob is null or p_dob > (current_date - interval '18 years')::date then
    raise exception 'You must be 18 or older to use Ayal' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.localities where id = p_locality_id and is_active) then
    raise exception 'That locality is not open yet' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, display_name, home_locality_id, location_verified)
  values (v_uid, btrim(p_display_name), p_locality_id,
          public.point_in_locality(p_locality_id, p_lat, p_lng));
  insert into public.profiles_private (id, dob) values (v_uid, p_dob);
end $$;

-- Re-check GPS against the current home locality (refreshes the badge).
create or replace function public.reverify_location(p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update public.profiles
     set location_verified = public.point_in_locality(home_locality_id, p_lat, p_lng)
   where id = auth.uid()
  returning location_verified into v_ok;
  return coalesce(v_ok, false);
end $$;

-- Move home locality: once per 30 days. Pauses listings and closes open requests.
create or replace function public.change_home_locality(
  p_locality_id integer, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prof public.profiles;
begin
  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then raise exception 'Finish setting up your profile first' using errcode = 'P0001'; end if;
  if v_prof.home_locality_id = p_locality_id then
    perform public.reverify_location(p_lat, p_lng);
    return;
  end if;
  if not exists (select 1 from public.localities where id = p_locality_id and is_active) then
    raise exception 'That locality is not open yet' using errcode = 'P0001';
  end if;
  if v_prof.locality_changed_at > now() - interval '30 days' then
    raise exception 'You can change your locality again after %',
      to_char(v_prof.locality_changed_at + interval '30 days', 'DD Mon YYYY') using errcode = 'P0001';
  end if;

  update public.profiles
     set home_locality_id = p_locality_id,
         location_verified = public.point_in_locality(p_locality_id, p_lat, p_lng),
         locality_changed_at = now()
   where id = v_uid;

  update public.listings set is_paused = true, locality_id = p_locality_id where owner_id = v_uid;

  update public.requests set status = 'cancelled', closed_at = now()
   where seeker_id = v_uid and status in ('pending','accepted');
  update public.requests set status = 'declined', responded_at = now(), closed_at = now()
   where provider_id = v_uid and status = 'pending';
  update public.requests set status = 'cancelled', closed_at = now()
   where provider_id = v_uid and status = 'accepted';
end $$;

-- Send a request. Every rule lives here, not in the app.
create or replace function public.create_request(p_listing_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seeker public.profiles;
  v_listing public.listings;
  v_open integer;
  v_limit integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  select * into v_seeker from public.profiles where id = v_uid;
  if not found then raise exception 'Finish setting up your profile first' using errcode = 'P0001'; end if;
  if not public.has_verified_phone() then
    raise exception 'Verify your phone number before sending requests' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.is_paused or v_listing.is_hidden then
    raise exception 'This listing is not available' using errcode = 'P0001';
  end if;
  if v_listing.owner_id = v_uid then
    raise exception 'You cannot request your own listing' using errcode = 'P0001';
  end if;
  if v_listing.locality_id <> v_seeker.home_locality_id then
    raise exception 'You can only send requests in your home locality' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(v_uid, v_listing.owner_id) then
    raise exception 'This listing is not available' using errcode = 'P0001';
  end if;

  v_limit := case when v_seeker.created_at > now() - interval '7 days' then 2 else 5 end;
  select count(*) into v_open from public.requests
   where seeker_id = v_uid and status in ('pending','accepted');
  if v_open >= v_limit then
    raise exception 'You have % open requests, the limit for now. Close one first.', v_open
      using errcode = 'P0001';
  end if;

  begin
    insert into public.requests (listing_id, seeker_id, provider_id, locality_id, message)
    values (v_listing.id, v_uid, v_listing.owner_id, v_listing.locality_id, btrim(p_message))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an open request for this listing' using errcode = 'P0001';
  end;

  perform public.notify(v_listing.owner_id, 'request_new', v_id);
  return v_id;
end $$;

-- Provider accepts or declines.
create or replace function public.respond_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_req public.requests; v_status text;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.provider_id <> auth.uid() then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request is already %', v_req.status using errcode = 'P0001';
  end if;
  if v_req.expires_at < now() then
    update public.requests set status = 'expired', closed_at = now() where id = v_req.id;
    raise exception 'This request has expired' using errcode = 'P0001';
  end if;
  v_status := case when p_accept then 'accepted' else 'declined' end;
  update public.requests
     set status = v_status, responded_at = now(),
         closed_at = case when p_accept then null else now() end
   where id = v_req.id;
  perform public.notify(v_req.seeker_id,
    case when p_accept then 'request_accepted' else 'request_declined' end, v_req.id);
  return v_status;
end $$;

-- Seeker withdraws (pending) or either side calls off an accepted request.
create or replace function public.cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.requests; v_other uuid;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or auth.uid() not in (v_req.seeker_id, v_req.provider_id) then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_req.status = 'pending' and auth.uid() = v_req.provider_id then
    raise exception 'Decline the request instead' using errcode = 'P0001';
  end if;
  if v_req.status not in ('pending','accepted') then
    raise exception 'This request is already %', v_req.status using errcode = 'P0001';
  end if;
  update public.requests set status = 'cancelled', closed_at = now() where id = v_req.id;
  v_other := case when auth.uid() = v_req.seeker_id then v_req.provider_id else v_req.seeker_id end;
  perform public.notify(v_other, 'request_cancelled', v_req.id);
end $$;

-- Either side marks the job done (only after acceptance).
create or replace function public.mark_request_done(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.requests; v_other uuid;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or auth.uid() not in (v_req.seeker_id, v_req.provider_id) then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'accepted' then
    raise exception 'Only accepted requests can be marked done' using errcode = 'P0001';
  end if;
  update public.requests set status = 'done', closed_at = now() where id = v_req.id;
  v_other := case when auth.uid() = v_req.seeker_id then v_req.provider_id else v_req.seeker_id end;
  perform public.notify(v_other, 'request_done', v_req.id);
end $$;

-- Expire pending requests older than 48 hours (run by the scheduler).
create or replace function public.expire_requests()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with expired as (
    update public.requests set status = 'expired', closed_at = now()
     where status = 'pending' and expires_at < now()
    returning id, seeker_id
  ), notes as (
    insert into public.notifications (user_id, type, request_id)
    select seeker_id, 'request_expired', id from expired
    returning 1
  )
  select count(*) into v_count from notes;
  return v_count;
end $$;

-- Delete my account and everything tied to it.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = 'P0001'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Who may call what. Supabase grants new functions to everyone by default,
-- so first take that back, then allow exactly these.
revoke all on all functions in schema public from anon, authenticated, public;
grant execute on function public.locality_for_point(double precision, double precision) to anon, authenticated;
grant execute on function public.seeker_completed_count(uuid) to authenticated;
grant execute on function public.has_verified_phone() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to anon, authenticated;
grant execute on function public.complete_onboarding(text, date, integer, double precision, double precision) to authenticated;
grant execute on function public.reverify_location(double precision, double precision) to authenticated;
grant execute on function public.change_home_locality(integer, double precision, double precision) to authenticated;
grant execute on function public.create_request(uuid, text) to authenticated;
grant execute on function public.respond_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.mark_request_done(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Scheduled expiry + realtime
-- ─────────────────────────────────────────────────────────────

-- Supabase: enable the pg_cron extension (Database → Extensions) and this
-- schedules expiry every 15 minutes. Without it, expiry still happens lazily
-- when a provider tries to respond.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ayal-expire-requests', '*/15 * * * *', 'select public.expire_requests()');
  end if;
end $$;

-- Live chat and inbox updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.requests, public.notifications;
  end if;
end $$;
