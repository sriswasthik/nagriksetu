-- ============================================================
-- COORDINATE INTEGRITY
-- ============================================================
--
-- `submit_complaint()` validates latitude and longitude — range, finite,
-- and not 0,0 — and has since 20260814120800. But it is a function, and
-- a function only validates what goes through it.
--
-- Two paths do not:
--
--   * `submitThroughInsert()` in services/complaints.ts, the documented
--     fallback for a deployment whose migrations are behind. It writes to
--     public.complaints directly.
--
--   * Any hand-written PostgREST call. The publishable key is in every
--     browser, and the complaints INSERT policy checks who is filing,
--     not where.
--
-- So the rule lived in one code path rather than in the column, and a
-- direct insert of latitude 999 was accepted. A CHECK constraint is where
-- a fact about the data belongs: it applies to every writer, including
-- the ones written later.
--
--
-- WHY 0,0 IS REJECTED AND NOT STORED AS NULL
--
-- Null Island is in the Gulf of Guinea. Nobody reports a pothole there,
-- and a failed GPS read is indistinguishable from it — a device with no
-- fix, a parse of an empty string, and a default-initialised struct all
-- produce 0,0.
--
-- Rejecting rather than silently nulling: a client that thinks it
-- recorded a location should be told it did not, at the point it tried,
-- rather than discovering later that the complaint has no location. The
-- same reasoning as the work-order timestamps in 20260816120000.
--
-- This is the database half of a rule the client now also applies (see
-- src/lib/geo/coordinates.ts) — not a duplicate of it. The client's job
-- is to say so before the citizen has filled in the rest of the form;
-- this is what makes it true.
--
--
-- NUMERIC PRECISION
--
-- The columns are `double precision`, which carries 15-17 significant
-- digits — far more than coordinates need. Six decimal places is ~0.11 m
-- at the equator and finer than any consumer GPS, so nothing is lost
-- storing a fix at full precision and the client formats to six places
-- for display. No change needed; recorded here because it is the kind of
-- thing that gets "fixed" into `numeric(9,6)` by someone who has not
-- checked, which would silently round every existing row.
-- ============================================================


-- ============================================================
-- 1. COMPLAINTS
-- ============================================================
-- Both columns are nullable — a complaint may legitimately have no
-- recorded location — so each check has to permit null and constrain the
-- value only when there is one.
--
-- `not valid` first, then validated separately: on a table with existing
-- rows this avoids a full-table ACCESS EXCLUSIVE lock at add time, and
-- the validation pass takes only a SHARE UPDATE EXCLUSIVE. On an empty
-- database it makes no difference; on a live one it is the difference
-- between a blocked deployment and a background scan.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'complaints_latitude_range'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_latitude_range
      check (latitude is null or (latitude >= -90 and latitude <= 90))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'complaints_longitude_range'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_longitude_range
      check (longitude is null or (longitude >= -180 and longitude <= 180))
      not valid;
  end if;

  /*
   * Coordinates come as a pair or not at all.
   *
   * A latitude with no longitude is not a location, and it is what a
   * partially-populated insert produces. Nothing could plot it, so
   * storing it means a row that looks located and is not.
   */
  if not exists (
    select 1 from pg_constraint
    where conname = 'complaints_coordinates_paired'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_coordinates_paired
      check ((latitude is null) = (longitude is null))
      not valid;
  end if;

  -- Null Island. See the header.
  if not exists (
    select 1 from pg_constraint
    where conname = 'complaints_not_null_island'
      and conrelid = 'public.complaints'::regclass
  ) then
    alter table public.complaints
      add constraint complaints_not_null_island
      check (
        latitude is null
        or longitude is null
        or not (latitude = 0 and longitude = 0)
      )
      not valid;
  end if;
end
$$;


/*
 * Validate the constraints against existing rows.
 *
 * Wrapped so a database that already holds an out-of-range or 0,0
 * complaint — filed through the fallback path before this existed — does
 * not fail the whole migration. The constraint stays in place and
 * enforced for every new write either way; `not valid` means exactly
 * that, and an operator can find and correct the offending rows with
 * supabase/diagnose.sql.
 */
do $$
declare
  constraint_name text;
begin
  foreach constraint_name in array array[
    'complaints_latitude_range',
    'complaints_longitude_range',
    'complaints_coordinates_paired',
    'complaints_not_null_island'
  ]
  loop
    begin
      execute format(
        'alter table public.complaints validate constraint %I',
        constraint_name
      );
    exception
      when check_violation then
        raise warning
          'Existing complaints violate %; it is enforced for new writes only. Find them with supabase/diagnose.sql.',
          constraint_name;
    end;
  end loop;
end
$$;


-- ============================================================
-- 2. THE SAME RULE, REUSABLE
-- ============================================================
-- So a query can ask "is this a place" without restating the four
-- conditions, and so the analytics and hotspot functions that already
-- exclude Null Island by hand have one definition to point at.

create or replace function public.is_valid_coordinate(
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_latitude is not null
    and p_longitude is not null
    and p_latitude >= -90 and p_latitude <= 90
    and p_longitude >= -180 and p_longitude <= 180
    -- A failed GPS read, not a location in the Gulf of Guinea.
    and not (p_latitude = 0 and p_longitude = 0);
$$;

comment on function public.is_valid_coordinate is
  'Whether a coordinate pair names somewhere a report could be. Mirrors the complaints CHECK constraints and src/lib/geo/coordinates.ts.';

revoke all on function public.is_valid_coordinate(
  double precision, double precision
) from public;
grant execute on function public.is_valid_coordinate(
  double precision, double precision
) to authenticated;


notify pgrst, 'reload schema';
