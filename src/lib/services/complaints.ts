import { createClient } from "@/lib/supabase/client";
import {
  NotSignedInError,
  isMissingDatabaseObject,
  toActionableError,
} from "@/lib/services/errors";

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

/** How far back the degraded path looks for an accidental resubmission. */
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

/** ~11 m at the equator — the same pin, allowing for float noise. */
const COORDINATE_EPSILON = 0.0001;

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

/**
 * The signed-in user's id, or null when nobody is signed in.
 *
 * getUser() reports a missing session by returning an
 * AuthSessionMissingError in `error`, not by returning a null user with
 * no error. Rethrowing that made an ordinary signed-out visit look like a
 * fault: the header's notification tray logged
 * "AuthSessionMissingError: Auth session missing!" with a stack trace on
 * every page load before sign-in.
 *
 * Being signed out is a state. Callers that need a session use
 * requireAuthenticatedUserId(); callers that are merely speculative use
 * this and render nothing.
 */
export async function getAuthenticatedUserIdOrNull(): Promise<string | null> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    // AuthSessionMissingError is the no-session case; anything else is a
    // real transport or provider failure worth reporting.
    if (error.name === "AuthSessionMissingError") {
      return null;
    }

    console.error("Session lookup failed:", error.message);
    return null;
  }

  return user?.id ?? null;
}

