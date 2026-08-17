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
-- FROM 20260816120000_work_order_lifecycle.sql
-- ============================================================

-- ============================================================
-- WORK ORDER LIFECYCLE
-- ============================================================
--
-- Row-level security already decides *who* may update a work order:
-- oversight, or the officer it is assigned to. What nothing decided was
-- *what* the update may be. Five things were unenforced.
--
--
-- 1. THE STATE MACHINE DID NOT EXIST
--
--    work_orders.status is an enum, so Postgres accepted any of its
--    eight values in place of any other. An assigned officer could
--    PATCH status straight to 'resolved' — skipping acceptance, the
--    site visit and the proof a supervisor is meant to verify — or move
--    a resolved order back to 'assigned', erasing that it was ever
--    finished. Neither is reachable through the UI, but the UI is not
--    the boundary: the publishable key is in every browser and
--    PostgREST accepts a hand-written PATCH.
--
--
-- 2. THE AUDIT TRAIL WAS OPTIONAL
--
--    work_order_updates was written by the application, in a separate
--    statement, deliberately best-effort: "if the audit insert fails the
--    transition itself still stands". So the record of who changed what
--    could be missing precisely when something went wrong, and a caller
--    who simply never issued the second statement left no trace at all.
--
--    An audit trail the actor can decline to write is not an audit
--    trail. It is now a trigger: same transaction as the transition,
--    actor from auth.uid(), not reachable from any client.
--
--
-- 3. THE CITIZEN'S VIEW COULD GO STALE
--
--    The complaint's status was synced by a third application
--    statement, also best-effort. If it failed, the officer saw
--    'in_progress' and the citizen tracking that report still saw
--    'assigned', with nothing to reconcile them and no error either
--    would ever see. Now a trigger, in the same transaction.
--
--
-- 4. PROOF WAS NOT REQUIRED TO SUBMIT PROOF
--
--    'proof_submitted' is the officer's claim that the job is done and
--    the state a supervisor signs off from. The page required a
--    photograph before enabling the button; the database required
--    nothing, so a direct PATCH produced a work order awaiting
--    verification with nothing to verify.
--
--
-- 5. TIMESTAMPS CAME FROM THE BROWSER
--
--    accepted_at, started_at and completed_at were sent by the client.
--    They are SLA evidence — how long a repair took, whether a target
--    was met — so a backdated completed_at is a falsified performance
--    record. They are now stamped by the trigger from the server clock
--    and rejected from callers.
--
-- ============================================================


-- ============================================================
-- 1. THE STATE MACHINE
-- ============================================================
--
-- Split by authority, because the two roles legitimately move a work
-- order through different parts of it:
--
--   THE ASSIGNED OFFICER does the field work.
--
--     assigned    -> accepted           acknowledge the assignment
--     accepted    -> in_progress        on site
--     in_progress -> proof_submitted    done, with photographs
--     reopened    -> in_progress        rework after a rejection
--
--   OVERSIGHT (supervisor, government_admin) runs sign-off, and can
--   reassign, which is the one legitimate way back to 'assigned'.
--
--     proof_submitted     -> supervisor_review | reopened
--     supervisor_review   -> citizen_confirmation | reopened
--     citizen_confirmation-> resolved | reopened
--     resolved            -> reopened   a rejected repair
--     anything but resolved -> assigned reassignment
--
-- The officer's terminal state is 'proof_submitted', not 'resolved'.
-- That is the point of having a verification stage: an officer
-- declaring their own work resolved is the thing sign-off exists to
-- prevent.

