-- ============================================================
-- CityTrace — SCHEMA BOOTSTRAP
-- ============================================================
--
-- GENERATED FILE. Do not edit; regenerate with
--   ./scripts/generate-bootstrap.sh
--
-- WHAT THIS IS FOR
--
-- Everything the application needs on top of the original schema, in one
-- file you can paste into the Supabase SQL editor. No CLI, no linked
-- project, no migration history required.
--
-- It exists because a deployment could not file a single report:
--
--   Create complaint error: null value in column "complaint_number"
--   ...then, after that was made robust:
--   This CityTrace deployment is missing part of its database schema.
--
-- Both were the same underlying situation — a database holding only the
-- original tables, with none of the functions, triggers, policies,
-- buckets or reference data the app has come to depend on. Being told to
-- run `supabase db push` is not much help if the CLI is not part of how
-- you deploy.
--
-- SAFE TO RUN REPEATEDLY
--
-- Verified by applying this set three times in a row to the same
-- PostgreSQL 16 database: every statement is `create or replace`,
-- `if not exists`, `drop ... if exists` first, or an upsert. The
-- reference data does not multiply — 8 departments and 6 wards after any
-- number of runs.
--
-- WHAT IT DOES NOT DO
--
-- It does not create the original tables. If the guard below stops you,
-- apply supabase/migrations/20260813064831_initial_nagriksetu_schema.sql
-- and the other 20260813 files first, in filename order.
--
-- HOW TO USE IT
--
--   1. Supabase dashboard -> SQL Editor -> New query
--   2. Paste this whole file, Run
--   3. Run supabase/diagnose.sql — everything should read `ok`
--   4. Reload the app
--
-- If you do use the CLI, `supabase db push` does the same thing and
-- records it in the migration history, which is preferable. This file is
-- the escape hatch.
-- ============================================================


-- ============================================================
-- GUARD: the original schema must already be present
-- ============================================================
-- Failing here with a readable message beats failing 400 lines in with
-- "relation public.complaints does not exist".

do $bootstrap_guard$
begin
  if to_regclass('public.complaints') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.work_orders') is null then
    raise exception
      'The original CityTrace schema is not present in this database.'
      using hint =
        'Apply supabase/migrations/20260813*.sql in filename order first, then run this file.';
  end if;
end
$bootstrap_guard$;

-- ============================================================
-- FROM 20260814120000_role_helpers_and_staff_rls.sql
-- ============================================================

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


-- ============================================================
-- FROM 20260814120100_workflow_integrity_and_reference_data.sql
-- ============================================================

-- ============================================================
-- WORKFLOW INTEGRITY + REFERENCE DATA
-- ============================================================
--
-- Three gaps the service layer assumed the database already handled:
--
-- 1. updated_at was declared on complaints, work_orders and
--    verifications with a default, but no trigger maintained it. Every
--    UPDATE left it at the insert time, so "Updated 3h ago" in the UI
--    was reporting creation time, and ordering by updated_at was wrong.
--
-- 2. work_orders.work_order_number is NOT NULL UNIQUE with no default
--    and no generator, so every insert had to invent one client-side.
--
-- 3. departments and wards were never seeded, so the AI service's
--    department lookup by code could not match anything even once RLS
--    allowed the read.
--
-- No table is added and no column is dropped.
-- ============================================================


-- ============================================================
-- 1. updated_at MAINTENANCE
-- ============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


drop trigger if exists complaints_touch_updated_at on public.complaints;

create trigger complaints_touch_updated_at
before update on public.complaints
for each row
execute function public.touch_updated_at();


drop trigger if exists work_orders_touch_updated_at on public.work_orders;

create trigger work_orders_touch_updated_at
before update on public.work_orders
for each row
execute function public.touch_updated_at();


drop trigger if exists verifications_touch_updated_at on public.verifications;

create trigger verifications_touch_updated_at
before update on public.verifications
for each row
execute function public.touch_updated_at();


drop trigger if exists profiles_touch_updated_at on public.profiles;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row
execute function public.touch_updated_at();


