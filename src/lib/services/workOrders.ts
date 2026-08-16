import { createClient } from "@/lib/supabase/client";
import { NotSignedInError } from "@/lib/services/errors";
import type {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderUpdate,
} from "@/types/workOrder";
import type { ComplaintStatus, PriorityLevel } from "@/types/complaint";

/**
 * ============================================================
 * WORK ORDER SERVICE — Supabase backed
 * ============================================================
 *
 * Previously this module held an in-memory copy of src/lib/mock and
 * every status transition was lost on reload, which also meant a
 * failing backend looked identical to a working one.
 *
 * The public contract (getWorkOrders / getWorkOrderById /
 * getWorkOrdersByComplaintId / updateWorkOrderStatus) is unchanged, so
 * no page needed rewriting.
 *
 * SHAPE NOTE
 * public.work_orders is deliberately narrow: it holds the assignment
 * and the lifecycle timestamps only. Everything else the UI shows —
 * title, category, coordinates, priority, SLA — lives on the parent
 * complaint, so every read joins complaints, departments and the
 * assigned officer's profile.
 *
 * ACCESS
 * Reads are constrained by the "Work order read access" policy:
 * oversight sees the city, an officer sees their own assignments, and
 * a citizen sees work orders for complaints they reported. The service
 * therefore does not filter by role itself — the database does.
 */

/*
 * Selecting the related rows in one round trip. The FK names are
 * implicit: work_orders.complaint_id -> complaints,
 * work_orders.department_id -> departments,
 * work_orders.officer_id -> profiles.
 */
const WORK_ORDER_SELECT = `
  id,
  work_order_number,
  complaint_id,
  department_id,
  officer_id,
  status,
  assigned_at,
  accepted_at,
  started_at,
  completed_at,
  created_at,
  updated_at,
  complaint:complaints!work_orders_complaint_id_fkey (
    id,
    complaint_number,
    title,
    description,
    category,
    status,
    latitude,
    longitude,
    address,
    priority_score,
    priority_level,
    priority_reason,
    sla_due_at,
    ai_summary,
    ai_category,
    ai_confidence,
    ai_possible_duplicate,
    ai_duplicate_complaint_id,
    ai_model,
    ward:wards!complaints_ward_id_fkey ( name )
  ),
  department:departments!work_orders_department_id_fkey ( id, name ),
  officer:profiles!work_orders_officer_id_fkey ( id, full_name )
`;

/** Shape returned by the select above, before mapping. */
interface WorkOrderRow {
  id: string;
  work_order_number: string | null;
  complaint_id: string;
  department_id: string | null;
  officer_id: string | null;
  status: WorkOrderStatus;
  assigned_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  complaint: {
    id: string;
    complaint_number: string | null;
    title: string | null;
    description: string | null;
    category: string | null;
    status: ComplaintStatus | null;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    priority_score: number | null;
    priority_level: PriorityLevel | null;
    priority_reason: string | null;
    sla_due_at: string | null;
    ai_summary: string | null;
    ai_category: string | null;
    ai_confidence: number | null;
    ai_possible_duplicate: boolean | null;
    ai_duplicate_complaint_id: string | null;
    ai_model: string | null;
    ward: { name: string | null } | null;
  } | null;
  department: { id: string; name: string | null } | null;
  officer: { id: string; full_name: string | null } | null;
}

/*
 * Storage buckets. Both are private (see
 * supabase/migrations/20260814120300_storage_bucket_and_object_policies.sql),
 * so object URLs must be signed — getPublicUrl() would hand the browser
 * a link that returns 400.
 */
const EVIDENCE_BUCKET = "complaint-evidence";
const PROOF_BUCKET = "resolution-proofs";

const SIGNED_URL_TTL_SECONDS = 3600;

const MAX_PROOF_SIZE = 10 * 1024 * 1024;

/**
 * The id of the signed-in user, as Postgres sees it in auth.uid().
 *
 * Every write below is checked against it by row-level security, so a
 * missing session must fail here with something a person can read
 * rather than downstream as a policy violation.
 */
async function getAuthenticatedUserId(): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  /*
   * A missing session arrives as an AuthSessionMissingError in `error`,
   * not as a null user. Rethrowing it surfaced the provider's internal
   * name to the officer; both cases are the same thing and get the same
   * readable message.
   */
  if (error && error.name !== "AuthSessionMissingError") {
    console.error("Session lookup failed:", error.message);
  }

  if (!user) {
    throw new NotSignedInError(
      "You need to be signed in to update a work order."
    );
  }

  return user.id;
}

