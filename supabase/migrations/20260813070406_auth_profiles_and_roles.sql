-- ============================================================
-- NAGRIKSETU AUTH PROFILE AUTOMATION
-- ============================================================


-- ============================================================
-- 1. PROFILE CREATION FUNCTION
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  insert into public.profiles (
    id,
    full_name,
    phone,
    email,
    role
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      ''
    ),
    new.raw_user_meta_data ->> 'phone',
    new.email,
    'citizen'
  );

  return new;

end;
$$;


-- ============================================================
-- 2. REMOVE EXISTING TRIGGER
-- ============================================================

drop trigger if exists on_auth_user_created
on auth.users;


-- ============================================================
-- 3. CREATE AUTH -> PROFILE TRIGGER
-- ============================================================

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();