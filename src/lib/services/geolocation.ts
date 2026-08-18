import {
  coordinateProblem,
  formatCoordinates,
  type Coordinates,
} from "@/lib/geo/coordinates";

/**
 * ============================================================
 * DEVICE LOCATION
 * ============================================================
 *
 * Four things were wrong with this module, and all four are about what
 * happens when the world does not cooperate.
 *
 *
 * 1. THE FIX WAS TRUSTED
 *
 *    `position.coords.latitude` went straight into the return value.
 *    A device that reports 0,0 for a failed read — which is what a
 *    failed read looks like — produced a "successful" detection, and the
 *    citizen got a submission rejected by the database at the end of the
 *    form instead of a retry prompt at the start.
 *
 *
 * 2. THE KIND OF FAILURE WAS THROWN AWAY
 *
 *    Every failure became `new Error(someString)`. Permission denied,
 *    timeout and position-unavailable need different responses — denial
 *    is permanent until the user changes a browser setting, so offering
 *    "try again" is useless and offering the map is the only way
 *    forward — but a caller with a string cannot tell them apart without
 *    matching on prose.
 *
 *
 * 3. THE REVERSE-GEOCODE CALL COULD HANG FOREVER
 *
 *    getCurrentPosition had a 15s timeout; the fetch to BigDataCloud had
 *    none. A third party that accepts the connection and never answers
 *    held detectDeviceLocation() open indefinitely, with the button
 *    spinning.
 *
 *
 * 4. EXACT COORDINATES WENT TO A THIRD PARTY, ALWAYS
 *
 *    See the privacy note on reverseGeocode(). Kept, because the product
 *    needs a readable address and this is the service already present —
 *    but truncated, timed out, and skippable.
 */

export interface DeviceLocation extends Coordinates {
  /** Metres, or null when the device did not report it. */
  accuracy: number | null;

  address: string;

  locality: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;

  /** False when the address is a coordinate readout rather than a place name. */
  isNamedPlace: boolean;
}

/**
 * Why a location could not be determined.
 *
 * A discriminated kind rather than a message, so a caller can decide
 * what to offer: `denied` means stop asking and show the map, `timeout`
 * means a retry is worth a try, `unsupported` means never ask again.
 */
export type GeolocationFailure =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "invalid-fix";

export class GeolocationError extends Error {
  readonly failure: GeolocationFailure;
  /** Whether trying again could plausibly succeed. */
  readonly retryable: boolean;

  constructor(failure: GeolocationFailure, message: string) {
    super(message);
    this.name = "GeolocationError";
    this.failure = failure;
    this.retryable = failure === "timeout" || failure === "unavailable";
  }
}

export function isGeolocationError(
  error: unknown
): error is GeolocationError {
  return error instanceof GeolocationError;
}

/*
 * Timeouts.
 *
 * 15s for the fix: a cold GPS start outdoors is commonly 5-10s, and much
 * beyond this the citizen has concluded it is broken anyway.
 *
 * 6s for the address: it is a nicety on top of a fix we already have, so
 * it must never be the reason a report cannot be filed.
 */
const POSITION_TIMEOUT_MS = 15_000;
const GEOCODE_TIMEOUT_MS = 6_000;

/**
 * A cached fix up to a minute old is acceptable.
 *
 * Was `maximumAge: 0`, which forces a fresh satellite fix on every
 * attempt — slow, battery-hungry, and the most likely thing to time out
 * indoors. A pothole does not move in sixty seconds.
 */
const POSITION_MAX_AGE_MS = 60_000;

/**
 * Beyond this the fix is too coarse to dispatch a crew from.
 *
 * Not a rejection: a 500 m fix still tells the citizen roughly where
 * they are, and the map lets them correct it. It is surfaced so the UI
 * can say "this looks approximate — check the pin" rather than presenting
 * a city-block-sized guess as a location.
 */
export const COARSE_ACCURACY_METRES = 100;

/** Whether a reported accuracy is too coarse to trust without correction. */
export function isCoarseFix(accuracy: number | null): boolean {
  return accuracy !== null && accuracy > COARSE_ACCURACY_METRES;
}

/**
 * The device's current position.
 *
 * Rejects with a GeolocationError in every failure case, including a fix
 * that arrives but is not a usable place.
 */
export function getCurrentDeviceCoordinates(): Promise<
  Coordinates & { accuracy: number | null }
> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(
        new GeolocationError(
          "unsupported",
          "This browser cannot detect your location. Place the pin on the map instead."
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        /*
         * The fix is validated before it is returned. A device can and
         * does report 0,0 when it has no signal, and passing that on made
         * a failure look like a success — the citizen filled in the whole
         * form and the database refused it at the end.
         */
        const problem = coordinateProblem(latitude, longitude);

        if (problem !== null) {
          reject(
            new GeolocationError(
              "invalid-fix",
              problem === "null-island"
                ? "Your device could not get a location fix. Place the pin on the map instead."
                : "Your device reported a location we can't use. Place the pin on the map instead."
            )
          );
          return;
        }

        resolve({
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new GeolocationError(
                "denied",
                "Location access is blocked. Allow it in your browser settings, or place the pin on the map."
              )
            );
            return;

          case error.POSITION_UNAVAILABLE:
            reject(
              new GeolocationError(
                "unavailable",
                "Your location is unavailable right now. Check that location services are on, or place the pin on the map."
              )
            );
            return;

          case error.TIMEOUT:
            reject(
              new GeolocationError(
                "timeout",
                "Finding your location took too long. Try again, or place the pin on the map."
              )
            );
            return;

          default:
            reject(
              new GeolocationError(
                "unavailable",
                "We couldn't determine your location. Place the pin on the map instead."
              )
            );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: POSITION_TIMEOUT_MS,
        maximumAge: POSITION_MAX_AGE_MS,
      }
    );
  });
}

