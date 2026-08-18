"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Clock3,
  FileText,
  ImageOff,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { IssueTimeline } from "@/components/shared/IssueTimeline";
import { CopyButton } from "@/components/shared/CopyButton";
import { ErrorState } from "@/components/shared/ErrorState";
import { StaticLocationMap } from "@/components/map/StaticLocationMap";
import {
  PageHeaderSkeleton,
  TimelineSkeleton,
} from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils";
import { formatCategory, getStatusMeta } from "@/lib/design/status";
import {
  getComplaintDetails,
  type ComplaintDetails,
} from "@/lib/services/complaints";
import { processComplaintWithAI } from "@/lib/services/ai";

export default function ComplaintDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const complaintId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";

  /*
   * ?process=ai is still honoured for the arrival straight from
   * submission, but it is no longer what decides whether triage runs —
   * see the effect below.
   */
  const arrivedFromSubmission = searchParams.get("process") === "ai";

  const [details, setDetails] = useState<ComplaintDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);

  // One triage attempt per mount; also guards StrictMode double-invoke.
  const aiTriggered = useRef(false);

  const loadDetails = useCallback(
    async (showLoader = true) => {
      if (!complaintId) {
        setError("That report reference isn't valid.");
        setIsLoading(false);
        return;
      }

      if (showLoader) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError(null);

      try {
        const result = await getComplaintDetails(complaintId);
        setDetails(result);
        return result;
      } catch (loadError) {
        console.error("Failed to load complaint details:", loadError);
        setError(
          "We couldn't load this report. It may have been removed, or you may not have permission to view it."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [complaintId]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadDetails]);

  const runTriage = useCallback(async () => {
    setIsAnalyzing(true);
    setTriageError(null);

    try {
      const result = await processComplaintWithAI(complaintId);

      if (!result.success) {
        setTriageError(
          result.error ?? "Triage did not complete. You can try again."
        );
      }
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
      setTriageError(
        aiError instanceof Error && aiError.message
          ? aiError.message
          : "Triage did not complete. You can try again."
      );
    } finally {
      // Reload either way: a failure still records ai_analysis_status,
      // and the page must show the real database state, not an
      // optimistic guess about it.
      await loadDetails(false);
      setIsAnalyzing(false);
    }
  }, [complaintId, loadDetails]);

  /*
   * Triage runs whenever a report has not been through it.
   *
   * It used to require ?process=ai, which is only present when the
   * citizen taps "Track this issue" straight after submitting. Anyone who
   * closed the tab, or opened the report later from their list, left it
   * untriaged for good: no priority, no SLA deadline, and department_id
   * null, so it was never routed to anyone. The query param now only
   * affects whether the URL is tidied afterwards.
   *
   * `pending` and `failed` are both retried; `processing` is left alone
   * and polled instead, since another tab may be mid-run.
   */
  useEffect(() => {
    if (!details || aiTriggered.current) return;

    const status = details.complaint.ai_analysis_status;
    const needsTriage = status === null || status === "pending" || status === "failed";

    if (!needsTriage) return;

    aiTriggered.current = true;

    const timer = setTimeout(() => {
      void runTriage().finally(() => {
        if (arrivedFromSubmission) {
          // Drop the param so a manual refresh reads as an ordinary visit.
          router.replace(`/citizen/complaints/${complaintId}`, { scroll: false });
        }
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [details, runTriage, arrivedFromSubmission, complaintId, router]);

  /*
   * Poll while triage is running elsewhere.
   *
   * processComplaintWithAI marks the row `processing` before it starts,
   * so a second tab — or this tab after a reload mid-run — can watch for
   * completion rather than starting a competing pass that
   * apply_complaint_triage() would refuse anyway.
   */
  const isProcessingElsewhere =
    details?.complaint.ai_analysis_status === "processing" && !isAnalyzing;

  useEffect(() => {
    if (!isProcessingElsewhere) return;

    const timer = setInterval(() => {
      void loadDetails(false);
    }, 3000);

    return () => clearInterval(timer);
  }, [isProcessingElsewhere, loadDetails]);

  /* ---------------- Loading ---------------- */
  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-56 rounded-lg" />
          </div>
          <div className="rounded-lg border bg-card p-5">
            <TimelineSkeleton steps={4} />
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Error ---------------- */
  if (error || !details) {
    return (
      <div>
        <PageHeader
          title="Report"
          breadcrumbs={[
            { label: "My Issues", href: "/citizen/complaints" },
            { label: "Report" },
          ]}
        />
        <ErrorState
          variant="panel"
          title="We couldn't open this report"
          description={error ?? "The report could not be found."}
          onRetry={() => loadDetails()}
        />
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => router.push("/citizen/complaints")}>
            Back to my issues
          </Button>
        </div>
      </div>
    );
  }

  const { complaint, media, departmentName, history } = details;
  const statusMeta = getStatusMeta(complaint.status);

  // A photo whose object could not be signed is a missing file, not a
  // reason to hide the section — but it cannot be rendered either.
  const viewableMedia = media.filter(
    (item): item is (typeof media)[number] & { signedUrl: string } =>
      item.signedUrl !== null
  );

  const unavailableCount = media.length - viewableMedia.length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "My Issues", href: "/citizen/complaints" },
          { label: complaint.complaint_number || "Report" },
        ]}
        eyebrow={
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-medium text-muted-foreground">
              {complaint.complaint_number}
            </span>
            <CopyButton value={complaint.complaint_number} label="Tracking ID" />
          </div>
        }
        title={complaint.title}
        action={
          <Button
            variant="outline"
            onClick={() => loadDetails(false)}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            Refresh
          </Button>
        }
      />

      {/*
        Current status banner — the single most important thing on the
        page, so it sits above the fold and never requires hunting.
      */}
      <div className="mb-6 rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Current status
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={complaint.status} showIcon />
              {complaint.priority_level && (
                <PriorityBadge
                  level={complaint.priority_level}
                  score={complaint.priority_score ?? undefined}
                />
              )}
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              {statusMeta.description}
            </p>
          </div>

          {/*
            Triage is asynchronous, so its three outcomes are shown
            plainly rather than left to be inferred from a missing
            priority badge.
          */}
          {(isAnalyzing || isProcessingElsewhere) && (
            <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5">
              <Loader2
                className="h-4 w-4 animate-spin text-primary"
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-primary">
                Triaging your report…
              </span>
            </div>
          )}

          {!isAnalyzing &&
            !isProcessingElsewhere &&
            (triageError || complaint.ai_analysis_status === "failed") && (
              <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      Automatic triage didn&apos;t finish
                    </p>
                    <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-amber-800/80">
                      Your report is filed and will still be reviewed by
                      staff. {triageError ?? complaint.ai_error_message ?? ""}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void runTriage()}
                      className="mt-2.5"
                    >
                      Try triage again
                    </Button>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ================= LEFT ================= */}
        <div className="space-y-6">
          {/* ---- Description ---- */}
          <section
            aria-labelledby="description-heading"
            className="rounded-lg border bg-card p-5"
          >
            <h2
              id="description-heading"
              className="text-sm font-semibold text-foreground"
            >
              What was reported
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {complaint.description}
            </p>

            <Separator className="my-5" />

            <dl className="grid gap-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Category
                </dt>
                <dd className="mt-1.5">
                  <Badge variant="outline">
                    {formatCategory(complaint.category)}
                  </Badge>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reported
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">
                  <time dateTime={complaint.created_at}>
                    {formatDateTime(complaint.created_at)}
                  </time>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Department
                </dt>
                <dd className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {departmentName ? (
                    <>
                      <Building2
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {departmentName}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not yet assigned</span>
                  )}
                </dd>
              </div>
            </dl>

            {/*
              The persisted analysis, read from the complaint row.

              Previously only priority_reason was shown, so the summary,
              category and confidence the pipeline had stored were never
              visible to anyone. Nothing here is recomputed in the browser
              — every value is what the server wrote.
            */}
            {(complaint.ai_summary || complaint.priority_reason) && (
              <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-start gap-3">
                  <Sparkles
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      Automatic assessment
                    </p>

                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {complaint.ai_summary ?? complaint.priority_reason}
                    </p>

                    {complaint.ai_summary && complaint.priority_reason && (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Why this priority:
                        </span>{" "}
                        {complaint.priority_reason}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {complaint.ai_category && (
                        <span>
                          Classified as{" "}
                          <span className="font-medium text-foreground">
                            {formatCategory(complaint.ai_category)}
                          </span>
                        </span>
                      )}

                      {/*
                        Shown because a low number is information, not an
                        embarrassment: it is the difference between "the
                        city is confident" and "someone should look".
                      */}
                      {complaint.ai_confidence !== null && (
                        <span className="tabular">
                          {Math.round(complaint.ai_confidence * 100)}% confidence
                        </span>
                      )}

                      {complaint.ai_processed_at && (
                        <time dateTime={complaint.ai_processed_at}>
                          {formatDateTime(complaint.ai_processed_at)}
                        </time>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ---- Evidence ---- */}
          <section
            aria-labelledby="evidence-heading"
            className="rounded-lg border bg-card p-5"
          >
            <h2
              id="evidence-heading"
              className="text-sm font-semibold text-foreground"
            >
              Evidence
              {viewableMedia.length > 0 && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({viewableMedia.length})
                </span>
              )}
            </h2>

            {unavailableCount > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {unavailableCount === 1
                  ? "One photo could not be loaded."
                  : `${unavailableCount} photos could not be loaded.`}{" "}
                Try refreshing.
              </p>
            )}

            {viewableMedia.length === 0 ? (
              <div className="mt-4 flex flex-col items-center rounded-lg border border-dashed py-8 text-center">
                <ImageOff
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-2.5 text-sm font-medium text-foreground">
                  No photos attached
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  This report was submitted without evidence.
                </p>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {viewableMedia.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-lg border bg-muted/20 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="aspect-video overflow-hidden bg-neutral-900">
                        {/* Signed Supabase Storage URLs are short-lived and
                            not a configured next/image remote host. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.signedUrl}
                          alt={`Evidence photo submitted with this report: ${item.file_name}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="p-3">
                        <p className="truncate text-xs font-medium text-foreground">
                          {item.file_name}
                        </p>
                        <p className="tabular mt-0.5 text-xs text-muted-foreground">
                          {item.file_size
                            ? `${(item.file_size / 1024 / 1024).toFixed(2)} MB`
                            : item.file_type}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- Location ---- */}
          <section
            aria-labelledby="location-heading"
            className="overflow-hidden rounded-lg border bg-card"
          >
            <div className="p-5 pb-4">
              <h2
                id="location-heading"
                className="text-sm font-semibold text-foreground"
              >
                Location
              </h2>
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {complaint.address || "No address recorded"}
              </p>
              {complaint.latitude !== null && complaint.longitude !== null && (
                <p className="tabular mt-1.5 pl-6 text-xs text-muted-foreground">
                  {complaint.latitude.toFixed(6)}, {complaint.longitude.toFixed(6)}
                </p>
              )}
            </div>

            {complaint.latitude !== null && complaint.longitude !== null && (
              <div className="h-56 border-t">
                <StaticLocationMap
                  latitude={complaint.latitude}
                  longitude={complaint.longitude}
                  status={complaint.status}
                />
              </div>
            )}
          </section>
        </div>

        {/* ================= RIGHT ================= */}
        <div className="space-y-6">
          <section
            aria-labelledby="timeline-heading"
            className="rounded-lg border bg-card p-5 lg:sticky lg:top-24"
          >
            <h2
              id="timeline-heading"
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
              Progress
            </h2>

            <div className="mt-5">
              <IssueTimeline
                status={complaint.status}
                createdAt={complaint.created_at}
                updatedAt={complaint.updated_at}
                history={history}
              />
            </div>

            <div className="mt-5 flex items-start gap-2.5 border-t pt-4">
              <FileText
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                You&apos;ll be notified as this report moves between stages.
                Nothing is marked resolved without photographic proof and a
                supervisor check.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
