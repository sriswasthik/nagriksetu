"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeTime } from "@/lib/utils";
import { NOTIFICATION_TONE, getToneClasses } from "@/lib/design/status";
import {
  isNotSignedIn,
  notificationHref,
  notificationService,
} from "@/lib/services/notifications";
import {
  ACTIONABLE_NOTIFICATIONS,
  type NotificationItem,
} from "@/types/notification";

/**
 * ============================================================
 * HEADER NOTIFICATION TRAY
 * ============================================================
 *
 * Reads public.notifications, which database triggers now write one row
 * to per real lifecycle event.
 *
 * What that changes. This used to fetch the citizen's complaints and
 * render one entry per report showing its current status — real data, but
 * state rather than events, so a report that was assigned, worked and
 * resolved produced a single entry overwritten each time. And it returned
 * early on any non-citizen route, so an officer's tray was permanently
 * empty even when a job had just been assigned to them.
 *
 * REFRESH, NOT REALTIME
 *
 * Supabase realtime is in config.toml because it is in the default
 * config; nothing in this codebase subscribes to anything and no
 * migration adds a publication. A subscription layer for a tray would be
 * more machinery than the feature justifies, so refresh is explicit and
 * covers the moments a person notices: on mount, when the tray opens,
 * and when the tab regains focus after being away.
 */

/** Which workspace's links this tray should produce. */
function workspaceFor(pathname: string): "citizen" | "officer" | null {
  if (pathname.startsWith("/citizen")) return "citizen";
  // Supervisors and administrators reach work orders through the officer
  // workspace, so their notifications link there too.
  if (pathname.startsWith("/officer") || pathname.startsWith("/government")) {
    return "officer";
  }
  return null;
}

export function NotificationPanel() {
  const pathname = usePathname();
  const workspace = workspaceFor(pathname);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) {
      setIsLoading(false);
      return;
    }

    try {
      /*
       * The count comes from its own aggregate rather than from the list,
       * because the list is capped: counting the fetched rows would cap
       * the badge at the tray's page size and quietly under-report.
       */
      const [recent, count] = await Promise.all([
        notificationService.listRecent(),
        notificationService.unreadCount(),
      ]);

      setNotifications(recent);
      setUnread(count);
    } catch (error) {
      /*
       * A failed tray fetch must never break the header.
       *
       * Being signed out is not a failure and is expected here: the header
       * renders before the session is established, and on a protected URL
       * that is mid-redirect to sign-in.
       */
      if (!isNotSignedIn(error)) {
        console.error("Failed to load notifications", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Refresh when the tab comes back. Someone who left the page open over
   * lunch and returns to a stale badge is the case this covers, and it
   * costs one small query per return rather than a persistent connection.
   */
  useEffect(() => {
    if (!workspace) return;

    function onVisible() {
      if (document.visibilityState === "visible") load();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [workspace, load]);

  /** Opening the tray is the clearest signal that now is the moment. */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) load();
  }

  async function markAllRead() {
    // Optimistic, then reconciled: the badge should clear on the click
    // rather than after a round trip, but the server's answer wins.
    setUnread(0);
    setNotifications((current) =>
      current.map((item) => ({ ...item, isRead: true }))
    );

    try {
      await notificationService.markAllRead();
    } catch (error) {
      console.error("Failed to mark notifications read", error);
    } finally {
      load();
    }
  }

  async function markOneRead(id: string) {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isRead: true } : item
      )
    );
    setUnread((current) => Math.max(0, current - 1));

    try {
      await notificationService.markRead([id]);
    } catch (error) {
      console.error("Failed to mark notification read", error);
      load();
    }
  }

  /*
   * The badge counts what is waiting on the reader, not everything
   * unread. A badge that lights up for "your report has been triaged"
   * teaches people to ignore it.
   */
  const actionable = notifications.filter(
    (item) => !item.isRead && ACTIONABLE_NOTIFICATIONS.includes(item.type)
  ).length;

  const badgeCount = actionable > 0 ? actionable : unread;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            badgeCount > 0
              ? `Notifications, ${badgeCount} unread`
              : "Notifications"
          }
        >
          <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {badgeCount > 0 && (
            <span
              aria-hidden="true"
              className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold text-primary-foreground"
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:w-[400px] sm:max-w-md"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-4 text-left">
          <SheetTitle>Notifications</SheetTitle>

          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              className="shrink-0"
            >
              <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <Bell
                className="h-9 w-9 text-muted-foreground opacity-30"
                aria-hidden="true"
              />
              <p className="mt-3.5 text-sm font-medium text-foreground">
                No updates yet
              </p>
              <p className="mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
                {workspace === "citizen"
                  ? "Updates on your reports will appear here."
                  : "Assignments and work-order updates will appear here."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((item) => {
                const tone = getToneClasses(NOTIFICATION_TONE[item.type]);
                const href = workspace
                  ? notificationHref(item, workspace)
                  : null;

                const body = (
                  <>
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                        tone.badge
                      )}
                    >
                      {!item.isRead ? (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full bg-current"
                        />
                      ) : (
                        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            "truncate text-sm",
                            item.isRead
                              ? "font-medium text-foreground"
                              : "font-semibold text-foreground"
                          )}
                        >
                          {item.title}
                        </p>
                        {!item.isRead && (
                          <span className="sr-only">Unread</span>
                        )}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.message}
                      </p>
                    </div>
                  </>
                );

                const shared = cn(
                  "flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  !item.isRead && "bg-primary/[0.04]"
                );

                return (
                  <li key={item.id}>
                    {/*
                      A notification whose target the reader cannot reach —
                      an officer-facing row seen from the citizen
                      workspace — is still worth showing, so it renders as
                      a button that marks it read rather than as a dead
                      link.
                    */}
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => {
                          if (!item.isRead) markOneRead(item.id);
                          setOpen(false);
                        }}
                        className={shared}
                      >
                        {body}
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
          )}
        </div>

        {workspace === "citizen" && (
          <div className="border-t p-3">
            <Button asChild variant="ghost" className="w-full justify-between">
              <Link
                href="/citizen/notifications"
                onClick={() => setOpen(false)}
              >
                View all notifications
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
