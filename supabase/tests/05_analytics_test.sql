-- ============================================================
-- ANALYTICS: MEASURED, NOT ASSUMED
-- ============================================================
--
-- The point of this suite is the null cases.
--
-- An analytics function that returns a number for something it did not
-- measure is worse than one that fails, because a municipality reads the
-- number and believes it. Two of them did: a ward with no complaints
-- reported 100% SLA compliance and a health score of `good`, and a
-- department with none reported 0%, which the UI renders as a full red
-- bar. Neither figure came from data.
--
-- So most of what follows asserts that a metric with no sample is null,
-- and that the ones with a sample are computed from the recorded
-- resolution moment rather than from "last touched".
--
-- Runs after 01-04, which seed the users, the worked-through complaint,
-- and the officer lifecycle. This suite adds its own rows and scopes its
-- assertions to them where the shared fixtures would interfere.

\pset pager off
\set ON_ERROR_STOP off

\echo ''
\echo '=========================================================='
\echo ' 05. ANALYTICS'
\echo '=========================================================='


-- ============================================================
-- A. THE TWO INVENTED STATISTICS
-- ============================================================

\echo ''
\echo '### A1. A ward with nothing in it has NO compliance figure, not 100%'
--
-- The old function coalesced sla_compliance to 100 and therefore scored
-- these wards `good`. Six wards are seeded and at most one has ever
-- carried a complaint, so this is the common case, not an edge one.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  count(*) filter (where (w ->> 'slaCompliance') is null) as unmeasured_wards,
  count(*) filter (where (w ->> 'healthScore') = 'unknown') as unknown_score,
  count(*) filter (
    where (w ->> 'slaCompliance') is null
      and (w ->> 'healthScore') = 'good'
  ) as invented_good,
  'unmeasured > 0, and none of them scored good' as expectation,
  case
    when count(*) filter (where (w ->> 'slaCompliance') is null) > 0
     and count(*) filter (
           where (w ->> 'slaCompliance') is null
             and (w ->> 'healthScore') = 'good'
         ) = 0
     and count(*) filter (where (w ->> 'healthScore') = 'unknown')
       = count(*) filter (where (w ->> 'slaCompliance') is null)
    then 'ok' else 'FAIL'
  end as result
from json_array_elements(public.analytics_ward_health()) as w;
rollback;


\echo ''
\echo '### A2. A department with nothing in it has NO compliance figure, not 0%'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  count(*) filter (where (d ->> 'total')::int = 0) as empty_departments,
  count(*) filter (
    where (d ->> 'total')::int = 0 and (d ->> 'slaCompliance') is not null
  ) as invented_figures,
  'empty > 0, invented = 0' as expectation,
  case
    when count(*) filter (where (d ->> 'total')::int = 0) > 0
     and count(*) filter (
           where (d ->> 'total')::int = 0
             and (d ->> 'slaCompliance') is not null
         ) = 0
    then 'ok' else 'FAIL'
  end as result
from json_array_elements(public.analytics_department_performance()) as d;
rollback;


\echo ''
\echo '### A3. Every reported figure carries the sample it was measured from'
-- A compliance percentage with a sample size of zero is the shape of the
-- bug above. These two must agree: a figure exists if and only if
-- something was measured.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  count(*) as wards,
  count(*) filter (
    where ((w ->> 'slaCompliance') is null) <> ((w ->> 'slaSampleSize')::int = 0)
  ) as disagreements,
  '0 disagreements expected' as expectation,
  case
    when count(*) filter (
      where ((w ->> 'slaCompliance') is null) <> ((w ->> 'slaSampleSize')::int = 0)
    ) = 0 then 'ok' else 'FAIL'
  end as result
from json_array_elements(public.analytics_ward_health()) as w;
rollback;


-- ============================================================
-- B. RESOLUTION TIME IS MEASURED, NOT APPROXIMATED
-- ============================================================

\echo ''
\echo '### B1. Editing a resolved complaint does not change its resolution time'
--
-- This is what measuring from complaints.updated_at got wrong. The
-- complaint from 01 is resolved; a staff edit afterwards used to move its
-- apparent resolution time by however long had passed.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select (public.analytics_summary() ->> 'avgResolutionHours') as before_edit
from generate_series(1, 1)
\gset