create or replace function public.work_order_transition_allowed(
  p_from public.work_order_status,
  p_to public.work_order_status,
  p_is_oversight boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- Re-saving the same status is not a transition. Harmless, and the
    -- trigger short-circuits before ever asking, but an explicit true
    -- keeps this function total.
    p_from = p_to

    -- ---------- the officer's path ----------
    or (p_from, p_to) in (
      ('assigned',    'accepted'),
      ('accepted',    'in_progress'),
      ('in_progress', 'proof_submitted'),
      ('reopened',    'in_progress')
    )

    -- ---------- oversight's path ----------
    or (
      p_is_oversight
      and (
        (p_from, p_to) in (
          ('proof_submitted',      'supervisor_review'),
          ('proof_submitted',      'reopened'),
          ('supervisor_review',    'citizen_confirmation'),
          ('supervisor_review',    'reopened'),
          ('citizen_confirmation', 'resolved'),
          ('citizen_confirmation', 'reopened'),
          ('resolved',             'reopened')
        )
        -- Reassignment. Allowed from anywhere except a closed order,
        -- because reassigning a resolved job would quietly reopen it
        -- without recording that the repair was rejected.
        or (p_to = 'assigned' and p_from <> 'resolved')
      )
    );
$$;

comment on function public.work_order_transition_allowed is
  'The work-order state machine. Officer path plus, for oversight, sign-off and reassignment.';


-- ============================================================
-- 2. TRANSITION ENFORCEMENT
-- ============================================================
-- BEFORE UPDATE, so an invalid transition never reaches the table and
-- the triggers below never fire on one.

create or replace function public.enforce_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_oversight boolean := public.is_oversight();
  proof_count integer;
begin

  -- ----------------------------------------------------------
  -- Caller-supplied lifecycle timestamps are refused outright.
  --
  -- Refused rather than overwritten: silently replacing a value the
  -- caller sent makes a client that thinks it is recording history look
  -- like it succeeded. The stamps below are the only source.
  -- ----------------------------------------------------------
  if new.accepted_at is distinct from old.accepted_at
     or new.started_at is distinct from old.started_at
     or new.completed_at is distinct from old.completed_at then
    -- The trigger's own stamping happens after this check by assigning
    -- to NEW below, so this only ever catches a caller.
    raise exception
      'Work order timestamps are recorded by the system, not by the caller'
      using errcode = '42501',
            hint = 'Send only the new status; accepted_at, started_at and completed_at are stamped server-side.';
  end if;

  -- ----------------------------------------------------------
  -- A change of assignee resets the assignment clock.
  --
  -- Handled before the status short-circuit below, because oversight
  -- can hand on a work order that is already in `assigned` — in which
  -- case the status does not change and nothing further down would run.
  -- The new officer would otherwise inherit the previous one's
  -- assigned_at and be measured against their SLA.
  --
  -- Whether they are *allowed* to reassign is enforce_work_order_
  -- authority()'s decision, not this trigger's.
  -- ----------------------------------------------------------
  if new.officer_id is distinct from old.officer_id then
    new.assigned_at := clock_timestamp();
    new.accepted_at := null;
    new.started_at := null;
    new.completed_at := null;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- ----------------------------------------------------------
  -- An unassigned work order has no lifecycle to advance.
  --
  -- RLS already stops an officer here (officer_id = auth.uid() cannot
  -- hold when officer_id is null), but oversight passes it, and moving
  -- an unassigned order to 'accepted' records that nobody accepted it.
  -- ----------------------------------------------------------
  if new.officer_id is null and new.status <> 'assigned' then
    raise exception
      'This work order has no officer assigned'
      using errcode = '42501',
            hint = 'Assign an officer before advancing the work order.';
  end if;

  -- ----------------------------------------------------------
  -- The machine.
  -- ----------------------------------------------------------
  if not public.work_order_transition_allowed(
       old.status, new.status, is_oversight
     ) then
    raise exception
      'A work order cannot move from % to %', old.status, new.status
      using errcode = '42501',
            hint = case
              when is_oversight then
                'Valid next steps depend on the current stage; a resolved work order can only be reopened.'
              else
                'Accept, then start, then submit proof. Sign-off is a supervisor decision.'
            end;
  end if;

  -- ----------------------------------------------------------
  -- Proof must exist before it can be submitted.
  --
  -- Checked here rather than trusted from the UI: the page disables its
  -- button without a photograph, but a hand-written PATCH does not go
  -- through the page.
  -- ----------------------------------------------------------
  if new.status = 'proof_submitted' then
    select count(*) into proof_count
    from public.resolution_proofs
    where work_order_id = new.id;

    if proof_count = 0 then
      raise exception
        'Submit at least one photograph of the completed work first'
        using errcode = '23514',
              hint = 'Upload proof of work, then submit for verification.';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Lifecycle stamps, from the server clock.
  --
  -- clock_timestamp(), not now(): now() is transaction-start time, so a
  -- transition and the audit row it produces would carry identical
  -- timestamps and a timeline could not order them.
  -- ----------------------------------------------------------
  if new.status = 'accepted' then
    new.accepted_at := clock_timestamp();
  elsif new.status = 'in_progress' then
    new.started_at := clock_timestamp();
  elsif new.status = 'resolved' then
    new.completed_at := clock_timestamp();
  elsif new.status = 'assigned' then
    /*
     * Back to `assigned` without the assignee changing — oversight
     * pulling a job back to the top of its own officer's queue. Same
     * reasoning as the reassignment reset above: acceptance and start
     * times describe a pass through the work that is being redone, and
     * leaving them would put an "Accepted" entry on the timeline before
     * the assignment it belongs to. The audit trail keeps the history;
     * these four columns describe the current attempt only.
     */
    new.assigned_at := clock_timestamp();
    new.accepted_at := null;
    new.started_at := null;
    new.completed_at := null;
  end if;

  return new;

end;
$$;


drop trigger if exists work_orders_enforce_transition on public.work_orders;

-- Fires before work_orders_enforce_authority (alphabetical order among
-- BEFORE triggers on the same event: "work_orders_enforce_authority"
-- sorts before "work_orders_enforce_transition"), so both run and
-- either can veto. Neither depends on the other's outcome.
create trigger work_orders_enforce_transition
before update on public.work_orders
for each row
execute function public.enforce_work_order_transition();


-- ============================================================
-- 3. THE AUDIT TRAIL, WRITTEN BY THE DATABASE
-- ============================================================
-- AFTER UPDATE: the transition has passed every check by the time it is
-- recorded, and a statement rolled back later takes its audit row with
-- it.

create or replace function public.record_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin

  if new.status is not distinct from old.status then
    return new;
  end if;

  /*
   * created_by is NOT NULL, and a transition can legitimately have no
   * JWT behind it — a migration, or a server task. Attributing those to
   * the officer would be worse than not recording them, so fall back to
   * the assignee only when there is genuinely no session, and let the
   * null case fail loudly rather than inventing an actor.
   */
  insert into public.work_order_updates
    (work_order_id, status, note, created_by)
  values
    (
      new.id,
      new.status,
      nullif(
        current_setting('app.work_order_note', true),
        ''
      ),
      coalesce(actor, new.officer_id)
    );

  return new;

end;
$$;


drop trigger if exists work_orders_record_transition on public.work_orders;

create trigger work_orders_record_transition
after update of status on public.work_orders
for each row
execute function public.record_work_order_transition();


-- ============================================================
-- 4. THE CITIZEN'S VIEW, KEPT IN STEP
-- ============================================================
-- Every work-order status has a complaint status that means the same
-- thing to the person who filed it. Advancing one without the other is
-- how a citizen ends up tracking a repair that has already happened.
--
-- SECURITY DEFINER because the officer updating the work order has no
-- policy permitting them to update that citizen's complaint, and should
-- not: this is the one derived write, and it writes one column.

create or replace function public.sync_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.complaint_status;
begin

  /*
   * INSERT as well as UPDATE. Creating a work order *is* the assignment,
   * and it was the one transition nothing propagated: the application
   * followed its insert with a separate best-effort UPDATE on the
   * complaint, so a citizen whose report had just been assigned to an
   * officer could still be looking at "Submitted" with nothing to
   * reconcile the two.
   */
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  target := case new.status
    when 'assigned'             then 'assigned'
    when 'accepted'             then 'accepted'
    when 'in_progress'          then 'in_progress'
    when 'proof_submitted'      then 'proof_submitted'
    when 'supervisor_review'    then 'supervisor_review'
    when 'citizen_confirmation' then 'citizen_confirmation'
    when 'resolved'             then 'resolved'
    when 'reopened'             then 'reopened'
  end::public.complaint_status;

  if target is null then
    return new;
  end if;

  /*
   * The complaint's own column trigger, enforce_complaint_authority(),
   * restricts who may change status. This function runs as the table
   * owner but auth.uid() is unchanged by SECURITY DEFINER, so the
   * trigger would judge it as the officer and refuse. The sanctioned
   * flag is the same mechanism apply_complaint_triage() uses, and is
   * transaction-local: PostgREST gives every request its own
   * transaction, and no function granted to `authenticated` sets
   * arbitrary GUCs, so it cannot be set from outside.
   */
  perform set_config('app.sanctioned_triage', 'on', true);

  update public.complaints
  set status = target
  where id = new.complaint_id
    and status is distinct from target;

  perform set_config('app.sanctioned_triage', 'off', true);

  return new;

end;
$$;


drop trigger if exists work_orders_sync_complaint on public.work_orders;

-- `after insert or update of status`: an INSERT has no old row to
-- compare against, which is why the function branches on tg_op rather
-- than reading OLD unconditionally.
create trigger work_orders_sync_complaint
after insert or update of status on public.work_orders
for each row
execute function public.sync_complaint_status();


-- ============================================================
-- 5. THE CALLER-FACING ENTRY POINT
-- ============================================================
-- advance_work_order() exists so the client sends an intent — "accept
-- this", "I have finished" — rather than a row patch, and so the note
-- accompanying a transition reaches the audit row the trigger writes.
--
-- SECURITY INVOKER, deliberately. Every check that matters is a policy
-- or a trigger, and running as the caller means this function cannot
-- become a way around them: an officer calling it about someone else's
-- work order is refused by the same RLS that refuses their PATCH.
-- Its value is the note, the transaction, and one readable error.

create or replace function public.advance_work_order(
  p_work_order_id uuid,
  p_status public.work_order_status,
  p_note text default null
)
returns public.work_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.work_orders;
begin

  if p_work_order_id is null then
    raise exception 'A work order id is required'
      using errcode = '22004';
  end if;

  /*
   * The note travels to the audit trigger through a transaction-local
   * setting rather than a parameter, because the trigger fires on any
   * UPDATE — including an oversight reassignment that never goes
   * through this function — and a parameter it cannot see would make
   * the note look optional in one path and impossible in another.
   */
  perform set_config(
    'app.work_order_note',
    coalesce(nullif(btrim(p_note), ''), ''),
    true
  );

  update public.work_orders
  set status = p_status
  where id = p_work_order_id
  returning * into updated;

  -- Cleared so a later UPDATE in the same transaction cannot inherit
  -- this note and attribute it to a different transition.
  perform set_config('app.work_order_note', '', true);

  /*
   * No row means the work order does not exist, or the caller cannot
   * see it. Deliberately one message for both: distinguishing them
   * would confirm the existence of work orders the caller has no
   * business knowing about.
   */
  if updated.id is null then
    raise exception
      'That work order is not available to you'
      using errcode = '42501',
            hint = 'It may not exist, or it may be assigned to another officer.';
  end if;

  return updated;

end;
$$;

comment on function public.advance_work_order is
  'Advance a work order and record the transition. Runs as the caller: RLS and the lifecycle triggers remain the authority.';

revoke all on function public.advance_work_order(uuid, public.work_order_status, text) from public;
grant execute on function public.advance_work_order(uuid, public.work_order_status, text) to authenticated;

revoke all on function public.work_order_transition_allowed(
  public.work_order_status, public.work_order_status, boolean
) from public;
grant execute on function public.work_order_transition_allowed(
  public.work_order_status, public.work_order_status, boolean
) to authenticated;


-- ============================================================
-- 6. THE COMPLAINT'S HISTORY CARRIES THE OFFICER'S NOTE
-- ============================================================
-- complaint_status_history.note existed and was never populated, so a
-- citizen's timeline could say "In progress" but never why, even when
-- the officer had written it down. The note the officer submits with a
-- transition is the most useful thing the citizen could be told, so it
-- travels through the same transaction-local setting.

create or replace function public.record_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

  if tg_op = 'INSERT' then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by)
    values
      (new.id, new.status, (select auth.uid()));

    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.complaint_status_history
      (complaint_id, status, changed_by, note, created_at)
    values
      (
        new.id,
        new.status,
        (select auth.uid()),
        nullif(current_setting('app.work_order_note', true), ''),
        -- clock_timestamp(), not the column default now(): now() is
        -- fixed for the transaction, so two transitions in one
        -- transaction got identical timestamps and a timeline ordered
        -- them by uuid.
        clock_timestamp()
      );
  end if;

  return new;

