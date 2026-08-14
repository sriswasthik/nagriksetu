"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";

import type { WorkOrder } from "@/types/workOrder";

import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";

import {
  ClipboardList,
  AlertCircle,
  Clock,
  MapPin,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  PlayCircle,
  CheckCircle,
  Loader2,
  UserRound,
} from "lucide-react";

export default function OfficerDashboard() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userName, setUserName] = useState("Officer");
  const [department, setDepartment] = useState("");

  async function loadDashboard(showRefreshState = false) {
    try {
      setError(null);

      if (showRefreshState) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const user = await authService.getCurrentUser();

      if (!user) {
        setError("Unable to identify the current officer.");
        return;
      }

      setUserName(user.name?.split(" ")[0] || "Officer");
      setDepartment(user.department || "");

      const data = await workOrderService.getWorkOrders({
        officerId: user.id,
      });

      setWorkOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load officer dashboard data:", err);
      setError("Unable to load your work orders. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const activeOrders = useMemo(
    () =>
      workOrders.filter((order) =>
        ["assigned", "accepted", "in_progress"].includes(order.status)
      ),
    [workOrders]
  );

  const assignedOrders = useMemo(
    () => activeOrders.filter((order) => order.status === "assigned"),
    [activeOrders]
  );

  const inProgressOrders = useMemo(
    () => activeOrders.filter((order) => order.status === "in_progress"),
    [activeOrders]
  );

  const urgentOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) =>
          order.priorityLevel === "critical" ||
          order.priorityLevel === "high"
      ),
    [activeOrders]
  );

  const completedToday = useMemo(() => {
    const today = new Date().toDateString();

    return workOrders.filter(
      (order) =>
        (order.status === "completed" ||
          order.status === "proof_submitted") &&
        new Date(order.updatedAt).toDateString() === today
    );
  }, [workOrders]);

  const priorityOrders = useMemo(() => {
    return [...activeOrders]
      .sort((a, b) => {
        const priorityDifference =
          (b.priorityScore || 0) - (a.priorityScore || 0);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return (
          (a.slaHoursRemaining || 999999) -
          (b.slaHoursRemaining || 999999)
        );
      })
      .slice(0, 6);
  }, [activeOrders]);

  const departmentLabel = department
    ? department.replace("dept-", "").replace(/-/g, " ").toUpperCase()
    : "FIELD OPERATIONS";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${userName}`}
        description={`Field Operations • ${departmentLabel}`}
      />

      {/* Dashboard controls */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadDashboard(true)}
          disabled={isRefreshing || isLoading}
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />

              <div>
                <p className="font-semibold text-destructive">
                  Dashboard unavailable
                </p>

                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboard(true)}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/20 bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground/80">
              Active Assignments
            </CardTitle>

            <ClipboardList className="h-5 w-5 text-primary-foreground/80" />
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold">
              {isLoading ? "—" : activeOrders.length}
            </div>

            <p className="mt-1 text-xs text-primary-foreground/70">
              Complaints currently assigned to you
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-300/50 bg-amber-50/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-800">
              Awaiting Action
            </CardTitle>

            <PlayCircle className="h-5 w-5 text-amber-700" />
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold text-amber-800">
              {isLoading ? "—" : assignedOrders.length}
            </div>

            <p className="mt-1 text-xs text-amber-700/80">
              Assignments waiting for acceptance
            </p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Urgent / SLA Risk
            </CardTitle>

            <AlertCircle className="h-5 w-5 text-destructive" />
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {isLoading ? "—" : urgentOrders.length}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              High or critical priority complaints
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-300/40 bg-emerald-50/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">
              Completed Today
            </CardTitle>

            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          </CardHeader>

          <CardContent>
            <div className="text-3xl font-bold text-emerald-800">
              {isLoading ? "—" : completedToday.length}
            </div>

            <p className="mt-1 text-xs text-emerald-700/80">
              Work completed or proof submitted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current work summary */}
      {!isLoading && activeOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today's Operations</CardTitle>

            <CardDescription>
              Current workload across your assigned field operations.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                  Active
                </div>

                <p className="mt-2 text-2xl font-bold">
                  {activeOrders.length}
                </p>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PlayCircle className="h-4 w-4" />
                  Awaiting Acceptance
                </div>

                <p className="mt-2 text-2xl font-bold">
                  {assignedOrders.length}
                </p>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  In Progress
                </div>

                <p className="mt-2 text-2xl font-bold">
                  {inProgressOrders.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Priority work orders */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Priority Work Orders
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Focus on the highest-impact complaints first.
            </p>
          </div>

          <Link href="/officer/work-orders">
            <Button variant="ghost" size="sm">
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <Card key={item} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-6 w-3/4 rounded bg-muted" />
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="h-4 w-full rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && activeOrders.length === 0 && !error && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-emerald-50 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>

              <h3 className="text-lg font-semibold">
                You&apos;re all caught up
              </h3>

              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                There are no active work orders assigned to you at the moment.
              </p>

              <Link href="/officer/work-orders" className="mt-5">
                <Button variant="outline">
                  View Work Order History
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Work order cards */}
        {!isLoading && priorityOrders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {priorityOrders.map((order) => {
              const isUrgent =
                order.priorityLevel === "critical" ||
                order.priorityLevel === "high";

              const isInProgress = order.status === "in_progress";

              return (
                <Card
                  key={order.id}
                  className={`group flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    isUrgent
                      ? "border-destructive/30 hover:border-destructive/50"
                      : "hover:border-primary/40"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <span className="font-mono text-xs font-medium text-muted-foreground">
                        {order.id}
                      </span>

                      <Badge
                        variant={
                          order.status === "assigned"
                            ? "warning"
                            : order.status === "accepted"
                              ? "info"
                              : "default"
                        }
                        className="capitalize"
                      >
                        {order.status.replace("_", " ")}
                      </Badge>
                    </div>

                    <CardTitle className="line-clamp-2 text-lg">
                      {order.complaintTitle}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-4">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />

                      <span className="line-clamp-2">
                        {order.location?.address || "Location unavailable"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge level={order.priorityLevel} />

                      {typeof order.slaHoursRemaining === "number" && (
                        <div
                          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                            order.slaHoursRemaining <= 4
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5" />

                          {order.slaHoursRemaining}h remaining
                        </div>
                      )}
                    </div>

                    {isInProgress && (
                      <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
                        <Clock className="h-4 w-4" />
                        Work is currently in progress
                      </div>
                    )}
                  </CardContent>

                  <div className="mt-auto border-t p-6 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <UserRound className="h-3.5 w-3.5" />

                        <span>
                          Assigned {formatRelativeTime(order.assignedAt)}
                        </span>
                      </div>

                      <Link href={`/officer/work-orders/${order.id}`}>
                        <Button size="sm">
                          {order.status === "assigned"
                            ? "Review Task"
                            : order.status === "accepted"
                              ? "Start Work"
                              : "Open Task"}

                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Field Operations</CardTitle>

          <CardDescription>
            Quickly access your operational tools.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/officer/work-orders">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4"
              >
                <ClipboardList className="mr-3 h-5 w-5" />

                <div className="text-left">
                  <p className="font-semibold">All Work Orders</p>
                  <p className="text-xs text-muted-foreground">
                    View assigned tasks and history
                  </p>
                </div>
              </Button>
            </Link>

            <Link href="/officer/work-orders?status=in_progress">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4"
              >
                <Clock className="mr-3 h-5 w-5" />

                <div className="text-left">
                  <p className="font-semibold">Active Work</p>
                  <p className="text-xs text-muted-foreground">
                    Continue ongoing field operations
                  </p>
                </div>
              </Button>
            </Link>

            <Link href="/officer/work-orders?status=completed">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4"
              >
                <CheckCircle className="mr-3 h-5 w-5" />

                <div className="text-left">
                  <p className="font-semibold">Completed</p>
                  <p className="text-xs text-muted-foreground">
                    Review completed assignments
                  </p>
                </div>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}