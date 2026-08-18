-- ============================================================
-- NOTIFICATION LIFECYCLE
-- ============================================================
--
-- Three properties matter here, and the rest follows from them:
--
--   1. Real events produce notifications. Nothing wrote to
--      public.notifications before, so both surfaces derived a feed from
--      complaint state — one entry per report, showing its current
--      status, replaced each time it changed. A citizen could never see
--      that they had been asked to confirm a repair unless they happened
--      to look while that was the current status.
--
--   2. A retried event does not produce a second notification. Asserted
--      by replaying transitions rather than by trusting the index.
--
--   3. Nobody reads or marks anybody else's. Asserted as direct
--      statements, since RLS is the only boundary a PostgREST call has
--      to get past.
--
-- Runs after 01-05, which seed the users and work a complaint through
-- its whole lifecycle — so by the time this file runs, the triggers have
-- already had every event fired at them and the assertions are about
-- accumulated real state rather than about fixtures set up to pass.
--
--   1111... citizen      Asha       reported 01's complaint
--   2222... officer      Ravi       assigned to its work order
--   3333... supervisor   Meera
--   4444... admin        Dev
--   5555... citizen      bystander  reported their own, unrelated
--   6666... officer      Sunil      holds no work orders

\pset pager off
\set ON_ERROR_STOP off

\echo ''
\echo '=========================================================='
\echo ' 06. NOTIFICATIONS'
\echo '=========================================================='


-- ============================================================
-- A. EVENTS PRODUCED NOTIFICATIONS
-- ============================================================

\echo ''
\echo '### A1. The citizen was notified about their own report'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  count(*) as notifications,
  'more than one expected' as expectation,
  case when count(*) > 1 then 'ok' else 'FAIL' end as result
from public.notifications;
rollback;


\echo ''
\echo '### A2. Every event in the lifecycle is represented, not just the latest'
--
-- The failure the old derived feed had: it showed state, so a complaint
-- that passed through eight statuses left one entry. These are events,
-- so the citizen can see the whole sequence.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  count(distinct type) as distinct_events,
  string_agg(distinct type::text, ', ' order by type::text) as kinds,
  'submission, triage, work and closure all present' as expectation,
  case
    when count(*) filter (where type = 'complaint_submitted') > 0
     and count(*) filter (where type = 'work_accepted') > 0
     and count(*) filter (where type = 'work_started') > 0
     and count(*) filter (where type = 'proof_submitted') > 0
     and count(*) filter (where type = 'complaint_resolved') > 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### A3. Reopening notified the citizen, and it is a distinct event'
-- 04 resolved a complaint and then reopened it. The derived feed could
-- only ever show the newer of those two.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  count(*) filter (where type = 'complaint_resolved') as resolved_events,
  count(*) filter (where type = 'complaint_reopened') as reopened_events,
  'both present expected' as expectation,
  case
    when count(*) filter (where type = 'complaint_resolved') > 0
     and count(*) filter (where type = 'complaint_reopened') > 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### A4. Every notification names its complaint and carries a timestamp'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  count(*) as total,
  count(*) filter (where complaint_id is null) as orphaned,
  count(*) filter (where created_at is null) as undated,
  count(*) filter (where btrim(message) = '') as empty_messages,
  '0 orphaned, 0 undated, 0 empty' as expectation,
  case
    when count(*) filter (where complaint_id is null) = 0
     and count(*) filter (where created_at is null) = 0
     and count(*) filter (where btrim(message) = '') = 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### A5. The officer''s note reaches the notification, not just the timeline'
-- 04 submitted proof with "New luminaire fitted and tested." That
-- sentence is the only line about this citizen's actual issue.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  count(*) as carrying_the_note,
  'at least one expected' as expectation,
  case when count(*) > 0 then 'ok' else 'FAIL' end as result
from public.notifications
where message like '%New luminaire fitted and tested.%';
rollback;


-- ============================================================
-- B. THE OFFICER SURFACE, WHICH HAD NOTHING
-- ============================================================