end;
$$;


-- ============================================================
-- 7. STAFF DIRECTORY FOR ASSIGNMENT
-- ============================================================
-- The authority queue can assign a complaint to an officer, but had no
-- way to list officers: profiles are readable, yet a client filtering
-- on role has to know the enum and sees supervisors and admins too.
--
-- SECURITY INVOKER, so the profile read is still the caller's. A
-- citizen calling this gets whatever the profile policies allow them,
-- which is their own row and no officers.

create or replace function public.assignable_officers()
returns table (
  id uuid,
  full_name text,
  open_work_orders bigint
)
language sql
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    count(w.id) filter (
      where w.status in ('assigned', 'accepted', 'in_progress', 'reopened')
    ) as open_work_orders
  from public.profiles p
  left join public.work_orders w on w.officer_id = p.id
  where p.role in ('officer', 'supervisor')
  group by p.id, p.full_name
  order by open_work_orders asc, p.full_name asc;
$$;

comment on function public.assignable_officers is
  'Officers and supervisors with their open work-order counts, for assignment. Runs as the caller.';

revoke all on function public.assignable_officers() from public;
grant execute on function public.assignable_officers() to authenticated;


notify pgrst, 'reload schema';


-- ============================================================
-- FROM 20260817120000_analytics_completeness.sql
-- ============================================================

-- ============================================================
-- ANALYTICS: MEASURED, NOT ASSUMED
-- ============================================================
--
-- The analytics_* functions from 20260814120200 replaced src/lib/mock
-- with real aggregation, which was the important step. This migration
-- deals with what that left: four metrics the dashboards display that
-- were never actually measured, four the authority screens ask for that
-- had no source at all, and one arithmetic bug in the chart.
--
--
-- 1. TWO INVENTED STATISTICS
--
--    analytics_ward_health() coalesced sla_compliance to **100** when a
--    ward had no complaint carrying an SLA deadline. So a ward with no
--    data reported "100% SLA compliance" and a health score of `good` —
--    a municipality could read perfect service off a ward nobody had
--    filed anything in.
--
--    analytics_department_performance() coalesced the same figure to
--    **0**, which the UI renders as a full-width red progress bar. Also
--    invented, and in the more alarming direction.
--
--    Neither number was measured. Both are now null, which the service
--    and the pages render as "No data" — the honest answer to "what is
--    the compliance of a ward with nothing to comply with".
--
--
-- 2. RESOLUTION TIME WAS AN APPROXIMATION PRESENTED AS A MEASUREMENT
--
--    Both avgResolutionHours and slaCompliance measured from
--    complaints.updated_at, treating "last touched" as "resolved". Any
--    later edit to a resolved complaint — a staff note, a triage
--    correction, an AI re-run — moved its apparent resolution time.
--
--    public.complaint_status_history now records the exact moment a
--    complaint's status became 'resolved', so that is what these use.
--    Where no such row exists the complaint is *excluded* rather than
--    approximated, and the sample size is returned alongside the average
--    so a dashboard can say what the figure is based on. A metric with
--    no sample is null.
--
--
-- 3. "AT RISK" MEANT "NOT YET LATE"
--
--    analytics_sla_breakdown() counted every open complaint with a
--    future deadline as at-risk, so a report filed an hour ago with six
--    days of headroom was flagged. Risk now means the deadline is inside
--    SLA_RISK_WINDOW_HOURS, and `atRisk` keeps its old meaning under the
--    clearer name `onTrack` so the existing bar still sums.
--
--
-- 4. THE BUCKETS DID NOT SUM TO THE WHOLE
--
--    withinSLA / atRisk / breached were not exhaustive. A complaint
--    resolved *after* its deadline was in none of them: not withinSLA
--    (it was late), not open (so neither of the other two). Same for a
--    rejected complaint, and for an open one with no deadline. The
--    dashboard divides by their sum to size the bar, so the bar
--    under-filled and every percentage printed beside it was computed
--    against the wrong denominator.
--
--    The buckets are now exhaustive, with `unmeasured` for the rows that
--    genuinely cannot be judged.
--
--
-- 5. FOUR METRICS WITH NO SOURCE
--
--    complaints by status, priority distribution, work-order counts and
--    geographic concentration were all listed on the authority screens'
--    remit with nothing behind them. Added below.
--
--
-- SECURITY MODEL — unchanged, and load-bearing
--
-- Every function here is SECURITY INVOKER, like the six before them.
-- They run with the caller's privileges, so the complaint policies
-- decide what is counted: an administrator aggregates the city, a
-- citizen aggregates only their own reports. There is no way to use them
-- to read a row the caller could not already select, which is why they
-- can safely be granted to `authenticated` rather than gated by role.
-- ============================================================


-- ============================================================
-- 0. THE RESOLUTION MOMENT
-- ============================================================
-- One definition, used by every function below, so two figures on the
-- same page cannot disagree about when a complaint was resolved.
--
-- max(), not min(): a complaint that was resolved, reopened and resolved
-- again was resolved most recently. Taking the first would report the
-- rejected repair as the outcome.

