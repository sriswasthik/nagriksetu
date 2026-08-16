/**
 * ============================================================
 * CITYTRACE — AI COMPLAINT ANALYSIS SERVICE
 * ============================================================
 *
 * MOCK AI ENGINE
 *
 * Responsibilities:
 * - Detect complaint category
 * - Detect severity
 * - Calculate priority
 * - Detect department
 * - Generate summary/reasoning
 * - Persist AI analysis
 * - Persist normalized complaint category/priority
 * - Safely resolve department
 * ============================================================
 */

import { createClient } from "@/lib/supabase/client";
import { getComplaintById } from "@/lib/services/complaints";

import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIAnalysisResult,
  AIComplaintCategory,
  AIDepartment,
  AIPriority,
  AISeverity,
} from "@/types/ai";

/* ============================================================
 * CONSTANTS
 * ========================================================== */

const AI_MODEL_NAME = "citytrace-mock-ai-v2";

/* ============================================================
 * DATABASE TYPES
 * ========================================================== */

type DatabaseComplaintCategory =
  | "garbage"
  | "water_leakage"
  | "pothole"
  | "drainage"
  | "streetlight"
  | "other";

type DatabaseComplaintPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

/* ============================================================
 * CATEGORY RULE
 * ========================================================== */

type CategoryRule = {
  category: AIComplaintCategory;
  department: AIDepartment;
  keywords: string[];
};

/* ============================================================
 * CATEGORY RULES
 * ========================================================== */

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "road_damage",
    department: "roads_infrastructure",
    keywords: [
      "pothole",
      "potholes",
      "road",
      "roads",
      "road damage",
      "road damaged",
      "damaged road",
      "broken road",
      "bad road",
      "poor road",
      "road crack",
      "road cracks",
      "cracked road",
      "crater",
      "pavement",
      "footpath",
      "sidewalk",
      "street damage",
      "road surface",
    ],
  },

  {
    category: "garbage",
    department: "sanitation",
    keywords: [
      "garbage",
      "trash",
      "waste",
      "dump",
      "dumped",
      "dumping",
      "litter",
      "rubbish",
      "waste collection",
      "garbage collection",
      "dustbin",
      "dust bin",
      "bin overflow",
      "overflowing bin",
      "garbage pile",
    ],
  },

  {
    category: "streetlight",
    department: "electrical",
    keywords: [
      "streetlight",
      "street light",
      "street lamp",
      "lamp post",
      "lamp",
      "light pole",
      "dark street",
      "dark road",
      "light not working",
      "street light not working",
      "streetlight not working",
      "broken streetlight",
      "broken street light",
    ],
  },

  {
    category: "water_supply",
    department: "water_works",
    keywords: [
      "water",
      "water supply",
      "water leakage",
      "water leak",
      "water leaking",
      "leaking pipe",
      "leaking pipeline",
      "no water",
      "drinking water",
      "tap",
      "pipeline",
      "water pipe",
      "water shortage",
      "water problem",
      "water connection",
    ],
  },

  {
    category: "drainage",
    department: "drainage",
    keywords: [
      "drain",
      "drainage",
      "blocked drain",
      "blocked drainage",
      "open drain",
      "sewer",
      "sewage",
      "sewerage",
      "overflowing drain",
      "drain overflow",
      "stagnant water",
      "waterlogging",
      "water logging",
      "flooded drain",
      "drain blockage",
    ],
  },

  {
    category: "traffic",
    department: "traffic",
    keywords: [
      "traffic",
      "traffic signal",
      "signal",
      "traffic light",
      "signal not working",
      "congestion",
      "traffic jam",
      "jam",
      "parking",
      "illegal parking",
      "road sign",
      "signboard",
      "traffic sign",
    ],
  },

  {
    category: "public_safety",
    department: "public_safety",
    keywords: [
      "unsafe",
      "danger",
      "dangerous",
      "accident",
      "accidents",
      "injury",
      "hazard",
      "public safety",
      "broken railing",
      "open manhole",
      "manhole",
      "fallen tree",
      "electric wire",
      "exposed wire",
      "live wire",
    ],
  },

  {
    category: "sanitation",
    department: "sanitation",
    keywords: [
      "sanitation",
      "toilet",
      "public toilet",
      "dirty",
      "unclean",
      "hygiene",
      "filth",
      "cleaning",
      "cleanliness",
    ],
  },

  {
    category: "electricity",
    department: "electrical",
    keywords: [
      "electricity",
      "electric",
      "power",
      "power cut",
      "power outage",
      "electric pole",
      "transformer",
      "wire",
      "electric wire",
      "current",
      "power failure",
    ],
  },
];

