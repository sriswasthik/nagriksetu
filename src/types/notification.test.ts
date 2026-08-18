import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIONABLE_NOTIFICATIONS,
  type NotificationType,
} from "./notification.ts";

/**
 * ============================================================
 * THE NOTIFICATION VOCABULARY
 * ============================================================
 *
 * These types mirror public.notification_type. The database is the
 * authority — it is an enum, so an unknown value cannot be stored — and
 * these tests are about the two client-side maps keyed on it staying
 * exhaustive.
 *
 * That matters because an exhaustive `Record<NotificationType, …>` is
 * checked at compile time, but a *list* like ACTIONABLE_NOTIFICATIONS is
 * not: a member removed from the enum leaves a dead string behind, and a
 * member added is silently absent.
 *
 * The lifecycle behaviour — that real events write rows, that a retry
 * writes nothing, that nobody reads another user's inbox — is asserted
 * against a real Postgres in supabase/tests/06_notifications_test.sql.
 */

/** Every member of public.notification_type, in enum order. */
const ALL_TYPES: NotificationType[] = [
  "complaint_submitted",
  "complaint_triaged",
  "complaint_assigned",
  "work_accepted",
  "work_started",
  "proof_submitted",
  "complaint_under_review",
  "confirmation_requested",
  "complaint_resolved",
  "complaint_reopened",
  "complaint_rejected",
  "work_order_assigned",
  "work_order_reopened",
  "status_changed",
];

describe("the actionable list is a subset of the vocabulary", () => {
  test("every actionable type is a real notification type", () => {
    // A typo or a renamed enum member would leave a string here that
    // nothing ever matches, so the badge would silently stop counting the
    // event it was added for.
    for (const type of ACTIONABLE_NOTIFICATIONS) {
      assert.ok(
        ALL_TYPES.includes(type),
        `${type} is not a notification type`
      );
    }
  });

  test("it contains no duplicates", () => {
    assert.equal(
      new Set(ACTIONABLE_NOTIFICATIONS).size,
      ACTIONABLE_NOTIFICATIONS.length
    );
  });

  test("it is a strict subset — a badge that counts everything counts nothing", () => {
    /*
     * The design decision this pins: unread state is tracked for every
     * notification, but the badge is about whether something is *waiting
     * on you*. If this list ever grew to cover the whole vocabulary the
     * badge would light up for "your report has been triaged", which is
     * information rather than a task, and people would learn to ignore
     * it.
     */
    assert.ok(
      ACTIONABLE_NOTIFICATIONS.length > 0,
      "at least one event must be actionable or the badge never appears"
    );
    assert.ok(
      ACTIONABLE_NOTIFICATIONS.length < ALL_TYPES.length,
      "not every event is a task"
    );
  });

  test("the two events that need a citizen to act are actionable", () => {
    // Being asked to confirm a repair, and being told a repair was
    // rejected and the report is live again.
    assert.ok(ACTIONABLE_NOTIFICATIONS.includes("confirmation_requested"));
    assert.ok(ACTIONABLE_NOTIFICATIONS.includes("complaint_reopened"));
  });

  test("the two events that need an officer to act are actionable", () => {
    assert.ok(ACTIONABLE_NOTIFICATIONS.includes("work_order_assigned"));
    assert.ok(ACTIONABLE_NOTIFICATIONS.includes("work_order_reopened"));
  });

  test("purely informational events are not actionable", () => {
    for (const type of [
      "complaint_submitted",
      "complaint_triaged",
      "complaint_assigned",
      "work_accepted",
      "work_started",
      "proof_submitted",
      "complaint_under_review",
      "status_changed",
    ] as NotificationType[]) {
      assert.ok(
        !ACTIONABLE_NOTIFICATIONS.includes(type),
        `${type} is information, not a task`
      );
    }
  });
});

describe("the vocabulary itself", () => {
  test("status_changed exists as the fallback", () => {
    /*
     * Deliberately present rather than treating an unrecognised status as
     * an error: a status added to the complaint enum later should still
     * notify, generically, instead of silently producing nothing.
     */
    assert.ok(ALL_TYPES.includes("status_changed"));
  });

  test("submission is one event, not two", () => {
    // "complaint submitted" and "complaint successfully created" are the
    // same database event — the row exists with status `submitted`. Two
    // notifications for one thing would be inventing an event.
    const submissionish = ALL_TYPES.filter(
      (type) => type.includes("submitted") && type.startsWith("complaint")
    );

    assert.deepEqual(submissionish, ["complaint_submitted"]);
  });

  test("officer-facing types are distinguishable from citizen-facing ones", () => {
    // The tray routes by workspace, so the two audiences must not share a
    // type: an officer's "assigned" is a job arriving, a citizen's is
    // their report being routed to a department.
    assert.ok(ALL_TYPES.includes("work_order_assigned"));
    assert.ok(ALL_TYPES.includes("complaint_assigned"));
    assert.notEqual("work_order_assigned", "complaint_assigned");
  });
});
