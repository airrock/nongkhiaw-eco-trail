-- The parts of a Supabase project the migrations rely on: roles, auth.users, auth.uid(), default grants.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- test helpers
create schema t; grant usage on schema t to public;
create function t.eq(got anyelement, want anyelement, what text) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FAILED %: got %, want %', what, got, want; end if; end $$;
-- runs a statement that must be refused; fails if it goes through
create function t.refused(stmt text, what text) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute stmt; get diagnostics n = row_count;
  exception when others then return; end;
  if n > 0 then raise exception 'FAILED %: was allowed (% rows)', what, n; end if;
end $$;
-- runs a statement that must raise an error; fails if it does not
create function t.denied(stmt text, what text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute stmt; exception when others then ok := true; end;
  if not ok then raise exception 'FAILED %: no error was raised', what; end if;
end $$;
create function t.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', case when uid = '' then '' else json_build_object('sub', uid)::text end, false)
$$;
