-- ============================================================
-- NOTIFICATIONS
-- ============================================================
--
-- public.notifications has existed since the initial schema, with
-- per-recipient RLS policies added in 20260814120000. Nothing has ever
-- written a row to it.
--
-- So both notification surfaces derived a feed from complaint state
-- instead: one entry per complaint showing its *current* status. That is
-- honest as far as it goes — every entry was a real report in a real
-- state — but it is not a notification feed, for three reasons:
--
--   * It shows state, not events. A complaint that was assigned, worked
--     and resolved produced one entry, replaced each time. The citizen
--     could never see that they had been asked to confirm a repair
--     unless they happened to look while that was the current status.
--   * Read state lived in a React Set, so it was lost on reload and was
--     never the same in two tabs. The page said so in a comment.
--   * An officer got nothing at all. The tray returned early on any
--     non-citizen route.
--
-- This migration makes the events write rows.
--
--
-- WHY TRIGGERS AND NOT THE APPLICATION
--
-- Every event the product wants to notify about already fires a database
-- trigger, because the previous tasks moved the lifecycle there:
-- complaint_status_history records one row per real complaint
-- transition, and work_order_updates one per work-order transition, both
-- append-only and both written in the same transaction as the change.
--
-- Notifying from the application would mean a second statement that can
-- fail on its own, and the officer lifecycle work already established
-- what that produces: an audit trail that was missing exactly when
-- something went wrong. A notification nobody receives because the
-- browser closed mid-request is the same failure.
--
--
-- DEDUPLICATION IS STRUCTURAL, NOT A CHECK
--
-- The requirement is that retrying an event does not produce a second
-- notification. Rather than comparing message text or timestamps, every
-- notification carries an `event_key` derived from the primary key of
-- the audit row that caused it, plus the recipient:
--
--   csh:<complaint_status_history.id>:<user_id>
--   wou:<work_order_updates.id>:<user_id>
--
-- A unique index makes a duplicate impossible rather than unlikely.
-- Those audit rows are themselves one-per-real-transition — an UPDATE
-- that sets a status to the value it already holds is not `distinct
-- from` its old value, so no history row is written and no notification
-- follows.
-- ============================================================


-- ============================================================
-- 1. THE EVENT TYPES
-- ============================================================
-- An enum, not free text. `type` was `text`, so a typo in one call site
-- produced a category no reader would ever match on and nothing would
-- report the mistake.
--
-- These are the events the product notifies about. Note what is *not*
-- separate: "complaint submitted" and "complaint successfully created"
-- are one database event — the row exists with status `submitted` — so
-- they are one notification. Emitting two would be inventing an event to
-- satisfy a list.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'complaint_submitted',
      'complaint_triaged',
      'complaint_assigned',
      'work_accepted',
      'work_started',
      'proof_submitted',
      'complaint_under_review',
      'confirmation_requested',
      'complaint_resolved',
      'complaint_reopened',
      'complaint_rejected',
      -- Officer-facing: a work order arriving, or coming back.
      'work_order_assigned',
      'work_order_reopened',
      -- Any transition the list above does not name. Better than
      -- silently dropping a status somebody adds to the enum later.
      'status_changed'
    );
  end if;
end
$$;


-- ============================================================
-- 2. COLUMNS THE FEED NEEDS
-- ============================================================
-- The table held user_id, title, message, type, is_read, created_at. A
-- notification with no reference to what it is about cannot be linked
-- to, which is most of what a reader wants to do with one.

alter table public.notifications
  add column if not exists complaint_id uuid
    references public.complaints(id) on delete cascade;

alter table public.notifications
  add column if not exists work_order_id uuid
    references public.work_orders(id) on delete cascade;

-- Nullable: a notification from before this migration has no key, and
-- backfilling an invented one would defeat the point of the index.
alter table public.notifications
  add column if not exists event_key text;

-- is_read stays — it is what the policies and the UI use. read_at says
-- *when*, which "mark all as read" makes worth recording.
alter table public.notifications
  add column if not exists read_at timestamptz;


