-- ============================================================
-- AUTHENTICATION AND AUTHORIZATION BOUNDARY
-- ============================================================
--
-- Asserts the rules that decide who may read and write what, at the
-- database boundary — the only boundary a direct PostgREST call has to
-- get past. Route protection in proxy.ts and the workspace layouts sits
-- in front of this, but a caller with the publishable key can skip all
-- of it, so these are the checks that actually matter.
--
-- Runs after 01_rls_smoke_test.sql, which seeds the users and the
-- worked-through complaint this file reuses:
--
--   citizen@test     citizen           reported the complaint
--   officer@test     officer           assigned to its work order
--   supervisor@test  supervisor
--   admin@test       government_admin
--   bystander@test   officer           unrelated to any of it
--
-- Every negative case is written as "the attempt happens, then we look
-- at what actually changed". A test that only checks for an error can
-- pass because the SQL was malformed; these check the row.
--
-- `ok` in the result column means the rule holds.

\pset pager off
\set ON_ERROR_STOP off


-- ============================================================
-- A. UNAUTHENTICATED ACCESS
-- ============================================================
-- The stub grants `anon` the same table privileges Supabase does, so a
-- denial here is row-level security and not a missing GRANT.

\echo ''
\echo '### A1. An anonymous caller can read nothing'
begin;
set local role anon;
select
  (select count(*) from public.complaints)        as complaints,
  (select count(*) from public.profiles)          as profiles,
  (select count(*) from public.work_orders)       as work_orders,
  (select count(*) from public.resolution_proofs) as proofs,
  'all 0 expected' as expectation,
  case
    when (select count(*) from public.complaints) = 0
     and (select count(*) from public.profiles) = 0
     and (select count(*) from public.work_orders) = 0
     and (select count(*) from public.resolution_proofs) = 0
    then 'ok' else 'FAIL'
  end as result;
rollback;

\echo ''
\echo '### A2. An anonymous caller cannot file a complaint as somebody else'
begin;
set local role anon;
insert into public.complaints (citizen_id, title, description, category, status)
values ('11111111-1111-1111-1111-111111111111','anon','x','other','submitted');
rollback;
\echo '(expected: row-level security violation)'

\echo ''
\echo '### A3. An anonymous caller cannot call the analytics functions usefully'
begin;
set local role anon;
select (public.analytics_summary() ->> 'totalComplaints') as anon_total,
       '0 expected' as expectation,
       case when (public.analytics_summary() ->> 'totalComplaints') = '0'
            then 'ok' else 'FAIL' end as result;
rollback;


-- ============================================================
-- B. CITIZEN CONFINEMENT
-- ============================================================

\echo ''
\echo '### B1. A citizen sees only their own complaint, profile and work orders'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select
  (select count(*) from public.complaints)  as complaints,
  (select count(*) from public.profiles)    as profiles,
  (select count(*) from public.audit_logs)  as audit_logs,
  '1 / 1 / 0 expected' as expectation,
  case
    when (select count(*) from public.complaints) = 1
     and (select count(*) from public.profiles) = 1
     and (select count(*) from public.audit_logs) = 0
    then 'ok' else 'FAIL'
  end as result;
commit;

\echo ''
\echo '### B2. A citizen cannot read operational data'
-- departments and wards are readable on purpose: the report form and the
-- authority filters need the reference lists, and they hold no personal
-- data. Everything with municipal content is closed.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select
  (select count(*) from public.verifications)       as verifications,
  (select count(*) from public.work_order_updates)  as work_order_updates,
  'own complaint only, so both > 0 is expected here' as note;
select
  (select count(*) from public.profiles where id <> '11111111-1111-1111-1111-111111111111') as other_profiles,
  '0 expected' as expectation,
  case when (select count(*) from public.profiles where id <> '11111111-1111-1111-1111-111111111111') = 0
       then 'ok' else 'FAIL' end as result;
commit;

\echo ''
\echo '### B3. A citizen cannot close their own complaint or rewrite its triage'
-- The acute one: analytics_summary() counts `resolved` and compares
-- updated_at against sla_due_at, so this was a route to inflating the
-- city's published resolution rate and SLA compliance from a browser.
-- Deliberately a status the complaint is not already at: an UPDATE that
-- sets a column to the value it already holds is not `distinct from` its
-- old value, so the trigger correctly ignores it and the test would pass
-- without proving anything.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints set status = 'in_progress';
select status::text as still, 'resolved expected (unchanged)' as expectation,
       case when status = 'resolved' then 'ok' else 'FAIL' end as result
