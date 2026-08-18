-- ============================================================
-- WORK ORDER LIFECYCLE
-- ============================================================
--
-- Row-level security already decides *who* may update a work order:
-- oversight, or the officer it is assigned to. What nothing decided was
-- *what* the update may be. Five things were unenforced.
--
--
-- 1. THE STATE MACHINE DID NOT EXIST
--
--    work_orders.status is an enum, so Postgres accepted any of its
--    eight values in place of any other. An assigned officer could
--    PATCH status straight to 'resolved' — skipping acceptance, the
--    site visit and the proof a supervisor is meant to verify — or move
--    a resolved order back to 'assigned', erasing that it was ever
--    finished. Neither is reachable through the UI, but the UI is not
--    the boundary: the publishable key is in every browser and
--    PostgREST accepts a hand-written PATCH.
--
--
-- 2. THE AUDIT TRAIL WAS OPTIONAL
--
--    work_order_updates was written by the application, in a separate
--    statement, deliberately best-effort: "if the audit insert fails the
--    transition itself still stands". So the record of who changed what
--    could be missing precisely when something went wrong, and a caller
--    who simply never issued the second statement left no trace at all.
--
--    An audit trail the actor can decline to write is not an audit
--    trail. It is now a trigger: same transaction as the transition,
--    actor from auth.uid(), not reachable from any client.
--
--
-- 3. THE CITIZEN'S VIEW COULD GO STALE
--
--    The complaint's status was synced by a third application
--    statement, also best-effort. If it failed, the officer saw
--    'in_progress' and the citizen tracking that report still saw
--    'assigned', with nothing to reconcile them and no error either
--    would ever see. Now a trigger, in the same transaction.
--
--
-- 4. PROOF WAS NOT REQUIRED TO SUBMIT PROOF
--
--    'proof_submitted' is the officer's claim that the job is done and
--    the state a supervisor signs off from. The page required a
--    photograph before enabling the button; the database required
--    nothing, so a direct PATCH produced a work order awaiting
--    verification with nothing to verify.
--
--
-- 5. TIMESTAMPS CAME FROM THE BROWSER
--
--    accepted_at, started_at and completed_at were sent by the client.
--    They are SLA evidence — how long a repair took, whether a target
--    was met — so a backdated completed_at is a falsified performance
--    record. They are now stamped by the trigger from the server clock
--    and rejected from callers.
--
-- ============================================================


-- ============================================================
-- 1. THE STATE MACHINE
-- ============================================================
--
-- Split by authority, because the two roles legitimately move a work
-- order through different parts of it:
--
--   THE ASSIGNED OFFICER does the field work.
--
--     assigned    -> accepted           acknowledge the assignment
--     accepted    -> in_progress        on site
--     in_progress -> proof_submitted    done, with photographs
--     reopened    -> in_progress        rework after a rejection
--
--   OVERSIGHT (supervisor, government_admin) runs sign-off, and can
--   reassign, which is the one legitimate way back to 'assigned'.
--
--     proof_submitted     -> supervisor_review | reopened
--     supervisor_review   -> citizen_confirmation | reopened
--     citizen_confirmation-> resolved | reopened
--     resolved            -> reopened   a rejected repair
--     anything but resolved -> assigned reassignment
--
-- The officer's terminal state is 'proof_submitted', not 'resolved'.
-- That is the point of having a verification stage: an officer
-- declaring their own work resolved is the thing sign-off exists to
-- prevent.

