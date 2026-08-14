"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { SLAIndicator } from "@/components/shared/SLAIndicator";
import { ErrorState } from "@/components/shared/ErrorState";
import { DemoDataNotice } from "@/components/shared/DemoDataNotice";
import { StaticLocationMap } from "@/components/map/StaticLocationMap";
import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils";
import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";
import type { WorkOrder } from "@/types/workOrder";

const RESOLUTION_NOTES_MIN = 5;

export default function WorkOrderDetailView() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isUpdating, setIsUpdating] = useState(false);
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  /*
   * Who is making the update. Carried over from main, which resolves
   * this from the session rather than hardcoding a placeholder — the
   * value lands in the work order's audit trail, so a stub would make
   * that trail wrong.
   */
  const [officerId, setOfficerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [data, user] = await Promise.all([
        workOrderService.getWorkOrderById(id),
        // Never let a failed profile lookup block the work order itself.
        authService.getCurrentUser().catch(() => null),
      ]);

      if (user?.id) setOfficerId(user.id);

      if (!data) {
        setError("That work order could not be found.");
      } else {
        setOrder(data);
      }
    } catch (loadError) {
      console.error("Failed to load work order", loadError);
      setError("We couldn't load this work order. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Release the preview object URL on unmount / replacement.
  useEffect(() => {
    return () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    };
  }, [proofPreview]);

  function handleProofSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("That file isn't an image", {
        description: "Please attach a photo of the completed work.",
      });
      return;
    }

    if (proofPreview) URL.revokeObjectURL(proofPreview);

    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
    event.target.value = "";
  }

  async function updateStatus(newStatus: WorkOrder["status"]) {
    setIsUpdating(true);

    try {
      const media = proofPreview
        ? [
            {
              id: `med_${Date.now()}`,
              url: proofPreview,
              type: "image" as const,
              uploadedAt: new Date().toISOString(),
            },
          ]
        : [];

      const updated = await workOrderService.updateWorkOrderStatus({
        workOrderId: id,
        status: newStatus,
        notes: notes.length > 0 ? notes : undefined,
        media,
        // Falls back only if the session could not be resolved.
        updatedBy: officerId ?? "unknown-officer",
        timestamp: new Date().toISOString(),
      });

      setOrder(updated);
      setNotes("");
      setProofFile(null);
      setProofPreview(null);

      const MESSAGES: Partial<Record<WorkOrder["status"], string>> = {
        accepted: "Assignment accepted",
        in_progress: "Work started",
        proof_submitted: "Proof submitted for review",
      };

      toast.success(MESSAGES[newStatus] ?? "Work order updated");
    } catch (updateError) {
      console.error("Failed to update status", updateError);
      toast.error("Couldn't update the work order", {
        description: "Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeaderSkeleton withAction={false} />
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Work order"
          breadcrumbs={[
            { label: "Work Orders", href: "/officer/work-orders" },
            { label: "Not found" },
          ]}
        />
        <ErrorState
          variant="panel"
          title="Work order unavailable"
          description={error ?? "This work order could not be loaded."}
          onRetry={load}
        />
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => router.push("/officer/work-orders")}>
            Back to work orders
          </Button>
        </div>
      </div>
    );
  }

  const isClosed = ["completed", "approved", "proof_submitted"].includes(
    order.status
  );
  const canSubmitProof =
    Boolean(proofPreview) && notes.trim().length >= RESOLUTION_NOTES_MIN;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { label: "Work Orders", href: "/officer/work-orders" },
          { label: order.id },
        ]}
        eyebrow={
          <span className="font-mono text-sm text-muted-foreground">{order.id}</span>
        }
        title={order.complaintTitle}
      />

      <DemoDataNotice className="mb-6" />

      {/* ---------- Status strip ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
        <Badge
          variant={order.status === "assigned" ? "warning" : "info"}
          className="capitalize"
        >
          {order.status.replace(/_/g, " ")}
        </Badge>
        <PriorityBadge level={order.priorityLevel} score={order.priorityScore} />
        {!isClosed && <SLAIndicator hoursRemaining={order.slaHoursRemaining} />}

        <span className="ml-auto text-xs text-muted-foreground">
          {order.departmentName}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ================= LEFT: action ================= */}
        <div className="space-y-6">
          <section
            aria-labelledby="action-heading"
            className={
              isClosed
                ? "rounded-lg border border-emerald-200 bg-emerald-50/60 p-5"
                : "rounded-lg border border-primary/40 bg-card p-5 shadow-sm"
            }
          >
            <h2
              id="action-heading"
              className="text-sm font-semibold text-foreground"
            >
              {order.status === "assigned"
                ? "Accept this assignment"
                : order.status === "accepted"
                  ? "Start work"
                  : order.status === "in_progress"
                    ? "Submit proof of completion"
                    : "Work submitted"}
            </h2>

            {order.status === "assigned" && (
              <div className="mt-3 space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Accepting confirms you have received this work order and
                  acknowledges the{" "}
                  <strong className="font-semibold text-foreground">
                    {order.slaHoursRemaining}h
                  </strong>{" "}
                  service-level target.
                </p>
                <Button
                  onClick={() => updateStatus("accepted")}
                  disabled={isUpdating}
                >
                  {isUpdating && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  Accept assignment
                </Button>
              </div>
            )}

            {order.status === "accepted" && (
              <div className="mt-3 space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Mark work as started once you are on site.
                </p>
                <Button
                  onClick={() => updateStatus("in_progress")}
                  disabled={isUpdating}
                >
                  {isUpdating && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  Start work
                </Button>
              </div>
            )}

            {order.status === "in_progress" && (
              <div className="mt-4 space-y-5">
                <div>
                  <label
                    htmlFor="resolution-notes"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Resolution notes
                  </label>
                  <Textarea
                    id="resolution-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="What was done, materials used, and anything the supervisor should know."
                    className="min-h-28 resize-y"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    At least {RESOLUTION_NOTES_MIN} characters.
                  </p>
                </div>

                <div>
                  <span className="mb-2 block text-sm font-medium text-foreground">
                    Photographic proof
                  </span>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    id="proof-upload"
                    onChange={handleProofSelect}
                    className="sr-only"
                  />

                  {!proofPreview ? (
                    <label
                      htmlFor="proof-upload"
                      className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring"
                    >
                      <Camera
                        className="h-7 w-7 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="mt-2.5 text-sm font-medium text-foreground">
                        Photograph the completed work
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        Required before a supervisor can sign off
                      </span>
                    </label>
                  ) : (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="relative bg-neutral-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={proofPreview}
                          alt="Photograph of the completed repair"
                          className="max-h-64 w-full object-contain"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            URL.revokeObjectURL(proofPreview);
                            setProofPreview(null);
                            setProofFile(null);
                          }}
                          className="absolute right-3 top-3"
                        >
                          <X className="mr-1 h-4 w-4" aria-hidden="true" />
                          Retake
                        </Button>
                      </div>
                      {proofFile && (
                        <p className="truncate bg-muted/30 p-3 text-xs text-muted-foreground">
                          {proofFile.name}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Button
                    onClick={() => updateStatus("proof_submitted")}
                    disabled={isUpdating || !canSubmitProof}
                    className="w-full sm:w-auto"
                  >
                    {isUpdating && (
                      <Loader2
                        className="mr-1 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    Submit for verification
                  </Button>

                  {/* Say why the button is disabled instead of leaving
                      the officer to guess. */}
                  {!canSubmitProof && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {!proofPreview && notes.trim().length < RESOLUTION_NOTES_MIN
                        ? "Add resolution notes and a photo to submit."
                        : !proofPreview
                          ? "Add a photo of the completed work to submit."
                          : "Add resolution notes to submit."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {isClosed && (
              <div className="mt-3 flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-emerald-900">
                    Resolution submitted
                  </p>
                  <p className="mt-0.5 text-sm text-emerald-800/80">
                    Awaiting supervisor verification and citizen confirmation.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ---- Citizen evidence ---- */}
          <section
            aria-labelledby="citizen-evidence"
            className="rounded-lg border bg-card p-5"
          >
            <h2
              id="citizen-evidence"
              className="text-sm font-semibold text-foreground"
            >
              What the citizen reported
            </h2>

            {order.citizenEvidence && order.citizenEvidence.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-3">
                {order.citizenEvidence.map((item) => (
                  <li
                    key={item.id}
                    className="overflow-hidden rounded-lg border bg-neutral-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt="Photo submitted by the citizen showing the reported issue"
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 flex flex-col items-center rounded-lg border border-dashed py-7 text-center">
                <ImageOff
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  No photos were provided with this report.
                </p>
              </div>
            )}
          </section>

          {/* ---- Resolution evidence ---- */}
          {order.resolutionEvidence && order.resolutionEvidence.length > 0 && (
            <section
              aria-labelledby="resolution-evidence"
              className="rounded-lg border bg-card p-5"
            >
              <h2
                id="resolution-evidence"
                className="text-sm font-semibold text-foreground"
              >
                Proof of completion
              </h2>

              <ul className="mt-3 grid grid-cols-2 gap-3">
                {order.resolutionEvidence.map((item) => (
                  <li
                    key={item.id}
                    className="overflow-hidden rounded-lg border bg-neutral-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt="Photo submitted by the officer showing the completed repair"
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  </li>
                ))}
              </ul>

              {order.resolutionNotes && (
                <>
                  <Separator className="my-4" />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {order.resolutionNotes}
                  </p>
                </>
              )}
            </section>
          )}
        </div>

        {/* ================= RIGHT: context ================= */}
        <div className="space-y-6">
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
                {order.location.address}
              </p>
            </div>

            <div className="h-44 border-t">
              <StaticLocationMap
                latitude={order.location.latitude}
                longitude={order.location.longitude}
              />
            </div>

            <div className="p-3">
              <Button asChild variant="outline" className="w-full">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${order.location.latitude}&mlon=${order.location.longitude}#map=18/${order.location.latitude}/${order.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />
                  Open in maps
                </a>
              </Button>
            </div>
          </section>

          {/* ---- Audit trail ---- */}
          <section
            aria-labelledby="trail-heading"
            className="rounded-lg border bg-card p-5"
          >
            <h2 id="trail-heading" className="text-sm font-semibold text-foreground">
              Timeline
            </h2>

            <dl className="mt-3 space-y-0 text-sm">
              {[
                { label: "Created", value: order.createdAt },
                { label: "Assigned", value: order.assignedAt },
                { label: "Accepted", value: order.acceptedAt },
                { label: "Started", value: order.startedAt },
                { label: "Completed", value: order.completedAt },
                { label: "Verified", value: order.verifiedAt },
              ]
                .filter((entry) => entry.value)
                .map((entry) => (
                  <div
                    key={entry.label}
                    className="flex items-baseline justify-between gap-3 border-b py-2.5 last:border-0"
                  >
                    <dt className="text-muted-foreground">{entry.label}</dt>
                    <dd className="text-right text-xs font-medium text-foreground">
                      {formatDateTime(entry.value as string)}
                    </dd>
                  </div>
                ))}

              <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                <dt className="text-muted-foreground">SLA deadline</dt>
                <dd className="text-right text-xs font-semibold text-amber-700">
                  {formatDateTime(order.slaDeadline)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Assignment</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Officer</dt>
                <dd className="font-medium text-foreground">
                  {order.officerName || "Unassigned"}
                </dd>
              </div>
              {order.supervisorName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Supervisor</dt>
                  <dd className="font-medium text-foreground">
                    {order.supervisorName}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Source report</dt>
                <dd className="font-mono text-xs text-foreground">
                  {order.complaintId}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
