-- Ayal v1 — fixes from the lean-MVP review, plus the full-MVP features.
-- Run after 20261116000001_schema.sql and 20261116000002_seed.sql.
--
--   1. Column and constraint changes (history survives deletes, suspension, chat alerts)
--   2. New tables (service areas, reviews, vouches, listing views, waitlist, push)
--   3. Helper functions
--   4. Row-level security (profiles are no longer fully public)
--   5. Functions: requests, chat, reviews, vouches, service areas, browse, push
--   6. Admin functions
--   7. Triggers
--   8. Grants — the COMPLETE list; it replaces the grants in migration 1

-- ─────────────────────────────────────────────────────────────
-- 1. Column and constraint changes
-- ─────────────────────────────────────────────────────────────

-- Requests outlive the listing and both accounts, so nobody loses their history
-- when the other person deletes something. Keep a snapshot of the listing title.
alter table public.requests add column if not exists listing_title text;
update public.requests r set listing_title = l.title
  from public.listings l where l.id = r.listing_id and r.listing_title is null;
update public.requests set listing_title = 'Listing' where listing_title is null;
alter table public.requests alter column listing_title set not null;

alter table public.requests
  alter column listing_id  drop not null,
  alter column seeker_id   drop not null,
  alter column provider_id drop not null;
alter table public.requests
  drop constraint requests_listing_id_fkey,
  add constraint requests_listing_id_fkey foreign key (listing_id)
    references public.listings (id) on delete set null,
  drop constraint requests_seeker_id_fkey,
  add constraint requests_seeker_id_fkey foreign key (seeker_id)
    references public.profiles (id) on delete set null,
  drop constraint requests_provider_id_fkey,
  add constraint requests_provider_id_fkey foreign key (provider_id)
    references public.profiles (id) on delete set null;

-- Reports survive the reporter deleting their account.
alter table public.reports alter column reporter_id drop not null;
alter table public.reports
  drop constraint reports_reporter_id_fkey,
  add constraint reports_reporter_id_fkey foreign key (reporter_id)
    references auth.users (id) on delete set null;
alter table public.reports
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users (id) on delete set null;

-- Suspension, set by admins only.
alter table public.profiles_private
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text
    check (suspended_reason is null or char_length(suspended_reason) <= 300);

-- New notification kinds.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'request_new','request_accepted','request_declined','request_cancelled','request_done',
  'request_expired','message_new','review_new','vouch_new'));
create index if not exists notifications_unread_idx
  on public.notifications (user_id, request_id, type) where read_at is null;

-- ─────────────────────────────────────────────────────────────
-- 2. New tables
-- ─────────────────────────────────────────────────────────────

-- Up to 2 extra open localities (within 5 km of home) a listing also serves.
create table public.listing_service_areas (
  listing_id  uuid not null references public.listings (id) on delete cascade,
  locality_id integer not null references public.localities (id) on delete cascade,
  primary key (listing_id, locality_id)
);
create index listing_service_areas_locality_idx on public.listing_service_areas (locality_id);

-- A seeker rates a provider once per finished job.
create table public.reviews (
  id            bigserial primary key,
  request_id    uuid unique references public.requests (id) on delete set null,
  provider_id   uuid not null references public.profiles (id) on delete cascade,
  reviewer_id   uuid references public.profiles (id) on delete set null,
  listing_title text not null,
  rating        smallint not null check (rating between 1 and 5),
  comment       text check (comment is null or char_length(comment) <= 500),
  created_at    timestamptz not null default now()
);
create index reviews_provider_idx on public.reviews (provider_id, created_at desc);

-- "I know this person": a neighbour in the same locality vouches for a provider.
create table public.vouches (
  voucher_id  uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (voucher_id, provider_id),
  check (voucher_id <> provider_id)
);
create index vouches_provider_idx on public.vouches (provider_id);

-- Daily view counts, shown to the listing's owner.
create table public.listing_daily_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day        date not null default current_date,
  views      integer not null default 0,
  primary key (listing_id, day)
);

