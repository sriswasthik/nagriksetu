"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";

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
import { getStatusMeta, getToneClasses } from "@/lib/design/status";
import { getMyComplaints } from "@/lib/services/complaints";
import { isNotSignedIn } from "@/lib/services/errors";
import type { Complaint } from "@/types/complaint";

/**
 * Header notification tray.
 *
 * Shows real status changes on the citizen's own reports. The
 * previous implementation rendered three hard-coded fake
 * notifications referencing complaint numbers that did not exist,
 * which is misleading in a civic product — this reads the actual
 * complaints instead.
 *
 * Statuses that genuinely need the user to act are counted as
 * "needs attention" and drive the badge.
 */
const ATTENTION_STATUSES = ["citizen_confirmation", "reopened", "resolved"];

export function NotificationPanel() {
  const pathname = usePathname();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Only the citizen workspace has a per-user report feed to show.
  const isCitizen = pathname.startsWith("/citizen");

  useEffect(() => {
    if (!isCitizen) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await getMyComplaints();
        if (!cancelled) setComplaints(data);
      } catch (error) {
        /*
         * A failed tray fetch must never break the header.
         *
         * Being signed out is not a failure, and is expected here: the
         * header renders before the session is established, and on a
         * /citizen URL that has redirected to sign-in. It used to log
         * "AuthSessionMissingError: Auth session missing!" with a stack
         * trace on every such render.
         */
        if (!isNotSignedIn(error)) {
          console.error("Failed to load notifications", error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCitizen, pathname]);

  const recent = [...complaints]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 6);

  const attentionCount = complaints.filter((c) =>
    ATTENTION_STATUSES.includes(c.status)
  ).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            attentionCount > 0
              ? `Notifications, ${attentionCount} needing attention`
              : "Notifications"
          }
        >
          <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {attentionCount > 0 && (
            <span
              aria-hidden="true"
              className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold text-primary-foreground"
            >
              {attentionCount > 9 ? "9+" : attentionCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:w-[400px] sm:max-w-md"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <Bell
                className="h-9 w-9 text-muted-foreground opacity-30"
                aria-hidden="true"
              />
              <p className="mt-3.5 text-sm font-medium text-foreground">
                No updates yet
              </p>
              <p className="mt-1 max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
                {isCitizen
                  ? "Updates on your reports will appear here."
                  : "Report updates appear in your workspace."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((complaint) => {
                const meta = getStatusMeta(complaint.status);
                const tone = getToneClasses(meta.tone);
                const Icon = meta.icon;
                const needsAttention = ATTENTION_STATUSES.includes(
                  complaint.status
                );

                return (
                  <li key={complaint.id}>
                    <Link
                      href={`/citizen/complaints/${complaint.id}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        needsAttention && "bg-primary/[0.04]"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                          tone.badge
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {meta.label}
                          </p>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {formatRelativeTime(complaint.updated_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {complaint.title}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {isCitizen && (
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
