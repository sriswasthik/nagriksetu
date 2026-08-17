import { createClient } from "@/lib/supabase/client";
import { NotSignedInError, isNotSignedIn } from "@/lib/services/errors";
import type {
  NotificationItem,
  NotificationType,
} from "@/types/notification";

/**
 * ============================================================
 * NOTIFICATION SERVICE
 * ============================================================
 *
 * Reads public.notifications, which is now written by database triggers
 * — see supabase/migrations/20260817130000_notification_lifecycle.sql.
 *
 * WHAT THIS REPLACES
 *
 * The table existed and had per-recipient policies, but nothing ever
 * wrote to it. So both notification surfaces derived a feed from
 * complaint state: one entry per report showing its *current* status.
 * Every entry was a real report in a real state, which is why it was a
 * defensible stopgap — but it showed state rather than events, so a
 * complaint that was assigned, worked and resolved produced one entry
 * that was overwritten each time. A citizen could never see that they
 * had been asked to confirm a repair unless they happened to look while
 * that was the current status. Read state lived in a React Set and was
 * lost on reload.
 *
 * WHO CAN SEE WHAT
 *
 * The read and update policies are `user_id = auth.uid()`, with no staff
 * exemption — an inbox is correspondence, not operational data. This
 * service does no filtering of its own beyond that, because a filter
 * here would be a second, weaker copy of the boundary.
 *
 * Creation is deliberately absent from this module. Every notification
 * comes from a trigger in the same transaction as the event that caused
 * it; `emit_notification()` is SECURITY DEFINER and granted to nobody,
 * so no client can address a notification to another user. The previous
 * insert policy allowed any staff member to write into any citizen's
 * inbox with any text; that is now closed.
 *
 * NO REALTIME
 *
 * Supabase realtime appears in config.toml because it is in the default
 * config, but nothing in this codebase subscribes to anything and no
 * migration adds a table to the `supabase_realtime` publication. Adding
 * a subscription layer — channel lifecycle, reconnection, publication
 * migration — for a notification tray would be more machinery than the
 * feature justifies. Refresh is explicit instead: on mount, when the
 * tray opens, when the tab regains focus, and after a mutation. That
 * covers every case a person actually notices.
 */

/*
 * The tray shows a handful; the page shows a page. Neither needs the
 * whole inbox, and an unbounded select on a table that grows one row per
 * lifecycle event per report is the query worth not writing.
 */
const TRAY_LIMIT = 8;
const PAGE_LIMIT = 50;

const NOTIFICATION_SELECT = `
  id,
  type,
  title,
  message,
  is_read,
  read_at,
  created_at,
  complaint_id,
  work_order_id
`;

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  complaint_id: string | null;
  work_order_id: string | null;
}

function mapNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
    complaintId: row.complaint_id,
    workOrderId: row.work_order_id,
  };
}

/**
 * The signed-in user's id.
 *
 * Not sent anywhere — every query and function below is scoped by
 * auth.uid() in the database — but resolving it first turns a
 * signed-out visitor into a readable error rather than an empty feed
 * that looks like "no notifications".
 */
async function requireUserId(): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // A missing session arrives as AuthSessionMissingError in `error`, not
  // as a null user. Both are the same thing and get the same message.
  if (error && error.name !== "AuthSessionMissingError") {
    console.error("Session lookup failed:", error.message);
  }

  if (!user) {
    throw new NotSignedInError(
      "You need to be signed in to see your notifications."
    );
  }

  return user.id;
}

export const notificationService = {
  /**
   * The caller's notifications, newest first.
   *
   * `unreadOnly` exists for the tray, which is about what has happened
   * since you last looked rather than a full archive.
   */
  async list(options?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationItem[]> {
    await requireUserId();

    const supabase = createClient();

    let query = supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(options?.limit ?? PAGE_LIMIT, 1), 200));

    if (options?.unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Notification list failed:", error.message);
      throw error;
    }

    return ((data ?? []) as unknown as NotificationRow[]).map(mapNotification);
  },

  /** The tray's slice: the most recent few, read or not. */
  async listRecent(): Promise<NotificationItem[]> {
    return this.list({ limit: TRAY_LIMIT });
  },

  /**
   * How many are unread.
   *
   * Counted in Postgres rather than by fetching the feed and measuring
   * it, so the badge does not depend on how many rows the tray happened
   * to load — a capped fetch would otherwise cap the count.
   */
  async unreadCount(): Promise<number> {
    await requireUserId();

    const supabase = createClient();

    const { data, error } = await supabase.rpc("unread_notification_count");

    if (error) {
      console.error("Unread count failed:", error.message);
      throw error;
    }

    return Number(data ?? 0);
  },

  /**
   * Marks specific notifications read, or all of them.
   *
   * Returns how many were actually marked, which distinguishes "already
   * read" from "not yours" — both leave the row untouched, and the count
   * is the honest answer either way. The database confines the update to
   * the caller's own rows, so passing somebody else's id changes nothing
   * rather than erroring.
   */
  async markRead(ids?: string[]): Promise<number> {
    await requireUserId();

    const supabase = createClient();

    /*
     * An empty array would mark nothing, but it is almost always a caller
     * bug — an empty selection reaching this method — and passing it
     * through as `[]` would be indistinguishable from success. Null means
     * "all", which is a different intent and has its own method.
     */
    if (ids && ids.length === 0) return 0;

    const { data, error } = await supabase.rpc("mark_notifications_read", {
      p_ids: ids ?? null,
    });

    if (error) {
      console.error("Marking notifications read failed:", error.message);
      throw new Error(
        error.message || "Those notifications could not be marked as read."
      );
    }

    return Number(data ?? 0);
  },

  /** Marks the caller's entire inbox read. */
  async markAllRead(): Promise<number> {
    return this.markRead(undefined);
  },
};

/*
 * Link targets live in notifications.routes.ts, free of the Supabase
 * client so the routing can be unit-tested — the property worth pinning
 * is the negative one, that a citizen is never handed an /officer route.
 * Re-exported so callers import one module.
 */
export { notificationHref, type Workspace } from "./notifications.routes";

export { isNotSignedIn };
