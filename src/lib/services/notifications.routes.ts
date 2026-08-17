import type { NotificationItem } from "../../types/notification.ts";

/**
 * ============================================================
 * WHERE A NOTIFICATION LEADS
 * ============================================================
 *
 * A work-order event is one event with two audiences: the officer acts on
 * it at /officer/work-orders/[id], the reporting citizen reads about it at
 * /citizen/complaints/[id]. So the destination depends on whose tray it
 * is being rendered in, not on the notification alone.
 *
 * Kept free of the Supabase client so it can be unit-tested, because the
 * property that matters is a negative one: a citizen must never be handed
 * an /officer route. The workspace guard and RLS would both refuse them,
 * but a link that leads somewhere a reader cannot go is a broken link
 * whether or not it is also a security boundary.
 */

export type Workspace = "citizen" | "officer";

export function notificationHref(
  notification: Pick<NotificationItem, "complaintId" | "workOrderId">,
  workspace: Workspace
): string | null {
  if (workspace === "officer") {
    /*
     * Staff work from the work order. A staff-visible notification about a
     * complaint with no work order — a submission, a triage — has nowhere
     * useful to send them: there is no officer-side complaint route, and
     * sending them to the citizen's would 403 at the workspace guard.
     */
    return notification.workOrderId
      ? `/officer/work-orders/${notification.workOrderId}`
      : null;
  }

  /*
   * The citizen always goes to their report, even when the event was a
   * work-order transition — that page is where the timeline, the evidence
   * and the confirmation action live. Deliberately never a work-order
   * URL: those are staff-only, so linking one would be offering a
   * redirect.
   */
  return notification.complaintId
    ? `/citizen/complaints/${notification.complaintId}`
    : null;
}
