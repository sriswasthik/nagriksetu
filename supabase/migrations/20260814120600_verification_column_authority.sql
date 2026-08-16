-- ============================================================
-- VERIFICATION COLUMN AUTHORITY
-- ============================================================
--
-- THE HOLE
--
-- public.verifications carries two independent sign-offs in one row:
--
--   supervisor_status / supervisor_comment / supervisor_id
--   citizen_status    / citizen_comment
--
-- The "Verification update access" policy in
-- 20260814120000_role_helpers_and_staff_rls.sql grants UPDATE on the
-- row to oversight *or* the reporting citizen, and its own comment says
-- column separation is "enforced in the service layer". It is not a
-- boundary: the service layer is JavaScript in the citizen's browser,
-- and the anon key lets anyone issue an arbitrary PostgREST PATCH
-- against a row the policy admits.
--
-- Verified against PostgreSQL 16: the reporting citizen could set
--
--   supervisor_status  = 'rejected'
--   supervisor_comment = 'Forged by the reporting citizen'
--   supervisor_id      = <their own id>
--
-- on their own complaint's verification and the UPDATE succeeded. A
-- citizen could manufacture — or overturn — a municipal inspector's
-- verdict, and the forged row is what the officer's dashboard and the
-- audit both read back.
--
-- Row-level security cannot express this, because the two parties need
-- write access to the same row. A BEFORE UPDATE trigger can, so column
-- authority is enforced here instead of being asserted in a comment.
--
-- WHO OWNS WHICH COLUMNS
--
--   supervisor_* — oversight only (supervisor, government_admin)
--   citizen_*    — the reporting citizen, or oversight acting for them
--                  (a phone-in confirmation still has to be recordable)
--   verified_at  — derived, never client-supplied: it is stamped when
--                  both parties have approved and cleared otherwise.
--
-- Anything a caller is not entitled to change is rejected outright
-- rather than silently reverted, so a buggy client fails loudly instead
-- of appearing to succeed.
-- ============================================================

create or replace function public.enforce_verification_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_oversight boolean := public.is_oversight();
  is_reporter boolean;
begin

  select exists (
    select 1
    from public.work_orders w
    where w.id = new.work_order_id
      and public.owns_complaint(w.complaint_id)
  ) into is_reporter;

  -- ----------------------------------------------------------
  -- Supervisor columns
  -- ----------------------------------------------------------
  if not is_oversight then
    if new.supervisor_status is distinct from old.supervisor_status
       or new.supervisor_comment is distinct from old.supervisor_comment
       or new.supervisor_id is distinct from old.supervisor_id then
      raise exception
        'Only a supervisor or administrator may record the supervisor verdict'
        using errcode = '42501';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Citizen columns
  -- ----------------------------------------------------------
  if not (is_reporter or is_oversight) then
    if new.citizen_status is distinct from old.citizen_status
       or new.citizen_comment is distinct from old.citizen_comment then
      raise exception
        'Only the reporting citizen may record the citizen confirmation'
        using errcode = '42501';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- work_order_id is the row's identity; repointing a verification at
  -- another work order would move a verdict onto work it never covered.
  -- ----------------------------------------------------------
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'A verification cannot be moved to another work order'
      using errcode = '42501';
  end if;

  -- ----------------------------------------------------------
  -- verified_at is derived, so no caller has to be trusted with it.
  -- ----------------------------------------------------------
  if new.supervisor_status = 'approved' and new.citizen_status = 'approved' then
    new.verified_at := coalesce(old.verified_at, now());
  else
    new.verified_at := null;
  end if;

  return new;

end;
$$;


drop trigger if exists verifications_enforce_authority on public.verifications;

create trigger verifications_enforce_authority
before update on public.verifications
for each row
execute function public.enforce_verification_authority();


-- ------------------------------------------------------------
-- On insert, the opening row must start neutral.
--
-- "Oversight can open verification" allows only oversight to insert, so
-- this is not a privilege check — it stops a verification being created
-- pre-approved, which would skip both sign-offs in one statement.
-- ------------------------------------------------------------

create or replace function public.enforce_verification_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if new.citizen_status is distinct from 'pending' then
    raise exception
      'A verification must be created with citizen_status = pending'
      using errcode = '42501';
  end if;

  new.verified_at := null;

  return new;

end;
$$;


drop trigger if exists verifications_enforce_insert on public.verifications;

create trigger verifications_enforce_insert
before insert on public.verifications
for each row
execute function public.enforce_verification_insert();