from public.complaints;
rollback;
\echo '(expected: a citizen may only reopen)'

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints set priority_level = 'critical', priority_score = 100;
rollback;
\echo '(expected: only municipal staff may change priority)'

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints set sla_due_at = now() + interval '999 days';
rollback;
\echo '(expected: only municipal staff may change the SLA)'

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints set ai_confidence = 1, ai_reasoning = 'forged';
rollback;
\echo '(expected: AI fields are not citizen-writable)'

\echo ''
\echo '### B3b. A citizen CAN reopen a repair they are not satisfied with'
-- The whole point of the confirmation stage: a closed ticket should only
-- stick if the problem is actually gone.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints set status = 'reopened';
select status::text, 'reopened expected' as expectation,
       case when status = 'reopened' then 'ok' else 'FAIL' end as result
from public.complaints;
rollback;

\echo ''
\echo '### B4. A citizen CAN still correct their own report text'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints
   set title = 'Pothole on 5th Cross (corrected)',
       description = 'Deeper than first reported',
       address = '5th Cross, near the bus stop';
select title, 'corrected title expected' as expectation,
       case when title like '%corrected%' then 'ok' else 'FAIL' end as result
from public.complaints;
rollback;

\echo ''
\echo '### B5. A citizen cannot transfer their complaint to another user'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.complaints set citizen_id = '55555555-5555-5555-5555-555555555555';
rollback;
\echo '(expected: identity and reporter cannot be changed)'

\echo ''
\echo '### B6. A citizen cannot file a complaint in another citizen''s name (IDOR)'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
insert into public.complaints (citizen_id, title, description, category, status)
values ('55555555-5555-5555-5555-555555555555','IDOR','x','other','submitted');
rollback;
\echo '(expected: row-level security violation)'

\echo ''
\echo '### B7. A citizen cannot forge an audit entry or a notification'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
insert into public.work_order_updates (work_order_id, status, note, created_by)
select id, 'resolved', 'forged', '22222222-2222-2222-2222-222222222222'
from public.work_orders;
rollback;
\echo '(expected: row-level security violation)'

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
insert into public.notifications (user_id, title, message)
values ('55555555-5555-5555-5555-555555555555','fake','fake');
rollback;
\echo '(expected: row-level security violation)'

\echo ''
\echo '### B8. A citizen cannot edit another user''s profile'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
with u as (
  update public.profiles set full_name = 'HACKED'
  where id = '22222222-2222-2222-2222-222222222222' returning 1
)
select count(*) as rows_changed, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from u;
rollback;


-- ============================================================
-- C. OFFICER CONFINEMENT
-- ============================================================

\echo ''
\echo '### C1. An unrelated officer cannot see another officer''s work order'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
select count(*) as visible, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.work_orders
where officer_id = '22222222-2222-2222-2222-222222222222';
commit;

\echo ''
\echo '### C2. An unrelated officer cannot take another officer''s work order'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
with u as (
  update public.work_orders set officer_id = '55555555-5555-5555-5555-555555555555'
  returning 1
)
select count(*) as stolen, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from u;
rollback;

\echo ''
\echo '### C3. The assigned officer cannot hand their work order to somebody else'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
update public.work_orders set officer_id = '55555555-5555-5555-5555-555555555555';
rollback;
\echo '(expected: only a supervisor or administrator may reassign)'

\echo ''
\echo '### C4. The assigned officer cannot repoint their work order at another complaint'
-- updateWorkOrderStatus() syncs the parent complaint after every
-- transition, so this was a way to mark an unrelated citizen's report
-- resolved.
begin;
reset role;
insert into public.complaints (citizen_id, title, description, category, status)
values ('55555555-5555-5555-5555-555555555555','Unrelated report','x','other','submitted');
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
update public.work_orders
   set complaint_id = (select id from public.complaints where title = 'Unrelated report');
rollback;
\echo '(expected: a work order cannot be moved to another complaint)'

