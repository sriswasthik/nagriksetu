export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;

  address: string;

  locality: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
}

interface ReverseGeocodeResponse {
  latitude?: number;
  longitude?: number;

  locality?: string;
  localityInfo?: {
    administrative?: Array<{
      name?: string;
      order?: number;
    }>;
  };

  city?: string;
  principalSubdivision?: string;
  countryName?: string;
  postcode?: string;

  countryCode?: string;
}

/**
 * Get the device's current GPS coordinates.
 */
export function getCurrentDeviceCoordinates(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number | null;
}> {
  return new Promise((resolve, reject) => {
    if (
      typeof window === "undefined" ||
      !("geolocation" in navigator)
    ) {
      reject(
        new Error(
          "Geolocation is not supported by this device/browser."
        )
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:
            Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null,
        });
      },
      (error) => {
        let message =
          "Unable to determine your location.";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            message =
              "Location permission was denied. Please allow location access and try again.";
            break;

          case error.POSITION_UNAVAILABLE:
            message =
              "Your current location is unavailable. Please check GPS/location services.";
            break;

          case error.TIMEOUT:
            message =
              "Location detection timed out. Please try again.";
            break;
        }

        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Convert latitude/longitude into a human-readable location.
 *
 * BigDataCloud provides a free client-side reverse-geocoding
 * endpoint that does not require an API key.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{
  address: string;
  locality: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
}> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&localityLanguage=en`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      "Unable to determine the location name."
    );
  }

  const data =
    (await response.json()) as ReverseGeocodeResponse;

  const locality =
    data.locality ||
    null;

  const city =
    data.city ||
    null;

  const state =
    data.principalSubdivision ||
    null;

  const country =
    data.countryName ||
    null;

  const postcode =
    data.postcode ||
    null;

  /*
   * Build a clean human-readable address.
   *
   * Example:
   *
   * Banjara Hills, Hyderabad, Telangana, 500034, India
   */

  const parts = [
    locality,
    city,
    state,
    postcode,
    country,
  ].filter(
    (value, index, array) =>
      value &&
      array.indexOf(value) === index
  );

  const address =
    parts.length > 0
      ? parts.join(", ")
      : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  return {
    address,
    locality,
    city,
    state,
    country,
    postcode,
  };
}

/**
 * Complete location detection:
 *
 * Device GPS
 *      ↓
 * Reverse geocoding
 *      ↓
 * Human-readable address
 */
export async function detectDeviceLocation(): Promise<DeviceLocation> {
  const coordinates =
    await getCurrentDeviceCoordinates();

  let reverseLocation;

  try {
    reverseLocation =
      await reverseGeocode(
        coordinates.latitude,
        coordinates.longitude
      );
  } catch {
    /*
     * GPS is still valid even if reverse geocoding fails.
     *
     * Keep the coordinates so the complaint can still
     * be submitted.
     */
    reverseLocation = {
      address:
        `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`,

      locality: null,
      city: null,
      state: null,
      country: null,
      postcode: null,
    };
  }

  return {
    latitude:
      coordinates.latitude,

    longitude:
      coordinates.longitude,

    accuracy:
      coordinates.accuracy,

    address:
      reverseLocation.address,

    locality:
      reverseLocation.locality,

    city:
      reverseLocation.city,

    state:
      reverseLocation.state,

    country:
      reverseLocation.country,

    postcode:
      reverseLocation.postcode,
  };
}