\echo ''
\echo '### B1. An officer is notified when a work order is assigned to them'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select
  count(*) filter (where type = 'work_order_assigned') as assignments,
  'at least one expected' as expectation,
  case
    when count(*) filter (where type = 'work_order_assigned') > 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### B2. An officer''s notifications name the work order, not only the complaint'
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select
  count(*) as officer_notifications,
  count(*) filter (where work_order_id is not null) as with_work_order,
  'every work-order notification references one' as expectation,
  case
    when count(*) filter (
      where type in ('work_order_assigned', 'work_order_reopened')
        and work_order_id is null
    ) = 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### B3. An officer is not notified about their own actions'
--
-- Ravi accepted, started and submitted proof himself. A tray that tells
-- an officer they accepted something is a tray nobody reads, so a
-- transition notifies the officer only when somebody else made it.
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select
  count(*) filter (
    where type in ('work_accepted', 'work_started', 'proof_submitted')
  ) as self_announcements,
  '0 expected' as expectation,
  case
    when count(*) filter (
      where type in ('work_accepted', 'work_started', 'proof_submitted')
    ) = 0 then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### B4. Rework comes back to the officer as an actionable event'
-- 04's admin reopened Ravi's work order, so this is somebody else's
-- transition and Ravi should hear about it.
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

select
  count(*) filter (where type = 'work_order_reopened') as rework_events,
  'at least one expected' as expectation,
  case
    when count(*) filter (where type = 'work_order_reopened') > 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


-- ============================================================
-- C. DUPLICATES
-- ============================================================

\echo ''
\echo '### C1. No two notifications share an event key'
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
rollback;

select
  count(*) as rows_with_keys,
  count(distinct event_key) as distinct_keys,
  'equal expected' as expectation,
  case
    when count(*) = count(distinct event_key) then 'ok' else 'FAIL'
  end as result
from public.notifications
where event_key is not null;


\echo ''
\echo '### C2. Replaying an event produces no second notification'
--
-- The requirement, asserted by actually retrying rather than by trusting
-- the index. emit_notification() is called again with the same key, the
-- way an at-least-once caller would.
select count(*) as before_replay from public.notifications
\gset

select public.emit_notification(
  n.user_id, n.type, n.title, n.message, n.event_key,
  n.complaint_id, n.work_order_id
)
from public.notifications n
where n.event_key is not null;

select
  :'before_replay'::int as before_replay,
  count(*) as after_replay,
  'unchanged expected' as expectation,
  case
    when count(*) = :'before_replay'::int then 'ok' else 'FAIL'
  end as result
from public.notifications;


\echo ''
\echo '### C3. A no-op status update produces no notification'
--
-- An UPDATE setting status to the value it already holds is not
-- `distinct from` its old value, so no history row is written and no
-- notification follows. This is why deduplication did not need a
-- content comparison.
select count(*) as before_noop from public.notifications
\gset

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.complaints
set status = status
where title = 'Streetlight out on Palm Grove';
commit;

select
  :'before_noop'::int as before_noop,
  count(*) as after_noop,
  'unchanged expected' as expectation,
  case
    when count(*) = :'before_noop'::int then 'ok' else 'FAIL'
  end as result
from public.notifications;


\echo ''
\echo '### C4. A genuinely new assignee is notified'
-- Meera has never held this work order, so this is the first time it is
-- hers and she should hear about it.
select count(*) as before_new_assignee
from public.notifications where type = 'work_order_assigned'
\gset

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.work_orders
set officer_id = '33333333-3333-3333-3333-333333333333'
where id = (
  select w.id from public.work_orders w
  join public.complaints c on c.id = w.complaint_id
  where c.title = 'Blocked drain on Fig Lane'
);
commit;

select
  :'before_new_assignee'::int as before_assignment,
  count(*) as after_assignment,
  'one more expected' as expectation,
  case
    when count(*) = :'before_new_assignee'::int + 1 then 'ok' else 'FAIL'
  end as result
from public.notifications where type = 'work_order_assigned';


