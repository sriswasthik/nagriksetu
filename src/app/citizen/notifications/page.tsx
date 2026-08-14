"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { cn, formatRelativeTime } from "@/lib/utils";
import { getStatusMeta, getToneClasses } from "@/lib/design/status";
import { getMyComplaints } from "@/lib/services/complaints";
import type { Complaint } from "@/types/complaint";

/**
 * ============================================================
 * NOTIFICATIONS
 * ============================================================
 *
 * Derived from the citizen's real complaints rather than a mock
 * feed: each report's current status is a genuine, verifiable
 * update. There is no notifications table in the schema yet, so
 * inventing a stream of fake events would show the user things that
 * never happened.
 *
 * "Read" state is local to the session for the same reason — there is
 * nowhere to persist it. It is presented as grouping, not as a
 * synced inbox.
 */

/** Statuses worth telling the citizen about, most urgent first. */
const NOTIFY_PRIORITY: Record<string, number> = {
  citizen_confirmation: 0,
  resolved: 1,
  reopened: 2,
  in_progress: 3,
  supervisor_review: 4,
  proof_submitted: 5,
  assigned: 6,
  accepted: 7,
  ai_analyzed: 8,
  rejected: 9,
  submitted: 10,
};

export default function CitizenNotificationsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setComplaints(await getMyComplaints());
    } catch (loadError) {
      console.error("Failed to load notifications:", loadError);
      setError(
        "We couldn't load your updates just now. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updates = useMemo(() => {
    return [...complaints].sort((a, b) => {
      const priorityDelta =
        (NOTIFY_PRIORITY[a.status] ?? 99) - (NOTIFY_PRIORITY[b.status] ?? 99);
      if (priorityDelta !== 0) return priorityDelta;

      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
  }, [complaints]);

  const unreadCount = updates.filter((u) => !dismissed.has(u.id)).length;

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="The latest status on everything you have reported."
        action={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              onClick={() => setDismissed(new Set(updates.map((u) => u.id)))}
            >
              <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      {error && (
        <ErrorState
          title="Unable to load updates"
          description={error}
          onRetry={load}
          className="mb-6"
        />
      )}

      {!error && updates.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No updates yet"
          description="Once you report an issue, its progress updates will show up here — from triage through to a verified repair."
          action={
            <Button asChild>
              <Link href="/citizen/report">Report an issue</Link>
            </Button>
          }
        />
      ) : (
        !error && (
          <ul className="space-y-3">
            {updates.map((complaint) => {
              const meta = getStatusMeta(complaint.status);
              const tone = getToneClasses(meta.tone);
              const Icon = meta.icon;
              const isRead = dismissed.has(complaint.id);

              return (
                <li key={complaint.id}>
                  <Link
                    href={`/citizen/complaints/${complaint.id}`}
                    onClick={() =>
                      setDismissed((current) =>
                        new Set(current).add(complaint.id)
                      )
                    }
                    className={cn(
                      "group flex gap-4 rounded-lg border p-4 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isRead
                        ? "bg-card hover:border-primary/40"
                        : "border-primary/25 bg-primary/[0.04] hover:border-primary/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                        tone.badge
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {meta.label}
                        </p>
                        {!isRead && (
                          <span className="sr-only">Unread update</span>
                        )}
                        {!isRead && (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                          />
                        )}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(complaint.updated_at)}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-sm text-foreground">
                        {complaint.title}
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {meta.description}
                      </p>

                      <p className="mt-1.5 font-mono text-xs text-muted-foreground/80">
                        {complaint.complaint_number}
                      </p>
                    </div>

                    <ChevronRight
                      className="mt-1 h-4 w-4 shrink-0 self-start text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
