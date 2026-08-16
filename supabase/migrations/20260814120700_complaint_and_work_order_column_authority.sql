-- ============================================================
-- COLUMN AUTHORITY ON COMPLAINTS AND WORK ORDERS
-- ============================================================
--
-- Row-level security decides *which rows* a caller may touch. It cannot
-- say which *columns*, and both of these tables are written by two
-- parties with different authority over the same row: the citizen owns
-- the report, the municipality owns the triage. The existing policies
-- grant each side the whole row.
--
-- Every finding below was reproduced against PostgreSQL 16 through the
-- policies themselves, and each has an assertion in
-- supabase/tests/02_auth_boundary_test.sql.
--
--
-- 1. A CITIZEN COULD CLOSE THEIR OWN COMPLAINT AND REWRITE ITS TRIAGE
--
--    "Citizens can update their own complaints" is
--    `citizen_id = auth.uid()` on both USING and WITH CHECK, so a
--    citizen could issue one PATCH setting
--
--      status         = 'resolved'
--      priority_level = 'low'
--      priority_score = 0
--      sla_due_at     = now() + interval '999 days'
--      department_id  = null
--
--    and it succeeded. Consequences, in order of seriousness:
--
--      * analytics_summary() then counts the complaint as resolved and
--        within SLA, so any citizen could inflate the city's published
--        resolution rate and SLA compliance from their own browser.
--      * Setting priority_level = 'critical' jumps the queue ahead of
--        genuinely urgent reports.
--      * Pushing sla_due_at forward evades breach detection entirely.
--
--    The citizen does need one status transition: reopening a repair
--    they are not satisfied with. That is allowed, and nothing else is.
--
--
-- 2. STAFF COULD REWRITE A CITIZEN'S WORDS AND TRANSFER OWNERSHIP
--
--    "Staff can update complaint workflow" is likewise whole-row, so an
--    officer or administrator could rewrite `title` and `description` —
--    the citizen's own account of what they saw, which is the evidence
--    a complaint rests on — and, worse, set `citizen_id` to a different
--    user. That last one silently removes the report from the real
--    reporter's dashboard and hands it, with its photos, to somebody
--    else: an IDOR performed on the citizen's behalf.
--
--
-- 3. AN OFFICER COULD REPOINT THEIR WORK ORDER AT ANOTHER COMPLAINT
--
--    The assigned officer could change `work_orders.complaint_id` to any
--    complaint without one. Because updateWorkOrderStatus() syncs the
--    parent complaint's status after every transition, an officer could
--    attach their work order to an unrelated citizen's report and mark
--    that report resolved.
--
--    Officer-to-officer theft was already blocked and stays blocked:
--    officer B cannot see or update officer A's row, and the assigned
--    officer cannot hand the row to someone else, because the WITH
--    CHECK stops being satisfied the moment they are not the assignee.
--    Only oversight reassigns.
--
--
-- 4. THE AI TRIAGE RAN IN THE CITIZEN'S BROWSER
--
--    processComplaintWithAI() is called from
--    app/citizen/complaints/[id]/page.tsx with the browser client, so
--    the write that decides a complaint's priority, department and SLA
--    was issued by the reporting citizen's own session. The
--    classification was advisory at best: whatever the browser PATCHed
--    became the municipality's triage.
--
--    Locking the triage columns above would break that flow, so this
--    migration also gives it a legitimate path:
--    apply_complaint_triage() and set_complaint_ai_status(), both
--    SECURITY DEFINER, owner-or-staff, and — for the triage itself —
--    once only. That bounds the problem to a citizen influencing the
--    *initial* classification of their own report, and closes the parts
--    that were open-ended: re-escalating later, rewriting the triage
--    after staff have set it, and moving the SLA deadline.
--
--    See "Remaining" at the foot of this file.
--
--
-- WHAT IS DELIBERATELY STILL ALLOWED
--
--   * Staff set status, department, ward, priority and SLA. That is the
--     triage, and it is their job.
--   * Citizens correct their own title, description, category and
--     location, because a report filed in a hurry is often wrong.
--   * Oversight reassigns work orders between officers.
--
-- `id`, `complaint_number` and `citizen_id` are identity: nobody
-- changes them after insert, including staff. Anything a caller is not
-- entitled to change raises rather than being silently reverted, so a
-- buggy client fails loudly instead of appearing to succeed.
--
--
-- REMAINING
--
-- A citizen can still influence the first classification of their own
-- complaint, because the classifier itself is TypeScript in the
-- browser. Fully closing that means running it server-side — an Edge
-- Function, or a route handler with a service-role key — and rewriting
-- nothing else, since apply_complaint_triage() is already the only
-- write path. Until then, `ai_model` records which classifier produced
-- the values, and once-only means staff triage cannot be overwritten
-- afterwards.
-- ============================================================


-- ============================================================
-- 1. COMPLAINTS
-- ============================================================

create or replace function public.enforce_complaint_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_staff boolean := public.is_staff();
  is_owner boolean := old.citizen_id = (select auth.uid());
