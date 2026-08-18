import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  boundsOf,
  coordinateProblem,
  formatCoordinates,
  isRenderableCoordinate,
  normalizePickedCoordinate,
  toCoordinates,
  wrapLongitude,
} from "./coordinates.ts";

/**
 * ============================================================
 * IS THIS A PLACE?
 * ============================================================
 *
 * This module replaced four different answers to that question, three of
 * which were wrong:
 *
 *   `lat !== null && lng !== null`     — passes NaN, passes 999
 *   `typeof lat === "number"`          — passes NaN (typeof NaN is "number")
 *   nothing at all                     — StaticLocationMap
 *   `complaint?.latitude ?? 0`         — invents Null Island
 *
 * The last one is why this matters more than tidiness. An unlocated work
 * order became a well-typed 0,0 that every downstream check accepted, and
 * fitBounds over a real city plus the Gulf of Guinea frames a hemisphere —
 * so one row without coordinates collapsed every genuine marker on the
 * authority map to a pixel.
 *
 * The database half is asserted in supabase/tests/07_coordinates_test.sql.
 */

describe("NaN is not a place", () => {
  test("NaN is rejected, which typeof could not do", () => {
    assert.equal(coordinateProblem(Number.NaN, 77.5), "not-finite");
    assert.equal(coordinateProblem(12.9, Number.NaN), "not-finite");
    assert.equal(isRenderableCoordinate(Number.NaN, Number.NaN), false);
  });

  test("Infinity is rejected", () => {
    assert.equal(
      coordinateProblem(Number.POSITIVE_INFINITY, 0.1),
      "not-finite"
    );
    assert.equal(
      coordinateProblem(0.1, Number.NEGATIVE_INFINITY),
      "not-finite"
    );
  });
});

describe("Null Island is not a place", () => {
  test("0,0 is rejected", () => {
    // A device with no fix, an empty string parsed, and a zeroed struct
    // all produce this. It is indistinguishable from a failed read.
    assert.equal(coordinateProblem(0, 0), "null-island");
  });

  test("zero on one axis alone is a real place", () => {
    // The equator and the prime meridian exist. Rejecting either would
    // refuse reports from Ghana and Indonesia.
    assert.equal(coordinateProblem(0, 77.5946), null);
    assert.equal(coordinateProblem(51.4778, 0), null);
  });
});

describe("missing is distinguishable from invalid", () => {
  test("null and undefined report `missing`, not `not-finite`", () => {
    /*
     * The distinction earns its keep in the UI: "we need the location"
     * and "those coordinates aren't valid" are different sentences with
     * different next steps.
     */
    assert.equal(coordinateProblem(null, null), "missing");
    assert.equal(coordinateProblem(undefined, undefined), "missing");
    assert.equal(coordinateProblem(12.9, null), "missing");
    assert.equal(coordinateProblem(null, 77.5), "missing");
  });
});

describe("range", () => {
  test("out-of-range values are rejected", () => {
    assert.equal(coordinateProblem(91, 0.1), "out-of-range");
    assert.equal(coordinateProblem(-91, 0.1), "out-of-range");
    assert.equal(coordinateProblem(0.1, 181), "out-of-range");
    assert.equal(coordinateProblem(0.1, -181), "out-of-range");
  });

  test("the exact bounds are inside the range", () => {
    // ±90 and ±180 are the poles and the antimeridian — real places, so
    // an off-by-one here would refuse valid coordinates.
    assert.equal(coordinateProblem(90, 180), null);
    assert.equal(coordinateProblem(-90, -180), null);
  });

  test("a plausible city coordinate passes", () => {
    assert.equal(coordinateProblem(12.9716, 77.5946), null);
  });
});

describe("toCoordinates narrows as well as filters", () => {
  test("a valid pair becomes an object", () => {
    assert.deepEqual(toCoordinates(12.9716, 77.5946), {
      latitude: 12.9716,
      longitude: 77.5946,
    });
  });

  test("every rejected case becomes null", () => {
    for (const [lat, lng] of [
      [null, null],
      [Number.NaN, 1],
      [999, 1],
      [0, 0],
    ] as [number | null, number | null][]) {
      assert.equal(toCoordinates(lat, lng), null);
    }
  });
});

