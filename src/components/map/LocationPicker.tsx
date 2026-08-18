"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  detectDeviceLocation,
  getLocationPermissionState,
  isCoarseFix,
  isGeolocationError,
  reverseGeocode,
} from "@/lib/services/geolocation";
import {
  formatCoordinates,
  normalizePickedCoordinate,
} from "@/lib/geo/coordinates";

/**
 * Leaflet reads `window` on import, so the map must never be part of
 * the server bundle — and keeping it dynamic also keeps ~150KB of
 * mapping code out of the initial page load.
 */
const LocationPickerMap = dynamic(
  () => import("@/components/map/LocationPickerMap"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  }
);

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  address: string;
  onLocationChange: (value: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => void;
  onAddressChange: (address: string) => void;
  disabled?: boolean;
  /** Validation message from the parent form. */
  error?: string;
}

/**
 * Combined location control: GPS capture, an editable address, and a
 * draggable map pin. All three stay in sync — capturing GPS fills the
 * address via reverse geocoding, and dragging the pin re-resolves it.
 */
export function LocationPicker({
  latitude,
  longitude,
  address,
  onLocationChange,
  onAddressChange,
  disabled,
  error,
}: LocationPickerProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  /*
   * Whether a retry could plausibly work. A denied permission cannot be
   * fixed by pressing the button again — the browser will not prompt a
   * second time — so offering a retry there just flashes the same failure
   * back. The map is the way forward instead.
   */
  const [canRetry, setCanRetry] = useState(true);
  /** Metres, when the device reported an accuracy worth warning about. */
  const [coarseAccuracy, setCoarseAccuracy] = useState<number | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  /*
   * Sequence number for reverse-geocode lookups.
   *
   * Each pin move fires a lookup and applies the result. Two quick drags
   * meant two in-flight requests, and if the first resolved second it
   * re-applied its own (older) coordinates — silently moving the pin back
   * and submitting the wrong location. Only the newest lookup may write.
   */
  const lookupSequence = useRef(0);

  const hasPosition = latitude !== null && longitude !== null;

  /*
   * Ask the Permissions API once, so somebody who has permanently blocked
   * location is told to use the map rather than being offered a button
   * that produces no prompt and an instant error. Unsupported browsers
   * report "unknown", which leaves the button as it was.
   */
  useEffect(() => {
    let cancelled = false;

    getLocationPermissionState().then((state) => {
      if (!cancelled && state === "denied") setPermissionBlocked(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function captureLocation() {
    setIsLocating(true);
    setLocationError(null);
    setCoarseAccuracy(null);

    // Supersedes any pin lookup still in flight, so its address cannot
    // land on top of the GPS fix.
    lookupSequence.current += 1;

    try {
      const location = await detectDeviceLocation();

      onLocationChange({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });

      /*
       * A coarse fix is not a failure — it is a location the citizen
       * should check. Presenting a 500 m guess as "Location captured"
       * with no qualification is how a crew gets sent to the wrong
       * street.
       */
      if (isCoarseFix(location.accuracy)) {
        setCoarseAccuracy(Math.round(location.accuracy as number));
      }
    } catch (err) {
      /*
       * The typed failure decides what to offer. `denied` is permanent
       * until a browser setting changes, so the retry is withdrawn and
       * the map becomes the path; `timeout` and `unavailable` are worth
       * another go.
       */
      if (isGeolocationError(err)) {
        setLocationError(err.message);
        setCanRetry(err.retryable);
        if (err.failure === "denied") setPermissionBlocked(true);
      } else {
        setLocationError(
          "We couldn't get your location. Place the pin on the map instead."
        );
        setCanRetry(true);
      }
    } finally {
      setIsLocating(false);
    }
  }

  /** Pin moved — re-resolve the address, but keep the coordinates authoritative. */
  async function handlePinMove(lat: number, lng: number) {
    /*
     * Normalised at the source. Leaflet reports the longitude of the world
     * copy that was clicked, so panning across the antimeridian and
     * tapping yields values beyond ±180 — the same physical place, which
     * the database would nonetheless refuse at the end of the form.
     * Wrapping here means the pin the citizen placed is the pin that gets
     * stored.
     */
    const picked = normalizePickedCoordinate(lat, lng);

    if (!picked) {
      setLocationError(
        "That spot isn't a valid location. Try tapping the map again."
      );
      return;
    }

    // A deliberate placement is the citizen's own judgement, so it
    // clears both the failure and the accuracy warning.
    setLocationError(null);
    setCoarseAccuracy(null);

    // Applied immediately: the pin is where the user put it, whatever
    // the address lookup goes on to say.
    onLocationChange(picked);

    lookupSequence.current += 1;
    const sequence = lookupSequence.current;

    const resolved = await reverseGeocode(picked.latitude, picked.longitude);

    // A newer move has happened; this result is stale.
    if (sequence !== lookupSequence.current) return;

    // Null when the lookup failed or was aborted. Coordinates are what
    // matter, and the citizen can still type an address, so there is
    // nothing to surface.
    if (resolved) {
      onLocationChange({ ...picked, address: resolved.address });
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------- Primary action ---------- */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {/*
          Withdrawn once location is blocked, or once a failure that a
          retry cannot fix has happened. A button whose only outcome is
          the same error is worse than no button — it reads as the only
          way to proceed when the map is right there.
        */}
        {!permissionBlocked && canRetry && (
          <Button
            type="button"
            onClick={captureLocation}
            disabled={disabled || isLocating}
            className="w-full sm:w-auto"
          >
            {isLocating ? (
              <>
                <Loader2
                  className="mr-1 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Finding you…
              </>
            ) : (
              <>
                <LocateFixed className="mr-1 h-4 w-4" aria-hidden="true" />
                {hasPosition ? "Update my location" : "Use my current location"}
              </>
            )}
          </Button>
        )}
      </div>

      {/* ---------- Status ---------- */}
      {hasPosition ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Navigation className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">
              Location captured
            </p>
            <p className="tabular mt-0.5 text-xs text-emerald-800/80">
              {/* Six decimals ≈ 0.11 m, and exactly what the database
                  stores — so the readout and the stored value agree. */}
              {formatCoordinates(latitude, longitude)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3.5">
          <MapPin
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            We need the location to route your report to the right team.
          </p>
        </div>
      )}

      {locationError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {locationError}
        </p>
      )}

      {/*
        A location the citizen should check rather than a failure. The
        device said so; presenting a city-block-sized guess as a captured
        location without saying so is how a crew is sent to the wrong
        street.
      */}
      {coarseAccuracy !== null && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            This fix is only accurate to about {coarseAccuracy} m. Check the
            pin below and drag it if it is not on the right spot.
          </span>
        </p>
      )}

      {/* Said once, where the button used to be, so the way forward is
          clear rather than absent. */}
      {permissionBlocked && !locationError && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Location access is blocked in your browser, so tap the map below
          to place the pin instead.
        </p>
      )}

      {/* ---------- Map ---------- */}
      <div
        className={cn(
          "h-64 overflow-hidden rounded-lg border sm:h-72",
          !hasPosition && "opacity-70"
        )}
      >
        <LocationPickerMap
          latitude={latitude}
          longitude={longitude}
          onChange={handlePinMove}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {hasPosition
          ? "Not quite right? Drag the pin or tap the map to adjust it."
          : "Tap the map to place the pin where the issue is."}
      </p>

      {/* ---------- Address ---------- */}
      <div>
        <label
          htmlFor="report-address"
          className="mb-2 block text-sm font-medium text-foreground"
        >
          Address or landmark
        </label>
        <Input
          id="report-address"
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
          placeholder="e.g. Near the bus stop on 5th Main Road"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "report-address-error" : undefined}
          className="h-11"
        />
        {error ? (
          <p
            id="report-address-error"
            role="alert"
            className="mt-2 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Add a nearby landmark if the address is hard to find.
          </p>
        )}
      </div>
    </div>
  );
}
