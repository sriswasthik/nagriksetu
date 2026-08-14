"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

import Link from "next/link";

import {
  processComplaintWithAI,
} from "@/lib/services/ai";

import {
  getComplaintDetails,
  type ComplaintDetails,
} from "@/lib/services/complaints";

import type {
  ComplaintStatus,
} from "@/types/complaint";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Badge,
} from "@/components/ui/badge";

import {
  Button,
} from "@/components/ui/button";

import {
  Separator,
} from "@/components/ui/separator";

import {
  StatusBadge,
} from "@/components/shared/StatusBadge";

import {
  PriorityBadge,
} from "@/components/shared/PriorityBadge";


/*
 * ============================================================
 * STATUS ORDER
 * ============================================================
 */

const statusOrder: ComplaintStatus[] = [
  "submitted",
  "ai_analyzed",
  "assigned",
  "accepted",
  "in_progress",
  "proof_submitted",
  "supervisor_review",
  "citizen_confirmation",
  "resolved",
];


/*
 * ============================================================
 * PAGE
 * ============================================================
 */

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

  const shouldProcessAI =
    searchParams.get("process") === "ai";


  /*
   * ----------------------------------------------------------
   * STATE
   * ----------------------------------------------------------
   */

  const [
    details,
    setDetails,
  ] = useState<ComplaintDetails | null>(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    isProcessingAI,
    setIsProcessingAI,
  ] = useState(false);

  const [
    aiError,
    setAIError,
  ] = useState<string | null>(null);

  const [
    error,
    setError,
  ] = useState<string | null>(null);


  /*
   * ==========================================================
   * LOAD DETAILS
   * ==========================================================
   */

  const loadDetails = useCallback(
    async (
      showLoader = true
    ) => {
      if (!complaintId) {
        setError(
          "Invalid complaint ID."
        );

        setIsLoading(false);

        return null;
      }

      if (showLoader) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setError(null);

      try {
        const result =
          await getComplaintDetails(
            complaintId
          );

        setDetails(result);

        return result;
      } catch (loadError) {
        console.error(
          "[ComplaintDetails] Failed to load complaint:",
          loadError
        );

        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load complaint details.";

        setError(message);

        return null;
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [complaintId]
  );


  /*
   * ==========================================================
   * INITIAL LOAD
   * ==========================================================
   */

  useEffect(() => {
    if (!complaintId) {
      return;
    }

    loadDetails(true);
  }, [
    complaintId,
    loadDetails,
  ]);


  /*
   * ==========================================================
   * AI PROCESSING
   * ==========================================================
   *
   * IMPORTANT:
   *
   * The previous version calculated:
   *
   *     shouldProcessAI
   *
   * but never actually called:
   *
   *     processComplaintWithAI()
   *
   * This effect performs the complete AI workflow.
   *
   * URL:
   *
   *     /citizen/complaints/[id]?process=ai
   *
   * Flow:
   *
   *     1. Start AI
   *     2. AI analyzes complaint
   *     3. AI updates category / priority / department
   *     4. Reload complaint
   *     5. Remove ?process=ai
   *     6. Show updated values
   * ==========================================================
   */

  useEffect(() => {
    if (
      !shouldProcessAI ||
      !complaintId
    ) {
      return;
    }

    let cancelled = false;

    async function runAIAnalysis() {
      try {
        setIsProcessingAI(true);
        setAIError(null);

        console.log(
          "[ComplaintDetails] Starting AI analysis:",
          complaintId
        );

        const result =
          await processComplaintWithAI(
            complaintId
          );

        console.log(
          "[ComplaintDetails] AI analysis result:",
          result
        );

        if (cancelled) {
          return;
        }

        /*
         * ------------------------------------------------------
         * HANDLE FAILED RESULT
         * ------------------------------------------------------
         */

        if (
          result &&
          typeof result === "object" &&
          "success" in result &&
          result.success === false
        ) {
          throw new Error(
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "AI analysis failed."
          );
        }

        /*
         * ------------------------------------------------------
         * RELOAD DATABASE DATA
         * ------------------------------------------------------
         *
         * This is important.
         *
         * processComplaintWithAI() updates Supabase.
         * The existing `details` React state does not
         * automatically know about that update.
         */

        console.log(
          "[ComplaintDetails] Reloading complaint after AI..."
        );

        const refreshed =
          await getComplaintDetails(
            complaintId
          );

        if (cancelled) {
          return;
        }

        if (!refreshed) {
          throw new Error(
            "Complaint could not be loaded after AI analysis."
          );
        }

        console.log(
          "[ComplaintDetails] Updated complaint:",
          refreshed.complaint
        );

        setDetails(
          refreshed
        );

        /*
         * ------------------------------------------------------
         * REMOVE AI QUERY PARAMETER
         * ------------------------------------------------------
         *
         * Prevents AI from running again on every refresh.
         */

        const url =
          new URL(
            window.location.href
          );

        url.searchParams.delete(
          "process"
        );

        window.history.replaceState(
          {},
          "",
          url.pathname +
            (
              url.search
                ? url.search
                : ""
            )
        );

        /*
         * ------------------------------------------------------
         * FINAL REFRESH
         * ------------------------------------------------------
         *
         * Give React a moment to render the updated values.
         */

        setTimeout(() => {
          if (!cancelled) {
            loadDetails(false);
          }
        }, 250);

      } catch (aiProcessingError) {
        console.error(
          "[ComplaintDetails] AI processing failed:",
          aiProcessingError
        );

        if (!cancelled) {
          setAIError(
            aiProcessingError instanceof Error
              ? aiProcessingError.message
              : "AI analysis failed."
          );
        }
      } finally {
        if (!cancelled) {
          setIsProcessingAI(false);
        }
      }
    }

    runAIAnalysis();

    return () => {
      cancelled = true;
    };
  }, [
    shouldProcessAI,
    complaintId,
    loadDetails,
  ]);


  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (isLoading && !details) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">

            <Loader2
              className="
                h-8 w-8
                animate-spin
                text-primary
              "
            />

            <p className="text-sm text-muted-foreground">
              Loading complaint details...
            </p>

          </div>
        </div>
      </div>
    );
  }


  /*
   * ==========================================================
   * ERROR
   * ==========================================================
   */

  if (
    error ||
    !details
  ) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">

            <div className="
              mb-4
              flex h-12 w-12
              items-center justify-center
              rounded-full
              bg-destructive/10
            ">
              <FileText
                className="
                  h-6 w-6
                  text-destructive
                "
              />
            </div>

            <h2 className="text-lg font-semibold">
              Unable to load complaint
            </h2>

            <p className="
              mt-2
              max-w-md
              text-sm
              text-muted-foreground
            ">
              {error ??
                "The requested complaint could not be found."}
            </p>

            <div className="mt-6 flex gap-3">

              <Button
                variant="outline"
                onClick={() =>
                  router.back()
                }
              >
                Go Back
              </Button>

              <Button
                onClick={() =>
                  loadDetails()
                }
              >
                Try Again
              </Button>

            </div>

          </CardContent>
        </Card>
      </div>
    );
  }


  /*
   * ==========================================================
   * DATA
   * ==========================================================
   */

  const {
    complaint,
    media,
  } = details;

  const currentStatus =
    complaint.status;

  const currentStatusIndex =
    statusOrder.indexOf(
      currentStatus
    );

  const formattedDate =
    new Date(
      complaint.created_at
    ).toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );


  /*
   * ==========================================================
   * TIMELINE STEP
   * ==========================================================
   */

  /*
 * ============================================================
 * TIMELINE STATE
 * ============================================================
 *
 * Complaint workflow has two related states:
 *
 * 1. complaint.status
 * 2. complaint.ai_analysis_status
 *
 * AI analysis can complete before complaint.status moves
 * from "submitted" to "ai_analyzed".
 *
 * Therefore the timeline must consider BOTH.
 */