-- Retype `type` from text to the enum. Existing values are mapped where
-- they match a member and dropped to 'status_changed' otherwise; there
-- are no rows in practice, but a deployment that has been written to by
-- hand should not fail to migrate.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'type'
      and data_type = 'text'
  ) then
    /*
     * enum_range() cast to text[] rather than a subquery: a USING
     * expression cannot contain one ("cannot use subquery in transform
     * expression"), and hardcoding the member list here would be a
     * second copy of the enum to keep in step.
     */
    alter table public.notifications
      alter column type type public.notification_type
      using (
        case
          when type = any (
            enum_range(null::public.notification_type)::text[]
          )
          then type::public.notification_type
          else 'status_changed'::public.notification_type
        end
      );
  end if;
end
$$;

alter table public.notifications
  alter column type set default 'status_changed';

alter table public.notifications
  alter column type set not null;


-- ============================================================
-- 3. THE DEDUPLICATION INDEX
-- ============================================================
-- Partial, so the pre-existing rows with no key do not collide with each
-- other. This is what makes a retried event a no-op rather than a second
-- entry in somebody's inbox.

create unique index if not exists notifications_event_key_idx
  on public.notifications(event_key)
  where event_key is not null;

-- The unread count and the feed are the only two reads, and both are
-- per-recipient and newest-first.
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, is_read, created_at desc);


-- ============================================================
-- 4. WRITING A NOTIFICATION
-- ============================================================
-- One place, so the dedupe rule cannot be applied inconsistently.
--
-- SECURITY DEFINER because the caller is a trigger running as whoever
-- made the change: an officer advancing a work order has no policy
-- allowing them to insert a row addressed to the citizen, and should not
-- have one. The function accepts a recipient rather than deriving it,
-- and its callers are triggers only — it is not granted to
-- `authenticated`, so nothing client-side can address a notification to
-- another user.