-- ============================================================
-- 2. WORK ORDER NUMBERS
-- ============================================================
--
-- Generated in the database rather than the client so the value is
-- unique under concurrency. A sequence guarantees that; a client-side
-- random suffix does not.
--
-- Format: WO-<year>-<zero-padded sequence>, e.g. WO-2026-000042.

create sequence if not exists public.work_order_number_seq;


create or replace function public.set_work_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.work_order_number is null or new.work_order_number = '' then
    new.work_order_number :=
      'WO-'
      || to_char(now(), 'YYYY')
      || '-'
      || lpad(nextval('public.work_order_number_seq')::text, 6, '0');
  end if;

  -- assigned_at should reflect when an officer was actually attached.
  if new.officer_id is not null and new.assigned_at is null then
    new.assigned_at := now();
  end if;

  return new;
end;
$$;


drop trigger if exists work_orders_set_number on public.work_orders;

create trigger work_orders_set_number
before insert on public.work_orders
for each row
execute function public.set_work_order_number();


-- ============================================================
-- 3. SLA DUE DATE
-- ============================================================
--
-- complaints.sla_due_at existed but was never populated, so SLA
-- monitoring had nothing real to read. The windows mirror SLA_HOURS
-- in src/lib/constants.ts so the UI and database agree.

create or replace function public.set_complaint_sla_due_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.priority_level is not null
     and (
       new.sla_due_at is null
       or new.priority_level is distinct from old.priority_level
     )
  then
    new.sla_due_at := coalesce(new.created_at, now()) +
      case new.priority_level
        when 'critical' then interval '24 hours'
        when 'high'     then interval '48 hours'
        when 'medium'   then interval '72 hours'
        else                 interval '120 hours'
      end;
  end if;

  return new;
end;
$$;


drop trigger if exists complaints_set_sla_due_at on public.complaints;

create trigger complaints_set_sla_due_at
before insert or update of priority_level on public.complaints
for each row
execute function public.set_complaint_sla_due_at();


-- ============================================================
-- 4. DEPARTMENT REFERENCE DATA
-- ============================================================
--
-- Codes must match mapAIDepartmentToCode() in
-- src/lib/services/ai.ts exactly — that function resolves a
-- department by code, and a mismatch leaves department_id null and
-- the complaint unrouted.
--
-- Note these are NOT the codes in the DEPARTMENTS constant in
-- src/lib/constants.ts (ENG/SAN/ELEC/WTR/RDS). That constant is not
-- used for any database lookup; ai.ts is the contract that matters.

insert into public.departments (name, code, description) values
  ('Roads & Infrastructure', 'ROADS',      'Road surfaces, footpaths and structural repairs'),
  ('Sanitation',             'SANITATION', 'Waste collection, public cleanliness and sanitation'),
  ('Water Works',            'WATER',      'Water supply, leakage and pipeline maintenance'),
  ('Drainage',               'DRAINAGE',   'Storm drains, sewerage and waterlogging'),
  ('Electrical',             'ELECTRICAL', 'Street lighting and electrical infrastructure'),
  ('Traffic',                'TRAFFIC',    'Signals, signage and traffic management'),
  ('Public Safety',          'SAFETY',     'Hazards, open manholes and public safety risks'),
  ('General',                'OTHER',      'Unclassified civic issues awaiting routing')
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description;


-- ============================================================
-- 5. WARD REFERENCE DATA
-- ============================================================
-- Placeholder administrative wards so ward-level reporting has real
-- rows to aggregate. Replace with the actual municipal ward list
-- before production use.

insert into public.wards (name, code) values
  ('Ward 1 — Central',   'W01'),
  ('Ward 2 — North',     'W02'),
  ('Ward 3 — South',     'W03'),
  ('Ward 4 — East',      'W04'),
  ('Ward 5 — West',      'W05'),
  ('Ward 6 — Northeast', 'W06')
on conflict (code) do update
  set name = excluded.name;


-- ============================================================
-- 6. SUPPORTING INDEXES
-- ============================================================
-- The new work-order joins filter on complaint_id and department_id.

create index if not exists work_orders_complaint_id_idx
  on public.work_orders(complaint_id);

create index if not exists work_orders_department_id_idx
  on public.work_orders(department_id);

create index if not exists complaint_media_complaint_id_idx
  on public.complaint_media(complaint_id);