create or replace function public.work_order_transition_allowed(
  p_from public.work_order_status,
  p_to public.work_order_status,
  p_is_oversight boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- Re-saving the same status is not a transition. Harmless, and the
    -- trigger short-circuits before ever asking, but an explicit true
    -- keeps this function total.
    p_from = p_to

    -- ---------- the officer's path ----------
    or (p_from, p_to) in (
      ('assigned',    'accepted'),
      ('accepted',    'in_progress'),
      ('in_progress', 'proof_submitted'),
      ('reopened',    'in_progress')
    )

    -- ---------- oversight's path ----------
    or (
      p_is_oversight
      and (
        (p_from, p_to) in (
          ('proof_submitted',      'supervisor_review'),
          ('proof_submitted',      'reopened'),
          ('supervisor_review',    'citizen_confirmation'),
          ('supervisor_review',    'reopened'),
          ('citizen_confirmation', 'resolved'),
          ('citizen_confirmation', 'reopened'),
          ('resolved',             'reopened')
        )
        -- Reassignment. Allowed from anywhere except a closed order,
        -- because reassigning a resolved job would quietly reopen it
        -- without recording that the repair was rejected.
        or (p_to = 'assigned' and p_from <> 'resolved')
      )
    );
$$;

comment on function public.work_order_transition_allowed is
  'The work-order state machine. Officer path plus, for oversight, sign-off and reassignment.';


-- ============================================================
-- 2. TRANSITION ENFORCEMENT
-- ============================================================
-- BEFORE UPDATE, so an invalid transition never reaches the table and
-- the triggers below never fire on one.

create or replace function public.enforce_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_oversight boolean := public.is_oversight();
  proof_count integer;
begin

  -- ----------------------------------------------------------
  -- Caller-supplied lifecycle timestamps are refused outright.
  --
  -- Refused rather than overwritten: silently replacing a value the
  -- caller sent makes a client that thinks it is recording history look
  -- like it succeeded. The stamps below are the only source.
  -- ----------------------------------------------------------
  if new.accepted_at is distinct from old.accepted_at
     or new.started_at is distinct from old.started_at
     or new.completed_at is distinct from old.completed_at then
    -- The trigger's own stamping happens after this check by assigning
    -- to NEW below, so this only ever catches a caller.
    raise exception
      'Work order timestamps are recorded by the system, not by the caller'
      using errcode = '42501',
            hint = 'Send only the new status; accepted_at, started_at and completed_at are stamped server-side.';
  end if;

  -- ----------------------------------------------------------
  -- A change of assignee resets the assignment clock.
  --
  -- Handled before the status short-circuit below, because oversight
  -- can hand on a work order that is already in `assigned` — in which
  -- case the status does not change and nothing further down would run.
  -- The new officer would otherwise inherit the previous one's
  -- assigned_at and be measured against their SLA.
  --
  -- Whether they are *allowed* to reassign is enforce_work_order_
  -- authority()'s decision, not this trigger's.
  -- ----------------------------------------------------------
  if new.officer_id is distinct from old.officer_id then
    new.assigned_at := clock_timestamp();
    new.accepted_at := null;
    new.started_at := null;
    new.completed_at := null;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- ----------------------------------------------------------
  -- An unassigned work order has no lifecycle to advance.
  --
  -- RLS already stops an officer here (officer_id = auth.uid() cannot
  -- hold when officer_id is null), but oversight passes it, and moving
  -- an unassigned order to 'accepted' records that nobody accepted it.
  -- ----------------------------------------------------------
  if new.officer_id is null and new.status <> 'assigned' then
    raise exception
      'This work order has no officer assigned'
      using errcode = '42501',
            hint = 'Assign an officer before advancing the work order.';
  end if;

  -- ----------------------------------------------------------
  -- The machine.
  -- ----------------------------------------------------------
  if not public.work_order_transition_allowed(
       old.status, new.status, is_oversight
     ) then
    raise exception
      'A work order cannot move from % to %', old.status, new.status
      using errcode = '42501',
            hint = case
              when is_oversight then
                'Valid next steps depend on the current stage; a resolved work order can only be reopened.'
              else
                'Accept, then start, then submit proof. Sign-off is a supervisor decision.'
            end;
  end if;

  -- ----------------------------------------------------------
  -- Proof must exist before it can be submitted.
  --
  -- Checked here rather than trusted from the UI: the page disables its
  -- button without a photograph, but a hand-written PATCH does not go
  -- through the page.
  -- ----------------------------------------------------------
  if new.status = 'proof_submitted' then
    select count(*) into proof_count
    from public.resolution_proofs
    where work_order_id = new.id;

    if proof_count = 0 then
      raise exception
        'Submit at least one photograph of the completed work first'
        using errcode = '23514',
              hint = 'Upload proof of work, then submit for verification.';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Lifecycle stamps, from the server clock.
  --
  -- clock_timestamp(), not now(): now() is transaction-start time, so a
  -- transition and the audit row it produces would carry identical
  -- timestamps and a timeline could not order them.
  -- ----------------------------------------------------------
  if new.status = 'accepted' then
    new.accepted_at := clock_timestamp();
  elsif new.status = 'in_progress' then
    new.started_at := clock_timestamp();
  elsif new.status = 'resolved' then
    new.completed_at := clock_timestamp();
  elsif new.status = 'assigned' then
    /*
     * Back to `assigned` without the assignee changing — oversight
     * pulling a job back to the top of its own officer's queue. Same
     * reasoning as the reassignment reset above: acceptance and start
     * times describe a pass through the work that is being redone, and
     * leaving them would put an "Accepted" entry on the timeline before
     * the assignment it belongs to. The audit trail keeps the history;
     * these four columns describe the current attempt only.
     */
    new.assigned_at := clock_timestamp();
    new.accepted_at := null;
    new.started_at := null;
    new.completed_at := null;
  end if;

  return new;

end;
$$;


drop trigger if exists work_orders_enforce_transition on public.work_orders;

-- Fires before work_orders_enforce_authority (alphabetical order among
-- BEFORE triggers on the same event: "work_orders_enforce_authority"
-- sorts before "work_orders_enforce_transition"), so both run and
-- either can veto. Neither depends on the other's outcome.
create trigger work_orders_enforce_transition
before update on public.work_orders
for each row
execute function public.enforce_work_order_transition();


-- ============================================================
-- 3. THE AUDIT TRAIL, WRITTEN BY THE DATABASE
-- ============================================================
-- AFTER UPDATE: the transition has passed every check by the time it is
-- recorded, and a statement rolled back later takes its audit row with
-- it.

create or replace function public.record_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin

  if new.status is not distinct from old.status then
    return new;
  end if;

  /*
   * created_by is NOT NULL, and a transition can legitimately have no
   * JWT behind it — a migration, or a server task. Attributing those to
   * the officer would be worse than not recording them, so fall back to
   * the assignee only when there is genuinely no session, and let the
   * null case fail loudly rather than inventing an actor.
   */
  insert into public.work_order_updates
    (work_order_id, status, note, created_by)
  values
    (
      new.id,
      new.status,
      nullif(
        current_setting('app.work_order_note', true),
        ''
      ),
      coalesce(actor, new.officer_id)
    );

  return new;

end;
$$;


drop trigger if exists work_orders_record_transition on public.work_orders;

create trigger work_orders_record_transition
after update of status on public.work_orders
for each row
execute function public.record_work_order_transition();


-- ============================================================
-- 4. THE CITIZEN'S VIEW, KEPT IN STEP
-- ============================================================
-- Every work-order status has a complaint status that means the same
-- thing to the person who filed it. Advancing one without the other is
-- how a citizen ends up tracking a repair that has already happened.
--
-- SECURITY DEFINER because the officer updating the work order has no
-- policy permitting them to update that citizen's complaint, and should
-- not: this is the one derived write, and it writes one column.

create or replace function public.sync_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.complaint_status;
begin

  /*
   * INSERT as well as UPDATE. Creating a work order *is* the assignment,
   * and it was the one transition nothing propagated: the application
   * followed its insert with a separate best-effort UPDATE on the
   * complaint, so a citizen whose report had just been assigned to an
   * officer could still be looking at "Submitted" with nothing to
   * reconcile the two.
   */
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  target := case new.status
    when 'assigned'             then 'assigned'
    when 'accepted'             then 'accepted'
    when 'in_progress'          then 'in_progress'
    when 'proof_submitted'      then 'proof_submitted'
    when 'supervisor_review'    then 'supervisor_review'
    when 'citizen_confirmation' then 'citizen_confirmation'
    when 'resolved'             then 'resolved'
    when 'reopened'             then 'reopened'
  end::public.complaint_status;

  if target is null then
    return new;
  end if;

  /*
   * The complaint's own column trigger, enforce_complaint_authority(),
   * restricts who may change status. This function runs as the table
   * owner but auth.uid() is unchanged by SECURITY DEFINER, so the
   * trigger would judge it as the officer and refuse. The sanctioned
   * flag is the same mechanism apply_complaint_triage() uses, and is
   * transaction-local: PostgREST gives every request its own
   * transaction, and no function granted to `authenticated` sets
   * arbitrary GUCs, so it cannot be set from outside.
   */
  perform set_config('app.sanctioned_triage', 'on', true);

  update public.complaints
  set status = target
  where id = new.complaint_id
    and status is distinct from target;

  perform set_config('app.sanctioned_triage', 'off', true);

  return new;

end;
$$;


drop trigger if exists work_orders_sync_complaint on public.work_orders;

-- `after insert or update of status`: an INSERT has no old row to
-- compare against, which is why the function branches on tg_op rather
-- than reading OLD unconditionally.
create trigger work_orders_sync_complaint
after insert or update of status on public.work_orders
for each row
execute function public.sync_complaint_status();


-- ============================================================
-- 5. THE CALLER-FACING ENTRY POINT
-- ============================================================
-- advance_work_order() exists so the client sends an intent — "accept
-- this", "I have finished" — rather than a row patch, and so the note
-- accompanying a transition reaches the audit row the trigger writes.
--
-- SECURITY INVOKER, deliberately. Every check that matters is a policy
-- or a trigger, and running as the caller means this function cannot
-- become a way around them: an officer calling it about someone else's
-- work order is refused by the same RLS that refuses their PATCH.
-- Its value is the note, the transaction, and one readable error.

create or replace function public.advance_work_order(
  p_work_order_id uuid,
  p_status public.work_order_status,
  p_note text default null
)
returns public.work_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.work_orders;
begin

  if p_work_order_id is null then
    raise exception 'A work order id is required'
      using errcode = '22004';
  end if;

  /*
   * The note travels to the audit trigger through a transaction-local
   * setting rather than a parameter, because the trigger fires on any
   * UPDATE — including an oversight reassignment that never goes
   * through this function — and a parameter it cannot see would make
   * the note look optional in one path and impossible in another.
   */
  perform set_config(
    'app.work_order_note',
    coalesce(nullif(btrim(p_note), ''), ''),
    true
  );

  update public.work_orders
  set status = p_status
  where id = p_work_order_id
  returning * into updated;

  -- Cleared so a later UPDATE in the same transaction cannot inherit
  -- this note and attribute it to a different transition.
  perform set_config('app.work_order_note', '', true);

  /*
   * No row means the work order does not exist, or the caller cannot
   * see it. Deliberately one message for both: distinguishing them
   * would confirm the existence of work orders the caller has no
   * business knowing about.
   */
  if updated.id is null then
    raise exception
      'That work order is not available to you'
      using errcode = '42501',
            hint = 'It may not exist, or it may be assigned to another officer.';
  end if;

  return updated;

end;
$$;

comment on function public.advance_work_order is
  'Advance a work order and record the transition. Runs as the caller: RLS and the lifecycle triggers remain the authority.';

revoke all on function public.advance_work_order(uuid, public.work_order_status, text) from public;
grant execute on function public.advance_work_order(uuid, public.work_order_status, text) to authenticated;

revoke all on function public.work_order_transition_allowed(
  public.work_order_status, public.work_order_status, boolean
) from public;
grant execute on function public.work_order_transition_allowed(
  public.work_order_status, public.work_order_status, boolean
) to authenticated;


-- ============================================================
-- 6. THE COMPLAINT'S HISTORY CARRIES THE OFFICER'S NOTE
-- ============================================================
-- complaint_status_history.note existed and was never populated, so a
-- citizen's timeline could say "In progress" but never why, even when
-- the officer had written it down. The note the officer submits with a
-- transition is the most useful thing the citizen could be told, so it
-- travels through the same transaction-local setting.

create or replace function public.record_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if tg_op = 'INSERT' then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by)
    values
      (new.id, new.status, (select auth.uid()));

    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by, note, created_at)
    values
      (
        new.id,
        new.status,
        (select auth.uid()),
        nullif(current_setting('app.work_order_note', true), ''),
        -- clock_timestamp(), not the column default now(): now() is
        -- fixed for the transaction, so two transitions in one
        -- transaction got identical timestamps and a timeline ordered
        -- them by uuid.
        clock_timestamp()
      );
  end if;

  return new;

end;
$$;


-- ============================================================
-- 7. STAFF DIRECTORY FOR ASSIGNMENT
-- ============================================================
-- The authority queue can assign a complaint to an officer, but had no
-- way to list officers: profiles are readable, yet a client filtering
-- on role has to know the enum and sees supervisors and admins too.
--
-- SECURITY INVOKER, so the profile read is still the caller's. A
-- citizen calling this gets whatever the profile policies allow them,
-- which is their own row and no officers.

create or replace function public.assignable_officers()
returns table (
  id uuid,
  full_name text,
  open_work_orders bigint
)
language sql
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    count(w.id) filter (
      where w.status in ('assigned', 'accepted', 'in_progress', 'reopened')
    ) as open_work_orders
  from public.profiles p
  left join public.work_orders w on w.officer_id = p.id
  where p.role in ('officer', 'supervisor')
  group by p.id, p.full_name
  order by open_work_orders asc, p.full_name asc;
$$;

comment on function public.assignable_officers is
  'Officers and supervisors with their open work-order counts, for assignment. Runs as the caller.';

revoke all on function public.assignable_officers() from public;
grant execute on function public.assignable_officers() to authenticated;


notify pgrst, 'reload schema';
