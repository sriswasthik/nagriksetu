import Link from "next/link";
import { ArrowRight, ImageIcon, MapPin } from "lucide-react";

import { cn, formatRelativeTime } from "@/lib/utils";
import { formatCategory } from "@/lib/design/status";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { Button } from "@/components/ui/button";
import type { Complaint } from "@/types/complaint";

interface IssueCardProps {
  complaint: Complaint;
  /** Where "View details" points. */
  href: string;
  /** Extra action rendered beside the primary one. */
  action?: React.ReactNode;
  /** Compact variant for dashboard grids. */
  compact?: boolean;
  className?: string;
}

/**
 * Canonical issue summary row.
 *
 * One component behind the citizen dashboard, the "My Issues" list
 * and the authority queue, so an issue reads identically wherever
 * it is listed. Previously each page re-implemented this markup.
 */
export function IssueCard({
  complaint,
  href,
  action,
  compact = false,
  className,
}: IssueCardProps) {
  const needsAttention = complaint.status === "citizen_confirmation";

  if (compact) {
    return (
      <Link
        href={href}
        className={cn(
          "group flex flex-col rounded-lg border bg-card p-4 transition-all",
          "hover:border-primary/40 hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {complaint.complaint_number || complaint.id.slice(0, 8)}
          </span>
          <StatusBadge status={complaint.status} size="sm" />
        </div>

        <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {complaint.title}
        </h3>

        {complaint.address && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{complaint.address}</span>
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(complaint.updated_at)}
          </span>
          <ArrowRight
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden="true"
          />
        </div>
      </Link>
    );
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40",
        // A report waiting on the citizen gets a subtle left accent.
        needsAttention && "border-l-[3px] border-l-sky-500",
        className
      )}
    >
      <div className="flex flex-col md:flex-row">
        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {complaint.complaint_number || complaint.id.slice(0, 8)}
            </span>

            <StatusBadge status={complaint.status} />

            {complaint.priority_level && (
              <PriorityBadge level={complaint.priority_level} />
            )}

            <span className="text-xs text-muted-foreground md:ml-auto">
              Updated {formatRelativeTime(complaint.updated_at)}
            </span>
          </div>

          <h3 className="mt-3 text-base font-semibold leading-snug text-foreground sm:text-lg">
            <Link
              href={href}
              className="rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {complaint.title}
            </Link>
          </h3>

          {complaint.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {complaint.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[18rem] truncate">
                {complaint.address || "Location not specified"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {formatCategory(complaint.category)}
            </span>
          </div>
        </div>

        <div className="flex flex-row items-center gap-2 border-t bg-muted/25 p-4 md:w-52 md:flex-col md:justify-center md:border-l md:border-t-0">
          {needsAttention ? (
            <>
              <Button asChild className="w-full">
                <Link href={href}>Confirm fix</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href={href}>Details</Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link href={href}>View details</Link>
            </Button>
          )}
          {action}
        </div>
      </div>
    </article>
  );
}