create index if not exists ai_analysis_complaint_id_idx
  on public.ai_analysis(complaint_id);


-- ============================================================
-- FROM 20260814120200_analytics_functions.sql
-- ============================================================

-- ============================================================
-- ANALYTICS FUNCTIONS
-- ============================================================
--
-- The analytics service previously read src/lib/mock. Doing the same
-- work from the client would mean fetching every complaint row just to
-- count it, so the aggregation lives here instead.
--
-- SECURITY MODEL
-- These are SECURITY INVOKER (the default) on purpose: they run with
-- the caller's privileges, so the "Staff can view all complaints"
-- policy governs what is counted. A citizen calling them aggregates
-- only their own complaints; an officer or administrator sees the
-- city. There is no way to use these to read rows the caller could
-- not already select.
--
-- All of them return json so the service layer needs no generated
-- types to consume them.
-- ============================================================


-- ============================================================
-- 1. HEADLINE SUMMARY
-- ============================================================

create or replace function public.analytics_summary()
returns json
language sql
stable
set search_path = ''
as $$
  with base as (
    select
      status,
      priority_level,
      sla_due_at,
      created_at,
      updated_at
    from public.complaints
  )
  select json_build_object(
    'totalComplaints',   (select count(*) from base),

    'openComplaints',    (
      select count(*) from base
      where status not in ('resolved', 'rejected')
    ),

    'criticalComplaints', (
      select count(*) from base
      where priority_level = 'critical'
        and status not in ('resolved', 'rejected')
    ),

    'resolvedComplaints', (
      select count(*) from base where status = 'resolved'
    ),

    -- Share of complaints that reached `resolved` before their SLA
    -- deadline. Rows without a deadline are excluded rather than
    -- counted as compliant.
    'slaCompliance', coalesce((
      select round(
        100.0 * count(*) filter (
          where status = 'resolved' and updated_at <= sla_due_at
        ) / nullif(count(*) filter (where sla_due_at is not null), 0)
      , 1)
      from base
    ), 0),

    -- Mean hours from submission to the resolving update.
    'avgResolutionHours', coalesce((
      select round(
        avg(extract(epoch from (updated_at - created_at)) / 3600.0)::numeric
      , 1)
      from base
      where status = 'resolved'
    ), 0),

    'complaintsToday', (
      select count(*) from base
      where created_at >= date_trunc('day', now())
    ),

    'resolvedToday', (
      select count(*) from base
      where status = 'resolved'
        and updated_at >= date_trunc('day', now())
    )
  );
$$;


-- ============================================================
-- 2. 30-DAY TREND
-- ============================================================
-- Left-joined onto a generated date series so days with no activity
-- appear as zero instead of being missing from the chart.

create or replace function public.analytics_trends(days integer default 30)
returns json
language sql
stable
set search_path = ''
as $$
  with span as (
    select generate_series(
      date_trunc('day', now()) - ((days - 1) || ' days')::interval,
      date_trunc('day', now()),
      interval '1 day'
    )::date as day
  ),
  reported as (
    select created_at::date as day, count(*) as n
    from public.complaints
    group by 1
  ),
  resolved as (
    select updated_at::date as day, count(*) as n
    from public.complaints
    where status = 'resolved'
    group by 1
  )
  select coalesce(json_agg(
    json_build_object(
      'date',       to_char(span.day, 'YYYY-MM-DD'),
      'complaints', coalesce(reported.n, 0),
      'resolved',   coalesce(resolved.n, 0)
    ) order by span.day
  ), '[]'::json)
  from span
  left join reported on reported.day = span.day
  left join resolved on resolved.day = span.day;
$$;


-- ============================================================
-- 3. CATEGORY DISTRIBUTION
-- ============================================================

create or replace function public.analytics_category_distribution()
returns json
language sql
stable
set search_path = ''
as $$
  with totals as (
    select category, count(*) as n
    from public.complaints
    group by category
  ),
  overall as (
    select greatest(sum(n), 1) as total from totals
  )
  select coalesce(json_agg(
    json_build_object(
      'category',   initcap(replace(totals.category::text, '_', ' ')),
      'count',      totals.n,
      'percentage', round(100.0 * totals.n / overall.total, 1)
    ) order by totals.n desc
  ), '[]'::json)
  from totals, overall;
