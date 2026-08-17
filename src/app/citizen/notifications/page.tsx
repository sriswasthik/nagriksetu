"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { NOTIFICATION_TONE, getToneClasses } from "@/lib/design/status";
import {
  notificationHref,
  notificationService,
} from "@/lib/services/notifications";
import type { NotificationItem } from "@/types/notification";

/**
 * ============================================================
 * NOTIFICATIONS
 * ============================================================
 *
 * The citizen's real notification feed, read from public.notifications —
 * one row per lifecycle event, written by a database trigger in the same
 * transaction as the event itself.
 *
 * WHAT THIS REPLACES
 *
 * The page previously derived a feed from the citizen's complaints: one
 * entry per report, showing its current status. Every entry was true, but
 * it was state rather than history, so a report that passed through
 * triage, assignment, work and closure produced a single entry that was
 * overwritten each time — and a citizen who had been asked to confirm a
 * repair only saw it if they happened to look before the next transition.
 *
 * Read state was a React Set, so it was lost on reload and differed
 * between tabs. The page's own comment said so. It now persists, because
 * there is a row to persist it on.
 */

type FeedFilter = "all" | "unread";

export default function CitizenNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      /*
       * The count is its own query rather than a length. The feed is
       * capped, so counting the rows on screen would cap the count — and
       * "3 unread" when there are forty is worse than no number.
       */
      const [rows, count] = await Promise.all([
        notificationService.list(),
        notificationService.unreadCount(),
      ]);

      setNotifications(rows);
      setUnread(count);
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

  /*
   * Refresh when the tab comes back rather than subscribing. Nothing in
   * this codebase uses Supabase realtime and no migration adds a
   * publication, so a subscription here would mean introducing that whole
   * layer for one page.
   */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function markAllRead() {
    setIsMarking(true);

    // Optimistic, then reconciled by the reload: the list should respond
    // to the click, but the server's answer is the one that counts.
    setNotifications((current) =>
      current.map((item) => ({ ...item, isRead: true }))
    );
    setUnread(0);

    try {
      await notificationService.markAllRead();
    } catch (markError) {
      console.error("Failed to mark all read:", markError);
    } finally {
      setIsMarking(false);
      load();
    }
  }

  async function markOneRead(id: string) {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    );
    setUnread((current) => Math.max(0, current - 1));

    try {
      await notificationService.markRead([id]);
    } catch (markError) {
      console.error("Failed to mark read:", markError);
      load();
    }
  }

  const visible = useMemo(
    () =>
      filter === "unread"
        ? notifications.filter((item) => !item.isRead)
        : notifications,
    [notifications, filter]
  );

  const filterOptions: FilterOption<FeedFilter>[] = [
    { value: "all", label: "All", count: notifications.length },
    {
      value: "unread",
      label: "Unread",
      count: notifications.filter((item) => !item.isRead).length,
      tone: "attention",
    },
  ];

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
        description={
          unread > 0
            ? `${unread} unread ${unread === 1 ? "update" : "updates"} on your reports.`
            : "Every update on everything you have reported."
        }
        action={
          unread > 0 ? (
            <Button
              variant="outline"
              onClick={markAllRead}
              disabled={isMarking}
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

      {!error && notifications.length > 0 && (
        <div className="mb-4">
          <FilterChips
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            label="Filter notifications"
          />
        </div>
      )}

      {!error && notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No updates yet"
          description="Once you report an issue, every step of its progress will show up here — from triage through to a verified repair."
          action={
            <Button asChild>
              <Link href="/citizen/report">Report an issue</Link>
            </Button>
          }
        />
      ) : !error && visible.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="Nothing unread"
          description="You are up to date on all of your reports."
        />
      ) : (
        !error && (
          <ul className="space-y-3">
            {visible.map((item) => {
              const tone = getToneClasses(NOTIFICATION_TONE[item.type]);
              const href = notificationHref(item, "citizen");

              const body = (
                <>
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                      tone.badge
                    )}
                  >
                    {item.isRead ? (
                      <Bell className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full bg-current"
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {item.title}
                      </p>
                      {!item.isRead && (
                        <>
                          <span className="sr-only">Unread update</span>
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                          />
                        </>
                      )}
                      <span
                        className="ml-auto shrink-0 text-xs text-muted-foreground"
                        title={formatDateTime(item.createdAt)}
                      >
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {item.message}
                    </p>
                  </div>
                </>
              );

              const shared = cn(
                "group flex w-full gap-4 rounded-lg border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                item.isRead
                  ? "bg-card hover:border-primary/40"
                  : "border-primary/25 bg-primary/[0.04] hover:border-primary/50"
              );

              return (
                <li key={item.id}>
                  {/*
                    A notification whose complaint has since been deleted
                    has nowhere to link. It is still a record of what the
                    citizen was told, so it renders as a button that marks
                    it read rather than vanishing or 404ing.
                  */}
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => {
                        if (!item.isRead) markOneRead(item.id);
                      }}
                      className={shared}
                    >
                      {body}
                      <ChevronRight
                        className="mt-1 h-4 w-4 shrink-0 self-start text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.isRead) markOneRead(item.id);
                      }}
                      className={shared}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
