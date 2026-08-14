"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { ComplaintStatus } from "@/types/complaint";

const StaticLocationMapInner = dynamic(
  () => import("@/components/map/StaticLocationMapInner"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  }
);

interface StaticLocationMapProps {
  latitude: number;
  longitude: number;
  status?: ComplaintStatus;
}

/**
 * Read-only single-point map, for showing where a report is.
 *
 * Interaction is disabled so it behaves as a figure rather than a
 * control — and so it never traps scroll on touch devices.
 */
export function StaticLocationMap(props: StaticLocationMapProps) {
  return <StaticLocationMapInner {...props} />;
}
