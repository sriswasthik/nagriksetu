"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertOctagon, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import {
  TIMELINE_STAGES,
  getStatusMeta,
  getTimelineStageIndex,
} from "@/lib/design/status";
import { DURATION, EASE_OUT } from "@/lib/design/motion";
import type { ComplaintStatus, ComplaintStatusEvent } from "@/types/complaint";

interface IssueTimelineProps {
  status: ComplaintStatus;
  /** Submission time — the fallback anchor for the first stage. */
  createdAt?: string;
  /** Last status change — the fallback anchor for the current stage. */
  updatedAt?: string;
  /**
   * Recorded transitions, oldest first.
   *
   * When present, each completed stage shows when it actually happened.
   * Without it only two timestamps exist — created_at and updated_at —
   * and updated_at is overwritten by every later change, so every stage
   * in between rendered a bare "Completed." with no date.
   */
  history?: ComplaintStatusEvent[];
  className?: string;
}

/**
 * ============================================================
 * ISSUE TRACKING TIMELINE
 * ============================================================
 *
 * Answers three questions at a glance: what happened, what is
 * happening now, and what happens next.
 *
 * Stages come from the shared status system, which collapses the
 * eleven database statuses into six citizen-readable stages. The
 * order follows the real workflow (work is done, then verified,
 * then closed) rather than an idealised sequence.
 *
 * Terminal states (rejected) render their own panel — forcing them
 * onto a linear progress track would misrepresent them.
 *
 * Timestamps come from complaint_status_history where it exists. Stages
 * with no recorded event stay undated rather than borrowing a nearby
 * one: a citizen reading "Assigned — 14 March" needs that to be the day
 * it was assigned.
 */
export function IssueTimeline({
  status,
  createdAt,
  updatedAt,
  history,
  className,
}: IssueTimelineProps) {
  const prefersReducedMotion = useReducedMotion();
  const currentIndex = getTimelineStageIndex(status);
  const meta = getStatusMeta(status);

  /*
   * First recorded event per stage.
   *
   * First, not last: a reopened complaint passes through the same stages
   * again, and "In Progress" should read as when the work started rather
   * than when it most recently restarted.
   */
  const stageTimestamps = new Map<string, string>();

  /*
   * The note the officer wrote with that transition.
   *
   * complaint_status_history.note existed and was never populated, so a
   * citizen's timeline could say "In Progress" and never why, even when
   * the officer had written down exactly what they were doing. The
   * lifecycle triggers now carry the note across, and this is where it
   * reaches the person who reported the issue.
   */
  const stageNotes = new Map<string, string>();

  for (const event of history ?? []) {
    const stage = TIMELINE_STAGES.find((candidate) =>
      candidate.statuses.includes(event.status)
    );

    if (!stage) continue;

    if (!stageTimestamps.has(stage.key)) {
      stageTimestamps.set(stage.key, event.created_at);
    }

    // First note for the stage, to match the timestamp beside it.
    if (event.note && !stageNotes.has(stage.key)) {
      stageNotes.set(stage.key, event.note);
    }
  }

  // Rejected sits outside the progress track.
  if (currentIndex === -1) {
    return (
      <div
        className={cn(
          "flex items-start gap-3.5 rounded-lg border border-red-200 bg-red-50 p-4",
          className
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <AlertOctagon className="h-4.5 w-4.5 text-red-700" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-red-900">{meta.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-red-800/80">
            {meta.description}
          </p>
        </div>
      </div>
    );
  }

  const isReopened = status === "reopened";

  return (
    <div className={className}>
      {isReopened && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3.5">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
          <p className="text-sm leading-relaxed text-orange-900">
            This issue was <strong className="font-semibold">reopened</strong> and
            is being worked on again.
          </p>
        </div>
      )}

      <ol className="space-y-0">
        {TIMELINE_STAGES.map((stage, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;
          const isLast = index === TIMELINE_STAGES.length - 1;

          const Icon = stage.icon;

          // The current stage shows the live status description; past
          // stages state what happened; future stages hint at what's next.
          const description = isCurrent
            ? meta.description
            : isComplete
              ? "Completed."
              : stage.upcomingHint;

          /*
           * Recorded time wins. The created_at / updated_at fallbacks
           * keep the timeline populated for complaints filed before
           * history was recorded, and for the backfilled first stage.
           */
          const timestamp =
            stageTimestamps.get(stage.key) ??
            (isCurrent ? updatedAt : index === 0 ? createdAt : undefined);

          const note = stageNotes.get(stage.key);

          return (
            <li key={stage.key} className="relative flex gap-4">
              {/* Connector between nodes */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-0.5 overflow-hidden rounded-full bg-border"
                >
                  <motion.span
                    className="block h-full w-full origin-top bg-primary"
                    initial={{ scaleY: prefersReducedMotion ? 1 : 0 }}
                    animate={{ scaleY: isComplete ? 1 : 0 }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : DURATION.slow,
                      ease: EASE_OUT,
                      delay: prefersReducedMotion ? 0 : index * 0.08,
                    }}
                  />
                </div>
              )}

              {/* Node */}
              <motion.span
                initial={
                  prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }
                }
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: prefersReducedMotion ? DURATION.fast : DURATION.base,
                  ease: EASE_OUT,
                  delay: prefersReducedMotion ? 0 : index * 0.08,
                }}
                className={cn(
                  "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isCurrent &&
                    "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                  isUpcoming && "border-border bg-card text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <Check className="h-4.5 w-4.5" aria-hidden="true" />
                ) : (
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                )}

                {/* Live pulse on the active stage */}
                {isCurrent && !prefersReducedMotion && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border-2 border-primary animate-[marker-ping_2.4s_ease-out_infinite]"
                  />
                )}
              </motion.span>

              {/* Content */}
              <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-8", "pt-1")}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h3
                    className={cn(
                      "text-sm font-semibold",
                      isUpcoming ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {stage.label}
                  </h3>

                  {isCurrent && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Current
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>

                {/*
                  What the officer actually wrote. Set apart from the
                  generic stage description because it is the one line
                  here about this citizen's specific issue rather than
                  about the process.
                */}
                {note && (
                  <p className="mt-2 border-l-2 border-primary/30 pl-3 text-sm leading-relaxed text-foreground">
                    {note}
                  </p>
                )}

                {timestamp && (
                  <p className="mt-1.5 text-xs text-muted-foreground/80">
                    <time dateTime={timestamp}>{formatDateTime(timestamp)}</time>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
