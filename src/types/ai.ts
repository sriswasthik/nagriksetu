/**
 * ============================================================
 * CITYTRACE — AI TYPES
 * ============================================================
 *
 * Central type definitions for the AI complaint-analysis
 * pipeline.
 *
 * These types are intentionally independent.
 * Do NOT import anything from "@/types/ai" inside this file.
 */


/**
 * ============================================================
 * COMPLAINT CATEGORIES
 * ============================================================
 */

export type AIComplaintCategory =
  | "road_damage"
  | "garbage"
  | "streetlight"
  | "water_supply"
  | "drainage"
  | "traffic"
  | "public_safety"
  | "sanitation"
  | "electricity"
  | "other";


/**
 * ============================================================
 * DEPARTMENTS
 * ============================================================
 */

export type AIDepartment =
  | "roads_infrastructure"
  | "sanitation"
  | "electrical"
  | "water_works"
  | "drainage"
  | "traffic"
  | "public_safety"
  | "other";


/**
 * ============================================================
 * SEVERITY
 * ============================================================
 */

export type AISeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";


/**
 * ============================================================
 * PRIORITY
 * ============================================================
 */

export type AIPriority =
  | "P1"
  | "P2"
  | "P3"
  | "P4";


/**
 * ============================================================
 * AI PROCESSING STATUS
 * ============================================================
 */

export type AIAnalysisStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";


/**
 * ============================================================
 * AI ANALYSIS REQUEST
 * ============================================================
 *
 * Information sent to the AI service.
 */

export interface AIAnalysisRequest {
  complaintId: string;

  title: string;

  description: string;

  category?: string | null;

  address?: string | null;

  latitude?: number | null;

  longitude?: number | null;
}


/**
 * ============================================================
 * AI ANALYSIS RESULT
 * ============================================================
 *
 * Structured result produced by the AI service.
 */

export interface AIAnalysisResult {
  category: AIComplaintCategory;

  severity: AISeverity;

  priority: AIPriority;

  department: AIDepartment;

  confidence: number;

  summary: string;

  possibleDuplicate: boolean;

  duplicateComplaintId:
    string | null;

  reasoning?: string | null;
}


/**
 * ============================================================
 * AI ANALYSIS RESPONSE
 * ============================================================
 *
 * Wrapper returned by the AI service.
 */

export interface AIAnalysisResponse {
  success: boolean;

  status: AIAnalysisStatus;

  result?: AIAnalysisResult;

  error?: string | null;
}


/**
 * ============================================================
 * AI DATABASE RECORD
 * ============================================================
 *
 * Represents AI-related fields associated with
 * a complaint record.
 */

export interface AIComplaintAnalysis {
  ai_analysis_status:
    AIAnalysisStatus;

  ai_category:
    AIComplaintCategory | null;

  ai_severity:
    AISeverity | null;

  ai_priority:
    AIPriority | null;

  ai_department:
    AIDepartment | null;

  ai_confidence:
    number | null;

  ai_summary:
    string | null;

  ai_possible_duplicate:
    boolean | null;

  ai_duplicate_complaint_id:
    string | null;

  ai_reasoning:
    string | null;

  ai_model:
    string | null;

  ai_processed_at:
    string | null;

  ai_error_message:
    string | null;
}


/**
 * ============================================================
 * AI DISPLAY LABELS
 * ============================================================
 *
 * Useful for frontend UI.
 */

export const AI_CATEGORY_LABELS: Record<
  AIComplaintCategory,
  string
> = {
  road_damage:
    "Road Damage",

  garbage:
    "Garbage / Waste",

  streetlight:
    "Streetlight",

  water_supply:
    "Water Supply",

  drainage:
    "Drainage",

  traffic:
    "Traffic",

  public_safety:
    "Public Safety",

  sanitation:
    "Sanitation",

  electricity:
    "Electricity",

  other:
    "Other",
};


export const AI_DEPARTMENT_LABELS: Record<
  AIDepartment,
  string
> = {
  roads_infrastructure:
    "Roads & Infrastructure",

  sanitation:
    "Sanitation",

  electrical:
    "Electrical Department",

  water_works:
    "Water Works",

  drainage:
    "Drainage Department",

  traffic:
    "Traffic Department",

  public_safety:
    "Public Safety",

  other:
    "Other",
};


export const AI_PRIORITY_LABELS: Record<
  AIPriority,
  string
> = {
  P1:
    "Critical",

  P2:
    "High",

  P3:
    "Medium",

  P4:
    "Low",
};


export const AI_SEVERITY_LABELS: Record<
  AISeverity,
  string
> = {
  low:
    "Low",

  medium:
    "Medium",

  high:
    "High",

  critical:
    "Critical",
};