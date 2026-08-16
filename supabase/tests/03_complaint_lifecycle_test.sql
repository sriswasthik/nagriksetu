-- ============================================================
-- CITIZEN COMPLAINT LIFECYCLE
-- ============================================================
--
-- Walks the citizen's own path — submit, triage, track — and asserts the
-- parts a form cannot be trusted with: idempotency, coordinate
-- validation, identity, and whether the status history a timeline reads
-- is actually recorded.
--
-- Reuses the users seeded by 01_rls_smoke_test.sql. Runs as
-- bystander@test (a citizen with no involvement in the complaint the
-- earlier suites work on) so its own reports do not disturb them.

\pset pager off
\set ON_ERROR_STOP off

\set citizen '55555555-5555-5555-5555-555555555555'
\set admin   '44444444-4444-4444-4444-444444444444'


-- ============================================================
-- A. SUBMISSION
-- ============================================================

\echo ''
\echo '### A1. A citizen files a report; the database assigns its identity'
begin;
set local role authenticated;
select test.login(:'citizen');

select (public.submit_complaint(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Streetlight out on Mill Road',
  'The light outside number 40 has been dark for a week and the pavement is unlit.',
  'streetlight',
  12.9716, 77.5946,
  'Mill Road, opposite the pharmacy'
)).id is not null as filed;

select
  complaint_number,
  status::text,
  citizen_id = :'citizen' as reporter_is_caller,
  'NS-YYYY-NNNNNN / submitted / true expected' as expectation,
  case
    when complaint_number ~ '^NS-\d{4}-\d{6}$'
     and status = 'submitted'
     and citizen_id = :'citizen'
    then 'ok' else 'FAIL'
  end as result
from public.complaints
where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

\echo ''
\echo '### A2. Submission is recorded in the status history'
-- Without this the timeline has no first date, because created_at is the
-- only transition timestamp complaints ever kept.
begin;
set local role authenticated;
select test.login(:'citizen');
select
  h.status::text,
  (h.created_at is not null) as dated,
  'submitted / true expected' as expectation,
  case when h.status = 'submitted' and h.created_at is not null
       then 'ok' else 'FAIL' end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;


-- ============================================================
-- B. DUPLICATE SUBMISSION
-- ============================================================

\echo ''
\echo '### B1. Re-submitting the same key returns the same report'
-- The case this exists for: the insert succeeded, the response was lost,
-- the citizen pressed Submit again.
begin;
set local role authenticated;
select test.login(:'citizen');

select (public.submit_complaint(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Streetlight out on Mill Road',
  'The light outside number 40 has been dark for a week and the pavement is unlit.',
  'streetlight',
  12.9716, 77.5946,
  'Mill Road, opposite the pharmacy'
)).complaint_number as returned_number;

select
  count(*) as reports_filed,
  '1 expected' as expectation,
  case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.complaints
where title = 'Streetlight out on Mill Road';
commit;

\echo ''
\echo '### B2. A different key does file a second report'
-- Idempotency must not become "one report per citizen per lifetime".
begin;
set local role authenticated;
select test.login(:'citizen');

select (public.submit_complaint(
  'aaaaaaaa-0000-0000-0000-000000000002',
  'Second streetlight out further along',
  'The next light along Mill Road has now failed as well.',
  'streetlight',
  12.9720, 77.5950,
  'Mill Road, near the postbox'
)).id is not null as filed;

select
  count(*) as reports,
  '2 expected' as expectation,
  case when count(*) = 2 then 'ok' else 'FAIL' end as result
from public.complaints
where citizen_id = :'citizen';
rollback;

\echo ''
\echo '### B3. Another citizen cannot claim someone else''s submission key'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select public.submit_complaint(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Trying to hijack a key', 'x x x x x x x x x x', 'other',
  12.9, 77.5, 'Somewhere else'
);
rollback;
\echo '(expected: that submission key has already been used)'

\echo ''
\echo '### B4. The submission key is immutable'
begin;
set local role authenticated;
select test.login(:'citizen');
update public.complaints
   set submission_key = 'aaaaaaaa-0000-0000-0000-00000000ffff'
 where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
