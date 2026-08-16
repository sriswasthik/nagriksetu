-- ============================================================
-- CityTrace — SCHEMA BOOTSTRAP
-- ============================================================
--
-- GENERATED FILE. Do not edit; regenerate with
--   ./scripts/generate-bootstrap.sh
--
-- WHAT THIS IS FOR
--
-- Everything the application needs on top of the original schema, in one
-- file you can paste into the Supabase SQL editor. No CLI, no linked
-- project, no migration history required.
--
-- It exists because a deployment could not file a single report:
--
--   Create complaint error: null value in column "complaint_number"
--   ...then, after that was made robust:
--   This CityTrace deployment is missing part of its database schema.
--
-- Both were the same underlying situation — a database holding only the
-- original tables, with none of the functions, triggers, policies,
-- buckets or reference data the app has come to depend on. Being told to
-- run `supabase db push` is not much help if the CLI is not part of how
-- you deploy.
--
-- SAFE TO RUN REPEATEDLY
--
-- Verified by applying this set three times in a row to the same
-- PostgreSQL 16 database: every statement is `create or replace`,
-- `if not exists`, `drop ... if exists` first, or an upsert. The
-- reference data does not multiply — 8 departments and 6 wards after any
-- number of runs.
--
-- WHAT IT DOES NOT DO
--
-- It does not create the original tables. If the guard below stops you,
-- apply supabase/migrations/20260813064831_initial_nagriksetu_schema.sql
-- and the other 20260813 files first, in filename order.
--
-- HOW TO USE IT
--
--   1. Supabase dashboard -> SQL Editor -> New query
--   2. Paste this whole file, Run
--   3. Run supabase/diagnose.sql — everything should read `ok`
--   4. Reload the app
--
-- If you do use the CLI, `supabase db push` does the same thing and
-- records it in the migration history, which is preferable. This file is
-- the escape hatch.
-- ============================================================


-- ============================================================
-- GUARD: the original schema must already be present
-- ============================================================
-- Failing here with a readable message beats failing 400 lines in with
-- "relation public.complaints does not exist".

do $bootstrap_guard$
begin
  if to_regclass('public.complaints') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.work_orders') is null then
    raise exception
      'The original CityTrace schema is not present in this database.'
      using hint =
        'Apply supabase/migrations/20260813*.sql in filename order first, then run this file.';
  end if;
end
$bootstrap_guard$;
