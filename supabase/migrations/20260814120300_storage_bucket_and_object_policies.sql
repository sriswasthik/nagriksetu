-- ============================================================
-- STORAGE BUCKETS + OBJECT POLICIES
-- ============================================================
--
-- WHAT WAS MISSING
--
-- 20260813093815_complaint_media_storage.sql secured the
-- public.complaint_media *table*, but nothing in the repository ever:
--
--   1. created the storage bucket that uploadComplaintEvidence()
--      writes to, or
--   2. added any policy on storage.objects.
--
-- storage.objects has RLS enabled by Supabase out of the box, so with
-- no policies every upload and every createSignedUrl() call is denied.
-- The bucket therefore had to have been created by hand in the
-- dashboard — undocumented remote state that a fresh project would not
-- reproduce. This migration makes it explicit and repeatable.
--
-- BUCKET NAMES
-- Taken from the code, not invented: EVIDENCE_BUCKET in
-- src/lib/services/complaints.ts is 'complaint-evidence'. Renaming it
-- here would have orphaned every existing object.
--
-- PATH CONVENTION
-- uploadComplaintEvidence() writes to
-- `<uploader_id>/<complaint_id>/<uuid>.<ext>`, so the FIRST path
-- segment is the uploading user, not the complaint. The policies below
-- key on that segment as text, deliberately avoiding a ::uuid cast: a
-- cast inside a policy raises 22P02 on any malformed object name, and
-- an unparseable path should fail closed, not error the whole query.
--
-- The authoritative link between an object and a complaint is
-- public.complaint_media.storage_path, so reads that need complaint
-- ownership resolve through that table rather than through the path.
--
-- Both buckets are PRIVATE. Reads go through createSignedUrl(), which
-- still evaluates these policies, so access stays row-level for files
-- exactly as it is for rows.
-- ============================================================


-- ============================================================
-- 1. BUCKETS
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complaint-evidence',
  'complaint-evidence',
  false,
  10485760, -- 10 MB, matching MAX_IMAGE_SIZE in complaints.ts
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- Officer proof-of-work photos are kept in their own bucket so a
-- citizen-facing signed URL can never be confused with resolution
-- evidence, and so retention can differ later.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resolution-proofs',
  'resolution-proofs',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- 2. COMPLAINT EVIDENCE OBJECTS
-- ============================================================

drop policy if exists "Complaint evidence read" on storage.objects;

create policy "Complaint evidence read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'complaint-evidence'
  and (
    -- The uploader always retains access to their own folder.
    owner = (select auth.uid())
    -- Staff investigate any complaint.
    or public.is_staff()
    -- Anyone who can read the parent complaint can read its evidence.
    -- Resolved through complaint_media so the check follows the
    -- recorded relationship rather than a parsed file path.
    or exists (
      select 1
      from public.complaint_media m
      where m.storage_path = storage.objects.name
        and public.owns_complaint(m.complaint_id)
    )
  )
);


drop policy if exists "Complaint evidence upload" on storage.objects;

create policy "Complaint evidence upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'complaint-evidence'
  and owner = (select auth.uid())
  -- A user may only write inside their own folder, so one citizen can
  -- never plant evidence in another's namespace. Complaint ownership is
  -- enforced separately by the complaint_media insert policy, which is
  -- what actually attaches the file to a complaint.
  and (storage.foldername(name))[1] = (select auth.uid())::text
);


drop policy if exists "Complaint evidence delete" on storage.objects;

create policy "Complaint evidence delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'complaint-evidence'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);


-- ============================================================
-- 3. RESOLUTION PROOF OBJECTS
-- ============================================================
-- Same convention: `<uploader_id>/<work_order_id>/<uuid>.<ext>`.

drop policy if exists "Resolution proof read" on storage.objects;

create policy "Resolution proof read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resolution-proofs'
  and (
    public.is_staff()
    -- The reporting citizen must be able to see proof of the fix in
    -- order to confirm or reopen it.
    or exists (
      select 1
      from public.resolution_proofs p
      join public.work_orders w on w.id = p.work_order_id
      where p.storage_path = storage.objects.name
        and public.owns_complaint(w.complaint_id)
    )
  )
);


drop policy if exists "Resolution proof upload" on storage.objects;

create policy "Resolution proof upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resolution-proofs'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  -- Only field and oversight staff produce proof of work.
  and public.is_staff()
);

drop policy if exists "Resolution proof orphan cleanup" on storage.objects;

-- Deliberately narrow. A proof that is *recorded* in
-- public.resolution_proofs is audit-trail evidence of a completed
-- repair and must not be removable by the officer who submitted it —
-- the `not exists` clause is what enforces that.
--
-- What this does allow is the uploader removing their own object while
-- no row references it, which is the failure path in
-- uploadResolutionProof(): the file lands in storage, the insert is
-- rejected, and the object would otherwise be orphaned forever.
create policy "Resolution proof orphan cleanup"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'resolution-proofs'
  and owner = (select auth.uid())
  and not exists (
    select 1
    from public.resolution_proofs p
    where p.storage_path = storage.objects.name
  )
);
