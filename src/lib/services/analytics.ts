import { createClient } from "@/lib/supabase/client";
import type {
  AnalyticsSummary,
  CategoryDistribution,
  DepartmentPerformance,
  Hotspot,
  PriorityDistribution,
  SLAData,
  SLARiskItem,
  StatusDistribution,
  TrendDataPoint,
  WardHealth,
  WorkOrderCounts,
} from "@/types/analytics";

/**
 * ============================================================
 * ANALYTICS SERVICE — Supabase backed
 * ============================================================
 *
 * Every figure on an authority screen comes from here, and every one of
 * them is aggregated in Postgres — see the analytics_* functions in
 * supabase/migrations/20260814120200_analytics_functions.sql and
 * 20260817120000_analytics_completeness.sql. A city-scale dataset is
 * counted server-side rather than downloaded to be counted, and no page
 * component holds a query.
 *
 * ACCESS
 *
 * The functions are SECURITY INVOKER, so row-level security decides what
 * is counted: an administrator aggregates the city, a citizen aggregates
 * only their own complaints. This service does no role filtering, because
 * a role check here would be a second, weaker copy of the real one — and
 * a citizen seeing a summary of their own reports is correct behaviour.
 * An unauthenticated caller has no EXECUTE and is refused outright.
 *
 * NULL IS AN ANSWER
 *
 * A metric with nothing behind it arrives as null and stays null. The
 * previous version's database functions coalesced those gaps away, so a
 * ward with no complaints reported 100% SLA compliance and a health score
 * of `good`. The formatting helpers re-exported at the bottom of this file
 * are how null reaches a screen — as "No data", not as zero.
 */

/**
 * Calls an analytics function and returns its json payload.
 *
 * Errors are rethrown rather than swallowed into a fixture: every caller
 * already renders an ErrorState, and a silent fallback to plausible
 * numbers is exactly what made backend breakage invisible when this
 * module read src/lib/mock.
 */
async function callAnalytics<T>(
  fn: string,
  args?: Record<string, unknown>
): Promise<T> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc(fn, args ?? {});

  if (error) {
    console.error(`Analytics function ${fn} failed:`, error.message);
    throw error;
  }

  return data as T;
}

/**
 * Postgres `numeric` arrives as a string over the wire, and null arrives
 * as null. Both have to survive: `Number(null)` is 0, which would
 * reintroduce the invented statistics one layer up from where they were
 * removed.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Same coercion where the column genuinely cannot be null — a count. */
function toCount(value: unknown): number {
  return toNumberOrNull(value) ?? 0;
}

/**
 * How long the authority screens treat as "at risk", in hours.
 *
 * A deadline inside this window is actionable today. The previous
 * definition — any unresolved complaint whose deadline had not yet
 * passed — flagged every healthy open report, which made the metric
 * unreadable.
 */
export const SLA_RISK_WINDOW_HOURS = 24;

