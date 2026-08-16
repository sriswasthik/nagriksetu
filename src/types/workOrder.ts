import { type PriorityLevel } from './complaint';

export interface ComplaintMedia {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  caption?: string;
  uploadedAt: string;
}

/**
 * Mirrors the PostgreSQL `public.work_order_status` enum exactly.
 *
 * The previous definition carried five values the database has never
 * accepted — `created`, `approved`, `rework_requested`, `completed`
 * and `cancelled` — and was missing three it does:
 * `citizen_confirmation`, `resolved` and `reopened`. Writing any of
 * the invented values would have failed with a Postgres enum error.
 *
 * Equivalents for the removed values:
 *   created           -> a work order only exists once assigned;
 *                        "unassigned" is officer_id IS NULL
 *   completed         -> resolved
 *   approved          -> resolved (the approval itself is recorded in
 *                        public.verifications)
 *   cancelled         -> the complaint is set to `rejected` instead
 *   rework_requested  -> reopened
 */
export type WorkOrderStatus =
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'proof_submitted'
  | 'supervisor_review'
  | 'citizen_confirmation'
  | 'resolved'
  | 'reopened';

/** Statuses in which no further officer action is expected. */
export const CLOSED_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'resolved',
];

/** Statuses awaiting sign-off rather than field work. */
export const REVIEW_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'proof_submitted',
  'supervisor_review',
  'citizen_confirmation',
];

/**
 * Mirrors the PostgreSQL `public.verification_status` enum.
 * `rework_requested` was removed: the database has no such value, and
 * requesting rework is expressed by moving the work order back to
 * `reopened`.
 */
export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export interface WorkOrder {
  /** work_orders.id (uuid) — use for lookups and routing. */
  id: string;
  /** work_orders.work_order_number, e.g. WO-2026-000042 — use for display. */
  workOrderNumber: string;
  complaintId: string;
  complaintTitle: string;
  complaintNumber: string;
  category: string;
  departmentId: string;
  departmentName: string;
  officerId: string;
  officerName: string;
  supervisorId?: string;
  supervisorName?: string;
  status: WorkOrderStatus;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    ward?: string;
  };
  /**
   * The persisted AI analysis of the parent complaint.
   *
   * Carried on the work order so the officer view shows the same
   * assessment the citizen sees. Nothing here is generated client-side;
   * every field is read from public.complaints.
   */
  analysis: {
    summary: string | null;
    category: string | null;
    /** 0-1, or null when the analysis recorded none. */
    confidence: number | null;
    priorityReason: string | null;
    possibleDuplicate: boolean;
    duplicateComplaintId: string | null;
    /** Which engine produced it — a model name, or the rule engine's. */
    model: string | null;
  };

  citizenEvidence: ComplaintMedia[];
  resolutionEvidence: ComplaintMedia[];
  resolutionNotes?: string;
  slaDeadline: string;
  slaHoursRemaining: number;
  assignedAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderUpdate {
  workOrderId: string;
  status: WorkOrderStatus;
  notes?: string;
  /**
   * Timestamp to record for the transition. Optional: the service uses
   * the current time when omitted.
   */
  timestamp?: string;
}

/*
 * `media` and `updatedBy` were removed from WorkOrderUpdate.
 *
 * `media` carried an array of `URL.createObjectURL()` blob links that
 * updateWorkOrderStatus never read, so proof photographs were silently
 * discarded. Uploading them is now workOrderService.uploadResolutionProof().
 *
 * `updatedBy` was a caller-supplied author id, but row-level security
 * requires work_order_updates.created_by = auth.uid(); the service
 * resolves it from the session instead, so it cannot disagree.
 */

/**
 * Mirrors public.verifications.
 *
 * The previous definition described a table that does not exist: a
 * single `status`, plus `complaintId`, `beforeEvidence`,
 * `afterEvidence`, `officerNotes`, `supervisorNotes`,
 * `citizenConfirmed` and `citizenFeedback`. The real table carries
 * *two* independent verification statuses, because sign-off has two
 * stages — the supervisor reviews the officer's proof, then the citizen
 * confirms the fix — and either can reject. That is what the
 * `supervisor_review` and `citizen_confirmation` work-order statuses
 * correspond to.
 *
 * Evidence is not stored here: the citizen's photos live in
 * complaint_media and the officer's in resolution_proofs, both reached
 * through the work order.
 */
export interface Verification {
  id: string;
  /** work_orders.id — unique, one verification per work order. */
  workOrderId: string;
  supervisorId?: string;
  supervisorStatus: VerificationStatus;
  supervisorComment?: string;
  citizenStatus: VerificationStatus;
  citizenComment?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  proof_submitted: 'Proof Submitted',
  supervisor_review: 'Under Review',
  citizen_confirmation: 'Awaiting Confirmation',
  resolved: 'Resolved',
  reopened: 'Reopened',
};
