/**
 * ============================================================
 * NAGRIKSETU — AI COMPLAINT ANALYSIS SERVICE
 * ============================================================
 *
 * Step 3G-A
 *
 * MOCK AI ENGINE
 *
 * Responsibilities:
 * - Detect complaint category
 * - Detect severity
 * - Calculate priority
 * - Detect department
 * - Generate summary/reasoning
 * - Store AI analysis
 * - Safely map AI categories to database categories
 *
 * The AI layer and database category enum intentionally have
 * different vocabularies.
 * ============================================================
 */

import { createClient } from "@/lib/supabase/client";

import {
  getComplaintById,
} from "@/lib/services/complaints";

import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIAnalysisResult,
  AIComplaintCategory,
  AIDepartment,
  AIPriority,
  AISeverity,
} from "@/types/ai";

/**
 * ============================================================
 * MOCK AI MODEL
 * ============================================================
 */

const AI_MODEL_NAME = "nagriksetu-mock-ai-v1";

/**
 * ============================================================
 * DATABASE CATEGORY TYPE
 * ============================================================
 *
 * IMPORTANT:
 *
 * Supabase complaint_category currently accepts only:
 *
 * - garbage
 * - water_leakage
 * - pothole
 * - drainage
 * - streetlight
 * - other
 *
 * Do NOT directly save AIComplaintCategory into
 * complaints.category.
 * ============================================================
 */

type DatabaseComplaintCategory =
  | "garbage"
  | "water_leakage"
  | "pothole"
  | "drainage"
  | "streetlight"
  | "other";

/**
 * ============================================================
 * CATEGORY RULES
 * ============================================================
 */

type CategoryRule = {
  category: AIComplaintCategory;
  department: AIDepartment;
  keywords: string[];
};

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
      "broken road",
      "damaged road",
      "crater",
      "road crack",
      "road cracks",
      "footpath",
      "pavement",
      "street damage",
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
      "bin overflow",
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
      "light not working",
      "street light not working",
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
      "no water",
      "drinking water",
      "tap",
      "pipeline",
      "water pipe",
      "water shortage",
      "water problem",
    ],
  },

  {
    category: "drainage",
    department: "drainage",
    keywords: [
      "drain",
      "drainage",
      "blocked drain",
      "open drain",
      "sewer",
      "sewage",
      "sewerage",
      "overflowing drain",
      "drain overflow",
      "stagnant water",
      "waterlogging",
      "water logging",
    ],
  },

  {
    category: "traffic",
    department: "traffic",
    keywords: [
      "traffic",
      "signal",
      "traffic signal",
      "traffic light",
      "signal not working",
      "congestion",
      "jam",
      "parking",
      "illegal parking",
      "road sign",
      "signboard",
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
      "hazard",
      "public safety",
      "broken railing",
      "open manhole",
      "manhole",
      "fallen tree",
      "electric wire",
      "exposed wire",
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
    ],
  },
];

/**
 * ============================================================
 * NORMALIZE TEXT
 * ============================================================
 */

function normalizeText(
  value: string | null | undefined
): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ============================================================
 * DETECT CATEGORY
 * ============================================================
 */

function detectCategory(
  title: string,
  description: string
): {
  category: AIComplaintCategory;
  department: AIDepartment;
  confidence: number;
  matchedKeywords: string[];
} {
  const text = normalizeText(
    `${title} ${description}`
  );

  let bestMatch: CategoryRule | null = null;
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const rule of CATEGORY_RULES) {
    const matchedKeywords =
      rule.keywords.filter((keyword) =>
        text.includes(
          normalizeText(keyword)
        )
      );

    if (matchedKeywords.length === 0) {
      continue;
    }

    const score =
      matchedKeywords.length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
      bestKeywords = matchedKeywords;
    }
  }

  if (!bestMatch) {
    return {
      category: "other",
      department: "other",
      confidence: 0.35,
      matchedKeywords: [],
    };
  }

  const confidence = Math.min(
    0.96,
    0.68 + bestScore * 0.08
  );

  return {
    category: bestMatch.category,
    department: bestMatch.department,
    confidence,
    matchedKeywords: bestKeywords,
  };
}

