import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  classifyComplaint,
  describeClassification,
} from "@/lib/ai/analyze";
import { mapAIDepartmentToCode, mapAIToDatabaseCategory, mapPriorityToLevel } from "@/lib/ai/deterministic";

/**
 * ============================================================
 * POST /api/ai/analyze
 * ============================================================
 *
 * Classifies one complaint and persists the result.
 *
 * WHY THIS EXISTS AS A ROUTE
 *
 * The classification used to run in the reporting citizen's browser: it
 * read the complaint, classified it, and PATCHed the priority, department
 * and SLA back. Whatever the browser sent became the municipality's
 * triage. Moving it here closes that, and it is the last open item from
 * the complaint-lifecycle work.
 *
 * Three things make it a boundary rather than a relocation:
 *
 *   1. **The caller is authenticated.** The session comes from the cookie,
 *      not the body.
 *   2. **The complaint text is read from the database**, never taken from
 *      the request. A client cannot have one report classified as though
 *      it were another, or submit innocuous text and then classify
 *      something alarming.
 *   3. **The classification is not accepted from the client at all.** The
 *      request says only *which* complaint. Category, priority, department
 *      and confidence are decided here.
 *
 * WHAT A CLIENT LEARNS
 *
 * The validated analysis, and whether it came from a model or the rule
 * engine. Not the prompt, not the model endpoint, not the provider's error
 * text — a citizen has no use for "connection refused to
 * http://10.0.0.4:11434" and it describes internal infrastructure.
 * Operators get that in the server log.
 */

/** Never prerendered or cached: it authenticates and it writes. */
export const dynamic = "force-dynamic";

interface AnalyzeRequestBody {
  complaintId?: unknown;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: AnalyzeRequestBody;

  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400 }
    );
  }

  const complaintId =
    typeof body.complaintId === "string" ? body.complaintId.trim() : "";

  if (!UUID_PATTERN.test(complaintId)) {
    return NextResponse.json(
      { error: "A valid complaintId is required." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }

  /*
   * Row-level security decides whether this caller may see the complaint,
   * so an unauthorised id is indistinguishable from a missing one — which
   * is the correct answer to give either way.
   */
  const { data: complaint, error: readError } = await supabase
    .from("complaints")
    .select(
      "id, title, description, category, address, latitude, longitude, status, ai_analysis_status, ai_processed_at"
    )
    .eq("id", complaintId)
    .maybeSingle();

  if (readError) {
    console.error("AI analyze: complaint read failed", readError.message);

    return NextResponse.json(
      { error: "The report could not be read." },
      { status: 500 }
    );
  }

  if (!complaint) {
    return NextResponse.json({ error: "No such report." }, { status: 404 });
  }

  /*
   * Already processed. Returning 200 with the existing analysis rather
   * than an error, because two tabs both triggering triage is ordinary,
   * not exceptional — and the caller's next action (show the result) is
   * the same either way.
   *
   * apply_complaint_triage() enforces this too; checking here saves a
   * pointless model call.
   */
  if (complaint.ai_processed_at) {
    return NextResponse.json({
      status: "completed",
      alreadyProcessed: true,
      analysis: await readAnalysis(supabase, complaintId),
    });
  }

  /*
   * Another request is mid-flight. Say so instead of starting a second
   * model call: the client polls, and a duplicate run would be refused by
   * the once-only guard anyway after burning the inference.
   */
  if (complaint.ai_analysis_status === "processing") {
    return NextResponse.json(
      { status: "processing", alreadyProcessed: false },
      { status: 202 }
    );
  }

  await supabase.rpc("set_complaint_ai_status", {
    p_complaint_id: complaintId,
    p_status: "processing",
    p_error: null,
  });

  const classification = await classifyComplaint({
    complaintId,
    title: complaint.title ?? "",
    description: complaint.description ?? "",
    category: complaint.category,
    address: complaint.address,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
  });

  // Provenance and timing, without the complaint text.
  console.info("AI analyze:", describeClassification(classification, complaintId));

  const { result } = classification;

  const { error: persistError } = await supabase.rpc(
    "apply_complaint_triage",
    {
      p_complaint_id: complaintId,
      // The DB enum is narrower than the AI category set; the richer value
      // is kept in ai_category.
      p_category: mapAIToDatabaseCategory(result.category),
      p_priority_level: mapPriorityToLevel(result.priority),
      p_priority_score: confidenceToScore(result),
      p_priority_reason: result.reasoning ?? result.summary,
      // A code, not an id: the database resolves it, so a model cannot
      // route a complaint to an arbitrary uuid.
      p_department_code: mapAIDepartmentToCode(result.department),
      p_ai_category: result.category,
      p_ai_severity: result.severity,
      p_ai_priority: result.priority,
      p_ai_department: result.department,
      p_ai_confidence: result.confidence,
      p_ai_summary: result.summary,
      p_ai_reasoning: result.reasoning,
      p_ai_possible_duplicate: result.possibleDuplicate,
      p_ai_duplicate_complaint_id: result.duplicateComplaintId,
      p_ai_model: classification.model,
    }
  );

  if (persistError) {
    console.error("AI analyze: persist failed", persistError.message);

    await supabase.rpc("set_complaint_ai_status", {
      p_complaint_id: complaintId,
      p_status: "failed",
      // The database's own message, which is written to be read. Prompts
      // and endpoints never reach this column.
      p_error: persistError.message.slice(0, 500),
    });

    return NextResponse.json(
      { error: "The analysis could not be saved." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "completed",
    alreadyProcessed: false,
    source: classification.source,
    analysis: await readAnalysis(supabase, complaintId),
  });
}

/**
 * Priority score, 0-100, for queue ordering.
 *
 * Derived from severity rather than from confidence: how urgent a
 * complaint is and how sure we are about it are different questions, and
 * ordering a queue by certainty would put a confidently-trivial pothole
 * above a tentatively-identified gas smell. Confidence only nudges within
 * the band, so a hesitant critical still outranks a certain low.
 */
function confidenceToScore(result: {
  severity: string;
  confidence: number;
}): number {
  const base =
    result.severity === "critical"
      ? 90
      : result.severity === "high"
        ? 70
        : result.severity === "medium"
          ? 45
          : 20;

  return Math.min(100, Math.round(base + result.confidence * 10));
}

/** The persisted analysis, read back so the client sees stored state. */
async function readAnalysis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  complaintId: string
) {
  const { data } = await supabase
    .from("complaints")
    .select(
      `ai_analysis_status,
       ai_category,
       ai_severity,
       ai_priority,
       ai_department,
       ai_confidence,
       ai_summary,
       ai_reasoning,
       ai_possible_duplicate,
       ai_duplicate_complaint_id,
       ai_model,
       ai_processed_at,
       priority_level,
       priority_score,
       status`
    )
    .eq("id", complaintId)
    .maybeSingle();

  return data;
}
