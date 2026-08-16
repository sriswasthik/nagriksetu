import { createClient } from "@/lib/supabase/client";

import type {
  Complaint,
  ComplaintMedia,
  ComplaintStatus,
  ComplaintStatusEvent,
  CreateComplaintInput,
  UpdateComplaintInput,
} from "@/types/complaint";

const EVIDENCE_BUCKET = "complaint-evidence";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const SIGNED_URL_TTL_SECONDS = 3600;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/**
 * Maps an extension onto the MIME type Storage expects.
 *
 * Needed because plenty of Android browsers, and iOS with HEIC, hand
 * back a File whose `type` is the empty string. The picker accepted
 * those by extension while this module required a MIME match, so a photo
 * could pass validation in the form and then be rejected at upload —
 * after the complaint had already been created. Both sides now use
 * validateEvidenceFile(), and the resolved type is what gets sent, so
 * the bucket's allowed_mime_types check sees something valid too.
 */
const MIME_FOR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export interface EvidenceFileCheck {
  ok: boolean;
  /** Human-readable reason, when not ok. */
  reason?: string;
  /** The MIME type to upload with — resolved from the extension when the browser gave none. */
  contentType?: string;
}

/**
 * The single rule for what counts as acceptable evidence.
 *
 * Exported so the picker rejects a file before the citizen fills in the
 * rest of the form, rather than after their report has been filed.
 */
export function validateEvidenceFile(file: File): EvidenceFileCheck {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  const contentType =
    ALLOWED_IMAGE_TYPES.includes(file.type)
      ? file.type
      : MIME_FOR_EXTENSION[extension];

  if (!contentType) {
    return {
      ok: false,
      reason:
        "That file isn't a supported image. Please choose a JPG, PNG, WEBP or HEIC photo.",
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      reason: "That image appears to be empty. Please choose another.",
    };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return {
      ok: false,
      reason: `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please choose one under 10 MB.`,
    };
  }

  return { ok: true, contentType };
}

/**
 * ============================================================
 * AUTHENTICATED USER
 * ============================================================
 */

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error(
      "You must be logged in to perform this action."
    );
  }

  return user.id;
}

/**
 * ============================================================
 * COMPLAINT NUMBER
 * ============================================================
 *
 * Allocated by Postgres, not here.
 *
 * generateComplaintNumber() used to build `NS-<year>-<6 random digits>`
 * in the browser and insert it into a `unique` column. Six random
 * digits collide more often than not at around 1,100 complaints per
 * year, and a collision fails the citizen's submission with an opaque
 * 23505 that retrying cannot reliably fix.
 *
 * complaints_set_number (see
 * supabase/migrations/20260814120400_complaint_number_sequence.sql) now
 * fills the column from a sequence on insert, so the number is unique
 * by construction and this insert simply omits it.
 */

/**
 * ============================================================
 * CREATE COMPLAINT
 * ============================================================
 *
 * Goes through submit_complaint() rather than inserting directly, for
 * three reasons:
 *
 *   1. **Idempotency.** The function keys on `submission_key`, so a
 *      retry after a lost response returns the complaint that already
 *      exists. Previously a flaky connection could file the same issue
 *      twice: the insert succeeded, the response never arrived, the form
 *      showed an error, and the citizen pressed Submit again.
 *
 *   2. **Validation that a direct API call cannot skip.** Title and
 *      description lengths, coordinate ranges, and a 0,0 guard — a
 *      failed GPS read looks exactly like Null Island, and storing it
 *      sends a crew to the Gulf of Guinea.
 *
 *   3. **Identity.** citizen_id comes from auth.uid() inside the
 *      function and is never accepted as an argument.
 */