/* ============================================================
 * TEXT NORMALIZATION
 * ========================================================== */

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
 * KEYWORD MATCHING
 * ========================================================== */

function keywordMatches(
  text: string,
  keyword: string
): boolean {
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  return text.includes(normalizedKeyword);
}

/* ============================================================
 * CATEGORY DETECTION
 * ========================================================== */

function detectCategory(
  title: string,
  description: string
): {
  category: AIComplaintCategory;
  department: AIDepartment;
  confidence: number;
  matchedKeywords: string[];
} {
  const titleText = normalizeText(title);
  const descriptionText = normalizeText(description);

  const text = normalizeText(
    `${titleText} ${descriptionText}`
  );

  console.log("AI category detection input:", {
    title,
    description,
    normalizedText: text,
  });

  let bestMatch: CategoryRule | null = null;
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const rule of CATEGORY_RULES) {
    const matches = rule.keywords.filter((keyword) =>
      keywordMatches(text, keyword)
    );

    if (matches.length === 0) {
      continue;
    }

    /*
     * Give multi-word matches more weight.
     *
     * Example:
     * "large pothole on main road"
     *
     * pothole = 1
     * road = 1
     *
     * Result => road_damage
     */
    const score = matches.reduce(
      (total, keyword) => {
        const words = normalizeText(keyword).split(" ");

        return total + Math.max(1, words.length);
      },
      0
    );

    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
      bestKeywords = matches;
    }
  }

  /*
   * Explicit pothole fallback.
   *
   * This makes the most important demo scenario
   * completely deterministic.
   */
  if (
    text.includes("pothole") ||
    text.includes("potholes")
  ) {
    return {
      category: "road_damage",
      department: "roads_infrastructure",
      confidence: 0.96,
      matchedKeywords: ["pothole"],
    };
  }

  if (!bestMatch) {
    console.warn(
      "AI category detection: no category matched."
    );

    return {
      category: "other",
      department: "other",
      confidence: 0.35,
      matchedKeywords: [],
    };
  }

  const confidence = Math.min(
    0.96,
    0.70 + bestScore * 0.06
  );

  console.log("AI category detected:", {
    category: bestMatch.category,
    department: bestMatch.department,
    confidence,
    matchedKeywords: bestKeywords,
  });

  return {
    category: bestMatch.category,
    department: bestMatch.department,
    confidence,
    matchedKeywords: bestKeywords,
  };
}

/* ============================================================
 * SEVERITY DETECTION
 * ========================================================== */

function detectSeverity(
  title: string,
  description: string
): AISeverity {
  const text = normalizeText(
    `${title} ${description}`
  );

  const criticalKeywords = [
    "death",
    "dead",
    "life threatening",
    "electrocution",
    "fire",
    "major accident",
    "collapsed",
    "collapse",
    "open manhole",
    "exposed electric wire",
    "exposed wire",
    "live wire",
  ];

  if (
    criticalKeywords.some((keyword) =>
      keywordMatches(text, keyword)
    )
  ) {
    return "critical";
  }

  const highKeywords = [
    "dangerous",
    "danger",
    "accident",
    "accidents",
    "injury",
    "unsafe",
    "heavy traffic",
    "overflow",
    "flood",
    "waterlogging",
    "large pothole",
    "large potholes",
    "deep pothole",
    "deep potholes",
    "major damage",
    "severe damage",
    "causes accidents",
  ];

  if (
    highKeywords.some((keyword) =>
      keywordMatches(text, keyword)
    )
  ) {
    return "high";
  }

  const mediumKeywords = [
    "broken",
    "damaged",
    "damage",
    "leak",
    "leaking",
    "blocked",
    "overflowing",
    "not working",
    "problem",
    "issue",
    "crack",
    "cracked",
  ];

  if (
    mediumKeywords.some((keyword) =>
      keywordMatches(text, keyword)
    )
  ) {
    return "medium";
  }

  return "low";
}

