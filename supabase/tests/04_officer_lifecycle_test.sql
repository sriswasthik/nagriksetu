-- ============================================================
-- OFFICER WORK-ORDER LIFECYCLE
-- ============================================================
--
-- The officer's path from assignment to sign-off, and every way it must
-- refuse to be short-circuited.
--
-- Every negative case here is a *direct* statement, not a UI action:
-- the publishable key is in every browser, so the only interesting
-- question is what PostgREST accepts. A test that went through the app
-- would prove the button was disabled, which is not the same thing.
--
-- Users come from 01_rls_smoke_test.sql:
--   1111... citizen      Asha
--   2222... officer      Ravi
--   3333... supervisor   Meera
--   4444... admin        Dev
--   5555... citizen      unrelated bystander
--
-- \set ON_ERROR_STOP is deliberately NOT set: the negative cases are
-- expected to raise, and the runner greps for FAIL.

\echo ''
\echo '=========================================================='
\echo ' 04. OFFICER WORK-ORDER LIFECYCLE'
\echo '=========================================================='


-- ============================================================
-- SEED: a complaint with a work order assigned to Ravi
-- ============================================================
-- Filed by the citizen, assigned by the admin, exactly as the product
-- does it.

begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111',
   'Streetlight out on Palm Grove',
   'The pole outside number 14 has been dark for a week.',
   'streetlight', 'submitted',
   12.9611, 77.6387, '14 Palm Grove', 'high');
commit;


begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

insert into public.work_orders (complaint_id, officer_id, status)
select id, '22222222-2222-2222-2222-222222222222', 'assigned'
from public.complaints
where title = 'Streetlight out on Palm Grove';
commit;


-- Captured from the platform's own view, so the negative cases below can
-- name a real work order that the caller has no right to. A subselect
-- inside a restricted session returns null instead, and a function
-- refusing a null id proves nothing about authorization.
select w.id as target_work_order
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where c.title = 'Streetlight out on Palm Grove'
\gset


\echo ''
\echo '### A. THE WORK ORDER EXISTS, NUMBERED AND STAMPED BY THE DATABASE'
select
  (w.work_order_number ~ '^WO-[0-9]{4}-[0-9]{6}$') as numbered,
  (w.assigned_at is not null)                      as stamped,
  w.status::text                                   as status,
  'numbered, stamped, assigned expected'           as expectation,
  case
    when w.work_order_number ~ '^WO-[0-9]{4}-[0-9]{6}$'
     and w.assigned_at is not null
     and w.status = 'assigned'
    then 'ok' else 'FAIL'
  end as result
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where c.title = 'Streetlight out on Palm Grove';


-- ============================================================
-- B. TRANSITIONS THE OFFICER MAY NOT MAKE
-- ============================================================
-- Each runs as Ravi, the assigned officer, on his own work order. RLS
-- permits every one of these updates; the lifecycle trigger is what
-- refuses them.

\echo ''
\echo '### B1. assigned -> resolved is refused (skips the whole job)'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR
update public.work_orders set status = 'resolved'
where id = :'target_work_order';
rollback;


\echo ''
\echo '### B2. assigned -> in_progress is refused (never accepted)'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR
update public.work_orders set status = 'in_progress'
where id = :'target_work_order';
rollback;


\echo ''
\echo '### B3. an officer cannot sign off their own work'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: supervisor_review is oversight's transition to make
update public.work_orders set status = 'supervisor_review'
where id = :'target_work_order';
rollback;


\echo ''
\echo '### B4. caller-supplied lifecycle timestamps are refused'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: a backdated completion is falsified SLA evidence
update public.work_orders
set status = 'accepted',
    accepted_at = '2020-01-01T00:00:00Z'
where id = :'target_work_order';
rollback;


-- ============================================================
-- C. ANOTHER OFFICER'S WORK ORDER
-- ============================================================

-- A second officer, seeded the way 01 does it: as the platform, not as
-- an end user. `set local role authenticated` cannot reach auth.users,
-- and a failed seed here would make every assertion below pass for the
-- wrong reason — an officer with no profile is invisible to RLS anyway.
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'officer2@test',
   '{"full_name":"Sunil Officer"}');

select public.set_user_role('66666666-6666-6666-6666-666666666666', 'officer');

\echo ''
\echo '### C0. the second officer really is an officer'
select
  role::text as role,
  'officer expected' as expectation,
  case when role = 'officer' then 'ok' else 'FAIL' end as result
