-- Ayal database rules, tested by trying to break them.
-- Run after 00_supabase_shim.sql, the migrations and 01_helpers.sql (see scripts/test-db.sh).
-- Any failed check raises an error and stops the run.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

-- People (fixed ids)
\set p1 '11111111-1111-1111-1111-111111111111'
\set s1 '22222222-2222-2222-2222-222222222222'
\set s2 '33333333-3333-3333-3333-333333333333'
\set x  '44444444-4444-4444-4444-444444444444'
\set v1 '55555555-5555-5555-5555-555555555555'
\set p2 '66666666-6666-6666-6666-666666666666'
\set w  '77777777-7777-7777-7777-777777777777'
\set a  '88888888-8888-8888-8888-888888888888'
\set k  '99999999-9999-9999-9999-999999999999'

-- ── Setup (as the database owner) ───────────────────────────
update public.localities set is_active = true where slug in ('vyttila', 'palarivattom', 'kakkanad');
select id as kaloor       from public.localities where slug = 'kaloor' \gset
select id as vyttila      from public.localities where slug = 'vyttila' \gset
select id as palarivattom from public.localities where slug = 'palarivattom' \gset
select id as kakkanad     from public.localities where slug = 'kakkanad' \gset
select id as kadavanthra  from public.localities where slug = 'kadavanthra' \gset
select id as edappally    from public.localities where slug = 'edappally' \gset

insert into auth.users (id, email, phone, phone_confirmed_at) values
  (:'p1', 'p1@example.com', '919000000001', now()),
  (:'s1', 's1@example.com', '919000000002', now()),
  (:'s2', 's2@example.com', null, null),
  (:'x',  'x@example.com',  '919000000004', now()),
  (:'v1', 'v1@example.com', '919000000005', now()),
  (:'p2', 'p2@example.com', '919000000006', now()),
  (:'w',  'w@example.com',  '919000000007', now()),
  (:'a',  'a@example.com',  '919000000008', now()),
  (:'k',  'k@example.com',  '919000000009', now());

set role authenticated;

-- ── Onboarding ──────────────────────────────────────────────
select tests.login(:'k');
select tests.throws($$select public.complete_onboarding('Kid', (current_date - interval '16 years')::date, 1)$$, '18 or older');
select tests.throws(format($$select public.complete_onboarding('Kid', '1990-01-01', %s)$$, :edappally), 'not open yet');

select tests.login(:'p1'); select public.complete_onboarding('Ravi K', '1990-01-01', :kaloor, 9.9975, 76.2990);
select tests.eq((select location_verified from public.profiles where id = :'p1'), true, 'GPS inside the locality earns the badge');
select tests.login(:'s1'); select public.complete_onboarding('Anu S', '1995-05-05', :kaloor);
select tests.eq((select location_verified from public.profiles where id = :'s1'), false, 'no GPS means self-selected');
select tests.login(:'s2'); select public.complete_onboarding('No Phone', '1990-01-01', :kaloor);
select tests.login(:'x');  select public.complete_onboarding('Xavier', '1985-01-01', :kaloor);
select tests.login(:'a');  select public.complete_onboarding('Admin', '1985-01-01', :kaloor);
select tests.login(:'v1'); select public.complete_onboarding('Vinu', '1992-01-01', :vyttila, 9.9680, 76.3180);
select tests.login(:'p2'); select public.complete_onboarding('Plumber P', '1980-01-01', :vyttila, 9.9680, 76.3180);
select tests.login(:'w');  select public.complete_onboarding('Wren', '1991-01-01', :palarivattom);

reset role;
update public.profiles set created_at = now() - interval '10 days' where id in (:'p1', :'s1', :'x', :'a', :'w');

-- ── Profile privacy ─────────────────────────────────────────
set role anon; select tests.login(null);
select tests.eq((select count(*)::int from public.profiles), 0, 'signed-out visitors see nobody until they list a skill');
reset role; set role authenticated;
select tests.login(:'s1');
select tests.eq((select count(*)::int from public.profiles), 1, 'a seeker sees only themselves at first');
select tests.eq((select count(*)::int from public.profiles_private), 1, 'private details: only your own row');

