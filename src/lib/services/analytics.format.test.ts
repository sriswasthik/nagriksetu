import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  NO_DATA,
  describeSample,
  formatCount,
  formatHours,
  formatPercent,
  shareOf,
} from "./analytics.format.ts";

/**
 * ============================================================
 * NULL IS NOT ZERO
 * ============================================================
 *
 * The one property worth testing here: a metric that was never measured
 * must never render as a number.
 *
 * That is not a formatting preference. The database used to coalesce
 * missing figures away — a ward with no complaints reported 100% SLA
 * compliance and a health score of `good`, a department with none
 * reported 0%, which renders as a full red bar. Both were invented, and a
 * municipality reads them and believes them.
 *
 * The SQL side is asserted in supabase/tests/05_analytics_test.sql. These
 * are the last layer: the point where a null that survived the query
 * could still be turned back into a number by a template.
 */

describe("a missing figure never renders as a number", () => {
  test("formatPercent(null) says so, and says nothing numeric", () => {
    assert.equal(formatPercent(null), NO_DATA);
    assert.doesNotMatch(formatPercent(null), /\d/);
  });

  test("formatHours(null) says so, and says nothing numeric", () => {
    assert.equal(formatHours(null), NO_DATA);
    assert.doesNotMatch(formatHours(null), /\d/);
  });

  test("zero is a measurement and renders as one", () => {
    // The distinction the whole file exists for: 0% compliance is a real,
    // bad result. "No data" is the absence of a result. They must not
    // look the same.
    assert.equal(formatPercent(0), "0%");
    assert.equal(formatHours(0), "0h");
    assert.notEqual(formatPercent(0), formatPercent(null));
  });

  test("a caller can choose a terser fallback for a table cell", () => {
    assert.equal(formatPercent(null, "—"), "—");
    assert.equal(formatHours(null, "—"), "—");
  });

  test("a real figure is unaffected by the fallback", () => {
    assert.equal(formatPercent(87.5, "—"), "87.5%");
    assert.equal(formatHours(18.2, "—"), "18.2h");
  });
});

describe("shareOf refuses to divide by nothing", () => {
  test("a zero total yields null, not NaN", () => {
    /*
     * The authority dashboard computed `(breached / total) * 100` in its
     * render path and printed "NaN% of all reports" on any deployment
     * that had not yet received a complaint.
     */
    assert.equal(shareOf(0, 0), null);
    assert.equal(shareOf(5, 0), null);
  });

  test("a negative total is not a total", () => {
    assert.equal(shareOf(1, -10), null);
  });

  test("NaN and Infinity in either position yield null", () => {
    assert.equal(shareOf(Number.NaN, 10), null);
    assert.equal(shareOf(1, Number.NaN), null);
    assert.equal(shareOf(Number.POSITIVE_INFINITY, 10), null);
    assert.equal(shareOf(1, Number.POSITIVE_INFINITY), null);
  });

  test("a real share is rounded to one decimal", () => {
    assert.equal(shareOf(1, 3), 33.3);
    assert.equal(shareOf(2, 3), 66.7);
    assert.equal(shareOf(1, 8), 12.5);
  });

  test("the whole is 100, and a part is never above it", () => {
    assert.equal(shareOf(7, 7), 100);
    assert.equal(shareOf(0, 7), 0);
  });

  test("shares of exhaustive buckets sum to 100", () => {
    // The property the SLA bar depends on: the buckets partition every
    // complaint, so their shares fill the bar. The previous three buckets
    // left out anything resolved late, and the bar came up short.
    const buckets = [4, 3, 2, 1];
    const total = buckets.reduce((a, b) => a + b, 0);

    const summed = buckets
      .map((b) => shareOf(b, total) ?? 0)
      .reduce((a, b) => a + b, 0);

    assert.ok(
      Math.abs(summed - 100) < 0.5,
      `expected the shares to fill the bar, got ${summed}`
    );
  });
});

describe("describeSample qualifies a figure without becoming one", () => {
  test("no sample produces nothing to append", () => {
    assert.equal(describeSample(0), "");
    assert.equal(describeSample(-1), "");
  });

  test("one report is singular", () => {
    assert.equal(describeSample(1), "across 1 report");
  });

  test("many reports are plural and grouped", () => {
    assert.equal(describeSample(12), "across 12 reports");
    assert.equal(describeSample(1500), "across 1,500 reports");
  });

  test("the noun is the caller's, and still pluralises", () => {
    assert.equal(
      describeSample(3, "resolved report"),
      "across 3 resolved reports"
    );
    assert.equal(
      describeSample(1, "resolved report"),
      "across 1 resolved report"
    );
  });

  test("a non-finite sample produces nothing rather than 'across NaN'", () => {
    assert.equal(describeSample(Number.NaN), "");
    assert.equal(describeSample(Number.POSITIVE_INFINITY), "");
  });
});

describe("formatCount", () => {
  test("groups for readability at city scale", () => {
    // en-IN grouping: a municipal figure is read by people who write it
    // this way.
    assert.equal(formatCount(0), "0");
    assert.equal(formatCount(1234), "1,234");
    assert.equal(formatCount(1234567), "12,34,567");
  });
});
