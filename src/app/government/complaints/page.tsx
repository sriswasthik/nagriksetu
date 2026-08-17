"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ClipboardList,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { SLAIndicator } from "@/components/shared/SLAIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { StatCard } from "@/components/shared/StatCard";
import { TableSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatRelativeTime } from "@/lib/utils";
import { workOrderService } from "@/lib/services/workOrders";
import { analyticsService } from "@/lib/services/analytics";
import { referenceService, type Department } from "@/lib/services/reference";
import type { WorkOrder } from "@/types/workOrder";
import type { SLAData, WorkOrderCounts } from "@/types/analytics";

/**
 * ============================================================
 * AUTHORITY ISSUE QUEUE
 * ============================================================
 *
 * Triage surface. The default sort is by urgency (priority score,
 * then SLA headroom) because the queue's job is to answer "what do we
 * deal with next?", not "what arrived most recently".
 *
 * Urgency is signalled with a single left accent bar plus badges,
 * rather than tinting whole rows — a queue where every urgent row is
 * a coloured block becomes unreadable at volume.
 */

type QueueFilter = "urgent" | "unassigned" | "active" | "review" | "all";

const MATCHERS: Record<QueueFilter, (wo: WorkOrder) => boolean> = {
  urgent: (wo) =>
    ["critical", "high"].includes(wo.priorityLevel) &&
    wo.status !== "resolved",
  unassigned: (wo) => !wo.officerId,
  active: (wo) => ["assigned", "accepted", "in_progress"].includes(wo.status),
  review: (wo) => ["proof_submitted", "supervisor_review"].includes(wo.status),
  all: () => true,
};

type SortKey = "urgency" | "newest" | "sla";

