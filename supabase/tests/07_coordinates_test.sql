-- ============================================================
-- COORDINATE INTEGRITY
-- ============================================================
--
-- `submit_complaint()` has validated coordinates since 20260814120800.
-- The point of this suite is the paths that do not go through it:
--
--   * services/complaints.ts's `submitThroughInsert()`, the documented
--     fallback for a deployment whose migrations are behind
--   * any hand-written PostgREST insert, which every browser can make
--
-- Both wrote to public.complaints directly, so the rule lived in one code
-- path rather than in the column. Every negative case below is therefore a
-- direct INSERT or UPDATE, because that is the writer that was unchecked.
--
-- Runs after 01-06, which seed the users this reuses.

\pset pager off
\set ON_ERROR_STOP off

\echo ''
\echo '=========================================================='
\echo ' 07. COORDINATE INTEGRITY'
\echo '=========================================================='


-- ============================================================
-- A. THE CONSTRAINTS EXIST AND ARE ENFORCED
-- ============================================================

\echo ''
\echo '### A1. All four constraints exist, and are validated not merely declared'
--
-- `not valid` is how they are added, to avoid locking a live table; a
-- constraint left unvalidated would still be enforced for new writes but
-- would mean existing rows were never checked. On a clean database the
-- validation pass must have succeeded.
select
  count(*) as constraints_present,
  count(*) filter (where convalidated) as validated,
  '4 present, 4 validated expected' as expectation,
  case
    when count(*) = 4 and count(*) filter (where convalidated) = 4
    then 'ok' else 'FAIL'
  end as result
from pg_constraint
where conrelid = 'public.complaints'::regclass
  and conname in (
    'complaints_latitude_range',
    'complaints_longitude_range',
    'complaints_coordinates_paired',
    'complaints_not_null_island'
  );


-- ============================================================
-- B. WHAT A DIRECT INSERT CAN NO LONGER DO
-- ============================================================
-- Each of these was accepted before. The RPC would have refused them; the
-- table did not.

\echo ''
\echo '### B1. A latitude beyond 90 is refused'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- EXPECTED ERROR: complaints_latitude_range
insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Impossible latitude',
   'Filed with a latitude no point on Earth has.', 'other', 'submitted',
   999, 77.5, '1 Nowhere Road', 'low');
rollback;
\echo '(expected: check constraint violation)'


\echo ''
\echo '### B2. A longitude beyond 180 is refused'
--
-- This is the antimeridian artefact Leaflet produces: panning east across
-- the date line and clicking yields ~+540 for a place at ~-180. The client
-- now wraps it at the point of entry; this is what makes a client that
-- does not still fail safely.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- EXPECTED ERROR: complaints_longitude_range
insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Wrapped longitude',
   'Filed from a wrapped copy of the world.', 'other', 'submitted',
   12.97, 540, '1 Antimeridian Way', 'low');
rollback;
\echo '(expected: check constraint violation)'


\echo ''
\echo '### B3. Null Island is refused'
-- 0,0 is what a failed GPS read looks like, and is indistinguishable from
-- it: no fix, an empty string parsed, and a zeroed struct all produce it.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- EXPECTED ERROR: complaints_not_null_island
insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Failed GPS read',
   'The device never got a fix.', 'other', 'submitted',
   0, 0, '1 Gulf of Guinea', 'low');
rollback;
\echo '(expected: check constraint violation)'


\echo ''
\echo '### B4. A latitude with no longitude is refused'
-- Half a coordinate is not a location, and it is what a
-- partially-populated insert produces. Nothing can plot it, so storing it
-- means a row that looks located and is not.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- EXPECTED ERROR: complaints_coordinates_paired
insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Half a location',
   'Latitude only.', 'other', 'submitted',
   12.97, null, '1 Half Road', 'low');
rollback;
\echo '(expected: check constraint violation)'


\echo ''
\echo '### B5. An UPDATE cannot move a complaint off the planet either'
-- The constraint covers writes, not just inserts. A staff member with
-- permission to edit a complaint should not be able to relocate it to a
-- latitude that does not exist.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

-- EXPECTED ERROR: complaints_latitude_range
update public.complaints
set latitude = -200
where title = 'Streetlight out on Palm Grove';
rollback;
\echo '(expected: check constraint violation)'


-- ============================================================
-- C. WHAT IS STILL ALLOWED
-- ============================================================
-- A constraint that also blocks legitimate data is worse than none.

\echo ''
\echo '### C1. A complaint with no coordinates at all is allowed'
-- Nullable on purpose: a report filed without a location is a real case,
-- and the maps now say "No location recorded" for it rather than drawing
-- it in the wrong ocean.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'No location given',
   'Filed without capturing a location.', 'other', 'submitted',
   null, null, 'Somewhere on the ring road', 'low');

select
  count(*) as filed,
  '1 expected' as expectation,
  case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.complaints where title = 'No location given';
rollback;


\echo ''
\echo '### C2. The exact bounds are inside the range, not outside it'
-- ±90 and ±180 are real places — the poles and the antimeridian — so an
-- off-by-one in the constraint would reject valid coordinates.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'South Pole report',
   'The edge of the latitude range.', 'other', 'submitted',
   -90, 180, 'Amundsen-Scott', 'low'),
  ('11111111-1111-1111-1111-111111111111', 'North Pole report',
   'The other edge.', 'other', 'submitted',
   90, -180, 'Somewhere north', 'low');