\echo ''
\echo '### C5. Bouncing a job between officers who have both held it notifies neither again'
--
-- The assignment key is per work order per officer, because an
-- assignment writes no audit row of its own to key on. Ravi and Sunil
-- both held this job in 04, so both already have their "this is yours"
-- and neither gets a second one however often it moves between them.
--
-- One announcement per officer per job is the behaviour worth having: an
-- officer does not need telling twice that a job they already know about
-- is theirs.
select count(*) as before_bouncing
from public.notifications where type = 'work_order_assigned'
\gset

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.work_orders
set officer_id = '22222222-2222-2222-2222-222222222222'
where id = (
  select w.id from public.work_orders w
  join public.complaints c on c.id = w.complaint_id
  where c.title = 'Blocked drain on Fig Lane'
);
commit;

begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');
update public.work_orders
set officer_id = '66666666-6666-6666-6666-666666666666'
where id = (
  select w.id from public.work_orders w
  join public.complaints c on c.id = w.complaint_id
  where c.title = 'Blocked drain on Fig Lane'
);
commit;

select
  :'before_bouncing'::int as before_bouncing,
  count(*) as after_two_reassignments,
  'unchanged expected' as expectation,
  case
    when count(*) = :'before_bouncing'::int then 'ok' else 'FAIL'
  end as result
from public.notifications where type = 'work_order_assigned';


-- ============================================================
-- D. CONFINEMENT
-- ============================================================

\echo ''
\echo '### D1. A citizen cannot read another user''s notifications'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');

select
  count(*) as visible,
  count(*) filter (
    where user_id <> '55555555-5555-5555-5555-555555555555'
  ) as other_peoples,
  '0 belonging to anybody else' as expectation,
  case
    when count(*) filter (
      where user_id <> '55555555-5555-5555-5555-555555555555'
    ) = 0 then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### D2. Staff do not get to read a citizen''s inbox either'
-- The read policy is user_id = auth.uid() with no staff exemption, and
-- it should stay that way: an inbox is correspondence, not operational
-- data.
begin;
set local role authenticated;
select test.login('44444444-4444-4444-4444-444444444444');

select
  count(*) filter (
    where user_id = '11111111-1111-1111-1111-111111111111'
  ) as citizens_notifications_visible_to_admin,
  '0 expected' as expectation,
  case
    when count(*) filter (
      where user_id = '11111111-1111-1111-1111-111111111111'
    ) = 0 then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### D3. A user cannot mark another user''s notifications read'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');

-- Passing somebody else's ids explicitly. The function runs as the
-- caller, so the user_id predicate still applies and this changes
-- nothing rather than erroring.
select
  public.mark_notifications_read(
    array(
      select id from public.notifications
    )
  ) as marked_by_bystander,
  'nothing outside their own' as expectation;
rollback;

select
  count(*) as asha_still_unread,
  'Asha''s unread notifications survive' as expectation,
  case when count(*) > 0 then 'ok' else 'FAIL' end as result
from public.notifications
where user_id = '11111111-1111-1111-1111-111111111111'
  and not is_read;


\echo ''
\echo '### D4. A direct UPDATE cannot reach another user''s notifications'
begin;
set local role authenticated;
select test.login('55555555-5555-5555-5555-555555555555');

-- Invisible under RLS, so this affects nothing rather than raising.
update public.notifications set is_read = true;
rollback;

select
  count(*) as asha_still_unread,
  'unchanged expected' as expectation,
  case when count(*) > 0 then 'ok' else 'FAIL' end as result
from public.notifications
where user_id = '11111111-1111-1111-1111-111111111111'
  and not is_read;


\echo ''
\echo '### D5. A user cannot address a notification to somebody else'
--
-- The old policy was `is_staff() or user_id = auth.uid()`, so any
-- officer could write a notification, with any text, into any citizen's
-- inbox. Nothing did it; nothing needs to, since every notification now
-- comes from a trigger.
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: row-level security violation
insert into public.notifications (user_id, type, title, message)
values ('11111111-1111-1111-1111-111111111111', 'status_changed',
        'Your report was rejected', 'Please stop calling the council.');
rollback;
\echo '(expected: row-level security violation)'


\echo ''
\echo '### D6. Nobody deletes a notification'
-- No DELETE policy exists: an inbox its sender can empty is not a record
-- of what the citizen was told.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

delete from public.notifications;
rollback;

select
  count(*) as surviving,
  'more than one expected' as expectation,
  case when count(*) > 1 then 'ok' else 'FAIL' end as result
from public.notifications
where user_id = '11111111-1111-1111-1111-111111111111';


