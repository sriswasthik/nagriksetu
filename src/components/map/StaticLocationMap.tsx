"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { toCoordinates } from "@/lib/geo/coordinates";
import type { ComplaintStatus } from "@/types/complaint";

const StaticLocationMapInner = dynamic(
  () => import("@/components/map/StaticLocationMapInner"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  }
);

interface StaticLocationMapProps {
  /** Nullable on purpose: a complaint may have no recorded location. */
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  status?: ComplaintStatus;
}

/**
 * Read-only single-point map, for showing where a report is.
 *
 * Interaction is disabled so it behaves as a figure rather than a
 * control — and so it never traps scroll on touch devices.
 *
 * VALIDATION IS THE WRAPPER'S JOB
 *
 * This component took `latitude: number` and passed it straight to
 * Leaflet. Its two callers both hand it values that can be absent: the
 * citizen detail page reads them off a complaint, and the officer page
 * reads them off `mapWorkOrder()`, which coalesced a missing latitude
 * to 0. So an unlocated report was drawn as a confident pin at 0,0 —
 * Null Island, in the Gulf of Guinea — rather than being reported as
 * having no location.
 *
 * Checking here rather than inside means the invalid case never reaches
 * Leaflet, and the inner component can take plain numbers because by then
 * they are guaranteed to be a place.
 */
export function StaticLocationMap({
  latitude,
  longitude,
  status,
}: StaticLocationMapProps) {
  const point = toCoordinates(latitude, longitude);

  if (!point) {
    return <MapUnavailable reason="no-coordinates" />;
  }

  return (
    <StaticLocationMapInner
      latitude={point.latitude}
      longitude={point.longitude}
      status={status}
    />
  );
}
