-- ============================================================
-- ROW-LEVEL SECURITY AND WORKFLOW SMOKE TEST
-- ============================================================
--
-- Walks the product's real lifecycle as four different users and
-- asserts both halves of every rule: that the intended actor can do the
-- thing, and that nobody else can.
--
--   citizen files -> administrator assigns -> officer accepts, works,
--   submits proof -> supervisor approves -> citizen confirms -> resolved
--
-- Run with supabase/tests/run.sh, which applies the platform stub, then
-- every migration in order, then this file. Each check prints an
-- expected value beside the actual one; `ok` in the result column means
-- the rule holds.
--
-- Written to be re-runnable against a fresh database only. It seeds its
-- own users and leaves the complaint it creates behind.
-- ============================================================

\set ON_ERROR_STOP off
\pset pager off


-- ============================================================
-- SEED: one user per role
-- ============================================================
-- Created through auth.users so handle_new_user() builds the profile,
-- exactly as a real sign-up does. Roles are then assigned through
-- set_user_role() from this trusted context — the bootstrap path.

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'citizen@test',    '{"full_name":"Asha Citizen"}'),
  ('22222222-2222-2222-2222-222222222222', 'officer@test',    '{"full_name":"Ravi Officer"}'),
  ('33333333-3333-3333-3333-333333333333', 'supervisor@test', '{"full_name":"Meera Supervisor"}'),
  ('44444444-4444-4444-4444-444444444444', 'admin@test',      '{"full_name":"Dev Admin"}'),
  ('55555555-5555-5555-5555-555555555555', 'bystander@test',  '{"full_name":"Unrelated Citizen"}');

select public.set_user_role('22222222-2222-2222-2222-222222222222', 'officer');
select public.set_user_role('33333333-3333-3333-3333-333333333333', 'supervisor');
select public.set_user_role('44444444-4444-4444-4444-444444444444', 'government_admin');

\echo ''
\echo '### A. ROLE ADMINISTRATION'
select
  count(*) filter (where role <> 'citizen') as staff_appointed,
  '3 expected' as expectation,
  case when count(*) filter (where role <> 'citizen') = 3 then 'ok' else 'FAIL' end as result
from public.profiles;


-- ============================================================
-- B. CITIZEN FILES A COMPLAINT
-- ============================================================
-- complaint_number and sla_due_at are both database-assigned; the
-- client sends neither.

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111',
   'Pothole on 5th Cross',
   'Deep pothole causing two-wheeler skids',
   'pothole', 'submitted',
   12.9716, 77.5946, '5th Cross, Indiranagar', 'critical');
commit;

\echo ''
\echo '### B. COMPLAINT CREATION (number + SLA assigned by database)'
select
  complaint_number,
  round(extract(epoch from (sla_due_at - created_at)) / 3600) as sla_hours,
  '24 expected for critical' as expectation,
  case
    when complaint_number ~ '^NS-\d{4}-\d{6}$'
     and round(extract(epoch from (sla_due_at - created_at)) / 3600) = 24
    then 'ok' else 'FAIL'
  end as result
from public.complaints;


-- ============================================================
-- C. COMPLAINT VISIBILITY
-- ============================================================

\echo ''
\echo '### C. COMPLAINT VISIBILITY'

begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
select count(*) as unrelated_citizen_sees, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.complaints;
commit;

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select count(*) as reporter_sees, '1 expected' as expectation,
       case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.complaints;
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select count(*) as administrator_sees, '1 expected' as expectation,
       case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.complaints;
commit;


-- ============================================================
-- D. ASSIGNMENT
-- ============================================================

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

insert into public.work_orders (complaint_id, officer_id, department_id, status)
select c.id,
       '22222222-2222-2222-2222-222222222222',
       (select id from public.departments where code = 'ROADS'),
       'assigned'
from public.complaints c
limit 1;

update public.complaints set status = 'assigned';
commit;

\echo ''
\echo '### D. WORK ORDER CREATION (number + assigned_at by trigger)'
select
  work_order_number,
  (assigned_at is not null) as assigned_at_set,
  'WO-YYYY-NNNNNN and true expected' as expectation,
  case
    when work_order_number ~ '^WO-\d{4}-\d{6}$' and assigned_at is not null
    then 'ok' else 'FAIL'
  end as result
from public.work_orders;


-- ============================================================
-- E. WORK ORDER VISIBILITY
-- ============================================================

\echo ''
\echo '### E. WORK ORDER VISIBILITY'

begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
select count(*) as assigned_officer_sees, '1 expected' as expectation,
       case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.work_orders;
commit;

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select count(*) as reporting_citizen_sees, '1 expected' as expectation,
       case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.work_orders;
commit;

begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
select count(*) as unrelated_citizen_sees, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.work_orders;
commit;


-- ============================================================
-- F. OFFICER WORKFLOW
-- ============================================================

begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

