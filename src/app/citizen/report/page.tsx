"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { StepIndicator, type Step } from "@/components/shared/StepIndicator";
import { CategoryPicker, toDatabaseCategory } from "@/components/report/CategoryPicker";
import { PhotoUpload } from "@/components/report/PhotoUpload";
import { LocationPicker } from "@/components/map/LocationPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CopyButton } from "@/components/shared/CopyButton";
import { formatCategory } from "@/lib/design/status";
import { COMPLAINT_CATEGORIES } from "@/lib/constants";
import {
  createComplaint,
  uploadComplaintEvidence,
} from "@/lib/services/complaints";
import type { Complaint } from "@/types/complaint";

/**
 * ============================================================
 * REPORT AN ISSUE
 * ============================================================
 *
 * Four steps rather than six: category and photo belong together
 * ("what happened"), and location is a single step because GPS
 * usually answers it in one tap. Progressive disclosure keeps each
 * screen to one decision.
 *
 * Validation is per-step and inline, so the user is never told about
 * a problem three screens after causing it.
 *
 * SUBMISSION
 *
 * createComplaint() carries a submissionKey generated once per form
 * fill, and submit_complaint() is idempotent on it. That is what makes
 * the Submit button safe to press twice: previously, if the insert
 * succeeded and the response was lost, the form showed an error and a
 * second press filed the same issue again.
 *
 * Evidence is uploaded after the complaint exists, because object
 * storage cannot join the complaint's transaction. A failed upload
 * therefore leaves a valid report and a retryable file rather than
 * rolling anything back — hence the retry on the confirmation screen.
 *
 * Triage is not triggered from here. The detail page runs it whenever a
 * complaint has not been through it, so closing this tab straight after
 * submitting no longer leaves a report permanently untriaged and
 * unrouted.
 */

const STEPS: Step[] = [
  { key: "what", label: "What happened" },
  { key: "where", label: "Location" },
  { key: "details", label: "Details" },
  { key: "review", label: "Review" },
];

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;
const DESCRIPTION_MIN = 10;

interface FormState {
  category: string | null;
  file: File | null;
  previewUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string;
  title: string;
  description: string;
}