/* ============================================================
 * SEVERITY → AI PRIORITY
 * ========================================================== */

function severityToPriority(
  severity: AISeverity
): AIPriority {
  switch (severity) {
    case "critical":
      return "P1";

    case "high":
      return "P2";

    case "medium":
      return "P3";

    case "low":
    default:
      return "P4";
  }
}

/* ============================================================
 * AI PRIORITY → DATABASE PRIORITY
 * ========================================================== */

function mapPriorityToLevel(
  priority: AIPriority
): DatabaseComplaintPriority {
  switch (priority) {
    case "P1":
      return "critical";

    case "P2":
      return "high";

    case "P3":
      return "medium";

    case "P4":
    default:
      return "low";
  }
}

/* ============================================================
 * AI CATEGORY → DATABASE CATEGORY
 * ========================================================== */

function mapAIToDatabaseCategory(
  category: AIComplaintCategory
): DatabaseComplaintCategory {
  switch (category) {
    case "road_damage":
      return "pothole";

    case "water_supply":
      return "water_leakage";

    case "garbage":
      return "garbage";

    case "drainage":
      return "drainage";

    case "streetlight":
      return "streetlight";

    /*
     * These AI categories don't currently have
     * dedicated database category values.
     */
    case "traffic":
    case "public_safety":
    case "sanitation":
    case "electricity":
    case "other":
    default:
      return "other";
  }
}

/* ============================================================
 * AI DEPARTMENT → DATABASE CODE
 * ========================================================== */

function mapAIDepartmentToCode(
  department: AIDepartment
): string {
  switch (department) {
    case "roads_infrastructure":
      return "ROADS";

    case "sanitation":
      return "SANITATION";

    case "water_works":
      return "WATER";

    case "drainage":
      return "DRAINAGE";

    case "electrical":
      return "ELECTRICAL";

    case "traffic":
      return "TRAFFIC";

    case "public_safety":
      return "SAFETY";

    case "other":
    default:
      return "OTHER";
  }
}

/* ============================================================
 * SUMMARY
 * ========================================================== */

function generateSummary(
  category: AIComplaintCategory,
  severity: AISeverity,
  department: AIDepartment
): string {
  const categoryLabels: Record<
    AIComplaintCategory,
    string
  > = {
    road_damage: "road damage",
    garbage: "garbage/waste",
    streetlight: "streetlight",
    water_supply: "water supply",
    drainage: "drainage",
    traffic: "traffic",
    public_safety: "public safety",
    sanitation: "sanitation",
    electricity: "electricity",
    other: "general civic issue",
  };

  const departmentLabels: Record<
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
      "the appropriate civic department",
  };

  return (
    `The complaint appears to concern ` +
    `${categoryLabels[category]}. ` +
    `The detected severity is ${severity}. ` +
    `It should be routed to ${departmentLabels[department]}.`
  );
}

/* ============================================================
 * REASONING
 * ========================================================== */

function generateReasoning(
  matchedKeywords: string[],
  severity: AISeverity
): string {
  if (matchedKeywords.length === 0) {
    return (
      "No strong category keywords were detected. " +
      "The complaint has been classified as Other."
    );
  }

  return (
    `Detected relevant keywords: ` +
    `${matchedKeywords.slice(0, 5).join(", ")}. ` +
    `Severity indicators resulted in a ` +
    `${severity} severity classification.`
  );
}

/* ============================================================
 * DUPLICATE DETECTION
 * ========================================================== */

async function detectPossibleDuplicate(
  _request: AIAnalysisRequest
): Promise<{
  possibleDuplicate: boolean;
  duplicateComplaintId: string | null;
}> {
  return {
    possibleDuplicate: false,
    duplicateComplaintId: null,
  };
}

/* ============================================================
 * ANALYZE COMPLAINT
 * ========================================================== */

