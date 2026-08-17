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
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { SLAIndicator } from "@/components/shared/SLAIndicator";
import { ErrorState } from "@/components/shared/ErrorState";
import { StaticLocationMap } from "@/components/map/StaticLocationMap";
import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { toCoordinates } from "@/lib/geo/coordinates";
import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";
import {
  WORK_ORDER_STATUS_LABELS,
  type AssignableOfficer,
  type WorkOrder,
  type WorkOrderHistoryEntry,
} from "@/types/workOrder";

const RESOLUTION_NOTES_MIN = 5;

/** Roles that sign work off, mirroring public.is_oversight(). */
const OVERSIGHT_ROLES = ["supervisor", "government_admin"];

export default function WorkOrderDetailView() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [history, setHistory] = useState<WorkOrderHistoryEntry[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isOversight, setIsOversight] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** null while unloaded, so the picker can show a skeleton rather than "none". */
  const [officers, setOfficers] = useState<AssignableOfficer[] | null>(null);
  const [pendingOfficerId, setPendingOfficerId] = useState<string | null>(null);

  const [isUpdating, setIsUpdating] = useState(false);
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  /*
   * The author of an update is no longer resolved here: row-level
   * security requires work_order_updates.created_by = auth.uid(), so
   * the service reads it from the session. Resolving it in the page as
   * well only created a race in which a slow profile lookup produced a
   * placeholder id that the database then rejected.
   *
   * The viewer's role IS resolved here, but only to decide which actions
   * to offer. Every one of them is authorised again by the database, so
   * a stale or forged role changes what the page draws and nothing about
   * what it can do.
   */

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [data, viewer] = await Promise.all([
        workOrderService.getWorkOrderById(id),
        authService.getCurrentUser().catch(() => null),
      ]);

      const oversight = viewer?.role
        ? OVERSIGHT_ROLES.includes(viewer.role)
        : false;

      setViewerId(viewer?.id ?? null);
      setIsOversight(oversight);

      /*
       * Only fetched for oversight, because only oversight can act on
       * it. assignable_officers() is SECURITY INVOKER, so an officer
       * calling it would get an empty list rather than a staff
       * directory — but not asking is better than asking and discarding.
       */
      if (oversight) {
        workOrderService
          .getAssignableOfficers()
          .then(setOfficers)
          .catch((officerError) => {
            console.error("Failed to load officers", officerError);
            setOfficers([]);
          });
      }

      if (!data) {
        setError("That work order could not be found.");
      } else {
        setOrder(data);
        // Loaded after the order: a missing trail is context, not a
        // reason to fail the page an officer came here to work from.
        setHistory(await workOrderService.getWorkOrderHistory(id));
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
      /*
       * Upload before the transition, not after: if storage rejects the
       * photo, the work order must stay in `in_progress` so the officer
       * can retry, rather than advancing to `proof_submitted` with
       * nothing for the supervisor to verify.
       *
       * The database now enforces the same ordering from the other
       * direction — a move to `proof_submitted` is refused unless a
       * resolution_proofs row already exists — so a failed upload
       * followed by a successful transition is no longer possible even
       * if this sequence were got wrong.
       */
      if (proofFile) {
        await workOrderService.uploadResolutionProof({
          workOrderId: id,
          file: proofFile,
          description: notes.trim() || undefined,
        });
      }

      const updated = await workOrderService.updateWorkOrderStatus({
        workOrderId: id,
        status: newStatus,
        notes: notes.trim() || undefined,
        // No timestamp: the database stamps the transition, and sending
        // one is now refused outright.
      });

      setOrder(updated);
      setNotes("");
      setProofFile(null);
      setProofPreview(null);

      // Re-read the trail so the entry this transition just produced —
      // with its actor and server timestamp — appears without a reload.
      setHistory(await workOrderService.getWorkOrderHistory(id));

      const MESSAGES: Partial<Record<WorkOrder["status"], string>> = {
        accepted: "Assignment accepted",
        in_progress: "Work started",
        proof_submitted: "Proof submitted for review",
        supervisor_review: "Proof approved, awaiting the citizen",
        citizen_confirmation: "Sent to the citizen to confirm",
        resolved: "Work order resolved",
        reopened: "Sent back for rework",
      };

      toast.success(MESSAGES[newStatus] ?? "Work order updated");
    } catch (updateError) {
      console.error("Failed to update status", updateError);

      /*
       * The database's refusals are written for the person reading them
       * — "Submit at least one photograph of the completed work first",
       * "A work order cannot move from resolved to in_progress" — and
       * carry a hint. Showing the message beats "Please try again" on an
       * error that retrying cannot fix.
       */
      toast.error("Couldn't update the work order", {
        description:
          updateError instanceof Error && updateError.message
            ? updateError.message
            : "Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  }

  /**
   * Hands the work order to another officer.
   *
   * Goes through assignComplaint() with the complaint id rather than
   * patching officer_id, so the one path that creates an assignment is
   * the one path that changes it — and the same trigger clears the
   * previous officer's timestamps either way.
   */
  async function reassign() {
    if (!order || !pendingOfficerId) return;

    setIsUpdating(true);

    try {
      const updated = await workOrderService.assignComplaint({
        complaintId: order.complaintId,
        officerId: pendingOfficerId,
        departmentId: order.departmentId || null,
      });

      setOrder(updated);
      setPendingOfficerId(null);
      setHistory(await workOrderService.getWorkOrderHistory(id));

      // Loads shift, so the picker's counts are now stale.
      setOfficers(await workOrderService.getAssignableOfficers());

      toast.success(`Assigned to ${updated.officerName || "the officer"}`);
    } catch (assignError) {
      console.error("Failed to reassign work order", assignError);

      toast.error("Couldn't reassign this work order", {
        description:
          assignError instanceof Error && assignError.message
            ? assignError.message
            : "Please try again.",
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

  /*
   * `isAssignee` gates the officer's own actions. Previously the page
   * offered "Accept assignment" to anyone who could open the URL, which
   * for a supervisor is every work order in the city — the database
   * refused it, so what they got was a policy error where a disabled
   * control belonged.
   */
  const isAssignee = Boolean(viewerId) && order.officerId === viewerId;

  /*
   * The site, if it has one. An officer navigates from this, so a
   * confident link to 0,0 is worse than no link — it sends them to the
   * wrong ocean rather than telling them the location was never recorded.
   */
  const sitePoint = toCoordinates(
    order.location.latitude,
    order.location.longitude
  );

  const isFinished = order.status === "resolved";
  const awaitingSignOff = [
    "proof_submitted",
    "supervisor_review",
    "citizen_confirmation",
  ].includes(order.status);

  const canSubmitProof =
    Boolean(proofPreview) && notes.trim().length >= RESOLUTION_NOTES_MIN;

  /** The officer's next step, or null when it is not theirs to take. */
  const officerAction = !isAssignee
    ? null
    : order.status === "assigned"
      ? ("accepted" as const)
      : order.status === "accepted"
        ? ("in_progress" as const)
        : order.status === "reopened"
          ? ("in_progress" as const)
          : order.status === "in_progress"
            ? ("proof_submitted" as const)
            : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { label: "Work Orders", href: "/officer/work-orders" },
          { label: order.workOrderNumber },
        ]}
        eyebrow={
          <span className="font-mono text-sm text-muted-foreground">{order.workOrderNumber}</span>
        }
        title={order.complaintTitle}
      />

      {/*
        ---------- Automatic assessment ----------

        The persisted analysis, read from the complaint through the work
        order join. Nothing is recomputed here: the officer sees exactly
        what triage stored, and exactly what the citizen sees.
      */}
      {(order.analysis.summary || order.analysis.priorityReason) && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-xs font-semibold text-foreground">
                  Automatic assessment
                </p>

                {order.analysis.possibleDuplicate && (
                  <Badge variant="warning" className="text-[0.6875rem]">
                    Possible duplicate
                  </Badge>
                )}
              </div>

              {order.analysis.summary && (
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {order.analysis.summary}
                </p>
              )}

              {order.analysis.priorityReason && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Priority rationale:
                  </span>{" "}
                  {order.analysis.priorityReason}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {order.analysis.confidence !== null && (
                  <span className="tabular">
                    {Math.round(order.analysis.confidence * 100)}% confidence
                  </span>
                )}

                {/*
                  Provenance matters operationally: an officer weighs a
                  keyword-engine guess differently from a model's reading,
                  and previously both were recorded under one hardcoded name.
                */}
                {order.analysis.model && <span>via {order.analysis.model}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Status strip ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
        <Badge
          variant={order.status === "assigned" ? "warning" : "info"}
          className="capitalize"
        >
          {WORK_ORDER_STATUS_LABELS[order.status]}
        </Badge>
        <PriorityBadge level={order.priorityLevel} score={order.priorityScore} />
        {/* The clock stops once the job is resolved, not once proof is
            filed — an SLA that expires during sign-off is still missed. */}
        {!isFinished && <SLAIndicator hoursRemaining={order.slaHoursRemaining} />}

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
              isFinished
                ? "rounded-lg border border-emerald-200 bg-emerald-50/60 p-5"
                : "rounded-lg border border-primary/40 bg-card p-5 shadow-sm"
            }
          >
            <h2
              id="action-heading"
              className="text-sm font-semibold text-foreground"
            >
              {isFinished
                ? "Resolved"
                : officerAction === "accepted"
                  ? "Accept this assignment"
                  : officerAction === "in_progress"
                    ? order.status === "reopened"
                      ? "Rework requested"
                      : "Start work"
                    : officerAction === "proof_submitted"
                      ? "Submit proof of completion"
                      : awaitingSignOff
                        ? "Verification"
                        : "Assigned to another officer"}
            </h2>

            {/*
              Someone who is neither the assignee nor oversight can reach
              this page — a supervisor's colleague, an admin browsing the
              queue. Saying so is better than showing them an "Accept"
              button that the database will refuse.
            */}
            {!isAssignee && !isOversight && !isFinished && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {order.officerName
                  ? `${order.officerName} is carrying out this work. You can review it here, but only the assigned officer can advance it.`
                  : "No officer has been assigned to this work order yet."}
              </p>
            )}

            {officerAction === "accepted" && (
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

            {officerAction === "in_progress" && (
              <div className="mt-3 space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {order.status === "reopened"
                    ? "This repair was rejected and has come back to you. Mark work as restarted once you are on site again."
                    : "Mark work as started once you are on site."}
                </p>
                <Button
                  onClick={() => updateStatus("in_progress")}
                  disabled={isUpdating}
                >
                  {isUpdating && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {order.status === "reopened" ? "Resume work" : "Start work"}
                </Button>
              </div>
            )}

            {officerAction === "proof_submitted" && (
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

            {isFinished && (
              <div className="mt-3 flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-emerald-900">
                    Work order resolved
                  </p>
                  <p className="mt-0.5 text-sm text-emerald-800/80">
                    {order.completedAt
                      ? `Closed ${formatDateTime(order.completedAt)}.`
                      : "The citizen's report is now marked resolved."}
                  </p>
                </div>
              </div>
            )}

            {/*
              ---------- Sign-off ----------

              The lifecycle used to dead-end here. An officer submitted
              proof, the panel said "awaiting supervisor verification",
              and nothing in the product could provide it — so no work
              order ever reached `resolved` and no citizen ever saw their
              report closed.

              Supervisors and admins already open this same page from the
              authority queue, so the verdict belongs on it rather than
              in a new screen. Every button here is authorised again by
              the state machine: an officer who forged the role flag
              would get a refusal, not a resolved work order.
            */}
            {awaitingSignOff && isOversight && (
              <div className="mt-4 space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {order.status === "proof_submitted"
                    ? "Check the photographs against what the citizen reported, then approve or send the job back."
                    : order.status === "supervisor_review"
                      ? "Proof is approved. Pass it to the citizen to confirm, or send it back for rework."
                      : "The citizen has been asked to confirm. Close the job, or send it back if they are not satisfied."}
                </p>

                <div>
                  <label
                    htmlFor="verdict-notes"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Notes{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional — the citizen sees these on their timeline)
                    </span>
                  </label>
                  <Textarea
                    id="verdict-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="What you checked, or what still needs doing."
                    className="min-h-20 resize-y"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {order.status === "proof_submitted" && (
                    <Button
                      onClick={() => updateStatus("supervisor_review")}
                      disabled={isUpdating}
                    >
                      {isUpdating && (
                        <Loader2
                          className="mr-1 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      Approve the proof
                    </Button>
                  )}

                  {order.status === "supervisor_review" && (
                    <Button
                      onClick={() => updateStatus("citizen_confirmation")}
                      disabled={isUpdating}
                    >
                      {isUpdating && (
                        <Loader2
                          className="mr-1 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      Ask the citizen to confirm
                    </Button>
                  )}

                  {order.status === "citizen_confirmation" && (
                    <Button
                      onClick={() => updateStatus("resolved")}
                      disabled={isUpdating}
                    >
                      {isUpdating && (
                        <Loader2
                          className="mr-1 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      Mark resolved
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => updateStatus("reopened")}
                    disabled={isUpdating}
                  >
                    Send back for rework
                  </Button>
                </div>
              </div>
            )}

            {/* Awaiting somebody else's verdict, with no verdict to give. */}
            {awaitingSignOff && !isOversight && (
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
                    {order.status === "citizen_confirmation"
                      ? "Awaiting the citizen's confirmation."
                      : "Awaiting supervisor verification and citizen confirmation."}
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

            {/*
              Offered only when there is somewhere to open.
              order.location.latitude used to be coalesced from null to 0,
              so this link was always rendered and, for an unlocated work
              order, sent the officer to the Gulf of Guinea.
            */}
            {sitePoint && (
              <div className="p-3">
                <Button asChild variant="outline" className="w-full">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${sitePoint.latitude}&mlon=${sitePoint.longitude}#map=18/${sitePoint.latitude}/${sitePoint.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />
                    Open in maps
                  </a>
                </Button>
              </div>
            )}
          </section>

          {/*
            ---------- Audit trail ----------

            The real one, from public.work_order_updates: every recorded
            transition, who made it, when, and what they wrote.

            This panel used to list four timestamp columns off the work
            order — Created, Assigned, Accepted, Started, Completed,
            Verified — which could not name an actor, and could not show
            a repair that came back: a second visit overwrites
            started_at, so a reopened job looked like it had only ever
            been done once. The audit table was being written the whole
            time and read for nothing but the latest note.
          */}
          <section
            aria-labelledby="trail-heading"
            className="rounded-lg border bg-card p-5"
          >
            <h2 id="trail-heading" className="text-sm font-semibold text-foreground">
              History
            </h2>

            {history.length > 0 ? (
              <ol className="mt-3 space-y-0 text-sm">
                {history.map((entry) => (
                  <li key={entry.id} className="border-b py-2.5 last:border-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-foreground">
                        {WORK_ORDER_STATUS_LABELS[entry.status]}
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {formatDateTime(entry.at)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {/* A transition with no session behind it — a
                          migration, a server task — is reported as such
                          rather than attributed to whoever is nearest. */}
                      {entry.actorName ?? "Recorded by the system"}
                    </p>

                    {entry.note && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {entry.note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No transitions have been recorded yet.
              </p>
            )}

            <dl className="mt-4 border-t pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
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
              {order.officerId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Assigned</dt>
                  <dd className="text-xs text-foreground">
                    {formatDateTime(order.assignedAt)}
                  </dd>
                </div>
              )}
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
                  {order.complaintNumber || order.complaintId}
                </dd>
              </div>
            </dl>

            {/*
              ---------- Assign or reassign ----------

              Only oversight, mirroring enforce_work_order_authority():
              an assigned officer changing officer_id is refused with
              "Only a supervisor or administrator may reassign a work
              order", so offering the control to them would be offering
              a refusal.

              An unassigned work order could previously not be advanced
              by anybody and had nowhere in the product to give it an
              owner, so it sat in the queue permanently. Reassigning also
              clears the previous officer's acceptance and start times —
              those describe work this assignee has not done — while the
              audit trail keeps the whole history.
            */}
            {isOversight && !isFinished && (
              <div className="mt-4 border-t pt-4">
                <label
                  htmlFor="assign-officer"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  {order.officerId ? "Reassign to" : "Assign to"}
                </label>

                {officers === null ? (
                  <Skeleton className="h-9 w-full rounded-md" />
                ) : officers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No officers are available to assign.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Select
                      value={pendingOfficerId ?? ""}
                      onValueChange={setPendingOfficerId}
                    >
                      <SelectTrigger id="assign-officer">
                        <SelectValue placeholder="Choose an officer" />
                      </SelectTrigger>
                      <SelectContent>
                        {officers
                          .filter((candidate) => candidate.id !== order.officerId)
                          .map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.name} — {candidate.openWorkOrders} open
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={isUpdating || !pendingOfficerId}
                      onClick={reassign}
                    >
                      {isUpdating && (
                        <Loader2
                          className="mr-1 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {order.officerId ? "Reassign" : "Assign"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
