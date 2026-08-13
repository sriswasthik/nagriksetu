-- ============================================================
-- NAGRIKSETU COMPLAINT MEDIA SCHEMA FIX
-- ============================================================
--
-- Existing table structure:
--
-- id
-- complaint_id
-- storage_path
-- file_name
-- file_type
-- uploaded_by
-- created_at
--
-- We preserve this existing structure.
-- ============================================================


-- ============================================================
-- 1. ADD FILE SIZE
-- ============================================================

alter table public.complaint_media
add column if not exists file_size bigint;


-- ============================================================
-- 2. ADD FILE SIZE VALIDATION
-- ============================================================

alter table public.complaint_media
drop constraint if exists complaint_media_file_size_check;


alter table public.complaint_media
add constraint complaint_media_file_size_check
check (
  file_size is null
  or file_size > 0
);


-- ============================================================
-- 3. ENABLE RLS
-- ============================================================

alter table public.complaint_media
enable row level security;


-- ============================================================
-- 4. REMOVE EXISTING POLICIES
-- ============================================================

drop policy if exists
"Citizens can view their complaint media"
on public.complaint_media;


drop policy if exists
"Citizens can insert their complaint media"
on public.complaint_media;


drop policy if exists
"Citizens can delete their own complaint media"
on public.complaint_media;


-- ============================================================
-- 5. SELECT POLICY
--
-- Citizen can view media only for complaints
-- belonging to that citizen.
-- ============================================================

create policy
"Citizens can view their complaint media"
on public.complaint_media
for select
to authenticated
using (
  exists (
    select 1
    from public.complaints c
    where c.id = complaint_id
      and c.citizen_id = (select auth.uid())
  )
);


-- ============================================================
-- 6. INSERT POLICY
--
-- Citizen can create media only for their own complaint.
-- ============================================================

create policy
"Citizens can insert their complaint media"
on public.complaint_media
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())

  and exists (
    select 1
    from public.complaints c
    where c.id = complaint_id
      and c.citizen_id = (select auth.uid())
  )
);


-- ============================================================
-- 7. DELETE POLICY
--
-- Citizen can delete only media they uploaded
-- from their own complaint.
-- ============================================================

create policy
"Citizens can delete their own complaint media"
on public.complaint_media
for delete
to authenticated
using (
  uploaded_by = (select auth.uid())

  and exists (
    select 1
    from public.complaints c
    where c.id = complaint_id
      and c.citizen_id = (select auth.uid())
  )
);