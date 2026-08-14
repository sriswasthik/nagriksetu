"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, PlusCircle, RefreshCw, Search, X } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { IssueCard } from "@/components/shared/IssueCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { IssueListSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyComplaints } from "@/lib/services/complaints";
import type { Complaint, ComplaintStatus } from "@/types/complaint";

/**
 * Filter groups map to real complaint statuses. "Open" collapses
 * every in-flight status so the default view answers "what is still
 * outstanding?" without the user learning the workflow vocabulary.
 */
const OPEN_STATUSES: ComplaintStatus[] = [
  "submitted",
  "ai_analyzed",
  "assigned",
  "accepted",
  "in_progress",
  "proof_submitted",
  "supervisor_review",
  "reopened",
];

type FilterKey = "all" | "open" | "citizen_confirmation" | "resolved" | "rejected";

const MATCHERS: Record<FilterKey, (c: Complaint) => boolean> = {
  all: () => true,
  open: (c) => OPEN_STATUSES.includes(c.status),
  citizen_confirmation: (c) => c.status === "citizen_confirmation",
  resolved: (c) => c.status === "resolved",
  rejected: (c) => c.status === "rejected",
};

export default function CitizenComplaintsList() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const loadComplaints = useCallback(
    async (showInitialLoader = true) => {
      if (showInitialLoader) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError(null);

      try {
        const data = await getMyComplaints();
        setComplaints(data);
      } catch (loadError) {
        console.error("Failed to load complaints:", loadError);
        setError(
          "We couldn't load your reports just now. Please check your connection and try again."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const counts = useMemo(() => {
    return {
      all: complaints.length,
      open: complaints.filter(MATCHERS.open).length,
      citizen_confirmation: complaints.filter(MATCHERS.citizen_confirmation).length,
      resolved: complaints.filter(MATCHERS.resolved).length,
      rejected: complaints.filter(MATCHERS.rejected).length,
    };
  }, [complaints]);

  const filterOptions: FilterOption<FilterKey>[] = useMemo(
    () => [
      { value: "all", label: "All", count: counts.all },
      { value: "open", label: "Open", count: counts.open },
      {
        value: "citizen_confirmation",
        label: "Needs your input",
        count: counts.citizen_confirmation,
        tone: "attention",
      },
      { value: "resolved", label: "Resolved", count: counts.resolved },
      // Only offer "rejected" if the user actually has any.
      ...(counts.rejected > 0
        ? [{ value: "rejected" as FilterKey, label: "Rejected", count: counts.rejected }]
        : []),
    ],
    [counts]
  );

  const filteredComplaints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return complaints.filter((complaint) => {
      if (!MATCHERS[filter](complaint)) return false;
      if (!query) return true;

      return [
        complaint.title,
        complaint.complaint_number,
        complaint.description,
        complaint.address,
        complaint.category,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    });
  }, [complaints, filter, searchQuery]);

  const hasActiveFilters = searchQuery.trim().length > 0 || filter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setFilter("all");
  }

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton />
        <IssueListSkeleton count={3} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Issues"
        description="Everything you have reported, and where each report has got to."
        action={
          <>
            <Button
              variant="outline"
              onClick={() => loadComplaints(false)}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              Refresh
            </Button>

            <Button asChild>
              <Link href="/citizen/report">
                <PlusCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                Report an Issue
              </Link>
            </Button>
          </>
        }
      />

      {error && (
        <ErrorState
          title="Unable to load your reports"
          description={error}
          onRetry={() => loadComplaints()}
          className="mb-6"
        />
      )}

      {/* Nothing reported at all — skip filters entirely. */}
      {!error && complaints.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="When you spot a civic issue — a pothole, a broken streetlight, an overflowing drain — report it here and track its progress from submission to resolution."
          action={
            <Button asChild>
              <Link href="/citizen/report">Report your first issue</Link>
            </Button>
          }
        />
      ) : (
        !error && (
          <>
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
                  placeholder="Search by ID, title, location…"
                  aria-label="Search your reports"
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
                label="Filter reports by status"
              />
            </div>

            {/* ---------- Results ---------- */}
            <div
              aria-live="polite"
              aria-atomic="true"
              className="mb-4 text-sm text-muted-foreground"
            >
              {hasActiveFilters ? (
                <span className="flex flex-wrap items-center gap-2">
                  Showing{" "}
                  <strong className="font-semibold text-foreground">
                    {filteredComplaints.length}
                  </strong>{" "}
                  of {complaints.length} reports
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </span>
              ) : (
                <span>
                  {complaints.length}{" "}
                  {complaints.length === 1 ? "report" : "reports"}
                </span>
              )}
            </div>

            {filteredComplaints.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching reports"
                description="No report matches your current search or filter. Try a different term, or clear the filters to see everything."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {filteredComplaints.map((complaint) => (
                  <IssueCard
                    key={complaint.id}
                    complaint={complaint}
                    href={`/citizen/complaints/${complaint.id}`}
                  />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