\echo ''
\echo '### D7. An anonymous caller has no inbox and no functions'
begin;
set local role anon;
select
  count(*) as visible,
  '0 expected' as expectation,
  case when count(*) = 0 then 'ok' else 'FAIL' end as result
from public.notifications;
rollback;

begin;
set local role anon;
-- EXPECTED ERROR: permission denied for function unread_notification_count
select public.unread_notification_count();
rollback;
\echo '(expected: permission denied — anon has no EXECUTE)'


\echo ''
\echo '### D8. emit_notification is not reachable from a client'
-- SECURITY DEFINER and addressed-recipient, so a grant to
-- `authenticated` would be exactly the hole D5 closes.
begin;
set local role authenticated;
select test.login('22222222-2222-2222-2222-222222222222');

-- EXPECTED ERROR: permission denied for function emit_notification
select public.emit_notification(
  '11111111-1111-1111-1111-111111111111',
  'status_changed', 'Forged', 'Forged', 'forged:1'
);
rollback;
\echo '(expected: permission denied — triggers only)'


-- ============================================================
-- E. UNREAD COUNT AND MARKING
-- ============================================================

\echo ''
\echo '### E1. The unread count is the caller''s own, counted in Postgres'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select
  public.unread_notification_count() as counted,
  (select count(*) from public.notifications where not is_read) as visible_unread,
  'the function agrees with the feed' as expectation,
  case
    when public.unread_notification_count()
       = (select count(*) from public.notifications where not is_read)
     and public.unread_notification_count() > 0
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### E2. Two users have different unread counts'
-- The check that would fail if the count ignored the recipient.
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');
select public.unread_notification_count() as asha_unread
\gset
rollback;

begin;
set local role authenticated;
select test.login('66666666-6666-6666-6666-666666666666');

select
  :'asha_unread'::int as asha_unread,
  public.unread_notification_count() as sunil_unread,
  'different, and neither is the global total' as expectation,
  case
    when public.unread_notification_count() <> :'asha_unread'::int
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### E3. Marking one notification read affects exactly that one'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select public.unread_notification_count() as before_mark
\gset

select public.mark_notifications_read(
  array[(select id from public.notifications where not is_read limit 1)]
) as marked
\gset

select
  :'before_mark'::int as before_mark,
  :'marked'::int as reported_marked,
  public.unread_notification_count() as after_mark,
  'one fewer unread, and it said so' as expectation,
  case
    when :'marked'::int = 1
     and public.unread_notification_count() = :'before_mark'::int - 1
    then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### E4. A read notification records when it was read'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select public.mark_notifications_read(
  array[(select id from public.notifications where not is_read limit 1)]
);

select
  count(*) filter (where is_read and read_at is null) as read_without_timestamp,
  '0 expected' as expectation,
  case
    when count(*) filter (where is_read and read_at is null) = 0
    then 'ok' else 'FAIL'
  end as result
from public.notifications;
rollback;


\echo ''
\echo '### E5. Mark-all clears the caller''s inbox and nobody else''s'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select public.mark_notifications_read() as marked_all;

select
  public.unread_notification_count() as asha_after,
  '0 expected' as expectation,
  case
    when public.unread_notification_count() = 0 then 'ok' else 'FAIL'
  end as result;

-- Still inside the same transaction, so Sunil's inbox is judged against
-- Asha's mark-all having just run.
select test.login('22222222-2222-2222-2222-222222222222');
select
  public.unread_notification_count() as ravi_after,
  'Ravi keeps his unread notifications' as expectation,
  case
    when public.unread_notification_count() > 0 then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '### E6. Marking already-read notifications reports zero, not an error'
begin;
set local role authenticated;
select test.login('11111111-1111-1111-1111-111111111111');

select public.mark_notifications_read();

select
  public.mark_notifications_read() as second_call,
  '0 expected' as expectation,
  case
    when public.mark_notifications_read() = 0 then 'ok' else 'FAIL'
  end as result;
rollback;


\echo ''
\echo '=========================================================='
\echo ' Done. Every "result" should read ok; the ERRORs annotated'
\echo ' as EXPECTED are the negative cases.'
\echo '=========================================================='
