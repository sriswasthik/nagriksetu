-- ============================================================
-- NAGRIKSETU COMPLAINT RLS POLICIES
-- ============================================================


-- ============================================================
-- 1. ENABLE RLS
-- ============================================================

alter table public.complaints
enable row level security;


-- ============================================================
-- 2. REMOVE EXISTING POLICIES
-- ============================================================

drop policy if exists "Citizens can view their own complaints"
on public.complaints;

drop policy if exists "Citizens can create their own complaints"
on public.complaints;

drop policy if exists "Citizens can update their own complaints"
on public.complaints;

drop policy if exists "Citizens can delete their own complaints"
on public.complaints;


-- ============================================================
-- 3. SELECT
--
-- Citizens can view only their own complaints.
-- ============================================================

create policy "Citizens can view their own complaints"
on public.complaints
for select
to authenticated
using (
  citizen_id = (select auth.uid())
);


-- ============================================================
-- 4. INSERT
--
-- A citizen can create a complaint only for themselves.
-- ============================================================

create policy "Citizens can create their own complaints"
on public.complaints
for insert
to authenticated
with check (
  citizen_id = (select auth.uid())
);


-- ============================================================
-- 5. UPDATE
--
-- Citizens can update only their own complaints.
--
-- We will tighten which fields can actually be modified
-- when the complaint lifecycle/RPC layer is implemented.
-- ============================================================

create policy "Citizens can update their own complaints"
on public.complaints
for update
to authenticated
using (
  citizen_id = (select auth.uid())
)
with check (
  citizen_id = (select auth.uid())
);


-- ============================================================
-- 6. NO DELETE POLICY
--
-- Complaints should not be physically deleted by citizens.
--
-- This preserves the civic audit trail.
-- ============================================================