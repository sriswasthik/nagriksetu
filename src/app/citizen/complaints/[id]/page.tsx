"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  processComplaintWithAI,
} from "@/lib/services/ai";

import Link from "next/link";

import {
  useParams,
  useRouter,
} from "next/navigation";

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
  getComplaintDetails,
  type ComplaintDetails,
} from "@/lib/services/complaints";

import type {
  ComplaintStatus,
} from "@/types/complaint";

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
 * STATUS HELPERS
 * ============================================================
 */

function getStatusLabel(
  status: ComplaintStatus
): string {
  const labels: Record<
    ComplaintStatus,
    string
  > = {
    submitted:
      "Submitted",

    ai_analyzed:
      "AI Analysis Complete",

    assigned:
      "Department Assigned",

    accepted:
      "Accepted by Officer",

    in_progress:
      "Work in Progress",

    proof_submitted:
      "Proof Submitted",

    supervisor_review:
      "Supervisor Review",

    citizen_confirmation:
      "Awaiting Confirmation",

    resolved:
      "Resolved",

    reopened:
      "Reopened",

    rejected:
      "Rejected",
  };

  return labels[status] ?? status;
}


/*
 * ============================================================
 * TIMELINE STATUS
 * ============================================================
 */

const timelineSteps = [
  {
    key: "submitted",
    title: "Complaint Submitted",
    description:
      "Your complaint has been successfully registered.",
    icon: FileText,
  },

  {
    key: "ai_analyzed",
    title: "AI Analysis",
    description:
      "The complaint will be analyzed and prioritized.",
    icon: Sparkles,
  },

  {
    key: "assigned",
    title: "Department Assignment",
    description:
      "The complaint will be routed to the appropriate department.",
    icon: UserCheck,
  },

  {
    key: "in_progress",
    title: "Officer Action",
    description:
      "A responsible officer will work on the issue.",
    icon: Clock3,
  },

  {
    key: "resolved",
    title: "Resolution",
    description:
      "The issue will be marked resolved after completion.",
    icon: CheckCircle2,
  },
];


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
  const params =
    useParams();

  const router =
    useRouter();

  const complaintId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";

  const searchParams =
    useSearchParams();

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
  ] = useState<ComplaintDetails | null>(
    null
  );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);


  /*
   * ==========================================================
   * LOAD DETAILS
   * ==========================================================
   */

  async function loadDetails(
    showLoader = true
  ) {
    if (!complaintId) {
      setError(
        "Invalid complaint ID."
      );

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
      const result =
        await getComplaintDetails(
          complaintId
        );

      setDetails(result);
    } catch (loadError) {
      console.error(
        "Failed to load complaint details:",
        loadError
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load complaint details."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }


  /*
   * ==========================================================
   * INITIAL LOAD
   * ==========================================================
   */

  useEffect(() => {
    loadDetails();
  }, [complaintId]);


  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />

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

  if (error || !details) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <FileText className="h-6 w-6 text-destructive" />
            </div>

            <h2 className="text-lg font-semibold">
              Unable to load complaint
            </h2>

            <p className="mt-2 max-w-md text-sm text-muted-foreground">
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
   * RENDER
   * ==========================================================
   */

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ======================================================
          HEADER
      ======================================================= */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/citizen/complaints"
            className="mb-3 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />

            My Complaints
          </Link>

          <h1 className="text-2xl font-bold tracking-tight">
            Complaint Details
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Track the progress of your civic complaint.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            loadDetails(false)
          }
          disabled={
            isRefreshing
          }
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}

          Refresh
        </Button>
      </div>


      {/* ======================================================
          COMPLAINT SUMMARY
      ======================================================= */}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Complaint Number
              </p>

              <CardTitle className="mt-1 font-mono text-lg">
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
            <h2 className="text-xl font-semibold">
              {complaint.title}
            </h2>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {complaint.description}
            </p>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-3">

            {/* CATEGORY */}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Category
              </p>

              <p className="mt-1 text-sm font-medium capitalize">
                {complaint.category.replace(
                  /_/g,
                  " "
                )}
              </p>
            </div>

            {/* PRIORITY */}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Submitted
              </p>

              <p className="mt-1 text-sm font-medium">
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
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />

            Evidence
          </CardTitle>
        </CardHeader>

        <CardContent>

          {media.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground" />

              <p className="mt-3 text-sm font-medium">
                No evidence uploaded
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                No photos or evidence are attached to this complaint.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

              {media.map(
                (item) => (
                  <a
                    key={item.id}
                    href={
                      item.signedUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-xl border bg-muted/20"
                  >
                    <div className="aspect-video overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          item.signedUrl
                        }
                        alt={
                          item.file_name
                        }
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    <div className="p-3">
                      <p className="truncate text-sm font-medium">
                        {item.file_name}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
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
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-primary" />

            Location
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 sm:grid-cols-[1fr_280px]">

            {/* LOCATION INFORMATION */}

            <div className="space-y-4">

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Address
                </p>

                <p className="mt-1 text-sm leading-6">
                  {complaint.address ||
                    "Location address unavailable"}
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latitude
                  </p>

                  <p className="mt-1 font-mono text-sm">
                    {complaint.latitude !==
                      null
                      ? complaint.latitude.toFixed(
                        6
                      )
                      : "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Longitude
                  </p>

                  <p className="mt-1 font-mono text-sm">
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


            {/* MAP PLACEHOLDER */}

            <div className="flex min-h-[180px] items-center justify-center rounded-xl border bg-muted/30">
              <div className="text-center">
                <MapPin className="mx-auto h-8 w-8 text-primary" />

                <p className="mt-2 text-sm font-medium">
                  Complaint Location
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  GPS coordinates captured
                </p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>


      {/* ======================================================
          STATUS TIMELINE
      ======================================================= */}

     {/* ============================================================
    COMPLAINT TIMELINE
============================================================ */}

<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Clock3 className="h-5 w-5 text-primary" />
      Complaint Timeline
    </CardTitle>
  </CardHeader>

  <CardContent>
    {(() => {
      /**
       * --------------------------------------------------------
       * CURRENT COMPLAINT STATUS
       * --------------------------------------------------------
       *
       * We intentionally use only the existing complaint
       * status here.
       *
       * We do NOT access complaint.ai_analysis_status because
       * that field is not part of the current Complaint type.
       */

      const complaintStatus =
        complaint?.status ?? "submitted";

      /**
       * --------------------------------------------------------
       * TIMELINE PROGRESS
       * --------------------------------------------------------
       *
       * 0 → Complaint Submitted
       * 1 → AI Analysis
       * 2 → Department Assignment
       * 3 → Officer Action
       * 4 → Resolution
       *
       * AI analysis is considered part of the workflow after
       * submission. Once the complaint reaches an operational
       * status, the timeline advances automatically.
       */

      let currentStep = 1;

      switch (complaintStatus) {
        case "submitted":
          currentStep = 1;
          break;

        case "ai_analyzed":
          currentStep = 2;
          break;

        case "assigned":
          currentStep = 2;
          break;

        case "accepted":
          currentStep = 3;
          break;

        case "in_progress":
          currentStep = 3;
          break;

        case "citizen_confirmation":
          currentStep = 3;
          break;

        case "resolved":
          currentStep = 4;
          break;

        default:
          currentStep = 1;
      }

      /**
       * --------------------------------------------------------
       * TIMELINE STEPS
       * --------------------------------------------------------
       */

      const timelineSteps = [
        {
          title: "Complaint Submitted",
          description:
            "Your complaint has been successfully registered.",
          icon: CheckCircle2,
        },

        {
          title: "AI Analysis",
          description:
            complaintStatus === "submitted"
              ? "The complaint is being analyzed and prioritized automatically."
              : "The complaint has been analyzed and prioritized automatically.",
          icon: Sparkles,
        },

        {
          title: "Department Assignment",
          description:
            complaintStatus === "assigned" ||
            complaintStatus === "accepted" ||
            complaintStatus === "in_progress" ||
            complaintStatus === "citizen_confirmation" ||
            complaintStatus === "resolved"
              ? "The complaint has been routed to the appropriate department."
              : "The complaint will be routed to the appropriate department.",
          icon: UserCheck,
        },

        {
          title: "Officer Action",
          description:
            complaintStatus === "accepted" ||
            complaintStatus === "in_progress" ||
            complaintStatus === "citizen_confirmation" ||
            complaintStatus === "resolved"
              ? "A responsible officer is working on the issue."
              : "A responsible officer will work on the issue.",
          icon: Clock3,
        },

        {
          title: "Resolution",
          description:
            complaintStatus === "resolved"
              ? "The issue has been marked as resolved."
              : "The issue will be marked resolved after completion.",
          icon: CheckCircle2,
        },
      ];

      return (
        <div className="space-y-0">
          {timelineSteps.map((step, index) => {
            const Icon = step.icon;

            const isCompleted =
              index < currentStep;

            const isCurrent =
              index === currentStep;

            const isPending =
              index > currentStep;

            return (
              <div
                key={step.title}
                className="relative flex gap-4"
              >
                {/* Vertical connector */}
                {index <
                  timelineSteps.length - 1 && (
                  <div
                    className={`absolute left-[21px] top-11 h-[calc(100%-20px)] w-px ${
                      index < currentStep
                        ? "bg-primary"
                        : "bg-border"
                    }`}
                  />
                )}

                {/* Step icon */}
                <div
                  className={`
                    relative z-10
                    flex h-11 w-11 shrink-0
                    items-center justify-center
                    rounded-full border
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
                  <Icon className="h-5 w-5" />
                </div>

                {/* Step content */}
                <div className="pb-8 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                      <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        Current
                      </span>
                    )}

                    {isCompleted && (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Completed
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      );
    })()}
  </CardContent>
</Card>

      {/* ======================================================
          AI / SECURITY INFORMATION
      ======================================================= */}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-4 pt-6">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>
            <h3 className="font-semibold">
              Complaint securely recorded
            </h3>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Your complaint and evidence are stored
              securely. AI-based categorization and
              priority analysis will be applied as the
              complaint moves through the workflow.
            </p>
          </div>

        </CardContent>
      </Card>

    </div>
  );
}