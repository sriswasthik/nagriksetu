import { z } from "zod";

import type { AIAnalysisResult } from "@/types/ai";

/**
 * ============================================================
 * MODEL OUTPUT VALIDATION
 * ============================================================
 *
 * The boundary between "something a language model said" and "something
 * CityTrace stores about a citizen's report".
 *
 * Nothing reaches the database without passing through here. That matters
 * more than it sounds: the classification decides a complaint's priority,
 * its SLA deadline and which department is dispatched, so a model that
 * hallucinates `"priority": "URGENT!!!"` or invents a department must be
 * rejected rather than coerced into something plausible-looking.
 *
 * WHAT MODELS ACTUALLY DO WRONG
 *
 * Every case handled below was chosen because small local models do it
 * routinely, not defensively in the abstract:
 *
 *   - wrap JSON in ```json fences, or in a sentence of preamble
 *   - emit a trailing comma, or single quotes
 *   - return confidence as "85%", or 85, when the contract says 0–1
 *   - use a synonym for an enum value: "high priority", "roads", "P-1"
 *   - omit a field entirely
 *   - return a whole essay in `summary`
 *   - return an array containing the object
 *
 * The permissive parts are deliberate and narrow: whitespace, casing, a
 * code fence, a percentage. Anything that would change the *meaning* of
 * the classification is a rejection, because quietly guessing is how a
 * pothole ends up dispatched to Water Works.
 *
 * SAFETY
 *
 * Model output is data, never instruction. It is validated to a closed
 * set of enum values and length-capped strings, then passed as bound
 * parameters to a Postgres function. No part of it is interpolated into
 * SQL, a shell command, or a privileged call — the widest thing a model
 * can influence is which of eight department codes a complaint is routed
 * to, and even that is resolved to an id by the database rather than
 * accepted as one.
 */

/** Caps, so an over-talkative model cannot fill a column with an essay. */
export const SUMMARY_MAX_LENGTH = 400;
export const REASONING_MAX_LENGTH = 600;

const CATEGORIES = [
  "road_damage",
  "garbage",
  "streetlight",
  "water_supply",
  "drainage",
  "traffic",
  "public_safety",
  "sanitation",
  "electricity",
  "other",
] as const;

const DEPARTMENTS = [
  "roads_infrastructure",
  "sanitation",
  "electrical",
  "water_works",
  "drainage",
  "traffic",
  "public_safety",
  "other",
] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

/**
 * Synonyms a model reaches for instead of the exact enum value.
 *
 * Only unambiguous ones. "urgent" maps to critical severity because no
 * other severity could be meant; "roads" maps to roads_infrastructure
 * because there is exactly one roads department. Nothing here changes
 * which of two plausible values is chosen — that would be guessing.
 */
const CATEGORY_ALIASES: Record<string, (typeof CATEGORIES)[number]> = {
  pothole: "road_damage",
  potholes: "road_damage",
  road: "road_damage",
  roads: "road_damage",
  road_defect: "road_damage",
  waste: "garbage",
  rubbish: "garbage",
  trash: "garbage",
  litter: "garbage",
  street_light: "streetlight",
  street_lighting: "streetlight",
  lighting: "streetlight",
  water: "water_supply",
  water_leak: "water_supply",
  water_leakage: "water_supply",
  leak: "water_supply",
  sewage: "drainage",
  sewer: "drainage",
  storm_drain: "drainage",
  waterlogging: "drainage",
  safety: "public_safety",
  hazard: "public_safety",
  power: "electricity",
  electrical: "electricity",
  unknown: "other",
  none: "other",
};

const DEPARTMENT_ALIASES: Record<string, (typeof DEPARTMENTS)[number]> = {
  roads: "roads_infrastructure",
  road: "roads_infrastructure",
  infrastructure: "roads_infrastructure",
  roads_and_infrastructure: "roads_infrastructure",
  public_works: "roads_infrastructure",
  waste_management: "sanitation",
  cleansing: "sanitation",
  electricity: "electrical",
  power: "electrical",
  electricity_board: "electrical",
  water: "water_works",
  water_supply: "water_works",
  water_department: "water_works",
  sewerage: "drainage",
  storm_water: "drainage",
  traffic_police: "traffic",
  safety: "public_safety",
  unknown: "other",
  none: "other",
};