update public.work_orders set status = 'accepted', accepted_at = now();
insert into public.work_order_updates (work_order_id, status, note, created_by)
select id, 'accepted', 'On my way', '22222222-2222-2222-2222-222222222222'
from public.work_orders;

update public.work_orders set status = 'in_progress', started_at = now();
update public.work_orders set status = 'proof_submitted';
insert into public.work_order_updates (work_order_id, status, note, created_by)
select id, 'proof_submitted', 'Patched and compacted', '22222222-2222-2222-2222-222222222222'
from public.work_orders;

insert into public.resolution_proofs (work_order_id, storage_path, description, uploaded_by)
select id,
       '22222222-2222-2222-2222-222222222222/' || id || '/proof.jpg',
       'Patched and compacted',
       '22222222-2222-2222-2222-222222222222'
from public.work_orders;

update public.complaints set status = 'proof_submitted';
commit;

\echo ''
\echo '### F. OFFICER WORKFLOW'
select
  (select status::text from public.work_orders) as work_order_status,
  (select count(*) from public.work_order_updates) as audit_entries,
  (select count(*) from public.resolution_proofs) as proofs,
  'proof_submitted / 2 / 1 expected' as expectation,
  case
    when (select status::text from public.work_orders) = 'proof_submitted'
     and (select count(*) from public.work_order_updates) = 2
     and (select count(*) from public.resolution_proofs) = 1
    then 'ok' else 'FAIL'
  end as result;

\echo ''
\echo '### F2. A CITIZEN CANNOT MOVE A WORK ORDER'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
with attempt as (
  update public.work_orders set status = 'resolved' returning 1
)
select count(*) as rows_changed, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from attempt;
rollback;


-- ============================================================
-- G. PRIVILEGE ESCALATION
-- ============================================================

\echo ''
\echo '### G. A CITIZEN CANNOT PROMOTE THEMSELVES (both paths must raise)'

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.profiles set role = 'government_admin'
where id = '11111111-1111-1111-1111-111111111111';
rollback;

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select public.set_user_role('11111111-1111-1111-1111-111111111111', 'government_admin');
rollback;

\echo '(two ERRORs immediately above are the expected result)'


-- ============================================================
-- H. TWO-STAGE VERIFICATION
-- ============================================================

begin;
set local role authenticated;
select test.login('33333333-3333-3333-3333-333333333333');
insert into public.verifications
  (work_order_id, supervisor_id, supervisor_status, supervisor_comment)
select id, '33333333-3333-3333-3333-333333333333', 'approved', 'Repair confirmed on site'
from public.work_orders;
update public.work_orders set status = 'citizen_confirmation';
commit;

\echo ''
\echo '### H. A CITIZEN CANNOT FORGE THE SUPERVISOR VERDICT'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.verifications
   set supervisor_status = 'rejected',
       supervisor_comment = 'Forged by the reporting citizen',
       supervisor_id = '11111111-1111-1111-1111-111111111111';
rollback;
\echo '(the ERROR immediately above is the expected result)'

\echo ''
\echo '### H2. THE CITIZEN CAN RECORD THEIR OWN CONFIRMATION'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.verifications
   set citizen_status = 'approved', citizen_comment = 'Road is smooth again';
select citizen_status::text, (verified_at is not null) as verified,
       'approved / true expected' as expectation,
       case when citizen_status = 'approved' and verified_at is not null
            then 'ok' else 'FAIL' end as result
from public.verifications;
commit;

\echo ''
\echo '### H3. verified_at IS DERIVED, NOT CLIENT-SUPPLIED'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
update public.verifications
   set citizen_status = 'pending', verified_at = '2020-01-01';
select verified_at, 'null expected once no longer fully approved' as expectation,
       case when verified_at is null then 'ok' else 'FAIL' end as result
from public.verifications;
rollback;


-- ============================================================
-- I. CLOSURE
-- ============================================================

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.work_orders set status = 'resolved', completed_at = now();
update public.complaints set status = 'resolved';
commit;

\echo ''
\echo '### I. ANALYTICS REFLECT THE RESOLVED COMPLAINT'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select
  (public.analytics_summary() ->> 'totalComplaints') as total,
  (public.analytics_summary() ->> 'resolvedComplaints') as resolved,
  (public.analytics_summary() ->> 'slaCompliance') as sla_compliance,
  '1 / 1 / 100.0 expected' as expectation,
  case
    when (public.analytics_summary() ->> 'resolvedComplaints') = '1'
     and (public.analytics_summary() ->> 'slaCompliance')::numeric = 100.0
    then 'ok' else 'FAIL'
  end as result;
commit;

\echo ''
\echo '### I2. ANALYTICS ARE SCOPED BY THE CALLER (SECURITY INVOKER)'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
select (public.analytics_summary() ->> 'totalComplaints') as unrelated_citizen_total,
       '0 expected' as expectation,
       case when (public.analytics_summary() ->> 'totalComplaints') = '0'
            then 'ok' else 'FAIL' end as result;