export const analyticsService = {
  async getSummary(): Promise<AnalyticsSummary> {
    const raw = await callAnalytics<Record<string, unknown>>(
      "analytics_summary"
    );

    return {
      totalComplaints: toCount(raw.totalComplaints),
      openComplaints: toCount(raw.openComplaints),
      criticalComplaints: toCount(raw.criticalComplaints),
      resolvedComplaints: toCount(raw.resolvedComplaints),

      /*
       * Computed in SQL now, not here. The dashboard divided
       * resolvedComplaints by totalComplaints in the render path, which
       * is NaN on an empty database — and "NaN%" was what an
       * administrator saw on a fresh deployment.
       */
      resolutionRate: toNumberOrNull(raw.resolutionRate),

      slaCompliance: toNumberOrNull(raw.slaCompliance),
      slaSampleSize: toCount(raw.slaSampleSize),

      avgResolutionHours: toNumberOrNull(raw.avgResolutionHours),
      resolutionSampleSize: toCount(raw.resolutionSampleSize),

      complaintsToday: toCount(raw.complaintsToday),
      resolvedToday: toCount(raw.resolvedToday),
    };
  },

  async getTrends(days = 30): Promise<TrendDataPoint[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_trends",
      { days }
    );

    return (rows ?? []).map((row) => ({
      date: String(row.date),
      complaints: toCount(row.complaints),
      resolved: toCount(row.resolved),
    }));
  },

  async getCategoryDistribution(): Promise<CategoryDistribution[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_category_distribution"
    );

    return (rows ?? []).map((row) => ({
      category: String(row.category),
      count: toCount(row.count),
      percentage: toCount(row.percentage),
    }));
  },

  /** Complaints by status — every enum value, including the empty ones. */
  async getStatusDistribution(): Promise<StatusDistribution[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_status_distribution"
    );

    return (rows ?? []).map((row) => ({
      status: String(row.status),
      label: String(row.label),
      count: toCount(row.count),
      percentage: toNumberOrNull(row.percentage),
    }));
  },

  /** Priority mix, ordered by severity rather than by count. */
  async getPriorityDistribution(): Promise<PriorityDistribution[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_priority_distribution"
    );

    return (rows ?? []).map((row) => ({
      priority: String(row.priority),
      label: String(row.label),
      open: toCount(row.open),
      total: toCount(row.total),
      percentageOfOpen: toNumberOrNull(row.percentageOfOpen),
    }));
  },

  async getDepartmentPerformance(): Promise<DepartmentPerformance[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_department_performance"
    );

    return (rows ?? []).map((row) => ({
      department: String(row.department),
      total: toCount(row.total),
      open: toCount(row.open),
      resolved: toCount(row.resolved),
      critical: toCount(row.critical),
      slaCompliance: toNumberOrNull(row.slaCompliance),
      slaSampleSize: toCount(row.slaSampleSize),
      avgResolutionHours: toNumberOrNull(row.avgResolutionHours),
      resolutionSampleSize: toCount(row.resolutionSampleSize),
    }));
  },

  async getWardHealth(): Promise<WardHealth[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_ward_health"
    );

    return (rows ?? []).map((row) => ({
      ward: String(row.ward),
      openComplaints: toCount(row.openComplaints),
      critical: toCount(row.critical),
      resolved: toCount(row.resolved),
      total: toCount(row.total),
      slaCompliance: toNumberOrNull(row.slaCompliance),
      slaSampleSize: toCount(row.slaSampleSize),
      avgResolutionHours: toNumberOrNull(row.avgResolutionHours),
      resolutionSampleSize: toCount(row.resolutionSampleSize),
      healthScore: (row.healthScore ??
        "unknown") as WardHealth["healthScore"],
    }));
  },

  async getSLAData(
    riskWindowHours = SLA_RISK_WINDOW_HOURS
  ): Promise<SLAData> {
    const raw = await callAnalytics<Record<string, unknown>>(
      "analytics_sla_breakdown",
      { risk_window_hours: riskWindowHours }
    );

    return {
      withinSLA: toCount(raw.withinSLA),
      breached: toCount(raw.breached),
      atRisk: toCount(raw.atRisk),
      onTrack: toCount(raw.onTrack),
      unmeasured: toCount(raw.unmeasured),
      riskWindowHours: toCount(raw.riskWindowHours),
    };
  },

  /**
   * The complaints behind the at-risk count, so it can be acted on.
   *
   * Bounded server-side: the point of moving aggregation into Postgres is
   * lost if the list that accompanies it is unbounded.
   */
  async getSLARiskItems(options?: {
    riskWindowHours?: number;
    limit?: number;
  }): Promise<SLARiskItem[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_sla_risk_items",
      {
        risk_window_hours: options?.riskWindowHours ?? SLA_RISK_WINDOW_HOURS,
        max_rows: options?.limit ?? 25,
      }
    );

    return (rows ?? []).map((row) => ({
      complaintId: String(row.complaintId),
      complaintNumber: (row.complaintNumber as string | null) ?? null,
      title: String(row.title),
      status: String(row.status),
      priorityLevel: String(row.priorityLevel),
      department: (row.department as string | null) ?? null,
      slaDueAt: String(row.slaDueAt),
      hoursRemaining: toCount(row.hoursRemaining),
      officerName: (row.officerName as string | null) ?? null,
    }));
  },

  /** Field workload: what is assigned, in flight, waiting, done. */
  async getWorkOrderCounts(): Promise<WorkOrderCounts> {
    const raw = await callAnalytics<Record<string, unknown>>(
      "analytics_work_orders"
    );

    return {
      total: toCount(raw.total),
      unassigned: toCount(raw.unassigned),
      active: toCount(raw.active),
      awaitingVerification: toCount(raw.awaitingVerification),
      completed: toCount(raw.completed),
      reopened: toCount(raw.reopened),
    };
  },

  /**
   * Geographic concentration, counted per area rather than per report.
   *
   * The hotspot map answered "where is the pressure concentrated?" by
   * fetching every work order in the city and letting the reader judge by
   * eye — a payload that grows without bound and an answer nobody could
   * quote. This ranks neighbourhoods, server-side and capped.
   */
  async getHotspots(options?: {
    minReports?: number;
    limit?: number;
  }): Promise<Hotspot[]> {
    const rows = await callAnalytics<Record<string, unknown>[]>(
      "analytics_hotspots",
      {
        min_reports: options?.minReports ?? 2,
        max_rows: options?.limit ?? 20,
      }
    );

    return (rows ?? []).map((row) => ({
      latitude: toCount(row.latitude),
      longitude: toCount(row.longitude),
      reports: toCount(row.reports),
      openReports: toCount(row.openReports),
      criticalReports: toCount(row.criticalReports),
      dominantCategory: String(row.dominantCategory),
      latestReport: String(row.latestReport),
    }));
  },
};

/* ============================================================
 * DISPLAY HELPERS
 * ==========================================================
 *
 * Defined in analytics.format.ts, which holds no Supabase client so the
 * null handling can be unit-tested — see analytics.format.test.ts.
 * Re-exported here so callers import one module.
 * ========================================================== */

export {
  NO_DATA,
  describeSample,
  formatCount,
  formatHours,
  formatPercent,
  shareOf,
} from "./analytics.format";