const SEVERITY_ALIASES: Record<string, (typeof SEVERITIES)[number]> = {
  minor: "low",
  trivial: "low",
  moderate: "medium",
  major: "high",
  severe: "critical",
  urgent: "critical",
  emergency: "critical",
};

/*
 * Keys are in post-normaliseToken form — lower case with spaces and
 * hyphens already folded to underscores. Writing "p-1" here looked right
 * and could never match, because the token arrives as "p_1".
 */
const PRIORITY_ALIASES: Record<string, (typeof PRIORITIES)[number]> = {
  p_1: "P1",
  p_2: "P2",
  p_3: "P3",
  p_4: "P4",
  "1": "P1",
  "2": "P2",
  "3": "P3",
  "4": "P4",
  critical: "P1",
  high: "P2",
  medium: "P3",
  low: "P4",
};

/** Lower-cased, trimmed, spaces and hyphens folded to underscores. */
function normaliseToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * An enum field that accepts the exact value, or a listed synonym.
 *
 * Written as a preprocess rather than a union of literals so the error
 * message names the field and the value received, which is what makes a
 * rejected model response debuggable.
 */
function enumField<T extends string>(
  allowed: readonly T[],
  aliases: Record<string, T>,
  label: string
) {
  return z.preprocess((raw) => {
    const token = normaliseToken(raw);

    if ((allowed as readonly string[]).includes(token)) return token;

    // P1..P4 normalise to lower case; restore the canonical form.
    const upper = token.toUpperCase();
    if ((allowed as readonly string[]).includes(upper)) return upper;

    return aliases[token] ?? raw;
  }, z.enum(allowed as unknown as [T, ...T[]], {
    message: `${label} is not one of: ${allowed.join(", ")}`,
  }));
}

/**
 * Confidence as a 0–1 number.
 *
 * Accepts "0.82", "82%" and 82, because models produce all three, and a
 * confidence of 82 silently stored in a 0–1 column would make every
 * downstream comparison wrong. Anything outside 0–100 is rejected rather
 * than clamped: a model that says 1500 has misunderstood the question,
 * and pretending it said 1.0 would hide that.
 */
const confidenceField = z.preprocess((raw) => {
  if (typeof raw === "number") {
    return raw > 1 && raw <= 100 ? raw / 100 : raw;
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    const percent = text.endsWith("%");
    const parsed = Number.parseFloat(percent ? text.slice(0, -1) : text);

    if (!Number.isFinite(parsed)) return raw;

    if (percent) return parsed / 100;

    return parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
  }

  return raw;
}, z
  .number({ message: "confidence must be a number between 0 and 1" })
  .min(0, { message: "confidence must not be negative" })
  .max(1, { message: "confidence must not exceed 1" }));

/** A uuid, or null. Models like to answer "none" or "" here. */
const optionalUuid = z.preprocess((raw) => {
  const text = typeof raw === "string" ? raw.trim() : raw;

  if (
    text === "" ||
    text === "none" ||
    text === "null" ||
    text === "n/a" ||
    text === undefined
  ) {
    return null;
  }

  return text;
}, z.string().uuid({ message: "duplicateComplaintId must be a uuid" }).nullable());

const booleanField = z.preprocess((raw) => {
  if (typeof raw === "string") {
    const token = raw.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(token)) return true;
    if (["false", "no", "n", "0", ""].includes(token)) return false;
  }

  return raw ?? false;
}, z.boolean());

/**
 * The contract a model must satisfy.
 *
 * `summary` and `reasoning` are trimmed and truncated rather than
 * rejected for length: an over-long summary is still a usable summary,
 * whereas an invented department is not.
 */