export async function analyzeComplaint(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  try {
    const detected = detectCategory(
      request.title,
      request.description
    );

    const severity = detectSeverity(
      request.title,
      request.description
    );

    const priority =
      severityToPriority(severity);

    const summary = generateSummary(
      detected.category,
      severity,
      detected.department
    );

    const reasoning = generateReasoning(
      detected.matchedKeywords,
      severity
    );

    const duplicate =
      await detectPossibleDuplicate(request);

    const result: AIAnalysisResult = {
      category: detected.category,
      severity,
      priority,
      department: detected.department,
      confidence: detected.confidence,
      summary,
      possibleDuplicate:
        duplicate.possibleDuplicate,
      duplicateComplaintId:
        duplicate.duplicateComplaintId,
      reasoning,
    };

    console.log(
      "FINAL AI RESULT:",
      result
    );

    return {
      success: true,
      status: "completed",
      result,
    };
  } catch (error) {
    console.error(
      "AI analysis error:",
      error
    );

    return {
      success: false,
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "AI analysis failed.",
    };
  }
}

/* ============================================================
 * PROCESS COMPLAINT WITH AI
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
  } else if (
    complaintInput &&
    typeof complaintInput === "object"
  ) {
    complaintId =
      complaintInput.id ??
      complaintInput.complaint_id;
  }

  if (!complaintId) {
    return {
      success: false,
      status: "failed",
      error: "Complaint ID is missing.",
    };
  }

  const supabase = createClient();

  try {
    console.log(
      "================================================"
    );
    console.log(
      "STARTING AI COMPLAINT PROCESSING"
    );
    console.log(
      "Complaint ID:",
      complaintId
    );
    console.log(
      "================================================"
    );

    /* --------------------------------------------------------
     * LOAD COMPLAINT
     * ------------------------------------------------------ */

    const complaint =
      await getComplaintById(complaintId);

    if (!complaint) {
      throw new Error(
        "Complaint not found."
      );
    }

    console.log(
      "Complaint loaded:",
      {
        id: complaint.id,
        title: complaint.title,
        description: complaint.description,
        existingCategory: complaint.category,
      }
    );

    /* --------------------------------------------------------
     * MARK PROCESSING
     * ------------------------------------------------------ */

    /*
     * Routed through set_complaint_ai_status() rather than a direct
     * PATCH. enforce_complaint_authority() blocks citizens from writing
     * the ai_* columns, because this whole function runs in the
     * reporting citizen's browser; the function is the sanctioned path
     * and re-checks that the caller owns the complaint.
     */
    const {
      error: processingError,
    } = await supabase.rpc("set_complaint_ai_status", {
      p_complaint_id: complaintId,
      p_status: "processing",
      p_error: null,
    });

    if (processingError) {
      throw processingError;
    }

    /* --------------------------------------------------------
     * BUILD REQUEST
     * ------------------------------------------------------ */

    const request: AIAnalysisRequest = {
      complaintId,

      title: complaint.title ?? "",

      description:
        complaint.description ?? "",

      category:
        complaint.category,

      address:
        complaint.address,

      latitude:
        complaint.latitude,

      longitude:
        complaint.longitude,
    };

    /* --------------------------------------------------------
     * RUN AI
     * ------------------------------------------------------ */

    const response =
      await analyzeComplaint(request);

    if (
      !response.success ||
      !response.result
    ) {
      await supabase.rpc("set_complaint_ai_status", {
        p_complaint_id: complaintId,
        p_status: "failed",
        p_error:
          response.error ??
          "AI analysis failed.",
      });

      return response;
    }

    const result = response.result;

    /* --------------------------------------------------------
     * MAP CATEGORY + PRIORITY
     * ------------------------------------------------------ */

    const databaseCategory =
      mapAIToDatabaseCategory(
        result.category
      );

    const priorityLevel =
      mapPriorityToLevel(
        result.priority
      );

    /* --------------------------------------------------------
     * PRIORITY SCORE
     * ------------------------------------------------------ */

    const basePriorityScore =
      result.priority === "P1"
        ? 100
        : result.priority === "P2"
          ? 75
          : result.priority === "P3"
            ? 50
            : 25;

    const priorityScore = Math.round(
      basePriorityScore *
        (0.75 +
          result.confidence * 0.25)
    );

    const priorityReason =
      result.reasoning ??
      `AI classified this complaint as ${result.severity} severity with ${result.priority} priority.`;

    /* --------------------------------------------------------
     * DEPARTMENT
     * ------------------------------------------------------ */

    /*
     * Only the code is computed here. apply_complaint_triage() resolves
     * it to a department id server-side, so a caller cannot route a
     * complaint to an arbitrary department by passing its uuid. An
     * unknown code leaves the complaint unrouted, as the previous
     * client-side lookup did.
     */
    const departmentCode =
      mapAIDepartmentToCode(
        result.department
      );

    /* --------------------------------------------------------
     * LOG FINAL RESULT
     * ------------------------------------------------------ */

    console.log(
      "================================================"
    );
    console.log(
      "FINAL AI ANALYSIS"
    );
    console.log(
      "Category:",
      result.category
    );
    console.log(
      "Database category:",
      databaseCategory
    );
    console.log(
      "Severity:",
      result.severity
    );
    console.log(
      "AI priority:",
      result.priority
    );
    console.log(
      "Database priority:",
      priorityLevel
    );
    console.log(
      "Confidence:",
      result.confidence
    );
    console.log(
      "Department:",
      result.department
    );
    console.log(
      "================================================"
    );

    /* --------------------------------------------------------
     * SAVE EVERYTHING
     * ------------------------------------------------------ */

    /*
     * One RPC instead of a whole-row PATCH.
     *
     * apply_complaint_triage() is the only path a citizen has to the
     * triage columns, and it is once-only for them: without that, a
     * reporter could re-run the classifier until it produced a priority
     * they liked, or overwrite a triage a supervisor had corrected. It
     * also stamps ai_processed_at from the server clock and lets the
     * SLA trigger derive sla_due_at, so neither can be supplied by the
     * caller.
     */
    const {
      error: updateError,
    } = await supabase.rpc("apply_complaint_triage", {
      p_complaint_id: complaintId,
      p_category: databaseCategory,
      p_priority_level: priorityLevel,
      p_priority_score: priorityScore,
      p_priority_reason: priorityReason,
      p_department_code: departmentCode,
      p_ai_category: result.category,
      p_ai_severity: result.severity,
      p_ai_priority: result.priority,
      p_ai_department: result.department,
      p_ai_confidence: result.confidence,
      p_ai_summary: result.summary,
      p_ai_reasoning: result.reasoning,
      p_ai_possible_duplicate: result.possibleDuplicate,
      p_ai_duplicate_complaint_id: result.duplicateComplaintId,
      p_ai_model: AI_MODEL_NAME,
    });

    if (updateError) {
      console.error(
        "FAILED TO SAVE AI RESULT:",
        updateError
      );

      throw updateError;
    }

    /* --------------------------------------------------------
     * VERIFY DATABASE UPDATE
     * ------------------------------------------------------ */

    const {
      data: verification,
      error: verificationError,
    } = await supabase
      .from("complaints")
      .select(
        `
        category,
        priority_level,
        priority_score,
        ai_analysis_status,
        ai_category,
        ai_severity,
        ai_priority,
        ai_department,
        ai_confidence,
        ai_summary
        `
      )
      .eq("id", complaintId)
      .maybeSingle();

    if (verificationError) {
      console.warn(
        "AI verification warning:",
        verificationError.message
      );
    } else {
      console.log(
        "DATABASE VERIFICATION:",
        verification
      );
    }

    console.log(
      "AI analysis saved successfully:",
      complaintId
    );

    return {
      success: true,
      status: "completed",
      result,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI processing failed.";

    /*
     * This path is handled and returned to the caller, so keep it as a
     * warning instead of a console error that looks like an unhandled crash.
     */
    console.warn("AI processing failed:", message);

    try {
      await supabase.rpc("set_complaint_ai_status", {
        p_complaint_id: complaintId,
        p_status: "failed",
        p_error: message,
      });
    } catch (secondaryError) {
      console.error(
        "Could not save AI failure state:",
        secondaryError
      );
    }

    return {
      success: false,
      status: "failed",
      error: message,
    };
  }
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