$$;


-- ============================================================
-- 4. DEPARTMENT PERFORMANCE
-- ============================================================
-- Every department is listed, including those with no complaints, so
-- the table does not silently hide an idle department.

create or replace function public.analytics_department_performance()
returns json
language sql
stable
set search_path = ''
as $$
  select coalesce(json_agg(
    json_build_object(
      'department', d.name,
      'total',      stats.total,
      'open',       stats.open_count,
      'resolved',   stats.resolved_count,
      'critical',   stats.critical_count,
      'slaCompliance',      stats.sla_compliance,
      'avgResolutionHours', stats.avg_hours
    ) order by stats.open_count desc, d.name
  ), '[]'::json)
  from public.departments d
  cross join lateral (
    select
      count(c.*) as total,
      count(c.*) filter (
        where c.status not in ('resolved', 'rejected')
      ) as open_count,
      count(c.*) filter (where c.status = 'resolved') as resolved_count,
      count(c.*) filter (
        where c.priority_level = 'critical'
          and c.status not in ('resolved', 'rejected')
      ) as critical_count,
      coalesce(round(
        100.0 * count(c.*) filter (
          where c.status = 'resolved' and c.updated_at <= c.sla_due_at
        ) / nullif(count(c.*) filter (where c.sla_due_at is not null), 0)
      , 1), 0) as sla_compliance,
      coalesce(round(
        avg(
          extract(epoch from (c.updated_at - c.created_at)) / 3600.0
        ) filter (where c.status = 'resolved')::numeric
      , 1), 0) as avg_hours
    from public.complaints c
    where c.department_id = d.id
  ) stats;
$$;


-- ============================================================
-- 5. WARD HEALTH
-- ============================================================
-- healthScore is derived from SLA compliance and open critical load,
-- matching the four buckets the UI already renders.

create or replace function public.analytics_ward_health()
returns json
language sql
stable
set search_path = ''
as $$
  select coalesce(json_agg(
    json_build_object(
      'ward',            w.name,
      'openComplaints',  stats.open_count,
      'critical',        stats.critical_count,
      'resolved',        stats.resolved_count,
      'slaCompliance',   stats.sla_compliance,
      'avgResolutionHours', stats.avg_hours,
      'healthScore', case
        when stats.critical_count > 0 and stats.sla_compliance < 50 then 'critical'
        when stats.sla_compliance < 60 then 'poor'
        when stats.sla_compliance < 85 then 'moderate'
        else 'good'
      end
    ) order by stats.sla_compliance, w.name
  ), '[]'::json)
  from public.wards w
  cross join lateral (
    select
      count(c.*) filter (
        where c.status not in ('resolved', 'rejected')
      ) as open_count,
      count(c.*) filter (
        where c.priority_level = 'critical'
          and c.status not in ('resolved', 'rejected')
      ) as critical_count,
      count(c.*) filter (where c.status = 'resolved') as resolved_count,
      coalesce(round(
        100.0 * count(c.*) filter (
          where c.status = 'resolved' and c.updated_at <= c.sla_due_at
        ) / nullif(count(c.*) filter (where c.sla_due_at is not null), 0)
      , 1), 100) as sla_compliance,
      coalesce(round(
        avg(
          extract(epoch from (c.updated_at - c.created_at)) / 3600.0
        ) filter (where c.status = 'resolved')::numeric
      , 1), 0) as avg_hours
    from public.complaints c
    where c.ward_id = w.id
  ) stats;
$$;


-- ============================================================
-- 6. SLA POSTURE
-- ============================================================

create or replace function public.analytics_sla_breakdown()
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'withinSLA', count(*) filter (
      where status = 'resolved' and (sla_due_at is null or updated_at <= sla_due_at)
    ),
    'atRisk', count(*) filter (
      where status not in ('resolved', 'rejected')
        and sla_due_at is not null
        and sla_due_at > now()
    ),
    'breached', count(*) filter (
      where status not in ('resolved', 'rejected')
        and sla_due_at is not null
        and sla_due_at <= now()
    )
  )
  from public.complaints;
$$;


