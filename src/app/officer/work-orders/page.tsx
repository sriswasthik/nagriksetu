"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, CheckCircle2, MapPin, Search, X } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { SLAIndicator } from "@/components/shared/SLAIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { IssueListSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { workOrderService } from "@/lib/services/workOrders";
import type { WorkOrder } from "@/types/workOrder";

/**
 * Status filters live here rather than in the sidebar: they filter
 * this list, and putting them in navigation would both mislead and
 * force the whole app out of static prerendering.
 */
type FilterKey = "active" | "new" | "in_progress" | "review" | "done" | "all";

const MATCHERS: Record<FilterKey, (wo: WorkOrder) => boolean> = {
  active: (wo) => ["assigned", "accepted", "in_progress"].includes(wo.status),
  new: (wo) => wo.status === "assigned",
  in_progress: (wo) => wo.status === "in_progress",
  review: (wo) => ["proof_submitted", "supervisor_review"].includes(wo.status),
  done: (wo) => ["resolved"].includes(wo.status),
  all: () => true,
};

export default function OfficerWorkOrdersList() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("active");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      /*
       * Scoped by the session, not by an id the page looked up: an
       * undefined officerId used to drop the filter silently, turning
       * "my work orders" into everything RLS permitted.
       */
      const data = await workOrderService.getMyWorkOrders();
      setWorkOrders(data);
    } catch (loadError) {
      console.error("Failed to load work orders", loadError);
      setError("We couldn't load your work orders. Please try again.");
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

  const counts = useMemo(
    () => ({
      active: workOrders.filter(MATCHERS.active).length,
      new: workOrders.filter(MATCHERS.new).length,
      in_progress: workOrders.filter(MATCHERS.in_progress).length,
      review: workOrders.filter(MATCHERS.review).length,
      done: workOrders.filter(MATCHERS.done).length,
      all: workOrders.length,
    }),
    [workOrders]
  );

  const filterOptions: FilterOption<FilterKey>[] = [
    { value: "active", label: "Active", count: counts.active },
    { value: "new", label: "New", count: counts.new, tone: "attention" },
    { value: "in_progress", label: "In progress", count: counts.in_progress },
    { value: "review", label: "Awaiting verification", count: counts.review },
    { value: "done", label: "Completed", count: counts.done },
    { value: "all", label: "All", count: counts.all },
  ];

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return workOrders
      .filter((wo) => {
        if (!MATCHERS[filter](wo)) return false;
        if (!query) return true;

        return [
          wo.complaintTitle,
          wo.workOrderNumber,
          wo.complaintNumber,
          wo.location.address,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        // Urgency first: priority, then how close the SLA is.
        const byPriority = b.priorityScore - a.priorityScore;
        if (byPriority !== 0) return byPriority;
        return a.slaHoursRemaining - b.slaHoursRemaining;
      });
  }, [workOrders, filter, searchQuery]);

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <IssueListSkeleton count={3} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Work Orders"
        description="Your assigned field tasks, most urgent first."
      />

      {error && (
        <ErrorState
          title="Unable to load work orders"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      {/* ---------- Search + filters ---------- */}
      <div className="mb-6 space-y-4">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by work order ID, title or location…"
            aria-label="Search work orders"
            className="h-11 pl-10 pr-10"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <FilterChips
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          label="Filter work orders by status"
        />
      </div>

      <p aria-live="polite" className="mb-4 text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "work order" : "work orders"}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing here"
          description="No work order matches this filter. Try another filter, or clear your search."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setFilter("all");
                setSearchQuery("");
              }}
            >
              Show all
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => {
            const isClosed = order.status === "resolved";

            return (
              <li key={order.id}>
                <article className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
                  <div className="flex flex-col md:flex-row">
                    <div className="min-w-0 flex-1 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {order.workOrderNumber}
                        </span>
                        <Badge
                          variant={order.status === "assigned" ? "warning" : "info"}
                          className="capitalize"
                        >
                          {order.status.replace(/_/g, " ")}
                        </Badge>
                        <PriorityBadge
                          level={order.priorityLevel}
                          score={order.priorityScore}
                        />
                        {!isClosed && (
                          <SLAIndicator hoursRemaining={order.slaHoursRemaining} />
                        )}
                      </div>

                      <h2 className="mt-3 text-base font-semibold leading-snug text-foreground sm:text-lg">
                        <Link
                          href={`/officer/work-orders/${order.id}`}
                          className="rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {order.complaintTitle}
                        </Link>
                      </h2>

                      <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {order.location.address}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                          Assigned{" "}
                          {new Date(order.assignedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span>
                          Report:{" "}
                          <span className="font-mono">{order.complaintId}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center border-t bg-muted/25 p-4 md:w-48 md:border-l md:border-t-0">
                      <Button asChild className="w-full">
                        <Link href={`/officer/work-orders/${order.id}`}>
                          {order.status === "assigned"
                            ? "Review & accept"
                            : isClosed
                              ? "View details"
                              : "Update status"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