/**
 * ============================================================
 * DETECT SEVERITY
 * ============================================================
 */

function detectSeverity(
  title: string,
  description: string
): AISeverity {
  const text = normalizeText(
    `${title} ${description}`
  );

  /**
   * CRITICAL
   */

  const criticalKeywords = [
    "death",
    "dead",
    "life threatening",
    "life-threatening",
    "electrocution",
    "fire",
    "major accident",
    "collapsed",
    "collapse",
    "open manhole",
    "exposed electric wire",
    "exposed wire",
  ];

  if (
    criticalKeywords.some(
      (keyword) =>
        text.includes(
          normalizeText(keyword)
        )
    )
  ) {
    return "critical";
  }

  /**
   * HIGH
   */

  const highKeywords = [
    "dangerous",
    "danger",
    "accident",
    "injury",
    "unsafe",
    "heavy traffic",
    "overflow",
    "flood",
    "waterlogging",
    "large pothole",
    "deep pothole",
    "major damage",
  ];

  if (
    highKeywords.some(
      (keyword) =>
        text.includes(
          normalizeText(keyword)
        )
    )
  ) {
    return "high";
  }

  /**
   * MEDIUM
   */

  const mediumKeywords = [
    "broken",
    "damaged",
    "leak",
    "leaking",
    "blocked",
    "overflowing",
    "not working",
    "problem",
    "issue",
  ];

  if (
    mediumKeywords.some(
      (keyword) =>
        text.includes(
          normalizeText(keyword)
        )
    )
  ) {
    return "medium";
  }

  return "low";
}

/**
 * ============================================================
 * SEVERITY → AI PRIORITY
 * ============================================================
 */

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

/**
 * ============================================================
 * AI PRIORITY → DATABASE PRIORITY LEVEL
 * ============================================================
 *
 * Database enum:
 *
 * low
 * medium
 * high
 * critical
 * ============================================================
 */

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

type DatabaseComplaintPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

/**
 * ============================================================
 * AI CATEGORY → DATABASE CATEGORY
 * ============================================================
 *
 * THIS IS THE IMPORTANT FIX.
 *
 * AI has a richer classification system than the current
 * complaints.category database enum.
 *
 * AI category remains stored in ai_category.
 * The mapped category is stored in category.
 * ============================================================
 */

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

    /**
     * These AI categories are valid AI classifications,
     * but are not currently represented in the database
     * complaint_category enum.
     *
     * Keep the detailed AI classification in ai_category
     * and use "other" for the current complaint category.
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

/**
 * ============================================================
 * GENERATE SUMMARY
 * ============================================================
 */

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

/**
 * ============================================================
 * GENERATE REASONING
 * ============================================================
 */

function generateReasoning(
  matchedKeywords: string[],
  severity: AISeverity
): string {
  if (
    matchedKeywords.length === 0
  ) {
    return (
      "No strong category keywords were detected. " +
      "The complaint has been classified as Other."
    );
  }

  const keywordText =
    matchedKeywords
      .slice(0, 5)
      .join(", ");

  return (
    `Detected relevant keywords: ${keywordText}. ` +
    `Severity indicators resulted in a ${severity} severity classification.`
  );
}

/**
 * ============================================================
 * DUPLICATE DETECTION
 * ============================================================
 *
 * Step 3G-A:
 *
 * Basic placeholder implementation.
 *
 * Real implementation can later use:
 * - embeddings
 * - pgvector
 * - semantic similarity
 * - image similarity
 * ============================================================
 */

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

/**
 * ============================================================
 * RUN MOCK AI ANALYSIS
 * ============================================================
 */

