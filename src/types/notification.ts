/**
 * ============================================================
 * NOTIFICATION TYPES
 * ============================================================
 *
 * Mirrors public.notification_type and public.notifications.
 *
 * `NotificationItem` previously lived in types/analytics.ts, which is
 * where it ended up because nothing read it — the notification surfaces
 * derived their feed from complaint state and never touched the table.
 * It has nothing to do with analytics.
 */

/**
 * Mirrors the `public.notification_type` enum exactly.
 *
 * Note what is *not* here: a separate "complaint created" alongside
 * "complaint submitted". Those are one database event — the row exists
 * with status `submitted` — so they are one notification. Emitting two
 * would mean inventing an event.
 */
export type NotificationType =
  // Citizen-facing, following their report through its lifecycle.
  | 'complaint_submitted'
  | 'complaint_triaged'
  | 'complaint_assigned'
  | 'work_accepted'
  | 'work_started'
  | 'proof_submitted'
  | 'complaint_under_review'
  | 'confirmation_requested'
  | 'complaint_resolved'
  | 'complaint_reopened'
  | 'complaint_rejected'
  // Officer-facing: a job arriving, or coming back.
  | 'work_order_assigned'
  | 'work_order_reopened'
  /**
   * Any transition the list above does not name.
   *
   * Deliberately present rather than treating an unknown status as an
   * error: a status added to the complaint enum later should still
   * notify, just generically, instead of silently producing nothing.
   */
  | 'status_changed';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  /** When it was read. Null while unread. */
  readAt: string | null;
  createdAt: string;
  /** The report this is about. Null only for rows predating the triggers. */
  complaintId: string | null;
  /** Set on officer-facing notifications. */
  workOrderId: string | null;
}

/*
 * The notification -> tone map lives in lib/design/status.ts, beside
 * STATUS_META, because that module is the single source of truth for
 * status colour in this product. Defining a parallel vocabulary here
 * would mean the tray drew a resolved report in a different green from
 * every other surface.
 */

/**
 * Events a recipient is expected to act on, which drive the tray badge.
 *
 * A badge that counts everything counts nothing: it would light up for
 * "your report has been triaged", which is information rather than a
 * task. Unread state is tracked for all of them; the badge is about
 * whether anything is *waiting on you*.
 */
export const ACTIONABLE_NOTIFICATIONS: NotificationType[] = [
  'confirmation_requested',
  'complaint_reopened',
  'work_order_assigned',
  'work_order_reopened',
];
