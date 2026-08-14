"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { DemoDataNotice } from "@/components/shared/DemoDataNotice";
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
import { analyticsService } from "@/lib/services/analytics";
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
    load();
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
      <div className="mx-auto max-w-lg py-8">
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

      <DemoDataNotice className="mb-6" />

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
                  {dept.avgResolutionHours}h
                </TableCell>

                <TableCell>
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
                      {dept.slaCompliance}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Compliance is measured against the target window for each report&apos;s
        priority level.
      </p>
    </div>
  );
}