export default function ReportIssuePage() {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Complaint | null>(null);

  /*
   * The photo that did not upload, kept so the confirmation screen can
   * retry it. The complaint already exists at that point, so this is the
   * only outstanding work.
   */
  const [pendingEvidence, setPendingEvidence] = useState<File | null>(null);
  const [isRetryingUpload, setIsRetryingUpload] = useState(false);

  /*
   * One key per attempt to file one report.
   *
   * Generated with crypto.randomUUID in a ref so it survives re-renders
   * and, crucially, survives a failed submit — the retry then carries the
   * same key and submit_complaint() returns the existing complaint
   * instead of creating a second one. Regenerated only after a
   * successful submission, so "Report another" starts a genuinely new
   * report.
   */
  const [submissionKey, setSubmissionKey] = useState<string>(() =>
    crypto.randomUUID()
  );

  const [form, setForm] = useState<FormState>({
    category: null,
    file: null,
    previewUrl: null,
    latitude: null,
    longitude: null,
    address: "",
    title: "",
    description: "",
  });

  /*
   * The page owns every object URL it creates.
   *
   * PhotoUpload used to revoke previewUrl in an unmount cleanup, which
   * fired the moment the wizard left step 1 — so the review step and the
   * upload progress preview both rendered a revoked blob: URL as a broken
   * image. Revocation now happens here, where the URL's lifetime is
   * actually known: when it is replaced, cleared, or the page goes away.
   */
  const update = useCallback((patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  /*
   * One effect owns each object URL's lifetime: the cleanup runs when
   * previewUrl is replaced and again when the page unmounts, which is
   * exactly when the URL stops being needed. The wizard keeps this page
   * mounted across all four steps, so — unlike the cleanup that used to
   * live in PhotoUpload — it cannot fire while the review screen is
   * still displaying the photo.
   */
  useEffect(() => {
    const url = form.previewUrl;

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [form.previewUrl]);

  /**
   * Coordinates within range and not 0,0.
   *
   * A failed GPS read and Null Island are indistinguishable, and Leaflet
   * hands back longitudes beyond ±180 once the map has been panned across
   * the antimeridian. submit_complaint() rejects both, so catching them
   * here is the difference between an inline message and a failed
   * submission.
   */
  function coordinateProblem(
    latitude: number | null,
    longitude: number | null
  ): string | null {
    if (latitude === null || longitude === null) {
      return "We need the location. Use your current location, or tap the map to place a pin.";
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return "Those coordinates aren't valid. Please place the pin again.";
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return "Those coordinates are out of range. Please place the pin again.";
    }

    if (latitude === 0 && longitude === 0) {
      return "That looks like a failed location read. Please capture your location again or place the pin on the map.";
    }

    return null;
  }

  /** Validates the current step, returning true when it may be left. */
  function validateStep(index: number): boolean {
    const next: Record<string, string> = {};

    if (index === 0 && !form.category) {
      next.category = "Please choose the kind of issue you're reporting.";
    }

    if (index === 1) {
      const problem = coordinateProblem(form.latitude, form.longitude);
      if (problem) next.location = problem;

      if (form.address.trim().length < 5) {
        next.address = "Please enter an address or nearby landmark.";
      }
    }

    if (index === 2) {
      if (form.title.trim().length < 5) {
        next.title = "Please give the issue a short title (at least 5 characters).";
      }
      if (form.description.trim().length < DESCRIPTION_MIN) {
        next.description = `Please add a little more detail (at least ${DESCRIPTION_MIN} characters).`;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setErrors({});
    setStep((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    // Re-validate every step: a user can reach review then edit back.
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      if (!validateStep(index)) {
        setStep(index);
        return;
      }
    }

    // Belt and braces against a double-fire from a fast double click.
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    let complaint: Complaint;

    try {
      complaint = await createComplaint({
        submissionKey,
        title: form.title.trim(),
        description: form.description.trim(),
        // Stored as the DB enum; triage refines this and keeps its
        // richer classification in ai_category.
        category: toDatabaseCategory(form.category ?? "other"),
        latitude: form.latitude,
        longitude: form.longitude,
        address: form.address.trim(),
        wardId: null,
      });
    } catch (error) {
      console.error("Failed to submit report:", error);

      /*
       * Nothing is cleared. The form keeps everything the citizen typed
       * and the photo they chose, so pressing Submit again retries with
       * the same submission key rather than starting over.
       */
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't submit your report. Please check your connection and try again."
      );
      setIsSubmitting(false);
      setUploadProgress(null);
      return;
    }

    /*
     * The report exists from here on, so no failure below may present
     * itself as a failed submission.
     */
    if (form.file) {
      setUploadProgress(40);

      try {
        await uploadComplaintEvidence(complaint.id, form.file);
        setUploadProgress(100);
      } catch (uploadError) {
        console.error("Evidence upload failed:", uploadError);

        // Held for the retry on the confirmation screen.
        setPendingEvidence(form.file);
        setCreated(complaint);
        setIsSubmitting(false);
        setUploadProgress(null);

        toast.warning("Report submitted, but the photo didn't upload", {
          description:
            uploadError instanceof Error && uploadError.message
              ? uploadError.message
              : "You can try the upload again below.",
        });
        return;
      }
    }

    finishSubmission(complaint);

    toast.success("Report submitted", {
      description: `Tracking ID ${complaint.complaint_number}`,
    });
  }

  /** Shared tail of a successful submission. */
  function finishSubmission(complaint: Complaint) {
    setCreated(complaint);
    setPendingEvidence(null);
    setIsSubmitting(false);
    setUploadProgress(null);

    /*
     * A fresh key, so "Report another" cannot be folded into this
     * report by the idempotency check.
     */
    setSubmissionKey(crypto.randomUUID());
  }

  /**
   * Retries just the photo.
   *
   * The complaint is already filed, so this never re-submits it — which
   * is why the file is kept rather than the citizen being asked to start
   * again with a report that already exists.
   */
  async function retryEvidenceUpload() {
    if (!created || !pendingEvidence || isRetryingUpload) return;

    setIsRetryingUpload(true);

    try {
      await uploadComplaintEvidence(created.id, pendingEvidence);

      setPendingEvidence(null);

      toast.success("Photo attached", {
        description: "It is now part of your report.",
      });
    } catch (retryError) {
      console.error("Evidence retry failed:", retryError);

      toast.error("The photo still didn't upload", {
        description:
          retryError instanceof Error && retryError.message
            ? retryError.message
            : "Please try again in a moment.",
      });
    } finally {
      setIsRetryingUpload(false);
    }
  }

  /* ============================================================
     CONFIRMATION
     ============================================================ */
  if (created) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border bg-card p-6 text-center sm:p-10">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />
          </span>

          <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground">
            Your report is in
          </h1>
          <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            It will be categorised and routed to the responsible department. You
            can follow every stage from your reports.
          </p>

          {/* Tracking ID — the single most useful thing to keep. */}
          <div className="mt-7 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tracking ID
            </p>
            <div className="mt-1.5 flex items-center justify-center gap-1.5">
              <p className="font-mono text-lg font-semibold text-foreground">
                {created.complaint_number}
              </p>
              <CopyButton value={created.complaint_number} label="Tracking ID" />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <StatusBadge status={created.status} showIcon />
          </div>

          {/*
            The report is filed but its photo is not. Offering the retry
            here is what makes the earlier warning actionable — the copy
            used to say "you can add evidence from the report page", which
            had no such affordance.
          */}
          {pendingEvidence && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Your photo didn&apos;t upload
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-800/80">
                    The report itself is saved. You can try attaching{" "}
                    <span className="font-medium">{pendingEvidence.name}</span>{" "}
                    again.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={retryEvidenceUpload}
                    disabled={isRetryingUpload}
                    className="mt-3"
                  >
                    {isRetryingUpload ? (
                      <>
                        <Loader2
                          className="mr-1 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Uploading…
                      </>
                    ) : (
                      "Retry photo upload"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href={`/citizen/complaints/${created.id}?process=ai`}>
                Track this issue
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                /*
                 * Reset in place rather than navigating to the same
                 * route, which Next.js treats as a no-op and which left
                 * the confirmation screen on display.
                 */
                setCreated(null);
                setPendingEvidence(null);
                setSubmitError(null);
                setErrors({});
                setStep(0);
                setForm({
                  category: null,
                  file: null,
                  previewUrl: null,
                  latitude: null,
                  longitude: null,
                  address: "",
                  title: "",
                  description: "",
                });
              }}
            >
              Report another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================
     WIZARD
     ============================================================ */
  const selectedCategory = COMPLAINT_CATEGORIES.find(
    (c) => c.value === form.category
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Report an issue"
        description="Four quick steps. Everything you submit helps the right team arrive prepared."
        backHref="/citizen"
        backLabel="Dashboard"
      />

      <StepIndicator steps={STEPS} current={step} className="mb-8" />

      {submitError && (
        <Alert variant="destructive" className="mb-6" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* ---------- STEP 1: WHAT ---------- */}
      {step === 0 && (
        <section className="space-y-7" aria-labelledby="step-what">
          <div>
            <h2 id="step-what" className="text-lg font-semibold text-foreground">
              What kind of issue is it?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick the closest match — this decides which department gets it.
            </p>

            <div className="mt-4">
              <CategoryPicker
                value={form.category}
                onChange={(value) => {
                  update({ category: value });
                  setErrors((e) => ({ ...e, category: "" }));
                }}
                disabled={isSubmitting}
              />
            </div>

            {errors.category && (
              <p role="alert" className="mt-3 text-sm font-medium text-destructive">
                {errors.category}
              </p>
            )}
          </div>

          <Separator />

          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Add a photo{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (recommended)
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reports with a photo are easier to prioritise and verify.
            </p>

            <div className="mt-4">
              <PhotoUpload
                file={form.file}
                previewUrl={form.previewUrl}
                onSelect={(file, previewUrl) => update({ file, previewUrl })}
                // The effect above revokes the outgoing URL; clearing
                // here as well would revoke it twice.
                onClear={() => update({ file: null, previewUrl: null })}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </section>
      )}

      {/* ---------- STEP 2: WHERE ---------- */}
      {step === 1 && (
        <section className="space-y-4" aria-labelledby="step-where">
          <div>
            <h2 id="step-where" className="text-lg font-semibold text-foreground">
              Where is it?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Accurate location means the crew finds it first time.
            </p>
          </div>

          {errors.location && (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{errors.location}</AlertDescription>
            </Alert>
          )}

          <LocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            address={form.address}
            onLocationChange={({ latitude, longitude, address }) => {
              update({
                latitude,
                longitude,
                ...(address !== undefined ? { address } : {}),
              });
              setErrors((e) => ({ ...e, location: "", address: "" }));
            }}
            onAddressChange={(address) => {
              update({ address });
              setErrors((e) => ({ ...e, address: "" }));
            }}
            disabled={isSubmitting}
            error={errors.address}
          />
        </section>
      )}

      {/* ---------- STEP 3: DETAILS ---------- */}
      {step === 2 && (
        <section className="space-y-6" aria-labelledby="step-details">
          <div>
            <h2 id="step-details" className="text-lg font-semibold text-foreground">
              Describe the issue
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A clear description helps the team bring the right equipment.
            </p>
          </div>

          <div>
            <label
              htmlFor="report-title"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Title
            </label>
            <Input
              id="report-title"
              value={form.title}
              maxLength={TITLE_MAX}
              onChange={(event) => {
                update({ title: event.target.value });
                setErrors((e) => ({ ...e, title: "" }));
              }}
              placeholder="e.g. Deep pothole outside the school gate"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "report-title-error" : undefined}
              className="h-11"
            />
            <div className="mt-2 flex items-start justify-between gap-3">
              {errors.title ? (
                <p
                  id="report-title-error"
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {errors.title}
                </p>
              ) : (
                <span />
              )}
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                {form.title.length}/{TITLE_MAX}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="report-description"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Description
            </label>
            <Textarea
              id="report-description"
              value={form.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => {
                update({ description: event.target.value });
                setErrors((e) => ({ ...e, description: "" }));
              }}
              placeholder="What is wrong, how bad is it, and is anyone at risk? Mention anything that would help the crew prepare."
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? "report-description-error" : undefined
              }
              className="min-h-36 resize-y"
            />
            <div className="mt-2 flex items-start justify-between gap-3">
              {errors.description ? (
                <p
                  id="report-description-error"
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {errors.description}
                </p>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Mention any safety risk first.
                </span>
              )}
              <span className="tabular shrink-0 text-xs text-muted-foreground">
                {form.description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ---------- STEP 4: REVIEW ---------- */}
      {step === 3 && (
        <section className="space-y-5" aria-labelledby="step-review">
          <div>
            <h2 id="step-review" className="text-lg font-semibold text-foreground">
              Check before you send
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can still go back and change anything.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            {form.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.previewUrl}
                alt="The photo attached to this report"
                className="max-h-64 w-full bg-neutral-900 object-contain"
              />
            )}

            <dl className="divide-y">
              <ReviewRow
                label="Category"
                value={selectedCategory?.label ?? formatCategory(form.category)}
                onEdit={() => setStep(0)}
              />
              <ReviewRow
                label="Location"
                value={form.address}
                secondary={
                  form.latitude !== null && form.longitude !== null
                    ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
                    : undefined
                }
                onEdit={() => setStep(1)}
              />
              <ReviewRow
                label="Title"
                value={form.title}
                onEdit={() => setStep(2)}
              />
              <ReviewRow
                label="Description"
                value={form.description}
                onEdit={() => setStep(2)}
              />
              <ReviewRow
                label="Photo"
                value={form.file ? form.file.name : "No photo attached"}
                muted={!form.file}
                onEdit={() => setStep(0)}
              />
            </dl>
          </div>

          {form.file && uploadProgress !== null && (
            <PhotoUpload
              file={form.file}
              previewUrl={form.previewUrl}
              onSelect={() => undefined}
              onClear={() => undefined}
              disabled
              progress={uploadProgress}
            />
          )}
        </section>
      )}

      {/* ---------- NAVIGATION ---------- */}
      <div className="mt-9 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
        ) : (
          <Button type="button" variant="ghost" asChild>
            <Link href="/citizen">Cancel</Link>
          </Button>
        )}

        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext} size="lg">
            Continue
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            size="lg"
            className="sm:min-w-44"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="mr-1 h-4 w-4" aria-hidden="true" />
                Submit report
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One row of the review summary, with a jump-back edit link. */
function ReviewRow({
  label,
  value,
  secondary,
  muted,
  onEdit,
}: {
  label: string;
  value: string;
  secondary?: string;
  muted?: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start gap-4 p-4">
      <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">
        <p
          className={
            muted
              ? "text-sm italic text-muted-foreground"
              : "whitespace-pre-wrap break-words text-sm text-foreground"
          }
        >
          {value || "—"}
        </p>
        {secondary && (
          <p className="tabular mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {secondary}
          </p>
        )}
      </dd>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded text-xs font-semibold text-primary transition-colors hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Edit
      </button>
    </div>
  );
}
