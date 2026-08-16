"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  ChartSkeleton,
  PageHeaderSkeleton,
  StatGridSkeleton,
} from "@/components/shared/skeletons";
import {
  AXIS_PROPS,
  CHART_COLORS,
  ChartLegend,
  ChartTooltip,
  GRID_PROPS,
} from "@/components/charts/chartTheme";
import { analyticsService } from "@/lib/services/analytics";
import type {
  AnalyticsSummary,
  DepartmentPerformance,
  TrendDataPoint,
} from "@/types/analytics";

/**
 * ============================================================
 * RESOLUTION ANALYTICS
 * ============================================================
 *
 * Deliberately narrow. Each chart exists to answer one operational
 * question; anything that would only decorate the page is left out.
 */
export default function GovernmentAnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sum, trnd, depts] = await Promise.all([
        analyticsService.getSummary(),
        analyticsService.getTrends(),
        analyticsService.getDepartmentPerformance(),
      ]);
      setSummary(sum);
      setTrends(trnd);
      setDepartments(depts);
    } catch (loadError) {
      console.error("Failed to load analytics", loadError);
      setError("We couldn't load the analytics. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <StatGridSkeleton count={3} />
        <div className="mt-6 space-y-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div>
        <PageHeader title="Resolution Analytics" />
        <ErrorState
          variant="panel"
          title="Analytics unavailable"
          description={error ?? "The analytics could not be loaded."}
          onRetry={load}
        />
      </div>
    );
  }

  /* Net backlog change: are we closing faster than reports arrive? */
  const backlogDelta = trends.reduce(
    (total, point) => total + (point.complaints - point.resolved),
    0
  );

  // Slowest departments first — that is the actionable end.
  const bySpeed = [...departments].sort(
    (a, b) => b.avgResolutionHours - a.avgResolutionHours
  );

  return (
    <div>
      <PageHeader
        title="Resolution Analytics"
        description="How quickly the city closes reports, and where that slows down."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Average resolution time"
          value={summary.avgResolutionHours}
          suffix="h"
          decimals={1}
          hint="From report to verified fix"
          icon={Clock3}
          tone="brand"
        />
        <StatCard
          label="SLA compliance"
          value={summary.slaCompliance}
          suffix="%"
          decimals={1}
          hint="Target 90%"
          icon={TrendingUp}
          tone={summary.slaCompliance >= 90 ? "success" : "warning"}
        />
        <StatCard
          label="30-day backlog change"
          value={backlogDelta}
          hint={
            backlogDelta > 0
              ? "Reports arriving faster than they close"
              : "Closing faster than reports arrive"
          }
          icon={TrendingUp}
          tone={backlogDelta > 0 ? "danger" : "success"}
        />
      </div>

      {/* ---------- Intake vs closure ---------- */}
      <section
        aria-labelledby="throughput-heading"
        className="mt-6 rounded-lg border bg-card p-5"
      >
        <h2
          id="throughput-heading"
          className="text-sm font-semibold text-foreground"
        >
          Intake versus closure
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Where the reported band sits above resolved, the backlog is growing.
        </p>

        <div className="mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trends}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <defs>
                <linearGradient id="reportedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.neutral} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={CHART_COLORS.neutral} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="resolvedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.03} />
                </linearGradient>
              </defs>

              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="date"
                {...AXIS_PROPS}
                tickFormatter={(value) => new Date(value).getDate().toString()}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis {...AXIS_PROPS} width={48} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="complaints"
                name="Reported"
                stroke={CHART_COLORS.neutral}
                strokeWidth={2}
                fill="url(#reportedFill)"
              />
              <Area
                type="monotone"
                dataKey="resolved"
                name="Resolved"
                stroke={CHART_COLORS.primary}
                strokeWidth={2.5}
                fill="url(#resolvedFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <ChartLegend
          payload={[
            { value: "Reported", color: CHART_COLORS.neutral },
            { value: "Resolved", color: CHART_COLORS.primary },
          ]}
        />
      </section>

      {/* ---------- Speed by department ---------- */}
      <section
        aria-labelledby="speed-heading"
        className="mt-6 rounded-lg border bg-card p-5"
      >
        <h2 id="speed-heading" className="text-sm font-semibold text-foreground">
          Average resolution time by department
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Slowest first. Long bars are where citizens wait longest.
        </p>

        <div className="mt-4 h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bySpeed}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
              <XAxis type="number" {...AXIS_PROPS} unit="h" />
              <YAxis
                type="category"
                dataKey="department"
                {...AXIS_PROPS}
                width={132}
                tick={{ fill: "#6B6B6B", fontSize: 11 }}
              />
              <Tooltip
                content={<ChartTooltip valueSuffix="h" />}
                cursor={{ fill: "#F3F4F4" }}
              />
              <Bar
                dataKey="avgResolutionHours"
                name="Avg resolution"
                fill={CHART_COLORS.primary}
                radius={[0, 4, 4, 0]}
                maxBarSize={26}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
