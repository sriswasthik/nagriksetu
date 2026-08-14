"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_META, TONE_CLASSES } from "@/lib/design/status";
import type { ComplaintStatus } from "@/types/complaint";
import type { Complaint } from "@/types/complaint";

const IssuesMapInner = dynamic(() => import("@/components/map/IssuesMapInner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface IssuesMapProps {
  complaints: Complaint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function IssuesMap(props: IssuesMapProps) {
  return <IssuesMapInner {...props} />;
}

/**
 * Map legend. Groups the eleven statuses into the four states a
 * reader actually needs to distinguish on a map, using the same tone
 * colours as the markers.
 */
const LEGEND: { label: string; status: ComplaintStatus }[] = [
  { label: "Reported", status: "submitted" },
  { label: "Assigned", status: "assigned" },
  { label: "In progress", status: "in_progress" },
  { label: "Resolved", status: "resolved" },
];

export function MapLegend({ className }: { className?: string }) {
  return (
    <ul className={className} aria-label="Map legend">
      {LEGEND.map((entry) => {
        const tone = STATUS_META[entry.status].tone;

        return (
          <li key={entry.status} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
              style={{ background: TONE_CLASSES[tone].marker }}
            />
            <span className="text-xs text-muted-foreground">{entry.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
