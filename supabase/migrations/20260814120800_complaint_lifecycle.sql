-- ============================================================
-- COMPLAINT LIFECYCLE: HISTORY, IDEMPOTENT SUBMISSION, TRIAGE STATUS
-- ============================================================
--
-- Three gaps in the citizen flow, each reproduced against
-- PostgreSQL 16 and each asserted in
-- supabase/tests/03_complaint_lifecycle_test.sql.
--
--
-- 1. STATUS HISTORY WAS NEVER RECORDED
--
--    IssueTimeline renders six stages and a timestamp per stage, but the
--    only timestamps available were complaints.created_at and
--    complaints.updated_at. updated_at is overwritten by every
--    subsequent change, so a report that went submitted -> ai_analyzed
--    -> assigned -> in_progress could say when it was filed and when it
--    last moved, and nothing in between. Every completed stage rendered
--    a bare "Completed." with no date.
--
--    work_order_updates records transitions, but only after an officer
--    is assigned — it cannot describe triage or routing, and it does not
--    exist for a complaint that was never assigned.
--
--
-- 2. A DOUBLE SUBMIT CREATED TWO COMPLAINTS
--
--    The report form guarded its button with isSubmitting, which stops a
--    second click but not a retry: if the insert succeeded and the
--    response was lost to a flaky connection, the form surfaced an error
--    and the citizen pressed Submit again, filing the same issue twice.
--    Duplicates then compete for the same crew and inflate every count
--    on the authority dashboard.
--
--    submit_complaint() takes a client-generated submission_key and is
--    idempotent on it: a retry returns the complaint that already
--    exists rather than making another. The key also gives the client
--    something safe to retry *with*, which is what makes a lost
--    response recoverable instead of ambiguous.
--
--
-- 3. TRIAGE NEVER ADVANCED THE CITIZEN-VISIBLE STATUS
--
--    public.complaint_status has an `ai_analyzed` value and the timeline
--    has a "Triaged" stage for it, but nothing in the codebase ever set
--    it. apply_complaint_triage() wrote the priority, department and
--    ai_* columns and left `status` at 'submitted', so a citizen watched
--    their report sit at "Reported" after it had in fact been
--    classified and routed. Fixed here, in the one function that
--    performs triage.
-- ============================================================


-- ============================================================
-- 1. STATUS HISTORY
-- ============================================================

create table if not exists public.complaint_status_history (
  id uuid primary key default gen_random_uuid(),

  complaint_id uuid not null
    references public.complaints(id)
    on delete cascade,

  status public.complaint_status not null,

  -- Null for the submission row and for anything a trigger records
  -- without a JWT (a migration, a server task).
  changed_by uuid
    references public.profiles(id)
    on delete set null,

  note text,

  created_at timestamptz not null default now()
);

create index if not exists complaint_status_history_complaint_id_idx
  on public.complaint_status_history(complaint_id, created_at);

alter table public.complaint_status_history enable row level security;


-- Written only by the trigger below, which is SECURITY DEFINER. There is
-- deliberately no INSERT, UPDATE or DELETE policy: an audit trail that
-- its subject can edit is not an audit trail.
drop policy if exists "Status history read" on public.complaint_status_history;

create policy "Status history read"
on public.complaint_status_history
for select
to authenticated
using (
  public.is_staff()
  or public.owns_complaint(complaint_id)
);


create or replace function public.record_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  -- On insert, record the status the complaint was filed with.
  if tg_op = 'INSERT' then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by)
    values
      (new.id, new.status, (select auth.uid()));

    return new;
  end if;

  -- On update, record only genuine transitions.
  if new.status is distinct from old.status then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by)
    values
      (new.id, new.status, (select auth.uid()));
  end if;

  return new;

end;
$$;


drop trigger if exists complaints_record_status on public.complaints;

-- AFTER, not BEFORE: the row must exist before a child row can
-- reference it, and a transition that is rolled back by a later
-- constraint must not leave a history entry behind.
create trigger complaints_record_status
after insert or update of status on public.complaints
for each row
execute function public.record_complaint_status();


