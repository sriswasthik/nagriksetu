"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3X3 } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterChips, type FilterOption } from "@/components/shared/FilterChips";
import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { analyticsService } from "@/lib/services/analytics";
import type { WardHealth } from "@/types/analytics";

const HEALTH_VARIANT = {
  good: "success",
  moderate: "warning",
  poor: "destructive",
  critical: "critical",
} as const;

type WardFilter = "all" | "needs_attention" | "healthy";

/**
 * Ward-level health. Sorted worst-first by default, because the point
 * of the page is deciding where to intervene.
 */
export default function GovernmentWardsPage() {
  const [wards, setWards] = useState<WardHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WardFilter>("all");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setWards(await analyticsService.getWardHealth());
    } catch (loadError) {
      console.error("Failed to load wards", loadError);
      setError("We couldn't load ward health data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: wards.length,
      needs_attention: wards.filter((w) =>
        ["poor", "critical"].includes(w.healthScore)
      ).length,
      healthy: wards.filter((w) => w.healthScore === "good").length,
    }),
    [wards]
  );

  const visible = useMemo(() => {
    const filtered = wards.filter((ward) => {
      if (filter === "needs_attention")
        return ["poor", "critical"].includes(ward.healthScore);
      if (filter === "healthy") return ward.healthScore === "good";
      return true;
    });

    return filtered.sort((a, b) => a.slaCompliance - b.slaCompliance);
  }, [wards, filter]);

  const filterOptions: FilterOption<WardFilter>[] = [
    { value: "all", label: "All wards", count: counts.all },
    {
      value: "needs_attention",
      label: "Needs attention",
      count: counts.needs_attention,
      tone: "attention",
    },
    { value: "healthy", label: "Healthy", count: counts.healthy },
  ];

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Wards" />
        <ErrorState
          variant="panel"
          title="Ward data unavailable"
          description={error}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Wards"
        description="Ward-level service health, lowest compliance first."
      />

      <div className="mb-6">
        <FilterChips
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          label="Filter wards by health"
        />
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((ward) => (
          <li key={ward.ward} className="rounded-lg border bg-card p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                <Grid3X3
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{ward.ward}</span>
              </h2>
              <Badge
                variant={HEALTH_VARIANT[ward.healthScore]}
                className="shrink-0 capitalize"
              >
                {ward.healthScore}
              </Badge>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Open</dt>
                <dd className="tabular mt-0.5 text-lg font-bold text-foreground">
                  {ward.openComplaints}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Critical</dt>
                <dd
                  className={
                    ward.critical > 0
                      ? "tabular mt-0.5 text-lg font-bold text-destructive"
                      : "tabular mt-0.5 text-lg font-bold text-foreground"
                  }
                >
                  {ward.critical}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Avg time</dt>
                <dd className="tabular mt-0.5 text-lg font-bold text-foreground">
                  {ward.avgResolutionHours}h
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">
                  SLA compliance
                </span>
                <span className="tabular text-xs font-semibold text-foreground">
                  {ward.slaCompliance}%
                </span>
              </div>
              <Progress
                value={ward.slaCompliance}
                className="mt-1.5 h-1.5"
                aria-label={`${ward.ward} SLA compliance`}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
