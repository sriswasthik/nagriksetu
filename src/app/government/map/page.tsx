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
import { DemoDataNotice } from "@/components/shared/DemoDataNotice";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { MapSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { workOrderService } from "@/lib/services/workOrders";
import type { WorkOrder } from "@/types/workOrder";

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
 */
export default function GovernmentMapPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HotspotFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setWorkOrders(await workOrderService.getWorkOrders());
    } catch (loadError) {
      console.error("Failed to load map data", loadError);
      setError("We couldn't load the map. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => workOrders.filter(MATCHERS[filter]),
    [workOrders, filter]
  );

  const filterOptions: FilterOption<HotspotFilter>[] = [
    { value: "all", label: "All", count: workOrders.length },
    {
      value: "urgent",
      label: "Urgent",
      count: workOrders.filter(MATCHERS.urgent).length,
      tone: "attention",
    },
    {
      value: "breaching",
      label: "Near breach",
      count: workOrders.filter(MATCHERS.breaching).length,
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
        description="Open work orders plotted across the city, coloured by status."
      />

      {error && (
        <ErrorState
          title="Unable to load the map"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      <DemoDataNotice className="mb-6" />

      {workOrders.length === 0 && !error ? (
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

            <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
              <div className="relative overflow-hidden rounded-lg border bg-card">
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

              <div className="space-y-3">
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
