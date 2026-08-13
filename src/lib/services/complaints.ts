import { createClient } from "@/lib/supabase/client";

import type {
  Complaint,
  ComplaintMedia,
  ComplaintStatus,
  CreateComplaintInput,
  UpdateComplaintInput,
} from "@/types/complaint";

const EVIDENCE_BUCKET = "complaint-evidence";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

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
 */

function generateComplaintNumber(): string {
  const year = new Date().getFullYear();

  const randomPart = Math.floor(
    100000 + Math.random() * 900000
  );

  return `NS-${year}-${randomPart}`;
}

/**
 * ============================================================
 * CREATE COMPLAINT
 * ============================================================
 */

export async function createComplaint(
  input: CreateComplaintInput
): Promise<Complaint> {
  const supabase = createClient();

  const citizenId =
    await getAuthenticatedUserId();

  const complaintNumber =
    generateComplaintNumber();

  const { data, error } = await supabase
    .from("complaints")
    .insert({
      complaint_number:
        complaintNumber,

      citizen_id:
        citizenId,

      title:
        input.title.trim(),

      description:
        input.description.trim(),

      category:
        input.category ?? "other",

      status:
        "submitted",

      latitude:
        input.latitude ?? null,

      longitude:
        input.longitude ?? null,

      address:
        input.address ?? null,

      ward_id:
        input.wardId ?? null,

      department_id:
        input.departmentId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      "Create complaint error:",
      error.message
    );

    throw error;
  }

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
   */

  if (file.size <= 0) {
    throw new Error(
      "The selected image is empty."
    );
  }

  if (
    file.size > MAX_IMAGE_SIZE
  ) {
    throw new Error(
      "Image size must be less than 10 MB."
    );
  }

  if (
    !ALLOWED_IMAGE_TYPES.includes(
      file.type
    )
  ) {
    throw new Error(
      "Unsupported image format. Please upload JPG, PNG, WEBP, HEIC or HEIF."
    );
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
        contentType: file.type,
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
        file.type,

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
 * Fetches:
 * - Complaint
 * - Complaint media
 * - Signed URLs for private evidence
 */

export interface ComplaintDetails {
  complaint: Complaint;

  media: Array<
    ComplaintMedia & {
      signedUrl: string;
    }
  >;
}

export async function getComplaintDetails(
  complaintId: string
): Promise<ComplaintDetails> {
  const complaint =
    await getComplaintById(
      complaintId
    );

  const media =
    await getComplaintMedia(
      complaintId
    );

  const mediaWithUrls =
    await Promise.all(
      media.map(async (item) => {
        const signedUrl =
          await getComplaintMediaUrl(
            item.storage_path
          );

        return {
          ...item,
          signedUrl,
        };
      })
    );

  return {
    complaint,
    media: mediaWithUrls,
  };
}