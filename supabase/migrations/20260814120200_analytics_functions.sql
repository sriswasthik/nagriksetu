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
