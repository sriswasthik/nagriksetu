"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, RefreshCw, X } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { IssuesMap, MapLegend } from "@/components/map/IssuesMap";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { MapSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import { formatCategory } from "@/lib/design/status";
import { getMyComplaints } from "@/lib/services/complaints";
import type { Complaint } from "@/types/complaint";

type MapFilter = "all" | "open" | "resolved";

const MATCHERS: Record<MapFilter, (c: Complaint) => boolean> = {
  all: () => true,
  open: (c) => !["resolved", "rejected"].includes(c.status),
  resolved: (c) => c.status === "resolved",
};

/**
 * ============================================================
 * NEARBY ISSUES
 * ============================================================
 *
 * NOTE ON DATA SCOPE:
 * This shows the signed-in citizen's own reports. Row-level security
 * restricts `complaints` to the reporting citizen, and no public /
 * area-scoped read endpoint exists yet, so a genuine city-wide feed
 * is not something the frontend can honestly render today. Showing
 * fabricated neighbourhood reports here would misrepresent real
 * civic data, so the page is scoped and labelled accordingly.
 */
export default function CitizenMapPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MapFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setComplaints(await getMyComplaints());
    } catch (loadError) {
      console.error("Failed to load map data:", loadError);
      setError(
        "We couldn't load your reports just now. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, [load]);

  /** Only reports with coordinates can appear on a map. */
  const located = useMemo(
    () => complaints.filter((c) => c.latitude !== null && c.longitude !== null),
    [complaints]
  );

  const visible = useMemo(
    () => located.filter(MATCHERS[filter]),
    [located, filter]
  );

  const filterOptions: FilterOption<MapFilter>[] = [
    { value: "all", label: "All", count: located.length },
    { value: "open", label: "Open", count: located.filter(MATCHERS.open).length },
    {
      value: "resolved",
      label: "Resolved",
      count: located.filter(MATCHERS.resolved).length,
    },
  ];

  const selected = visible.find((c) => c.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <MapSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nearby Issues"
        description="Your reports plotted on the map, so you can see them in context."
        action={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {error && (
        <ErrorState
          title="Unable to load the map"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      {!error && located.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nothing to map yet"
          description="Once you report an issue with its location captured, it will appear here alongside your other reports."
          action={
            <Button asChild>
              <Link href="/citizen/report">Report an issue</Link>
            </Button>
          }
        />
      ) : (
        !error && (
          <>
            <div className="mb-4">
              <FilterChips
                options={filterOptions}
                value={filter}
                onChange={(value) => {
                  setFilter(value);
                  setSelectedId(null);
                }}
                label="Filter mapped reports"
              />
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[1.7fr_1fr]">
              {/* ---------- Map ---------- */}
              <div className="relative min-w-0 overflow-hidden rounded-lg border bg-card">
                <div className="h-[380px] sm:h-[460px] lg:h-[560px]">
                  <IssuesMap
                    complaints={visible}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </div>

                {/* Legend floats over the map on wider screens only —
                    on mobile it would cover too much of the surface. */}
                <div className="pointer-events-none absolute left-3 top-3 hidden rounded-lg border bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:block">
                  <MapLegend className="space-y-1.5" />
                </div>
              </div>

              {/* ---------- List / selected detail ---------- */}
              <div className="min-w-0 space-y-3">
                {selected ? (
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {selected.complaint_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        aria-label="Close selected report"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <h2 className="mt-2 text-base font-semibold leading-snug text-foreground">
                      {selected.title}
                    </h2>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <StatusBadge status={selected.status} />
                      {selected.priority_level && (
                        <PriorityBadge level={selected.priority_level} />
                      )}
                    </div>

                    {selected.description && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {selected.description}
                      </p>
                    )}

                    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {selected.address || "Location recorded"}
                    </p>

                    <Button asChild className="mt-4 w-full">
                      <Link href={`/citizen/complaints/${selected.id}`}>
                        View full report
                        <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed bg-card/50 p-4 text-sm text-muted-foreground">
                    Select a marker or a report below to see its details.
                  </p>
                )}

                <ul
                  className="max-h-[420px] space-y-2 overflow-y-auto lg:max-h-[400px]"
                  aria-label="Mapped reports"
                >
                  {visible.map((complaint) => (
                    <li key={complaint.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(complaint.id)}
                        aria-pressed={complaint.id === selectedId}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          complaint.id === selectedId
                            ? "border-primary bg-primary/5"
                            : "bg-card hover:border-primary/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {complaint.title}
                          </span>
                          <StatusBadge status={complaint.status} size="sm" />
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatCategory(complaint.category)} ·{" "}
                          {formatRelativeTime(complaint.updated_at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Honest scope note — see the file header. */}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This map shows reports you submitted. A city-wide public feed
                  will appear here once it is available.
                </p>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