/**
 * Whether the browser has already been granted or refused location.
 *
 * Lets a caller avoid prompting somebody who has permanently blocked it —
 * calling getCurrentPosition() on a denied origin produces no prompt and
 * an immediate error, so asking again just flashes a failure at them.
 *
 * The Permissions API is not universally implemented and Safari
 * historically was not; "unknown" means ask and find out, which is the
 * old behaviour.
 */
export async function getLocationPermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });

    return status.state;
  } catch {
    // Some browsers throw on an unsupported descriptor name.
    return "unknown";
  }
}

interface ReverseGeocodeResponse {
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  countryName?: string;
  postcode?: string;
}

/**
 * ============================================================
 * REVERSE GEOCODING — and its privacy cost
 * ============================================================
 *
 * Turns coordinates into a readable address using BigDataCloud's
 * keyless client endpoint, which is the service already present in this
 * codebase. No new provider is introduced.
 *
 * WHAT THIS DISCLOSES
 *
 * It sends a citizen's location to a third party who is not the
 * municipality. That is a real cost and it buys something real: an
 * address is what an officer navigates by and what the citizen
 * recognises on their own report, and "12.971600, 77.594600" is neither.
 *
 * Three things reduce the cost to what the feature needs:
 *
 *   * COARSENED. Coordinates are rounded to 4 decimal places (~11 m)
 *     before they leave the browser. That is ample to name a
 *     neighbourhood and is deliberately not enough to identify a doorway.
 *     Full precision is kept locally and stored on the complaint.
 *
 *   * OPTIONAL. A failure is not an error — the caller keeps the
 *     coordinates and the report proceeds with a coordinate readout as
 *     its address. Nothing here can block a submission.
 *
 *   * BOUNDED. One request per detection, with a 6s deadline and an
 *     AbortController so an unanswered request is dropped rather than
 *     left holding the flow open. There is no retry loop, so a single
 *     citizen action cannot become repeated calls on somebody else's
 *     free tier.
 *
 * No API key is involved, so nothing is attributed to an account, and no
 * identifier of ours is sent.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch
): Promise<{
  address: string;
  locality: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
} | null> {
  if (coordinateProblem(latitude, longitude) !== null) return null;

  /*
   * ~11 m. Enough to resolve a locality, not enough to resolve a
   * household. The precise fix never leaves the device.
   */
  const coarseLatitude = latitude.toFixed(4);
  const coarseLongitude = longitude.toFixed(4);

  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${encodeURIComponent(coarseLatitude)}` +
    `&longitude=${encodeURIComponent(coarseLongitude)}` +
    `&localityLanguage=en`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
      /*
       * No Referer, so the provider is not told which page of which
       * deployment asked. Costs nothing and discloses less.
       */
      referrerPolicy: "no-referrer",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as ReverseGeocodeResponse;

    const locality = data.locality || null;
    const city = data.city || null;
    const state = data.principalSubdivision || null;
    const country = data.countryName || null;
    const postcode = data.postcode || null;

    /*
     * "Banjara Hills, Hyderabad, Telangana, 500034, India".
     *
     * Deduplicated because the provider frequently returns the same name
     * as both locality and city, and "Hyderabad, Hyderabad" reads as a
     * bug to the person looking at their own report.
     */
    const parts = [locality, city, state, postcode, country].filter(
      (value, index, array): value is string =>
        Boolean(value) && array.indexOf(value) === index
    );

    if (parts.length === 0) return null;

    return {
      address: parts.join(", "),
      locality,
      city,
      state,
      country,
      postcode,
    };
  } catch {
    /*
     * Aborted, offline, blocked by an extension, CORS — all the same
     * outcome. Returning null rather than throwing is the point: an
     * address is a nicety on top of a fix we already have.
     */
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * A position with an address where one could be found.
 *
 * Never rejects because of the address — only because of the fix. A
 * failed geocode yields a coordinate readout and `isNamedPlace: false`,
 * so the UI can prompt for a landmark instead of presenting a pair of
 * numbers as if it were a street.
 */
export async function detectDeviceLocation(): Promise<DeviceLocation> {
  const fix = await getCurrentDeviceCoordinates();

  const named = await reverseGeocode(fix.latitude, fix.longitude);

  if (named) {
    return {
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      isNamedPlace: true,
      ...named,
    };
  }

  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    address: formatCoordinates(fix.latitude, fix.longitude),
    isNamedPlace: false,
    locality: null,
    city: null,
    state: null,
    country: null,
    postcode: null,
  };
}