const aiAnalysisStatus =
  (
    complaint as typeof complaint & {
      ai_analysis_status?: string | null;
    }
  ).ai_analysis_status ?? null;

const departmentAssigned =
  Boolean(
    complaint.department_id
  );

let currentStep = 0;

/*
 * ------------------------------------------------------------
 * RESOLVED
 * ------------------------------------------------------------
 */

if (
  currentStatus === "resolved"
) {
  currentStep = 4;
}

/*
 * ------------------------------------------------------------
 * OFFICER WORKFLOW
 * ------------------------------------------------------------
 */

else if (
  currentStatus === "accepted" ||
  currentStatus === "in_progress" ||
  currentStatus === "proof_submitted" ||
  currentStatus === "supervisor_review" ||
  currentStatus === "citizen_confirmation"
) {
  currentStep = 3;
}

/*
 * ------------------------------------------------------------
 * DEPARTMENT ASSIGNMENT
 * ------------------------------------------------------------
 */

else if (
  currentStatus === "assigned" ||
  departmentAssigned
) {
  currentStep = 2;
}

/*
 * ------------------------------------------------------------
 * AI ANALYSIS
 * ------------------------------------------------------------
 *
 * Important:
 *
 * Even if complaint.status is still "submitted",
 * completed/running AI analysis should move the timeline
 * to the AI stage.
 */