create or replace function public.complaint_resolution_times()
returns table (
  complaint_id uuid,
  department_id uuid,
  ward_id uuid,
  category public.complaint_category,
  priority_level public.priority_level,
  status public.complaint_status,
  created_at timestamptz,
  sla_due_at timestamptz,
  is_resolved boolean,
  resolved_at timestamptz,
  resolution_hours numeric,
  sla_met boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.department_id,
    c.ward_id,
    c.category,
    c.priority_level,
    c.status,
    c.created_at,
    c.sla_due_at,

    /*
     * Whether the complaint is resolved *now*, which is not the same as
     * whether it was ever resolved.
     *
     * A reopened complaint has a resolution event in its history and is
     * nonetheless open: the citizen rejected the repair. Without this
     * distinction it was counted twice — once as "resolved within SLA"
     * and once as "currently on track" — so the SLA buckets summed to
     * more than the number of complaints, and a rejected repair still
     * contributed to the city's average resolution time as though the
     * job were done.
     *
     * Judged by current state. The history keeps the earlier attempt.
     */
    (c.status = 'resolved') as is_resolved,

    -- The last resolution event, whatever the current status. Kept
    -- unconditional because the trend chart plots when resolutions
    -- happened, and a resolution that later got reopened did happen.
    r.resolved_at,

    -- Duration only counts for work that is actually finished.
    case
      when c.status <> 'resolved' or r.resolved_at is null then null
      else round(
        (extract(epoch from (r.resolved_at - c.created_at)) / 3600.0)::numeric,
        1
      )
    end,

    -- Null, not false, when it cannot be judged. `count(*) filter (where
    -- sla_met)` then counts only the genuinely compliant, and
    -- `count(sla_met)` gives the denominator that excludes the unknown.
    case
      when c.status <> 'resolved'
        or r.resolved_at is null
        or c.sla_due_at is null then null
      else r.resolved_at <= c.sla_due_at
    end
  from public.complaints c
  left join lateral (
    select max(h.created_at) as resolved_at
    from public.complaint_status_history h
    where h.complaint_id = c.id
      and h.status = 'resolved'
  ) r on true;
$$;

comment on function public.complaint_resolution_times is
  'One row per visible complaint with its measured resolution time, or null where none was recorded. The single definition of "resolved at".';

revoke all on function public.complaint_resolution_times() from public;
grant execute on function public.complaint_resolution_times() to authenticated;


-- ============================================================
-- 1. HEADLINE SUMMARY — measured
-- ============================================================
-- Same keys as before plus three: resolutionRate (the dashboard was
-- computing it client-side and dividing by zero on an empty database),
-- and resolutionSampleSize / slaSampleSize so a figure can state what it
-- is based on rather than implying it covers everything.

create or replace function public.analytics_summary()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select * from public.complaint_resolution_times()
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

    -- Null on an empty database rather than 0: "0% resolved" is a claim
    -- about performance, and there is nothing to make it about.
    'resolutionRate', (
      select case
        when count(*) = 0 then null
        else round(100.0 * count(*) filter (where status = 'resolved') / count(*), 1)
      end
      from base
    ),

    /*
     * Share of judgeable complaints resolved before their deadline.
     *
     * count(sla_met) counts non-null only, so complaints with no
     * deadline and complaints with no recorded resolution are excluded
     * from both halves — they are unknown, not compliant, and the
     * previous version's `updated_at <= sla_due_at` quietly counted a
     * later edit as a late resolution.
     */
    'slaCompliance', (
      select case
        when count(sla_met) = 0 then null
        else round(100.0 * count(*) filter (where sla_met) / count(sla_met), 1)
      end
      from base
    ),

    'slaSampleSize', (select count(sla_met) from base),

    'avgResolutionHours', (
      select case
        when count(resolution_hours) = 0 then null
        else round(avg(resolution_hours), 1)
      end
      from base
    ),

    -- How many resolved complaints the average is actually built from.
    -- Below resolvedComplaints where history predates a resolution.
    'resolutionSampleSize', (select count(resolution_hours) from base),

    'complaintsToday', (
      select count(*) from base
      where created_at >= date_trunc('day', now())
    ),

    'resolvedToday', (
      select count(*) from base
      where is_resolved
        and resolved_at >= date_trunc('day', now())
    )
  );
$$;


-- ============================================================
-- 2. TREND — resolved by when it was resolved
-- ============================================================
-- The `resolved` series was grouped by updated_at::date, so a resolved
-- complaint edited last week appeared as resolved last week. Grouped by
-- the recorded resolution date instead.

create or replace function public.analytics_trends(days integer default 30)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    -- Clamped so a caller cannot ask for a decade of daily buckets.
    select least(greatest(coalesce(days, 30), 1), 365) as n
  ),
  span as (
    select generate_series(
      date_trunc('day', now()) - ((select n from bounded) - 1) * interval '1 day',
      date_trunc('day', now()),
      interval '1 day'
    )::date as day
  ),
  base as (
    select * from public.complaint_resolution_times()
  ),
  reported as (
    select created_at::date as day, count(*) as n
    from base
    where created_at >= (select min(day) from span)
    group by 1
  ),
  resolved as (
    select resolved_at::date as day, count(*) as n
    from base
    where resolved_at is not null
      and resolved_at >= (select min(day) from span)
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
-- 3. COMPLAINTS BY STATUS
-- ============================================================
-- Asked for by the authority overview and previously unavailable, so
-- the only status breakdown on the dashboard was open-versus-resolved.
--
-- Every enum value is listed, including those with no rows: a status
-- missing from a chart reads as "none of those exist", which is the
-- same thing as zero only by accident.

create or replace function public.analytics_status_distribution()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with counted as (
    select s.status, count(c.id) as n
    from unnest(enum_range(null::public.complaint_status)) as s(status)
    left join public.complaints c on c.status = s.status
    group by s.status
  ),
  overall as (
    select sum(n) as total from counted
  )
  select coalesce(json_agg(
    json_build_object(
      'status', counted.status::text,
      'label',  initcap(replace(counted.status::text, '_', ' ')),
      'count',  counted.n,
      -- Null rather than 0 when there is nothing to take a share of.
      'percentage', case
        when coalesce(overall.total, 0) = 0 then null
        else round(100.0 * counted.n / overall.total, 1)
      end
    ) order by counted.n desc, counted.status
  ), '[]'::json)
  from counted, overall;
$$;


-- ============================================================
-- 4. PRIORITY DISTRIBUTION
-- ============================================================
-- Open rows only. A priority mix that counts closed work answers "what
-- have we historically dealt with", where the dashboard is asking "what
-- is on our plate" — so both are returned and named.

create or replace function public.analytics_priority_distribution()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with counted as (
    select
      p.level,
      count(c.id) filter (
        where c.status not in ('resolved', 'rejected')
      ) as open_count,
      count(c.id) as total_count
    from unnest(enum_range(null::public.priority_level)) as p(level)
    left join public.complaints c on c.priority_level = p.level
    group by p.level
  ),
  overall as (
    select
      sum(open_count) as open_total,
      sum(total_count) as grand_total
    from counted
  )
  select coalesce(json_agg(
    json_build_object(
      'priority', counted.level::text,
      'label',    initcap(counted.level::text),
      'open',     counted.open_count,
      'total',    counted.total_count,
      'percentageOfOpen', case
        when coalesce(overall.open_total, 0) = 0 then null
        else round(100.0 * counted.open_count / overall.open_total, 1)
      end
    )
    -- Severity order, not count order: a priority chart that reorders
    -- itself as the data shifts cannot be read at a glance.
    order by array_position(
      enum_range(null::public.priority_level), counted.level
    ) desc
  ), '[]'::json)
  from counted, overall;
$$;


-- ============================================================
-- 5. WORK-ORDER COUNTS
-- ============================================================
-- The dashboard reported complaint counts only, so the field workload —
-- what is actually assigned, in flight, or waiting on sign-off — was
-- invisible to the authority that dispatches it.
--
-- Scoped by the work-order read policy, so an officer calling this gets
-- their own load and oversight gets the city's.

create or replace function public.analytics_work_orders()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'total',       count(*),
    'unassigned',  count(*) filter (where officer_id is null),

    -- Active = an officer is expected to act. Excludes the sign-off
    -- stages, where the work is done and somebody else is the blocker.
    'active', count(*) filter (
      where status in ('assigned', 'accepted', 'in_progress', 'reopened')
    ),

    'awaitingVerification', count(*) filter (
      where status in ('proof_submitted', 'supervisor_review', 'citizen_confirmation')
    ),

    'completed', count(*) filter (where status = 'resolved'),

    -- Reopened at least once: the count that says whether "completed"
    -- means fixed or merely closed.
    'reopened', count(*) filter (where status = 'reopened')
  )
  from public.work_orders;
$$;