/**
 * Signs a batch of storage paths in one round trip.
 *
 * Returns a path -> url map rather than an array so a partial failure
 * (one missing object) drops that single image instead of misaligning
 * every URL after it.
 */
async function signPaths(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[]
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();

  if (paths.length === 0) return signed;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error(`Signing ${bucket} objects failed:`, error.message);
    return signed;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      signed.set(entry.path, entry.signedUrl);
    }
  }

  return signed;
}

/**
 * Hours until the SLA deadline. Negative once breached, which the
 * SLAIndicator renders as "SLA breached".
 */
function hoursUntil(deadline: string | null): number {
  if (!deadline) return 0;

  const remainingMs = new Date(deadline).getTime() - Date.now();
  return Math.round((remainingMs / 3_600_000) * 10) / 10;
}

/** Maps a joined row onto the WorkOrder shape the UI already expects. */
function mapWorkOrder(row: WorkOrderRow): WorkOrder {
  const complaint = row.complaint;
  const slaDeadline = complaint?.sla_due_at ?? null;

  return {
    id: row.id,
    workOrderNumber: row.work_order_number ?? row.id.slice(0, 8),

    complaintId: row.complaint_id,
    complaintTitle: complaint?.title ?? "Untitled complaint",
    complaintNumber: complaint?.complaint_number ?? "",
    category: complaint?.category ?? "other",

    departmentId: row.department_id ?? "",
    departmentName: row.department?.name ?? "Unassigned",

    officerId: row.officer_id ?? "",
    officerName: row.officer?.full_name ?? "",

    status: row.status,

    // Priority is the AI's assessment of the complaint, not of the
    // work order, so it is read through the join.
    priorityScore: complaint?.priority_score ?? 0,
    priorityLevel: (complaint?.priority_level ?? "low") as PriorityLevel,

    /*
     * The persisted analysis, carried through so the officer sees what
     * triage concluded. Read from the complaint row, never recomputed —
     * an officer and a citizen looking at the same report must see the
     * same assessment.
     */
    analysis: {
      summary: complaint?.ai_summary ?? null,
      category: complaint?.ai_category ?? null,
      confidence: complaint?.ai_confidence ?? null,
      priorityReason: complaint?.priority_reason ?? null,
      possibleDuplicate: complaint?.ai_possible_duplicate ?? false,
      duplicateComplaintId: complaint?.ai_duplicate_complaint_id ?? null,
      model: complaint?.ai_model ?? null,
    },

    location: {
      latitude: complaint?.latitude ?? 0,
      longitude: complaint?.longitude ?? 0,
      address: complaint?.address ?? "Location not recorded",
      ward: complaint?.ward?.name ?? undefined,
    },

    // Evidence is fetched separately only where a page needs it; list
    // views do not, so these stay empty rather than over-fetching.
    citizenEvidence: [],
    resolutionEvidence: [],

    slaDeadline: slaDeadline ?? row.created_at,
    slaHoursRemaining: hoursUntil(slaDeadline),

    assignedAt: row.assigned_at ?? row.created_at,
    acceptedAt: row.accepted_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Work-order status -> the complaint status a citizen should see.
 *
 * The previous implementation had this mapping written out but
 * commented off, so advancing a work order never moved the complaint
 * and the citizen's tracking view silently stalled.
 */
const COMPLAINT_STATUS_FOR: Partial<
  Record<WorkOrderStatus, ComplaintStatus>
> = {
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  proof_submitted: "proof_submitted",
  supervisor_review: "supervisor_review",
  citizen_confirmation: "citizen_confirmation",
  resolved: "resolved",
  reopened: "reopened",
};

export const workOrderService = {
  async getWorkOrders(filters?: {
    status?: WorkOrderStatus;
    priority?: string;
    officerId?: string;
  }): Promise<WorkOrder[]> {
    const supabase = createClient();

    let query = supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .order("created_at", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    // Only filter by officer when a real id is supplied. The previous
    // mock filtered on an undefined id and returned everything, which
    // made the officer view look populated when it was not scoped.
    if (filters?.officerId) {
      query = query.eq("officer_id", filters.officerId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Work order list error:", error.message);
      throw error;
    }

    const rows = (data ?? []) as unknown as WorkOrderRow[];
    const mapped = rows.map(mapWorkOrder);

    // priority_level lives on the complaint, so it cannot be filtered
    // in the same query without a foreign-table filter; doing it here
    // keeps the query simple and the result identical.
    return filters?.priority
      ? mapped.filter((wo) => wo.priorityLevel === filters.priority)
      : mapped;
  },

  async getWorkOrderById(id: string): Promise<WorkOrder | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Work order fetch error:", error.message);
      throw error;
    }

    if (!data) return null;

    const workOrder = mapWorkOrder(data as unknown as WorkOrderRow);

    /*
     * Detail view needs both sides of the evidence: what the citizen
     * submitted, and the officer's proof of the fix.
     */
    const [citizenEvidence, resolutionEvidence, latestNote] =
      await Promise.all([
        supabase
          .from("complaint_media")
          .select("id, storage_path, file_type, created_at")
          .eq("complaint_id", workOrder.complaintId)
          .order("created_at", { ascending: true }),
        supabase
          .from("resolution_proofs")
          .select("id, storage_path, description, created_at")
          .eq("work_order_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("work_order_updates")
          .select("note")
          .eq("work_order_id", id)
          .not("note", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const evidenceRows = citizenEvidence.data ?? [];
    const proofRows = resolutionEvidence.data ?? [];

    const [evidenceUrls, proofUrls] = await Promise.all([
      signPaths(
        supabase,
        EVIDENCE_BUCKET,
        evidenceRows.map((row) => row.storage_path as string)
      ),
      signPaths(
        supabase,
        PROOF_BUCKET,
        proofRows.map((row) => row.storage_path as string)
      ),
    ]);

    /*
     * An unsigned path means the object is gone or unreadable. Dropping
     * it is better than rendering a broken image, and better than
     * throwing — one missing photo must not take out the whole work
     * order view.
     */
    workOrder.citizenEvidence = evidenceRows.flatMap((row) => {
      const url = evidenceUrls.get(row.storage_path as string);
      if (!url) return [];

      return [
        {
          id: row.id as string,
          url,
          type: "image" as const,
          uploadedAt: row.created_at as string,
        },
      ];
    });

    workOrder.resolutionEvidence = proofRows.flatMap((row) => {
      const url = proofUrls.get(row.storage_path as string);
      if (!url) return [];

      return [
        {
          id: row.id as string,
          url,
          type: "image" as const,
          caption: (row.description as string | null) ?? undefined,
          uploadedAt: row.created_at as string,
        },
      ];
    });

    workOrder.resolutionNotes =
      (latestNote.data?.note as string | undefined) ?? undefined;

    return workOrder;
  },

  async getWorkOrdersByComplaintId(complaintId: string): Promise<WorkOrder[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Work order by complaint error:", error.message);
      throw error;
    }

    return ((data ?? []) as unknown as WorkOrderRow[]).map(mapWorkOrder);
  },

  /**
   * Advances a work order and keeps the parent complaint in step.
   *
   * Three writes, in order of importance:
   *   1. work_orders          — the transition itself
   *   2. work_order_updates   — the audit trail entry
   *   3. complaints.status    — what the citizen sees
   *
   * Steps 2 and 3 are best-effort: if the audit insert or the
   * complaint sync fails, the transition itself still stands rather
   * than leaving the officer unable to progress. Failures are logged,
   * not swallowed silently.
   */
  async updateWorkOrderStatus(
    update: WorkOrderUpdate
  ): Promise<WorkOrder> {
    const supabase = createClient();
    const now = update.timestamp || new Date().toISOString();

    /*
     * The audit row's created_by must equal auth.uid() to satisfy the
     * "Work order update insert" policy, so it is resolved from the
     * session here rather than trusted from the caller. The page
     * previously passed a literal "unknown-officer" when the profile
     * lookup lost its race, which is not a uuid and failed the insert.
     */
    const authorId = await getAuthenticatedUserId();

    const patch: Record<string, unknown> = { status: update.status };

    if (update.status === "accepted") patch.accepted_at = now;
    if (update.status === "in_progress") patch.started_at = now;
    if (update.status === "resolved") patch.completed_at = now;

    const { error: updateError } = await supabase
      .from("work_orders")
      .update(patch)
      .eq("id", update.workOrderId);

    if (updateError) {
      console.error("Work order status update error:", updateError.message);
      throw updateError;
    }

    // Audit trail.
    const { error: logError } = await supabase
      .from("work_order_updates")
      .insert({
        work_order_id: update.workOrderId,
        status: update.status,
        note: update.notes ?? null,
        created_by: authorId,
      });

    if (logError) {
      console.error("Work order audit entry failed:", logError.message);
    }

    const refreshed = await this.getWorkOrderById(update.workOrderId);

    if (!refreshed) {
      throw new Error("Work order could not be reloaded after update.");
    }

    // Keep the citizen-facing complaint status aligned.
    const complaintStatus = COMPLAINT_STATUS_FOR[update.status];

    if (complaintStatus) {
      const { error: syncError } = await supabase
        .from("complaints")
        .update({ status: complaintStatus })
        .eq("id", refreshed.complaintId);

      if (syncError) {
        console.error(
          "Complaint status sync failed:",
          syncError.message
        );
      }
    }

    return refreshed;
  },

  /**
   * Stores an officer's proof-of-work photograph.
   *
   * Previously the detail page built a `ComplaintMedia` object around
   * `URL.createObjectURL(file)` and handed it to updateWorkOrderStatus,
   * which ignored it — so the photo a supervisor is meant to verify
   * against existed only in that browser tab until it was closed. The
   * work order advanced to `proof_submitted` with no proof attached.
   *
   * Path convention matches complaint evidence:
   * `<uploader_id>/<work_order_id>/<uuid>.<ext>`, which is what the
   * "Resolution proof upload" storage policy checks.
   */
  async uploadResolutionProof(params: {
    workOrderId: string;
    file: File;
    description?: string;
  }): Promise<void> {
    const supabase = createClient();
    const uploaderId = await getAuthenticatedUserId();
    const { file } = params;

    if (file.size <= 0) {
      throw new Error("The selected photo is empty.");
    }

    if (file.size > MAX_PROOF_SIZE) {
      throw new Error("Photo size must be less than 10 MB.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Proof of work must be a photograph.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${uploaderId}/${params.workOrderId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Resolution proof upload error:", uploadError.message);
      throw new Error(
        uploadError.message || "Failed to upload proof of work."
      );
    }

    const { error: recordError } = await supabase
      .from("resolution_proofs")
      .insert({
        work_order_id: params.workOrderId,
        storage_path: storagePath,
        description: params.description ?? null,
        uploaded_by: uploaderId,
      });

    if (recordError) {
      console.error("Resolution proof record error:", recordError.message);

      // The object is unreachable without its row, so don't leave it
      // behind billing storage and confusing an audit.
      const { error: cleanupError } = await supabase.storage
        .from(PROOF_BUCKET)
        .remove([storagePath]);

      if (cleanupError) {
        console.error("Proof cleanup failed:", cleanupError.message);
      }

      throw new Error(
        recordError.message || "Failed to record proof of work."
      );
    }
  },

  /**
   * Assigns a complaint to an officer, creating the work order if the
   * complaint does not have one yet.
   *
   * This closes the gap the audit flagged: the authority queue could
   * display assignment state but had no way to set it, so
   * complaint -> work order -> officer was unreachable in the product.
   */
  async assignComplaint(params: {
    complaintId: string;
    officerId: string;
    departmentId?: string | null;
  }): Promise<WorkOrder> {
    const supabase = createClient();

    const existing = await this.getWorkOrdersByComplaintId(
      params.complaintId
    );

    if (existing.length > 0) {
      const { error } = await supabase
        .from("work_orders")
        .update({
          officer_id: params.officerId,
          ...(params.departmentId
            ? { department_id: params.departmentId }
            : {}),
          status: "assigned",
        })
        .eq("id", existing[0].id);

      if (error) {
        console.error("Work order reassignment error:", error.message);
        throw error;
      }

      const reassigned = await this.getWorkOrderById(existing[0].id);
      if (!reassigned) throw new Error("Reassignment could not be reloaded.");
      return reassigned;
    }

    // work_order_number and assigned_at are set by database triggers.
    const { data, error } = await supabase
      .from("work_orders")
      .insert({
        complaint_id: params.complaintId,
        officer_id: params.officerId,
        department_id: params.departmentId ?? null,
        status: "assigned",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Work order creation error:", error.message);
      throw error;
    }

    await supabase
      .from("complaints")
      .update({ status: "assigned" })
      .eq("id", params.complaintId);

    const created = await this.getWorkOrderById(data.id as string);
    if (!created) throw new Error("New work order could not be reloaded.");
    return created;
  },
};