-- ── Listings ────────────────────────────────────────────────
select tests.login(:'p1');
insert into public.listings (owner_id, category_id, title, description, price_text)
values (:'p1', 1, 'Maths tuition', 'Class 6 to 10 maths, weekday evenings', '₹200/hr');
insert into public.listings (owner_id, category_id, title, description, price_text)
values (:'p1', 1, 'Science tuition', 'Physics and chemistry for class 8 to 10', '₹200/hr');
select id as l1 from public.listings where title = 'Maths tuition' \gset
select id as l2 from public.listings where title = 'Science tuition' \gset
select tests.eq((select locality_id from public.listings where id = :'l1'), :kaloor, 'a listing always sits in the owner''s home locality');
select tests.throws(format($$update public.listings set is_hidden = true where id = %L$$, :'l1'), 'permission denied');
select tests.throws(format($$update public.listings set locality_id = 3 where id = %L$$, :'l1'), 'permission denied');
insert into public.listings (owner_id, category_id, title, description, price_text)
values (:'p1', 2, 'Errands', 'Small pickups around the area', '₹50/trip');
select tests.throws(format($$insert into public.listings (owner_id, category_id, title, description, price_text) values (%L, 1, 'Fourth', 'one too many listings', '₹1')$$, :'p1'), 'at most 3');
delete from public.listings where title = 'Errands';
select tests.throws(format($$insert into public.listings (owner_id, category_id, title, description, price_text) values (%L, 1, 'Spoof', 'listing for someone else', '₹1')$$, :'s1'), 'row-level security');
select tests.login(:'s2');
select tests.throws(format($$insert into public.listings (owner_id, category_id, title, description, price_text) values (%L, 1, 'No phone', 'should need a verified phone', '₹1')$$, :'s2'), 'Verify your phone');
select tests.login(:'p2');
insert into public.listings (owner_id, category_id, title, description, price_text)
values (:'p2', 4, 'Plumbing repairs', 'Leaks, taps and small fittings', '₹300/visit');
select id as lp2 from public.listings where title = 'Plumbing repairs' \gset

reset role; set role anon; select tests.login(null);
select tests.eq((select count(*)::int from public.profiles), 2, 'providers with a live listing become visible');
reset role; set role authenticated;

-- ── Service areas ───────────────────────────────────────────
select tests.login(:'p1');
select public.set_listing_service_areas(:'l1', array[:vyttila]);
select tests.throws(format($$select public.set_listing_service_areas(%L, array[%s])$$, :'l1', :kakkanad), 'within 5 km');
select tests.throws(format($$select public.set_listing_service_areas(%L, array[%s])$$, :'l1', :edappally), 'within 5 km');
select tests.throws(format($$select public.set_listing_service_areas(%L, array[%s])$$, :'l1', :kaloor), 'already included');
select tests.throws(format($$select public.set_listing_service_areas(%L, array[%s, %s, %s])$$, :'l1', :vyttila, :palarivattom, :kadavanthra), 'at most 2');
select tests.login(:'s1');
select tests.throws(format($$select public.set_listing_service_areas(%L, array[%s])$$, :'l1', :vyttila), 'Listing not found');

-- ── Browse and search ───────────────────────────────────────
reset role; set role anon; select tests.login(null);
select tests.eq((public.browse_listings(:kaloor) ->> 'total')::int, 2, 'Kaloor shows its own listings');
select tests.eq((public.browse_listings(:vyttila) ->> 'total')::int, 2, 'Vyttila shows its own plus a nearby provider who serves it');
select tests.eq((public.browse_listings(:vyttila) -> 'items' -> 0 ->> 'is_local')::boolean, true, 'local providers rank first');
select tests.eq((public.browse_listings(:vyttila) -> 'items' -> 1 ->> 'home_locality'), 'Kaloor', 'outside providers show where they live');
select tests.eq((public.browse_listings(:kaloor, null, 'maths') ->> 'total')::int, 1, 'search matches titles');
select tests.eq((public.browse_listings(:kaloor, null, '%') ->> 'total')::int, 0, 'search wildcards are escaped');
select tests.eq((public.browse_listings(:kaloor, 4) ->> 'total')::int, 0, 'category filter works');
reset role; set role authenticated;