-- ============================================================
-- 6. GEOGRAPHIC CONCENTRATION
-- ============================================================
-- The hotspot map fetched every work order in the city and plotted them
-- individually, so "where is the pressure concentrated?" was answered by
-- eye, from a payload that grows without bound.
--
-- Concentration is a count per area, so it is counted per area — here,
-- by snapping coordinates to a grid. Roughly 550 m at this latitude,
-- which is a neighbourhood rather than a street or a district.
--
-- No PostGIS: this needs to run on a stock Supabase project, and a grid
-- is enough to rank neighbourhoods. It is not a clustering algorithm and
-- does not pretend to be.

create or replace function public.analytics_hotspots(
  min_reports integer default 2,
  max_rows integer default 20
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select
      greatest(coalesce(min_reports, 2), 1) as floor_n,
      least(greatest(coalesce(max_rows, 20), 1), 200) as cap
  ),
  grid as (
    select
      round((c.latitude / 0.005)::numeric) as lat_cell,
      round((c.longitude / 0.005)::numeric) as lon_cell,
      count(*) as reports,
      count(*) filter (
        where c.status not in ('resolved', 'rejected')
      ) as open_reports,
      count(*) filter (
        where c.priority_level = 'critical'
          and c.status not in ('resolved', 'rejected')
      ) as critical_reports,
      -- Averaged rather than taking the cell centre, so the marker sits
      -- on the reports instead of on an arbitrary grid intersection.
      round(avg(c.latitude)::numeric, 6) as latitude,
      round(avg(c.longitude)::numeric, 6) as longitude,
      mode() within group (order by c.category) as dominant_category,
      max(c.created_at) as latest_report
    from public.complaints c
    where c.latitude is not null
      and c.longitude is not null
      -- Null Island: a lost fix, not a location. Counting it would put
      -- a permanent hotspot in the Gulf of Guinea.
      and not (c.latitude = 0 and c.longitude = 0)
    group by 1, 2
  )
  select coalesce(json_agg(ranked), '[]'::json)
  from (
    select
      json_build_object(
        'latitude',  grid.latitude,
        'longitude', grid.longitude,
        'reports',   grid.reports,
        'openReports', grid.open_reports,
        'criticalReports', grid.critical_reports,
        'dominantCategory',
          initcap(replace(grid.dominant_category::text, '_', ' ')),
        'latestReport', grid.latest_report
      ) as ranked
    from grid, bounded
    where grid.reports >= bounded.floor_n
    order by grid.open_reports desc, grid.reports desc
    limit (select cap from bounded)
  ) top_cells;
$$;


-- ============================================================
-- 7. DEPARTMENT PERFORMANCE — measured
-- ============================================================

create or replace function public.analytics_department_performance()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select * from public.complaint_resolution_times()
  )
  select coalesce(json_agg(
    json_build_object(
      'department', d.name,
      'total',      stats.total,
      'open',       stats.open_count,
      'resolved',   stats.resolved_count,
      'critical',   stats.critical_count,
      -- Null, not 0. A department with nothing to comply with has no
      -- compliance figure, and 0 renders as a full red bar.
      'slaCompliance',      stats.sla_compliance,
      'slaSampleSize',      stats.sla_sample,
      'avgResolutionHours', stats.avg_hours,
      'resolutionSampleSize', stats.resolution_sample
    ) order by stats.open_count desc, d.name
  ), '[]'::json)
  from public.departments d
  cross join lateral (
    select
      count(*) as total,
      count(*) filter (
        where b.status not in ('resolved', 'rejected')
      ) as open_count,
      count(*) filter (where b.status = 'resolved') as resolved_count,
      count(*) filter (
        where b.priority_level = 'critical'
          and b.status not in ('resolved', 'rejected')
      ) as critical_count,
      case
        when count(b.sla_met) = 0 then null
        else round(
          100.0 * count(*) filter (where b.sla_met) / count(b.sla_met), 1
        )
      end as sla_compliance,
      count(b.sla_met) as sla_sample,
      case
        when count(b.resolution_hours) = 0 then null
        else round(avg(b.resolution_hours), 1)
      end as avg_hours,
      count(b.resolution_hours) as resolution_sample
    from base b
    where b.department_id = d.id
  ) stats;
$$;


-- ============================================================
-- 8. WARD HEALTH — measured
-- ============================================================
-- healthScore keeps its four buckets so the existing badges still
-- render, but gains a fifth state for the case the old version hid:
-- `unknown`, where there is nothing to score. That case used to be
-- reported as `good` on the back of an invented 100% compliance.

create or replace function public.analytics_ward_health()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select * from public.complaint_resolution_times()
  )
  select coalesce(json_agg(
    json_build_object(
      'ward',            w.name,
      'openComplaints',  stats.open_count,
      'critical',        stats.critical_count,
      'resolved',        stats.resolved_count,
      'total',           stats.total,
      'slaCompliance',   stats.sla_compliance,
      'slaSampleSize',   stats.sla_sample,
      'avgResolutionHours', stats.avg_hours,
      'resolutionSampleSize', stats.resolution_sample,
      'healthScore', case
        -- Nothing measured. Said so, rather than scored as healthy.
        when stats.sla_compliance is null then 'unknown'
        when stats.critical_count > 0 and stats.sla_compliance < 50 then 'critical'
        when stats.sla_compliance < 60 then 'poor'
        when stats.sla_compliance < 85 then 'moderate'
        else 'good'
      end
    )
    -- Unscored wards last: they are not the worst performers, they are
    -- the ones there is nothing to say about.
    order by stats.sla_compliance nulls last, w.name
  ), '[]'::json)
  from public.wards w
  cross join lateral (
    select
      count(*) as total,
      count(*) filter (
        where b.status not in ('resolved', 'rejected')
      ) as open_count,
      count(*) filter (
        where b.priority_level = 'critical'
          and b.status not in ('resolved', 'rejected')
      ) as critical_count,
      count(*) filter (where b.status = 'resolved') as resolved_count,
      case
        when count(b.sla_met) = 0 then null
        else round(
          100.0 * count(*) filter (where b.sla_met) / count(b.sla_met), 1
        )
      end as sla_compliance,
      count(b.sla_met) as sla_sample,
      case
        when count(b.resolution_hours) = 0 then null
        else round(avg(b.resolution_hours), 1)
      end as avg_hours,
      count(b.resolution_hours) as resolution_sample
    from base b
    where b.ward_id = w.id
  ) stats;
$$;


-- ============================================================
-- 9. SLA POSTURE — exhaustive, and risk that means risk
-- ============================================================
-- The four buckets partition every visible complaint, so the dashboard's
-- stacked bar sums to the whole and the percentages beside it are
-- computed against the right denominator.
--
-- `atRisk` is the metric the authority screens ask for: open, with a
-- deadline inside the risk window. `onTrack` is what the old `atRisk`
-- actually counted.

