"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  MapPin,
} from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { SLAIndicator } from "@/components/shared/SLAIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatGridSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";
import type { WorkOrder } from "@/types/workOrder";

const ACTIVE_STATUSES = ["assigned", "accepted", "in_progress"];

export default function OfficerDashboard() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officerName, setOfficerName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const user = await authService.getCurrentUser().catch(() => null);

      if (user?.name) setOfficerName(user.name.split(" ")[0]);

      const data = await workOrderService.getWorkOrders({
        officerId: user?.id,
      });
      setWorkOrders(data);
    } catch (loadError) {
      console.error("Failed to load officer dashboard", loadError);
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

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <StatGridSkeleton count={3} />
        <Skeleton className="mt-10 h-6 w-48" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-52 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const active = workOrders.filter((wo) => ACTIVE_STATUSES.includes(wo.status));
  const breaching = active.filter((wo) => wo.slaHoursRemaining <= 6);
  const completedToday = workOrders.filter(
    (wo) =>
      (wo.status === "resolved" || wo.status === "proof_submitted") &&
      new Date(wo.updatedAt).toDateString() === new Date().toDateString()
  );

  /*
   * The department subtitle was read from `profile.department`, a column
   * public.profiles does not have, so it was always empty and this
   * header always rendered the fallback below. Removed rather than
   * wired up, which would change what the page shows.
   */

  return (
    <div>
      <PageHeader
        title={officerName ? `Welcome, ${officerName}` : "Field operations"}
        description="Your assigned work orders for today."
        action={
          <Button asChild>
            <Link href="/officer/work-orders">
              <ClipboardList className="mr-1 h-4 w-4" aria-hidden="true" />
              All work orders
            </Link>
          </Button>
        }
      />

      {error && (
        <ErrorState
          title="Unable to load work orders"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      {/* ---------- Operational metrics ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Active assignments"
          value={active.length}
          hint="Assigned, accepted or under way"
          icon={ClipboardList}
          tone="brand"
          href="/officer/work-orders"
        />
        <StatCard
          label="At SLA risk"
          value={breaching.length}
          hint="Six hours or less remaining"
          icon={AlertCircle}
          tone={breaching.length > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Completed today"
          value={completedToday.length}
          hint="Proof submitted or signed off"
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      {/* ---------- Priority queue ---------- */}
      <section aria-labelledby="priority-heading" className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2
              id="priority-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Work on these first
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Ordered by priority score, then SLA deadline.
            </p>
          </div>

          {active.length > 4 && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/officer/work-orders">
                View all
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>

        {active.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing outstanding"
            headingLevel="h3"
            description="You have no active work orders right now. New assignments will appear here as they are routed to you."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {[...active]
              .sort((a, b) => {
                const byPriority = b.priorityScore - a.priorityScore;
                if (byPriority !== 0) return byPriority;
                return a.slaHoursRemaining - b.slaHoursRemaining;
              })
              .slice(0, 4)
              .map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col rounded-lg border bg-card p-5 transition-colors hover:border-primary/40"
                >
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
                  </div>

                  <h3 className="mt-3 text-base font-semibold leading-snug text-foreground">
                    <Link
                      href={`/officer/work-orders/${order.id}`}
                      className="rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {order.complaintTitle}
                    </Link>
                  </h3>

                  <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="line-clamp-2">{order.location.address}</span>
                  </p>

                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <PriorityBadge
                      level={order.priorityLevel}
                      score={order.priorityScore}
                    />
                    <SLAIndicator hoursRemaining={order.slaHoursRemaining} />
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
                    <span className="text-xs text-muted-foreground">
                      Assigned {formatRelativeTime(order.assignedAt)}
                    </span>
                    <Button asChild size="sm">
                      <Link href={`/officer/work-orders/${order.id}`}>
                        {order.status === "assigned" ? "Review" : "Update"}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
