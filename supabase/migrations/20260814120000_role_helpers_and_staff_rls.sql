-- ============================================================
-- ROLE HELPERS + STAFF RLS POLICIES
-- ============================================================
--
-- PROBLEM THIS FIXES
--
-- Every table in the initial schema has RLS enabled, but only
-- profiles, complaints and complaint_media were ever given policies.
-- RLS enabled with zero policies denies every request, so
-- work_orders, departments, wards, notifications, ai_analysis,
-- verifications, resolution_proofs, work_order_updates, audit_logs
-- and the duplicate_* tables were unreadable and unwritable by
-- anyone. That is why the officer and authority screens were served
-- from src/lib/mock.
--
-- Separately, every complaints policy was scoped to
-- citizen_id = auth.uid(), so no officer, supervisor or
-- government_admin could read a complaint at all.
--
-- This migration adds the missing policies. It does not change the
-- table structure and does not add tables.
-- ============================================================


-- ============================================================
-- 1. ROLE HELPER FUNCTIONS
-- ============================================================
--
-- Policies need to know the caller's role, which lives in
-- public.profiles — a table that is itself under RLS. Querying it
-- directly from inside a policy causes infinite recursion.
--
-- SECURITY DEFINER bypasses RLS for the lookup, and an empty
-- search_path prevents search-path hijacking. These are read-only
-- and expose nothing the caller could not already see about itself.
-- ============================================================

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid());
$$;

comment on function public.current_app_role() is
  'Role of the calling user, read past RLS so policies can branch on it.';


-- Any non-citizen role: officer, supervisor or government_admin.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_app_role() in (
      'officer',
      'supervisor',
      'government_admin'
    ),
    false
  );
$$;


-- Roles allowed a city-wide view and administrative actions.
create or replace function public.is_oversight()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_app_role() in (
      'supervisor',
      'government_admin'
    ),
    false
  );
$$;


-- True when the calling user reported the given complaint.
create or replace function public.owns_complaint(target_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.complaints c
    where c.id = target_complaint_id
      and c.citizen_id = (select auth.uid())
  );
$$;


-- True when the calling officer is assigned to the given work order.
create or replace function public.is_assigned_officer(target_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_orders w
    where w.id = target_work_order_id
      and w.officer_id = (select auth.uid())
  );
$$;


grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_oversight() to authenticated;
grant execute on function public.owns_complaint(uuid) to authenticated;
grant execute on function public.is_assigned_officer(uuid) to authenticated;


-- ============================================================
-- 2. PROFILES — staff need to resolve officer names
-- ============================================================
-- The existing "view their own profile" policy stays. This adds a
-- read path for staff so work-order screens can show who a task is
-- assigned to.

drop policy if exists "Staff can view profiles" on public.profiles;

create policy "Staff can view profiles"
on public.profiles
for select
to authenticated
using (
  public.is_staff()
);


-- ============================================================
-- 3. COMPLAINTS — staff read, and officer/oversight status updates
-- ============================================================

drop policy if exists "Staff can view all complaints" on public.complaints;

create policy "Staff can view all complaints"
on public.complaints
for select
to authenticated
using (
  public.is_staff()
);


-- An officer may advance the complaint attached to a work order they
-- are assigned to. Oversight roles may update any complaint. This is
-- what allows work-order transitions to keep the citizen-facing
-- complaint status in step.
drop policy if exists "Staff can update complaint workflow" on public.complaints;

create policy "Staff can update complaint workflow"
on public.complaints
for update
to authenticated
using (
  public.is_oversight()
  or exists (
    select 1
    from public.work_orders w
    where w.complaint_id = public.complaints.id
      and w.officer_id = (select auth.uid())
  )
)
with check (
  public.is_oversight()
  or exists (
    select 1
    from public.work_orders w
    where w.complaint_id = public.complaints.id
      and w.officer_id = (select auth.uid())
  )
);


-- ============================================================
-- 4. COMPLAINT MEDIA — staff must see citizen evidence
-- ============================================================

drop policy if exists "Staff can view complaint media" on public.complaint_media;

create policy "Staff can view complaint media"
on public.complaint_media
for select
to authenticated
using (
  public.is_staff()
);


-- ============================================================
-- 5. DEPARTMENTS + WARDS — shared reference data
-- ============================================================
-- Readable by every signed-in user: the AI service resolves a
-- department by code, and citizens see department names on their own
-- complaints. Writes stay closed (seeded by migration).

drop policy if exists "Authenticated can read departments" on public.departments;

create policy "Authenticated can read departments"
on public.departments
for select
to authenticated
using (true);


drop policy if exists "Authenticated can read wards" on public.wards;

create policy "Authenticated can read wards"
on public.wards
for select
to authenticated
using (true);


-- ============================================================
-- 6. WORK ORDERS
-- ============================================================

drop policy if exists "Work order read access" on public.work_orders;

create policy "Work order read access"
on public.work_orders
for select
to authenticated
using (
  -- Oversight sees the whole city.
  public.is_oversight()
  -- An officer sees their own assignments.
  or officer_id = (select auth.uid())
  -- A citizen sees the work order for a complaint they reported.
  or public.owns_complaint(complaint_id)
);


-- Only oversight creates and assigns work orders.
drop policy if exists "Oversight can create work orders" on public.work_orders;

