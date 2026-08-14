"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  key: string;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
}

/**
 * Multi-step form progress.
 *
 * Shows a numbered rail on wider screens and collapses to
 * "Step N of M" plus a progress bar on mobile, where a full rail
 * would be unreadable at four or more steps.
 */
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  const percent = ((current + 1) / steps.length) * 100;

  return (
    <div className={className}>
      {/* ---------- Mobile ---------- */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-foreground">
            {steps[current]?.label}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            Step {current + 1} of {steps.length}
          </p>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]?.label}`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* ---------- Desktop ---------- */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const isComplete = index < current;
          const isCurrent = index === current;
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.key}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    isComplete && "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                    !isComplete && !isCurrent && "border-border bg-card text-muted-foreground"
                  )}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="tabular">{index + 1}</span>
                  )}
                </span>

                <span
                  className={cn(
                    "whitespace-nowrap text-sm transition-colors",
                    isCurrent
                      ? "font-semibold text-foreground"
                      : isComplete
                        ? "font-medium text-foreground"
                        : "font-medium text-muted-foreground"
                  )}
                >
                  {step.label}
                  {isCurrent && <span className="sr-only"> (current step)</span>}
                </span>
              </div>

              {!isLast && (
                <span
                  aria-hidden="true"
                  className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-border"
                >
                  <span
                    className={cn(
                      "block h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out",
                      isComplete ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