create or replace function public.analytics_sla_breakdown(
  risk_window_hours integer default 24
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select least(greatest(coalesce(risk_window_hours, 24), 1), 720) as w
  ),
  base as (
    select * from public.complaint_resolution_times()
  )
  select json_build_object(
    /*
     * Keyed on the current status first, so every complaint lands in
     * exactly one bucket.
     *
     * sla_met is already null unless the complaint is resolved now — a
     * reopened one is judged as open, not credited with the resolution
     * its reporter rejected.
     */
    'withinSLA', count(*) filter (where b.sla_met),

    -- Resolved late, or open and already past the deadline. The old
    -- version counted only the second, so a late resolution vanished
    -- from the chart entirely.
    'breached', count(*) filter (
      where b.sla_met = false
        or (
          b.status not in ('resolved', 'rejected')
          and b.sla_due_at is not null
          and b.sla_due_at <= now()
        )
    ),

    'atRisk', count(*) filter (
      where b.status not in ('resolved', 'rejected')
        and b.sla_due_at is not null
        and b.sla_due_at > now()
        and b.sla_due_at <= now() + ((select w from bounded) || ' hours')::interval
    ),

    'onTrack', count(*) filter (
      where b.status not in ('resolved', 'rejected')
        and b.sla_due_at is not null
        and b.sla_due_at > now() + ((select w from bounded) || ' hours')::interval
    ),

    /*
     * Everything the other four cannot judge: no deadline recorded,
     * rejected, or resolved with no recorded resolution moment. Counted
     * and named rather than dropped, because dropping them is what made
     * the bar under-fill.
     */
    'unmeasured', count(*) filter (
      where b.sla_met is null
        and not (
          b.status not in ('resolved', 'rejected')
          and b.sla_due_at is not null
        )
    ),

    'riskWindowHours', (select w from bounded)
  )
  from base b;
$$;


-- ============================================================
-- 10. SLA-RISK ITEMS
-- ============================================================
-- The count above says how many; this says which, so the authority can
-- act on them. Bounded and ordered by urgency, because an unbounded
-- "everything at risk" list is the query this is meant to replace.

create or replace function public.analytics_sla_risk_items(
  risk_window_hours integer default 24,
  max_rows integer default 25
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with bounded as (
    select
      least(greatest(coalesce(risk_window_hours, 24), 1), 720) as w,
      least(greatest(coalesce(max_rows, 25), 1), 100) as cap
  )
  select coalesce(json_agg(item order by hours_remaining), '[]'::json)
  from (
    select
      json_build_object(
        'complaintId',     c.id,
        'complaintNumber', c.complaint_number,
        'title',           c.title,
        'status',          c.status::text,
        'priorityLevel',   c.priority_level::text,
        'department',      d.name,
        'slaDueAt',        c.sla_due_at,
        'hoursRemaining',  round(
          (extract(epoch from (c.sla_due_at - now())) / 3600.0)::numeric, 1
        ),
        'officerName',     p.full_name
      ) as item,
      c.sla_due_at as hours_remaining
    from public.complaints c
    left join public.departments d on d.id = c.department_id
    left join public.work_orders w on w.complaint_id = c.id
    left join public.profiles p on p.id = w.officer_id
    cross join bounded
    where c.status not in ('resolved', 'rejected')
      and c.sla_due_at is not null
      -- Breached rows included: they are the most at risk, not past
      -- caring about, and an authority list that hides them is useless.
      and c.sla_due_at <= now() + (bounded.w || ' hours')::interval
    order by c.sla_due_at
    limit (select cap from bounded)
  ) ranked;
$$;


-- ============================================================
-- 11. GRANTS
-- ============================================================
-- WHAT ENFORCES WHAT, AND IN WHICH ORDER
--
-- Every function here is SECURITY INVOKER, so the policies on the
-- underlying tables are the real boundary: a citizen calling
-- analytics_summary() aggregates their own complaints and nothing else,
-- and there is no argument they can pass to change that. That is the
-- check that matters, and it is deliberately *not* replaced by a role
-- test — a citizen reading a one-row summary of their own reports is
-- correct behaviour, not a leak to be blocked.
--
-- The grants are the second layer, for the caller RLS has nothing to say
-- about.
--
-- REVOKING FROM PUBLIC IS NOT COSMETIC
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so
-- the earlier `grant ... to authenticated` lines were redundant and an
-- anonymous caller could execute all six. It returned zeros, because RLS
-- showed it no rows — correct by consequence rather than by intent, and
-- it meant a future policy mistake would have surfaced as a silent data
-- leak to unauthenticated callers rather than as a denial.
--
-- Revoked from PUBLIC and granted to `authenticated` only, including for
-- the six pre-existing functions. An anonymous caller is now refused at
-- the entry point instead of tripping over an internal helper it also
-- cannot execute, which is a clearer failure for an operator to read.

revoke all on function public.analytics_summary() from public;
grant execute on function public.analytics_summary() to authenticated;

revoke all on function public.analytics_trends(integer) from public;
grant execute on function public.analytics_trends(integer) to authenticated;

revoke all on function public.analytics_category_distribution() from public;
grant execute on function public.analytics_category_distribution() to authenticated;

revoke all on function public.analytics_department_performance() from public;
grant execute on function public.analytics_department_performance() to authenticated;

revoke all on function public.analytics_ward_health() from public;
grant execute on function public.analytics_ward_health() to authenticated;

-- Signature changed (gained a parameter), so the old one is dropped
-- rather than left callable with the previous meaning of `atRisk`.
drop function if exists public.analytics_sla_breakdown();
revoke all on function public.analytics_sla_breakdown(integer) from public;
grant execute on function public.analytics_sla_breakdown(integer) to authenticated;

revoke all on function public.analytics_status_distribution() from public;
grant execute on function public.analytics_status_distribution() to authenticated;

revoke all on function public.analytics_priority_distribution() from public;
grant execute on function public.analytics_priority_distribution() to authenticated;

revoke all on function public.analytics_work_orders() from public;
grant execute on function public.analytics_work_orders() to authenticated;

revoke all on function public.analytics_hotspots(integer, integer) from public;
grant execute on function public.analytics_hotspots(integer, integer) to authenticated;

revoke all on function public.analytics_sla_risk_items(integer, integer) from public;
grant execute on function public.analytics_sla_risk_items(integer, integer) to authenticated;


notify pgrst, 'reload schema';


-- ============================================================
-- FROM 20260817130000_notification_lifecycle.sql
-- ============================================================

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
--
-- public.notifications has existed since the initial schema, with
-- per-recipient RLS policies added in 20260814120000. Nothing has ever
-- written a row to it.
--
-- So both notification surfaces derived a feed from complaint state
-- instead: one entry per complaint showing its *current* status. That is
-- honest as far as it goes — every entry was a real report in a real
-- state — but it is not a notification feed, for three reasons:
--
--   * It shows state, not events. A complaint that was assigned, worked
--     and resolved produced one entry, replaced each time. The citizen
--     could never see that they had been asked to confirm a repair
--     unless they happened to look while that was the current status.
--   * Read state lived in a React Set, so it was lost on reload and was
--     never the same in two tabs. The page said so in a comment.
--   * An officer got nothing at all. The tray returned early on any
--     non-citizen route.
--
-- This migration makes the events write rows.
--
--
-- WHY TRIGGERS AND NOT THE APPLICATION
--
-- Every event the product wants to notify about already fires a database
-- trigger, because the previous tasks moved the lifecycle there:
-- complaint_status_history records one row per real complaint
-- transition, and work_order_updates one per work-order transition, both
-- append-only and both written in the same transaction as the change.
--
-- Notifying from the application would mean a second statement that can
-- fail on its own, and the officer lifecycle work already established
-- what that produces: an audit trail that was missing exactly when
-- something went wrong. A notification nobody receives because the
-- browser closed mid-request is the same failure.
--
--
-- DEDUPLICATION IS STRUCTURAL, NOT A CHECK
--
-- The requirement is that retrying an event does not produce a second
-- notification. Rather than comparing message text or timestamps, every
-- notification carries an `event_key` derived from the primary key of
-- the audit row that caused it, plus the recipient:
--
--   csh:<complaint_status_history.id>:<user_id>
--   wou:<work_order_updates.id>:<user_id>
--
-- A unique index makes a duplicate impossible rather than unlikely.
-- Those audit rows are themselves one-per-real-transition — an UPDATE
-- that sets a status to the value it already holds is not `distinct
-- from` its old value, so no history row is written and no notification
-- follows.
-- ============================================================


-- ============================================================
-- 1. THE EVENT TYPES
-- ============================================================
-- An enum, not free text. `type` was `text`, so a typo in one call site
-- produced a category no reader would ever match on and nothing would
-- report the mistake.
--
-- These are the events the product notifies about. Note what is *not*
-- separate: "complaint submitted" and "complaint successfully created"
-- are one database event — the row exists with status `submitted` — so
-- they are one notification. Emitting two would be inventing an event to
-- satisfy a list.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'complaint_submitted',
      'complaint_triaged',
      'complaint_assigned',
      'work_accepted',
      'work_started',
      'proof_submitted',
      'complaint_under_review',
      'confirmation_requested',
      'complaint_resolved',
      'complaint_reopened',
      'complaint_rejected',
      -- Officer-facing: a work order arriving, or coming back.
      'work_order_assigned',
      'work_order_reopened',
      -- Any transition the list above does not name. Better than
      -- silently dropping a status somebody adds to the enum later.
      'status_changed'
    );
  end if;