create policy "Oversight can create work orders"
on public.work_orders
for insert
to authenticated
with check (
  public.is_oversight()
);


-- Oversight can reassign; the assigned officer can advance status.
drop policy if exists "Work order update access" on public.work_orders;

create policy "Work order update access"
on public.work_orders
for update
to authenticated
using (
  public.is_oversight()
  or officer_id = (select auth.uid())
)
with check (
  public.is_oversight()
  or officer_id = (select auth.uid())
);


-- ============================================================
-- 7. WORK ORDER UPDATES — the audit trail of transitions
-- ============================================================

drop policy if exists "Work order update log read" on public.work_order_updates;

create policy "Work order update log read"
on public.work_order_updates
for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.work_orders w
    where w.id = work_order_id
      and public.owns_complaint(w.complaint_id)
  )
);


drop policy if exists "Staff can append work order updates" on public.work_order_updates;

create policy "Staff can append work order updates"
on public.work_order_updates
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    public.is_oversight()
    or public.is_assigned_officer(work_order_id)
  )
);


-- ============================================================
-- 8. RESOLUTION PROOFS
-- ============================================================

drop policy if exists "Resolution proof read" on public.resolution_proofs;

create policy "Resolution proof read"
on public.resolution_proofs
for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.work_orders w
    where w.id = work_order_id
      and public.owns_complaint(w.complaint_id)
  )
);


drop policy if exists "Assigned officer can add proof" on public.resolution_proofs;

create policy "Assigned officer can add proof"
on public.resolution_proofs
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    public.is_oversight()
    or public.is_assigned_officer(work_order_id)
  )
);


-- ============================================================
-- 9. VERIFICATIONS
-- ============================================================

drop policy if exists "Verification read" on public.verifications;

create policy "Verification read"
on public.verifications
for select
to authenticated
using (
  public.is_staff()
  or exists (
    select 1
    from public.work_orders w
    where w.id = work_order_id
      and public.owns_complaint(w.complaint_id)
  )
);


drop policy if exists "Oversight can open verification" on public.verifications;

create policy "Oversight can open verification"
on public.verifications
for insert
to authenticated
with check (
  public.is_oversight()
);


-- Supervisors record their decision; the reporting citizen records
-- theirs. Column-level separation is enforced in the service layer;
-- row access is enforced here.
drop policy if exists "Verification update access" on public.verifications;

create policy "Verification update access"
on public.verifications
for update
to authenticated
using (
  public.is_oversight()
  or exists (
    select 1
    from public.work_orders w
    where w.id = work_order_id
      and public.owns_complaint(w.complaint_id)
  )
)
with check (
  public.is_oversight()
  or exists (
    select 1
    from public.work_orders w
    where w.id = work_order_id
      and public.owns_complaint(w.complaint_id)
  )
);


-- ============================================================
-- 10. AI ANALYSIS
-- ============================================================

drop policy if exists "AI analysis read" on public.ai_analysis;

create policy "AI analysis read"
on public.ai_analysis
for select
to authenticated
using (
  public.is_staff()
  or public.owns_complaint(complaint_id)
);


-- Triage currently runs client-side after submission, so the
-- reporting citizen must be able to write their own analysis row.
drop policy if exists "AI analysis insert" on public.ai_analysis;

create policy "AI analysis insert"
on public.ai_analysis
for insert
to authenticated
with check (
  public.is_staff()
  or public.owns_complaint(complaint_id)
);


-- ============================================================
-- 11. DUPLICATE CLUSTERS
-- ============================================================

drop policy if exists "Staff can read duplicate clusters" on public.duplicate_clusters;

create policy "Staff can read duplicate clusters"
on public.duplicate_clusters
for select
to authenticated
using (
  public.is_staff()
);


drop policy if exists "Staff can read duplicate members" on public.duplicate_cluster_members;

create policy "Staff can read duplicate members"
on public.duplicate_cluster_members
for select
to authenticated
using (
  public.is_staff()
);


-- ============================================================
-- 12. NOTIFICATIONS — strictly per-recipient
-- ============================================================

drop policy if exists "Users read own notifications" on public.notifications;

create policy "Users read own notifications"
on public.notifications
for select
to authenticated
using (
  user_id = (select auth.uid())
);


-- Marking as read is the only field a recipient may change; the
-- service updates only is_read.
drop policy if exists "Users update own notifications" on public.notifications;

create policy "Users update own notifications"
on public.notifications
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);


-- Staff notify citizens as work progresses.
drop policy if exists "Staff can create notifications" on public.notifications;

create policy "Staff can create notifications"
on public.notifications
for insert
to authenticated
with check (
  public.is_staff()
  or user_id = (select auth.uid())
);


-- ============================================================
-- 13. AUDIT LOGS — append-only, oversight-readable
-- ============================================================

drop policy if exists "Oversight can read audit logs" on public.audit_logs;

create policy "Oversight can read audit logs"
on public.audit_logs
for select
to authenticated
using (
  public.is_oversight()
);


drop policy if exists "Authenticated can append audit logs" on public.audit_logs;

create policy "Authenticated can append audit logs"
on public.audit_logs
for insert
to authenticated
with check (
  actor_id = (select auth.uid())
);

-- No UPDATE or DELETE policy: audit rows are append-only.