-- "Tell me when my locality opens."
create table public.locality_interest (
  locality_id integer not null references public.localities (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (locality_id, user_id)
);

-- Web push subscriptions, one per browser/device.
create table public.push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Helper functions
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles_private where id = p_user and suspended_at is not null);
$$;

-- A profile is public while its owner has a live listing.
create or replace function public.profile_is_public(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listings l
    where l.owner_id = p_user and not l.is_paused and not l.is_hidden
  ) and not public.is_suspended(p_user);
$$;

-- Do I share a request (any status) with this person?
create or replace function public.shares_request(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.requests r
    where (r.seeker_id = auth.uid() and r.provider_id = p_user)
       or (r.provider_id = auth.uid() and r.seeker_id = p_user)
  );
$$;

create or replace function public.assert_not_suspended()
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_suspended(auth.uid()) then
    raise exception 'Your account is suspended. Contact the Ayal team if you think this is a mistake.'
      using errcode = 'P0001';
  end if;
end $$;

create or replace function public.assert_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
end $$;

-- Close every open request a person is part of (account deletion, locality change,
-- suspension) and tell the other side.
create or replace function public.close_open_requests_for(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with closed as (
    update public.requests
       set status = case when status = 'pending' and provider_id = p_user then 'declined' else 'cancelled' end,
           responded_at = case when status = 'pending' and provider_id = p_user then now() else responded_at end,
           closed_at = now()
     where status in ('pending','accepted') and (seeker_id = p_user or provider_id = p_user)
    returning id, status, case when seeker_id = p_user then provider_id else seeker_id end as other
  ), notes as (
    insert into public.notifications (user_id, type, request_id)
    select other, case status when 'declined' then 'request_declined' else 'request_cancelled' end, id
    from closed where other is not null
    returning 1
  )
  select count(*) into v_count from closed;
  return v_count;
end $$;

-- Who people are, in numbers: rating, reviews, jobs done as provider and as seeker, vouches.
create or replace function public.people_stats(p_ids uuid[])
returns table (user_id uuid, rating_avg numeric, rating_count integer, jobs_done integer,
               asked_done integer, vouch_count integer)
language sql stable security definer set search_path = public as $$
  select u.id,
         (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.provider_id = u.id),
         (select count(*)::integer from public.reviews r where r.provider_id = u.id),
         (select count(*)::integer from public.requests q where q.provider_id = u.id and q.status = 'done'),
         (select count(*)::integer from public.requests q where q.seeker_id = u.id and q.status = 'done'),
         (select count(*)::integer from public.vouches v where v.provider_id = u.id)
  from (select distinct id from unnest(p_ids) as t(id) where id is not null limit 200) u;
$$;

-- Open localities within p_km of another locality's centre.
create or replace function public.nearby_localities(p_locality integer, p_km numeric default 5)
returns table (id integer, slug text, name text, distance_km numeric, is_active boolean)
language sql stable set search_path = public, extensions as $$
  select l.id, l.slug, l.name,
         round((st_distance(l.center, h.center) / 1000)::numeric, 1), l.is_active
  from public.localities h
  join public.localities l on l.id <> h.id
  where h.id = p_locality and st_dwithin(l.center, h.center, least(p_km, 10) * 1000)
  order by 4;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Row-level security
-- ─────────────────────────────────────────────────────────────

-- Profiles: visible only if they have a live listing, or you share a request with them.
drop policy "profiles readable" on public.profiles;
create policy "profiles visible" on public.profiles for select using (
  id = auth.uid() or public.is_admin() or public.profile_is_public(id) or public.shares_request(id)
);

-- Listings: suspended owners disappear from browse.
drop policy "listings readable" on public.listings;
create policy "listings readable" on public.listings for select using (
  owner_id = auth.uid()
  or public.is_admin()
  or (not is_paused and not is_hidden and not public.is_suspended(owner_id)
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), owner_id)))
);