end
$$;


-- ============================================================
-- 2. COLUMNS THE FEED NEEDS
-- ============================================================
-- The table held user_id, title, message, type, is_read, created_at. A
-- notification with no reference to what it is about cannot be linked
-- to, which is most of what a reader wants to do with one.

alter table public.notifications
  add column if not exists complaint_id uuid
    references public.complaints(id) on delete cascade;

alter table public.notifications
  add column if not exists work_order_id uuid
    references public.work_orders(id) on delete cascade;

-- Nullable: a notification from before this migration has no key, and
-- backfilling an invented one would defeat the point of the index.
alter table public.notifications
  add column if not exists event_key text;

-- is_read stays — it is what the policies and the UI use. read_at says
-- *when*, which "mark all as read" makes worth recording.
alter table public.notifications
  add column if not exists read_at timestamptz;


-- Retype `type` from text to the enum. Existing values are mapped where
-- they match a member and dropped to 'status_changed' otherwise; there
-- are no rows in practice, but a deployment that has been written to by
-- hand should not fail to migrate.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'type'
      and data_type = 'text'
  ) then
    /*
     * enum_range() cast to text[] rather than a subquery: a USING
     * expression cannot contain one ("cannot use subquery in transform
     * expression"), and hardcoding the member list here would be a
     * second copy of the enum to keep in step.
     */
    alter table public.notifications
      alter column type type public.notification_type
      using (
        case
          when type = any (
            enum_range(null::public.notification_type)::text[]
          )
          then type::public.notification_type
          else 'status_changed'::public.notification_type
        end
      );
  end if;
end
$$;

alter table public.notifications
  alter column type set default 'status_changed';

alter table public.notifications
  alter column type set not null;


-- ============================================================
-- 3. THE DEDUPLICATION INDEX
-- ============================================================
-- Partial, so the pre-existing rows with no key do not collide with each
-- other. This is what makes a retried event a no-op rather than a second
-- entry in somebody's inbox.

create unique index if not exists notifications_event_key_idx
  on public.notifications(event_key)
  where event_key is not null;

-- The unread count and the feed are the only two reads, and both are
-- per-recipient and newest-first.
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, is_read, created_at desc);


-- ============================================================
-- 4. WRITING A NOTIFICATION
-- ============================================================
-- One place, so the dedupe rule cannot be applied inconsistently.
--
-- SECURITY DEFINER because the caller is a trigger running as whoever
-- made the change: an officer advancing a work order has no policy
-- allowing them to insert a row addressed to the citizen, and should not
-- have one. The function accepts a recipient rather than deriving it,
-- and its callers are triggers only — it is not granted to
-- `authenticated`, so nothing client-side can address a notification to
-- another user.

