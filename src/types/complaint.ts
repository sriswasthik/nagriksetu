export type ComplaintCategory =
  | "garbage"
  | "water_leakage"
  | "pothole"
  | "drainage"
  | "streetlight"
  | "other";

export type ComplaintStatus =
  | "submitted"
  | "ai_analyzed"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "proof_submitted"
  | "supervisor_review"
  | "citizen_confirmation"
  | "resolved"
  | "reopened"
  | "rejected";

export type PriorityLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface ComplaintLocation {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

export interface Complaint {
  id: string;
  complaint_number: string;

  citizen_id: string;

  title: string;
  description: string;

  category: ComplaintCategory;
  status: ComplaintStatus;

  latitude: number | null;
  longitude: number | null;
  address: string | null;

  ward_id: string | null;
  department_id: string | null;

  priority_score: number | null;
  priority_level: PriorityLevel | null;
  priority_reason: string | null;

  sla_due_at: string | null;

  /**
   * Where triage has got to.
   *
   * `select("*")` has always returned these, but the type did not
   * declare them, so the detail page could not tell an untriaged report
   * from a triaged one without asserting. That is why triage used to be
   * driven by a query parameter instead of by the row's own state.
   *
   * null means the AI migration's default has not been applied to this
   * row yet — treat it as pending.
   */
  ai_analysis_status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | null;

  ai_category: string | null;
  ai_severity: string | null;
  /** P1–P4, not the priority_level enum. */
  ai_priority: string | null;
  ai_department: string | null;
  /** 0–1. */
  ai_confidence: number | null;
  ai_summary: string | null;
  ai_reasoning: string | null;
  ai_possible_duplicate: boolean | null;
  ai_duplicate_complaint_id: string | null;
  /** Which classifier produced the values above. */
  ai_model: string | null;
  ai_processed_at: string | null;
  ai_error_message: string | null;

  /** Set once, at submission; see submit_complaint(). */
  submission_key: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateComplaintInput {
  /**
   * Identifies one attempt to file one report.
   *
   * submit_complaint() is idempotent on it, so a retry after a lost
   * response returns the complaint that already exists instead of
   * filing a second one. Generate it once per form fill — reusing a key
   * across two genuinely different reports would silently return the
   * first.
   */
  submissionKey: string;

  title: string;
  description: string;

  category?: ComplaintCategory;

  /** Required. Validated for range server-side, not just here. */
  latitude: number | null;
  longitude: number | null;
  address: string | null;

  wardId?: string | null;
}

/** One recorded transition, from public.complaint_status_history. */
export interface ComplaintStatusEvent {
  id: string;
  status: ComplaintStatus;
  note: string | null;
  created_at: string;
}

export interface UpdateComplaintInput {
  title?: string;
  description?: string;

  category?: ComplaintCategory;

  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

/*
 * ============================================================
 * COMPLAINT MEDIA
 * ============================================================
 *
 * This matches your ACTUAL database schema.
 */

export interface ComplaintMedia {
  id: string;

  complaint_id: string;

  storage_path: string;

  file_name: string;

  file_type: string;

  uploaded_by: string;

  file_size: number | null;

  created_at: string;
}