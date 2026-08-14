"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";

import type { WorkOrder } from "@/types/workOrder";

import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { Search, Filter, MapPin, Clock, Calendar, CheckCircle2, RefreshCw, Loader2, AlertCircle, ArrowRight } from "lucide-react";

export default function OfficerWorkOrdersList() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [priorityFilter, setPriorityFilter] = useState("all");

  async function loadData(refresh = false) {
    try {
      setError(null);

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const user = await authService.getCurrentUser();

      if (!user) {
        setError("Unable to identify the current officer.");
        return;
      }

      const data = await workOrderService.getWorkOrders({
        officerId: user.id,
      });

      setWorkOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load work orders:", err);
      setError("Unable to load your work orders. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...workOrders]
      .filter((order) => {
        /* ---------------- SEARCH ---------------- */

        const matchesSearch =
          !query ||
          order.complaintTitle?.toLowerCase().includes(query) ||
          order.id?.toLowerCase().includes(query) ||
          order.complaintId?.toLowerCase().includes(query) ||
          order.location?.address?.toLowerCase().includes(query);

        /* ---------------- STATUS ---------------- */

        let matchesStatus = true;

        if (statusFilter !== "all") {
          if (statusFilter === "active") {
            matchesStatus = [
              "assigned",
              "accepted",
              "in_progress",
            ].includes(order.status);
          } else {
            matchesStatus = order.status === statusFilter;
          }
        }

        /* ---------------- PRIORITY ---------------- */

        const matchesPriority =
          priorityFilter === "all" ||
          order.priorityLevel === priorityFilter;

        return matchesSearch && matchesStatus && matchesPriority;
      })
      .sort((a, b) => {
        /*
         * Highest priority first.
         * If priority is equal, the smallest SLA remaining
         * comes first.
         */
        const priorityDifference =
          (b.priorityScore || 0) - (a.priorityScore || 0);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return (
          (a.slaHoursRemaining || 999999) -
          (b.slaHoursRemaining || 999999)
        );
      });
  }, [
    workOrders,
    searchQuery,
    statusFilter,
    priorityFilter,
  ]);

  const activeCount = workOrders.filter((order) =>
    ["assigned", "accepted", "in_progress"].includes(order.status)
  ).length;

  const urgentCount = workOrders.filter(
    (order) =>
      ["assigned", "accepted", "in_progress"].includes(order.status) &&
      ["high", "critical"].includes(order.priorityLevel)
  ).length;

  const completedCount = workOrders.filter((order) =>
    ["completed", "proof_submitted"].includes(order.status)
  ).length;

  const getStatusVariant = (
    status: WorkOrder["status"]
  ): "warning" | "info" | "success" | "default" => {
    switch (status) {
      case "assigned":
        return "warning";

      case "accepted":
        return "info";

      case "in_progress":
        return "info";

      case "proof_submitted":
        return "success";

      case "completed":
        return "success";

      default:
        return "default";
    }
  };

  const getActionLabel = (status: WorkOrder["status"]) => {
    switch (status) {
      case "assigned":
        return "Review & Accept";

      case "accepted":
        return "Start Work";

      case "in_progress":
        return "Update Status";

      case "proof_submitted":
      case "completed":
        return "View Details";

      default:
        return "Open Task";
    }
  };

  const isActiveStatus = (status: WorkOrder["status"]) =>
    ["assigned", "accepted", "in_progress"].includes(status);

  const isSlaRisk = (order: WorkOrder) =>
    isActiveStatus(order.status) &&
    typeof order.slaHoursRemaining === "number" &&
    order.slaHoursRemaining <= 4;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Work Orders"
        description="Manage and update your assigned field tasks."
      />

      {/* SUMMARY */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Active
              </p>

              <p className="mt-1 text-2xl font-bold">
                {isLoading ? "—" : activeCount}
              </p>
            </div>

            <div className="rounded-lg bg-primary/10 p-2">
              <Clock className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/20">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Urgent
              </p>

              <p className="mt-1 text-2xl font-bold text-destructive">
                {isLoading ? "—" : urgentCount}
              </p>
            </div>

            <div className="rounded-lg bg-destructive/10 p-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Completed
              </p>

              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {isLoading ? "—" : completedCount}
              </p>
            </div>

            <div className="rounded-lg bg-emerald-50 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTER BAR */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                placeholder="Search by WO ID, complaint, or location..."
                className="h-10 pl-9"
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
              />
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 lg:w-52">
              <Filter className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />

              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="active">
                    Active Tasks
                  </SelectItem>

                  <SelectItem value="all">
                    All Tasks
                  </SelectItem>

                  <SelectItem value="assigned">
                    New Assignments
                  </SelectItem>

                  <SelectItem value="accepted">
                    Accepted
                  </SelectItem>

                  <SelectItem value="in_progress">
                    In Progress
                  </SelectItem>

                  <SelectItem value="proof_submitted">
                    Proof Submitted
                  </SelectItem>

                  <SelectItem value="completed">
                    Completed
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="lg:w-44">
              <Select
                value={priorityFilter}
                onValueChange={setPriorityFilter}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All Priorities
                  </SelectItem>

                  <SelectItem value="critical">
                    Critical
                  </SelectItem>

                  <SelectItem value="high">
                    High
                  </SelectItem>

                  <SelectItem value="medium">
                    Medium
                  </SelectItem>

                  <SelectItem value="low">
                    Low
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              className="h-10"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}

              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ERROR */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

              <div>
                <p className="font-semibold text-destructive">
                  Unable to load work orders
                </p>

                <p className="text-sm text-muted-foreground">
                  {error}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* RESULT COUNT */}
      {!isLoading && !error && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground">
              {filteredOrders.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-foreground">
              {workOrders.length}
            </span>{" "}
            work orders
          </p>

          {(searchQuery ||
            statusFilter !== "active" ||
            priorityFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("active");
                setPriorityFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* LOADING */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-6 w-2/3 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* EMPTY */}
      {!isLoading &&
        !error &&
        filteredOrders.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-muted p-4">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
              </div>

              <h3 className="text-lg font-semibold">
                No work orders found
              </h3>

              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                There are no work orders matching your current
                search and filters.
              </p>

              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("active");
                  setPriorityFilter("all");
                }}
              >
                Reset Filters
              </Button>
            </CardContent>
          </Card>
        )}

      {/* WORK ORDERS */}
      {!isLoading &&
        !error &&
        filteredOrders.length > 0 && (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const slaRisk = isSlaRisk(order);

              return (
                <Card
                  key={order.id}
                  className={`group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    slaRisk
                      ? "border-destructive/40"
                      : "hover:border-primary/40"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row">
                    {/* MAIN CONTENT */}
                    <div className="min-w-0 flex-1 p-5 lg:p-6">
                      {/* TOP ROW */}
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {order.id}
                          </span>

                          <Badge
                            variant={getStatusVariant(order.status)}
                            className="capitalize"
                          >
                            {order.status.replace("_", " ")}
                          </Badge>

                          <PriorityBadge
                            level={order.priorityLevel}
                          />
                        </div>

                        {isActiveStatus(order.status) &&
                          typeof order.slaHoursRemaining ===
                            "number" && (
                            <div
                              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                                slaRisk
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              <Clock className="h-3.5 w-3.5" />

                              {slaRisk
                                ? "SLA Risk"
                                : `${order.slaHoursRemaining}h left`}
                            </div>
                          )}
                      </div>

                      {/* TITLE */}
                      <h3 className="text-lg font-bold tracking-tight">
                        {order.complaintTitle}
                      </h3>

                      {/* LOCATION */}
                      <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />

                        <span className="line-clamp-2">
                          {order.location?.address ||
                            "Location unavailable"}
                        </span>
                      </div>

                      {/* METADATA */}
                      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-4 w-4" />

                          <span>
                            Assigned:{" "}
                            {order.assignedAt
                              ? new Date(
                                  order.assignedAt
                                ).toLocaleDateString()
                              : "—"}
                          </span>
                        </div>

                        <div className="text-muted-foreground">
                          Complaint:{" "}
                          <span className="font-mono text-xs text-foreground">
                            {order.complaintId}
                          </span>
                        </div>

                        <div className="text-muted-foreground">
                          Score:{" "}
                          <span className="font-semibold text-foreground">
                            {order.priorityScore ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ACTION PANEL */}
                    <div className="flex items-center border-t bg-muted/20 p-5 lg:w-52 lg:border-l lg:border-t-0">
                      <Link
                        href={`/officer/work-orders/${order.id}`}
                        className="w-full"
                      >
                        <Button
                          className="h-11 w-full"
                          variant={
                            order.status === "assigned"
                              ? "default"
                              : "outline"
                          }
                        >
                          {getActionLabel(order.status)}

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
  );
}