-- ── Requests ────────────────────────────────────────────────
select tests.login(:'s2');
select tests.throws(format($$select public.create_request(%L, 'hello there')$$, :'l1'), 'Verify your phone');
select tests.login(:'s1');
select public.create_request(:'l1', 'Need help for my son in class 8') as r1 \gset
select tests.throws(format($$select public.create_request(%L, 'again please')$$, :'l1'), 'already have an open request');
select tests.throws(format($$select public.create_request(%L, 'hey')$$, :'l2'), '5 to 500');
select tests.throws(format($$insert into public.requests (listing_id, seeker_id, provider_id, locality_id, listing_title, message) values (%L, %L, %L, 1, 't', 'hello there')$$, :'l1', :'s1', :'p1'), 'permission denied');
select tests.throws(format($$update public.requests set status = 'accepted' where id = %L$$, :'r1'), 'permission denied');
select tests.throws(format($$select public.respond_request(%L, true)$$, :'r1'), 'Request not found');
select tests.throws(format($$select public.send_message(%L, 'hi')$$, :'r1'), 'chat is closed');

select tests.login(:'p1');
select public.respond_request(:'r1', true);
select tests.eq((public.send_message(:'r1', 'Tomorrow at 5?') ->> 'alert_user')::uuid, :'s1'::uuid, 'first message alerts the other side');
select tests.eq((public.send_message(:'r1', 'Or Thursday') ->> 'alert_user'), null::text, 'no second alert while the first is unread');
select tests.login(:'s1');
select public.send_message(:'r1', 'Tomorrow works');
select tests.throws(format($$insert into public.messages (request_id, sender_id, body) values (%L, %L, 'spoof')$$, :'r1', :'p1'), 'permission denied');

select tests.login(:'x');
select tests.eq((select count(*)::int from public.requests), 0, 'outsiders can''t see requests');
select tests.eq((select count(*)::int from public.messages), 0, 'outsiders can''t see chats');
select tests.throws(format($$select public.send_message(%L, 'butting in')$$, :'r1'), 'Chat not found');

select tests.login(:'v1');
select public.create_request(:'l1', 'Can you come to Vyttila?') as rv1 \gset
select tests.login(:'w');
select tests.throws(format($$select public.create_request(%L, 'hello there')$$, :'l1'), 'doesn''t serve your home locality');

-- Stale requests never block a new one, even without the scheduler.
reset role;
update public.requests set expires_at = now() - interval '1 hour' where id = :'rv1';
set role authenticated;
select tests.login(:'v1');
select public.create_request(:'l1', 'Trying again, is Saturday ok?') as rv1b \gset
select tests.eq((select status from public.requests where id = :'rv1'), 'expired', 'a stale request expires on its own');

-- ── Reviews ─────────────────────────────────────────────────
select tests.login(:'s1');
select tests.throws(format($$select public.leave_review(%L, 5, 'Great')$$, :'r1'), 'once the job is marked done');
select tests.login(:'p1');
select public.mark_request_done(:'r1');
select tests.throws(format($$select public.leave_review(%L, 5)$$, :'r1'), 'Request not found');
select tests.login(:'s1');
select tests.throws(format($$select public.leave_review(%L, 6)$$, :'r1'), 'Pick 1 to 5');
select public.leave_review(:'r1', 5, 'Patient and clear');
select tests.throws(format($$select public.leave_review(%L, 4)$$, :'r1'), 'already reviewed');

reset role; set role anon; select tests.login(null);
select tests.eq((select count(*)::int from public.provider_reviews(:'p1')), 1, 'anyone can read a provider''s reviews');
select tests.eq((select reviewer_name from public.provider_reviews(:'p1')), 'Anu S', 'reviews show the reviewer''s name');
select tests.eq((select rating_avg from public.people_stats(array[:'p1']::uuid[])), 5.0::numeric, 'rating average');
select tests.eq((select jobs_done from public.people_stats(array[:'p1']::uuid[])), 1, 'jobs done count');
select tests.throws($$select * from public.reviews$$, 'permission denied');
reset role; set role authenticated;