async function getAuthenticatedUserId(): Promise<string> {
  const userId = await getAuthenticatedUserIdOrNull();

  if (!userId) {
    throw new NotSignedInError(
      "You need to be signed in to do that. Please sign in and try again."
    );
  }

  return userId;
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
 * The number now comes from complaint_number_seq, via either the column
 * default or the complaints_set_number trigger (see
 * 20260814120400 and 20260814120900), so this module normally omits it.
 *
 * fallbackComplaintNumber() below is the one exception, for a database
 * that has neither — see submitThroughInsert().
 */

/**
 * ============================================================
 * CREATE COMPLAINT
 * ============================================================
 *
 * Prefers submit_complaint(), for three reasons:
 *
 *   1. **Idempotency.** The function keys on `submission_key`, so a
 *      retry after a lost response returns the complaint that already
 *      exists. Previously a flaky connection could file the same issue
 *      twice: the insert succeeded, the response never arrived, the form
 *      showed an error, and the citizen pressed Submit again.
 *
 *   2. **Validation a direct API call cannot skip.** Title and
 *      description lengths, coordinate ranges, and a 0,0 guard — a
 *      failed GPS read looks exactly like Null Island, and storing it
 *      sends a crew to the Gulf of Guinea.
 *
 *   3. **Identity.** citizen_id comes from auth.uid() inside the
 *      function and is never accepted as an argument.
 *
 * ...and falls back to a direct insert when that function is not in the
 * database.
 *
 * The fallback exists because a real deployment could not file a single
 * report: the schema was the original one, submit_complaint() had never
 * been created, and the citizen got told to run a CLI command. An app
 * that degrades is better than an app that stops, provided the
 * degradation is bounded and visible — so the checks the function would
 * have applied are applied here instead, and the console says plainly
 * what was lost.
 */

export async function createComplaint(
  input: CreateComplaintInput
): Promise<Complaint> {
  /*
   * Validated here as well as in the database. submit_complaint() is the
   * authority — a direct API call never sees this — but the fallback path
   * below does not go through it, and must not become a way to store a
   * report the rules would reject.
   */
  const invalid = validateComplaintInput(input);

  if (invalid) {
    throw new Error(invalid);
  }

  const viaFunction = await submitThroughFunction(input);

  if (viaFunction.outcome === "filed") {
    return viaFunction.complaint;
  }

  /*
   * The function is not there. Rather than leaving the citizen unable to
   * file anything, insert directly — the table, its RLS policies and the
   * citizen's own permission to insert all predate submit_complaint().
   *
   * This is a genuine downgrade and is logged as one: server-side
   * validation is replaced by the check above, and idempotency by the
   * recent-duplicate lookup in submitThroughInsert(). Whoever deployed
   * this should run supabase/bootstrap.sql.
   */
  console.warn(
    "submit_complaint() is unavailable in this database, so this report " +
      "was filed with a direct insert. Idempotency and server-side " +
      "validation are reduced. Run supabase/bootstrap.sql to restore them.",
    viaFunction.reason
  );

  return submitThroughInsert(input);
}

type FunctionSubmission =
  | { outcome: "filed"; complaint: Complaint }
  | { outcome: "unavailable"; reason: string };

/** The intended path: one statement, idempotent, validated in Postgres. */
async function submitThroughFunction(
  input: CreateComplaintInput
): Promise<FunctionSubmission> {
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
    /*
     * A missing function is recoverable — the caller falls back. Anything
     * else is the database rejecting this particular report, and must
     * reach the citizen rather than being retried a different way.
     */
    if (isMissingDatabaseObject(error)) {
      return {
        outcome: "unavailable",
        reason: error.message,
      };
    }

    const actionable = toActionableError(
      error,
      "We couldn't file your report. Please try again."
    );

    console.error("Create complaint error:", actionable.message, {
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    throw actionable;
  }

  if (!data) {
    throw new Error(
      "Your report may not have been saved — the server did not confirm it. " +
        "Check your reports before submitting again."
    );
  }

  /*
   * The function returns a single composite row. supabase-js types RPC
   * results as unknown, so the cast is unavoidable — but the shape is
   * `public.complaints`, guaranteed by the function's RETURNS clause.
   */
  return { outcome: "filed", complaint: data as Complaint };
}

/**
 * The degraded path, for a database that predates submit_complaint().
 *
 * Three things have to be discovered rather than assumed, because the
 * point of this path is that we do not know how old the schema is:
 *
 *   - whether `submission_key` exists (42703 if not)
 *   - whether the complaint number is assigned by the database (23502 if
 *     neither the default nor the trigger is there)
 *   - whether a previous attempt already succeeded
 *
 * Each retry is driven by a specific error code, never blind.
 */
async function submitThroughInsert(
  input: CreateComplaintInput
): Promise<Complaint> {
  const supabase = createClient();
  const citizenId = await getAuthenticatedUserId();

  /*
   * Stands in for the idempotency submit_complaint() gets from the unique
   * index. Without it, a retry after a lost response files the report
   * twice — which is the specific failure the submission key was
   * introduced to stop, and it should not come back just because the
   * database is old.
   */
  const existing = await findRecentDuplicate(input, citizenId);

  if (existing) {
    console.warn(
      "A matching report was filed moments ago; returning it instead of " +
        "creating a second one."
    );
    return existing;
  }

  const base: Record<string, unknown> = {
    citizen_id: citizenId,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category ?? "other",
    status: "submitted",
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address?.trim() ?? null,
    ward_id: input.wardId ?? null,
  };

  // Attempt 1: current schema, minus the function.
  let attempt = await insertComplaint(supabase, {
    ...base,
    submission_key: input.submissionKey,
  });

  // Missing submission_key in either Postgres or PostgREST schema cache.
  if (attempt.error && isMissingSubmissionKeyColumn(attempt.error)) {
    attempt = await insertComplaint(supabase, base);
  }

  /*
   * 23502 on complaint_number — neither the column default nor the
   * numbering trigger is present, so the number has to come from here.
   * Last resort only: a client-generated number cannot draw from the
   * sequence, so it uses enough entropy that a collision is negligible
   * and, if one does happen, the unique index rejects it rather than
   * issuing a duplicate.
   */
  if (
    attempt.error &&
    isComplaintNumberNotNullViolation(attempt.error)
  ) {
    console.warn(
      "This database assigns no complaint number, so one was generated " +
        "client-side. Run supabase/bootstrap.sql — the sequence is what " +
        "guarantees these are unique."
    );

    attempt = await insertComplaint(supabase, {
      ...base,
      ...(attempt.triedSubmissionKey
        ? { submission_key: input.submissionKey }
        : {}),
      complaint_number: fallbackComplaintNumber(),
    });
  }

  // Extremely unlikely, but a generated fallback number can still collide.
  if (attempt.error && isComplaintNumberUniqueViolation(attempt.error)) {
    attempt = await insertComplaint(supabase, {
      ...base,
      ...(attempt.triedSubmissionKey
        ? { submission_key: input.submissionKey }
        : {}),
      complaint_number: fallbackComplaintNumber(),
    });
  }

  if (attempt.error) {
    const actionable = toActionableError(
      attempt.error,
      "We couldn't file your report. Please try again."
    );

    console.error("Create complaint error:", actionable.message, {
      code: attempt.error.code,
      details: attempt.error.details,
      hint: attempt.error.hint,
    });

    throw actionable;
  }

  if (!attempt.data) {
    throw new Error(
      "Your report may not have been saved — the server did not confirm it. " +
        "Check your reports before submitting again."
    );
  }

  return attempt.data;
}

function isMissingSubmissionKeyColumn(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  /*
   * Postgres can report missing column as 42703, while PostgREST can
   * emit PGRST204 when its schema cache cannot find the requested field.
   */
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    haystack.includes("submission_key")
  );
}

function isComplaintNumberNotNullViolation(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  if (error.code !== "23502") {
    return false;
  }

  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return haystack.includes("complaint_number");
}

function isComplaintNumberUniqueViolation(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  if (error.code !== "23505") {
    return false;
  }

  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return haystack.includes("complaint_number");
}

interface InsertAttempt {
  data: Complaint | null;
  error: { code?: string; message?: string; details?: string; hint?: string } | null;
  triedSubmissionKey: boolean;
}

async function insertComplaint(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>
): Promise<InsertAttempt> {
  const { data, error } = await supabase
    .from("complaints")
    .insert(row)
    .select("*")
    .single();

  return {
    data: (data as Complaint | null) ?? null,
    error,
    triedSubmissionKey: "submission_key" in row,
  };
}

/**
 * A report this citizen filed in the last few minutes with the same title
 * and location.
 *
 * Deliberately narrow. It is not trying to detect two people reporting the
 * same pothole — that is what ai_possible_duplicate is for — only the same
 * form being submitted twice because the first response was lost.
 */
async function findRecentDuplicate(
  input: CreateComplaintInput,
  citizenId: string
): Promise<Complaint | null> {
  const supabase = createClient();

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("citizen_id", citizenId)
    .eq("title", input.title.trim())
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    // Not being able to check is not a reason to refuse the submission.
    console.error("Duplicate pre-check failed:", error.message);
    return null;
  }

  const candidate = (data?.[0] as Complaint | undefined) ?? null;

  if (!candidate) return null;

  const sameSpot =
    input.latitude !== null &&
    input.longitude !== null &&
    candidate.latitude !== null &&
    candidate.longitude !== null &&
    Math.abs(candidate.latitude - input.latitude) < COORDINATE_EPSILON &&
    Math.abs(candidate.longitude - input.longitude) < COORDINATE_EPSILON;

  return sameSpot ? candidate : null;
}