rollback;
\echo '(expected: identity cannot be changed)'


-- ============================================================
-- C. VALIDATION THE FORM CANNOT BE TRUSTED WITH
-- ============================================================
-- Every one of these is reachable by a direct PostgREST call that never
-- rendered the form.

\echo ''
\echo '### C1. Coordinates out of range are refused'
begin;
set local role authenticated;
select test.login(:'citizen');
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Out of range', 'A description long enough to pass.', 'other',
  91.0, 77.5, 'Nowhere'
);
rollback;
\echo '(expected: latitude must be between -90 and 90)'

begin;
set local role authenticated;
select test.login(:'citizen');
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000002',
  'Out of range', 'A description long enough to pass.', 'other',
  12.9, 181.0, 'Nowhere'
);
rollback;
\echo '(expected: longitude must be between -180 and 180)'

\echo ''
\echo '### C2. Null Island is refused'
-- 0,0 is what a failed GPS read looks like. Storing it sends a crew to
-- the Gulf of Guinea.
begin;
set local role authenticated;
select test.login(:'citizen');
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000003',
  'Failed GPS read', 'A description long enough to pass.', 'other',
  0, 0, 'Unknown'
);
rollback;
\echo '(expected: those coordinates look like a failed location read)'

\echo ''
\echo '### C3. A missing location is refused'
begin;
set local role authenticated;
select test.login(:'citizen');
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000004',
  'No location', 'A description long enough to pass.', 'other',
  null, null, 'Somewhere'
);
rollback;
\echo '(expected: a report needs a location)'

\echo ''
\echo '### C4. Too-short text is refused'
begin;
set local role authenticated;
select test.login(:'citizen');
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000005',
  'Hi', 'A description long enough to pass.', 'other',
  12.9, 77.5, 'Mill Road'
);
rollback;
\echo '(expected: a title of at least 5 characters)'

begin;
set local role authenticated;
select test.login(:'citizen');
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000006',
  'A valid title', 'Too short', 'other',
  12.9, 77.5, 'Mill Road'
);
rollback;
\echo '(expected: a description of at least 10 characters)'

\echo ''
\echo '### C5. An anonymous caller cannot file anything'
begin;
set local role anon;
select public.submit_complaint(
  'bbbbbbbb-0000-0000-0000-000000000007',
  'Anonymous report', 'A description long enough to pass.', 'other',
  12.9, 77.5, 'Mill Road'
);
rollback;
\echo '(expected: you must be signed in to file a report)'


-- ============================================================
-- D. TRIAGE
-- ============================================================

\echo ''
\echo '### D1. Triage sets priority, routes the complaint, AND advances the status'
-- The status step is the one that was missing: ai_analyzed exists in the
-- enum and the timeline has a stage for it, but nothing ever set it, so
-- a triaged report still showed the citizen "Reported".
begin;
set local role authenticated;
select test.login(:'citizen');