from public.profiles
where id = '66666666-6666-6666-6666-666666666666';


\echo ''
\echo '### C1. a second officer cannot even see it'
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

select
  count(*) as visible,
  '0 expected'                                as expectation,
  case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.work_orders;
rollback;


\echo ''
\echo '### C2. a second officer cannot resolve it either'
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

-- Silently affects nothing: RLS makes the row invisible, so there is no
-- error to raise. Asserted from the platform's own view afterwards,
-- because from inside this session the row it must not have touched is
-- not selectable either.
update public.work_orders set status = 'accepted';
rollback;

select
  status::text as status,
  'still assigned expected' as expectation,
  case when status = 'assigned' then 'ok' else 'FAIL' end as result
from public.work_orders
where id = :'target_work_order';


\echo ''
\echo '### C3. advance_work_order gives that a readable error'
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

/*
 * The id is passed as a literal rather than a subselect. A subselect
 * runs under this officer's RLS, returns null, and the function would
 * refuse it for being null — which looks like a pass while proving
 * nothing about authorization. A forged-but-real id is the actual
 * attack.
 *
 * EXPECTED ERROR: "not available to you", without confirming it exists.
 */
select public.advance_work_order(
  :'target_work_order',
  'accepted'
);
rollback;


-- ============================================================
-- D. THE OFFICER'S HAPPY PATH
-- ============================================================
-- Each step in its own transaction, because that is how the product
-- issues them, and because clock_timestamp() must advance between them
-- for the audit trail to be orderable.

\echo ''
\echo '### D1. accept'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select public.advance_work_order(
  :'target_work_order',
  'accepted',
  'On my list for this afternoon.'
);
commit;

select
  w.status::text                      as status,
  (w.accepted_at is not null)         as stamped,
  c.status::text                      as complaint_status,
  'accepted / stamped / accepted expected' as expectation,
  case
    when w.status = 'accepted'
     and w.accepted_at is not null
     and c.status = 'accepted'
    then 'ok' else 'FAIL'
  end as result
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where w.id = :'target_work_order';


\echo ''
\echo '### D2. the transition wrote an audit row naming the actor'
select
  u.status::text        as status,
  p.full_name           as actor,
  u.note                as note,
  'accepted / Ravi Officer / note kept expected' as expectation,
  case
    when u.status = 'accepted'
     and u.created_by = '22222222-2222-2222-2222-222222222222'
     and u.note = 'On my list for this afternoon.'
    then 'ok' else 'FAIL'
  end as result
from public.work_order_updates u
join public.profiles p on p.id = u.created_by
where u.work_order_id = :'target_work_order'
  and u.status = 'accepted';


\echo ''
\echo '### D3. start work'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select public.advance_work_order(
  :'target_work_order',
  'in_progress',
  'Replacing the luminaire.'
);
commit;

select
  w.status::text                as status,
  (w.started_at is not null)    as stamped,
  c.status::text                as complaint_status,
  'in_progress everywhere expected' as expectation,
  case
    when w.status = 'in_progress'
     and w.started_at is not null
     and c.status = 'in_progress'
    then 'ok' else 'FAIL'
  end as result
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where w.id = :'target_work_order';


\echo ''
\echo '### D4. submitting proof with no proof attached is refused'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: a supervisor would have nothing to verify
select public.advance_work_order(
  :'target_work_order',
  'proof_submitted',
  'All done.'
);
rollback;


\echo ''
\echo '### D5. proof for a work order that is not yours is refused'
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

-- EXPECTED ERROR: "Assigned officer can add proof" policy. A literal id
-- again — reading it back through RLS would return nothing and insert
-- nothing, which is not the same as being refused.
insert into public.resolution_proofs
  (work_order_id, storage_path, uploaded_by)
values
  (:'target_work_order',
   '66666666-6666-6666-6666-666666666666/forged.jpg',
   '66666666-6666-6666-6666-666666666666');
rollback;


\echo ''
\echo '### D6. proof attributed to someone else is refused'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: uploaded_by must equal auth.uid()
insert into public.resolution_proofs
  (work_order_id, storage_path, uploaded_by)
values
  (:'target_work_order',
   'x/blamed-on-sunil.jpg',
   '66666666-6666-6666-6666-666666666666');
rollback;


\echo ''
\echo '### D7. the assigned officer uploads proof, then submits'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