-- ── Vouches ─────────────────────────────────────────────────
select tests.login(:'x');
select tests.eq(public.toggle_vouch(:'p1'), true, 'a neighbour can vouch');
select tests.eq(public.toggle_vouch(:'p1'), false, 'and take it back');
select public.toggle_vouch(:'p1');
select tests.login(:'v1');
select tests.throws(format($$select public.toggle_vouch(%L)$$, :'p1'), 'first week');
select tests.login(:'w');
select tests.throws(format($$select public.toggle_vouch(%L)$$, :'p1'), 'own locality');
select tests.login(:'p1');
select tests.throws(format($$select public.toggle_vouch(%L)$$, :'p1'), 'yourself');
select tests.eq((select vouch_count from public.people_stats(array[:'p1']::uuid[])), 1, 'vouch count');

-- ── Blocks ──────────────────────────────────────────────────
select tests.login(:'s1');
insert into public.blocks (blocked_id) values (:'p1');
select tests.eq((select count(*)::int from public.listings where owner_id = :'p1'), 0, 'blocking hides their listings');
select tests.throws(format($$select public.create_request(%L, 'hello again')$$, :'l2'), 'not available');
delete from public.blocks where blocked_id = :'p1';
select tests.eq((select count(*)::int from public.listings where owner_id = :'p1'), 2, 'unblocking brings them back');

-- ── Listing views ───────────────────────────────────────────
reset role; set role anon; select tests.login(null);
select public.record_listing_view(:'l1');
select public.record_listing_view(:'l1');
reset role; set role authenticated;
select tests.login(:'p1');
select public.record_listing_view(:'l1');
select tests.eq((select views from public.listing_daily_views where listing_id = :'l1'), 2, 'views counted, owner''s own excluded');
select tests.login(:'s1');
select tests.eq((select count(*)::int from public.listing_daily_views), 0, 'only the owner sees view counts');

-- ── Waitlist ────────────────────────────────────────────────
select tests.login(:'s1');
insert into public.locality_interest (locality_id) values (:edappally);
select tests.throws(format($$insert into public.locality_interest (locality_id) values (%s)$$, :kaloor), 'row-level security');
select tests.eq((public.locality_waitlist(:edappally) ->> 'count')::int, 1, 'waitlist count');
select tests.eq((public.locality_waitlist(:edappally) ->> 'joined')::boolean, true, 'waitlist knows I joined');

-- ── Push subscriptions ──────────────────────────────────────
select tests.throws($$select public.save_push_subscription('http://insecure.example', 'k', 'a')$$, 'Invalid subscription');
select public.save_push_subscription('https://push.example.com/abc', 'p256dh-key', 'auth-secret');
select tests.eq((select count(*)::int from public.push_subscriptions), 1, 'my device is saved');
select tests.login(:'p1');
select tests.eq((select count(*)::int from public.push_subscriptions), 0, 'nobody else sees my devices');

-- ── Admin, reports and suspension ───────────────────────────
select tests.login(:'s1');
select tests.throws($$select public.admin_overview()$$, 'Admins only');
insert into public.reports (target_type, target_id, reason) values ('listing', :'l2', 'Looks like spam');
reset role;
insert into public.user_roles (user_id, role) values (:'a', 'admin');
set role authenticated;
select tests.login(:'a');
select tests.eq((public.admin_overview() ->> 'listings_live')::int, 3, 'admin overview counts live listings');
select tests.eq(jsonb_array_length(public.admin_reports('open')), 1, 'admin sees open reports');
select tests.eq((public.admin_reports('open') -> 0 -> 'target' ->> 'title'), 'Science tuition', 'report shows what was reported');
select (public.admin_reports('open') -> 0 ->> 'id')::bigint as rep \gset
select public.admin_resolve_report(:rep, 'actioned');
select tests.eq(jsonb_array_length(public.admin_reports('open')), 0, 'resolved reports leave the queue');
select tests.throws(format($$select public.admin_set_suspended(%L, true, 'me')$$, :'a'), 'suspend yourself');

select public.admin_set_listing_hidden(:'l2', true);
reset role; set role anon; select tests.login(null);
select tests.eq((public.browse_listings(:kaloor) ->> 'total')::int, 1, 'hidden listings leave browse');
reset role; set role authenticated; select tests.login(:'a');
select public.admin_set_listing_hidden(:'l2', false);