commit;

\echo ''
\echo '### I3. EVERY ANALYTICS FUNCTION RETURNS ITS EXPECTED SHAPE'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
select
  jsonb_array_length(public.analytics_trends(7)::jsonb) as trend_points,
  jsonb_array_length(public.analytics_department_performance()::jsonb) as departments,
  jsonb_array_length(public.analytics_ward_health()::jsonb) as wards,
  '7 / 8 / 6 expected' as expectation,
  case
    when jsonb_array_length(public.analytics_trends(7)::jsonb) = 7
     and jsonb_array_length(public.analytics_department_performance()::jsonb) = 8
     and jsonb_array_length(public.analytics_ward_health()::jsonb) = 6
    then 'ok' else 'FAIL'
  end as result;
commit;


-- ============================================================
-- J. STORAGE OBJECT POLICIES
-- ============================================================
-- Inserting into storage.objects directly is what the Storage API does
-- on the caller's behalf, so the policies are what is under test.

\echo ''
\echo '### J. BUCKETS EXIST AND ARE PRIVATE'
select id, public, 'both private expected' as expectation,
       case when public = false then 'ok' else 'FAIL' end as result
from storage.buckets order by id;

\echo ''
\echo '### J2. A CITIZEN CAN UPLOAD INTO THEIR OWN FOLDER'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
with attempt as (
  insert into storage.objects (bucket_id, name, owner)
  values ('complaint-evidence',
          '11111111-1111-1111-1111-111111111111/' ||
            (select id from public.complaints limit 1) || '/photo.jpg',
          '11111111-1111-1111-1111-111111111111')
  returning 1
)
select count(*) as uploaded, '1 expected' as expectation,
       case when count(*) = 1 then 'ok' else 'FAIL' end as result
from attempt;
commit;

\echo ''
\echo '### J3. ...BUT NOT INTO SOMEBODY ELSE''S FOLDER'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name, owner)
values ('complaint-evidence',
        '55555555-5555-5555-5555-555555555555/x/photo.jpg',
        '11111111-1111-1111-1111-111111111111');
rollback;
\echo '(the ERROR immediately above is the expected result)'

\echo ''
\echo '### J4. EVIDENCE READ ACCESS'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');
select count(*) as officer_reads, '1 expected' as expectation,
       case when count(*) = 1 then 'ok' else 'FAIL' end as result
from storage.objects where bucket_id = 'complaint-evidence';
commit;

begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');
select count(*) as unrelated_citizen_reads, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from storage.objects where bucket_id = 'complaint-evidence';
commit;

\echo ''
\echo '### J5. A CITIZEN CANNOT UPLOAD A RESOLUTION PROOF'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name, owner)
values ('resolution-proofs',
        '11111111-1111-1111-1111-111111111111/x/fake.jpg',
        '11111111-1111-1111-1111-111111111111');
rollback;
\echo '(the ERROR immediately above is the expected result)'

\echo ''
\echo '### J6. A RECORDED PROOF CANNOT BE DELETED, AN ORPHAN CAN'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

insert into storage.objects (bucket_id, name, owner)
select 'resolution-proofs', storage_path, uploaded_by
from public.resolution_proofs;

insert into storage.objects (bucket_id, name, owner)
values ('resolution-proofs',
        '22222222-2222-2222-2222-222222222222/orphan/stray.jpg',
        '22222222-2222-2222-2222-222222222222');

with recorded as (
  delete from storage.objects
  where bucket_id = 'resolution-proofs'
    and name in (select storage_path from public.resolution_proofs)
  returning 1
),
orphan as (
  delete from storage.objects
  where name = '22222222-2222-2222-2222-222222222222/orphan/stray.jpg'
  returning 1
)
select
  (select count(*) from recorded) as recorded_deleted,
  (select count(*) from orphan) as orphans_deleted,
  '0 / 1 expected' as expectation,
  case when (select count(*) from recorded) = 0
        and (select count(*) from orphan) = 1
       then 'ok' else 'FAIL' end as result;
rollback;

\echo ''
\echo '### J7. A MALFORMED OBJECT NAME MUST NOT ERROR THE READ'
-- The evidence policies compare the first path segment as text rather
-- than casting it to uuid: a cast would raise 22P02 on any object whose
-- name does not parse, taking out the whole query instead of hiding one
-- row.
begin;
reset role;
insert into storage.objects (bucket_id, name, owner)
values ('complaint-evidence', 'not-a-uuid/whatever.jpg', null);
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select count(*) >= 1 as read_succeeded, 'true expected, no 22P02' as expectation,
       case when count(*) >= 1 then 'ok' else 'FAIL' end as result
from storage.objects;
rollback;

\echo ''
\echo '=========================================================='
\echo 'Done. Every "result" column should read ok, and the four'
\echo 'ERRORs flagged above as expected are the negative cases.'
\echo '=========================================================='
