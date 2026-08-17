/**
 * ============================================================
 * ANALYTICS DISPLAY HELPERS
 * ============================================================
 *
 * The single place a null metric becomes text, so "not measured" cannot
 * be rendered as zero by one screen and as a dash by another.
 *
 * These encode a distinction about the data rather than about
 * presentation: a missing figure and a figure of zero mean different
 * things, and every authority screen has to say so the same way. A ward
 * with no complaints has no SLA compliance; printing "0%" there is a
 * claim the data does not support, and printing "100%" — which the
 * database used to do — is worse.
 *
 * Kept free of the Supabase client so they can be unit-tested; the
 * analytics service re-exports them, so callers see one surface.
 */

/** What a screen shows where nothing was measured. */
export const NO_DATA = "No data";

export function formatPercent(
  value: number | null,
  fallback: string = NO_DATA
): string {
  return value === null ? fallback : `${value}%`;
}

export function formatHours(
  value: number | null,
  fallback: string = NO_DATA
): string {
  return value === null ? fallback : `${value}h`;
}

/** Locale-grouped count. Counts are never null, so there is no fallback. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

/**
 * "across 12 resolved reports" — the sample a figure was measured from.
 *
 * A phrase rather than a number, so a caller cannot print the sample size
 * somewhere it reads as the metric itself. Empty when there is nothing to
 * qualify, so it can be concatenated unconditionally.
 */
export function describeSample(sampleSize: number, noun = "report"): string {
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return "";

  return `across ${formatCount(sampleSize)} ${noun}${
    sampleSize === 1 ? "" : "s"
  }`;
}

/**
 * A percentage of a total, or null when there is no total to take it of.
 *
 * Exists because `(part / total) * 100` is NaN when total is 0, and the
 * authority dashboard printed exactly that — "NaN% of all reports" — on
 * any deployment that had not yet received a complaint.
 */
export function shareOf(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return Math.round((part / total) * 1000) / 10;
}
