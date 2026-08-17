import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Hammer,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { ComplaintStatus, PriorityLevel } from "@/types/complaint";
import type { NotificationType } from "@/types/notification";

/**
 * ============================================================
 * CITYTRACE STATUS SYSTEM
 * ============================================================
 *
 * Single source of truth for how every complaint status and
 * priority level is *presented*. Badges, the tracking timeline,
 * map markers, filters and charts all read from here, so a status
 * looks and reads the same everywhere in the product.
 *
 * IMPORTANT: the keys are the real database enum values
 * (public.complaint_status / public.complaint_priority). Nothing
 * here renames backend identifiers — this layer only maps those
 * values to human labels and visual treatment.
 */

/**
 * Semantic tone, not a raw color. Kept deliberately small so the
 * interface stays restrained rather than turning into a rainbow.
 */
export type StatusTone =
  | "pending"
  | "triage"
  | "assigned"
  | "active"
  | "review"
  | "resolved"
  | "reopened"
  | "rejected";

export interface StatusMeta {
  /** Citizen-facing label. */
  label: string;
  /** Short plain-language explanation of what this state means. */
  description: string;
  tone: StatusTone;
  icon: LucideIcon;
}

export const STATUS_META: Record<ComplaintStatus, StatusMeta> = {
  submitted: {
    label: "Reported",
    description: "Your report has been received and logged.",
    tone: "pending",
    icon: FileText,
  },
  ai_analyzed: {
    label: "Triaged",
    description:
      "The report has been categorised and prioritised automatically.",
    tone: "triage",
    icon: ScanSearch,
  },
  assigned: {
    label: "Assigned",
    description: "Routed to the responsible department.",
    tone: "assigned",
    icon: UserCheck,
  },
  accepted: {
    label: "Accepted",
    description: "A field officer has accepted the work order.",
    tone: "assigned",
    icon: ClipboardCheck,
  },
  in_progress: {
    label: "In Progress",
    description: "Work is underway on site.",
    tone: "active",
    icon: Hammer,
  },
  proof_submitted: {
    label: "Proof Submitted",
    description: "The officer has submitted evidence of the fix.",
    tone: "review",
    icon: ShieldCheck,
  },
  supervisor_review: {
    label: "Under Review",
    description: "A supervisor is verifying the completed work.",
    tone: "review",
    icon: ScanSearch,
  },
  citizen_confirmation: {
    label: "Awaiting Your Confirmation",
    description: "Please confirm whether the issue has been resolved.",
    tone: "review",
    icon: UserCheck,
  },
  resolved: {
    label: "Resolved",
    description: "The issue has been fixed and verified.",
    tone: "resolved",
    icon: CheckCircle2,
  },
  reopened: {
    label: "Reopened",
    description: "The issue was reported as unresolved and is active again.",
    tone: "reopened",
    icon: RotateCcw,
  },
  rejected: {
    label: "Rejected",
    description: "This report could not be actioned.",
    tone: "rejected",
    icon: XCircle,
  },
};

/**
 * Tailwind classes per tone. Brand plum carries the "system is
 * working on it" states; functional hues are reserved for states
 * where color must carry meaning (done / attention / failed), and
 * are kept desaturated to sit alongside the CityTrace palette.
 */
export const TONE_CLASSES: Record<
  StatusTone,
  { badge: string; dot: string; text: string; marker: string }
> = {
  pending: {
    badge: "border-neutral-300 bg-neutral-100 text-neutral-700",
    dot: "bg-neutral-500",
    text: "text-neutral-700",
    marker: "#8F9091",
  },
  triage: {
    badge: "border-primary-200 bg-primary-50 text-primary-700",
    dot: "bg-primary-400",
    text: "text-primary-700",
    marker: "#C06D89",
  },
  assigned: {
    badge: "border-secondary-200 bg-secondary-50 text-secondary-700",
    dot: "bg-secondary-500",
    text: "text-secondary-700",
    marker: "#713E67",
  },
  active: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    text: "text-amber-800",
    marker: "#D97706",
  },
  review: {
    badge: "border-sky-200 bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
    text: "text-sky-800",
    marker: "#0284C7",
  },
  resolved: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    text: "text-emerald-800",
    marker: "#059669",
  },
  reopened: {
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    dot: "bg-orange-500",
    text: "text-orange-800",
    marker: "#EA580C",
  },
  rejected: {
    badge: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    text: "text-red-800",
    marker: "#DC2626",
  },
};

/**
 * ============================================================
 * PRIORITY
 * ============================================================
 */

export interface PriorityMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  dot: string;
  /** Target response window, from SLA_HOURS in lib/constants. */
  slaHours: number;
}

