"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, X } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { MapLegend } from "@/components/map/IssuesMap";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { SLAIndicator } from "@/components/shared/SLAIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { MapSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { workOrderService } from "@/lib/services/workOrders";
import { analyticsService, formatCount } from "@/lib/services/analytics";
import { isRenderableCoordinate } from "@/lib/geo/coordinates";
import type { WorkOrder } from "@/types/workOrder";
import type { Hotspot } from "@/types/analytics";

const WorkOrderMap = dynamic(
  () => import("@/components/map/WorkOrderMapInner"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> }
);

type HotspotFilter = "all" | "urgent" | "breaching";

const MATCHERS: Record<HotspotFilter, (wo: WorkOrder) => boolean> = {
  all: () => true,
  urgent: (wo) => ["critical", "high"].includes(wo.priorityLevel),
  breaching: (wo) => wo.slaHoursRemaining <= 6,
};

/**
 * Geographic hotspots. Answers "where is the pressure concentrated?"
 * — clusters of urgent markers are the signal, not any single pin.
 *
 * The concentration itself is now counted rather than eyeballed.
 * analytics_hotspots() groups complaints by a ~550 m grid in Postgres and
 * returns the busiest neighbourhoods, so the page can state where the
 * pressure is instead of leaving a reader to judge marker density — and
 * the ranking covers every complaint, not only the work orders plotted
 * below.
 */
export default function GovernmentMapPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HotspotFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      /*
       * Markers are capped. This was an unbounded select joining four
       * tables so the browser could plot every pin in the city; the
       * concentration ranking beside it is aggregated server-side and
       * does not depend on how many markers were fetched.
       */
      const [orders, spots] = await Promise.all([
        workOrderService.getWorkOrders({ limit: 200 }),
        analyticsService.getHotspots({ minReports: 2, limit: 8 }).catch(() => []),
      ]);

      setWorkOrders(orders);
      setHotspots(spots);
    } catch (loadError) {
      console.error("Failed to load map data", loadError);
      setError("We couldn't load the map. Please try again.");
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

  /*
   * Only the ones the map can actually draw.
   *
   * The chips counted every fetched work order, so "All 41" sat above a
   * map showing 38 markers with nothing to explain the difference —
   * `mapWorkOrder()` was coalescing missing coordinates to 0,0 and the map
   * drew those in the Gulf of Guinea. Now they are excluded from both, and
   * the count says how many were left out.
   */
  const mappable = useMemo(
    () =>
      workOrders.filter((wo) =>
        isRenderableCoordinate(wo.location.latitude, wo.location.longitude)
      ),
    [workOrders]
  );

  const unmapped = workOrders.length - mappable.length;

  const visible = useMemo(
    () => mappable.filter(MATCHERS[filter]),
    [mappable, filter]
  );

  const filterOptions: FilterOption<HotspotFilter>[] = [
    { value: "all", label: "All", count: mappable.length },
    {
      value: "urgent",
      label: "Urgent",
      count: mappable.filter(MATCHERS.urgent).length,
      tone: "attention",
    },
    {
      value: "breaching",
      label: "Near breach",
      count: mappable.filter(MATCHERS.breaching).length,
    },
  ];

  const selected = visible.find((wo) => wo.id === selectedId) ?? null;

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
        title="Geographic Hotspots"
        description="Where reports concentrate, and the work orders behind them."
      />

      {/*
        ---------- Measured concentration ----------

        Counted per area in Postgres rather than judged from marker
        density, and drawn from every complaint rather than only the work
        orders plotted below — an untriaged report with no work order is
        still pressure on a neighbourhood.
      */}
      {hotspots.length > 0 && (
        <section
          aria-labelledby="concentration-heading"
          className="mb-6 rounded-lg border bg-card p-5"
        >
          <h2
            id="concentration-heading"
            className="text-sm font-semibold text-foreground"
          >
            Busiest areas
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reports grouped by locality, most open work first. Areas with a
            single report are not listed.
          </p>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {hotspots.map((spot) => (
              <li
                key={`${spot.latitude},${spot.longitude}`}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {spot.dominantCategory}
                  </span>
                  <span className="tabular shrink-0 text-lg font-bold text-foreground">
                    {formatCount(spot.openReports)}
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  open of {formatCount(spot.reports)} reported
                </p>

                {spot.criticalReports > 0 && (
                  <Badge variant="critical" className="mt-2 text-[0.6875rem]">
                    {spot.criticalReports} critical
                  </Badge>
                )}

                <a
                  href={`https://www.openstreetmap.org/?mlat=${spot.latitude}&mlon=${spot.longitude}#map=16/${spot.latitude}/${spot.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block truncate text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <ErrorState
          title="Unable to load the map"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      {/*
        Said rather than hidden. A queue of 41 above a map of 38 markers
        needs the three explained, or the map reads as dropping work.
      */}
      {unmapped > 0 && !error && (
        <p className="mb-4 text-xs text-muted-foreground">
          {unmapped} {unmapped === 1 ? "work order has" : "work orders have"} no
          recorded coordinates and cannot be mapped.
        </p>
      )}

      {mappable.length === 0 && !error ? (
        <EmptyState
          icon={MapPin}
          title="No mapped work orders"
          description="Work orders with recorded coordinates will appear on this map."
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
                label="Filter mapped work orders"
              />
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[1.7fr_1fr]">
              <div className="relative min-w-0 overflow-hidden rounded-lg border bg-card">
                <div className="h-[400px] sm:h-[500px] lg:h-[600px]">
                  <WorkOrderMap
                    workOrders={visible}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </div>

                <div className="pointer-events-none absolute left-3 top-3 hidden rounded-lg border bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:block">
                  <MapLegend className="space-y-1.5" />
                </div>
              </div>

              <div className="min-w-0 space-y-3">
                {selected ? (
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {selected.id}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        aria-label="Close selected work order"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <h2 className="mt-2 text-base font-semibold leading-snug text-foreground">
                      {selected.complaintTitle}
                    </h2>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <PriorityBadge
                        level={selected.priorityLevel}
                        score={selected.priorityScore}
                      />
                      <SLAIndicator hoursRemaining={selected.slaHoursRemaining} />
                    </div>

                    <dl className="mt-3.5 space-y-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Department</dt>
                        <dd className="font-medium text-foreground">
                          {selected.departmentName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Officer</dt>
                        <dd className="font-medium text-foreground">
                          {selected.officerName || "Unassigned"}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {selected.location.address}
                    </p>

                    <Button asChild className="mt-4 w-full">
                      <Link href={`/officer/work-orders/${selected.id}`}>
                        Open work order
                        <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed bg-card/50 p-4 text-sm text-muted-foreground">
                    Select a marker to inspect a work order.
                  </p>
                )}

                <ul
                  className="max-h-[440px] space-y-2 overflow-y-auto"
                  aria-label="Mapped work orders"
                >
                  {visible.map((order) => (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        aria-pressed={order.id === selectedId}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          order.id === selectedId
                            ? "border-primary bg-primary/5"
                            : "bg-card hover:border-primary/40 hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {order.complaintTitle}
                          </span>
                          <Badge
                            variant={
                              order.status === "assigned" ? "warning" : "info"
                            }
                            className="shrink-0 capitalize"
                          >
                            {order.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {order.departmentName} · {order.location.address}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
