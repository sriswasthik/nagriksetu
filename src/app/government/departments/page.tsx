"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyticsService,
  formatHours,
  formatPercent,
} from "@/lib/services/analytics";
import type { DepartmentPerformance } from "@/types/analytics";

/**
 * Department workload and performance.
 *
 * A table rather than a chart grid: these are precise figures an
 * administrator compares row by row, and a table is both more
 * scannable and more accessible than six small charts.
 */
export default function GovernmentDepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setDepartments(await analyticsService.getDepartmentPerformance());
    } catch (loadError) {
      console.error("Failed to load departments", loadError);
      setError("We couldn't load department performance. Please try again.");
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

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Departments" />
        <ErrorState
          variant="panel"
          title="Department data unavailable"
          description={error}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Workload, throughput and service-level performance by department."
      />

      {/* Table scrolls inside its own container so the page never
          overflows horizontally on mobile. */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="min-w-[11rem]">Department</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Resolved</TableHead>
              <TableHead className="text-right">Critical</TableHead>
              <TableHead className="text-right">Avg time</TableHead>
              <TableHead className="min-w-[10rem]">SLA compliance</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {departments.map((dept) => (
              <TableRow key={dept.department}>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Building2
                        className="h-3.5 w-3.5 text-primary"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="font-medium text-foreground">
                      {dept.department}
                    </span>
                  </span>
                </TableCell>

                <TableCell className="tabular text-right font-medium">
                  {dept.open.toLocaleString("en-IN")}
                </TableCell>

                <TableCell className="tabular text-right text-muted-foreground">
                  {dept.resolved.toLocaleString("en-IN")}
                </TableCell>

                <TableCell className="text-right">
                  {dept.critical > 0 ? (
                    <Badge variant="critical" className="tabular">
                      {dept.critical}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>

                <TableCell className="tabular text-right text-muted-foreground">
                  {formatHours(dept.avgResolutionHours, "—")}
                </TableCell>

                <TableCell>
                  {/*
                    A department with no report carrying a deadline has no
                    compliance figure. It used to be coalesced to 0, which
                    rendered here as a full-width red bar and a bold red
                    "0%" — an alarming claim about a department that had
                    simply never been given anything.
                  */}
                  {dept.slaCompliance === null ? (
                    <span className="text-xs text-muted-foreground">
                      No data
                    </span>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <Progress
                        value={dept.slaCompliance}
                        className="h-1.5 flex-1"
                        aria-label={`${dept.department} SLA compliance`}
                      />
                      <span
                        className={
                          dept.slaCompliance >= 90
                            ? "tabular w-11 shrink-0 text-right text-xs font-semibold text-emerald-700"
                            : dept.slaCompliance >= 75
                              ? "tabular w-11 shrink-0 text-right text-xs font-semibold text-amber-700"
                              : "tabular w-11 shrink-0 text-right text-xs font-semibold text-destructive"
                        }
                      >
                        {formatPercent(dept.slaCompliance)}
                      </span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Compliance is measured against the target window for each report&apos;s
        priority level, from the recorded moment it was resolved.
        &ldquo;No data&rdquo; means no report in that department has both a
        deadline and a recorded resolution — not that compliance is zero.
      </p>
    </div>
  );
}
