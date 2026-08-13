"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  PageHeader,
} from "@/components/shared/PageHeader";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import {
  Button,
} from "@/components/ui/button";

import {
  Input,
} from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Badge,
} from "@/components/ui/badge";

import {
  getMyComplaints,
} from "@/lib/services/complaints";

import type {
  Complaint,
} from "@/types/complaint";

import {
  StatusBadge,
} from "@/components/shared/StatusBadge";

import {
  PriorityBadge,
} from "@/components/shared/PriorityBadge";

import {
  formatRelativeTime,
} from "@/lib/utils";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Filter,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";


/*
 * ============================================================
 * STATUS FILTER TYPE
 * ============================================================
 */

type StatusFilter =
  | "all"
  | "submitted"
  | "in_progress"
  | "citizen_confirmation"
  | "resolved"
  | "reopened";


/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function CitizenComplaintsList() {

  /*
   * ----------------------------------------------------------
   * STATE
   * ----------------------------------------------------------
   */

  const [
    complaints,
    setComplaints,
  ] = useState<Complaint[]>([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<StatusFilter>("all");


  /*
   * ==========================================================
   * LOAD COMPLAINTS
   * ==========================================================
   */

  const loadComplaints =
    useCallback(
      async (
        showInitialLoader = true
      ) => {

        if (showInitialLoader) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        try {
          const data =
            await getMyComplaints();

          setComplaints(data);
        } catch (loadError) {

          console.error(
            "Failed to load complaints:",
            loadError
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load your complaints. Please try again."
          );
        } finally {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      },
      []
    );


  /*
   * ==========================================================
   * INITIAL LOAD
   * ==========================================================
   */

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);


  /*
   * ==========================================================
   * FILTER COMPLAINTS
   * ==========================================================
   */

  const filteredComplaints =
    useMemo(() => {

      const query =
        searchQuery
          .trim()
          .toLowerCase();

      return complaints.filter(
        (complaint) => {

          /*
           * -----------------------------------------------
           * SEARCH
           * -----------------------------------------------
           */

          const matchesSearch =
            !query ||
            complaint.title
              .toLowerCase()
              .includes(query) ||

            complaint.id
              .toLowerCase()
              .includes(query) ||

            (
              complaint.complaint_number ??
              ""
            )
              .toLowerCase()
              .includes(query) ||

            (
              complaint.description ??
              ""
            )
              .toLowerCase()
              .includes(query) ||

            (
              complaint.address ??
              ""
            )
              .toLowerCase()
              .includes(query) ||

            (
              complaint.category ??
              ""
            )
              .toLowerCase()
              .includes(query);


          /*
           * -----------------------------------------------
           * STATUS
           * -----------------------------------------------
           */

          const matchesStatus =
            statusFilter === "all" ||
            complaint.status ===
              statusFilter;


          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      complaints,
      searchQuery,
      statusFilter,
    ]);


  /*
   * ==========================================================
   * CLEAR FILTERS
   * ==========================================================
   */

  const clearFilters =
    () => {
      setSearchQuery("");
      setStatusFilter("all");
    };


  /*
   * ==========================================================
   * ACTIVE FILTER CHECK
   * ==========================================================
   */

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all";


  /*
   * ==========================================================
   * STATUS COUNTS
   * ==========================================================
   */

  const statusCounts =
    useMemo(() => {

      return {
        all: complaints.length,

        submitted:
          complaints.filter(
            (complaint) =>
              complaint.status ===
              "submitted"
          ).length,

        in_progress:
          complaints.filter(
            (complaint) =>
              complaint.status ===
              "in_progress"
          ).length,

        citizen_confirmation:
          complaints.filter(
            (complaint) =>
              complaint.status ===
              "citizen_confirmation"
          ).length,

        resolved:
          complaints.filter(
            (complaint) =>
              complaint.status ===
              "resolved"
          ).length,

        reopened:
          complaints.filter(
            (complaint) =>
              complaint.status ===
              "reopened"
          ).length,
      };
    }, [
      complaints,
    ]);


  /*
   * ==========================================================
   * LOADING STATE
   * ==========================================================
   */

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />

          <p className="text-sm text-muted-foreground">
            Loading your complaints...
          </p>
        </div>
      </div>
    );
  }


  /*
   * ==========================================================
   * MAIN UI
   * ==========================================================
   */

  return (
    <div className="space-y-6">

      {/* ======================================================
          PAGE HEADER
      ======================================================= */}

      <PageHeader
        title="My Reports"
        description="View and track the status of all your submitted civic issues."
        action={
          <Link href="/citizen/report">
            <Button>
              <Plus className="mr-2 h-4 w-4" />

              Report New Issue
            </Button>
          </Link>
        }
      />


      {/* ======================================================
          ERROR
      ======================================================= */}

      {error && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

              <div>
                <p className="font-medium text-destructive">
                  Unable to load complaints
                </p>

                <p className="mt-1 text-sm text-destructive/80">
                  {error}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() =>
                loadComplaints()
              }
            >
              Try Again
            </Button>

          </CardContent>
        </Card>
      )}


      {/* ======================================================
          SUMMARY
      ======================================================= */}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

        {/* TOTAL */}

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-2xl font-bold">
                {statusCounts.all}
              </p>

              <p className="text-xs text-muted-foreground">
                Total Reports
              </p>
            </div>
          </CardContent>
        </Card>


        {/* SUBMITTED */}

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock3 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-2xl font-bold">
                {statusCounts.submitted}
              </p>

              <p className="text-xs text-muted-foreground">
                Submitted
              </p>
            </div>
          </CardContent>
        </Card>


        {/* IN PROGRESS */}

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <RefreshCw className="h-5 w-5" />
            </div>

            <div>
              <p className="text-2xl font-bold">
                {statusCounts.in_progress}
              </p>

              <p className="text-xs text-muted-foreground">
                In Progress
              </p>
            </div>
          </CardContent>
        </Card>


        {/* RESOLVED */}

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-2xl font-bold">
                {statusCounts.resolved}
              </p>

              <p className="text-xs text-muted-foreground">
                Resolved
              </p>
            </div>
          </CardContent>
        </Card>

      </div>


      {/* ======================================================
          SEARCH + FILTER
      ======================================================= */}

      <Card>
        <CardContent className="p-4">

          <div className="flex flex-col gap-4 lg:flex-row">

            {/* SEARCH */}

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={
                  searchQuery
                }
                onChange={(event) =>
                  setSearchQuery(
                    event.target.value
                  )
                }
                placeholder="Search by complaint ID, title, category, description, or location..."
                className="pl-9 pr-9"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() =>
                    setSearchQuery("")
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>


            {/* STATUS */}

            <div className="flex w-full items-center gap-2 lg:w-64">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />

              <Select
                value={
                  statusFilter
                }
                onValueChange={(
                  value
                ) =>
                  setStatusFilter(
                    value as StatusFilter
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    All Statuses ({statusCounts.all})
                  </SelectItem>

                  <SelectItem value="submitted">
                    Submitted ({statusCounts.submitted})
                  </SelectItem>

                  <SelectItem value="in_progress">
                    In Progress ({statusCounts.in_progress})
                  </SelectItem>

                  <SelectItem value="citizen_confirmation">
                    Needs Confirmation (
                    {
                      statusCounts.citizen_confirmation
                    }
                    )
                  </SelectItem>

                  <SelectItem value="resolved">
                    Resolved ({statusCounts.resolved})
                  </SelectItem>

                  <SelectItem value="reopened">
                    Reopened ({statusCounts.reopened})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>


            {/* REFRESH */}

            <Button
              variant="outline"
              onClick={() =>
                loadComplaints(false)
              }
              disabled={
                isRefreshing
              }
              className="lg:w-auto"
            >
              {isRefreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}

              Refresh
            </Button>

          </div>


          {/* ACTIVE FILTER SUMMARY */}

          {hasActiveFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">

              <span className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {filteredComplaints.length}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {complaints.length}
                </span>{" "}
                complaints
              </span>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={
                  clearFilters
                }
              >
                Clear Filters
              </Button>

            </div>
          )}

        </CardContent>
      </Card>


      {/* ======================================================
          NO COMPLAINTS AT ALL
      ======================================================= */}

      {!error &&
        complaints.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">

              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="h-7 w-7" />
              </div>

              <h3 className="text-lg font-semibold">
                No reports yet
              </h3>

              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                You haven&apos;t reported any civic issues
                yet. Report an issue in your area to get
                started.
              </p>

              <Link
                href="/citizen/report"
                className="mt-5"
              >
                <Button>
                  <Plus className="mr-2 h-4 w-4" />

                  Report Your First Issue
                </Button>
              </Link>

            </CardContent>
          </Card>
        )}


      {/* ======================================================
          FILTERED EMPTY STATE
      ======================================================= */}

      {!error &&
        complaints.length > 0 &&
        filteredComplaints.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">

              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Search className="h-6 w-6" />
              </div>

              <h3 className="text-lg font-semibold">
                No complaints found
              </h3>

              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                No complaint matches your current
                search or status filter.
              </p>

              <Button
                variant="outline"
                className="mt-5"
                onClick={
                  clearFilters
                }
              >
                Clear Filters
              </Button>

            </CardContent>
          </Card>
        )}


      {/* ======================================================
          COMPLAINT LIST
      ======================================================= */}

      {!error &&
        filteredComplaints.length > 0 && (
          <div className="space-y-4">

            {filteredComplaints.map(
              (complaint) => {

                const categoryLabel =
                  complaint.category
                    ? complaint.category
                        .replace(
                          /_/g,
                          " "
                        )
                        .replace(
                          /\b\w/g,
                          (letter) =>
                            letter.toUpperCase()
                        )
                    : "Other";

                return (
                  <Card
                    key={
                      complaint.id
                    }
                    className="overflow-hidden transition-colors hover:border-primary/50"
                  >

                    <div className="flex flex-col md:flex-row">

                      {/* ==================================================
                          MAIN INFORMATION
                      ================================================== */}

                      <div className="min-w-0 flex-1 p-5">

                        {/* TOP ROW */}

                        <div className="flex flex-wrap items-center gap-2">

                          <span className="font-mono text-xs font-medium text-muted-foreground">
                            {complaint.complaint_number ||
                              complaint.id}
                          </span>

                          <StatusBadge
                            status={
                              complaint.status
                            }
                          />

                          {complaint.priority_level && (
                            <PriorityBadge
                              level={
                                complaint.priority_level
                              }
                            />
                          )}

                          <span className="text-xs text-muted-foreground md:ml-auto">
                            {formatRelativeTime(
                              complaint.updated_at
                            )}
                          </span>

                        </div>


                        {/* TITLE */}

                        <h2 className="mt-3 text-lg font-semibold leading-tight">
                          {complaint.title}
                        </h2>


                        {/* DESCRIPTION */}

                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {complaint.description}
                        </p>


                        {/* METADATA */}

                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">

                          {/* LOCATION */}

                          <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />

                            <span className="max-w-[280px] truncate">
                              {complaint.address ||
                                "Location not specified"}
                            </span>
                          </div>


                          {/* CATEGORY */}

                          <Badge
                            variant="outline"
                            className="font-normal"
                          >
                            {categoryLabel}
                          </Badge>


                          {/* DATE */}

                          <span className="text-xs text-muted-foreground">
                            Updated{" "}
                            {formatRelativeTime(
                              complaint.updated_at
                            )}
                          </span>

                        </div>

                      </div>


                      {/* ==================================================
                          ACTIONS
                      ================================================== */}

                      <div className="flex flex-row items-center gap-2 border-t bg-muted/20 p-4 md:w-52 md:flex-col md:justify-center md:border-l md:border-t-0">

                        <Link
                          href={`/citizen/complaints/${complaint.id}`}
                          className="w-full"
                        >
                          <Button
                            variant="outline"
                            className="w-full"
                          >
                            View Details
                          </Button>
                        </Link>


                        {complaint.status ===
                          "citizen_confirmation" && (
                          <Link
                            href={`/citizen/complaints/${complaint.id}`}
                            className="w-full"
                          >
                            <Button className="w-full">
                              Confirm Fix
                            </Button>
                          </Link>
                        )}

                      </div>

                    </div>

                  </Card>
                );
              }
            )}

          </div>
        )}

    </div>
  );
}