import {
  DETERMINISTIC_MODEL_NAME,
  classifyDeterministically,
} from "./deterministic.ts";
import {
  classifyWithOllama,
  readOllamaConfig,
  type OllamaConfig,
  type ProviderFailure,
} from "./ollama.ts";

import type { AIAnalysisRequest, AIAnalysisResult } from "@/types/ai";

/**
 * ============================================================
 * CLASSIFICATION ORCHESTRATOR
 * ============================================================
 *
 * Decides what a complaint's classification is, given that the model
 * might not answer, might answer nonsense, or might not exist.
 *
 * THE RULE
 *
 * A complaint must always end up classified. Its priority sets an SLA
 * deadline and its department decides who is dispatched, so "the model was
 * down" cannot mean "this report sits unrouted" — that is the failure the
 * pipeline existed to prevent, and it is worse than a keyword guess.
 *
 * So: try the model, and fall back to the deterministic rule engine for
 * any reason at all. What differs between those reasons is only what gets
 * recorded, never whether the complaint proceeds.
 *
 * WHY LOW CONFIDENCE IS A FALLBACK AND NOT A REJECTION
 *
 * A model that says 0.2 has told us something useful: it does not know.
 * Storing a 0.2-confidence routing decision as though it were a judgement
 * is worse than using the rule engine, which at least fails in ways an
 * operator can predict. The threshold is configurable because it depends
 * on the model.
 *
 * WHAT IS RECORDED
 *
 * `model` is the provenance of the values, and it is never a guess:
 * whatever produced the classification names itself in complaints.ai_model,
 * so nobody has to wonder later whether a given priority came from a
 * model or from keyword matching.
 */

export type ClassificationSource = "model" | "deterministic";

export interface Classification {
  result: AIAnalysisResult;
  /** Which engine produced it — stored in complaints.ai_model. */
  model: string;
  source: ClassificationSource;
  /**
   * Why the model was not used, when it was not. Recorded for operators;
   * never shown to a citizen.
   */
  fallbackReason: FallbackReason | null;
  latencyMs: number | null;
}

export type FallbackReason = ProviderFailure | "low-confidence";

/** Below this, the model's own uncertainty is taken at its word. */
export const DEFAULT_MIN_CONFIDENCE = 0.35;

export function readMinConfidence(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = Number.parseFloat(env.AI_MIN_CONFIDENCE ?? "");

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_MIN_CONFIDENCE;
  }

  return parsed;
}

export interface ClassifyOptions {
  config?: OllamaConfig | null;
  minConfidence?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Classifies a complaint, preferring the model and always producing a
 * result.
 *
 * Injectable config and fetch so the decision logic can be tested against
 * each failure mode without a running Ollama.
 */
export async function classifyComplaint(
  request: AIAnalysisRequest,
  options: ClassifyOptions = {}
): Promise<Classification> {
  const config =
    options.config !== undefined ? options.config : readOllamaConfig();

  const minConfidence = options.minConfidence ?? readMinConfidence();

  const deterministic = (
    reason: FallbackReason | null,
    latencyMs: number | null = null
  ): Classification => ({
    result: classifyDeterministically(request),
    model: DETERMINISTIC_MODEL_NAME,
    source: "deterministic",
    fallbackReason: reason,
    latencyMs,
  });

  // No model configured. Not a failure — most deployments start this way.
  if (!config) {
    return deterministic("not-configured");
  }

  const outcome = await classifyWithOllama(
    request,
    config,
    options.fetchImpl ?? fetch
  );

  if (!outcome.ok) {
    return deterministic(outcome.failure);
  }

  if (outcome.result.confidence < minConfidence) {
    /*
     * The model answered and said it was unsure. Its result is discarded
     * rather than blended: mixing a low-confidence category with a
     * rule-engine department would produce a classification neither
     * engine would stand behind, and nothing downstream could interpret
     * the confidence it carried.
     */
    return deterministic("low-confidence", outcome.latencyMs);
  }

  return {
    result: outcome.result,
    model: outcome.model,
    source: "model",
    fallbackReason: null,
    latencyMs: outcome.latencyMs,
  };
}

/**
 * The one-line summary of a classification for a server log.
 *
 * Deliberately excludes the complaint text and the prompt: this is safe to
 * log where a citizen's report is not.
 */
export function describeClassification(
  classification: Classification,
  complaintId: string
): string {
  const parts = [
    `complaint=${complaintId}`,
    `source=${classification.source}`,
    `model=${classification.model}`,
    `category=${classification.result.category}`,
    `priority=${classification.result.priority}`,
    `confidence=${classification.result.confidence.toFixed(2)}`,
  ];

  if (classification.fallbackReason) {
    parts.push(`fallback=${classification.fallbackReason}`);
  }

  if (classification.latencyMs !== null) {
    parts.push(`latency=${classification.latencyMs}ms`);
  }

  return parts.join(" ");
}
