/**
 * ============================================================
 * ANALYTICS TYPES
 * ============================================================
 *
 * `number | null` is load-bearing throughout this file.
 *
 * These figures used to be plain `number`, and the database obliged by
 * coalescing away every gap — a ward with no complaints reported 100%
 * SLA compliance and a health score of `good`; a department with none
 * reported 0%, which renders as a full red bar. Both numbers were
 * invented, and the type system was what made inventing them feel
 * necessary.
 *
 * Null means "not measured". It is not zero, and a component that
 * renders it as zero is stating something the data does not support, so
 * the shared `formatMetric` helpers in lib/services/analytics.ts exist to
 * turn it into "No data" at the point of display.
 *
 * Where a figure is an average or a percentage, a `*SampleSize` field
 * says how many rows it was computed from — so a dashboard can report
 * "18h across 12 resolved reports" rather than implying the figure covers
 * everything.
 */

export interface AnalyticsSummary {
  totalComplaints: number;
  openComplaints: number;
  criticalComplaints: number;
  resolvedComplaints: number;

  /** Null on an empty database: 0% resolved is a claim about performance. */
  resolutionRate: number | null;

  /** Share of judgeable complaints resolved before their deadline. */
  slaCompliance: number | null;
  /** Complaints with both a deadline and a recorded resolution. */
  slaSampleSize: number;

  /** Measured from the recorded resolution moment, not from updated_at. */
  avgResolutionHours: number | null;
  /**
   * Resolved complaints carrying a recorded resolution moment. Lower than
   * `resolvedComplaints` where a complaint was closed before
   * complaint_status_history existed; those are excluded rather than
   * approximated.
   */
  resolutionSampleSize: number;

  complaintsToday: number;
  resolvedToday: number;
}

export interface TrendDataPoint {
  date: string;
  complaints: number;
  resolved: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
}

/** One bucket of public.complaint_status, including the empty ones. */
export interface StatusDistribution {
  /** The raw enum value, for keying and styling. */
  status: string;
  /** Humanised for display. */
  label: string;
  count: number;
  /** Null when there is nothing to take a share of. */
  percentage: number | null;
}

export interface PriorityDistribution {
  priority: string;
  label: string;
  /** Currently open at this priority — the operational number. */
  open: number;
  /** Ever filed at this priority, closed work included. */
  total: number;
  percentageOfOpen: number | null;
}

export interface DepartmentPerformance {
  department: string;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  slaCompliance: number | null;
  slaSampleSize: number;
  avgResolutionHours: number | null;
  resolutionSampleSize: number;
}

/**
 * `unknown` is the state the old shape could not express.
 *
 * A ward with nothing measured was scored `good` on the strength of an
 * invented 100% compliance, so the dashboard's "wards needing attention"
 * list was sorted against a fiction.
 */
export type WardHealthScore =
  | 'good'
  | 'moderate'
  | 'poor'
  | 'critical'
  | 'unknown';

export interface WardHealth {
  ward: string;
  openComplaints: number;
  critical: number;
  resolved: number;
  total: number;
  slaCompliance: number | null;
  slaSampleSize: number;
  avgResolutionHours: number | null;
  resolutionSampleSize: number;
  healthScore: WardHealthScore;
}

/**
 * The four buckets partition every visible complaint, so a stacked bar
 * built from them sums to the whole.
 *
 * The previous three did not: a complaint resolved *after* its deadline
 * belonged to none of them, so the bar under-filled and every percentage
 * printed beside it used the wrong denominator.
 */
export interface SLAData {
  /** Resolved on or before the deadline. */
  withinSLA: number;
  /** Resolved late, or open and already past the deadline. */
  breached: number;
  /** Open, with the deadline inside the risk window. */
  atRisk: number;
  /** Open, with the deadline beyond the risk window. */
  onTrack: number;
  /** No deadline, rejected, or resolved with no recorded resolution. */
  unmeasured: number;
  /** The window `atRisk` was computed against, in hours. */
  riskWindowHours: number;
}

/** A complaint whose deadline is near or passed, for the authority to act on. */
export interface SLARiskItem {
  complaintId: string;
  complaintNumber: string | null;
  title: string;
  status: string;
  priorityLevel: string;
  department: string | null;
  slaDueAt: string;
  /** Negative once breached. */
  hoursRemaining: number;
  officerName: string | null;
}

export interface WorkOrderCounts {
  total: number;
  unassigned: number;
  /** An officer is expected to act. Excludes the sign-off stages. */
  active: number;
  awaitingVerification: number;
  completed: number;
  reopened: number;
}

/**
 * A neighbourhood-sized concentration of reports.
 *
 * Aggregated in Postgres by snapping coordinates to a grid, rather than
 * shipping every complaint to the browser to be clustered by eye.
 */
export interface Hotspot {
  latitude: number;
  longitude: number;
  reports: number;
  openReports: number;
  criticalReports: number;
  dominantCategory: string;
  latestReport: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  link?: string;
  createdAt: string;
}