export default function GovernmentIssueQueue() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  /*
   * Totals come from Postgres aggregates, not from the rows below. The
   * row query is capped, so counting the array would report "the urgent
   * ones among the most recent 200" under a label that says "urgent
   * open" — a wrong number that looks right.
   */
  const [totals, setTotals] = useState<WorkOrderCounts | null>(null);
  const [sla, setSla] = useState<SLAData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("urgent");
  const [department, setDepartment] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("urgency");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // The department filter compares against work_orders.department_id,
      // so its options have to be the real uuid-keyed rows. A failed
      // lookup only costs the filter, so it must not fail the queue.
      const [orders, departmentRows, counted, slaData] = await Promise.all([
        workOrderService.getWorkOrders(),
        referenceService.getDepartments().catch(() => []),
        // Aggregates are the source for the headline figures. A failure
        // costs the four stat cards, not the queue itself.
        analyticsService.getWorkOrderCounts().catch(() => null),
        analyticsService.getSLAData().catch(() => null),
      ]);

      setWorkOrders(orders);
      setDepartments(departmentRows);
      setTotals(counted);
      setSla(slaData);
    } catch (loadError) {
      console.error("Failed to load issue queue", loadError);
      setError("We couldn't load the issue queue. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      urgent: workOrders.filter(MATCHERS.urgent).length,
      unassigned: workOrders.filter(MATCHERS.unassigned).length,
      active: workOrders.filter(MATCHERS.active).length,
      review: workOrders.filter(MATCHERS.review).length,
      all: workOrders.length,
    }),
    [workOrders]
  );

  const filterOptions: FilterOption<QueueFilter>[] = [
    { value: "urgent", label: "Urgent", count: counts.urgent, tone: "attention" },
    { value: "unassigned", label: "Unassigned", count: counts.unassigned },
    { value: "active", label: "In flight", count: counts.active },
    { value: "review", label: "Awaiting verification", count: counts.review },
    { value: "all", label: "All", count: counts.all },
  ];

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = workOrders.filter((wo) => {
      if (!MATCHERS[filter](wo)) return false;
      if (department !== "all" && wo.departmentId !== department) return false;
      if (!query) return true;

      // Search the identifiers actually shown on the card — nobody
      // types a raw uuid into a queue search box.
      return [
        wo.complaintTitle,
        wo.workOrderNumber,
        wo.complaintNumber,
        wo.location.address,
        wo.officerName,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    });

    return filtered.sort((a, b) => {
      if (sort === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === "sla") {
        return a.slaHoursRemaining - b.slaHoursRemaining;
      }
      // Urgency: priority score, then least SLA headroom.
      const byPriority = b.priorityScore - a.priorityScore;
      if (byPriority !== 0) return byPriority;
      return a.slaHoursRemaining - b.slaHoursRemaining;
    });
  }, [workOrders, filter, department, search, sort]);

  /*
   * Whether the row query hit its cap. Said out loud below rather than
   * left for a reader to notice that the list stops.
   */
  const isCapped = totals !== null && workOrders.length < totals.total;

  const hasFilters = search.trim() !== "" || department !== "all" || filter !== "urgent";

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <TableSkeleton rows={6} columns={5} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Issue Queue"
        description="Triage, prioritise and assign incoming civic reports."
      />

      {error && (
        <ErrorState
          title="Unable to load the queue"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      {/* ---------- Queue posture ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Unassigned"
          value={totals?.unassigned ?? "—"}
          hint="No officer yet"
          tone={totals && totals.unassigned > 0 ? "danger" : "default"}
        />
        <StatCard
          /* Counted in Postgres across every complaint, not across the
             capped page of rows below. */
          label="SLA breached"
          value={sla?.breached ?? "—"}
          hint="Past their target deadline"
          tone={sla && sla.breached > 0 ? "danger" : "default"}
        />
        <StatCard
          label={sla ? `Due within ${sla.riskWindowHours}h` : "Due soon"}
          value={sla?.atRisk ?? "—"}
          hint="Deadline approaching"
          tone={sla && sla.atRisk > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Awaiting verification"
          value={totals?.awaitingVerification ?? "—"}
          hint="Proof submitted, needs sign-off"
          tone="brand"
        />
      </div>

      {/* A dash above means the aggregate could not be read, which is not
          the same as zero — so it says so instead of showing a figure. */}
      {totals === null && sla === null && !error && (
        <p className="mt-2 text-xs text-muted-foreground">
          Queue totals are unavailable. The list below is still live.
        </p>
      )}

      {/* ---------- Controls ---------- */}
      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1 lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ID, title, location or officer…"
              aria-label="Search the issue queue"
              className="h-11 pl-10 pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:w-52 lg:flex-none">
              <SlidersHorizontal
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="h-11" aria-label="Filter by department">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2 lg:w-48 lg:flex-none">
              <ArrowUpDown
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <Select
                value={sort}
                onValueChange={(value) => setSort(value as SortKey)}
              >
                <SelectTrigger className="h-11" aria-label="Sort the queue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgency">Most urgent</SelectItem>
                  <SelectItem value="sla">Closest to breach</SelectItem>
                  <SelectItem value="newest">Newest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <FilterChips
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          label="Filter the queue"
        />
      </div>

      <div
        aria-live="polite"
        className="mb-4 mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <span>
          {rows.length} {rows.length === 1 ? "report" : "reports"}
        </span>

        {/*
          The row query is capped, so the list can be a subset of what the
          totals above count. Said plainly: a queue that silently stops is
          how a reader concludes there is nothing further to triage.
        */}
        {isCapped && (
          <span className="text-xs">
            · showing the {workOrders.length} most recent of{" "}
            {totals?.total} — narrow the filters to reach older ones
          </span>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setDepartment("all");
              setFilter("urgent");
            }}
          >
            Reset filters
          </Button>
        )}
      </div>

      {/* ---------- Queue ---------- */}
      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing in this view"
          description="No report matches the current filters. Try widening them or resetting to the default urgent view."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setDepartment("all");
                setFilter("all");
              }}
            >
              Show all
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((order) => {
            const isUrgent = ["critical", "high"].includes(order.priorityLevel);
            const isBreached = order.slaHoursRemaining <= 0;
            const isClosed = order.status === "resolved";

            return (
              <li key={order.id}>
                <article
                  className={cn(
                    "rounded-lg border bg-card p-4 transition-colors hover:border-primary/40",
                    // One restrained accent instead of a filled row.
                    isBreached
                      ? "border-l-[3px] border-l-red-500"
                      : isUrgent && "border-l-[3px] border-l-amber-500"
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {order.workOrderNumber}
                        </span>
                        <PriorityBadge
                          level={order.priorityLevel}
                          score={order.priorityScore}
                          size="sm"
                        />
                        <Badge
                          variant={order.status === "assigned" ? "warning" : "info"}
                          className="capitalize"
                        >
                          {order.status.replace(/_/g, " ")}
                        </Badge>
                        {!isClosed && (
                          <SLAIndicator
                            hoursRemaining={order.slaHoursRemaining}
                            size="sm"
                          />
                        )}
                      </div>

                      <h2 className="mt-2.5 text-sm font-semibold leading-snug text-foreground sm:text-base">
                        <Link
                          href={`/officer/work-orders/${order.id}`}
                          className="rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {order.complaintTitle}
                        </Link>
                      </h2>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="max-w-[16rem] truncate">
                            {order.location.address}
                          </span>
                        </span>
                        <span>{order.departmentName}</span>
                        <span>Raised {formatRelativeTime(order.createdAt)}</span>
                      </div>
                    </div>

                    {/* Assignment state — the queue's primary decision. */}
                    <div className="flex shrink-0 flex-col gap-2 border-t pt-3 lg:w-56 lg:items-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                      {order.officerName ? (
                        <div className="lg:text-right">
                          <p className="text-xs text-muted-foreground">
                            Assigned to
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {order.officerName}
                          </p>
                        </div>
                      ) : (
                        <Badge variant="warning">Unassigned</Badge>
                      )}

                      <Button asChild size="sm" variant="outline" className="w-full lg:w-auto">
                        <Link href={`/officer/work-orders/${order.id}`}>
                          Open
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