-- ------------------------------------------------------------
-- Backfill, so complaints filed before this migration still show a
-- submission event rather than an empty timeline.
--
-- Only the first stage can be reconstructed honestly: created_at is the
-- one transition timestamp that was never overwritten. Inventing dates
-- for the stages in between would put fabricated history in front of a
-- citizen.
-- ------------------------------------------------------------

insert into public.complaint_status_history (complaint_id, status, created_at, note)
select
  c.id,
  'submitted'::public.complaint_status,
  c.created_at,
  'Backfilled from complaints.created_at'
from public.complaints c
where not exists (
  select 1 from public.complaint_status_history h
  where h.complaint_id = c.id
);


-- ============================================================
-- 2. IDEMPOTENT SUBMISSION
-- ============================================================

alter table public.complaints
  add column if not exists submission_key uuid;

-- Partial, so the rows that predate this column do not collide on null.
create unique index if not exists complaints_submission_key_key
  on public.complaints(submission_key)
  where submission_key is not null;


-- The key identifies one attempt to file one report, so it belongs to
-- the row for good. Fold it into the identity check rather than adding a
-- second trigger.
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
     or new.created_at is distinct from old.created_at
     or new.submission_key is distinct from old.submission_key then
    raise exception
      'A complaint''s identity and reporter cannot be changed'
      using errcode = '42501',
            hint = 'id, complaint_number, citizen_id, submission_key and created_at are fixed at submission.';
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


-- ------------------------------------------------------------
-- submit_complaint()
--
-- One statement, so the complaint either exists in full or not at all.
-- Evidence is uploaded separately and cannot join this transaction —
-- object storage is a different system — which is why a failed upload
-- leaves a valid complaint and a retryable file rather than rolling
-- anything back.
--
-- SECURITY INVOKER (the default) on purpose: the "Citizens can create
-- their own complaints" policy should still apply. citizen_id is taken
-- from auth.uid() and never from an argument, so a caller cannot file in
-- somebody else's name whatever they send.
-- ------------------------------------------------------------

create or replace function public.submit_complaint(
  p_submission_key uuid,
  p_title text,
  p_description text,
  p_category public.complaint_category,
  p_latitude double precision,
  p_longitude double precision,
  p_address text,
  p_ward_id uuid default null
)
returns public.complaints
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  existing public.complaints;
  created public.complaints;