insert into public.resolution_proofs
  (work_order_id, storage_path, description, uploaded_by)
values
  (:'target_work_order',
   '22222222-2222-2222-2222-222222222222/after.jpg',
   'New luminaire fitted and tested.',
   '22222222-2222-2222-2222-222222222222');

select public.advance_work_order(
  :'target_work_order',
  'proof_submitted',
  'New luminaire fitted and tested.'
);
commit;

select
  w.status::text  as status,
  c.status::text  as complaint_status,
  'proof_submitted on both expected' as expectation,
  case
    when w.status = 'proof_submitted' and c.status = 'proof_submitted'
    then 'ok' else 'FAIL'
  end as result
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where w.id = :'target_work_order';


-- ============================================================
-- E. THE CITIZEN'S VIEW
-- ============================================================

\echo ''
\echo '### E1. the citizen sees every officer transition in their timeline'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  string_agg(h.status::text, ' -> ' order by h.created_at) as timeline,
  'submitted -> assigned -> accepted -> in_progress -> proof_submitted expected'
    as expectation,
  case
    when string_agg(h.status::text, ' -> ' order by h.created_at)
       = 'submitted -> assigned -> accepted -> in_progress -> proof_submitted'
    then 'ok' else 'FAIL'
  end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.title = 'Streetlight out on Palm Grove';
rollback;


\echo ''
\echo '### E2. the officer''s note reaches the citizen''s timeline'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  h.note as note,
  'the officer''s own words expected' as expectation,
  case
    when h.note = 'New luminaire fitted and tested.'
    then 'ok' else 'FAIL'
  end as result
from public.complaint_status_history h
join public.complaints c on c.id = h.complaint_id
where c.title = 'Streetlight out on Palm Grove'
  and h.status = 'proof_submitted';
rollback;


\echo ''
\echo '### E3. the citizen can read the proof record, not write one'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  count(*) as proofs_visible,
  '1 expected' as expectation,
  case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.resolution_proofs
where work_order_id = :'target_work_order';
rollback;


\echo ''
\echo '### E4. an unrelated citizen sees none of it'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');

select
  (select count(*) from public.work_orders)            as work_orders,
  (select count(*) from public.resolution_proofs)      as proofs,
  (select count(*) from public.work_order_updates)     as audit_rows,
  '0 / 0 / 0 expected' as expectation,
  case
    when (select count(*) from public.work_orders) = 0
     and (select count(*) from public.resolution_proofs) = 0
     and (select count(*) from public.work_order_updates) = 0
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- F. SIGN-OFF IS OVERSIGHT'S
-- ============================================================

\echo ''
\echo '### F1. the supervisor moves it to review, then to confirmation'
begin;
set local role authenticated;
select test.login('33333333-3333-3333-3333-333333333333');

select public.advance_work_order(
  :'target_work_order',
  'supervisor_review',
  'Photograph matches the report.'
);
commit;

begin;
set local role authenticated;
select test.login('33333333-3333-3333-3333-333333333333');

select public.advance_work_order(
  :'target_work_order',
  'citizen_confirmation'
);
commit;

begin;
set local role authenticated;
select test.login('33333333-3333-3333-3333-333333333333');

select public.advance_work_order(
  :'target_work_order',
  'resolved'
);
commit;

select
  w.status::text                as status,
  (w.completed_at is not null)  as stamped,
  c.status::text                as complaint_status,
  'resolved / stamped / resolved expected' as expectation,
  case
    when w.status = 'resolved'
     and w.completed_at is not null
     and c.status = 'resolved'
    then 'ok' else 'FAIL'
  end as result
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where w.id = :'target_work_order';


\echo ''
\echo '### F2. a resolved work order cannot be walked backwards'
begin;
set local role authenticated;
select test.login('33333333-3333-3333-3333-333333333333');

-- EXPECTED ERROR: even oversight cannot un-resolve except by reopening
select public.advance_work_order(
  :'target_work_order',
  'in_progress'
);
rollback;


\echo ''
\echo '### F3. a resolved work order cannot be quietly reassigned'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

-- EXPECTED ERROR: reassigning a closed job would reopen it without
-- recording that the repair was rejected
select public.advance_work_order(
  :'target_work_order',
  'assigned'
);
rollback;


\echo ''
\echo '### F4. reopening a rejected repair is allowed, and audited'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select public.advance_work_order(
  :'target_work_order',
  'reopened',
  'Citizen reports the light is out again.'
);
commit;