create or replace function public.emit_notification(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_event_key text,
  p_complaint_id uuid default null,
  p_work_order_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin

  -- No recipient, no notification. Happens legitimately: an unassigned
  -- work order has no officer to tell.
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications
    (user_id, type, title, message, event_key, complaint_id, work_order_id)
  values
    (p_user_id, p_type, p_title, p_message, p_event_key,
     p_complaint_id, p_work_order_id)
  /*
   * The whole dedupe mechanism. A retried event carries the same
   * event_key and lands here as a no-op, so an at-least-once caller
   * behaves as exactly-once without anybody comparing message strings.
   */
  on conflict (event_key) where event_key is not null do nothing;

end;
$$;

revoke all on function public.emit_notification(
  uuid, public.notification_type, text, text, text, uuid, uuid
) from public;


-- ============================================================
-- 5. COMPLAINT EVENTS -> THE REPORTING CITIZEN
-- ============================================================
-- Fires off complaint_status_history, which is the append-only record of
-- one row per real transition. Using it rather than the complaints table
-- means the notification and the timeline entry cannot disagree, and the
-- history row's id is the natural dedupe key.

create or replace function public.notify_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_complaint public.complaints;
  event_type public.notification_type;
  headline text;
  body text;
begin

  select * into target_complaint
  from public.complaints
  where id = new.complaint_id;

  if target_complaint.id is null then
    return new;
  end if;

  /*
   * Statuses map to the labels the citizen already sees on their
   * timeline, so a notification and the page it links to say the same
   * thing. `status_changed` is the fallback rather than an error: a
   * status added to the enum later should still notify, just generically.
   */
  case new.status
    when 'submitted' then
      event_type := 'complaint_submitted';
      headline   := 'Report received';
      body       := 'Your report has been logged as '
                    || coalesce(target_complaint.complaint_number, 'a new report')
                    || '.';
    when 'ai_analyzed' then
      event_type := 'complaint_triaged';
      headline   := 'Report triaged';
      body       := 'Your report has been categorised and prioritised for the responsible department.';
    when 'assigned' then
      event_type := 'complaint_assigned';
      headline   := 'Assigned to a department';
      body       := 'Your report has been routed to the department that will carry out the work.';
    when 'accepted' then
      event_type := 'work_accepted';
      headline   := 'Accepted by an officer';
      body       := 'A field officer has accepted your report and will attend to it.';
    when 'in_progress' then
      event_type := 'work_started';
      headline   := 'Work has started';
      body       := 'An officer is working on your report on site.';
    when 'proof_submitted' then
      event_type := 'proof_submitted';
      headline   := 'Repair submitted for verification';
      body       := 'The officer has submitted photographs of the completed work.';
    when 'supervisor_review' then
      event_type := 'complaint_under_review';
      headline   := 'Under supervisor review';
      body       := 'A supervisor is verifying the completed work.';
    when 'citizen_confirmation' then
      event_type := 'confirmation_requested';
      headline   := 'Please confirm the repair';
      body       := 'The work is reported complete. Let us know whether the issue is resolved.';
    when 'resolved' then
      event_type := 'complaint_resolved';
      headline   := 'Report resolved';
      body       := 'Your report has been marked resolved.';
    when 'reopened' then
      event_type := 'complaint_reopened';
      headline   := 'Report reopened';
      body       := 'Your report is active again and back with the department.';
    when 'rejected' then
      event_type := 'complaint_rejected';
      headline   := 'Report closed without action';
      body       := 'This report could not be actioned. Open it to see why.';
    else
      event_type := 'status_changed';
      headline   := 'Report updated';
      body       := 'The status of your report has changed.';
  end case;

  /*
   * The note the officer wrote, where there is one, in place of the
   * generic sentence. It is the only line about this citizen's specific
   * issue rather than about the process, and it already reaches their
   * timeline through the same column.
   */
  if new.note is not null and btrim(new.note) <> '' then
    body := btrim(new.note);
  end if;

  perform public.emit_notification(
    target_complaint.citizen_id,
    event_type,
    headline,
    -- Prefixed with the report's own title so a tray entry is
    -- identifiable without opening it.
    coalesce(target_complaint.title, 'Your report') || ' — ' || body,
    'csh:' || new.id::text || ':' || target_complaint.citizen_id::text,
    target_complaint.id,
    null
  );

  return new;

end;
$$;


drop trigger if exists complaint_status_notify on public.complaint_status_history;

-- AFTER INSERT on the history table, not on complaints: the history row
-- must exist for its id to be the dedupe key, and a transition rolled
-- back by a later constraint takes its notification with it.
create trigger complaint_status_notify
after insert on public.complaint_status_history
for each row
execute function public.notify_complaint_status();


-- ============================================================
-- 6. WORK-ORDER EVENTS -> THE ASSIGNED OFFICER
-- ============================================================
-- The officer surface had nothing. What an officer needs to be told is
-- narrow: a job has arrived, or a job has come back.
--
-- Deliberately NOT every transition. An officer who just pressed
-- "Accept" does not need to be notified that they accepted something,
-- and a tray full of one's own actions is a tray nobody reads. So a
-- transition notifies the officer only when somebody else made it.

create or replace function public.notify_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.work_orders;
  complaint_title text;
  event_type public.notification_type;
  headline text;
  body text;
begin

  select * into target_order
  from public.work_orders
  where id = new.work_order_id;

  if target_order.id is null or target_order.officer_id is null then
    return new;
  end if;

  -- The officer's own action. Nothing to tell them.
  if new.created_by = target_order.officer_id then
    return new;
  end if;

  select c.title into complaint_title
  from public.complaints c
  where c.id = target_order.complaint_id;

  case new.status
    when 'assigned' then
      event_type := 'work_order_assigned';
      headline   := 'New work order assigned';
      body       := 'A work order has been assigned to you.';
    when 'reopened' then
      event_type := 'work_order_reopened';
      headline   := 'Work returned for rework';
      body       := 'The repair was not accepted. This work order is back with you.';
    else
      -- A supervisor moving a job through sign-off is not something the
      -- officer has to act on, so it is recorded generically rather than
      -- dressed up as a task.
      event_type := 'status_changed';
      headline   := 'Work order updated';
      body       := 'The status of one of your work orders has changed.';
  end case;

  if new.note is not null and btrim(new.note) <> '' then
    body := btrim(new.note);
  end if;

  perform public.emit_notification(
    target_order.officer_id,
    event_type,
    headline,
    coalesce(complaint_title, 'A work order') || ' — ' || body,
    'wou:' || new.id::text || ':' || target_order.officer_id::text,
    target_order.complaint_id,
    target_order.id
  );

  return new;

end;
$$;


drop trigger if exists work_order_update_notify on public.work_order_updates;

create trigger work_order_update_notify
after insert on public.work_order_updates
for each row
execute function public.notify_work_order_transition();


-- ============================================================
-- 7. ASSIGNMENT AND REASSIGNMENT -> THE NEW OFFICER
-- ============================================================
-- Creating a work order writes no work_order_updates row — the audit
-- trigger fires on transitions, and an insert is not one — so without
-- this an officer would never be told about the assignment that gave
-- them the job. Reassignment has the same gap: officer_id changes
-- without the status necessarily changing.

create or replace function public.notify_work_order_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  complaint_title text;
begin

  if new.officer_id is null then
    return new;
  end if;

  -- On update, only a genuine change of assignee counts.
  if tg_op = 'UPDATE'
     and new.officer_id is not distinct from old.officer_id then
    return new;
  end if;

  -- Oversight assigning a job to themselves needs no announcement.
  if new.officer_id = (select auth.uid()) then
    return new;
  end if;

  select c.title into complaint_title
  from public.complaints c
  where c.id = new.complaint_id;

  perform public.emit_notification(
    new.officer_id,
    'work_order_assigned',
    'New work order assigned',
    coalesce(complaint_title, 'A work order')
      || ' — assigned to you as '
      || coalesce(new.work_order_number, 'a new work order') || '.',
    /*
     * Keyed on the work order and the officer rather than on an audit
     * row, because an assignment has no audit row of its own. The
     * consequence is deliberate: reassigning the same job back to the
     * same officer later does not notify them twice, which is the
     * behaviour worth having — one "this is yours" per officer per job.
     */
    'woassign:' || new.id::text || ':' || new.officer_id::text,
    new.complaint_id,
    new.id
  );

  return new;

end;
$$;


drop trigger if exists work_order_assignment_notify on public.work_orders;

create trigger work_order_assignment_notify
after insert or update of officer_id on public.work_orders
for each row
execute function public.notify_work_order_assignment();


-- ============================================================
-- 8. READING AND MARKING
-- ============================================================
-- SECURITY INVOKER, all of them. The per-recipient policies are the
-- boundary — "Users read own notifications" and "Users update own
-- notifications" both test user_id = auth.uid() — so a function running
-- as the caller cannot be used to reach another user's inbox no matter
-- what it is passed. A SECURITY DEFINER version would have to
-- re-implement that check, and a re-implementation is a second place to
-- get it wrong.

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where user_id = (select auth.uid())
    and not is_read;
$$;

comment on function public.unread_notification_count is
  'Unread notifications for the caller. Counted in Postgres rather than by fetching the feed to measure it.';

revoke all on function public.unread_notification_count() from public;
grant execute on function public.unread_notification_count() to authenticated;


/**
 * Marks a set of notifications read, or all of them.
 *
 * Returns the number actually marked, so a caller can tell "already
 * read" from "not yours" — both leave the row untouched, and the count
 * is the honest answer to what happened.
 */
create or replace function public.mark_notifications_read(
  p_ids uuid[] default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin

  update public.notifications
  set is_read = true,
      read_at = clock_timestamp()
  where user_id = (select auth.uid())
    and not is_read
    -- Null means "all of mine". An explicit list narrows it; the
    -- user_id predicate still applies, so a caller passing somebody
    -- else's id changes nothing.
    and (p_ids is null or id = any (p_ids));

  get diagnostics affected = row_count;

  return affected;

end;
$$;

comment on function public.mark_notifications_read is
  'Marks the caller''s notifications read. Null marks all. Runs as the caller, so RLS confines it to their own.';

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;


-- ============================================================
-- 9. THE INSERT POLICY NARROWS
-- ============================================================
-- "Staff can create notifications" allowed any staff member to insert a
-- row addressed to anybody:
--
--   with check (public.is_staff() or user_id = auth.uid())
--
-- Which means an officer could write a notification into any citizen's
-- inbox, with any text. Nothing in the product did it, and now nothing
-- needs to: every notification comes from a trigger via
-- emit_notification(), which is SECURITY DEFINER and not granted to
-- `authenticated`.
--
-- So the policy is replaced with self-insert only. A client can still
-- write itself a note if some future feature wants one; it can no longer
-- write to a stranger.

drop policy if exists "Staff can create notifications" on public.notifications;

-- Dropped by its own name too, not only by the old one. Without this the
-- migration applies once and fails on a re-run with "policy already
-- exists" — which supabase/bootstrap.sql does by design, since it is a
-- paste-in file that has to be safe to run repeatedly. Caught by
-- verify-bootstrap.sh's second pass.
drop policy if exists "Users create only their own notifications"
  on public.notifications;

create policy "Users create only their own notifications"
on public.notifications
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);


-- Recipients mark their own notifications read; nobody deletes them.
-- There is deliberately no DELETE policy: an inbox its sender can empty
-- is not a record of what the citizen was told.


notify pgrst, 'reload schema';