-- ============================================================
-- 7. GRANTS
-- ============================================================

grant execute on function public.analytics_summary() to authenticated;
grant execute on function public.analytics_trends(integer) to authenticated;
grant execute on function public.analytics_category_distribution() to authenticated;
grant execute on function public.analytics_department_performance() to authenticated;
grant execute on function public.analytics_ward_health() to authenticated;
grant execute on function public.analytics_sla_breakdown() to authenticated;


-- ============================================================
-- FROM 20260814120300_storage_bucket_and_object_policies.sql
-- ============================================================

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


-- ============================================================
-- FROM 20260814120400_complaint_number_sequence.sql
-- ============================================================

-- ============================================================
-- COLLISION-FREE COMPLAINT NUMBERS
-- ============================================================
--
-- THE PROBLEM
--
-- public.complaints.complaint_number is `text not null unique`, but it
-- was generated in the browser by
-- src/lib/services/complaints.ts::generateComplaintNumber():
--
--   `NS-${year}-${Math.floor(100000 + Math.random() * 900000)}`
--
-- Six random digits is a space of 900,000 values shared by every
-- complaint filed in a given year. By the birthday bound a duplicate
-- becomes more likely than not at roughly 1,100 complaints per year —
-- well inside the load a single city ward produces. A duplicate raises
-- 23505 (unique_violation), which surfaces to the citizen as a failed
-- submission after they have already taken the photo and the GPS fix,
-- with no retry that would help.
--
-- THE FIX
--
-- Postgres allocates the number. A sequence cannot collide, and the
-- allocation is transactional, so two simultaneous reports get two
-- numbers without any coordination in the client.
--
-- The trigger fires BEFORE INSERT, which in Postgres runs before the
-- NOT NULL check, so the column can stay `not null` with no default —
-- the same arrangement already used for work_orders.work_order_number.
--
-- The `NS-` prefix is kept deliberately. Complaint numbers are quoted
-- to citizens and printed on acknowledgements; existing rows carry
-- `NS-`, and switching new ones to `CT-` would split the identifier
-- space for a cosmetic gain. Renaming it is a data-migration decision,
-- not a side effect of fixing uniqueness.
-- ============================================================

create sequence if not exists public.complaint_number_seq;


