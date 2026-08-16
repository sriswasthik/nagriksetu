-- ============================================================
-- ROLE ADMINISTRATION
-- ============================================================
--
-- THE BLOCKER
--
-- Nobody could ever hold a staff role, so the officer and government
-- halves of the product were unreachable in any freshly provisioned
-- database. Two rules combined to make it impossible:
--
--   1. handle_new_user() (20260813070406) hardcodes role = 'citizen'
--      for every profile it creates, and there is no INSERT policy on
--      public.profiles, so that trigger is the *only* way a profile is
--      ever created.
--
--   2. prevent_role_change() (20260813070443) raises unconditionally
--      whenever new.role is distinct from old.role.
--
-- Because the trigger has no exemption, it fires for every caller —
-- verified against PostgreSQL 16: the change is refused even for the
-- table owner and even with row-level security bypassed. There was no
-- SQL an operator could run to appoint the first officer.
--
-- WHAT THIS KEEPS
--
-- The trigger exists for a good reason: without it, the "Users can
-- update their own profile" policy would let any citizen set
-- role = 'government_admin' and take over the city dashboard. That
-- escalation stays blocked. The only thing added is a legitimate path.
--
-- WHO MAY ASSIGN ROLES
--
--   * government_admin — the product's administrator role.
--   * A trusted server context — the service_role key, a migration, or
--     the SQL editor. These present no JWT, so auth.uid() is null.
--     Reaching the trigger with a null auth.uid() already implies
--     row-level security was bypassed, because the UPDATE policy on
--     profiles is granted `to authenticated` only. This is the
--     bootstrap path for the very first administrator.
--
-- Everyone else is refused exactly as before, including supervisors:
-- appointing staff is an administrative act, not a supervisory one.
-- ============================================================


-- ============================================================
-- 1. IS THE CALLER ALLOWED TO SET ROLES?
-- ============================================================

create or replace function public.can_assign_roles()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Trusted server context: no end-user JWT is present.
    (select auth.uid()) is null
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'government_admin'
    );
$$;

comment on function public.can_assign_roles() is
  'True for a government_admin or a trusted server context (service_role, migration, SQL editor). Gates role assignment.';


-- ============================================================
-- 2. REPLACE THE UNCONDITIONAL GUARD
-- ============================================================
-- Same protection, now with the one legitimate exemption. The trigger
-- itself is unchanged (still BEFORE UPDATE on public.profiles), so
-- only the function body is replaced.

create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if new.role is distinct from old.role
     and not public.can_assign_roles() then
    raise exception
      'Role changes are not allowed through profile updates'
      using hint =
        'Only a government_admin may change a role. Use public.set_user_role().';
  end if;

  return new;

end;
$$;


-- ============================================================
-- 3. ADMINISTRATORS MAY UPDATE OTHER PROFILES
-- ============================================================
-- The existing update policy is limited to `auth.uid() = id`, so
-- without this an administrator could not touch anybody else's row at
-- all and the exemption above would be unreachable from the client.

drop policy if exists "Administrators can update any profile" on public.profiles;

create policy "Administrators can update any profile"
on public.profiles
for update
to authenticated
using (public.current_app_role() = 'government_admin')
with check (public.current_app_role() = 'government_admin');


-- ============================================================
-- 4. THE SUPPORTED ENTRY POINT
-- ============================================================
-- A single function so role assignment is one auditable operation
-- rather than an ad-hoc UPDATE, and so the caller gets a clear error
-- instead of a policy violation.

create or replace function public.set_user_role(
  target_user_id uuid,
  new_role public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous public.user_role;
  updated public.profiles;
begin

  if not public.can_assign_roles() then
    raise exception 'Only a government_admin may assign roles'
      using errcode = '42501';
  end if;

  select role into previous
  from public.profiles
  where id = target_user_id;

  if previous is null then
    raise exception 'No profile exists for %', target_user_id
      using errcode = 'P0002';
  end if;

  if previous = new_role then
    select * into updated from public.profiles where id = target_user_id;
    return updated;
  end if;

  update public.profiles
     set role = new_role
   where id = target_user_id
  returning * into updated;

  -- Appointing staff is exactly the kind of act an audit needs to
  -- show. actor is null when bootstrapping from a server context,
  -- which the audit row records honestly rather than inventing a user.
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    actor,
    'role_changed',
    'profile',
    target_user_id,
    jsonb_build_object(
      'from', previous::text,
      'to', new_role::text,
      'bootstrap', actor is null
    )
  );

  return updated;

end;
$$;

comment on function public.set_user_role(uuid, public.user_role) is
  'Assigns a user role. Callable by a government_admin, or from a trusted server context to bootstrap the first administrator. Writes an audit_logs entry.';

grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.can_assign_roles() to authenticated;