select
  w.status::text  as status,
  c.status::text  as complaint_status,
  'reopened on both expected' as expectation,
  case
    when w.status = 'reopened' and c.status = 'reopened'
    then 'ok' else 'FAIL'
  end as result
from public.work_orders w
join public.complaints c on c.id = w.complaint_id
where w.id = :'target_work_order';


\echo ''
\echo '### F5. the officer picks the rework back up'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select public.advance_work_order(
  :'target_work_order',
  'in_progress',
  'Back on site.'
);
commit;

select
  status::text as status,
  'in_progress expected' as expectation,
  case when status = 'in_progress' then 'ok' else 'FAIL' end as result
from public.work_orders
where id = :'target_work_order';


-- ============================================================
-- G. THE AUDIT TRAIL IS COMPLETE AND ATTRIBUTED
-- ============================================================

\echo ''
\echo '### G1. every transition is recorded, in order, with its actor'
select
  string_agg(
    u.status::text || '/' || split_part(p.full_name, ' ', 1),
    ' -> ' order by u.created_at
  ) as trail,
  'accepted/Ravi -> in_progress/Ravi -> proof_submitted/Ravi -> supervisor_review/Meera -> citizen_confirmation/Meera -> resolved/Meera -> reopened/Dev -> in_progress/Ravi expected'
    as expectation,
  case
    when string_agg(
           u.status::text || '/' || split_part(p.full_name, ' ', 1),
           ' -> ' order by u.created_at
         ) = 'accepted/Ravi -> in_progress/Ravi -> proof_submitted/Ravi -> supervisor_review/Meera -> citizen_confirmation/Meera -> resolved/Meera -> reopened/Dev -> in_progress/Ravi'
    then 'ok' else 'FAIL'
  end as result
from public.work_order_updates u
join public.profiles p on p.id = u.created_by
where u.work_order_id = :'target_work_order';


\echo ''
\echo '### G2. nobody can rewrite or delete the audit trail'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- No UPDATE or DELETE policy exists on work_order_updates, so both
-- affect zero rows rather than raising.
update public.work_order_updates set note = 'nothing to see here';
delete from public.work_order_updates;

select
  count(*) as surviving,
  '8 expected' as expectation,
  case when count(*) = 8 then 'ok' else 'FAIL' end as result
from public.work_order_updates
where work_order_id = :'target_work_order'
  and note is distinct from 'nothing to see here';
rollback;


-- ============================================================
-- H. AN UNASSIGNED WORK ORDER HAS NO LIFECYCLE
-- ============================================================

\echo ''
\echo '### H1. seed an unassigned work order'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

insert into public.complaints
  (citizen_id, title, description, category, status,
   latitude, longitude, address, priority_level)
values
  ('11111111-1111-1111-1111-111111111111',
   'Blocked drain on Fig Lane',
   'Water standing across the full width of the lane.',
   'drainage', 'submitted',
   12.9500, 77.6000, '2 Fig Lane', 'medium');
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

insert into public.work_orders (complaint_id, officer_id, status)
select id, null, 'assigned'
from public.complaints where title = 'Blocked drain on Fig Lane';
commit;

select
  count(*) as unassigned,
  '1 expected' as expectation,
  case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.work_orders where officer_id is null;


\echo ''
\echo '### H2. it cannot be advanced while nobody owns it'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

-- EXPECTED ERROR: accepting on nobody's behalf
select public.advance_work_order(
  (select id from public.work_orders where officer_id is null),
  'accepted'
);
rollback;


\echo ''
\echo '### H3. an officer cannot claim it for themselves'
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

-- Invisible to them under RLS, so this moves nothing. Asserted from the
-- platform's view after the rollback: an unassigned row is not
-- selectable from inside this session either, so counting it here would
-- report 0 whether or not the update had succeeded.
update public.work_orders
set officer_id = '66666666-6666-6666-6666-666666666666'
where officer_id is null;
rollback;

select
  count(*) as still_unassigned,
  '1 expected' as expectation,
  case when count(*) = 1 then 'ok' else 'FAIL' end as result
from public.work_orders where officer_id is null;


\echo ''
\echo '### H4. oversight assigns it, and the timeline resets to this officer'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

update public.work_orders
set officer_id = '66666666-6666-6666-6666-666666666666'
where officer_id is null;
commit;