\echo ''
\echo '### C5. An officer cannot rewrite the citizen''s account of the issue'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
update public.complaints set description = 'REWRITTEN BY OFFICER';
rollback;
\echo '(expected: only the reporting citizen may edit the report text)'

\echo ''
\echo '### C6. An officer CAN still do their job'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
update public.work_orders set status = 'in_progress';
update public.complaints set status = 'in_progress', priority_level = 'high';
select
  (select status::text from public.work_orders) as work_order,
  (select status::text from public.complaints)  as complaint,
  'in_progress / in_progress expected' as expectation,
  case
    when (select status::text from public.work_orders) = 'in_progress'
     and (select status::text from public.complaints) = 'in_progress'
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- D. AUTHORITY LIMITS
-- ============================================================

\echo ''
\echo '### D1. An administrator cannot transfer a complaint to another citizen'
-- This was the worst of the staff-side findings: it removes a report
-- from the real reporter's dashboard and hands it, with its photographs,
-- to someone else.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints set citizen_id = '55555555-5555-5555-5555-555555555555';
rollback;
\echo '(expected: identity and reporter cannot be changed)'

\echo ''
\echo '### D2. An administrator cannot rewrite the citizen''s words'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints set title = 'REWRITTEN BY STAFF';
rollback;
\echo '(expected: only the reporting citizen may edit the report text)'

\echo ''
\echo '### D3. An administrator CAN triage'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints
   set priority_level = 'critical',
       department_id = (select id from public.departments where code = 'ROADS'),
       ward_id = (select id from public.wards order by code limit 1);
select priority_level::text,
       (department_id is not null) as routed,
       'critical / true expected' as expectation,
       case when priority_level = 'critical' and department_id is not null
            then 'ok' else 'FAIL' end as result
from public.complaints;
rollback;

\echo ''
\echo '### D4. Nobody can change a complaint number or backdate a submission'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints set complaint_number = 'NS-1999-000001';
rollback;
\echo '(expected: identity cannot be changed)'

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints set created_at = '1999-01-01';
rollback;
\echo '(expected: identity cannot be changed)'


-- ============================================================
-- E. THE TRIAGE WRITE PATH
-- ============================================================
-- The classifier runs in the citizen's browser, so the triage columns
-- have exactly one legitimate caller-facing entry point.

\echo ''
\echo '### E1. The reporting citizen may triage their complaint once'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select
  (public.apply_complaint_triage(
    (select id from public.complaints),
    'pothole', 'high', 70, 'Heavy footfall route', 'ROADS',
    'road_damage', 'high', 'P2', 'roads_infrastructure',
    0.82, 'Pothole on a busy crossing', 'Matched road-damage keywords',
    false, null, 'citytrace-mock-ai-v2'
  )).priority_level::text as applied,
  'high expected' as expectation;

select
  priority_level::text,
  (ai_processed_at is not null) as stamped,
  (department_id is not null) as routed,
  round(extract(epoch from (sla_due_at - created_at)) / 3600) as sla_hours,
  '48h expected for high, derived not supplied' as expectation,
  case
    when priority_level = 'high'
     and ai_processed_at is not null
     and department_id is not null
     and round(extract(epoch from (sla_due_at - created_at)) / 3600) = 48
    then 'ok' else 'FAIL'
  end as result
from public.complaints;
rollback;

\echo ''
\echo '### E2. ...but not twice — no re-rolling for a better priority'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select (public.apply_complaint_triage(
  (select id from public.complaints),
  'pothole', 'medium', 40, 'first', 'ROADS',
  'road_damage','medium','P3','roads_infrastructure',
  0.5,'s','r',false,null,'citytrace-mock-ai-v2')).id is not null as first_call_ok;

select public.apply_complaint_triage(
  (select id from public.complaints),
  'pothole', 'critical', 100, 'second', 'ROADS',
  'road_damage','critical','P1','roads_infrastructure',
  0.9,'s','r',false,null,'citytrace-mock-ai-v2');
rollback;
\echo '(expected: first call succeeds, second raises "already been triaged")'