else if (
  currentStatus === "ai_analyzed" ||
  aiAnalysisStatus === "processing" ||
  aiAnalysisStatus === "analyzing" ||
  aiAnalysisStatus === "completed" ||
  aiAnalysisStatus === "complete"
) {
  currentStep = 1;
}

/*
 * ------------------------------------------------------------
 * SUBMITTED
 * ------------------------------------------------------------
 */

else {
  currentStep = 0;
}


  /*
   * ==========================================================
   * TIMELINE
   * ==========================================================
   */

  const timelineSteps = [
    {
      title:
        "Complaint Submitted",

      description:
        "Your complaint has been successfully registered.",

      icon:
        CheckCircle2,
    },

    {
      title:
        "AI Analysis",

      description:
  isProcessingAI ||
  aiAnalysisStatus === "processing" ||
  aiAnalysisStatus === "analyzing"
    ? "The complaint is being analyzed and prioritized automatically."
    : currentStep >= 1
      ? "The complaint has been analyzed and prioritized automatically."
      : "The complaint will be analyzed and prioritized automatically.",

      icon:
        Sparkles,
    },

    {
      title:
        "Department Assignment",

      description:
  currentStep >= 2
    ? "The complaint has been routed to the appropriate department."
    : "The complaint will be routed to the appropriate department.",

      icon:
        UserCheck,
    },

    {
      title:
        "Officer Action",

      description:
        currentStep >= 3
          ? "A responsible officer is working on the issue."
          : "A responsible officer will work on the issue.",

      icon:
        Clock3,
    },

    {
      title:
        "Resolution",

      description:
        currentStep >= 4
          ? "The issue has been marked as resolved."
          : "The issue will be marked resolved after completion.",

      icon:
        CheckCircle2,
    },
  ];


  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ======================================================
          HEADER
      ======================================================= */}

      <div className="
        flex
        flex-col
        gap-4
        sm:flex-row
        sm:items-center
        sm:justify-between
      ">

        <div>

          <Link
            href="/citizen/complaints"
            className="
              mb-3
              inline-flex
              items-center
              text-sm
              text-muted-foreground
              transition-colors
              hover:text-foreground
            "
          >
            <ArrowLeft
              className="
                mr-2
                h-4 w-4
              "
            />

            My Complaints
          </Link>

          <h1 className="
            text-2xl
            font-bold
            tracking-tight
          ">
            Complaint Details
          </h1>

          <p className="
            mt-1
            text-sm
            text-muted-foreground
          ">
            Track the progress of your civic complaint.
          </p>

        </div>

        <Button
          variant="outline"
          onClick={() =>
            loadDetails(false)
          }
          disabled={
            isRefreshing ||
            isProcessingAI
          }
        >

          {isRefreshing ? (
            <Loader2
              className="
                mr-2
                h-4 w-4
                animate-spin
              "
            />
          ) : (
            <RefreshCw
              className="
                mr-2
                h-4 w-4
              "
            />
          )}

          Refresh

        </Button>

      </div>


      {/* ======================================================
          AI PROCESSING BANNER
      ======================================================= */}

      {isProcessingAI && (
        <Card className="
          border-primary/30
          bg-primary/5
        ">
          <CardContent className="
            flex
            items-center
            gap-4
            py-4
          ">

            <div className="
              flex
              h-10 w-10
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-primary/10
              text-primary
            ">
              <Sparkles
                className="
                  h-5 w-5
                  animate-pulse
                "
              />
            </div>

            <div>
              <p className="
                font-semibold
                text-sm
              ">
                AI is analyzing your complaint
              </p>

              <p className="
                mt-1
                text-xs
                text-muted-foreground
              ">
                Determining category, priority, and responsible department...
              </p>
            </div>

          </CardContent>
        </Card>
      )}


      {/* ======================================================
          AI ERROR
      ======================================================= */}

      {aiError && (
        <Card className="
          border-destructive/30
          bg-destructive/5
        ">
          <CardContent className="
            flex
            items-center
            justify-between
            gap-4
            py-4
          ">

            <div>
              <p className="
                font-semibold
                text-sm
                text-destructive
              ">
                AI analysis could not be completed
              </p>

              <p className="
                mt-1
                text-xs
                text-muted-foreground
              ">
                {aiError}
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.location.reload()
              }
            >
              Retry
            </Button>

          </CardContent>
        </Card>
      )}


      {/* ======================================================
          COMPLAINT SUMMARY
      ======================================================= */}

      <Card>

        <CardHeader>

          <div className="
            flex
            flex-col
            gap-4
            sm:flex-row
            sm:items-start
            sm:justify-between
          ">

            <div>

              <p className="
                text-xs
                font-medium
                uppercase
                tracking-wider
                text-muted-foreground
              ">
                Complaint Number
              </p>

              <CardTitle className="
                mt-1
                font-mono
                text-lg
              ">
                {complaint.complaint_number}
              </CardTitle>

            </div>

            <StatusBadge
              status={
                complaint.status
              }
            />

          </div>

        </CardHeader>

        <CardContent className="space-y-5">

          <div>

            <h2 className="
              text-xl
              font-semibold
            ">
              {complaint.title}
            </h2>

            <p className="
              mt-2
              whitespace-pre-wrap
              text-sm
              leading-6
              text-muted-foreground
            ">
              {complaint.description}
            </p>

          </div>

          <Separator />

          <div className="
            grid
            gap-4
            sm:grid-cols-3
          ">

            {/* CATEGORY */}

            <div>

              <p className="
                text-xs
                font-medium
                uppercase
                tracking-wide
                text-muted-foreground
              ">
                Category
              </p>

              <p className="
                mt-1
                text-sm
                font-medium
                capitalize
              ">
                {complaint.category
                  ? complaint.category.replace(
                      /_/g,
                      " "
                    )
                  : "Pending AI Analysis"}
              </p>

            </div>


            {/* PRIORITY */}

            <div>

              <p className="
                text-xs
                font-medium
                uppercase
                tracking-wide
                text-muted-foreground
              ">
                Priority
              </p>

              <div className="mt-1">

                {complaint.priority_level ? (
                  <PriorityBadge
                    level={
                      complaint.priority_level
                    }
                  />
                ) : (
                  <Badge variant="outline">
                    Pending AI Analysis
                  </Badge>
                )}

              </div>

            </div>


            {/* CREATED */}

            <div>

              <p className="
                text-xs
                font-medium
                uppercase
                tracking-wide
                text-muted-foreground
              ">
                Submitted
              </p>

              <p className="
                mt-1
                text-sm
                font-medium
              ">
                {formattedDate}
              </p>

            </div>

          </div>

        </CardContent>

      </Card>


      {/* ======================================================
          EVIDENCE
      ======================================================= */}

      <Card>

        <CardHeader>

          <CardTitle className="
            flex
            items-center
            gap-2
            text-lg
          ">

            <FileText
              className="
                h-5 w-5
                text-primary
              "
            />

            Evidence

          </CardTitle>

        </CardHeader>

        <CardContent>

          {media.length === 0 ? (

            <div className="
              rounded-xl
              border
              border-dashed
              py-10
              text-center
            ">

              <FileText
                className="
                  mx-auto
                  h-8 w-8
                  text-muted-foreground
                "
              />

              <p className="
                mt-3
                text-sm
                font-medium
              ">
                No evidence uploaded
              </p>

              <p className="
                mt-1
                text-xs
                text-muted-foreground
              ">
                No photos or evidence are attached to this complaint.
              </p>

            </div>

          ) : (

            <div className="
              grid
              gap-4
              sm:grid-cols-2
              lg:grid-cols-3
            ">

              {media.map(
                (item) => (
                  <a
                    key={item.id}
                    href={
                      item.signedUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      group
                      overflow-hidden
                      rounded-xl
                      border
                      bg-muted/20
                    "
                  >

                    <div className="
                      aspect-video
                      overflow-hidden
                      bg-muted
                    ">

                      {/* eslint-disable-next-line @next/next/no-img-element */}

                      <img
                        src={
                          item.signedUrl
                        }
                        alt={
                          item.file_name
                        }
                        className="
                          h-full
                          w-full
                          object-cover
                          transition-transform
                          duration-300
                          group-hover:scale-105
                        "
                      />

                    </div>

                    <div className="p-3">

                      <p className="
                        truncate
                        text-sm
                        font-medium
                      ">
                        {item.file_name}
                      </p>

                      <p className="
                        mt-1
                        text-xs
                        text-muted-foreground
                      ">
                        {item.file_size
                          ? `${(
                              item.file_size /
                              1024 /
                              1024
                            ).toFixed(
                              2
                            )} MB`
                          : item.file_type}
                      </p>

                    </div>

                  </a>
                )
              )}

            </div>

          )}

        </CardContent>

      </Card>


      {/* ======================================================
          LOCATION
      ======================================================= */}

      <Card>

        <CardHeader>

          <CardTitle className="
            flex
            items-center
            gap-2
            text-lg
          ">

            <MapPin
              className="
                h-5 w-5
                text-primary
              "
            />

            Location

          </CardTitle>

        </CardHeader>

        <CardContent>

          <div className="
            grid
            gap-4
            sm:grid-cols-[1fr_280px]
          ">

            <div className="space-y-4">

              <div>

                <p className="
                  text-xs
                  font-medium
                  uppercase
                  tracking-wide
                  text-muted-foreground
                ">
                  Address
                </p>

                <p className="
                  mt-1
                  text-sm
                  leading-6
                ">
                  {complaint.address ||
                    "Location address unavailable"}
                </p>

              </div>

              <Separator />

              <div className="
                grid
                grid-cols-2
                gap-4
              ">

                <div>

                  <p className="
                    text-xs
                    font-medium
                    uppercase
                    tracking-wide
                    text-muted-foreground
                  ">
                    Latitude
                  </p>

                  <p className="
                    mt-1
                    font-mono
                    text-sm
                  ">
                    {complaint.latitude !==
                      null
                      ? complaint.latitude.toFixed(
                          6
                        )
                      : "—"}
                  </p>

                </div>

                <div>

                  <p className="
                    text-xs
                    font-medium
                    uppercase
                    tracking-wide
                    text-muted-foreground
                  ">
                    Longitude
                  </p>

                  <p className="
                    mt-1
                    font-mono
                    text-sm
                  ">
                    {complaint.longitude !==
                      null
                      ? complaint.longitude.toFixed(
                          6
                        )
                      : "—"}
                  </p>

                </div>

              </div>

            </div>


            <div className="
              flex
              min-h-[180px]
              items-center
              justify-center
              rounded-xl
              border
              bg-muted/30
            ">

              <div className="text-center">

                <MapPin
                  className="
                    mx-auto
                    h-8 w-8
                    text-primary
                  "
                />

                <p className="
                  mt-2
                  text-sm
                  font-medium
                ">
                  Complaint Location
                </p>

                <p className="
                  mt-1
                  text-xs
                  text-muted-foreground
                ">
                  GPS coordinates captured
                </p>

              </div>

            </div>

          </div>

        </CardContent>

      </Card>


      {/* ======================================================
          COMPLAINT TIMELINE
      ======================================================= */}

      <Card>

        <CardHeader>

          <CardTitle className="
            flex
            items-center
            gap-2
          ">

            <Clock3
              className="
                h-5 w-5
                text-primary
              "
            />

            Complaint Timeline

          </CardTitle>

        </CardHeader>

        <CardContent>

          <div className="space-y-0">

            {timelineSteps.map(
              (
                step,
                index
              ) => {

                const Icon =
                  step.icon;

                const isCompleted =
                  index <
                  currentStep;

                const isCurrent =
                  index ===
                  currentStep;

                const isPending =
                  index >
                  currentStep;

                return (
                  <div
                    key={
                      step.title
                    }
                    className="
                      relative
                      flex
                      gap-4
                    "
                  >

                    {/* CONNECTOR */}

                    {index <
                      timelineSteps.length -
                        1 && (
                      <div
                        className={`
                          absolute
                          left-[21px]
                          top-11
                          h-[calc(100%-20px)]
                          w-px
                          ${
                            index <
                            currentStep
                              ? "bg-primary"
                              : "bg-border"
                          }
                        `}
                      />
                    )}


                    {/* ICON */}

                    <div
                      className={`
                        relative
                        z-10
                        flex
                        h-11
                        w-11
                        shrink-0
                        items-center
                        justify-center
                        rounded-full
                        border
                        transition-all

                        ${
                          isCompleted
                            ? "border-primary bg-primary text-primary-foreground"
                            : isCurrent
                              ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/10"
                              : "border-border bg-muted text-muted-foreground"
                        }
                      `}
                    >

                      <Icon
                        className="
                          h-5 w-5
                        "
                      />

                    </div>


                    {/* CONTENT */}

                    <div className="
                      pb-8
                      pt-1
                    ">

                      <div className="
                        flex
                        flex-wrap
                        items-center
                        gap-2
                      ">

                        <h4
                          className={`
                            font-semibold
                            ${
                              isPending
                                ? "text-muted-foreground"
                                : "text-foreground"
                            }
                          `}
                        >
                          {step.title}
                        </h4>

                        {isCurrent && (
                          <span className="
                            rounded-md
                            bg-primary
                            px-2
                            py-0.5
                            text-xs
                            font-medium
                            text-primary-foreground
                          ">
                            Current
                          </span>
                        )}

                        {isCompleted && (
                          <span className="
                            rounded-md
                            bg-primary/10
                            px-2
                            py-0.5
                            text-xs
                            font-medium
                            text-primary
                          ">
                            Completed
                          </span>
                        )}

                      </div>

                      <p className="
                        mt-1
                        text-sm
                        text-muted-foreground
                      ">
                        {step.description}
                      </p>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </CardContent>

      </Card>


      {/* ======================================================
          SECURITY INFORMATION
      ======================================================= */}

      <Card className="
        border-primary/20
        bg-primary/5
      ">

        <CardContent className="
          flex
          items-start
          gap-4
          pt-6
        ">

          <div className="
            flex
            h-10 w-10
            shrink-0
            items-center
            justify-center
            rounded-full
            bg-primary/10
            text-primary
          ">

            <ShieldCheck
              className="
                h-5 w-5
              "
            />

          </div>

          <div>

            <h3 className="
              font-semibold
            ">
              Complaint securely recorded
            </h3>

            <p className="
              mt-1
              text-sm
              leading-6
              text-muted-foreground
            ">
              Your complaint and evidence are stored securely.
              AI-based categorization and priority analysis are
              applied automatically as the complaint moves through
              the workflow.
            </p>

          </div>

        </CardContent>

      </Card>

    </div>
  );
}