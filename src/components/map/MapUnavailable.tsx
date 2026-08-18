"use client";

import { MapPinOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCoordinates } from "@/lib/geo/coordinates";

/**
 * ============================================================
 * WHEN THERE IS NO MAP TO SHOW
 * ============================================================
 *
 * Two distinct cases, both of which used to render as a map anyway:
 *
 *   NO COORDINATES. `mapWorkOrder()` coalesced a missing latitude to 0,
 *   so an unlocated report was drawn as a marker in the Gulf of Guinea.
 *   The reader was shown a confident pin in the wrong hemisphere rather
 *   than being told the location was never recorded.
 *
 *   NO TILES. Nothing listened for `tileerror`, so an offline device or a
 *   blocked tile host produced markers floating in flat grey. A pin in a
 *   void is indistinguishable from a wrong pin.
 *
 * In both cases the useful thing is a sentence, plus the coordinates if
 * there are any — an officer can paste those into a navigation app, which
 * is more than a broken map offers.
 */

interface MapUnavailableProps {
  reason: "no-coordinates" | "tiles-failed";
  /** Shown when known, so the location is still usable without imagery. */
  latitude?: number | null;
  longitude?: number | null;
  className?: string;
}

export function MapUnavailable({
  reason,
  latitude,
  longitude,
  className,
}: MapUnavailableProps) {
  const hasCoordinates =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  return (
    <div
      role="status"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center",
        className
      )}
    >
      <MapPinOff
        className="h-6 w-6 text-muted-foreground opacity-60"
        aria-hidden="true"
      />

      <p className="text-sm font-medium text-foreground">
        {reason === "no-coordinates"
          ? "No location recorded"
          : "Map imagery unavailable"}
      </p>

      <p className="max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
        {reason === "no-coordinates"
          ? "This report has no coordinates, so it cannot be placed on a map."
          : "The map tiles could not be loaded. The location itself is unaffected."}
      </p>

      {/*
        The coordinates are the part that still works. Selectable on
        purpose: pasting them into a navigation app is how an officer gets
        to the site when the imagery will not load.
      */}
      {reason === "tiles-failed" && hasCoordinates && (
        <p className="tabular select-all rounded border bg-card px-2 py-1 text-xs text-foreground">
          {formatCoordinates(latitude as number, longitude as number)}
        </p>
      )}
    </div>
  );
}
