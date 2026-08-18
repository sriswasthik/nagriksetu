"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Map,
  PlusCircle,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { IssueCard } from "@/components/shared/IssueCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatGridSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getMyComplaints } from "@/lib/services/complaints";
import { authService } from "@/lib/services/auth";
import { getGreeting } from "@/lib/utils";
import type { Complaint } from "@/types/complaint";

/** Statuses that mean the report is still moving through the system. */
const OPEN_STATUSES = [
  "submitted",
  "ai_analyzed",
  "assigned",
  "accepted",
  "in_progress",
  "proof_submitted",
  "supervisor_review",
  "reopened",
];

interface QuickAction {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
  /** The emphasised, filled tile. */
  primary?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/citizen/report",
    icon: PlusCircle,
    title: "Report an issue",
    body: "Photo, location, done — about a minute.",
    primary: true,
  },
  {
    href: "/citizen/complaints",
    icon: ClipboardList,
    title: "Track my issues",
    body: "See where each report has got to.",
  },
  {
    href: "/citizen/map",
    icon: Map,
    title: "Nearby issues",
    body: "What's being reported around you.",
  },
];

export default function CitizenDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [user, allComplaints] = await Promise.all([
        authService.getCurrentUser().catch(() => null),
        getMyComplaints(),
      ]);

      if (user?.name) setUserName(user.name.split(" ")[0]);
      setComplaints(allComplaints);
    } catch (loadError) {
      console.error("Failed to load dashboard data", loadError);
      setError(
        "We couldn't load your reports just now. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadDashboard]);

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton />
        <StatGridSkeleton count={4} />
        <Skeleton className="mt-10 h-6 w-40" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const activeComplaints = complaints.filter((c) =>
    OPEN_STATUSES.includes(c.status)
  );
  const awaitingConfirmation = complaints.filter(
    (c) => c.status === "citizen_confirmation"
  );
  const resolvedComplaints = complaints.filter((c) => c.status === "resolved");

  const greeting = userName ? `${getGreeting()}, ${userName}` : getGreeting();

  return (
    <div>
      <PageHeader
        title={greeting}
        description="Report civic issues in your area and follow them through to a verified repair."
        action={
          <Button asChild size="lg">
            <Link href="/citizen/report">
              <PlusCircle className="mr-1 h-4 w-4" aria-hidden="true" />
              Report an Issue
            </Link>
          </Button>
        }
      />

      {error && (
        <ErrorState
          title="Unable to load your reports"
          description={error}
          onRetry={loadDashboard}
          className="mb-8"
        />
      )}

      {/* ---------- Action required ---------- */}
      {awaitingConfirmation.length > 0 && (
        <Alert variant="info" className="mb-8">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong className="font-semibold">
                {awaitingConfirmation.length}{" "}
                {awaitingConfirmation.length === 1 ? "report" : "reports"}
              </strong>{" "}
              {awaitingConfirmation.length === 1 ? "is" : "are"} waiting for you to
              confirm the fix.
            </span>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href="/citizen/complaints">Review now</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ---------- My reports ---------- */}
      <section aria-labelledby="my-reports-heading">
        <h2 id="my-reports-heading" className="sr-only">
          Your report summary
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total reported"
            value={complaints.length}
            hint="Everything you have submitted"
            icon={FileText}
            tone="brand"
            href={complaints.length > 0 ? "/citizen/complaints" : undefined}
          />
          <StatCard
            label="In progress"
            value={activeComplaints.length}
            hint="Being triaged, assigned or worked on"
            icon={AlertTriangle}
            tone="warning"
          />
          <StatCard
            label="Needs your input"
            value={awaitingConfirmation.length}
            hint="Awaiting your confirmation"
            icon={CheckCircle2}
            tone={awaitingConfirmation.length > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Resolved"
            value={resolvedComplaints.length}
            hint="Fixed and verified"
            icon={CheckCircle2}
            tone="success"
          />
        </div>
      </section>

      {/* ---------- Quick actions ---------- */}
      <section aria-labelledby="quick-actions-heading" className="mt-10">
        <h2
          id="quick-actions-heading"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Quick actions
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={cnQuickAction(action.primary)}
            >
              <action.icon
                className={
                  action.primary
                    ? "h-5 w-5 text-primary-foreground"
                    : "h-5 w-5 text-primary"
                }
                aria-hidden="true"
              />
              <span className="mt-3 block text-sm font-semibold">
                {action.title}
              </span>
              <span
                className={
                  action.primary
                    ? "mt-1 block text-xs text-primary-foreground/75"
                    : "mt-1 block text-xs text-muted-foreground"
                }
              >
                {action.body}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/*
        Recent activity. Suppressed entirely when loading failed —
        the error panel above already explains the situation, and an
        empty section under a heading reads as a rendering fault.
      */}
      {!error && (
        <section aria-labelledby="recent-heading" className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2
              id="recent-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Recent reports
            </h2>

            {complaints.length > 3 && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/citizen/complaints">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>

          {complaints.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              headingLevel="h3"
              description="When you spot a civic issue — a pothole, a broken streetlight, an overflowing drain — report it here and track its progress from submission to resolution."
              action={
                <Button asChild>
                  <Link href="/citizen/report">Report your first issue</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {complaints.slice(0, 3).map((complaint) => (
                <IssueCard
                  key={complaint.id}
                  complaint={complaint}
                  href={`/citizen/complaints/${complaint.id}`}
                  compact
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Quick-action tile styling; the first tile is the emphasised CTA. */
function cnQuickAction(primary?: boolean) {
  const base =
    "block rounded-lg border p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return primary
    ? `${base} border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary-700 hover:shadow-md`
    : `${base} bg-card hover:border-primary/40 hover:shadow-md`;
}
