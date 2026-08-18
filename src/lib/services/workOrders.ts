import { createClient } from "@/lib/supabase/client";
import { NotSignedInError } from "@/lib/services/errors";
import type {
  AssignableOfficer,
  WorkOrder,
  WorkOrderHistoryEntry,
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

/*
 * Row caps for the list query.
 *
 * A work-order row carries its complaint, department and officer through
 * the join, so these are not cheap rows. 200 is more than fits on any
 * screen and enough for the queue's client-side search to feel complete;
 * the hard ceiling stops a caller asking for the city.
 */
const DEFAULT_WORK_ORDER_ROWS = 200;
const MAX_WORK_ORDER_ROWS = 500;

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

    /*
     * Coordinates stay nullable.
     *
     * They were coalesced to 0, which is not a missing value — it is Null
     * Island, in the Gulf of Guinea. So an unlocated work order arrived at
     * the map as a well-typed pair of numbers that every downstream check
     * accepted, and `fitBounds` over the city plus that point framed a
     * hemisphere: one row without coordinates collapsed every real marker
     * to a pixel.
     *
     * Null is the honest value, and the maps now render "No location
     * recorded" for it rather than a confident pin in the wrong ocean.
     */
    location: {
      latitude: complaint?.latitude ?? null,
      longitude: complaint?.longitude ?? null,
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

/*
 * The work-order-to-complaint status mapping used to live here, applied
 * by a third UPDATE after every transition. It is now
 * sync_complaint_status() in the database, firing in the same
 * transaction as the transition itself.
 *
 * It had to move. As an application statement it was explicitly
 * best-effort — "if the complaint sync fails, the transition still
 * stands" — so an officer could see `in_progress` while the citizen
 * tracking that same report still saw `assigned`, with nothing to
 * reconcile them and no error either would ever be shown. And creating
 * a work order propagated nothing at all, so assignment itself left the
 * citizen looking at "Submitted".
 */

/*
 * The client-side state machine lives in workOrders.transitions.ts,
 * without the Supabase client, so it can be unit-tested — see
 * workOrders.test.ts, which checks it against the SQL it mirrors.
 * Re-exported so callers still see one surface.
 */
export { allowedTransitions } from "./workOrders.transitions";

export const workOrderService = {
  /**
   * The signed-in user's own assignments.
   *
   * Exists because every officer screen was calling
   * `getWorkOrders({ officerId: user?.id })` after a
   * `getCurrentUser().catch(() => null)`. When that lookup failed —
   * or when the viewer was a supervisor, who has the officer workspace —
   * `officerId` was `undefined`, the filter was dropped, and the query
   * fell back to whatever row-level security allowed. For a supervisor
   * that is the entire city, so "your work orders for today" quietly
   * became everyone's.
   *
   * Resolving the identity here means it cannot be omitted, and a
   * missing session raises instead of widening the query.
   */
  async getMyWorkOrders(filters?: {
    status?: WorkOrderStatus;
    priority?: string;
  }): Promise<WorkOrder[]> {
    const officerId = await getAuthenticatedUserId();

    return this.getWorkOrders({ ...filters, officerId });
  },

  /**
   * Work orders the caller may see, newest first, capped.
   *
   * The cap is not optional. This was an unbounded select joining four
   * tables, and the authority queue and the hotspot map both called it
   * with no filters at all — so every work order in the city, with its
   * complaint, department and officer, was downloaded to the browser to
   * be counted and filtered there. That is fine at demo scale and is the
   * first thing to fall over at city scale.
   *
   * Counts do not come from the returned array any more. The screens that
   * need totals read them from the analytics aggregates, which count in
   * Postgres — so a capped page of rows no longer means capped numbers.
   */
  async getWorkOrders(filters?: {
    status?: WorkOrderStatus;
    priority?: string;
    officerId?: string;
    /** Rows to return. Clamped to MAX_WORK_ORDER_ROWS. */
    limit?: number;
  }): Promise<WorkOrder[]> {
    const supabase = createClient();

    const limit = Math.min(
      Math.max(filters?.limit ?? DEFAULT_WORK_ORDER_ROWS, 1),
      MAX_WORK_ORDER_ROWS
    );

    let query = supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    /*
     * An explicit officer filter narrows the query; omitting it means
     * "whatever this caller may see", which is the city for oversight
     * and their own assignments for an officer. Both are legitimate —
     * the authority queue wants the former — so the choice is the
     * caller's, made by picking this method or getMyWorkOrders().
     */
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
   * Advances a work order.
   *
   * One call now, where there were three writes. advance_work_order()
   * performs the transition, and triggers in the same transaction write
   * the audit row and move the parent complaint — so either all three
   * happen or none does.
   *
   * What that replaced, and why it had to go:
   *
   *   - Three separate statements, two of them deliberately
   *     best-effort. The audit entry and the citizen's status were
   *     allowed to fail silently, which meant the record of who changed
   *     what could be missing precisely when something had gone wrong.
   *   - A caller-supplied `timestamp` written into accepted_at,
   *     started_at and completed_at. Those are SLA evidence; a browser
   *     that can set them can backdate a repair. The database now
   *     stamps them and refuses a caller that tries.
   *
   * `update.timestamp` is therefore ignored rather than sent. It stays
   * on WorkOrderUpdate because callers still pass it and dropping the
   * field would be a breaking change for no gain; the type documents
   * that it is advisory.
   */
  async updateWorkOrderStatus(
    update: WorkOrderUpdate
  ): Promise<WorkOrder> {
    const supabase = createClient();

    /*
     * Resolved before the call, not to send it — the database reads
     * auth.uid() itself for both the policy and the audit row's actor —
     * but so that a signed-out officer gets "you need to be signed in"
     * instead of a policy violation from PostgREST.
     */
    await getAuthenticatedUserId();

    const { error } = await supabase.rpc("advance_work_order", {
      p_work_order_id: update.workOrderId,
      p_status: update.status,
      p_note: update.notes ?? null,
    });

    if (error) {
      console.error("Work order transition refused:", error.message);

      /*
       * The database's messages are written to be read by the officer —
       * "Submit at least one photograph of the completed work first",
       * "A work order cannot move from resolved to in_progress" — so
       * they are surfaced rather than replaced with "please try again",
       * which is advice that cannot work here.
       */
      throw new Error(
        error.message || "That change to the work order was refused."
      );
    }

    /*
     * Reloaded rather than returned from the RPC. advance_work_order()
     * returns the work_orders row, but the page needs the joined view —
     * complaint, department, officer, evidence — and reading it back is
     * also how the officer sees the trigger's own effects (the stamped
     * timestamp, the synced complaint status) rather than a guess at
     * them.
     */
    const refreshed = await this.getWorkOrderById(update.workOrderId);

    if (!refreshed) {
      throw new Error("Work order could not be reloaded after update.");
    }

    return refreshed;
  },

  /**
   * The recorded transitions for a work order, newest first.
   *
   * work_order_updates has existed since the initial schema and was
   * read for exactly one thing: the most recent note. So the audit
   * trail was written and then thrown away, and the "Timeline" an
   * officer saw was reconstructed from four timestamp columns on the
   * work order — which cannot show who did anything, and cannot show a
   * reopening at all, because a second visit overwrites started_at.
   *
   * Actor names come from the join; a null created_by (a transition with
   * no session behind it — a migration, a server task) is reported as
   * such rather than attributed to somebody.
   */
  async getWorkOrderHistory(
    workOrderId: string
  ): Promise<WorkOrderHistoryEntry[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("work_order_updates")
      .select(
        `
        id,
        status,
        note,
        created_at,
        actor:profiles!work_order_updates_created_by_fkey ( id, full_name )
        `
      )
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false });

    if (error) {
      /*
       * An unreadable history must not take out the work order view: the
       * officer came here to do the job, and the trail is context.
       */
      console.error("Work order history unavailable:", error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      /*
       * created_by is a many-to-one foreign key, so PostgREST returns a
       * single object — but it types every embedded resource as an
       * array, so both shapes are unwrapped rather than asserted away.
       */
      const embedded = row.actor as
        | { id: string; full_name: string | null }
        | { id: string; full_name: string | null }[]
        | null;

      const actor = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;

      return {
        id: row.id as string,
        status: row.status as WorkOrderStatus,
        note: (row.note as string | null) ?? null,
        actorId: actor?.id ?? null,
        actorName: actor?.full_name ?? null,
        at: row.created_at as string,
      };
    });
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

    /*
     * Checked before the object is stored, not after.
     *
     * The "Assigned officer can add proof" policy already refuses the
     * resolution_proofs row for a work order that is not the uploader's,
     * and the storage policy refuses a path that is not under their own
     * id — so nothing unauthorised was ever persisted. But the upload
     * happened first, so an officer photographing the wrong job
     * discovered it only after their photo had been stored and then
     * cleaned up again. Reading the work order first turns that into a
     * sentence they can act on.
     *
     * This is a courtesy, not the boundary: RLS below is what makes it
     * true, and it still runs.
     */
    const { data: target, error: lookupError } = await supabase
      .from("work_orders")
      .select("id, officer_id, status")
      .eq("id", params.workOrderId)
      .maybeSingle();

    if (lookupError) {
      console.error("Work order lookup before upload failed:", lookupError.message);
    }

    if (!target) {
      throw new Error(
        "That work order is not available to you, so proof cannot be attached to it."
      );
    }

    if (target.officer_id !== uploaderId) {
      throw new Error(
        "Only the officer assigned to this work order can submit proof for it."
      );
    }

    if (target.status !== "in_progress" && target.status !== "reopened") {
      throw new Error(
        "Proof can only be added while the work is in progress."
      );
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

    /*
     * work_order_number and assigned_at are set by database triggers,
     * and the complaint's own status is moved to `assigned` by
     * sync_complaint_status() firing on this insert.
     *
     * That last part used to be a follow-up UPDATE here whose result was
     * not even checked, so a citizen whose report had just been assigned
     * could still be looking at "Submitted" indefinitely.
     */
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
      throw new Error(
        error.message ||
          "That complaint could not be assigned. Only a supervisor or administrator can assign work."
      );
    }

    const created = await this.getWorkOrderById(data.id as string);
    if (!created) throw new Error("New work order could not be reloaded.");
    return created;
  },

  /**
   * Officers and supervisors who can be given work, least-loaded first.
   *
   * The authority queue could show that a complaint was unassigned but
   * had no way to list anybody to assign it to. Through
   * assignable_officers(), which is SECURITY INVOKER — so a citizen
   * calling it gets nothing, because the profile policies still apply.
   */
  async getAssignableOfficers(): Promise<AssignableOfficer[]> {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("assignable_officers");

    if (error) {
      console.error("Assignable officer lookup failed:", error.message);
      throw new Error(
        error.message || "The list of officers could not be loaded."
      );
    }

    return (data ?? []).map(
      (row: { id: string; full_name: string | null; open_work_orders: number }) => ({
        id: row.id,
        name: row.full_name ?? "Unnamed officer",
        openWorkOrders: Number(row.open_work_orders ?? 0),
      })
    );
  },
};