select
  count(*) as filed,
  '2 expected' as expectation,
  case when count(*) = 2 then 'ok' else 'FAIL' end as result
from public.complaints where title like '% Pole report';
rollback;


\echo ''
\echo '### C3. A coordinate on one axis only being zero is fine'
-- The equator and the prime meridian are real. Only *both* being zero is
-- the failed-read signature, and a constraint that rejected either would
-- refuse reports from Ghana and Indonesia.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'On the equator',
   'Latitude zero, longitude not.', 'other', 'submitted',
   0, 77.5946, 'Equatorial road', 'low'),
  ('11111111-1111-1111-1111-111111111111', 'On the prime meridian',
   'Longitude zero, latitude not.', 'other', 'submitted',
   51.4778, 0, 'Greenwich', 'low');

select
  count(*) as filed,
  '2 expected' as expectation,
  case when count(*) = 2 then 'ok' else 'FAIL' end as result
from public.complaints
where title in ('On the equator', 'On the prime meridian');
rollback;


-- ============================================================
-- D. PRECISION IS NOT LOST
-- ============================================================

\echo ''
\echo '### D1. The columns are double precision, not a rounded numeric'
--
-- Pinned deliberately. `numeric(9,6)` looks tidier and would silently
-- round every stored fix; `double precision` carries 15-17 significant
-- digits, which is far more than coordinates need.
select
  format_type(a.atttypid, a.atttypmod) as type,
  'double precision expected' as expectation,
  case
    when format_type(a.atttypid, a.atttypmod) = 'double precision'
    then 'ok' else 'FAIL'
  end as result
from pg_attribute a
where a.attrelid = 'public.complaints'::regclass
  and a.attname = 'latitude';


\echo ''
\echo '### D2. Six decimal places survive a round trip unchanged'
--
-- Six places is ~0.11 m and is what the UI displays. If the column
-- rounded, the coordinate an officer navigates to would not be the
-- coordinate the citizen placed.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Precision probe',
   'Stored to six decimal places.', 'other', 'submitted',
   12.971598, 77.594562, '1 Precision Street', 'low');

select
  latitude,
  longitude,
  '12.971598 / 77.594562 expected' as expectation,
  case
    when latitude = 12.971598 and longitude = 77.594562
    then 'ok' else 'FAIL'
  end as result
from public.complaints where title = 'Precision probe';
rollback;


\echo ''
\echo '### D3. Latitude and longitude are not transposed on the way in'
--
-- The classic geospatial bug, and the reason to test it here: 77 is a
-- valid latitude, so transposing Bangalore's coordinates produces a
-- perfectly acceptable row in the Arctic Ocean and no error anywhere. The
-- only way to catch it is to assert which column holds which.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Order probe',
   'Bangalore: latitude ~12.97, longitude ~77.59.', 'other', 'submitted',
   12.9716, 77.5946, '1 Order Street', 'low');

select
  latitude,
  longitude,
  'latitude is the smaller one here' as expectation,
  case
    when latitude between 12 and 13 and longitude between 77 and 78
    then 'ok' else 'FAIL'
  end as result
from public.complaints where title = 'Order probe';
rollback;


\echo ''
\echo '### D4. submit_complaint() stores the arguments in the right columns'
--
-- The same check one layer up. A transposition inside the RPC's INSERT
-- would be invisible to every test that only reads back what it wrote
-- through the same function.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select public.submit_complaint(
  p_title           => 'RPC order probe',
  p_description     => 'Filed through the function, checked on the column.',
  p_category        => 'other',
  p_latitude        => 12.9716,
  p_longitude       => 77.5946,
  p_address         => '2 Order Street',
  p_submission_key  => gen_random_uuid()
);

select
  latitude,
  longitude,
  'latitude ~12.97, longitude ~77.59 expected' as expectation,
  case
    when latitude between 12 and 13 and longitude between 77 and 78
    then 'ok' else 'FAIL'
  end as result
from public.complaints where title = 'RPC order probe';
rollback;


-- ============================================================
-- E. THE SHARED PREDICATE
-- ============================================================

\echo ''
\echo '### E1. is_valid_coordinate agrees with the constraints'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  public.is_valid_coordinate(12.97, 77.59) as bangalore,
  public.is_valid_coordinate(0, 0) as null_island,
  public.is_valid_coordinate(999, 77.59) as bad_latitude,
  public.is_valid_coordinate(12.97, 540) as wrapped_longitude,
  public.is_valid_coordinate(null, 77.59) as half_a_pair,
  public.is_valid_coordinate(0, 77.59) as on_the_equator,
  public.is_valid_coordinate(-90, 180) as at_the_bounds,
  'true, false, false, false, false, true, true expected' as expectation,
  case
    when public.is_valid_coordinate(12.97, 77.59)
     and not public.is_valid_coordinate(0, 0)
     and not public.is_valid_coordinate(999, 77.59)
     and not public.is_valid_coordinate(12.97, 540)
     and not public.is_valid_coordinate(null, 77.59)
     and public.is_valid_coordinate(0, 77.59)
     and public.is_valid_coordinate(-90, 180)
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '=========================================================='
\echo ' Done. Every "result" should read ok; the ERRORs annotated'
\echo ' as EXPECTED are the negative cases.'
\echo '=========================================================='