-- Messages are now written only through send_message(), which also raises the alert.
drop policy "messages parties write" on public.messages;

alter table public.listing_service_areas enable row level security;
alter table public.reviews               enable row level security;
alter table public.vouches               enable row level security;
alter table public.listing_daily_views   enable row level security;
alter table public.locality_interest     enable row level security;
alter table public.push_subscriptions    enable row level security;

create policy "service areas follow listing" on public.listing_service_areas for select
  using (exists (select 1 from public.listings l where l.id = listing_id));

-- Public review lists come from provider_reviews(); the table itself is for the two people.
create policy "reviews parties read" on public.reviews for select
  using (reviewer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

create policy "vouches own read" on public.vouches for select
  using (voucher_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

create policy "views owner read" on public.listing_daily_views for select using (
  public.is_admin() or exists (
    select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
);

create policy "interest own read" on public.locality_interest for select
  using (user_id = auth.uid() or public.is_admin());
create policy "interest own insert" on public.locality_interest for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.localities l where l.id = locality_id and not l.is_active)
);
create policy "interest own delete" on public.locality_interest for delete using (user_id = auth.uid());

create policy "push own read" on public.push_subscriptions for select using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 5. Functions
-- ─────────────────────────────────────────────────────────────

-- Expire stale pending requests. With p_user, only that person's (seeker or provider);
-- without, everyone's (the scheduler). Seekers get a notification.
drop function if exists public.expire_requests();
create or replace function public.expire_requests(p_user uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with expired as (
    update public.requests set status = 'expired', closed_at = now()
     where status = 'pending' and expires_at < now()
       and (p_user is null or seeker_id = p_user or provider_id = p_user)
    returning id, seeker_id
  ), notes as (
    insert into public.notifications (user_id, type, request_id)
    select seeker_id, 'request_expired', id from expired
    where seeker_id is not null and seeker_id is distinct from p_user
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;

-- Lets the inbox fix stale requests itself, so nothing depends on the scheduler running.
create or replace function public.expire_my_stale_requests()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 0; end if;
  return public.expire_requests(auth.uid());
end $$;

-- Listings: verified phone, not suspended, max 3, locality always = owner's home.
create or replace function public.listings_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.has_verified_phone() then
      raise exception 'Verify your phone number before creating a listing' using errcode = 'P0001';
    end if;
    if public.is_suspended(new.owner_id) then
      raise exception 'Your account is suspended. Contact the Ayal team if you think this is a mistake.'
        using errcode = 'P0001';
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

-- Move home locality: once per 30 days. Pauses listings, drops their extra
-- localities, and closes open requests (telling the other side).
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

  delete from public.listing_service_areas sa
   using public.listings l where l.id = sa.listing_id and l.owner_id = v_uid;
  update public.listings set is_paused = true, locality_id = p_locality_id where owner_id = v_uid;
  perform public.close_open_requests_for(v_uid);
end $$;

-- Send a request. The listing must be in the seeker's home locality, or serve it.
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
  perform public.assert_not_suspended();
  if char_length(btrim(coalesce(p_message, ''))) not between 5 and 500 then
    raise exception 'Write a message of 5 to 500 characters' using errcode = 'P0001';
  end if;

  -- Stale requests must never block a new one, even if the scheduler isn't running.
  perform public.expire_requests(v_uid);

  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.is_paused or v_listing.is_hidden or public.is_suspended(v_listing.owner_id) then
    raise exception 'This listing is not available' using errcode = 'P0001';
  end if;
  if v_listing.owner_id = v_uid then
    raise exception 'You cannot request your own listing' using errcode = 'P0001';
  end if;
  if v_listing.locality_id <> v_seeker.home_locality_id and not exists (
       select 1 from public.listing_service_areas
       where listing_id = v_listing.id and locality_id = v_seeker.home_locality_id) then
    raise exception 'This provider doesn''t serve your home locality' using errcode = 'P0001';
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
    insert into public.requests (listing_id, seeker_id, provider_id, locality_id, listing_title, message)
    values (v_listing.id, v_uid, v_listing.owner_id, v_seeker.home_locality_id, v_listing.title, btrim(p_message))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an open request for this listing' using errcode = 'P0001';
  end;

  perform public.notify(v_listing.owner_id, 'request_new', v_id);
  return v_id;
end $$;

create or replace function public.respond_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_req public.requests; v_status text;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.provider_id is distinct from auth.uid() then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request is already %', v_req.status using errcode = 'P0001';
  end if;
  if v_req.expires_at < now() then
    perform public.expire_requests(auth.uid());
    raise exception 'This request has expired' using errcode = 'P0001';
  end if;
  if p_accept then perform public.assert_not_suspended(); end if;
  v_status := case when p_accept then 'accepted' else 'declined' end;
  update public.requests
     set status = v_status, responded_at = now(),
         closed_at = case when p_accept then null else now() end
   where id = v_req.id;
  if v_req.seeker_id is not null then
    perform public.notify(v_req.seeker_id,
      case when p_accept then 'request_accepted' else 'request_declined' end, v_req.id);
  end if;
  return v_status;
end $$;

create or replace function public.cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.requests; v_other uuid;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or (v_req.seeker_id is distinct from auth.uid() and v_req.provider_id is distinct from auth.uid()) then
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
  if v_other is not null then perform public.notify(v_other, 'request_cancelled', v_req.id); end if;
end $$;

create or replace function public.mark_request_done(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.requests; v_other uuid;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or (v_req.seeker_id is distinct from auth.uid() and v_req.provider_id is distinct from auth.uid()) then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'accepted' then
    raise exception 'Only accepted requests can be marked done' using errcode = 'P0001';
  end if;
  update public.requests set status = 'done', closed_at = now() where id = v_req.id;
  v_other := case when auth.uid() = v_req.seeker_id then v_req.provider_id else v_req.seeker_id end;
  if v_other is not null then perform public.notify(v_other, 'request_done', v_req.id); end if;
end $$;

-- Chat. Returns the message, and who to alert (null if they already have an unread alert).
create or replace function public.send_message(p_request_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests;
  v_msg public.messages;
  v_other uuid;
  v_alert uuid;
begin
  select * into v_req from public.requests where id = p_request_id;
  if not found or (v_req.seeker_id is distinct from v_uid and v_req.provider_id is distinct from v_uid) then
    raise exception 'Chat not found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'accepted' or public.is_blocked_between(v_req.seeker_id, v_req.provider_id) then
    raise exception 'This chat is closed' using errcode = 'P0001';
  end if;
  perform public.assert_not_suspended();
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Messages can be 1 to 1000 characters' using errcode = 'P0001';
  end if;

  insert into public.messages (request_id, sender_id, body)
  values (p_request_id, v_uid, btrim(p_body)) returning * into v_msg;

  v_other := case when v_uid = v_req.seeker_id then v_req.provider_id else v_req.seeker_id end;
  if v_other is not null and not exists (
       select 1 from public.notifications
       where user_id = v_other and request_id = p_request_id and type = 'message_new' and read_at is null) then
    perform public.notify(v_other, 'message_new', p_request_id);
    v_alert := v_other;
  end if;

  return jsonb_build_object('message', to_jsonb(v_msg), 'alert_user', v_alert);
end $$;

-- Reviews: the seeker, once, within 30 days of the job being marked done.
create or replace function public.leave_review(p_request_id uuid, p_rating integer, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.requests;
begin
  select * into v_req from public.requests where id = p_request_id;
  if not found or v_req.seeker_id is distinct from auth.uid() then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'done' then
    raise exception 'You can leave a review once the job is marked done' using errcode = 'P0001';
  end if;
  if v_req.provider_id is null then
    raise exception 'This provider has left Ayal' using errcode = 'P0001';
  end if;
  if v_req.closed_at < now() - interval '30 days' then
    raise exception 'Reviews close 30 days after the job' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reviews where request_id = p_request_id) then
    raise exception 'You already reviewed this job' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Pick 1 to 5 stars' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_comment, '')) > 500 then
    raise exception 'Keep the review under 500 characters' using errcode = 'P0001';
  end if;
  perform public.assert_not_suspended();

  insert into public.reviews (request_id, provider_id, reviewer_id, listing_title, rating, comment)
  values (p_request_id, v_req.provider_id, v_req.seeker_id, v_req.listing_title, p_rating,
          nullif(btrim(coalesce(p_comment, '')), ''));
  perform public.notify(v_req.provider_id, 'review_new', p_request_id);
end $$;

-- Public review list for a visible provider.
create or replace function public.provider_reviews(p_provider uuid, p_limit integer default 20)
returns table (id bigint, rating smallint, comment text, listing_title text,
               created_at timestamptz, reviewer_name text)
language sql stable security definer set search_path = public as $$
  select r.id, r.rating, r.comment, r.listing_title, r.created_at,
         coalesce(p.display_name, 'Former member')
  from public.reviews r
  left join public.profiles p on p.id = r.reviewer_id
  where r.provider_id = p_provider
    and (public.profile_is_public(p_provider) or p_provider = auth.uid()
         or public.shares_request(p_provider) or public.is_admin())
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Vouch (or un-vouch). Same home locality, verified phone, a week on Ayal.
create or replace function public.toggle_vouch(p_provider uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_me public.profiles; v_them public.profiles;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  if exists (select 1 from public.vouches where voucher_id = v_uid and provider_id = p_provider) then
    delete from public.vouches where voucher_id = v_uid and provider_id = p_provider;
    return false;
  end if;

  select * into v_me from public.profiles where id = v_uid;
  if not found then raise exception 'Finish setting up your profile first' using errcode = 'P0001'; end if;
  if v_uid = p_provider then raise exception 'You can''t vouch for yourself' using errcode = 'P0001'; end if;
  if not public.has_verified_phone() then
    raise exception 'Verify your phone number first' using errcode = 'P0001';
  end if;
  perform public.assert_not_suspended();
  if v_me.created_at > now() - interval '7 days' then
    raise exception 'You can vouch for neighbours after your first week on Ayal' using errcode = 'P0001';
  end if;
  select * into v_them from public.profiles where id = p_provider;
  if not found or not public.profile_is_public(p_provider) or public.is_blocked_between(v_uid, p_provider) then
    raise exception 'This person isn''t available' using errcode = 'P0001';
  end if;
  if v_them.home_locality_id <> v_me.home_locality_id then
    raise exception 'You can only vouch for people in your own locality' using errcode = 'P0001';
  end if;

  insert into public.vouches (voucher_id, provider_id) values (v_uid, p_provider);
  perform public.notify(p_provider, 'vouch_new', null);
  return true;
end $$;

-- Extra localities for a listing: at most 2, open, within 5 km of home.
create or replace function public.set_listing_service_areas(p_listing_id uuid, p_localities integer[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings;
  v_ids integer[] := coalesce(
    (select array_agg(distinct x) from unnest(p_localities) as t(x) where x is not null), '{}');
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.owner_id is distinct from auth.uid() then
    raise exception 'Listing not found' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) > 2 then
    raise exception 'You can add at most 2 extra localities' using errcode = 'P0001';
  end if;
  if v_listing.locality_id = any (v_ids) then
    raise exception 'Your home locality is already included' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_ids) as t(x)
    where not exists (
      select 1 from public.nearby_localities(v_listing.locality_id, 5) n where n.id = t.x and n.is_active)
  ) then
    raise exception 'Extra localities must be open and within 5 km of your home locality' using errcode = 'P0001';
  end if;

  delete from public.listing_service_areas where listing_id = p_listing_id;
  insert into public.listing_service_areas (listing_id, locality_id)
  select p_listing_id, x from unnest(v_ids) as t(x);
end $$;

-- Browse a locality: its own listings first, then nearby providers who serve it.
-- Runs as the caller, so every row-level rule (blocks, suspension, paused) still applies.
create or replace function public.browse_listings(
  p_locality integer, p_category integer default null, p_query text default null,
  p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable set search_path = public as $$
  with q as (
    select nullif(btrim(left(coalesce(p_query, ''), 60)), '') as text
  ), pattern as (
    select '%' || replace(replace(replace(q.text, '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
    from q where q.text is not null
  ), base as (
    select l.id, l.title, l.description, l.price_text, l.availability, l.created_at,
           l.owner_id, l.locality_id, l.category_id, (l.locality_id = p_locality) as is_local
    from public.listings l
    where not l.is_paused and not l.is_hidden
      and (l.locality_id = p_locality or exists (
            select 1 from public.listing_service_areas sa
            where sa.listing_id = l.id and sa.locality_id = p_locality))
      and (p_category is null or l.category_id = p_category)
      and (not exists (select 1 from pattern)
           or l.title ilike (select p from pattern)
           or l.description ilike (select p from pattern))
  ), page as (
    select * from base
    order by is_local desc, created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'title', pg.title, 'description', pg.description,
        'price_text', pg.price_text, 'availability', pg.availability,
        'created_at', pg.created_at, 'is_local', pg.is_local,
        'home_locality', hl.name,
        'category', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'icon', c.icon),
        'owner', case when p.id is null then null else jsonb_build_object(
          'id', p.id, 'display_name', p.display_name, 'photo_url', p.photo_url,
          'location_verified', p.location_verified) end,
        'stats', jsonb_build_object('rating_avg', s.rating_avg, 'rating_count', s.rating_count,
          'jobs_done', s.jobs_done, 'vouch_count', s.vouch_count)
      ) order by pg.is_local desc, pg.created_at desc)
      from page pg
      join public.categories c on c.id = pg.category_id
      join public.localities hl on hl.id = pg.locality_id
      left join public.profiles p on p.id = pg.owner_id
      left join lateral public.people_stats(array[pg.owner_id]) s on true
    ), '[]'::jsonb)
  );
$$;

-- Count a view (never the owner's own).
create or replace function public.record_listing_view(p_listing_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.listing_daily_views (listing_id, day, views)
  select l.id, current_date, 1 from public.listings l
  where l.id = p_listing_id and not l.is_paused and not l.is_hidden
    and l.owner_id is distinct from auth.uid()
  on conflict (listing_id, day) do update set views = public.listing_daily_views.views + 1;
$$;

-- How many people are waiting for a locality, and whether I am.
create or replace function public.locality_waitlist(p_locality integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'count', (select count(*) from public.locality_interest where locality_id = p_locality),
    'joined', exists (select 1 from public.locality_interest
                      where locality_id = p_locality and user_id = auth.uid()));
$$;

-- Web push subscriptions (a device moves to whoever subscribed on it last; max 5 per person).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' then
    raise exception 'Invalid subscription' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  delete from public.push_subscriptions
   where user_id = auth.uid()
     and id not in (select id from public.push_subscriptions where user_id = auth.uid()
                    order by created_at desc limit 5);
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

drop function if exists public.seeker_completed_count(uuid);

-- ─────────────────────────────────────────────────────────────
-- 6. Admin functions (each checks the caller is an admin)
-- ─────────────────────────────────────────────────────────────

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'phone_verified', (select count(*) from auth.users where phone_confirmed_at is not null),
    'listings_live', (select count(*) from public.listings where not is_paused and not is_hidden),
    'requests_7d', (select count(*) from public.requests where created_at > now() - interval '7 days'),
    'requests_30d', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from public.requests
        where created_at > now() - interval '30 days' group by status) s),
    'reviews', (select count(*) from public.reviews),
    'rating_avg', (select round(avg(rating)::numeric, 2) from public.reviews),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'suspended', (select count(*) from public.profiles_private where suspended_at is not null)
  );
end $$;

create or replace function public.admin_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(x order by (x->>'created_at') desc) from (
      select jsonb_build_object(
        'id', r.id, 'target_type', r.target_type, 'target_id', r.target_id,
        'reason', r.reason, 'status', r.status, 'created_at', r.created_at,
        'reporter', (select display_name from public.profiles where id = r.reporter_id),
        'target', case r.target_type
          when 'listing' then (
            select jsonb_build_object('title', l.title, 'is_hidden', l.is_hidden,
                     'user_id', l.owner_id, 'user_name', p.display_name,
                     'suspended', public.is_suspended(l.owner_id))
            from public.listings l left join public.profiles p on p.id = l.owner_id
            where l.id::text = r.target_id)
          when 'user' then (
            select jsonb_build_object('user_id', p.id, 'user_name', p.display_name,
                     'suspended', public.is_suspended(p.id))
            from public.profiles p where p.id::text = r.target_id)
          when 'message' then (
            select jsonb_build_object('body', m.body, 'request_id', m.request_id,
                     'user_id', m.sender_id, 'user_name', p.display_name,
                     'suspended', public.is_suspended(m.sender_id))
            from public.messages m left join public.profiles p on p.id = m.sender_id
            where m.id::text = r.target_id)
          when 'request' then (
            select jsonb_build_object('title', q.listing_title, 'body', q.message,
                     'user_id', q.seeker_id, 'user_name', p.display_name,
                     'suspended', public.is_suspended(q.seeker_id))
            from public.requests q left join public.profiles p on p.id = q.seeker_id
            where q.id::text = r.target_id)
        end) as x
      from public.reports r
      where r.status = coalesce(p_status, 'open')
      order by r.created_at desc
      limit 100
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(p_report_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_status not in ('open','actioned','dismissed') then
    raise exception 'Unknown status' using errcode = 'P0001';
  end if;
  update public.reports
     set status = p_status,
         resolved_at = case when p_status = 'open' then null else now() end,
         resolved_by = case when p_status = 'open' then null else auth.uid() end
   where id = p_report_id;
end $$;

create or replace function public.admin_set_listing_hidden(p_listing_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.listings set is_hidden = p_hidden where id = p_listing_id;
  if p_hidden then
    with closed as (
      update public.requests set status = 'cancelled', closed_at = now()
       where listing_id = p_listing_id and status = 'pending'
      returning id, seeker_id
    )
    insert into public.notifications (user_id, type, request_id)
    select seeker_id, 'request_cancelled', id from closed where seeker_id is not null;
  end if;
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_user = auth.uid() then raise exception 'You can''t suspend yourself' using errcode = 'P0001'; end if;
  update public.profiles_private
     set suspended_at = case when p_suspended then now() else null end,
         suspended_reason = case when p_suspended then left(p_reason, 300) else null end
   where id = p_user;
  if p_suspended then perform public.close_open_requests_for(p_user); end if;
end $$;

create or replace function public.admin_suspended_users()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', pp.id, 'user_name', p.display_name,
             'suspended_at', pp.suspended_at, 'reason', pp.suspended_reason)
           order by pp.suspended_at desc)
    from public.profiles_private pp join public.profiles p on p.id = pp.id
    where pp.suspended_at is not null
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_localities()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'slug', l.slug, 'name', l.name, 'is_active', l.is_active,
      'has_boundary', l.boundary is not null,
      'residents', (select count(*) from public.profiles p where p.home_locality_id = l.id),
      'listings_live', (select count(*) from public.listings x
                        where x.locality_id = l.id and not x.is_paused and not x.is_hidden),
      'waitlist', (select count(*) from public.locality_interest i where i.locality_id = l.id)
    ) order by l.sort)
    from public.localities l
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_locality_active(p_locality integer, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.localities set is_active = p_active where id = p_locality;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Triggers
-- ─────────────────────────────────────────────────────────────

-- Deleting a listing cancels its open requests; the requests themselves stay.
create or replace function public.listings_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  with closed as (
    update public.requests set status = 'cancelled', closed_at = now()
     where listing_id = old.id and status in ('pending','accepted')
    returning id, seeker_id
  )
  insert into public.notifications (user_id, type, request_id)
  select seeker_id, 'request_cancelled', id from closed where seeker_id is not null;
  return old;
end $$;
create trigger listings_before_delete before delete on public.listings
  for each row execute function public.listings_before_delete();

-- Deleting an account closes its open requests first, so the other side is told.
create or replace function public.profiles_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.close_open_requests_for(old.id);
  return old;
end $$;
create trigger profiles_before_delete before delete on public.profiles
  for each row execute function public.profiles_before_delete();

-- ─────────────────────────────────────────────────────────────
-- 8. Grants — the complete list (Supabase grants new objects to everyone by default,
--    so start from nothing and allow exactly this)
-- ─────────────────────────────────────────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- Tables
grant select on public.localities, public.categories to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, photo_url) on public.profiles to authenticated;
grant select on public.profiles_private to authenticated;
grant update (notify_email) on public.profiles_private to authenticated;
grant select on public.listings to anon, authenticated;
grant insert (owner_id, category_id, title, description, price_text, availability, is_paused)
  on public.listings to authenticated;
grant update (category_id, title, description, price_text, availability, is_paused)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;
grant select on public.listing_service_areas to anon, authenticated;
grant select on public.requests to authenticated;
grant select on public.messages to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;
grant usage on sequence public.reports_id_seq to authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;
grant select on public.reviews to authenticated;
grant select on public.vouches to authenticated;
grant select on public.listing_daily_views to authenticated;
grant select, delete on public.locality_interest to authenticated;
grant insert (locality_id) on public.locality_interest to authenticated;
grant select on public.push_subscriptions to authenticated;
-- user_roles: no grants. Only you, from the dashboard.

-- Functions anyone may call (also used inside row-level rules)
grant execute on function public.locality_for_point(double precision, double precision) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to anon, authenticated;
grant execute on function public.is_suspended(uuid) to anon, authenticated;
grant execute on function public.profile_is_public(uuid) to anon, authenticated;
grant execute on function public.shares_request(uuid) to anon, authenticated;
grant execute on function public.people_stats(uuid[]) to anon, authenticated;
grant execute on function public.provider_reviews(uuid, integer) to anon, authenticated;
grant execute on function public.nearby_localities(integer, numeric) to anon, authenticated;
grant execute on function public.browse_listings(integer, integer, text, integer, integer) to anon, authenticated;
grant execute on function public.record_listing_view(uuid) to anon, authenticated;
grant execute on function public.locality_waitlist(integer) to anon, authenticated;

-- Functions for signed-in people (each checks who is calling)
grant execute on function public.has_verified_phone() to authenticated;
grant execute on function public.complete_onboarding(text, date, integer, double precision, double precision) to authenticated;
grant execute on function public.reverify_location(double precision, double precision) to authenticated;
grant execute on function public.change_home_locality(integer, double precision, double precision) to authenticated;
grant execute on function public.create_request(uuid, text) to authenticated;
grant execute on function public.respond_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.mark_request_done(uuid) to authenticated;
grant execute on function public.expire_my_stale_requests() to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.leave_review(uuid, integer, text) to authenticated;
grant execute on function public.toggle_vouch(uuid) to authenticated;
grant execute on function public.set_listing_service_areas(uuid, integer[]) to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_reports(text) to authenticated;
grant execute on function public.admin_resolve_report(bigint, text) to authenticated;
grant execute on function public.admin_set_listing_hidden(uuid, boolean) to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.admin_suspended_users() to authenticated;
grant execute on function public.admin_localities() to authenticated;
grant execute on function public.admin_set_locality_active(integer, boolean) to authenticated;

-- Not callable from the app: notify, close_open_requests_for, expire_requests (scheduler),
-- point_in_locality, assert_admin, assert_not_suspended, and the trigger functions.
