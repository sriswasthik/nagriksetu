"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2, LocateFixed, MapPin, Navigation } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { detectDeviceLocation, reverseGeocode } from "@/lib/services/geolocation";

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

  const hasPosition = latitude !== null && longitude !== null;

  async function captureLocation() {
    setIsLocating(true);
    setLocationError(null);

    try {
      const location = await detectDeviceLocation();

      onLocationChange({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    } catch (err) {
      setLocationError(
        err instanceof Error
          ? err.message
          : "We couldn't get your location. You can enter the address instead."
      );
    } finally {
      setIsLocating(false);
    }
  }

  /** Pin moved — re-resolve the address, but keep the coordinates authoritative. */
  async function handlePinMove(lat: number, lng: number) {
    onLocationChange({ latitude: lat, longitude: lng });

    try {
      const resolved = await reverseGeocode(lat, lng);
      onLocationChange({ latitude: lat, longitude: lng, address: resolved.address });
    } catch {
      // Coordinates are what matter; a failed lookup is not an error
      // worth surfacing, the user can still type an address.
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------- Primary action ---------- */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button
          type="button"
          onClick={captureLocation}
          disabled={disabled || isLocating}
          className="w-full sm:w-auto"
        >
          {isLocating ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              Finding you…
            </>
          ) : (
            <>
              <LocateFixed className="mr-1 h-4 w-4" aria-hidden="true" />
              {hasPosition ? "Update my location" : "Use my current location"}
            </>
          )}
        </Button>
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
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
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

      {hasPosition && (
        <p className="text-xs text-muted-foreground">
          Not quite right? Drag the pin or tap the map to adjust it.
        </p>
      )}

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
