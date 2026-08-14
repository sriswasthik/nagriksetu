import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * ============================================================
 * LAYOUT-MATCHED SKELETONS
 * ============================================================
 *
 * Each skeleton mirrors the real component's structure closely so
 * content does not jump when it arrives. Prefer these over
 * centred spinners for anything that renders a known layout.
 */

/** Mirrors PageHeader: title, description, optional action. */
export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      {withAction && <Skeleton className="h-10 w-40 rounded-md" />}
    </div>
  );
}

/** Mirrors StatCard. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <Skeleton className="mt-4 h-8 w-16" />
      <Skeleton className="mt-2.5 h-3 w-32" />
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Mirrors the IssueCard row used in complaint / work-order lists. */
export function IssueCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col md:flex-row">
        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-3.5 h-5 w-2/3" />
          <SkeletonText lines={2} className="mt-3" />
          <div className="mt-4 flex flex-wrap gap-4">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="border-t bg-muted/20 p-4 md:w-52 md:border-l md:border-t-0">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function IssueListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <IssueCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Mirrors a chart card: header + plot area + legend row. */
export function ChartSkeleton({
  className,
  height = "h-[300px]",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-1.5 h-3.5 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className={cn("w-full rounded-md", height)} />
        <div className="mt-4 flex gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Mirrors the vertical tracking timeline. */
export function TimelineSkeleton({ steps = 4 }: { steps?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: steps }).map((_, index) => (
        <div key={index} className="relative flex gap-4">
          {index < steps - 1 && (
            <div className="absolute left-[19px] top-11 h-[calc(100%-20px)] w-px bg-border" />
          )}
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pb-8 pt-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the admin issue table. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b px-4 py-4 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Mirrors the map surface plus its side panel. */
export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <Skeleton className="h-[420px] w-full rounded-none" />
    </div>
  );
}
