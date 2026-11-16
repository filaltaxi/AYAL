-- Tiny assertion helpers. Any failed assertion raises, and psql (ON_ERROR_STOP) exits non-zero.
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Act as a user (null = signed out).
create or replace function tests.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;

-- The statement must fail with an error containing p_like.
create or replace function tests.throws(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then return; end if;
    raise exception 'FAIL expected error like "%" but got "%"  ←  %', p_like, sqlerrm, p_sql;
  end;
  raise exception 'FAIL expected error like "%" but it succeeded  ←  %', p_like, p_sql;
end $$;

create or replace function tests.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok  %', p_label;
end $$;

grant execute on all functions in schema tests to anon, authenticated;
