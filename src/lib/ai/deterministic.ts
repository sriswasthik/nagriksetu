/**
 * ============================================================
 * DETERMINISTIC CLASSIFIER
 * ============================================================
 *
 * The keyword rule engine that has always been CityTrace's "AI". Moved
 * here from services/ai.ts unchanged in behaviour, for two reasons:
 *
 *   1. services/ai.ts imports the *browser* Supabase client, so nothing
 *      in it could be used from a route handler without dragging that
 *      into a server bundle. The classification now runs server-side
 *      (see app/api/ai/analyze/route.ts), which needs this logic to be
 *      importable on its own.
 *
 *   2. It is pure — no I/O, no clock, no randomness — so it is worth
 *      being able to test directly, and it is what the pipeline falls
 *      back to when a model is unavailable.
 *
 * WHAT IT IS AND IS NOT
 *
 * It is a keyword matcher with hand-tuned weights, not a model. That is
 * why AI_MODEL_NAME says so out loud: whatever produced a complaint's
 * classification is recorded in complaints.ai_model, so a rule-engine
 * result is never mistaken for a model's.
 *
 * Its ceiling is visible in a case like "Streetlight out on Mill Road",
 * which it routes to Roads because "road" scores in the title. A real
 * model handles that; this is the floor, not the goal.
 */

import type {
  AIAnalysisRequest,
  AIAnalysisResult,
  AIComplaintCategory,
  AIDepartment,
  AIPriority,
  AISeverity,
} from "@/types/ai";

/** Recorded in complaints.ai_model when this engine produced the result. */
export const DETERMINISTIC_MODEL_NAME = "citytrace-rules-v2";

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

  /*
   * Nothing is logged here. This function receives a citizen's title and
   * description verbatim, and it used to print both to the server log on
   * every single classification — a complaint's full text, including
   * whatever personal detail the reporter chose to include, in a place
   * nobody had decided should hold it.
   *
   * The route handler logs one line per analysis instead
   * (describeClassification), carrying the decision and not the report.
   */

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
   * A hardcoded pothole branch used to sit here, returning road_damage at
   * 0.96 confidence for any text containing "pothole", with the comment
   * that it "makes the most important demo scenario completely
   * deterministic".
   *
   * It is gone. "pothole" is already a road_damage keyword, so a pothole
   * report still classifies as road damage — through the scoring below,
   * at a confidence derived from how much actually matched. The branch's
   * only effects were to assert a confidence no evidence supported, and
   * to make one keyword outrank every other rule regardless of score, so
   * a complaint mentioning a pothole in passing outranked whatever it was
   * really about.
   */

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
    0.70 + bestScore * 0.06
  );

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
 * PUBLIC ENTRY POINT
 * ========================================================== */

/**
 * Classifies a complaint from its text alone.
 *
 * Never throws and never returns a partial result: every branch of the
 * rule engine produces a complete AIAnalysisResult, which is what makes
 * this usable as the fallback when a model is unavailable — the complaint
 * has to keep moving through the workflow either way.
 *
 * `possibleDuplicate` is left false here. Deciding it needs to compare
 * against other complaints, which is a database question, not a text one
 * — see findPossibleDuplicate() in services/ai.ts.
 */
export function classifyDeterministically(
  request: Pick<AIAnalysisRequest, "title" | "description">
): AIAnalysisResult {
  const detected = detectCategory(request.title, request.description);
  const severity = detectSeverity(request.title, request.description);
  const priority = severityToPriority(severity);

  return {
    category: detected.category,
    severity,
    priority,
    department: detected.department,
    confidence: detected.confidence,
    summary: generateSummary(detected.category, severity, detected.department),
    possibleDuplicate: false,
    duplicateComplaintId: null,
    reasoning: generateReasoning(detected.matchedKeywords, severity),
  };
}

export {
  detectCategory,
  detectSeverity,
  severityToPriority,
  mapPriorityToLevel,
  mapAIToDatabaseCategory,
  mapAIDepartmentToCode,
  generateSummary,
  generateReasoning,
  normalizeText,
};

export type { DatabaseComplaintCategory, DatabaseComplaintPriority };
