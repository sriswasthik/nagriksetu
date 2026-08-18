/**
 * ============================================================
 * COORDINATE VALIDATION
 * ============================================================
 *
 * One definition of "is this a place", used by every map and every
 * write path.
 *
 * It existed in exactly one place — `coordinateProblem()` inside the
 * report page — and was correct there. Everywhere else did something
 * weaker:
 *
 *   IssuesMapInner        `lat !== null && lng !== null`
 *   WorkOrderMapInner     `typeof lat === "number"`   (NaN passes)
 *   StaticLocationMap     nothing at all
 *   mapWorkOrder()        `complaint?.latitude ?? 0`  (invents 0,0)
 *
 * The last two are the damaging ones. A work order with no recorded
 * coordinates became a marker at 0,0, and `fitBounds` over a real city
 * plus Null Island frames the whole hemisphere — so one unlocated row
 * zooms the map out until every real marker is a pixel. The government
 * hotspot map and the officer map both did this.
 *
 * WHY 0,0 IS NOT A PLACE
 *
 * Null Island is in the Gulf of Guinea. Nobody reports a pothole there,
 * and a failed GPS read is indistinguishable from it: a device that
 * cannot get a fix, a parse of an empty string, and a default-initialised
 * struct all produce 0,0. `submit_complaint()` rejects it and
 * `analytics_hotspots()` excludes it; this is the client-side half of the
 * same rule.
 *
 * WHY RANGE MATTERS ON READ, NOT ONLY ON WRITE
 *
 * Leaflet hands back longitudes beyond ±180 once the map has been panned
 * across the antimeridian — clicking a wrapped copy of the world gives
 * 190 or -400. Those are the same physical place, so they are wrapped
 * rather than rejected: telling somebody their pin is invalid when they
 * put it exactly where they meant is worse than doing the arithmetic.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Why a coordinate pair cannot be used. */
export type CoordinateProblem =
  | "missing"
  | "not-finite"
  | "out-of-range"
  | "null-island";

export const MAX_LATITUDE = 90;
export const MAX_LONGITUDE = 180;

/**
 * The reason a pair is unusable, or null when it is fine.
 *
 * Returns a reason rather than a boolean so a caller can say something
 * specific: "place the pin again" and "we could not read your location"
 * are different problems with different next steps.
 */
export function coordinateProblem(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): CoordinateProblem | null {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return "missing";
  }

  // Catches NaN and ±Infinity. `typeof NaN === "number"` is why the
  // typeof check this replaces let bad values through.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "not-finite";
  }

  if (
    latitude < -MAX_LATITUDE ||
    latitude > MAX_LATITUDE ||
    longitude < -MAX_LONGITUDE ||
    longitude > MAX_LONGITUDE
  ) {
    return "out-of-range";
  }

  if (latitude === 0 && longitude === 0) {
    return "null-island";
  }

  return null;
}

/** Whether a pair names somewhere a report could actually be. */
export function isRenderableCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  return coordinateProblem(latitude, longitude) === null;
}

/**
 * A pair narrowed to `Coordinates`, or null.
 *
 * The form maps and lists use for filtering, so an unlocated row is
 * dropped by the type system rather than by a `as number` cast at each
 * use site — which is what the previous code did, and what allowed the
 * values it had already failed to check through.
 */
export function toCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Coordinates | null {
  return isRenderableCoordinate(latitude, longitude)
    ? { latitude: latitude as number, longitude: longitude as number }
    : null;
}

/**
 * Brings a longitude back inside ±180.
 *
 * Leaflet reports the longitude of the world copy that was clicked, so
 * panning east twice and clicking gives ~+540 for a place at ~-180.
 * Wrapping is the right response because it is the same location — the
 * alternative is refusing a pin the citizen placed accurately.
 *
 * Latitude is not wrapped: Leaflet clamps it, and a latitude outside ±90
 * is a bug rather than a projection artefact, so it stays a rejection.
 */
export function wrapLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) return longitude;

  /*
   * Already in range: returned untouched.
   *
   * Not an optimisation. The shift-mod-shift below is not exact in binary
   * floating point — 77.5946 comes back as 77.59460000000001 — so running
   * it unconditionally perturbed the last digits of every pin the citizen
   * placed, whether or not anything needed wrapping. Since this runs on
   * every click and drag, that is a coordinate quietly drifting for no
   * reason.
   *
   * It also settles the endpoints. Both ±180 are the antimeridian and
   * both are valid, which is what Leaflet's own wrapNum does with
   * includeMax: 180 stays 180, -180 stays -180. The arithmetic alone
   * collapsed both onto -180.
   */
  if (longitude >= -MAX_LONGITUDE && longitude <= MAX_LONGITUDE) {
    return longitude;
  }

  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * A pin position as the user meant it, or null if unusable.
 *
 * Applied where coordinates *enter* from a map interaction — a click, a
 * marker drag — so an antimeridian artefact is corrected at the source
 * instead of being stored and then rejected by the database after the
 * citizen has filled in the rest of the form.
 */
export function normalizePickedCoordinate(
  latitude: number,
  longitude: number
): Coordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const wrappedLongitude = wrapLongitude(longitude);

  return toCoordinates(latitude, wrappedLongitude);
}

/**
 * How coordinates are shown to a person.
 *
 * Six decimal places ≈ 0.11 m, which is finer than any consumer GPS and
 * is what the database's `double precision` columns hold without loss.
 * Fixed rather than trimmed, so two readouts of the same place are the
 * same length and can be compared down a column.
 */
export function formatCoordinates(
  latitude: number,
  longitude: number
): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/**
 * A bounding box around a set of points, or null.
 *
 * Exists so a caller can tell "nothing to frame" from "one point" before
 * asking Leaflet to fit bounds — `fitBounds` on an empty or degenerate
 * box throws, and on a box spanning a real city plus a stray 0,0 it
 * frames a hemisphere.
 */
export function boundsOf(points: Coordinates[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} | null {
  if (points.length === 0) return null;

  let south = points[0].latitude;
  let north = points[0].latitude;
  let west = points[0].longitude;
  let east = points[0].longitude;

  for (const point of points) {
    if (point.latitude < south) south = point.latitude;
    if (point.latitude > north) north = point.latitude;
    if (point.longitude < west) west = point.longitude;
    if (point.longitude > east) east = point.longitude;
  }

  return { south, west, north, east };
}
