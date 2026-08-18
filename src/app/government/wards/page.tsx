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
import {
  analyticsService,
  formatHours,
  formatPercent,
} from "@/lib/services/analytics";
import type { BadgeVariant } from "@/components/ui/badge";
import type { WardHealth, WardHealthScore } from "@/types/analytics";

/*
 * `unknown` is a ward with nothing measured — no complaint carrying both
 * an SLA deadline and a recorded resolution.
 *
 * It used to be scored `good`, because the database coalesced its missing
 * compliance figure to 100%. So the wards a municipality had least
 * information about presented as the ones performing best, and the
 * "healthy" filter counted them.
 */
const HEALTH_VARIANT: Record<WardHealthScore, BadgeVariant> = {
  good: "success",
  moderate: "warning",
  poor: "destructive",
  critical: "critical",
  unknown: "muted",
};

const HEALTH_LABEL: Record<WardHealthScore, string> = {
  good: "good",
  moderate: "moderate",
  poor: "poor",
  critical: "critical",
  unknown: "no data",
};

type WardFilter = "all" | "needs_attention" | "healthy" | "unmeasured";

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
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: wards.length,
      needs_attention: wards.filter((w) =>
        ["poor", "critical"].includes(w.healthScore)
      ).length,
      healthy: wards.filter((w) => w.healthScore === "good").length,
      unmeasured: wards.filter((w) => w.healthScore === "unknown").length,
    }),
    [wards]
  );

  const visible = useMemo(() => {
    const filtered = wards.filter((ward) => {
      if (filter === "needs_attention")
        return ["poor", "critical"].includes(ward.healthScore);
      if (filter === "healthy") return ward.healthScore === "good";
      if (filter === "unmeasured") return ward.healthScore === "unknown";
      return true;
    });

    /*
     * Worst first, unmeasured last. Sorting null as 0 would put the wards
     * with no data at the top of a list whose whole purpose is deciding
     * where to intervene.
     */
    return filtered.sort((a, b) => {
      if (a.slaCompliance === null) return b.slaCompliance === null ? 0 : 1;
      if (b.slaCompliance === null) return -1;
      return a.slaCompliance - b.slaCompliance;
    });
  }, [wards, filter]);

  /*
   * Nothing currently sets complaints.ward_id — the report form sends
   * null, because wards have no geometry to derive one from — so in
   * practice every ward is unmeasured. That used to be hidden: the
   * database coalesced the missing compliance figure to 100% and every
   * ward scored `good`, so this page reported perfect service city-wide
   * from zero data. Saying why is the point of the notice below.
   */
  const allUnmeasured =
    wards.length > 0 && wards.every((w) => w.healthScore === "unknown");

  const filterOptions: FilterOption<WardFilter>[] = [
    { value: "all", label: "All wards", count: counts.all },
    {
      value: "needs_attention",
      label: "Needs attention",
      count: counts.needs_attention,
      tone: "attention",
    },
    { value: "healthy", label: "Healthy", count: counts.healthy },
    /*
     * Findable rather than buried. These wards used to be counted under
     * "Healthy" on the strength of a compliance figure nobody had
     * measured, so the chip that would have surfaced them did not need to
     * exist.
     */
    { value: "unmeasured", label: "No data", count: counts.unmeasured },
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

      {/*
        Why every card reads "No data", stated once rather than left for a
        reader to wonder about. This page used to show 100% compliance and
        a `good` badge for all of them, from exactly the same zero rows.
      */}
      {allUnmeasured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm leading-relaxed text-amber-900">
            <strong className="font-semibold">
              No complaint has been assigned to a ward yet.
            </strong>{" "}
            Ward health is measured from the complaints in each ward, and
            nothing currently sets one — the report form has no ward to
            record, because wards carry no boundary geometry to derive it
            from. These figures will populate once complaints are
            ward-tagged.
          </p>
          <p className="mt-2 text-xs text-amber-800/80">
            Previously this page reported 100% service-level compliance for
            every ward from the same absence of data.
          </p>
        </div>
      )}

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
                {HEALTH_LABEL[ward.healthScore]}
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
                  {formatHours(ward.avgResolutionHours, "—")}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">
                  SLA compliance
                </span>
                <span className="tabular text-xs font-semibold text-foreground">
                  {formatPercent(ward.slaCompliance)}
                </span>
              </div>

              {/* No bar without a figure: an empty bar and a 0% bar are
                  visually identical, and one of them is a claim. */}
              {ward.slaCompliance === null ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  No report here has both a deadline and a recorded
                  resolution yet.
                </p>
              ) : (
                <Progress
                  value={ward.slaCompliance}
                  className="mt-1.5 h-1.5"
                  aria-label={`${ward.ward} SLA compliance`}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
