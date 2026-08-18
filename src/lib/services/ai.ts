/**
 * ============================================================
 * CITYTRACE — AI COMPLAINT ANALYSIS SERVICE
 * ============================================================
 *
 * The client-side surface of the analysis pipeline. The work itself
 * happens in two places that this module deliberately does not:
 *
 *   lib/ai/deterministic.ts   the keyword rule engine (pure)
 *   lib/ai/ollama.ts          the local model provider (server only)
 *   lib/ai/analyze.ts         model-then-fallback orchestration
 *   app/api/ai/analyze        the authenticated entry point that persists
 *
 * What is left here: the duplicate check, a text-only classification for
 * existing callers, the pipeline trigger, and the analysis read.
 *
 * The reason for the split is that classification used to run in the
 * reporting citizen's browser and PATCH its own conclusions back, so the
 * citizen's client decided their complaint's priority, SLA and department.
 * ============================================================
 */

import { createClient } from "@/lib/supabase/client";

import {
  classifyDeterministically,
  mapAIToDatabaseCategory,
} from "@/lib/ai/deterministic";

import type { AIAnalysisRequest, AIAnalysisResponse } from "@/types/ai";

/* ============================================================
 * CONSTANTS
 * ==========================================================
 *
 * AI_MODEL_NAME is gone. The engine that produced a classification now
 * names itself: DETERMINISTIC_MODEL_NAME for the rule engine, or the
 * Ollama model's own name. Recording a single hardcoded string made a
 * model result and a keyword result indistinguishable afterwards.
 * ========================================================== */

/* ============================================================
 * DETERMINISTIC CLASSIFIER
 * ==========================================================
 *
 * The rule engine that used to live here now lives in
 * src/lib/ai/deterministic.ts, unchanged in behaviour. It had to move so
 * that the server route could classify without importing this module,
 * which pulls in the browser Supabase client.
 */

/* ============================================================
 * DUPLICATE DETECTION
 * ==========================================================
 *
 * Was a stub returning `{ possibleDuplicate: false }` for every
 * complaint, so ai_possible_duplicate has never been anything but false
 * and the duplicate_clusters tables have never held a row.
 *
 * Now a real check, and deliberately a narrow one: the same category
 * reported within DUPLICATE_RADIUS_DEGREES and DUPLICATE_WINDOW_HOURS of
 * this one. Two people reporting one pothole is the case worth catching;
 * anything cleverer needs embeddings, which is not what this is.
 *
 * It is advisory. It flags for an officer's attention and never merges,
 * closes or reassigns anything on its own.
 * ========================================================== */

/** ~0.0045° ≈ 500 m at the equator. Same street, not same district. */
const DUPLICATE_RADIUS_DEGREES = 0.0045;

const DUPLICATE_WINDOW_HOURS = 72;

export async function findPossibleDuplicate(
  request: AIAnalysisRequest,
  databaseCategory: string
): Promise<{
  possibleDuplicate: boolean;
  duplicateComplaintId: string | null;
}> {
  const none = { possibleDuplicate: false, duplicateComplaintId: null };

  if (request.latitude === null || request.latitude === undefined) return none;
  if (request.longitude === null || request.longitude === undefined) return none;

  const supabase = createClient();

  const since = new Date(
    Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  /*
   * A bounding box rather than a radius: this is a filter, not a distance
   * measurement, and a box is an index-friendly comparison where haversine
   * in the client would mean fetching every recent complaint to measure it.
   */
  const { data, error } = await supabase
    .from("complaints")
    .select("id, latitude, longitude")
    .neq("id", request.complaintId)
    .eq("category", databaseCategory)
    .gte("created_at", since)
    .not("status", "in", "(resolved,rejected)")
    .gte("latitude", request.latitude - DUPLICATE_RADIUS_DEGREES)
    .lte("latitude", request.latitude + DUPLICATE_RADIUS_DEGREES)
    .gte("longitude", request.longitude - DUPLICATE_RADIUS_DEGREES)
    .lte("longitude", request.longitude + DUPLICATE_RADIUS_DEGREES)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    /*
     * A citizen only sees their own complaints, so this returns nothing
     * for them — by design, not by failure. Duplicate detection is
     * meaningful for staff, and an unavailable check must not fail the
     * analysis.
     */
    console.error("Duplicate check unavailable:", error.message);
    return none;
  }

  const match = data?.[0];

  return match
    ? { possibleDuplicate: true, duplicateComplaintId: match.id as string }
    : none;
}