\echo ''
\echo '### E3. An unrelated citizen cannot triage somebody else''s complaint'
-- bystander@test is a citizen with no connection to this complaint. The
-- function is SECURITY DEFINER, so without its own ownership check it
-- would happily let any signed-in user re-triage any report.
-- The complaint id is captured while still unrestricted. Selecting it in
-- the argument expression would run as the bystander, whose RLS returns
-- no row, so the function would be handed NULL and report "no such
-- complaint" — never reaching the ownership check under test.
select id as target_complaint from public.complaints \gset

begin;
reset role;
update public.complaints set ai_processed_at = null;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
select public.apply_complaint_triage(
  :'target_complaint',
  'pothole', 'low', 1, 'downgraded by a stranger', 'OTHER',
  'other','low','P4','other',
  0.1,'s','r',false,null,'citytrace-mock-ai-v2');
rollback;
\echo '(expected: you may not triage this complaint)'

\echo ''
\echo '### E4. The sanctioned-path flag cannot be reused for a direct write'
-- apply_complaint_triage() sets a transaction-local flag so its own
-- UPDATE passes the column-authority trigger. If that flag leaked, a
-- citizen could follow it with an arbitrary PATCH in the same
-- transaction. It is cleared before the function returns.
begin;
reset role;
update public.complaints set ai_processed_at = null;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select (public.apply_complaint_triage(
  (select id from public.complaints),
  'pothole','medium',40,'legit','ROADS',
  'road_damage','medium','P3','roads_infrastructure',
  0.5,'s','r',false,null,'citytrace-mock-ai-v2')).id is not null as triage_ok;

-- Same transaction, immediately after, and to a status the complaint is
-- not already at — otherwise the column is not `distinct from` its old
-- value, the trigger short-circuits, and this would pass whether the flag
-- was cleared or not.
update public.complaints set status = 'in_progress';
select status::text as still, 'unchanged expected' as expectation,
       case when status <> 'in_progress' then 'ok' else 'FAIL' end as result
from public.complaints;
rollback;
\echo '(expected: the follow-up UPDATE is refused)'


-- ============================================================
-- F. ROLE ESCALATION
-- ============================================================

\echo ''
\echo '### F1. No role may promote itself'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select public.set_user_role('11111111-1111-1111-1111-111111111111','government_admin');
rollback;
\echo '(expected: only a government_admin may assign roles)'

begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
select public.set_user_role('22222222-2222-2222-2222-222222222222','government_admin');
rollback;
\echo '(expected: refused for an officer too)'

begin;
set local role authenticated;
select test.login('33333333-3333-3333-3333-333333333333');
select public.set_user_role('33333333-3333-3333-3333-333333333333','government_admin');
rollback;
\echo '(expected: refused for a supervisor too — appointing staff is administrative)'

\echo ''
\echo '### F2. can_assign_roles() agrees with that'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select public.can_assign_roles() as citizen, 'false expected' as expectation,
       case when public.can_assign_roles() = false then 'ok' else 'FAIL' end as result;
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select public.can_assign_roles() as administrator, 'true expected' as expectation,
       case when public.can_assign_roles() = true then 'ok' else 'FAIL' end as result;
commit;

\echo ''
\echo '### F3. A citizen cannot insert a profile at all (no INSERT policy)'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
insert into public.profiles (id, full_name, email, role)
values ('99999999-9999-9999-9999-999999999999','Sneak','x@y.z','government_admin');
rollback;
\echo '(expected: row-level security violation)'

\echo ''
\echo '### F4. handle_new_user() always creates a citizen, whatever the metadata says'
-- The registration form no longer sends a role, but the database must
-- not depend on the client behaving: user_metadata is writable at
-- sign-up, so a crafted request could ask for government_admin.
begin;
reset role;
insert into auth.users (id, email, raw_user_meta_data)
values (
  '77777777-7777-7777-7777-777777777777',
  'escalate@test',
  '{"full_name":"Escalation Attempt","role":"government_admin"}'
);
select role::text as created_as, 'citizen expected' as expectation,
       case when role = 'citizen' then 'ok' else 'FAIL' end as result
from public.profiles where id = '77777777-7777-7777-7777-777777777777';
rollback;

\echo ''
\echo '=========================================================='
\echo 'Done. Every "result" column should read ok; the ERRORs'
\echo 'annotated above as expected are the negative cases.'
\echo '=========================================================='
