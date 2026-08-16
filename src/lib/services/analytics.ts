import { createClient } from "@/lib/supabase/client";
import type {
  AnalyticsSummary,
  CategoryDistribution,
  DepartmentPerformance,
  SLAData,
  TrendDataPoint,
  WardHealth,
} from "@/types/analytics";

/**
 * ============================================================
 * ANALYTICS SERVICE — Supabase backed
 * ============================================================
 *
 * Previously returned src/lib/mock fixtures behind an artificial
 * delay, which meant the authority dashboard showed the same 12,450
 * complaints whatever the database contained — and a broken backend
 * was indistinguishable from a healthy one.
 *
 * Aggregation happens in Postgres (see the analytics_* functions in
 * supabase/migrations/20260814120200_analytics_functions.sql) rather
 * than the browser, so a city-scale dataset is counted server-side
 * instead of being downloaded to be counted.
 *
 * Those functions are SECURITY INVOKER, so row-level security still
 * applies: an administrator aggregates the city, a citizen aggregates
 * only their own complaints. The service does no role filtering.
 *
 * The public contract is unchanged, so no page needed rewriting.
 */

/**
 * Calls an analytics function and returns its json payload.
 *
 * Errors are rethrown rather than swallowed into a fixture: every
 * caller already renders an ErrorState, and a silent fallback to mock
 * data is exactly what made backend breakage invisible before.
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

export const analyticsService = {
  async getSummary(): Promise<AnalyticsSummary> {
    const summary = await callAnalytics<AnalyticsSummary>("analytics_summary");

    /*
     * Guard against a division by zero downstream: the dashboard
     * computes resolvedComplaints / totalComplaints for its resolution
     * rate, which is NaN on an empty database.
     */
    return {
      ...summary,
      totalComplaints: summary.totalComplaints ?? 0,
      openComplaints: summary.openComplaints ?? 0,
      criticalComplaints: summary.criticalComplaints ?? 0,
      resolvedComplaints: summary.resolvedComplaints ?? 0,
      slaCompliance: Number(summary.slaCompliance ?? 0),
      avgResolutionHours: Number(summary.avgResolutionHours ?? 0),
      complaintsToday: summary.complaintsToday ?? 0,
      resolvedToday: summary.resolvedToday ?? 0,
    };
  },

  async getTrends(days = 30): Promise<TrendDataPoint[]> {
    return callAnalytics<TrendDataPoint[]>("analytics_trends", { days });
  },

  async getCategoryDistribution(): Promise<CategoryDistribution[]> {
    return callAnalytics<CategoryDistribution[]>(
      "analytics_category_distribution"
    );
  },

  async getDepartmentPerformance(): Promise<DepartmentPerformance[]> {
    const rows = await callAnalytics<DepartmentPerformance[]>(
      "analytics_department_performance"
    );

    // Postgres numeric arrives as a string over the wire; the charts
    // do arithmetic on these, so coerce once here.
    return rows.map((row) => ({
      ...row,
      slaCompliance: Number(row.slaCompliance),
      avgResolutionHours: Number(row.avgResolutionHours),
    }));
  },

  async getWardHealth(): Promise<WardHealth[]> {
    const rows = await callAnalytics<WardHealth[]>("analytics_ward_health");

    return rows.map((row) => ({
      ...row,
      slaCompliance: Number(row.slaCompliance),
      avgResolutionHours: Number(row.avgResolutionHours),
    }));
  },

  async getSLAData(): Promise<SLAData> {
    return callAnalytics<SLAData>("analytics_sla_breakdown");
  },
};