begin

  -- ----------------------------------------------------------
  -- The sanctioned triage path.
  --
  -- apply_complaint_triage() is SECURITY DEFINER, but that changes the
  -- executing *role*, not auth.uid() — the JWT claim is still the
  -- citizen's, so this trigger would otherwise block the very function
  -- written to let them triage once. The function sets a
  -- transaction-local flag to say "the caller has already been
  -- authorised by name".
  --
  -- A client cannot forge it: PostgREST gives each request its own
  -- transaction, `set_config(..., true)` is scoped to that transaction,
  -- and no function exposed to `authenticated` sets arbitrary GUCs. A
  -- direct PATCH therefore always arrives with the flag unset.
  -- ----------------------------------------------------------
  if coalesce(current_setting('app.sanctioned_triage', true), '') = 'on' then
    return new;
  end if;

  -- ----------------------------------------------------------
  -- Identity is immutable for everybody.
  -- ----------------------------------------------------------
  if new.id is distinct from old.id
     or new.complaint_number is distinct from old.complaint_number
     or new.citizen_id is distinct from old.citizen_id
     or new.created_at is distinct from old.created_at then
    raise exception
      'A complaint''s identity and reporter cannot be changed'
      using errcode = '42501',
            hint = 'id, complaint_number, citizen_id and created_at are fixed at submission.';
  end if;

  -- ----------------------------------------------------------
  -- The citizen's account of the issue belongs to the citizen.
  -- ----------------------------------------------------------
  if not is_owner then
    if new.title is distinct from old.title
       or new.description is distinct from old.description then
      raise exception
        'Only the reporting citizen may edit the report text'
        using errcode = '42501',
              hint = 'Record municipal findings in work_order_updates or priority_reason instead.';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Triage belongs to the municipality.
  --
  -- Checked for anyone who is not staff, which is every citizen
  -- including the owner.
  -- ----------------------------------------------------------
  if not is_staff then
    if new.priority_score is distinct from old.priority_score
       or new.priority_level is distinct from old.priority_level
       or new.priority_reason is distinct from old.priority_reason
       or new.sla_due_at is distinct from old.sla_due_at
       or new.department_id is distinct from old.department_id
       or new.ward_id is distinct from old.ward_id then
      raise exception
        'Only municipal staff may change priority, SLA, department or ward'
        using errcode = '42501';
    end if;

    -- AI triage is written by the analysis service running as staff.
    if new.ai_analysis_status is distinct from old.ai_analysis_status
       or new.ai_category is distinct from old.ai_category
       or new.ai_severity is distinct from old.ai_severity
       or new.ai_priority is distinct from old.ai_priority
       or new.ai_department is distinct from old.ai_department
       or new.ai_confidence is distinct from old.ai_confidence
       or new.ai_summary is distinct from old.ai_summary
       or new.ai_reasoning is distinct from old.ai_reasoning
       or new.ai_possible_duplicate is distinct from old.ai_possible_duplicate
       or new.ai_duplicate_complaint_id is distinct from old.ai_duplicate_complaint_id
       or new.ai_model is distinct from old.ai_model
       or new.ai_processed_at is distinct from old.ai_processed_at
       or new.ai_error_message is distinct from old.ai_error_message then
      raise exception
        'AI analysis fields are not citizen-writable'
        using errcode = '42501';
    end if;

    -- ------------------------------------------------------
    -- Status: the citizen gets exactly one transition.
    --
    -- Reopening is the whole point of the confirmation stage — a
    -- closed ticket should only stick if the problem is actually
    -- gone — so it is allowed, from the states where a repair is
    -- being or has been claimed. Every other move is the
    -- municipality's to make.
    -- ------------------------------------------------------
    if new.status is distinct from old.status then
      if not (
        is_owner
        and new.status = 'reopened'
        and old.status in (
          'proof_submitted',
          'supervisor_review',
          'citizen_confirmation',
          'resolved'
        )
      ) then
        raise exception
          'A citizen may only reopen a complaint once a repair has been submitted'
          using errcode = '42501',
                hint = 'Citizens may only move a complaint to reopened, and only once a repair has been submitted.';
      end if;
    end if;
  end if;

  return new;

end;
$$;


drop trigger if exists complaints_enforce_authority on public.complaints;

create trigger complaints_enforce_authority
before update on public.complaints
for each row
execute function public.enforce_complaint_authority();


-- ============================================================
-- 2. WORK ORDERS
-- ============================================================

create or replace function public.enforce_work_order_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  -- The complaint a work order serves is its reason for existing.
  -- Repointing it moves the officer's authority onto a report they were
  -- never assigned, and the complaint-status sync would then write to
  -- that other citizen's record.
  if new.complaint_id is distinct from old.complaint_id then
    raise exception
      'A work order cannot be moved to another complaint'
      using errcode = '42501',
            hint = 'Close this work order and assign the other complaint its own.';
  end if;

  if new.id is distinct from old.id
     or new.work_order_number is distinct from old.work_order_number
     or new.created_at is distinct from old.created_at then
    raise exception
      'A work order''s identity cannot be changed'
      using errcode = '42501';
  end if;

  -- Reassignment between officers stays an oversight decision. The
  -- policy's WITH CHECK already stops an assigned officer handing the
  -- row on, since they cease to satisfy it; this makes the rule
  -- explicit and gives a readable error instead of a bare policy
  -- violation.
  if new.officer_id is distinct from old.officer_id
     and not public.is_oversight() then
    raise exception
      'Only a supervisor or administrator may reassign a work order'
      using errcode = '42501';
  end if;

  return new;