select public.admin_set_suspended(:'p1', true, 'Testing');
reset role; set role anon; select tests.login(null);
select tests.eq((public.browse_listings(:kaloor) ->> 'total')::int, 0, 'suspended providers disappear from browse');
select tests.eq((select count(*)::int from public.profiles where id = :'p1'), 0, 'and their profile is hidden');
reset role; set role authenticated;
select tests.login(:'v1');
select tests.eq((select status from public.requests where id = :'rv1b'), 'declined', 'suspension closes their open requests');
select tests.login(:'p1');
select tests.throws(format($$insert into public.listings (owner_id, category_id, title, description, price_text) values (%L, 1, 'New one', 'while suspended', '₹1')$$, :'p1'), 'suspended');
select tests.login(:'a');
select public.admin_set_suspended(:'p1', false);
select tests.eq(jsonb_array_length(public.admin_suspended_users()), 0, 'unsuspended');

-- ── Deleting keeps the other side's history ─────────────────
select tests.login(:'s1');
select public.create_request(:'l2', 'Need help with chemistry') as rl2 \gset
select tests.login(:'p1');
delete from public.listings where id = :'l2';
select tests.eq((select status from public.requests where id = :'rl2'), 'cancelled', 'deleting a listing cancels its open requests');
select tests.eq((select listing_id from public.requests where id = :'rl2'), null::uuid, 'the request stays, without the listing');
select tests.eq((select listing_title from public.requests where id = :'rl2'), 'Science tuition', 'and keeps the listing title');

select tests.login(:'v1');
select public.create_request(:'lp2', 'Leaking tap in the kitchen') as rp2 \gset
select tests.login(:'p2');
select public.respond_request(:'rp2', true);
select public.send_message(:'rp2', 'Coming at 4');
select public.delete_my_account();
select tests.login(:'v1');
select tests.eq((select count(*)::int from public.requests where id = :'rp2'), 1, 'the other side keeps the request');
select tests.eq((select status from public.requests where id = :'rp2'), 'cancelled', 'and it is closed');
select tests.eq((select provider_id from public.requests where id = :'rp2'), null::uuid, 'shown as a former member');
select tests.eq((select count(*)::int from public.messages where request_id = :'rp2'), 0, 'the deleted person''s messages are gone');
select tests.eq((select count(*)::int from public.notifications where request_id = :'rp2' and type = 'request_cancelled'), 1, 'and the other side was told');

-- ── Changing locality ───────────────────────────────────────
select tests.login(:'x');
select tests.throws(format($$select public.change_home_locality(%s)$$, :palarivattom), 'change your locality again after');
reset role;
update public.profiles set locality_changed_at = now() - interval '40 days' where id = :'p1';
set role authenticated;
select tests.login(:'p1');
select public.change_home_locality(:palarivattom, 10.0070, 76.3070);
select tests.eq((select home_locality_id from public.profiles where id = :'p1'), :palarivattom, 'home locality changed');
select tests.eq((select location_verified from public.profiles where id = :'p1'), true, 'and re-verified by GPS');
select tests.eq((select count(*)::int from public.listings where owner_id = :'p1' and not is_paused), 0, 'listings paused after moving');
select tests.eq((select count(*)::int from public.listing_service_areas), 0, 'extra localities dropped after moving');

-- ── Internal functions and tables stay closed ───────────────
select tests.login(:'s1');
select tests.throws(format($$select public.notify(%L, 'request_new', null)$$, :'s1'), 'permission denied');
select tests.throws(format($$select public.close_open_requests_for(%L)$$, :'p1'), 'permission denied');
select tests.throws($$select public.expire_requests()$$, 'permission denied');
select tests.throws($$select public.point_in_locality(1, 0, 0)$$, 'permission denied');
select tests.throws($$select * from public.user_roles$$, 'permission denied');
select tests.throws($$select public.admin_set_locality_active(1, false)$$, 'Admins only');
reset role; set role anon; select tests.login(null);
select tests.throws(format($$select public.create_request(%L, 'hello there')$$, :'l1'), 'permission denied');
select tests.throws($$select * from public.requests$$, 'permission denied');
reset role;

\echo
\echo 'ALL DATABASE TESTS PASSED'