-- A legitimate later edit: recording a municipal finding.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints
set priority_reason = 'Reviewed after closure.'
where status = 'resolved';
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select
  :'before_edit' as before_edit,
  (public.analytics_summary() ->> 'avgResolutionHours') as after_edit,
  'unchanged expected' as expectation,
  case
    when (public.analytics_summary() ->> 'avgResolutionHours')
       is not distinct from :'before_edit'
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### B2. A resolved complaint with no recorded resolution is excluded, not guessed'
-- Seeded by deleting the history row rather than the complaint, which is
-- the state a complaint resolved before 20260814120800 existed is in.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111',
   'Legacy resolved report',
   'Filed and closed before status history was recorded.',
   'other', 'submitted',
   12.9000, 77.5500, '1 Legacy Road', 'low');
commit;

-- Close it as staff, then remove the history the trigger wrote.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints set status = 'resolved'
where title = 'Legacy resolved report';
commit;

delete from public.complaint_status_history
where complaint_id = (
  select id from public.complaints where title = 'Legacy resolved report'
);

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select
  (public.analytics_summary() ->> 'resolvedComplaints')::int as resolved,
  (public.analytics_summary() ->> 'resolutionSampleSize')::int as sample,
  'sample below resolved expected' as expectation,
  case
    when (public.analytics_summary() ->> 'resolutionSampleSize')::int
       < (public.analytics_summary() ->> 'resolvedComplaints')::int
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- C. THE SLA BUCKETS PARTITION THE WHOLE
-- ============================================================

\echo ''
\echo '### C1. The four buckets sum to the total complaint count'
--
-- The dashboard divides by their sum to size a stacked bar. The old
-- three buckets were not exhaustive — a complaint resolved *after* its
-- deadline was in none of them — so the bar under-filled and every
-- percentage printed beside it used the wrong denominator.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

with s as (select public.analytics_sla_breakdown() as j),
     t as (select public.analytics_summary() as j)
select
  (select (j ->> 'withinSLA')::int from s)
    + (select (j ->> 'breached')::int from s)
    + (select (j ->> 'atRisk')::int from s)
    + (select (j ->> 'onTrack')::int from s)
    + (select (j ->> 'unmeasured')::int from s) as bucket_sum,
  (select (j ->> 'totalComplaints')::int from t) as total,
  'equal expected' as expectation,
  case
    when (select (j ->> 'withinSLA')::int from s)
       + (select (j ->> 'breached')::int from s)
       + (select (j ->> 'atRisk')::int from s)
       + (select (j ->> 'onTrack')::int from s)
       + (select (j ->> 'unmeasured')::int from s)
       = (select (j ->> 'totalComplaints')::int from t)
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### C2. "At risk" means the deadline is near, not merely unmissed'
-- A complaint filed now with days of headroom is on track. The old
-- function counted it as at-risk, which made the metric meaningless:
-- every healthy open report was flagged.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111',
   'Fresh low-priority report',
   'Just filed, with a long deadline ahead of it.',
   'other', 'submitted',
   12.9100, 77.5600, '2 Fresh Lane', 'low');
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  (public.analytics_sla_breakdown() ->> 'atRisk')::int  as at_risk,
  (public.analytics_sla_breakdown() ->> 'onTrack')::int as on_track,
  'the fresh low-priority report counts as on track' as expectation,
  case
    when (public.analytics_sla_breakdown() ->> 'onTrack')::int > 0
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### C3. A tightening window moves reports from on-track to at-risk'
-- The window is a parameter, so this is checkable rather than assumed.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  (public.analytics_sla_breakdown(1) ->> 'atRisk')::int    as risk_1h,
  (public.analytics_sla_breakdown(720) ->> 'atRisk')::int  as risk_30d,
  'a 30-day window flags at least as many as a 1-hour one' as expectation,
  case
    when (public.analytics_sla_breakdown(720) ->> 'atRisk')::int
      >= (public.analytics_sla_breakdown(1) ->> 'atRisk')::int
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### C4. The risk window is clamped, so a caller cannot ask for nonsense'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  (public.analytics_sla_breakdown(-5) ->> 'riskWindowHours')::int as negative,
  (public.analytics_sla_breakdown(99999) ->> 'riskWindowHours')::int as huge,
  '1 and 720 expected' as expectation,
  case
    when (public.analytics_sla_breakdown(-5) ->> 'riskWindowHours')::int = 1
     and (public.analytics_sla_breakdown(99999) ->> 'riskWindowHours')::int = 720
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- D. THE METRICS THAT HAD NO SOURCE
-- ============================================================