create or replace function public.set_complaint_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only allocate when the caller did not supply one. Existing rows and
  -- any deliberate backfill keep their number.
  if new.complaint_number is null or btrim(new.complaint_number) = '' then
    new.complaint_number :=
      'NS-'
      || to_char(now(), 'YYYY')
      || '-'
      || lpad(nextval('public.complaint_number_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;


drop trigger if exists complaints_set_number on public.complaints;

create trigger complaints_set_number
before insert on public.complaints
for each row
execute function public.set_complaint_number();


-- ------------------------------------------------------------
-- Start the sequence past anything already issued.
--
-- Existing numbers are random rather than sequential, so the highest
-- numeric suffix in the table is the only safe floor. Non-numeric
-- suffixes are ignored rather than allowed to abort the migration.
-- ------------------------------------------------------------

do $$
declare
  highest bigint;
begin
  select coalesce(max((regexp_match(complaint_number, '(\d+)$'))[1]::bigint), 0)
    into highest
  from public.complaints
  where complaint_number ~ '\d+$';

  if highest > 0 then
    perform setval('public.complaint_number_seq', highest);
  end if;
end;
$$;


-- ============================================================
-- FROM 20260814120500_role_administration.sql
-- ============================================================

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


-- ============================================================
-- FROM 20260814120600_verification_column_authority.sql
-- ============================================================

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


-- ============================================================
-- FROM 20260814120700_complaint_and_work_order_column_authority.sql
-- ============================================================

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


-- ============================================================
-- FROM 20260814120800_complaint_lifecycle.sql
-- ============================================================

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


-- ============================================================
-- FROM 20260814120900_complaint_number_default.sql
-- ============================================================

-- ============================================================
-- COMPLAINT NUMBER: A COLUMN DEFAULT, NOT ONLY A TRIGGER
-- ============================================================
--
-- REPORTED FROM A REAL DEPLOYMENT
--
--   Create complaint error: null value in column "complaint_number"
--   of relation "complaints" violates not-null constraint
--
-- complaint_number is `text not null` with no default, and since
-- 20260814120400 the client stopped supplying one — the number is
-- allocated by the complaints_set_number BEFORE INSERT trigger instead.
-- That is correct as long as the trigger exists. If the database is
-- behind on migrations, or that migration was applied partially, the
-- trigger is absent and every submission fails on the NOT NULL
-- constraint with a message no citizen can act on.
--
-- One mechanism guarding a required column is a single point of failure,
-- so the column now carries a DEFAULT as well.
--
-- WHY BOTH
--
-- They cover different cases and cannot fight:
--
--   * INSERT that omits the column  -> the DEFAULT fills it. The trigger
--     then sees a non-null value and leaves it alone.
--   * INSERT that passes an explicit NULL -> a DEFAULT does not apply to
--     an explicit NULL, so the trigger is what catches that.
--
-- Both draw from public.complaint_number_seq, so there is still exactly
-- one number per complaint and no possibility of a collision.
-- ============================================================

-- The generator, extracted so the column default and the trigger cannot
-- drift apart in format.
create or replace function public.next_complaint_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select
    'NS-'
    || to_char(now(), 'YYYY')
    || '-'
    || lpad(nextval('public.complaint_number_seq')::text, 6, '0');
$$;

comment on function public.next_complaint_number() is
  'Allocates the next NS-<year>-<sequence> complaint number. Used by both the complaints.complaint_number default and set_complaint_number().';


alter table public.complaints
  alter column complaint_number
  set default public.next_complaint_number();


-- Re-pointed at the shared generator. The guard stays: with the default
-- in place this trigger is normally a no-op, and it exists for the
-- explicit-NULL case the default cannot reach.
create or replace function public.set_complaint_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.complaint_number is null or btrim(new.complaint_number) = '' then
    new.complaint_number := public.next_complaint_number();
  end if;

  return new;
end;
$$;


-- A column default is evaluated as the calling role, so `authenticated`
-- needs EXECUTE on the generator. The sequence itself is reached from
-- inside a SECURITY DEFINER function and so needs no grant of its own;
-- it is granted anyway so the arrangement does not silently break if
-- that function is ever made SECURITY INVOKER.
grant execute on function public.next_complaint_number() to authenticated;
grant usage, select on sequence public.complaint_number_seq to authenticated;


-- ============================================================
-- STATUS HISTORY: WALL-CLOCK ORDERING WITHIN A TRANSACTION
-- ============================================================
--
-- record_complaint_status() relied on the created_at column default,
-- which is now(). now() is the *transaction* start time and does not
-- advance, so two transitions in one transaction — an officer's status
-- change followed by the complaint sync, or a staff update batch — were
-- stamped identically. Ordering then fell back to comparing random
-- uuids, so the recorded sequence came out arbitrary:
--
--   submitted -> ai_analyzed -> in_progress -> assigned
--
-- which is not what happened. The citizen timeline picks the first event
-- per stage, so it was reading an arbitrary one of the two as well.
--
-- clock_timestamp() reads the actual clock at each statement, which is
-- what an event log wants: two transitions that happened in sequence are
-- recorded in that sequence, even inside one transaction.

create or replace function public.record_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if tg_op = 'INSERT' then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by, created_at)
    values
      (new.id, new.status, (select auth.uid()), clock_timestamp());

    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by, created_at)
    values
      (new.id, new.status, (select auth.uid()), clock_timestamp());
  end if;

  return new;

end;
$$;

-- ============================================================
-- TELL PostgREST TO RELOAD
-- ============================================================
--
-- PostgREST serves rpc() calls from a cached copy of the schema. A
-- function created after that cache was built is invisible until it
-- reloads, and the error is indistinguishable from the function not
-- existing at all:
--
--   PGRST202: Could not find the function public.submit_complaint(...)
--             in the schema cache
--
-- Supabase reloads within a minute or so on its own, but there is no
-- reason to wait or to wonder whether the paste worked.

notify pgrst, 'reload schema';


-- ============================================================
-- DONE
-- ============================================================
-- Next: run supabase/diagnose.sql. Every row should read `ok`, and the
-- second query should return no rows.
