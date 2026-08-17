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