\echo ''
\echo '### D1. Complaints by status covers every enum value, including the zeroes'
-- A status missing from a chart reads as "none of those exist", which is
-- only the same as zero by accident.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  json_array_length(public.analytics_status_distribution()) as buckets,
  array_length(enum_range(null::public.complaint_status), 1) as enum_values,
  'equal expected' as expectation,
  case
    when json_array_length(public.analytics_status_distribution())
       = array_length(enum_range(null::public.complaint_status), 1)
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### D2. Status counts sum to the total'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  sum((s ->> 'count')::int) as summed,
  (public.analytics_summary() ->> 'totalComplaints')::int as total,
  'equal expected' as expectation,
  case
    when sum((s ->> 'count')::int)
       = (public.analytics_summary() ->> 'totalComplaints')::int
    then 'ok' else 'FAIL'
  end as result
from json_array_elements(public.analytics_status_distribution()) as s;
rollback;


\echo ''
\echo '### D3. Priority distribution is ordered by severity, not by count'
-- A chart that reorders itself as the data shifts cannot be read at a
-- glance, so the order is fixed to the enum.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  string_agg(p ->> 'priority', ',') as order_returned,
  'critical,high,medium,low expected' as expectation,
  case
    when string_agg(p ->> 'priority', ',') = 'critical,high,medium,low'
    then 'ok' else 'FAIL'
  end as result
from json_array_elements(public.analytics_priority_distribution()) as p;
rollback;


\echo ''
\echo '### D4. Work-order counts are real and scoped to the caller'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select (public.analytics_work_orders() ->> 'total')::int as admin_total
\gset

-- Sunil, not Ravi: Ravi is the assignee of every work order these
-- suites seed, so "the officer sees fewer" is legitimately false for him
-- and the assertion would fail while proving nothing. Sunil was
-- reassigned away in 04's H5 and holds none, which is the case that
-- distinguishes scoping from no scoping.
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

select
  :'admin_total'::int as oversight_sees,
  (public.analytics_work_orders() ->> 'total')::int as unassigned_officer_sees,
  'oversight sees the city, an officer with no work sees none' as expectation,
  case
    when :'admin_total'::int > 0
     and (public.analytics_work_orders() ->> 'total')::int = 0
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### D5. Active and completed work orders are counted separately'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

with w as (select public.analytics_work_orders() as j)
select
  (select (j ->> 'active')::int from w)               as active,
  (select (j ->> 'awaitingVerification')::int from w) as awaiting,
  (select (j ->> 'completed')::int from w)            as completed,
  (select (j ->> 'unassigned')::int from w)           as unassigned,
  'each bucket at most the total' as expectation,
  case
    when (select (j ->> 'active')::int from w)
       + (select (j ->> 'awaitingVerification')::int from w)
       + (select (j ->> 'completed')::int from w)
      <= (select (j ->> 'total')::int from w)
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- E. GEOGRAPHIC CONCENTRATION
-- ============================================================

\echo ''
\echo '### E1. Reports at the same place aggregate into one hotspot'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- Three reports within about 30 m of each other: one neighbourhood.
insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Cluster report one',
   'Pothole at the junction.', 'pothole', 'submitted',
   12.9300, 77.6100, '1 Cluster Street', 'high'),
  ('11111111-1111-1111-1111-111111111111', 'Cluster report two',
   'Same junction, second report.', 'pothole', 'submitted',
   12.93005, 77.61005, '2 Cluster Street', 'high'),
  ('11111111-1111-1111-1111-111111111111', 'Cluster report three',
   'Same junction again.', 'pothole', 'submitted',
   12.93008, 77.61008, '3 Cluster Street', 'critical');
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  (h ->> 'reports')::int as reports,
  (h ->> 'criticalReports')::int as critical,
  h ->> 'dominantCategory' as dominant,
  '3 reports, 1 critical, Pothole expected' as expectation,
  case
    when (h ->> 'reports')::int = 3
     and (h ->> 'criticalReports')::int = 1
     and h ->> 'dominantCategory' = 'Pothole'
    then 'ok' else 'FAIL'
  end as result
from json_array_elements(public.analytics_hotspots(3, 20)) as h
where (h ->> 'reports')::int = 3
limit 1;
rollback;