end;
$$;


drop trigger if exists work_orders_enforce_authority on public.work_orders;

create trigger work_orders_enforce_authority
before update on public.work_orders
for each row
execute function public.enforce_work_order_authority();


-- ============================================================
-- 3. THE TRIAGE WRITE PATH
-- ============================================================
-- The only way a non-staff caller can touch the triage columns the
-- trigger above now protects.

create or replace function public.set_complaint_ai_status(
  p_complaint_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin

  if p_status not in ('pending', 'processing', 'completed', 'failed') then
    raise exception 'Unknown AI analysis status: %', p_status
      using errcode = '22023';
  end if;

  select citizen_id into owner_id
  from public.complaints
  where id = p_complaint_id;

  if owner_id is null then
    raise exception 'No such complaint' using errcode = 'P0002';
  end if;

  if owner_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'You may not analyse this complaint'
      using errcode = '42501';
  end if;

  perform set_config('app.sanctioned_triage', 'on', true);

  update public.complaints
     set ai_analysis_status = p_status,
         ai_error_message = p_error
   where id = p_complaint_id;

  perform set_config('app.sanctioned_triage', 'off', true);

end;
$$;


-- Applies a classification result. Once only for a citizen: a second
-- call would let the reporter re-run the classifier until it produced a
-- priority they preferred, or overwrite a triage staff had corrected.
create or replace function public.apply_complaint_triage(
  p_complaint_id uuid,
  p_category public.complaint_category,
  p_priority_level public.priority_level,
  p_priority_score integer,
  p_priority_reason text,
  p_department_code text,
  p_ai_category text,
  p_ai_severity text,
  p_ai_priority text,
  p_ai_department text,
  p_ai_confidence numeric,
  p_ai_summary text,
  p_ai_reasoning text,
  p_ai_possible_duplicate boolean,
  p_ai_duplicate_complaint_id uuid,
  p_ai_model text
)
returns public.complaints
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.complaints;
  resolved_department uuid;
  updated public.complaints;
begin

  select * into target from public.complaints where id = p_complaint_id;

  if target.id is null then
    raise exception 'No such complaint' using errcode = 'P0002';
  end if;

  if target.citizen_id <> (select auth.uid()) and not public.is_staff() then
    raise exception 'You may not triage this complaint'
      using errcode = '42501';
  end if;

  if target.ai_processed_at is not null and not public.is_staff() then
    raise exception 'This complaint has already been triaged'
      using errcode = '42501',
            hint = 'Ask a supervisor to re-triage it.';
  end if;

  -- Resolved here rather than accepted as an id, so a caller cannot
  -- route their complaint to an arbitrary department by uuid. An
  -- unknown code leaves the complaint unrouted, which is what the
  -- previous client-side lookup did too.
  select id into resolved_department
  from public.departments
  where code = p_department_code;

  perform set_config('app.sanctioned_triage', 'on', true);

  update public.complaints
     set category           = coalesce(p_category, category),
         priority_level     = coalesce(p_priority_level, priority_level),
         -- Clamped: the score drives queue ordering, and the caller is
         -- not necessarily trustworthy about it.
         priority_score     = least(greatest(coalesce(p_priority_score, 0), 0), 100),
         priority_reason    = p_priority_reason,
         department_id       = coalesce(resolved_department, department_id),

         ai_analysis_status  = 'completed',
         ai_category         = p_ai_category,
         ai_severity         = p_ai_severity,
         ai_priority         = p_ai_priority,
         ai_department       = p_ai_department,
         ai_confidence       = p_ai_confidence,
         ai_summary          = p_ai_summary,
         ai_reasoning        = p_ai_reasoning,
         ai_possible_duplicate     = coalesce(p_ai_possible_duplicate, false),
         ai_duplicate_complaint_id = p_ai_duplicate_complaint_id,
         ai_model            = p_ai_model,
         -- Server clock, so "when was this triaged" cannot be backdated
         -- to slip past an SLA report.
         ai_processed_at     = now(),
         ai_error_message    = null
   where id = p_complaint_id
  returning * into updated;

  -- Cleared immediately so nothing later in the same transaction rides
  -- on it. The flag covers one statement, not the request.
  perform set_config('app.sanctioned_triage', 'off', true);

  -- sla_due_at is deliberately not set here: the
  -- complaints_set_sla_due_at trigger derives it from the new priority
  -- and created_at, so a deadline can never be supplied by a caller.

  return updated;

end;
$$;


grant execute on function public.set_complaint_ai_status(uuid, text, text) to authenticated;
grant execute on function public.apply_complaint_triage(
  uuid, public.complaint_category, public.priority_level, integer, text, text,
  text, text, text, text, numeric, text, text, boolean, uuid, text
) to authenticated;