export const modelAnalysisSchema = z.object({
  category: enumField(CATEGORIES, CATEGORY_ALIASES, "category"),
  severity: enumField(SEVERITIES, SEVERITY_ALIASES, "severity"),
  priority: enumField(PRIORITIES, PRIORITY_ALIASES, "priority"),
  department: enumField(DEPARTMENTS, DEPARTMENT_ALIASES, "department"),
  confidence: confidenceField,

  summary: z
    .string({ message: "summary must be a string" })
    .transform((value) => value.trim().slice(0, SUMMARY_MAX_LENGTH))
    .refine((value) => value.length > 0, {
      message: "summary must not be empty",
    }),

  reasoning: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) =>
      typeof value === "string"
        ? value.trim().slice(0, REASONING_MAX_LENGTH) || null
        : null
    ),

  possibleDuplicate: booleanField.default(false),
  duplicateComplaintId: optionalUuid.default(null),
});

export type ParseFailureReason =
  | "empty"
  | "not-json"
  | "not-an-object"
  | "schema";

export type ParseModelAnalysisResult =
  | { ok: true; result: AIAnalysisResult }
  | { ok: false; reason: ParseFailureReason; detail: string };

/**
 * Pulls a JSON object out of whatever the model actually returned.
 *
 * In order of preference: the whole string, the contents of a fenced
 * block, then the widest brace-balanced span. The last of those is what
 * rescues "Sure! Here is the analysis: { ... } Let me know if…", which is
 * a small model's default behaviour however firmly the prompt says
 * otherwise.
 */
export function extractJsonCandidate(raw: string): string | null {
  const text = raw.trim();

  if (text === "") return null;

  if (text.startsWith("{") || text.startsWith("[")) return text;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first !== -1 && last > first) {
    return text.slice(first, last + 1);
  }

  return null;
}

/**
 * Removes the two syntax errors models make often enough to be worth
 * repairing: a trailing comma before a closing brace or bracket.
 *
 * Deliberately not a general JSON repair. Anything beyond this is a
 * rejection — guessing at malformed structure is how you end up storing
 * a misparsed classification with full confidence.
 */
function repairCommonJsonMistakes(candidate: string): string {
  return candidate.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Validates raw model output into an AIAnalysisResult, or explains why
 * not.
 *
 * Returns a result rather than throwing because every caller needs to
 * *fall back* on failure, not unwind — the complaint has to continue
 * through the workflow whatever the model did.
 */
export function parseModelAnalysis(raw: unknown): ParseModelAnalysisResult {
  if (typeof raw !== "string") {
    // Already-parsed objects are accepted; a provider may hand back JSON.
    return validateShape(raw);
  }

  const candidate = extractJsonCandidate(raw);

  if (candidate === null) {
    return {
      ok: false,
      reason: "empty",
      detail: "the model returned no JSON object",
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(candidate);
  } catch {
    try {
      parsed = JSON.parse(repairCommonJsonMistakes(candidate));
    } catch (error) {
      return {
        ok: false,
        reason: "not-json",
        detail:
          error instanceof Error ? error.message : "the response was not JSON",
      };
    }
  }

  return validateShape(parsed);
}

function validateShape(parsed: unknown): ParseModelAnalysisResult {
  // Models sometimes wrap the object in an array of one.
  const candidate =
    Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;

  /*
   * `typeof [] === "object"`, so arrays have to be excluded explicitly —
   * without this a two-element array reached the object schema and was
   * reported as a schema violation, which is misleading about what the
   * model actually did.
   */
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    return {
      ok: false,
      reason: "not-an-object",
      detail: `expected a JSON object, received ${
        Array.isArray(candidate)
          ? `an array of ${candidate.length}`
          : candidate === null
            ? "null"
            : typeof candidate
      }`,
    };
  }

  const outcome = modelAnalysisSchema.safeParse(candidate);

  if (!outcome.success) {
    const detail = outcome.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    return { ok: false, reason: "schema", detail };
  }

  return { ok: true, result: outcome.data as AIAnalysisResult };
}