describe("wrapLongitude handles the antimeridian", () => {
  test("in-range longitudes are unchanged", () => {
    assert.equal(wrapLongitude(77.5946), 77.5946);
    assert.equal(wrapLongitude(0), 0);
    assert.equal(wrapLongitude(-77.5), -77.5);
  });

  test("a wrapped result is close enough to be the same place", () => {
    // Wrapping genuinely out-of-range values does involve the modulo, so
    // the result carries float error. 1e-9 degrees is ~0.1 mm.
    assert.ok(Math.abs(wrapLongitude(437.5946) - 77.5946) < 1e-9);
  });

  test("a longitude one world east comes back", () => {
    /*
     * Leaflet reports the longitude of the world copy that was clicked,
     * so panning east across the date line and tapping a place at 77.5
     * gives 437.5. Wrapping is correct because it is the same location —
     * refusing it would tell the citizen their accurate pin is invalid.
     */
    assert.ok(Math.abs(wrapLongitude(437.5) - 77.5) < 1e-9);
    assert.ok(Math.abs(wrapLongitude(-282.5) - 77.5) < 1e-9);
  });

  test("multiple wraps still resolve", () => {
    assert.ok(Math.abs(wrapLongitude(77.5 + 360 * 3) - 77.5) < 1e-9);
    assert.ok(Math.abs(wrapLongitude(77.5 - 360 * 2) - 77.5) < 1e-9);
  });

  test("both antimeridian endpoints survive, as in Leaflet", () => {
    /*
     * +180 and -180 are the same meridian and both are valid, which is
     * what Leaflet's wrapNum does with includeMax. The shift-mod-shift
     * arithmetic on its own collapses both onto -180, so an in-range
     * short-circuit is what keeps them distinct.
     */
    assert.equal(wrapLongitude(180), 180);
    assert.equal(wrapLongitude(-180), -180);
  });

  test("an in-range longitude is returned bit-for-bit unchanged", () => {
    /*
     * The float-drift case. Running the modulo unconditionally turned
     * 77.5946 into 77.59460000000001, so every click and drag nudged the
     * citizen's coordinate for no reason. This runs on every pin move, so
     * exactness in the common path matters more than the brevity of doing
     * the arithmetic always.
     */
    for (const value of [0, 77.5946, -77.5946, 12.971598, 180, -180]) {
      assert.equal(wrapLongitude(value), value, `${value} was altered`);
    }
  });

  test("everything wrapped lands inside the range", () => {
    for (const value of [0, 77.5, 180, -180, 540, -540, 1e6, -1e6]) {
      const wrapped = wrapLongitude(value);

      assert.ok(
        wrapped >= -180 && wrapped <= 180,
        `${value} wrapped to ${wrapped}`
      );
    }
  });

  test("a non-finite longitude is returned as-is for the caller to reject", () => {
    assert.ok(Number.isNaN(wrapLongitude(Number.NaN)));
  });
});

describe("normalizePickedCoordinate is the map's entry point", () => {
  test("an antimeridian pick is corrected, not refused", () => {
    const picked = normalizePickedCoordinate(12.9716, 437.5946);

    assert.ok(picked !== null);
    assert.equal(picked.latitude, 12.9716);
    assert.ok(Math.abs(picked.longitude - 77.5946) < 1e-9);
  });

  test("a latitude outside ±90 is refused, not wrapped", () => {
    // Leaflet clamps latitude, so a value beyond ±90 is a bug rather than
    // a projection artefact — wrapping it would move the pin somewhere
    // the user did not click.
    assert.equal(normalizePickedCoordinate(120, 77.5), null);
  });

  test("a pick that wraps onto 0,0 is still refused", () => {
    // 360 wraps to 0. Combined with latitude 0 that is Null Island, and
    // arriving there by arithmetic makes it no more a real location.
    assert.equal(normalizePickedCoordinate(0, 360), null);
  });

  test("NaN from a broken event is refused", () => {
    assert.equal(normalizePickedCoordinate(Number.NaN, 77.5), null);
  });
});

describe("formatCoordinates", () => {
  test("always six decimal places", () => {
    // Six places ≈ 0.11 m and is what the double precision columns hold
    // without loss. Fixed width so two readouts can be compared.
    assert.equal(formatCoordinates(12.9716, 77.5946), "12.971600, 77.594600");
    assert.equal(formatCoordinates(0, 0), "0.000000, 0.000000");
  });

  test("latitude comes first, matching every other surface", () => {
    const formatted = formatCoordinates(12, 77);

    assert.ok(formatted.startsWith("12."), formatted);
  });
});

describe("boundsOf", () => {
  test("nothing to frame is null, not an empty box", () => {
    // fitBounds on a degenerate box throws, so the caller needs to be
    // able to tell before asking.
    assert.equal(boundsOf([]), null);
  });

  test("a single point is a degenerate but valid box", () => {
    assert.deepEqual(boundsOf([{ latitude: 12, longitude: 77 }]), {
      south: 12,
      west: 77,
      north: 12,
      east: 77,
    });
  });

  test("a spread of points is enclosed", () => {
    assert.deepEqual(
      boundsOf([
        { latitude: 12, longitude: 77 },
        { latitude: 13, longitude: 78 },
        { latitude: 12.5, longitude: 76 },
      ]),
      { south: 12, west: 76, north: 13, east: 78 }
    );
  });

  test("a stray 0,0 would span a hemisphere — which is why it is filtered first", () => {
    /*
     * The bug this whole module exists for, stated as an assertion. This
     * is what fitBounds received on the authority map, and the resulting
     * box is why every real marker became a pixel. boundsOf is honest
     * about it; the fix is that toCoordinates never lets 0,0 into the
     * list.
     */
    const withStray = boundsOf([
      { latitude: 12.97, longitude: 77.59 },
      { latitude: 0, longitude: 0 },
    ]);

    assert.ok(withStray !== null);
    assert.ok(
      withStray.north - withStray.south > 12,
      "a box this tall is the whole problem"
    );
  });
});