export async function createComplaint(
  input: CreateComplaintInput
): Promise<Complaint> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("submit_complaint", {
    p_submission_key: input.submissionKey,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category ?? "other",
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_address: input.address,
    p_ward_id: input.wardId ?? null,
  });

  if (error) {
    console.error("Create complaint error:", error.message);
    throw new Error(error.message || "We couldn't file your report.");
  }

  if (!data) {
    throw new Error("The report was not returned after submission.");
  }

  /*
   * The function returns a single composite row. supabase-js types RPC
   * results as unknown, so the cast is unavoidable — but the shape is
   * `public.complaints`, guaranteed by the function's RETURNS clause.
   */
  return data as Complaint;
}

/**
 * ============================================================
 * GET MY COMPLAINTS
 * ============================================================
 */

export async function getMyComplaints(): Promise<
  Complaint[]
> {
  const supabase = createClient();

  const citizenId =
    await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq(
      "citizen_id",
      citizenId
    )
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Get complaints error:",
      error.message
    );

    throw error;
  }

  return (data ?? []) as Complaint[];
}

/**
 * ============================================================
 * GET COMPLAINT BY ID
 * ============================================================
 */

export async function getComplaintById(
  complaintId: string
): Promise<Complaint> {
  if (!complaintId) {
    throw new Error(
      "Complaint ID is required."
    );
  }

  const supabase = createClient();

  const {
    data,
    error,
  } = await supabase
    .from("complaints")
    .select("*")
    .eq("id", complaintId)
    .maybeSingle();

  if (error) {
    console.error(
      "Get complaint error:",
      error.message
    );

    throw new Error(
      `Unable to fetch complaint: ${error.message}`
    );
  }

  if (!data) {
    console.error(
      "Complaint not found or not accessible:",
      complaintId
    );

    throw new Error(
      "Complaint not found or you do not have permission to view it."
    );
  }

  return data as Complaint;
}

/**
 * ============================================================
 * UPDATE COMPLAINT
 * ============================================================
 */

export async function updateComplaint(
  complaintId: string,
  input: UpdateComplaintInput
): Promise<Complaint> {
  const supabase = createClient();

  const updateData: Record<
    string,
    unknown
  > = {};

  if (
    input.title !== undefined
  ) {
    updateData.title =
      input.title.trim();
  }

  if (
    input.description !== undefined
  ) {
    updateData.description =
      input.description.trim();
  }

  if (
    input.category !== undefined
  ) {
    updateData.category =
      input.category;
  }

  if (
    input.latitude !== undefined
  ) {
    updateData.latitude =
      input.latitude;
  }

  if (
    input.longitude !== undefined
  ) {
    updateData.longitude =
      input.longitude;
  }

  if (
    input.address !== undefined
  ) {
    updateData.address =
      input.address;
  }

  const { data, error } = await supabase
    .from("complaints")
    .update(updateData)
    .eq(
      "id",
      complaintId
    )
    .select("*")
    .single();

  if (error) {
    console.error(
      "Update complaint error:",
      error.message
    );

    throw error;
  }

  return data as Complaint;
}

/**
 * ============================================================
 * REOPEN COMPLAINT
 * ============================================================
 */

export async function reopenComplaint(
  complaintId: string
): Promise<Complaint> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("complaints")
    .update({
      status:
        "reopened" satisfies ComplaintStatus,
    })
    .eq(
      "id",
      complaintId
    )
    .select("*")
    .single();

  if (error) {
    console.error(
      "Reopen complaint error:",
      error.message
    );

    throw error;
  }

  return data as Complaint;
}

/**
 * ============================================================
 * UPLOAD COMPLAINT EVIDENCE
 * ============================================================
 *
 * Storage path:
 *
 * {userId}/{complaintId}/{uniqueFilename}
 *
 * Example:
 *
 * user-id/
 *   complaint-id/
 *     uuid.jpg
 */