select (public.apply_complaint_triage(
  (select id from public.complaints
    where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'streetlight', 'high', 68, 'Unlit pavement on a pedestrian route', 'ELECTRICAL',
  'streetlight', 'high', 'P2', 'electricity',
  0.79, 'Failed street light', 'Matched lighting keywords',
  false, null, 'citytrace-mock-ai-v2'
)).status::text as new_status;

select
  status::text,
  priority_level::text,
  (department_id is not null) as routed,
  ai_analysis_status,
  round(extract(epoch from (sla_due_at - created_at)) / 3600) as sla_hours,
  'ai_analyzed / high / true / completed / 48 expected' as expectation,
  case
    when status = 'ai_analyzed'
     and priority_level = 'high'
     and department_id is not null
     and ai_analysis_status = 'completed'
     and round(extract(epoch from (sla_due_at - created_at)) / 3600) = 48
    then 'ok' else 'FAIL'
  end as result
from public.complaints
where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo ''
\echo '### D2. That transition is in the history, so the timeline can date it'
-- Qualified: both tables in this join have a `status` column.
select
  string_agg(h.status::text, ' -> ' order by h.created_at) as recorded,
  'submitted -> ai_analyzed expected' as expectation,
  case
    when string_agg(h.status::text, ' -> ' order by h.created_at)
         = 'submitted -> ai_analyzed'
    then 'ok' else 'FAIL'
  end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

\echo ''
\echo '### D3. The department resolves to a NAME, not a uuid'
-- The detail page rendered formatCategory(department_id), which put
-- "Cd0106C4 71F5 4Ab4 A38E Fe8F457Ec047" in front of the citizen.
begin;
set local role authenticated;
select test.login(:'citizen');
select
  d.name,
  'Electrical expected' as expectation,
  case when d.name = 'Electrical' then 'ok' else 'FAIL' end as result
from public.complaints c
join public.departments d on d.id = c.department_id
where c.submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

\echo ''
\echo '### D4. A second triage pass by the citizen is refused'
begin;
set local role authenticated;
select test.login(:'citizen');
select public.apply_complaint_triage(
  (select id from public.complaints
    where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'streetlight', 'critical', 100, 'Re-rolled', 'ELECTRICAL',
  'streetlight', 'critical', 'P1', 'electricity',
  0.9, 's', 'r', false, null, 'citytrace-mock-ai-v2'
);
rollback;
\echo '(expected: this complaint has already been triaged)'

\echo ''
\echo '### D5. A late triage pass cannot drag an assigned complaint backwards'
begin;
-- An administrator assigns it, then triage runs again as staff.
set local role authenticated;
select test.login(:'admin');
update public.complaints set status = 'assigned'
 where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';

select (public.apply_complaint_triage(
  (select id from public.complaints
    where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'streetlight', 'high', 68, 'Re-triaged by staff', 'ELECTRICAL',
  'streetlight', 'high', 'P2', 'electricity',
  0.79, 's', 'r', false, null, 'citytrace-mock-ai-v2'
)).status::text as status_after;

select
  status::text,
  'assigned expected, not ai_analyzed' as expectation,
  case when status = 'assigned' then 'ok' else 'FAIL' end as result
from public.complaints
where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
rollback;

\echo ''
\echo '### D6. A failed triage is recorded, so the UI can show it and offer a retry'
begin;
set local role authenticated;
select test.login(:'citizen');
-- `perform` is plpgsql; at the psql level this is a plain select.
select public.set_complaint_ai_status(
  (select id from public.complaints
    where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'failed',
  'Classifier unavailable'
);
select
  ai_analysis_status,
  ai_error_message,
  'failed / a reason expected' as expectation,
  case when ai_analysis_status = 'failed' and ai_error_message is not null
       then 'ok' else 'FAIL' end as result
from public.complaints
where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
rollback;


-- ============================================================
-- E. TRACKING
-- ============================================================

\echo ''
\echo '### E1. The full history is readable by the reporter'
begin;
set local role authenticated;
select test.login(:'citizen');
select
  count(*) as events,
  'at least 2 expected' as expectation,
  case when count(*) >= 2 then 'ok' else 'FAIL' end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

\echo ''
\echo '### E2. ...and not by an unrelated citizen'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select
  count(*) as events,
  '0 expected' as expectation,
  case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

\echo ''
\echo '### E3. Nobody can edit or delete the history'
-- An audit trail its subject can rewrite is not an audit trail. There is
-- no INSERT, UPDATE or DELETE policy at all.
begin;
set local role authenticated;
select test.login(:'citizen');
with u as (
  update public.complaint_status_history set status = 'resolved' returning 1
)
select count(*) as rows_changed, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from u;
rollback;

begin;
set local role authenticated;
select test.login(:'citizen');
with d as (delete from public.complaint_status_history returning 1)
select count(*) as rows_deleted, '0 expected' as expectation,
       case when count(*) = 0 then 'ok' else 'FAIL' end as result
from d;
rollback;

\echo ''
\echo '### E4. Staff transitions land in the history too'
begin;
set local role authenticated;
select test.login(:'admin');
update public.complaints set status = 'assigned'
 where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.complaints set status = 'in_progress'
 where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';

select
  string_agg(h.status::text, ' -> ' order by h.created_at) as recorded,
  'submitted -> ai_analyzed -> assigned -> in_progress expected' as expectation,
  case
    when string_agg(h.status::text, ' -> ' order by h.created_at)
         = 'submitted -> ai_analyzed -> assigned -> in_progress'
    then 'ok' else 'FAIL'
  end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';
rollback;

\echo ''
\echo '### E5. Evidence metadata is stored with the complaint'
begin;
set local role authenticated;
select test.login(:'citizen');
insert into public.complaint_media
  (complaint_id, storage_path, file_name, file_type, file_size, uploaded_by)
select
  id,
  :'citizen' || '/' || id || '/photo.jpg',
  'streetlight.jpg',
  'image/jpeg',
  348122,
  :'citizen'
from public.complaints
where submission_key = 'aaaaaaaa-0000-0000-0000-000000000001';

select
  file_name, file_type, file_size,
  (storage_path like :'citizen' || '/%') as owner_scoped_path,
  'jpeg / sized / true expected' as expectation,
  case
    when file_type = 'image/jpeg' and file_size > 0
     and storage_path like :'citizen' || '/%'
    then 'ok' else 'FAIL'
  end as result
from public.complaint_media
where file_name = 'streetlight.jpg';
rollback;


-- ============================================================
-- F. COMPLAINT NUMBER IS NOT A SINGLE POINT OF FAILURE
-- ============================================================
-- Reproduces a failure reported from a real deployment:
--
--   Create complaint error: null value in column "complaint_number"
--   of relation "complaints" violates not-null constraint
--
-- The client stopped supplying the number when allocation moved into the
-- database, so a database whose numbering trigger is missing — behind on
-- migrations, or a partially applied one — failed every submission with a
-- message no citizen can act on. The column now carries a default as
-- well, and the two cover different cases.

\echo ''
\echo '### F1. A number is still assigned with the trigger dropped'
begin;
reset role;
-- Exactly the state the reported deployment was in.
drop trigger complaints_set_number on public.complaints;

set local role authenticated;
select test.login(:'citizen');

select (public.submit_complaint(
  'cccccccc-0000-0000-0000-000000000001',
  'Filed with no numbering trigger',
  'This submission must still receive a tracking number.',
  'other',
  12.9716, 77.5946,
  'Mill Road'
)).complaint_number as assigned_by_default;

select
  complaint_number,
  'NS-YYYY-NNNNNN expected, from the column default' as expectation,
  case when complaint_number ~ '^NS-\d{4}-\d{6}$' then 'ok' else 'FAIL' end as result
from public.complaints
where submission_key = 'cccccccc-0000-0000-0000-000000000001';
rollback;

\echo ''
\echo '### F2. An explicit NULL is caught by the trigger, which a default cannot reach'
begin;
reset role;
with inserted as (
  insert into public.complaints
    (complaint_number, citizen_id, title, description, category, status,
     latitude, longitude, address)
  values
    (null, :'citizen', 'Explicit null number',
     'A default does not apply to an explicit null, so the trigger must.',
     'other', 'submitted', 12.97, 77.59, 'Mill Road')
  returning complaint_number
)
select
  complaint_number,
  'NS-YYYY-NNNNNN expected, from the trigger' as expectation,
  case when complaint_number ~ '^NS-\d{4}-\d{6}$' then 'ok' else 'FAIL' end as result
from inserted;
rollback;

\echo ''
\echo '### F3. Both paths draw from one sequence, so numbers cannot collide'
begin;
reset role;
select
  count(*) as issued,
  count(distinct complaint_number) as distinct_numbers,
  'equal expected' as expectation,
  case when count(*) = count(distinct complaint_number)
       then 'ok' else 'FAIL' end as result
from public.complaints;
rollback;


\echo ''
\echo '=========================================================='
\echo 'Done. Every "result" column should read ok; the ERRORs'
\echo 'annotated above as expected are the negative cases.'
\echo '=========================================================='