/**
 * Mirrors the validation in submit_complaint().
 *
 * Returns the message to show, or null when the input is acceptable. The
 * wording matches the database's so a citizen sees the same thing however
 * their report was routed.
 */
export function validateComplaintInput(
  input: CreateComplaintInput
): string | null {
  const title = input.title?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const address = input.address?.trim() ?? "";

  if (title.length < 5) {
    return "A report needs a title of at least 5 characters.";
  }

  if (title.length > 150) {
    return "That title is too long (150 characters maximum).";
  }

  if (description.length < 10) {
    return "A report needs a description of at least 10 characters.";
  }

  if (description.length > 2000) {
    return "That description is too long (2000 characters maximum).";
  }

  if (input.latitude === null || input.longitude === null) {
    return "A report needs a location.";
  }

  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    return "Those coordinates aren't valid. Please place the pin again.";
  }

  if (input.latitude < -90 || input.latitude > 90) {
    return "Latitude must be between -90 and 90.";
  }

  if (input.longitude < -180 || input.longitude > 180) {
    return "Longitude must be between -180 and 180.";
  }

  if (input.latitude === 0 && input.longitude === 0) {
    return "Those coordinates look like a failed location read. Capture the location again or place the pin on the map.";
  }

  if (address.length < 5) {
    return "A report needs an address or nearby landmark.";
  }

  return null;
}

/**
 * A tracking number for the case where the database assigns none.
 *
 * Twelve digits from crypto randomness rather than the sequence's six,
 * because without the sequence there is no coordination between clients —
 * the only defence against a collision is the size of the space, and the
 * unique index behind it.
 */
function fallbackComplaintNumber(): string {
  const random = crypto.getRandomValues(new Uint32Array(2));
  const digits = `${random[0]}${random[1]}`.slice(0, 12).padEnd(12, "0");

  return `NS-${new Date().getFullYear()}-${digits}`;
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
    if (isMissingStatusHistoryTable(historyResult.error)) {
      console.warn(
        "Status history is unavailable in this deployment; showing the complaint without timeline history."
      );
    } else {
      console.error(
        "Status history unavailable:",
        historyResult.error.message
      );
    }
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

function isMissingStatusHistoryTable(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  if (isMissingDatabaseObject(error)) {
    return true;
  }

  const haystack = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  return (
    (error.code === "PGRST205" || error.code === "42P01") &&
    haystack.includes("complaint_status_history")
  );
}