export async function uploadComplaintEvidence(
  complaintId: string,
  file: File
): Promise<ComplaintMedia> {
  const supabase = createClient();

  const userId =
    await getAuthenticatedUserId();

  /**
   * ----------------------------------------------------------
   * FILE VALIDATION
   * ----------------------------------------------------------
   *
   * The same check the picker runs, so a photo that was accepted in the
   * form cannot be rejected here — which used to happen after the
   * complaint had already been created, leaving a report with no
   * evidence and a confusing error.
   */

  const check = validateEvidenceFile(file);

  if (!check.ok || !check.contentType) {
    throw new Error(check.reason ?? "That photo cannot be uploaded.");
  }

  /**
   * ----------------------------------------------------------
   * FILE NAME
   * ----------------------------------------------------------
   */

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ||
    "jpg";

  const uniqueFileName =
    `${crypto.randomUUID()}.${extension}`;

  const storagePath =
    `${userId}/${complaintId}/${uniqueFileName}`;

  /**
   * ----------------------------------------------------------
   * STORAGE UPLOAD
   * ----------------------------------------------------------
   */

  const {
    error: uploadError,
  } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(
      storagePath,
      file,
      {
        cacheControl: "3600",
        contentType: check.contentType,
        upsert: false,
      }
    );

  if (uploadError) {
    console.error(
      "Evidence storage upload error:",
      uploadError.message
    );

    throw new Error(
      uploadError.message ||
      "Failed to upload evidence."
    );
  }

  /**
   * ----------------------------------------------------------
   * DATABASE RECORD
   * ----------------------------------------------------------
   *
   * Matches the actual complaint_media table:
   *
   * id
   * complaint_id
   * storage_path
   * file_name
   * file_type
   * uploaded_by
   * created_at
   * file_size
   */

  const {
    data,
    error,
  } = await supabase
    .from("complaint_media")
    .insert({
      complaint_id:
        complaintId,

      storage_path:
        storagePath,

      file_name:
        file.name,

      file_type:
        check.contentType,

      uploaded_by:
        userId,

      file_size:
        file.size,
    })
    .select("*")
    .single();

  /**
   * ----------------------------------------------------------
   * DATABASE INSERT ERROR
   * ----------------------------------------------------------
   */

  if (error) {
    console.error(
      "Complaint media record error:",
      {
        message:
          error.message,

        code:
          error.code,

        details:
          error.details,

        hint:
          error.hint,
      }
    );

    /**
     * Storage upload succeeded but the
     * database insert failed.
     *
     * Clean up the Storage file.
     */

    const {
      error: cleanupError,
    } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .remove([
        storagePath,
      ]);

    if (cleanupError) {
      console.error(
        "Storage cleanup failed:",
        cleanupError.message
      );
    }

    throw new Error(
      error.message ||
      "Failed to create complaint media record."
    );
  }

  return data as ComplaintMedia;
}

/**
 * ============================================================
 * GET COMPLAINT MEDIA
 * ============================================================
 */

export async function getComplaintMedia(
  complaintId: string
): Promise<ComplaintMedia[]> {
  const supabase = createClient();

  const {
    data,
    error,
  } = await supabase
    .from("complaint_media")
    .select("*")
    .eq(
      "complaint_id",
      complaintId
    )
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    console.error(
      "Get complaint media error:",
      {
        message:
          error.message,

        code:
          error.code,

        details:
          error.details,

        hint:
          error.hint,
      }
    );

    throw error;
  }

  return (
    data ?? []
  ) as ComplaintMedia[];
}

/**
 * ============================================================
 * GET SIGNED URL
 * ============================================================
 *
 * The bucket is PRIVATE.
 *
 * Therefore we create a temporary signed URL.
 */

export async function getComplaintMediaUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createClient();

  const {
    data,
    error,
  } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(
      storagePath,
      expiresIn
    );

  if (error) {
    console.error(
      "Create signed URL error:",
      error.message
    );

    throw new Error(
      error.message ||
      "Unable to generate evidence URL."
    );
  }

  if (
    !data?.signedUrl
  ) {
    throw new Error(
      "Unable to generate evidence URL."
    );
  }

  return data.signedUrl;
}