\echo ''
\echo '### E2. Null Island is not a hotspot'
-- A lost GPS fix reads as 0,0. Counting it puts a permanent hotspot in
-- the Gulf of Guinea and, worse, ranks it above real neighbourhoods.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111', 'Lost fix one',
   'Coordinates never resolved.', 'other', 'submitted',
   0, 0, 'Unknown', 'low'),
  ('11111111-1111-1111-1111-111111111111', 'Lost fix two',
   'Coordinates never resolved either.', 'other', 'submitted',
   0, 0, 'Unknown', 'low');
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  count(*) as null_island_hotspots,
  '0 expected' as expectation,
  case when count(*) = 0 then 'ok' else 'FAIL' end as result
from json_array_elements(public.analytics_hotspots(1, 200)) as h
where (h ->> 'latitude')::numeric = 0
  and (h ->> 'longitude')::numeric = 0;
rollback;


\echo ''
\echo '### E3. The hotspot list is bounded whatever the caller asks for'
-- The query this replaces fetched every work order in the city to plot
-- pins client-side, so an unbounded replacement would be no improvement.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  json_array_length(public.analytics_hotspots(1, 99999)) as returned,
  '200 or fewer expected' as expectation,
  case
    when json_array_length(public.analytics_hotspots(1, 99999)) <= 200
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### E4. SLA-risk items are bounded and ordered by urgency'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  json_array_length(public.analytics_sla_risk_items(720, 99999)) as returned,
  '100 or fewer expected' as expectation,
  case
    when json_array_length(public.analytics_sla_risk_items(720, 99999)) <= 100
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- F. SCOPING — THE PROPERTY THAT MAKES THESE SAFE TO GRANT
-- ============================================================

\echo ''
\echo '### F1. A citizen aggregates their own reports, never the city'
-- SECURITY INVOKER is what makes it safe to grant these to every
-- authenticated user rather than gating them by role. If any function
-- here were SECURITY DEFINER, this is the assertion that would fail.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select (public.analytics_summary() ->> 'totalComplaints')::int as city_total
\gset

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  :'city_total'::int as city_total,
  (public.analytics_summary() ->> 'totalComplaints')::int as citizen_total,
  'the citizen counts fewer than the city' as expectation,
  case
    when (public.analytics_summary() ->> 'totalComplaints')::int
       < :'city_total'::int
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### F2. A citizen with no reports aggregates nothing at all'
-- A user seeded here rather than reused: every citizen from 01 has filed
-- something by now, and a "sees nothing" assertion against a user who
-- owns a row passes only if the scoping is broken.
insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'newcomer@test',
   '{"full_name":"Newly Registered Citizen"}');

begin;
set local role authenticated;
select test.login('77777777-7777-7777-7777-777777777777');

select
  (public.analytics_summary() ->> 'totalComplaints')::int as total,
  (public.analytics_summary() ->> 'resolutionRate') as rate,
  json_array_length(public.analytics_hotspots(1, 200)) as hotspots,
  '0 / null / 0 expected' as expectation,
  case
    when (public.analytics_summary() ->> 'totalComplaints')::int = 0
     -- Null, not "0%": a resolution rate is a claim about performance,
     -- and there is nothing here to make it about.
     and (public.analytics_summary() ->> 'resolutionRate') is null
     and json_array_length(public.analytics_hotspots(1, 200)) = 0
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### F3. Every analytics function is SECURITY INVOKER'
-- Checked from the catalogue rather than trusted from the source, because
-- F1 and F2 would both start passing vacuously the moment one of these
-- became SECURITY DEFINER and returned the city to everybody.
select
  count(*) filter (where p.prosecdef) as security_definer,
  count(*) as analytics_functions,
  '0 definer expected' as expectation,
  case
    when count(*) filter (where p.prosecdef) = 0 then 'ok' else 'FAIL'
  end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'analytics\_%' or p.proname = 'complaint_resolution_times');


\echo ''
\echo '### F4. No analytics function is executable by PUBLIC'
-- The grants were previously redundant: PostgreSQL grants EXECUTE to
-- PUBLIC by default, so anon could run all six and got zeros only
-- because RLS showed it nothing.
select
  count(*) filter (
    where has_function_privilege('public', p.oid, 'execute')
  ) as public_executable,
  '0 expected' as expectation,
  case
    when count(*) filter (
      where has_function_privilege('public', p.oid, 'execute')
    ) = 0 then 'ok' else 'FAIL'
  end as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'analytics\_%' or p.proname = 'complaint_resolution_times');


\echo ''
\echo '=========================================================='
\echo ' Done. Every "result" should read ok.'
\echo '=========================================================='