export async function analyzeComplaint(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  try {
    const {
      category,
      department,
      confidence,
      matchedKeywords,
    } = detectCategory(
      request.title,
      request.description
    );

    const severity =
      detectSeverity(
        request.title,
        request.description
      );

    const priority =
      severityToPriority(
        severity
      );

    const summary =
      generateSummary(
        category,
        severity,
        department
      );

    const reasoning =
      generateReasoning(
        matchedKeywords,
        severity
      );

    const duplicate =
      await detectPossibleDuplicate(
        request
      );

    const result: AIAnalysisResult = {
      category,

      severity,

      priority,

      department,

      confidence,

      summary,

      possibleDuplicate:
        duplicate.possibleDuplicate,

      duplicateComplaintId:
        duplicate.duplicateComplaintId,

      reasoning,
    };

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

/**
 * ============================================================
 * PROCESS COMPLAINT WITH AI
 * ============================================================
 *
 * Accepts:
 *
 * 1. Complaint UUID
 * 2. Object containing id
 * 3. Object containing complaint_id
 * ============================================================
 */

export async function processComplaintWithAI(
  complaintInput:
    | string
    | {
        id?: string;
        complaint_id?: string;
      }
): Promise<AIAnalysisResponse> {
  /**
   * ----------------------------------------------------------
   * NORMALIZE COMPLAINT ID
   * ----------------------------------------------------------
   */

  let complaintId: string | undefined;

  if (
    typeof complaintInput ===
    "string"
  ) {
    complaintId =
      complaintInput;
  } else if (
    complaintInput &&
    typeof complaintInput ===
      "object"
  ) {
    complaintId =
      complaintInput.id ??
      complaintInput.complaint_id;
  }

  /**
   * ----------------------------------------------------------
   * VALIDATE COMPLAINT ID
   * ----------------------------------------------------------
   */

  if (!complaintId) {
    console.error(
      "AI processing failed: complaint ID was not provided.",
      complaintInput
    );

    return {
      success: false,

      status: "failed",

      error:
        "Complaint ID is missing.",
    };
  }

  if (
    typeof complaintId !==
    "string"
  ) {
    return {
      success: false,

      status: "failed",

      error:
        "Invalid complaint ID.",
    };
  }

  console.log(
    "AI processing complaint:",
    complaintId
  );

  const supabase =
    createClient();

  try {
    /**
     * --------------------------------------------------------
     * LOAD COMPLAINT
     * --------------------------------------------------------
     */

    const complaint =
      await getComplaintById(
        complaintId
      );

    if (!complaint) {
      throw new Error(
        "Complaint not found."
      );
    }

    /**
     * --------------------------------------------------------
     * MARK AI AS PROCESSING
     * --------------------------------------------------------
     */

    const {
      error:
        processingError,
    } = await supabase
      .from("complaints")
      .update({
        ai_analysis_status:
          "processing",

        ai_error_message:
          null,
      })
      .eq(
        "id",
        complaintId
      );

    if (processingError) {
      console.error(
        "AI processing status update error:",
        processingError.message
      );

      throw processingError;
    }

    /**
     * --------------------------------------------------------
     * BUILD AI REQUEST
     * --------------------------------------------------------
     */

    const request: AIAnalysisRequest = {
      complaintId,

      title:
        complaint.title,

      description:
        complaint.description,

      category:
        complaint.category,

      address:
        complaint.address,

      latitude:
        complaint.latitude,

      longitude:
        complaint.longitude,
    };

    /**
     * --------------------------------------------------------
     * RUN MOCK AI
     * --------------------------------------------------------
     */

    const response =
      await analyzeComplaint(
        request
      );

    /**
     * --------------------------------------------------------
     * HANDLE AI FAILURE
     * --------------------------------------------------------
     */

    if (
      !response.success ||
      !response.result
    ) {
      await supabase
        .from("complaints")
        .update({
          ai_analysis_status:
            "failed",

          ai_error_message:
            response.error ??
            "AI analysis failed.",
        })
        .eq(
          "id",
          complaintId
        );

      return response;
    }

    const result =
      response.result;

    /**
     * --------------------------------------------------------
     * MAP AI CATEGORY TO DATABASE CATEGORY
     * --------------------------------------------------------
     *
     * Example:
     *
     * AI:
     *   road_damage
     *
     * Database:
     *   pothole
     *
     * The original AI category is still stored in
     * ai_category.
     */

    const databaseCategory =
      mapAIToDatabaseCategory(
        result.category
      );

    /**
     * --------------------------------------------------------
     * MAP AI PRIORITY TO DATABASE PRIORITY
     * --------------------------------------------------------
     */

    const priorityLevel =
      mapPriorityToLevel(
        result.priority
      );

    /**
     * --------------------------------------------------------
     * CALCULATE PRIORITY SCORE
     * --------------------------------------------------------
     *
     * This gives the existing priority_score column
     * a deterministic value.
     *
     * critical = 100
     * high     = 75
     * medium   = 50
     * low      = 25
     *
     * Confidence slightly adjusts the score.
     */

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

    /**
     * --------------------------------------------------------
     * PRIORITY REASON
     * --------------------------------------------------------
     */

    const priorityReason =
      result.reasoning ??
      `AI classified this complaint as ${result.severity} severity with ${result.priority} priority.`;

    /**
     * --------------------------------------------------------
     * SAVE AI RESULT
     * --------------------------------------------------------
     */

    const {
      error:
        updateError,
    } = await supabase
      .from("complaints")
      .update({
        /**
         * ====================================================
         * NORMAL COMPLAINT FIELDS
         * ====================================================
         *
         * IMPORTANT:
         * Use mapped database category here.
         */

        category:
          databaseCategory,

        priority_level:
          priorityLevel,

        priority_score:
          priorityScore,

        priority_reason:
          priorityReason,

        /**
         * ====================================================
         * AI FIELDS
         * ====================================================
         */

        ai_analysis_status:
          "completed",

        /**
         * Preserve original AI category.
         *
         * Example:
         * public_safety
         *
         * This column is TEXT in the current schema.
         */

        ai_category:
          result.category,

        ai_severity:
          result.severity,

        ai_priority:
          result.priority,

        ai_department:
          result.department,

        ai_confidence:
          result.confidence,

        ai_summary:
          result.summary,

        ai_possible_duplicate:
          result.possibleDuplicate,

        ai_duplicate_complaint_id:
          result.duplicateComplaintId,

        ai_reasoning:
          result.reasoning,

        ai_model:
          AI_MODEL_NAME,

        ai_processed_at:
          new Date().toISOString(),

        ai_error_message:
          null,
      })
      .eq(
        "id",
        complaintId
      );

    /**
     * --------------------------------------------------------
     * DATABASE UPDATE ERROR
     * --------------------------------------------------------
     */

    if (updateError) {
      console.error(
        "AI result database update error:",
        updateError.message
      );

      /**
       * Try to record the failure.
       *
       * Do not throw before attempting this.
       */

      await supabase
        .from("complaints")
        .update({
          ai_analysis_status:
            "failed",

          ai_error_message:
            updateError.message,
        })
        .eq(
          "id",
          complaintId
        );

      throw updateError;
    }

    /**
     * --------------------------------------------------------
     * SUCCESS LOG
     * --------------------------------------------------------
     */

    console.log(
      "AI analysis completed successfully:",
      {
        complaintId,

        aiCategory:
          result.category,

        databaseCategory,

        severity:
          result.severity,

        aiPriority:
          result.priority,

        databasePriority:
          priorityLevel,

        department:
          result.department,

        confidence:
          result.confidence,

        priorityScore,
      }
    );

    /**
     * --------------------------------------------------------
     * RETURN SUCCESS
     * --------------------------------------------------------
     */

    return {
      success: true,

      status: "completed",

      result,
    };
  } catch (error) {
    console.error(
      "Process complaint with AI error:",
      error
    );

    /**
     * --------------------------------------------------------
     * SAVE FAILURE STATE
     * --------------------------------------------------------
     */

    try {
      await supabase
        .from("complaints")
        .update({
          ai_analysis_status:
            "failed",

          ai_error_message:
            error instanceof Error
              ? error.message
              : "AI processing failed.",
        })
        .eq(
          "id",
          complaintId
        );
    } catch (
      secondaryError
    ) {
      console.error(
        "Could not save AI failure state:",
        secondaryError
      );
    }

    return {
      success: false,

      status: "failed",

      error:
        error instanceof Error
          ? error.message
          : "AI processing failed.",
    };
  }
}

/**
 * ============================================================
 * GET AI ANALYSIS
 * ============================================================
 */

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