select
  (officer_id = '66666666-6666-6666-6666-666666666666') as assigned_to_sunil,
  (accepted_at is null)                                 as not_yet_accepted,
  (assigned_at is not null)                             as clock_started,
  'assigned, unaccepted, stamped expected' as expectation,
  case
    when officer_id = '66666666-6666-6666-6666-666666666666'
     and accepted_at is null
     and assigned_at is not null
    then 'ok' else 'FAIL'
  end as result
from public.work_orders
where officer_id = '66666666-6666-6666-6666-666666666666';


\echo ''
\echo '### H5. handing an already-assigned job on resets the new officer''s clock'
-- The status does not change here — 'assigned' to 'assigned' — so the
-- reset has to happen on the change of assignee rather than on the
-- transition. Without that, Sunil's replacement inherits Sunil's
-- assigned_at and is measured against an SLA that started before they
-- had the job.
begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');
select public.advance_work_order(
  (select id from public.work_orders
   where officer_id = '66666666-6666-6666-6666-666666666666'),
  'accepted',
  'Taking a look.'
);
commit;

select assigned_at as sunil_assigned_at,
       accepted_at as sunil_accepted_at
from public.work_orders
where officer_id = '66666666-6666-6666-6666-666666666666'
\gset

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

-- Back to Ravi, and back to 'assigned' in the same statement.
update public.work_orders
set officer_id = '22222222-2222-2222-2222-222222222222',
    status = 'assigned'
where officer_id = '66666666-6666-6666-6666-666666666666';
commit;

select
  (assigned_at > :'sunil_assigned_at'::timestamptz) as clock_restarted,
  (accepted_at is null)                             as acceptance_cleared,
  'restarted, cleared expected' as expectation,
  case
    when assigned_at > :'sunil_assigned_at'::timestamptz
     and accepted_at is null
    then 'ok' else 'FAIL'
  end as result
from public.work_orders
where id = (
  select w.id from public.work_orders w
  join public.complaints c on c.id = w.complaint_id
  where c.title = 'Blocked drain on Fig Lane'
);


-- ============================================================
-- I. FORGED IDENTIFIERS
-- ============================================================

\echo ''
\echo '### I1. an officer cannot reassign their work order to themselves-plus'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: enforce_work_order_authority — reassignment is oversight's
update public.work_orders
set officer_id = '66666666-6666-6666-6666-666666666666'
where id = :'target_work_order';
rollback;


\echo ''
\echo '### I2. an officer cannot repoint their work order at another complaint'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: this is how an officer would resolve a stranger's report
update public.work_orders
set complaint_id = (
  select id from public.complaints where title = 'Blocked drain on Fig Lane'
)
where id = :'target_work_order';
rollback;


\echo ''
\echo '### I3. a citizen cannot advance their own complaint''s work order'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- EXPECTED ERROR: the citizen can read the work order, not drive it
select public.advance_work_order(
  :'target_work_order',
  'resolved'
);
rollback;


\echo ''
\echo '### I4. an anonymous caller sees and does nothing'
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', false);

select
  (select count(*) from public.work_orders)        as work_orders,
  (select count(*) from public.work_order_updates) as audit_rows,
  (select count(*) from public.resolution_proofs)  as proofs,
  '0 / 0 / 0 expected' as expectation,
  case
    when (select count(*) from public.work_orders) = 0
     and (select count(*) from public.work_order_updates) = 0
     and (select count(*) from public.resolution_proofs) = 0
    then 'ok' else 'FAIL'
  end as result;
rollback;


-- ============================================================
-- J. THE ASSIGNMENT DIRECTORY
-- ============================================================

\echo ''
\echo '### J1. oversight can list assignable officers with their load'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  count(*)                                          as officers,
  '3 expected (2 officers + 1 supervisor)'          as expectation,
  case when count(*) = 3 then 'ok' else 'FAIL' end  as result
from public.assignable_officers();
rollback;


\echo ''
\echo '### J2. a citizen calling it gets no staff directory'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

-- SECURITY INVOKER, so the profile policies still apply: a citizen can
-- read their own row, which is not an officer's.
select
  count(*) as officers,
  '0 expected' as expectation,
  case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.assignable_officers();
rollback;


\echo ''
\echo '=========================================================='
\echo ' Done. Every "result" should read ok; the ERRORs annotated'
\echo ' as EXPECTED are the negative cases.'
\echo '=========================================================='