begin

  if actor is null then
    raise exception 'You must be signed in to file a report'
      using errcode = '42501';
  end if;

  if p_submission_key is null then
    raise exception 'A submission key is required'
      using errcode = '22023',
            hint = 'Generate one per attempt so a retry cannot duplicate the report.';
  end if;

  -- ----------------------------------------------------------
  -- Idempotency.
  --
  -- The fast path: this caller is retrying their own submission, so the
  -- row is visible to them and returning it is all that is needed.
  --
  -- This function is SECURITY INVOKER so that the "Citizens can create
  -- their own complaints" policy still governs the insert. The
  -- consequence is that this SELECT cannot see a key used by a
  -- *different* citizen — RLS hides it — so that case cannot be detected
  -- here. It is caught by the unique index instead, in the exception
  -- handler at the foot of the function.
  --
  -- The index is also what makes two simultaneous submissions of the
  -- same key safe: only one can win it.
  -- ----------------------------------------------------------
  select * into existing
  from public.complaints
  where submission_key = p_submission_key;

  if existing.id is not null then
    return existing;
  end if;

  -- ----------------------------------------------------------
  -- Validation.
  --
  -- Repeated from the form deliberately: the form is a courtesy to the
  -- person typing, this is the rule. A direct PostgREST call reaches
  -- here without ever seeing the form.
  -- ----------------------------------------------------------
  if p_title is null or length(btrim(p_title)) < 5 then
    raise exception 'A report needs a title of at least 5 characters'
      using errcode = '22023';
  end if;

  if length(btrim(p_title)) > 150 then
    raise exception 'That title is too long (150 characters maximum)'
      using errcode = '22023';
  end if;

  if p_description is null or length(btrim(p_description)) < 10 then
    raise exception 'A report needs a description of at least 10 characters'
      using errcode = '22023';
  end if;

  if length(btrim(p_description)) > 2000 then
    raise exception 'That description is too long (2000 characters maximum)'
      using errcode = '22023';
  end if;

  -- Coordinates are what send a crew to the right street, so a
  -- transposed or malformed pair must not be storable.
  if p_latitude is null or p_longitude is null then
    raise exception 'A report needs a location'
      using errcode = '22023';
  end if;

  if p_latitude < -90 or p_latitude > 90 then
    raise exception 'Latitude must be between -90 and 90, got %', p_latitude
      using errcode = '22023';
  end if;

  if p_longitude < -180 or p_longitude > 180 then
    raise exception 'Longitude must be between -180 and 180, got %', p_longitude
      using errcode = '22023';
  end if;

  -- Null Island: 0,0 is what a failed GPS read looks like, not a place
  -- anyone reports a pothole.
  if p_latitude = 0 and p_longitude = 0 then
    raise exception 'Those coordinates look like a failed location read'
      using errcode = '22023',
            hint = 'Capture the location again or place the pin on the map.';
  end if;

  if p_address is null or length(btrim(p_address)) < 5 then
    raise exception 'A report needs an address or nearby landmark'
      using errcode = '22023';
  end if;

  -- complaint_number is assigned by complaints_set_number, and the
  -- initial status history row by complaints_record_status.
  insert into public.complaints (
    submission_key,
    citizen_id,
    title,
    description,
    category,
    status,
    latitude,
    longitude,
    address,
    ward_id
  )
  values (
    p_submission_key,
    actor,
    btrim(p_title),
    btrim(p_description),
    coalesce(p_category, 'other'),
    'submitted',
    p_latitude,
    p_longitude,
    btrim(p_address),
    p_ward_id
  )
  returning * into created;

  return created;

exception
  when unique_violation then
    -- Two submissions of this caller's own key raced: whichever lost the
    -- index returns the row the winner created, so the citizen still
    -- sees one report and one tracking number.
    select * into existing
    from public.complaints
    where submission_key = p_submission_key;

    if existing.id is not null then
      return existing;
    end if;

    -- The key exists but is invisible to this caller, so it belongs to
    -- someone else. Raised as a readable message rather than letting a
    -- bare 23505 reach the form — and deliberately without confirming
    -- anything about the other report.
    raise exception 'That submission key has already been used'
      using errcode = '42501',
            hint = 'Start a new report rather than reusing a key.';
end;
$$;

grant execute on function public.submit_complaint(
  uuid, text, text, public.complaint_category,
  double precision, double precision, text, uuid
) to authenticated;


-- ============================================================
-- 3. TRIAGE ADVANCES THE STATUS
-- ============================================================
-- Only the `submitted` -> `ai_analyzed` step, and only from
-- `submitted`: a complaint an administrator has already assigned must
-- not be dragged backwards by a late triage pass.

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

  select id into resolved_department
  from public.departments
  where code = p_department_code;

  perform set_config('app.sanctioned_triage', 'on', true);

  update public.complaints
     set category           = coalesce(p_category, category),
         priority_level     = coalesce(p_priority_level, priority_level),
         priority_score     = least(greatest(coalesce(p_priority_score, 0), 0), 100),
         priority_reason    = p_priority_reason,
         department_id       = coalesce(resolved_department, department_id),

         -- The citizen-facing step. Guarded so a late pass cannot pull
         -- an already-assigned complaint back to triage.
         status = case
           when target.status = 'submitted' then 'ai_analyzed'
           else target.status
         end,

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
         ai_processed_at     = now(),
         ai_error_message    = null
   where id = p_complaint_id
  returning * into updated;

  perform set_config('app.sanctioned_triage', 'off', true);

  return updated;

end;
$$;

grant execute on function public.apply_complaint_triage(
  uuid, public.complaint_category, public.priority_level, integer, text, text,
  text, text, text, text, numeric, text, text, boolean, uuid, text
) to authenticated;
