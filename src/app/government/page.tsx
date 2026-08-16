"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AXIS_PROPS,
  CHART_COLORS,
  CHART_SERIES,
  ChartLegend,
  ChartTooltip,
  GRID_PROPS,
} from "@/components/charts/chartTheme";
import { analyticsService } from "@/lib/services/analytics";
import type {
  AnalyticsSummary,
  CategoryDistribution,
  DepartmentPerformance,
  SLAData,
  TrendDataPoint,
  WardHealth,
} from "@/types/analytics";

const HEALTH_VARIANT = {
  good: "success",
  moderate: "warning",
  poor: "destructive",
  critical: "critical",
} as const;

/**
 * ============================================================
 * CITY OPERATIONS OVERVIEW
 * ============================================================
 *
 * Structured around the questions a duty officer actually asks at
 * the start of a shift, in order:
 *   1. Is anything breaching or critical right now?
 *   2. Are we keeping pace with incoming reports?
 *   3. Where is the load concentrated?
 *
 * Every chart answers one of those. Figures come from local sample
 * data, which is labelled on the page.
 */
export default function GovernmentDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [categories, setCategories] = useState<CategoryDistribution[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);
  const [wards, setWards] = useState<WardHealth[]>([]);
  const [sla, setSla] = useState<SLAData | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sum, trnd, cats, depts, wrds, slaData] = await Promise.all([
        analyticsService.getSummary(),
        analyticsService.getTrends(),
        analyticsService.getCategoryDistribution(),
        analyticsService.getDepartmentPerformance(),
        analyticsService.getWardHealth(),
        analyticsService.getSLAData(),
      ]);

      setSummary(sum);
      setTrends(trnd);
      setCategories(cats);
      setDepartments(depts);
      setWards(wrds);
      setSla(slaData);
    } catch (loadError) {
      console.error("Failed to load analytics", loadError);
      setError("We couldn't load the operations data. Please try again.");
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
        <PageHeaderSkeleton />
        <StatGridSkeleton count={4} />
        <div className="mt-6 grid gap-6 lg:grid-cols-7">
          <ChartSkeleton className="lg:col-span-4" />
          <ChartSkeleton className="lg:col-span-3" height="h-[250px]" />
        </div>
      </div>
    );
  }

  if (error || !summary || !sla) {
    return (
      <div>
        <PageHeader title="City Operations" />
        <ErrorState
          variant="panel"
          title="Operations data unavailable"
          description={error ?? "The dashboard data could not be loaded."}
          onRetry={load}
        />
      </div>
    );
  }

  const resolutionRate = Math.round(
    (summary.resolvedComplaints / summary.totalComplaints) * 100
  );

  const slaTotal = sla.withinSLA + sla.atRisk + sla.breached;

  // Worst-performing wards first — that is where attention is needed.
  const wardsByNeed = [...wards].sort((a, b) => a.slaCompliance - b.slaCompliance);

  return (
    <div>
      <PageHeader
        title="City Operations"
        description="Live operational picture across every department and ward."
        action={
          <Button asChild>
            <Link href="/government/complaints">
              <ClipboardList className="mr-1 h-4 w-4" aria-hidden="true" />
              Issue queue
            </Link>
          </Button>
        }
      />

      {/* ================= 1. WHAT NEEDS ATTENTION ================= */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Critical open"
          value={summary.criticalComplaints}
          hint="Public-safety priority"
          icon={AlertTriangle}
          tone="danger"
          href="/government/complaints"
        />
        <StatCard
          label="SLA breached"
          value={sla.breached}
          hint={`${((sla.breached / slaTotal) * 100).toFixed(1)}% of all reports`}
          icon={Clock3}
          tone="danger"
        />
        <StatCard
          label="Open reports"
          value={summary.openComplaints}
          hint={`${summary.complaintsToday} new today`}
          icon={ClipboardList}
          tone="warning"
        />
        <StatCard
          label="Resolution rate"
          value={resolutionRate}
          suffix="%"
          hint={`${summary.resolvedComplaints.toLocaleString("en-IN")} resolved to date`}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      {/* ================= 2. SLA POSTURE ================= */}
      <section
        aria-labelledby="sla-heading"
        className="mt-6 rounded-lg border bg-card p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sla-heading" className="text-sm font-semibold text-foreground">
            Service-level posture
          </h2>
          <p className="tabular text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {summary.slaCompliance}%
            </span>{" "}
            within target · goal 90%
          </p>
        </div>

        {/* Single stacked bar — proportion is the question here, and
            three numbers do not warrant a full chart. */}
        <div
          className="mt-4 flex h-3 overflow-hidden rounded-full"
          role="img"
          aria-label={`${sla.withinSLA} reports within SLA, ${sla.atRisk} at risk, ${sla.breached} breached`}
        >
          <span
            className="bg-emerald-500"
            style={{ width: `${(sla.withinSLA / slaTotal) * 100}%` }}
          />
          <span
            className="bg-amber-500"
            style={{ width: `${(sla.atRisk / slaTotal) * 100}%` }}
          />
          <span
            className="bg-red-500"
            style={{ width: `${(sla.breached / slaTotal) * 100}%` }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-4">
          {[
            { label: "Within target", value: sla.withinSLA, dot: "bg-emerald-500" },
            { label: "At risk", value: sla.atRisk, dot: "bg-amber-500" },
            { label: "Breached", value: sla.breached, dot: "bg-red-500" },
          ].map((item) => (
            <div key={item.label}>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`}
                />
                {item.label}
              </dt>
              <dd className="tabular mt-1 text-lg font-bold text-foreground">
                {item.value.toLocaleString("en-IN")}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ================= 3. PACE & MIX ================= */}
      <div className="mt-6 grid gap-6 lg:grid-cols-7">
        {/* Are we keeping up with intake? */}
        <section
          aria-labelledby="trend-heading"
          className="rounded-lg border bg-card p-5 lg:col-span-4"
        >
          <h2 id="trend-heading" className="text-sm font-semibold text-foreground">
            Reported vs resolved
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Last 30 days. Resolved tracking below reported means a growing
            backlog.
          </p>

          <div className="mt-4 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trends}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
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
                <Line
                  type="monotone"
                  dataKey="complaints"
                  name="Reported"
                  stroke={CHART_COLORS.neutral}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <ChartLegend
            payload={[
              { value: "Reported", color: CHART_COLORS.neutral },
              { value: "Resolved", color: CHART_COLORS.primary },
            ]}
          />
        </section>

        {/* What kind of work dominates? */}
        <section
          aria-labelledby="mix-heading"
          className="rounded-lg border bg-card p-5 lg:col-span-3"
        >
          <h2 id="mix-heading" className="text-sm font-semibold text-foreground">
            Where the volume is
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of all reports by issue type.
          </p>

          <div className="mt-2 h-[210px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="category"
                  strokeWidth={0}
                >
                  {categories.map((entry, index) => (
                    <Cell
                      key={entry.category}
                      fill={CHART_SERIES[index % CHART_SERIES.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Explicit list beats a cramped pie legend. */}
          <ul className="mt-3 space-y-2">
            {categories.map((entry, index) => (
              <li key={entry.category} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: CHART_SERIES[index % CHART_SERIES.length],
                  }}
                />
                <span className="truncate text-muted-foreground">
                  {entry.category}
                </span>
                <span className="tabular ml-auto font-semibold text-foreground">
                  {entry.percentage}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ================= 4. DEPARTMENT LOAD ================= */}
      <section
        aria-labelledby="dept-heading"
        className="mt-6 rounded-lg border bg-card p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dept-heading" className="text-sm font-semibold text-foreground">
              Open vs resolved by department
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A tall open bar next to a short resolved bar signals a capacity
              problem.
            </p>
          </div>

          <Button asChild variant="ghost" size="sm">
            <Link href="/government/departments">
              Department detail
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={departments}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="department"
                {...AXIS_PROPS}
                tick={{ fill: "#6B6B6B", fontSize: 11 }}
                interval={0}
                height={48}
                angle={-18}
                textAnchor="end"
              />
              <YAxis {...AXIS_PROPS} width={48} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F3F4F4" }} />
              <Bar
                dataKey="resolved"
                name="Resolved"
                fill={CHART_COLORS.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
              />
              <Bar
                dataKey="open"
                name="Open"
                fill={CHART_COLORS.primaryLight}
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <ChartLegend
          payload={[
            { value: "Resolved", color: CHART_COLORS.primary },
            { value: "Open", color: CHART_COLORS.primaryLight },
          ]}
        />
      </section>

      {/* ================= 5. WARDS NEEDING ATTENTION ================= */}
      <section aria-labelledby="wards-heading" className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="wards-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Wards needing attention
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Lowest service-level compliance first.
            </p>
          </div>

          <Button asChild variant="ghost" size="sm">
            <Link href="/government/wards">
              All wards
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {wardsByNeed.slice(0, 6).map((ward) => (
            <li key={ward.ward} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {ward.ward}
                </h3>
                <Badge
                  variant={HEALTH_VARIANT[ward.healthScore]}
                  className="capitalize"
                >
                  {ward.healthScore}
                </Badge>
              </div>

              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Open</dt>
                  <dd className="tabular font-semibold text-foreground">
                    {ward.openComplaints}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Critical</dt>
                  <dd className="tabular font-semibold text-foreground">
                    {ward.critical}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">SLA compliance</dt>
                  <dd className="tabular font-semibold text-foreground">
                    {ward.slaCompliance}%
                  </dd>
                </div>
              </dl>

              <Progress value={ward.slaCompliance} className="mt-2.5 h-1.5" />
            </li>
          ))}
        </ul>
      </section>

      {/* Trend footnote keeps intake context near the charts. */}
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        Average resolution time {summary.avgResolutionHours} hours ·{" "}
        {summary.resolvedToday} resolved today
      </p>
    </div>
  );
}