/* ============================================================
 * ANALYZE COMPLAINT
 * ==========================================================
 *
 * Text-only classification, using the deterministic engine.
 *
 * Kept for its existing callers and its existing contract. It does NOT
 * call the model: a model call belongs on the server, where the prompt and
 * the endpoint stay private and the caller is authenticated. Use
 * processComplaintWithAI() for the real pipeline.
 * ========================================================== */

export async function analyzeComplaint(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  try {
    const result = classifyDeterministically(request);

    const duplicate = await findPossibleDuplicate(
      request,
      mapAIToDatabaseCategory(result.category)
    );

    return {
      success: true,
      status: "completed",
      result: {
        ...result,
        possibleDuplicate: duplicate.possibleDuplicate,
        duplicateComplaintId: duplicate.duplicateComplaintId,
      },
    };
  } catch (error) {
    console.error("AI analysis error:", error);

    return {
      success: false,
      status: "failed",
      error:
        error instanceof Error ? error.message : "AI analysis failed.",
    };
  }
}

/* ============================================================
 * PROCESS COMPLAINT WITH AI
 * ==========================================================
 *
 * The pipeline entry point, called from the complaint detail page.
 *
 * Now a client of POST /api/ai/analyze rather than doing the work itself.
 * What moved to the server, and why:
 *
 *   - The classification. It used to happen in the reporting citizen's
 *     browser, which meant whatever the browser PATCHed became the
 *     municipality's triage.
 *   - The model call, so the prompt and the Ollama endpoint are never in a
 *     client bundle.
 *   - The persistence, so the complaint text the analysis describes is
 *     read from the database rather than supplied alongside it.
 *
 * The signature and AIAnalysisResponse contract are unchanged, so the
 * detail page's polling, retry and failed-state handling all still apply.
 * ========================================================== */

export async function processComplaintWithAI(
  complaintInput:
    | string
    | {
        id?: string;
        complaint_id?: string;
      }
): Promise<AIAnalysisResponse> {
  let complaintId: string | undefined;

  if (typeof complaintInput === "string") {
    complaintId = complaintInput;
  } else if (complaintInput && typeof complaintInput === "object") {
    complaintId = complaintInput.id ?? complaintInput.complaint_id;
  }

  if (!complaintId) {
    return {
      success: false,
      status: "failed",
      error: "Complaint ID is missing.",
    };
  }

  let response: Response;

  try {
    response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complaintId }),
    });
  } catch (error) {
    console.error("AI analysis request failed:", error);

    return {
      success: false,
      status: "failed",
      error:
        "Triage could not be reached. Your report is filed and will still be reviewed.",
    };
  }

  /* 202 — a run is already in flight, so the caller should poll. */
  if (response.status === 202) {
    return { success: true, status: "processing" };
  }

  let payload: {
    status?: string;
    error?: string;
    analysis?: unknown;
  };

  try {
    payload = await response.json();
  } catch {
    return {
      success: false,
      status: "failed",
      error: "Triage returned an unreadable response.",
    };
  }

  if (!response.ok) {
    /*
     * The route's message, which is written for a citizen. Provider
     * detail, prompts and endpoints stay in the server log.
     */
    return {
      success: false,
      status: "failed",
      error: payload.error ?? "Triage did not complete.",
    };
  }

  /*
   * The persisted analysis is the authority, and the detail page reloads
   * from the database immediately after this returns. Reconstructing an
   * AIAnalysisResult here would be a second, divergent copy of state that
   * is already committed, so `result` is deliberately omitted.
   */
  return { success: true, status: "completed" };
}

/* ============================================================
 * GET AI ANALYSIS
 * ========================================================== */

export async function getComplaintAIAnalysis(
  complaintId: string
) {
  if (!complaintId) {
    throw new Error(
      "Complaint ID is required."
    );
  }

  const supabase =
    createClient();

  const {
    data,
    error,
  } = await supabase
    .from("complaints")
    .select(
      `
      ai_analysis_status,
      ai_category,
      ai_severity,
      ai_priority,
      ai_department,
      ai_confidence,
      ai_summary,
      ai_possible_duplicate,
      ai_duplicate_complaint_id,
      ai_reasoning,
      ai_model,
      ai_processed_at,
      ai_error_message
      `
    )
    .eq(
      "id",
      complaintId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Get AI analysis error:",
      error.message
    );

    throw error;
  }

  return data;
}