-- ============================================================
-- PLATFORM STUB
-- ============================================================
--
-- Minimal stand-ins for the objects Supabase provides but a plain
-- PostgreSQL instance does not: the `authenticated` / `anon` /
-- `service_role` roles, auth.uid(), and the storage schema.
--
-- This exists so the migrations and their row-level security can be
-- exercised against a real PostgreSQL server without provisioning a
-- Supabase project. It is a TEST FIXTURE — it must never be applied to
-- a real database, which is why it lives in supabase/tests and not in
-- supabase/migrations.
--
-- The stubs are deliberately faithful where it matters:
--   * auth.uid() reads request.jwt.claim.sub, exactly as PostgREST sets
--     it, so policies are tested through the same channel the app uses.
--   * storage.objects has RLS enabled with no policies of its own, so
--     the policies under test are the only thing granting access.
--   * The platform's table grants are reproduced, so a denial in a test
--     is row-level security talking and not a missing GRANT.
-- ============================================================

create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create schema if not exists storage;
create extension if not exists pgcrypto;


-- ------------------------------------------------------------
-- auth
-- ------------------------------------------------------------

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;


-- ------------------------------------------------------------
-- storage
-- ------------------------------------------------------------

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

-- Returns the directory segments of an object name, so
-- (storage.foldername(name))[1] is the first folder.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;


-- ------------------------------------------------------------
-- Become a given end user, the way PostgREST does per request.
-- ------------------------------------------------------------

create schema if not exists test;

create or replace function test.login(uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;

grant usage on schema auth, storage, public, test to anon, authenticated, service_role;

/*
 * Supabase grants table privileges to `anon` as well as `authenticated`
 * — an unauthenticated PostgREST request reaches the tables and is
 * turned away by row-level security, not by a missing GRANT.
 *
 * Reproducing that matters for the tests that assert an anonymous caller
 * sees nothing. Without these grants those tests would pass for the
 * wrong reason (42501 from GRANT) and would keep passing even if every
 * policy were dropped.
 *
 * Applied to future tables too, since the migrations run after this file.
 */
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
