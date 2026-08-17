import type { WorkOrderStatus } from "../../types/workOrder.ts";

/**
 * ============================================================
 * THE WORK-ORDER STATE MACHINE, CLIENT SIDE
 * ============================================================
 *
 * A mirror of public.work_order_transition_allowed() in
 * supabase/migrations/20260816120000_work_order_lifecycle.sql, and
 * deliberately only a mirror. The database is the authority: the
 * lifecycle trigger refuses any transition it does not recognise, no
 * matter what this file says or who is asking.
 *
 * What this is for is the two things a database check cannot do — let
 * the UI offer the right action, and fail an impossible request before a
 * round trip. It decides nothing.
 *
 * Kept in its own module, free of the Supabase client, so it can be
 * unit-tested. workOrders.ts re-exports it, so callers see one surface.
 *
 * THE SHAPE OF IT
 *
 *   THE ASSIGNED OFFICER does the field work and stops at
 *   proof_submitted. An officer resolving their own job is precisely
 *   what the verification stage exists to prevent.
 *
 *   OVERSIGHT (supervisor, government_admin) runs sign-off, can reject
 *   at any stage of it, and can reassign — the one legitimate way back
 *   to `assigned`.
 */

const OFFICER_TRANSITIONS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> =
  {
    assigned: ["accepted"],
    accepted: ["in_progress"],
    in_progress: ["proof_submitted"],
    // Rework does not need re-acknowledging: the officer already has it.
    reopened: ["in_progress"],
  };

const OVERSIGHT_TRANSITIONS: Partial<
  Record<WorkOrderStatus, WorkOrderStatus[]>
> = {
  proof_submitted: ["supervisor_review", "reopened"],
  supervisor_review: ["citizen_confirmation", "reopened"],
  citizen_confirmation: ["resolved", "reopened"],
  /*
   * A resolved work order can only be reopened. Not walked backwards to
   * in_progress, and not quietly reassigned: either would erase that the
   * job was ever finished, where reopening records that the repair was
   * rejected.
   */
  resolved: ["reopened"],
};

/**
 * What this viewer may do next, given the work order's current state.
 *
 * Oversight gets the officer's transitions as well as their own: a
 * supervisor holds the officer workspace and can be an assignee.
 * Reassignment is not listed here — it changes officer_id rather than
 * status, and goes through assignComplaint().
 */
export function allowedTransitions(
  from: WorkOrderStatus,
  isOversight: boolean
): WorkOrderStatus[] {
  const officer = OFFICER_TRANSITIONS[from] ?? [];

  if (!isOversight) return officer;

  return [...officer, ...(OVERSIGHT_TRANSITIONS[from] ?? [])];
}