create or replace function public.emit_notification(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_event_key text,
  p_complaint_id uuid default null,
  p_work_order_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin

  -- No recipient, no notification. Happens legitimately: an unassigned
  -- work order has no officer to tell.
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications
    (user_id, type, title, message, event_key, complaint_id, work_order_id)
  values
    (p_user_id, p_type, p_title, p_message, p_event_key,
     p_complaint_id, p_work_order_id)
  /*
   * The whole dedupe mechanism. A retried event carries the same
   * event_key and lands here as a no-op, so an at-least-once caller
   * behaves as exactly-once without anybody comparing message strings.
   */
  on conflict (event_key) where event_key is not null do nothing;

end;
$$;

revoke all on function public.emit_notification(
  uuid, public.notification_type, text, text, text, uuid, uuid
) from public;


-- ============================================================
-- 5. COMPLAINT EVENTS -> THE REPORTING CITIZEN
-- ============================================================
-- Fires off complaint_status_history, which is the append-only record of
-- one row per real transition. Using it rather than the complaints table
-- means the notification and the timeline entry cannot disagree, and the
-- history row's id is the natural dedupe key.

create or replace function public.notify_complaint_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_complaint public.complaints;
  event_type public.notification_type;
  headline text;
  body text;
begin

  select * into target_complaint
  from public.complaints
  where id = new.complaint_id;

  if target_complaint.id is null then
    return new;
  end if;

  /*
   * Statuses map to the labels the citizen already sees on their
   * timeline, so a notification and the page it links to say the same
   * thing. `status_changed` is the fallback rather than an error: a
   * status added to the enum later should still notify, just generically.
   */
  case new.status
    when 'submitted' then
      event_type := 'complaint_submitted';
      headline   := 'Report received';
      body       := 'Your report has been logged as '
                    || coalesce(target_complaint.complaint_number, 'a new report')
                    || '.';
    when 'ai_analyzed' then
      event_type := 'complaint_triaged';
      headline   := 'Report triaged';
      body       := 'Your report has been categorised and prioritised for the responsible department.';
    when 'assigned' then
      event_type := 'complaint_assigned';
      headline   := 'Assigned to a department';
      body       := 'Your report has been routed to the department that will carry out the work.';
    when 'accepted' then
      event_type := 'work_accepted';
      headline   := 'Accepted by an officer';
      body       := 'A field officer has accepted your report and will attend to it.';
    when 'in_progress' then
      event_type := 'work_started';
      headline   := 'Work has started';
      body       := 'An officer is working on your report on site.';
    when 'proof_submitted' then
      event_type := 'proof_submitted';
      headline   := 'Repair submitted for verification';
      body       := 'The officer has submitted photographs of the completed work.';
    when 'supervisor_review' then
      event_type := 'complaint_under_review';
      headline   := 'Under supervisor review';
      body       := 'A supervisor is verifying the completed work.';
    when 'citizen_confirmation' then
      event_type := 'confirmation_requested';
      headline   := 'Please confirm the repair';
      body       := 'The work is reported complete. Let us know whether the issue is resolved.';
    when 'resolved' then
      event_type := 'complaint_resolved';
      headline   := 'Report resolved';
      body       := 'Your report has been marked resolved.';
    when 'reopened' then
      event_type := 'complaint_reopened';
      headline   := 'Report reopened';
      body       := 'Your report is active again and back with the department.';
    when 'rejected' then
      event_type := 'complaint_rejected';
      headline   := 'Report closed without action';
      body       := 'This report could not be actioned. Open it to see why.';
    else
      event_type := 'status_changed';
      headline   := 'Report updated';
      body       := 'The status of your report has changed.';
  end case;

  /*
   * The note the officer wrote, where there is one, in place of the
   * generic sentence. It is the only line about this citizen's specific
   * issue rather than about the process, and it already reaches their
   * timeline through the same column.
   */
  if new.note is not null and btrim(new.note) <> '' then
    body := btrim(new.note);
  end if;

  perform public.emit_notification(
    target_complaint.citizen_id,
    event_type,
    headline,
    -- Prefixed with the report's own title so a tray entry is
    -- identifiable without opening it.
    coalesce(target_complaint.title, 'Your report') || ' — ' || body,
    'csh:' || new.id::text || ':' || target_complaint.citizen_id::text,
    target_complaint.id,
    null
  );

  return new;

end;
$$;


drop trigger if exists complaint_status_notify on public.complaint_status_history;

-- AFTER INSERT on the history table, not on complaints: the history row
-- must exist for its id to be the dedupe key, and a transition rolled
-- back by a later constraint takes its notification with it.
create trigger complaint_status_notify
after insert on public.complaint_status_history
for each row
execute function public.notify_complaint_status();


-- ============================================================
-- 6. WORK-ORDER EVENTS -> THE ASSIGNED OFFICER
-- ============================================================
-- The officer surface had nothing. What an officer needs to be told is
-- narrow: a job has arrived, or a job has come back.
--
-- Deliberately NOT every transition. An officer who just pressed
-- "Accept" does not need to be notified that they accepted something,
-- and a tray full of one's own actions is a tray nobody reads. So a
-- transition notifies the officer only when somebody else made it.

create or replace function public.notify_work_order_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.work_orders;
  complaint_title text;
  event_type public.notification_type;
  headline text;
  body text;
begin

  select * into target_order
  from public.work_orders
  where id = new.work_order_id;

  if target_order.id is null or target_order.officer_id is null then
    return new;
  end if;

  -- The officer's own action. Nothing to tell them.
  if new.created_by = target_order.officer_id then
    return new;
  end if;

  select c.title into complaint_title
  from public.complaints c
  where c.id = target_order.complaint_id;

  case new.status
    when 'assigned' then
      event_type := 'work_order_assigned';
      headline   := 'New work order assigned';
      body       := 'A work order has been assigned to you.';
    when 'reopened' then
      event_type := 'work_order_reopened';
      headline   := 'Work returned for rework';
      body       := 'The repair was not accepted. This work order is back with you.';
    else
      -- A supervisor moving a job through sign-off is not something the
      -- officer has to act on, so it is recorded generically rather than
      -- dressed up as a task.
      event_type := 'status_changed';
      headline   := 'Work order updated';
      body       := 'The status of one of your work orders has changed.';
  end case;

  if new.note is not null and btrim(new.note) <> '' then
    body := btrim(new.note);
  end if;

  perform public.emit_notification(
    target_order.officer_id,
    event_type,
    headline,
    coalesce(complaint_title, 'A work order') || ' — ' || body,
    'wou:' || new.id::text || ':' || target_order.officer_id::text,
    target_order.complaint_id,
    target_order.id
  );

  return new;

end;
$$;


drop trigger if exists work_order_update_notify on public.work_order_updates;

create trigger work_order_update_notify
after insert on public.work_order_updates
for each row
execute function public.notify_work_order_transition();


-- ============================================================
-- 7. ASSIGNMENT AND REASSIGNMENT -> THE NEW OFFICER
-- ============================================================
-- Creating a work order writes no work_order_updates row — the audit
-- trigger fires on transitions, and an insert is not one — so without
-- this an officer would never be told about the assignment that gave
-- them the job. Reassignment has the same gap: officer_id changes
-- without the status necessarily changing.

create or replace function public.notify_work_order_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  complaint_title text;
begin

  if new.officer_id is null then
    return new;
  end if;

  -- On update, only a genuine change of assignee counts.
  if tg_op = 'UPDATE'
     and new.officer_id is not distinct from old.officer_id then
    return new;
  end if;

  -- Oversight assigning a job to themselves needs no announcement.
  if new.officer_id = (select auth.uid()) then
    return new;
  end if;

  select c.title into complaint_title
  from public.complaints c
  where c.id = new.complaint_id;

  perform public.emit_notification(
    new.officer_id,
    'work_order_assigned',
    'New work order assigned',
    coalesce(complaint_title, 'A work order')
      || ' — assigned to you as '
      || coalesce(new.work_order_number, 'a new work order') || '.',
    /*
     * Keyed on the work order and the officer rather than on an audit
     * row, because an assignment has no audit row of its own. The
     * consequence is deliberate: reassigning the same job back to the
     * same officer later does not notify them twice, which is the
     * behaviour worth having — one "this is yours" per officer per job.
     */
    'woassign:' || new.id::text || ':' || new.officer_id::text,
    new.complaint_id,
    new.id
  );

  return new;

end;
$$;


drop trigger if exists work_order_assignment_notify on public.work_orders;

create trigger work_order_assignment_notify
after insert or update of officer_id on public.work_orders
for each row
execute function public.notify_work_order_assignment();


-- ============================================================
-- 8. READING AND MARKING
-- ============================================================
-- SECURITY INVOKER, all of them. The per-recipient policies are the
-- boundary — "Users read own notifications" and "Users update own
-- notifications" both test user_id = auth.uid() — so a function running
-- as the caller cannot be used to reach another user's inbox no matter
-- what it is passed. A SECURITY DEFINER version would have to
-- re-implement that check, and a re-implementation is a second place to
-- get it wrong.

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where user_id = (select auth.uid())
    and not is_read;
$$;

comment on function public.unread_notification_count is
  'Unread notifications for the caller. Counted in Postgres rather than by fetching the feed to measure it.';

revoke all on function public.unread_notification_count() from public;
grant execute on function public.unread_notification_count() to authenticated;


/**
 * Marks a set of notifications read, or all of them.
 *
 * Returns the number actually marked, so a caller can tell "already
 * read" from "not yours" — both leave the row untouched, and the count
 * is the honest answer to what happened.
 */
create or replace function public.mark_notifications_read(
  p_ids uuid[] default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin

  update public.notifications
  set is_read = true,
      read_at = clock_timestamp()
  where user_id = (select auth.uid())
    and not is_read
    -- Null means "all of mine". An explicit list narrows it; the
    -- user_id predicate still applies, so a caller passing somebody
    -- else's id changes nothing.
    and (p_ids is null or id = any (p_ids));

  get diagnostics affected = row_count;

  return affected;

end;
$$;

comment on function public.mark_notifications_read is
  'Marks the caller''s notifications read. Null marks all. Runs as the caller, so RLS confines it to their own.';

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;


-- ============================================================
-- 9. THE INSERT POLICY NARROWS
-- ============================================================
-- "Staff can create notifications" allowed any staff member to insert a
-- row addressed to anybody:
--
--   with check (public.is_staff() or user_id = auth.uid())
--
-- Which means an officer could write a notification into any citizen's
-- inbox, with any text. Nothing in the product did it, and now nothing
-- needs to: every notification comes from a trigger via
-- emit_notification(), which is SECURITY DEFINER and not granted to
-- `authenticated`.
--
-- So the policy is replaced with self-insert only. A client can still
-- write itself a note if some future feature wants one; it can no longer
-- write to a stranger.

drop policy if exists "Staff can create notifications" on public.notifications;

-- Dropped by its own name too, not only by the old one. Without this the
-- migration applies once and fails on a re-run with "policy already
-- exists" — which supabase/bootstrap.sql does by design, since it is a
-- paste-in file that has to be safe to run repeatedly. Caught by
-- verify-bootstrap.sh's second pass.
drop policy if exists "Users create only their own notifications"
  on public.notifications;

create policy "Users create only their own notifications"
on public.notifications
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);


-- Recipients mark their own notifications read; nobody deletes them.
-- There is deliberately no DELETE policy: an inbox its sender can empty
-- is not a record of what the citizen was told.


notify pgrst, 'reload schema';

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
