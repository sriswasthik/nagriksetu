-- ============================================================
-- NAGRIKSETU PROFILE RLS POLICIES
-- ============================================================

-- ============================================================
-- 1. ENABLE RLS
-- ============================================================

alter table public.profiles enable row level security;


-- ============================================================
-- 2. REMOVE OLD POLICIES
-- ============================================================

drop policy if exists "Users can view their own profile"
on public.profiles;

drop policy if exists "Users can update their own profile"
on public.profiles;

drop policy if exists "Users can update their own profile fields"
on public.profiles;

drop policy if exists "Users can insert their own profile"
on public.profiles;

drop policy if exists "Users can delete their own profile"
on public.profiles;


-- ============================================================
-- 3. SELECT POLICY
-- Users can view ONLY their own profile
-- ============================================================

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);


-- ============================================================
-- 4. UPDATE POLICY
-- Users can update ONLY their own profile
--
-- Role changes are separately blocked by the
-- prevent_role_change() trigger below.
-- ============================================================

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);


-- ============================================================
-- 5. NO INSERT POLICY
--
-- Users must NOT manually create profiles.
--
-- Profiles are automatically created by the
-- auth.users -> profiles trigger.
-- ============================================================


-- ============================================================
-- 6. NO DELETE POLICY
--
-- Users cannot delete their profile directly.
-- Account deletion will be handled separately.
-- ============================================================


-- ============================================================
-- 7. ROLE CHANGE PROTECTION
-- ============================================================

create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if new.role is distinct from old.role then
    raise exception 'Role changes are not allowed through profile updates';
  end if;

  return new;

end;
$$;


-- ============================================================
-- 8. RECREATE ROLE PROTECTION TRIGGER
-- ============================================================

drop trigger if exists prevent_profile_role_change
on public.profiles;

create trigger prevent_profile_role_change
before update on public.profiles
for each row
execute function public.prevent_role_change();