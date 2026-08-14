"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  workOrderService,
} from "@/lib/services/workOrders";

import {
  authService,
} from "@/lib/services/auth";

import type {
  WorkOrder,
} from "@/types/workOrder";

import {
  PriorityBadge,
} from "@/components/shared/PriorityBadge";

import {
  ArrowLeft,
  MapPin,
  MapIcon,
  Clock,
  Camera,
  Loader2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  UserRound,
  ClipboardCheck,
  PlayCircle,
  Upload,
} from "lucide-react";

import {
  Textarea,
} from "@/components/ui/textarea";

import {
  Input,
} from "@/components/ui/input";


/*
 * ============================================================
 * STATUS HELPERS
 * ============================================================
 */

function getStatusLabel(
  status: WorkOrder["status"]
) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}


function getStatusVariant(
  status: WorkOrder["status"]
):
  | "warning"
  | "info"
  | "success"
  | "default" {
  switch (status) {
    case "assigned":
      return "warning";

    case "accepted":
      return "info";

    case "in_progress":
      return "info";

    case "proof_submitted":
      return "success";

    case "completed":
      return "success";

    default:
      return "default";
  }
}


/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function WorkOrderDetailView() {
  const params = useParams();
  const router = useRouter();

  const workOrderId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";


  /*
   * ----------------------------------------------------------
   * STATE
   * ----------------------------------------------------------
   */

  const [
    order,
    setOrder,
  ] = useState<WorkOrder | null>(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    isUpdating,
    setIsUpdating,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    updateError,
    setUpdateError,
  ] = useState<string | null>(null);

  const [
    officerId,
    setOfficerId,
  ] = useState<string | null>(null);

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    proofFile,
    setProofFile,
  ] = useState<File | null>(null);

  const [
    proofPreview,
    setProofPreview,
  ] = useState<string | null>(null);


  /*
   * ==========================================================
   * LOAD WORK ORDER
   * ==========================================================
   */

  const loadWorkOrder =
    useCallback(
      async (
        showLoader = true
      ) => {
        if (!workOrderId) {
          setError(
            "Invalid work order ID."
          );

          setIsLoading(false);

          return;
        }

        try {
          setError(null);

          if (showLoader) {
            setIsLoading(true);
          } else {
            setIsRefreshing(true);
          }

          const data =
            await workOrderService.getWorkOrderById(
              workOrderId
            );

          setOrder(data);

        } catch (loadError) {
          console.error(
            "Failed to load work order:",
            loadError
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load work order."
          );

        } finally {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      },
      [workOrderId]
    );


  /*
   * ==========================================================
   * LOAD CURRENT OFFICER
   * ==========================================================
   */

  useEffect(() => {
    async function loadOfficer() {
      try {
        const user =
          await authService.getCurrentUser();

        if (user?.id) {
          setOfficerId(user.id);
        }
      } catch (authError) {
        console.error(
          "Failed to load officer:",
          authError
        );
      }
    }

    loadOfficer();
  }, []);


  /*
   * ==========================================================
   * INITIAL LOAD
   * ==========================================================
   */

  useEffect(() => {
    loadWorkOrder();
  }, [
    loadWorkOrder,
  ]);


  /*
   * ==========================================================
   * PROOF FILE
   * ==========================================================
   */

  const handleProofUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setUpdateError(
        "Please select an image file."
      );

      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      setUpdateError(
        "Image must be smaller than 10 MB."
      );

      return;
    }

    setUpdateError(null);

    setProofFile(file);

    const preview =
      URL.createObjectURL(file);

    setProofPreview(preview);
  };


  /*
   * ==========================================================
   * REMOVE PROOF
   * ==========================================================
   */

  const removeProof = () => {
    if (proofPreview) {
      URL.revokeObjectURL(
        proofPreview
      );
    }

    setProofFile(null);
    setProofPreview(null);
  };


  /*
   * ==========================================================
   * STATUS UPDATE
   * ==========================================================
   */

  const handleUpdateStatus =
    async (
      newStatus: WorkOrder["status"]
    ) => {
      if (!order) {
        return;
      }

      if (!officerId) {
        setUpdateError(
          "Officer identity could not be determined."
        );

        return;
      }

      /*
       * Proof is mandatory before submitting
       * proof_submitted.
       */

      if (
        newStatus ===
          "proof_submitted" &&
        !proofFile
      ) {
        setUpdateError(
          "Please upload resolution proof before submitting."
        );

        return;
      }

      if (
        newStatus ===
          "proof_submitted" &&
        notes.trim().length < 5
      ) {
        setUpdateError(
          "Please provide at least a short resolution note."
        );

        return;
      }

      try {
        setIsUpdating(true);
        setUpdateError(null);

        /*
         * IMPORTANT:
         *
         * The existing workOrderService currently
         * accepts media objects.
         *
         * We keep the service contract intact here.
         *
         * The actual permanent storage upload should
         * be connected when we wire Supabase Storage
         * into the work-order service.
         */

        const media =
          proofPreview
            ? [
                {
                  id:
                    `proof_${Date.now()}`,

                  url:
                    proofPreview,

                  type:
                    "image" as const,

                  uploadedAt:
                    new Date().toISOString(),
                },
              ]
            : [];

        const updated =
          await workOrderService.updateWorkOrderStatus(
            {
              workOrderId,

              status:
                newStatus,

              notes:
                notes.trim()
                  ? notes.trim()
                  : undefined,

              media,

              updatedBy:
                officerId,

              timestamp:
                new Date().toISOString(),
            }
          );

        setOrder(updated);

        setNotes("");

        removeProof();

      } catch (statusError) {
        console.error(
          "Failed to update work order:",
          statusError
        );

        setUpdateError(
          statusError instanceof Error
            ? statusError.message
            : "Failed to update work order."
        );

      } finally {
        setIsUpdating(false);
      }
    };


  /*
   * ==========================================================
   * OPEN MAPS
   * ==========================================================
   */

  const openInMaps = () => {
    if (!order?.location) {
      return;
    }

    const latitude =
      (order.location as any)
        ?.latitude;

    const longitude =
      (order.location as any)
        ?.longitude;

    if (
      typeof latitude === "number" &&
      typeof longitude === "number"
    ) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    const address =
      order.location.address;

    if (address) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          address
        )}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  };


  /*
   * ==========================================================
   * DERIVED STATE
   * ==========================================================
   */

  const isCompleted =
    order?.status ===
      "completed" ||
    order?.status ===
      "proof_submitted";

  const isActive =
    order?.status ===
      "assigned" ||
    order?.status ===
      "accepted" ||
    order?.status ===
      "in_progress";


  /*
   * ==========================================================
   * WORKFLOW STEPS
   * ==========================================================
   */

  const workflowSteps =
    useMemo(
      () => [
        {
          key: "assigned",
          title: "Assigned",
          description:
            "Work order assigned to the officer.",
          completed:
            !!order &&
            [
              "assigned",
              "accepted",
              "in_progress",
              "proof_submitted",
              "completed",
            ].includes(order.status),
        },

        {
          key: "accepted",
          title: "Accepted",
          description:
            "Officer acknowledged the assignment.",
          completed:
            !!order &&
            [
              "accepted",
              "in_progress",
              "proof_submitted",
              "completed",
            ].includes(order.status),
        },

        {
          key: "in_progress",
          title: "Work In Progress",
          description:
            "Field work is currently underway.",
          completed:
            !!order &&
            [
              "in_progress",
              "proof_submitted",
              "completed",
            ].includes(order.status),
        },

        {
          key: "proof_submitted",
          title: "Proof Submitted",
          description:
            "Resolution evidence has been submitted.",
          completed:
            !!order &&
            [
              "proof_submitted",
              "completed",
            ].includes(order.status),
        },

        {
          key: "completed",
          title: "Completed",
          description:
            "Work order has been completed.",
          completed:
            order?.status ===
            "completed",
        },
      ],
      [order]
    );


  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (isLoading) {
    return (
      <div className="
        mx-auto
        flex
        min-h-[60vh]
        max-w-4xl
        items-center
        justify-center
      ">
        <div className="
          flex
          flex-col
          items-center
          gap-3
        ">
          <Loader2
            className="
              h-8 w-8
              animate-spin
              text-primary
            "
          />

          <p className="
            text-sm
            text-muted-foreground
          ">
            Loading work order...
          </p>
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
    !order
  ) {
    return (
      <div className="
        mx-auto
        max-w-2xl
        py-12
      ">
        <Card>
          <CardContent className="
            flex
            flex-col
            items-center
            justify-center
            py-12
            text-center
          ">

            <AlertCircle
              className="
                mb-4
                h-10 w-10
                text-destructive
              "
            />

            <h2 className="
              text-lg
              font-semibold
            ">
              Work order unavailable
            </h2>

            <p className="
              mt-2
              max-w-md
              text-sm
              text-muted-foreground
            ">
              {error ??
                "The requested work order could not be found."}
            </p>

            <div className="
              mt-6
              flex
              gap-3
            ">

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
                  loadWorkOrder()
                }
              >
                Retry
              </Button>

            </div>

          </CardContent>
        </Card>
      </div>
    );
  }


  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div className="
      mx-auto
      max-w-5xl
      space-y-6
    ">

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

        <div className="
          flex
          items-center
          gap-3
        ">

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              router.back()
            }
          >
            <ArrowLeft
              className="
                h-5 w-5
              "
            />
          </Button>

          <div>

            <Link
              href="/officer/work-orders"
              className="
                text-xs
                text-muted-foreground
                hover:text-foreground
              "
            >
              My Work Orders
            </Link>

            <h1 className="
              mt-1
              text-xl
              font-bold
              tracking-tight
              sm:text-2xl
            ">
              Work Order Details
            </h1>

          </div>

        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            loadWorkOrder(false)
          }
          disabled={
            isRefreshing ||
            isUpdating
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
          UPDATE ERROR
      ======================================================= */}

      {updateError && (
        <Card className="
          border-destructive/30
          bg-destructive/5
        ">
          <CardContent className="
            flex
            items-start
            justify-between
            gap-4
            p-4
          ">

            <div className="
              flex
              items-start
              gap-3
            ">

              <AlertCircle
                className="
                  mt-0.5
                  h-5 w-5
                  shrink-0
                  text-destructive
                "
              />

              <div>

                <p className="
                  text-sm
                  font-semibold
                  text-destructive
                ">
                  Action failed
                </p>

                <p className="
                  mt-1
                  text-sm
                  text-muted-foreground
                ">
                  {updateError}
                </p>

              </div>

            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setUpdateError(null)
              }
            >
              Dismiss
            </Button>

          </CardContent>
        </Card>
      )}


      {/* ======================================================
          HEADER SUMMARY
      ======================================================= */}

      <Card>

        <CardContent className="
          p-5
          sm:p-6
        ">

          <div className="
            flex
            flex-col
            gap-5
            lg:flex-row
            lg:items-start
            lg:justify-between
          ">

            <div className="min-w-0">

              <div className="
                mb-3
                flex
                flex-wrap
                items-center
                gap-2
              ">

                <span className="
                  font-mono
                  text-sm
                  font-bold
                  text-primary
                ">
                  {order.id}
                </span>

                <Badge
                  variant={
                    getStatusVariant(
                      order.status
                    )
                  }
                  className="capitalize"
                >
                  {getStatusLabel(
                    order.status
                  )}
                </Badge>

              </div>

              <h2 className="
                text-2xl
                font-bold
                tracking-tight
              ">
                {order.complaintTitle}
              </h2>

              <p className="
                mt-2
                text-sm
                text-muted-foreground
              ">
                Citizen Report Ref:{" "}
                <span className="
                  font-mono
                  font-medium
                ">
                  {order.complaintId}
                </span>
              </p>

            </div>

            <div className="
              flex
              flex-col
              items-start
              gap-2
              lg:items-end
            ">

              <PriorityBadge
                level={
                  order.priorityLevel
                }
                score={
                  order.priorityScore
                }
                className="
                  px-3
                  py-1
                  text-base
                "
              />

              {isActive &&
                typeof order.slaHoursRemaining ===
                  "number" && (
                  <div
                    className={`
                      flex
                      items-center
                      gap-1.5
                      rounded-md
                      border
                      px-3
                      py-1.5
                      text-sm
                      font-medium
                      ${
                        order.slaHoursRemaining <= 4
                          ? "border-destructive/30 bg-destructive/5 text-destructive"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }
                    `}
                  >

                    <Clock
                      className="
                        h-4 w-4
                      "
                    />

                    {order.slaHoursRemaining <=
                    4
                      ? `SLA Risk • ${order.slaHoursRemaining}h`
                      : `SLA: ${order.slaHoursRemaining}h remaining`}

                  </div>
                )}

            </div>

          </div>

        </CardContent>

      </Card>


      {/* ======================================================
          WORKFLOW
      ======================================================= */}

      <Card>

        <CardHeader>

          <CardTitle>
            Work Order Progress
          </CardTitle>

          <CardDescription>
            Follow the assignment through each field operation stage.
          </CardDescription>

        </CardHeader>

        <CardContent>

          <div className="
            grid
            gap-3
            sm:grid-cols-5
          ">

            {workflowSteps.map(
              (
                step,
                index
              ) => (

                <div
                  key={
                    step.key
                  }
                  className="
                    relative
                  "
                >

                  <div className="
                    flex
                    items-center
                    gap-3
                    sm:flex-col
                    sm:items-center
                    sm:text-center
                  ">

                    <div
                      className={`
                        flex
                        h-10 w-10
                        shrink-0
                        items-center
                        justify-center
                        rounded-full
                        border
                        ${
                          step.completed
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted text-muted-foreground"
                        }
                      `}
                    >

                      {step.completed ? (
                        <CheckCircle2
                          className="
                            h-5 w-5
                          "
                        />
                      ) : (
                        <span className="
                          text-sm
                          font-bold
                        ">
                          {index + 1}
                        </span>
                      )}

                    </div>

                    <div>

                      <p className="
                        text-sm
                        font-semibold
                      ">
                        {step.title}
                      </p>

                      <p className="
                        mt-1
                        text-xs
                        text-muted-foreground
                      ">
                        {step.description}
                      </p>

                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        </CardContent>

      </Card>


      {/* ======================================================
          MAIN CONTENT
      ======================================================= */}

      <div className="
        grid
        gap-6
        lg:grid-cols-[1fr_320px]
      ">

        {/* ====================================================
            MAIN COLUMN
        ===================================================== */}

        <div className="space-y-6">

          {/* ACTION CARD */}

          <Card
            className={
              isCompleted
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-primary/40 shadow-sm"
            }
          >

            <CardHeader>

              <CardTitle>
                {order.status ===
                "assigned"
                  ? "Accept Assignment"
                  : order.status ===
                      "accepted"
                    ? "Start Work"
                    : order.status ===
                        "in_progress"
                      ? "Submit Resolution Proof"
                      : "Work Completed"}
              </CardTitle>

              <CardDescription>
                {order.status ===
                "assigned"
                  ? "Review the complaint and acknowledge the assignment."
                  : order.status ===
                      "accepted"
                    ? "Start the field operation when you begin work."
                    : order.status ===
                        "in_progress"
                      ? "Upload evidence and describe the completed work."
                      : "This work order has progressed beyond the officer action stage."}
              </CardDescription>

            </CardHeader>

            <CardContent>

              {/* ASSIGNED */}

              {order.status ===
                "assigned" && (
                <div className="
                  space-y-4
                ">

                  <div className="
                    rounded-lg
                    bg-muted/40
                    p-4
                    text-sm
                  ">
                    By accepting this assignment, you acknowledge responsibility for the work order and its SLA.
                  </div>

                  <Button
                    onClick={() =>
                      handleUpdateStatus(
                        "accepted"
                      )
                    }
                    disabled={
                      isUpdating
                    }
                  >

                    {isUpdating ? (
                      <Loader2
                        className="
                          mr-2
                          h-4 w-4
                          animate-spin
                        "
                      />
                    ) : (
                      <ClipboardCheck
                        className="
                          mr-2
                          h-4 w-4
                        "
                      />
                    )}

                    Accept Assignment

                  </Button>

                </div>
              )}


              {/* ACCEPTED */}

              {order.status ===
                "accepted" && (
                <div className="
                  space-y-4
                ">

                  <div className="
                    rounded-lg
                    bg-primary/5
                    p-4
                    text-sm
                    text-muted-foreground
                  ">
                    The assignment has been accepted. Start work when you arrive at the complaint location.
                  </div>

                  <Button
                    onClick={() =>
                      handleUpdateStatus(
                        "in_progress"
                      )
                    }
                    disabled={
                      isUpdating
                    }
                  >

                    {isUpdating ? (
                      <Loader2
                        className="
                          mr-2
                          h-4 w-4
                          animate-spin
                        "
                      />
                    ) : (
                      <PlayCircle
                        className="
                          mr-2
                          h-4 w-4
                        "
                      />
                    )}

                    Start Work

                  </Button>

                </div>
              )}


              {/* IN PROGRESS */}

              {order.status ===
                "in_progress" && (
                <div className="
                  space-y-5
                ">

                  <div className="
                    rounded-lg
                    border
                    bg-primary/5
                    p-4
                  ">

                    <div className="
                      flex
                      items-center
                      gap-2
                      text-sm
                      font-medium
                      text-primary
                    ">

                      <Clock
                        className="
                          h-4 w-4
                        "
                      />

                      Work is currently in progress

                    </div>

                    <p className="
                      mt-1
                      text-xs
                      text-muted-foreground
                    ">
                      Submit clear evidence once the issue has been resolved.
                    </p>

                  </div>


                  {/* NOTES */}

                  <div className="
                    space-y-2
                  ">

                    <label
                      htmlFor="resolution-notes"
                      className="
                        text-sm
                        font-medium
                      "
                    >
                      Resolution Notes
                    </label>

                    <Textarea
                      id="resolution-notes"
                      placeholder="
                        Describe what was fixed,
                        work performed, materials used,
                        or any relevant field observations...
                      "
                      value={notes}
                      onChange={(event) =>
                        setNotes(
                          event.target.value
                        )
                      }
                      className="
                        min-h-[120px]
                      "
                    />

                    <p className="
                      text-xs
                      text-muted-foreground
                    ">
                      Minimum 5 characters required.
                    </p>

                  </div>


                  {/* PROOF */}

                  <div className="
                    space-y-2
                  ">

                    <label className="
                      text-sm
                      font-medium
                    ">
                      Resolution Proof
                    </label>

                    {!proofPreview ? (
                      <div className="
                        rounded-xl
                        border-2
                        border-dashed
                        p-6
                        text-center
                        transition-colors
                        hover:bg-muted/30
                      ">

                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          id="proof-upload"
                          onChange={
                            handleProofUpload
                          }
                        />

                        <label
                          htmlFor="proof-upload"
                          className="
                            flex
                            cursor-pointer
                            flex-col
                            items-center
                          "
                        >

                          <div className="
                            mb-3
                            rounded-full
                            bg-primary/10
                            p-3
                          ">

                            <Camera
                              className="
                                h-6 w-6
                                text-primary
                              "
                            />

                          </div>

                          <span className="
                            text-sm
                            font-semibold
                          ">
                            Take or upload resolution photo
                          </span>

                          <span className="
                            mt-1
                            text-xs
                            text-muted-foreground
                          ">
                            JPG, PNG • Maximum 10 MB
                          </span>

                        </label>

                      </div>
                    ) : (
                      <div className="
                        overflow-hidden
                        rounded-xl
                        border
                      ">

                        <div className="
                          relative
                          aspect-video
                          max-w-md
                          bg-muted
                        ">

                          {/* eslint-disable-next-line @next/next/no-img-element */}

                          <img
                            src={
                              proofPreview
                            }
                            alt="Resolution proof preview"
                            className="
                              h-full
                              w-full
                              object-cover
                            "
                          />

                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="
                              absolute
                              right-2
                              top-2
                            "
                            onClick={
                              removeProof
                            }
                          >
                            Retake
                          </Button>

                        </div>

                        {proofFile && (
                          <div className="
                            flex
                            items-center
                            gap-2
                            p-3
                          ">

                            <Upload
                              className="
                                h-4 w-4
                                text-muted-foreground
                              "
                            />

                            <span className="
                              truncate
                              text-sm
                            ">
                              {proofFile.name}
                            </span>

                            <span className="
                              ml-auto
                              shrink-0
                              text-xs
                              text-muted-foreground
                            ">
                              {(
                                proofFile.size /
                                1024 /
                                1024
                              ).toFixed(2)}{" "}
                              MB
                            </span>

                          </div>
                        )}

                      </div>
                    )}

                  </div>


                  {/* SUBMIT */}

                  <Button
                    onClick={() =>
                      handleUpdateStatus(
                        "proof_submitted"
                      )
                    }
                    disabled={
                      isUpdating ||
                      !proofFile ||
                      notes.trim().length < 5
                    }
                    className="
                      w-full
                    "
                  >

                    {isUpdating ? (
                      <Loader2
                        className="
                          mr-2
                          h-4 w-4
                          animate-spin
                        "
                      />
                    ) : (
                      <CheckCircle2
                        className="
                          mr-2
                          h-4 w-4
                        "
                      />
                    )}

                    Submit Proof for Review

                  </Button>

                </div>
              )}


              {/* COMPLETED / PROOF */}

              {isCompleted && (
                <div className="
                  flex
                  items-start
                  gap-4
                  rounded-xl
                  border
                  border-emerald-200
                  bg-emerald-50
                  p-4
                  text-emerald-700
                ">

                  <CheckCircle2
                    className="
                      mt-0.5
                      h-7 w-7
                      shrink-0
                    "
                  />

                  <div>

                    <p className="
                      font-semibold
                    ">
                      Resolution submitted successfully.
                    </p>

                    <p className="
                      mt-1
                      text-sm
                      opacity-80
                    ">
                      The work order is awaiting the next verification stage.
                    </p>

                  </div>

                </div>
              )}

            </CardContent>

          </Card>


          {/* CITIZEN EVIDENCE */}

          <Card>

            <CardHeader>

              <CardTitle>
                Citizen Evidence
              </CardTitle>

              <CardDescription>
                Evidence submitted with the original complaint.
              </CardDescription>

            </CardHeader>

            <CardContent>

              {order.citizenEvidence &&
              order.citizenEvidence.length >
                0 ? (
                <div className="
                  grid
                  gap-3
                  sm:grid-cols-2
                ">

                  {order.citizenEvidence.map(
                    (media) => (
                      <a
                        key={
                          media.id
                        }
                        href={
                          media.url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                          group
                          overflow-hidden
                          rounded-xl
                          border
                          bg-muted
                        "
                      >

                        <div className="
                          aspect-video
                          overflow-hidden
                        ">

                          {/* eslint-disable-next-line @next/next/no-img-element */}

                          <img
                            src={
                              media.url
                            }
                            alt="Citizen evidence"
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

                      </a>
                    )
                  )}

                </div>
              ) : (
                <div className="
                  rounded-xl
                  border
                  border-dashed
                  p-8
                  text-center
                ">

                  <Camera
                    className="
                      mx-auto
                      h-8 w-8
                      text-muted-foreground
                    "
                  />

                  <p className="
                    mt-2
                    text-sm
                    text-muted-foreground
                  ">
                    No photos were provided by the citizen.
                  </p>

                </div>
              )}

            </CardContent>

          </Card>


          {/* RESOLUTION EVIDENCE */}

          {order.resolutionEvidence &&
            order.resolutionEvidence.length >
              0 && (
              <Card>

                <CardHeader>

                  <CardTitle>
                    Resolution Evidence
                  </CardTitle>

                  <CardDescription>
                    Evidence submitted by the field officer.
                  </CardDescription>

                </CardHeader>

                <CardContent>

                  <div className="
                    grid
                    gap-3
                    sm:grid-cols-2
                  ">

                    {order.resolutionEvidence.map(
                      (media) => (
                        <a
                          key={
                            media.id
                          }
                          href={
                            media.url
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="
                            overflow-hidden
                            rounded-xl
                            border
                          "
                        >

                          <div className="
                            aspect-video
                          ">

                            {/* eslint-disable-next-line @next/next/no-img-element */}

                            <img
                              src={
                                media.url
                              }
                              alt="Resolution evidence"
                              className="
                                h-full
                                w-full
                                object-cover
                              "
                            />

                          </div>

                        </a>
                      )
                    )}

                  </div>

                  {order.resolutionNotes && (
                    <div className="
                      mt-5
                      rounded-lg
                      bg-muted/40
                      p-4
                    ">

                      <p className="
                        text-xs
                        font-medium
                        uppercase
                        tracking-wide
                        text-muted-foreground
                      ">
                        Resolution Notes
                      </p>

                      <p className="
                        mt-2
                        whitespace-pre-wrap
                        text-sm
                        leading-6
                      ">
                        {order.resolutionNotes}
                      </p>

                    </div>
                  )}

                </CardContent>

              </Card>
            )}

        </div>


        {/* ====================================================
            SIDEBAR
        ===================================================== */}

        <div className="
          space-y-6
        ">

          {/* LOCATION */}

          <Card>

            <CardHeader className="pb-3">

              <CardTitle className="text-base">
                Location
              </CardTitle>

            </CardHeader>

            <CardContent className="
              space-y-4
            ">

              <div className="
                flex
                h-40
                items-center
                justify-center
                overflow-hidden
                rounded-xl
                border
                bg-muted
              ">

                <div className="
                  text-center
                ">

                  <MapIcon
                    className="
                      mx-auto
                      h-8 w-8
                      text-primary
                    "
                  />

                  <p className="
                    mt-2
                    text-xs
                    text-muted-foreground
                  ">
                    Complaint location
                  </p>

                </div>

              </div>

              <div className="
                flex
                items-start
                gap-2
                text-sm
              ">

                <MapPin
                  className="
                    mt-0.5
                    h-4 w-4
                    shrink-0
                    text-muted-foreground
                  "
                />

                <span>
                  {order.location?.address ||
                    "Location unavailable"}
                </span>

              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={
                  openInMaps
                }
              >

                <MapPin
                  className="
                    mr-2
                    h-4 w-4
                  "
                />

                Open in Maps

              </Button>

            </CardContent>

          </Card>


          {/* ASSIGNMENT INFO */}

          <Card>

            <CardHeader className="pb-3">

              <CardTitle className="text-base">
                Assignment
              </CardTitle>

            </CardHeader>

            <CardContent className="
              space-y-4
              text-sm
            ">

              <div className="
                flex
                items-center
                justify-between
                gap-4
                border-b
                py-2
              ">

                <span className="
                  text-muted-foreground
                ">
                  Work Order
                </span>

                <span className="
                  font-mono
                  text-xs
                  font-medium
                ">
                  {order.id}
                </span>

              </div>

              <div className="
                flex
                items-center
                justify-between
                gap-4
                border-b
                py-2
              ">

                <span className="
                  text-muted-foreground
                ">
                  Complaint
                </span>

                <span className="
                  font-mono
                  text-xs
                  font-medium
                ">
                  {order.complaintId}
                </span>

              </div>

              <div className="
                flex
                items-center
                justify-between
                gap-4
                border-b
                py-2
              ">

                <span className="
                  text-muted-foreground
                ">
                  Priority Score
                </span>

                <span className="
                  font-semibold
                ">
                  {order.priorityScore ??
                    "—"}
                </span>

              </div>

            </CardContent>

          </Card>


          {/* TIMELINE */}

          <Card>

            <CardHeader className="pb-3">

              <CardTitle className="text-base">
                Timeline
              </CardTitle>

            </CardHeader>

            <CardContent className="
              space-y-1
              text-sm
            ">

              <div className="
                flex
                items-center
                justify-between
                gap-4
                border-b
                py-2.5
              ">

                <span className="
                  text-muted-foreground
                ">
                  Created
                </span>

                <span className="
                  text-right
                ">
                  {new Date(
                    order.createdAt
                  ).toLocaleString(
                    [],
                    {
                      dateStyle:
                        "short",
                      timeStyle:
                        "short",
                    }
                  )}
                </span>

              </div>

              <div className="
                flex
                items-center
                justify-between
                gap-4
                border-b
                py-2.5
              ">

                <span className="
                  text-muted-foreground
                ">
                  SLA Deadline
                </span>

                <span className="
                  text-right
                  font-medium
                  text-amber-600
                ">
                  {new Date(
                    order.slaDeadline
                  ).toLocaleString(
                    [],
                    {
                      dateStyle:
                        "short",
                      timeStyle:
                        "short",
                    }
                  )}
                </span>

              </div>

              {order.acceptedAt && (
                <div className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  border-b
                  py-2.5
                ">

                  <span className="
                    text-muted-foreground
                  ">
                    Accepted
                  </span>

                  <span className="
                    text-right
                  ">
                    {new Date(
                      order.acceptedAt
                    ).toLocaleString(
                      [],
                      {
                        dateStyle:
                          "short",
                        timeStyle:
                          "short",
                      }
                    )}
                  </span>

                </div>
              )}

              {order.startedAt && (
                <div className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  border-b
                  py-2.5
                ">

                  <span className="
                    text-muted-foreground
                  ">
                    Work Started
                  </span>

                  <span className="
                    text-right
                  ">
                    {new Date(
                      order.startedAt
                    ).toLocaleString(
                      [],
                      {
                        dateStyle:
                          "short",
                        timeStyle:
                          "short",
                      }
                    )}
                  </span>

                </div>
              )}

              {order.completedAt && (
                <div className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  py-2.5
                ">

                  <span className="
                    text-muted-foreground
                  ">
                    Completed
                  </span>

                  <span className="
                    font-medium
                    text-right
                    text-emerald-600
                  ">
                    {new Date(
                      order.completedAt
                    ).toLocaleString(
                      [],
                      {
                        dateStyle:
                          "short",
                        timeStyle:
                          "short",
                      }
                    )}
                  </span>

                </div>
              )}

            </CardContent>

          </Card>

        </div>

      </div>

    </div>
  );
}