export const PRIORITY_META: Record<PriorityLevel, PriorityMeta> = {
  critical: {
    label: "Critical",
    description: "Public safety risk — needs immediate attention.",
    icon: AlertTriangle,
    badge: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    slaHours: 24,
  },
  high: {
    label: "High",
    description: "Significant disruption — action needed soon.",
    icon: AlertTriangle,
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    dot: "bg-orange-500",
    slaHours: 48,
  },
  medium: {
    label: "Medium",
    description: "Should be scheduled into routine work.",
    icon: Clock3,
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    slaHours: 72,
  },
  low: {
    label: "Low",
    description: "Minor issue — handled in normal maintenance.",
    icon: Clock3,
    badge: "border-neutral-300 bg-neutral-100 text-neutral-700",
    dot: "bg-neutral-400",
    slaHours: 120,
  },
};

/**
 * ============================================================
 * TRACKING TIMELINE
 * ============================================================
 *
 * The citizen-facing journey. Stages are collapsed from the
 * database statuses so the timeline stays readable — several
 * backend statuses map onto one visible stage.
 *
 * Ordered to match the real workflow: work is carried out first,
 * then the evidence is reviewed, then the issue closes. (Review
 * genuinely happens *after* the fix in this system, so the
 * timeline reflects that rather than an idealised order.)
 */

export interface TimelineStage {
  key: string;
  label: string;
  /** Statuses that mean this stage is the current one. */
  statuses: ComplaintStatus[];
  icon: LucideIcon;
  /** Shown when the stage has not been reached yet. */
  upcomingHint: string;
}

export const TIMELINE_STAGES: TimelineStage[] = [
  {
    key: "reported",
    label: "Reported",
    statuses: ["submitted"],
    icon: FileText,
    upcomingHint: "Your report is submitted.",
  },
  {
    key: "triaged",
    label: "Triaged",
    statuses: ["ai_analyzed"],
    icon: ScanSearch,
    upcomingHint: "The report will be categorised and prioritised.",
  },
  {
    key: "assigned",
    label: "Assigned",
    statuses: ["assigned", "accepted"],
    icon: UserCheck,
    upcomingHint: "It will be routed to the responsible department.",
  },
  {
    key: "in_progress",
    label: "In Progress",
    statuses: ["in_progress"],
    icon: Hammer,
    upcomingHint: "A field officer will carry out the work.",
  },
  {
    key: "review",
    label: "Under Review",
    statuses: ["proof_submitted", "supervisor_review", "citizen_confirmation"],
    icon: ShieldCheck,
    upcomingHint: "Completed work will be verified before closing.",
  },
  {
    key: "resolved",
    label: "Resolved",
    statuses: ["resolved"],
    icon: CheckCircle2,
    upcomingHint: "The issue will be marked resolved once verified.",
  },
];

/**
 * Index of the timeline stage a status currently sits at.
 * Returns -1 for statuses outside the happy path (rejected), and
 * treats `reopened` as back at the triage stage since the issue is
 * active again.
 */
export function getTimelineStageIndex(status: ComplaintStatus): number {
  if (status === "rejected") return -1;
  if (status === "reopened") return 1;

  const index = TIMELINE_STAGES.findIndex((stage) =>
    stage.statuses.includes(status)
  );

  return index;
}

/** Convenience accessors so callers never index the maps directly. */
export function getStatusMeta(status: ComplaintStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.submitted;
}

export function getPriorityMeta(level: PriorityLevel): PriorityMeta {
  return PRIORITY_META[level] ?? PRIORITY_META.low;
}

export function getToneClasses(tone: StatusTone) {
  return TONE_CLASSES[tone] ?? TONE_CLASSES.pending;
}

/**
 * The tone for each notification type.
 *
 * Mapped onto the same StatusTone vocabulary the timelines and badges
 * use, so a "Resolved" notification is the same green as the Resolved
 * stage it refers to. The alternative — a semantic palette local to the
 * tray — would drift from the rest of the product the first time either
 * changed.
 */
export const NOTIFICATION_TONE: Record<NotificationType, StatusTone> = {
  complaint_submitted: "pending",
  complaint_triaged: "triage",
  complaint_assigned: "assigned",
  work_accepted: "assigned",
  work_started: "active",
  proof_submitted: "review",
  complaint_under_review: "review",
  // The two that need the citizen to act.
  confirmation_requested: "review",
  complaint_resolved: "resolved",
  complaint_reopened: "reopened",
  complaint_rejected: "rejected",
  // The two that need the officer to act.
  work_order_assigned: "assigned",
  work_order_reopened: "reopened",
  status_changed: "pending",
};

/** Human label for a raw category enum value, e.g. water_leakage → Water Leakage. */
export function formatCategory(category: string | null | undefined): string {
  if (!category) return "Other";

  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
