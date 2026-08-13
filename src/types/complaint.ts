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

  created_at: string;
  updated_at: string;
}

export interface CreateComplaintInput {
  title: string;
  description: string;

  category?: ComplaintCategory;

  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;

  wardId?: string | null;
  departmentId?: string | null;
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