/**
 * ============================================================
 * DELETE COMPLAINT EVIDENCE
 * ============================================================
 */

export async function deleteComplaintEvidence(
  media: ComplaintMedia
): Promise<void> {
  const supabase = createClient();

  /**
   * Delete Storage object.
   */

  const {
    error: storageError,
  } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .remove([
      media.storage_path,
    ]);

  if (storageError) {
    console.error(
      "Delete storage file error:",
      storageError.message
    );

    throw new Error(
      storageError.message ||
      "Failed to delete evidence file."
    );
  }

  /**
   * Delete database record.
   */

  const {
    error: databaseError,
  } = await supabase
    .from("complaint_media")
    .delete()
    .eq(
      "id",
      media.id
    );

  if (databaseError) {
    console.error(
      "Delete media record error:",
      {
        message:
          databaseError.message,

        code:
          databaseError.code,

        details:
          databaseError.details,

        hint:
          databaseError.hint,
      }
    );

    throw new Error(
      databaseError.message ||
      "Failed to delete media record."
    );
  }
}

/**
 * ============================================================
 * GET COMPLETE COMPLAINT DETAILS
 * ============================================================
 *
 * One call for everything the detail page renders, so the page has no
 * partial states to reason about:
 *
 *   - the complaint
 *   - its evidence, with signed URLs
 *   - the department NAME, not the uuid
 *   - the recorded status history
 */

export interface ComplaintDetails {
  complaint: Complaint;

  media: Array<
    ComplaintMedia & {
      /** Null when the object could not be signed — a missing file, not a page failure. */
      signedUrl: string | null;
    }
  >;

  /**
   * Resolved from departments.name.
   *
   * The page previously rendered `formatCategory(complaint.department_id)`,
   * which put a raw uuid — "Cd0106C4 71F5 4Ab4 A38E Fe8F457Ec047" — in
   * front of the citizen as the responsible department.
   */
  departmentName: string | null;

  /** Oldest first, straight from complaint_status_history. */
  history: ComplaintStatusEvent[];
}

export async function getComplaintDetails(
  complaintId: string
): Promise<ComplaintDetails> {
  const supabase = createClient();

  const complaint = await getComplaintById(complaintId);

  /*
   * Everything else is independent of everything else, so it goes in
   * parallel. Each branch is individually recoverable: a missing
   * department name or an unreadable history must not blank the page,
   * because the complaint itself is the thing the citizen came for.
   */
  const [media, historyResult, departmentResult] = await Promise.all([
    getComplaintMedia(complaintId),

    supabase
      .from("complaint_status_history")
      .select("id, status, note, created_at")
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: true }),

    complaint.department_id
      ? supabase
          .from("departments")
          .select("name")
          .eq("id", complaint.department_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (historyResult.error) {
    console.error(
      "Status history unavailable:",
      historyResult.error.message
    );
  }

  if (departmentResult.error) {
    console.error(
      "Department lookup failed:",
      departmentResult.error.message
    );
  }

  /*
   * Signed in one round trip rather than one per photo, and a single
   * unsignable object drops that photo instead of throwing. Previously
   * one missing file failed getComplaintDetails() outright, so the whole
   * report became unviewable.
   */
  const signed = new Map<string, string>();

  if (media.length > 0) {
    const { data, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrls(
        media.map((item) => item.storage_path),
        SIGNED_URL_TTL_SECONDS
      );

    if (error) {
      console.error("Signing evidence URLs failed:", error.message);
    }

    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) {
        signed.set(entry.path, entry.signedUrl);
      }
    }
  }

  return {
    complaint,

    media: media.map((item) => ({
      ...item,
      signedUrl: signed.get(item.storage_path) ?? null,
    })),

    departmentName:
      (departmentResult.data as { name?: string } | null)?.name ?? null,

    history: (historyResult.data ?? []) as ComplaintStatusEvent[],
  };
}
