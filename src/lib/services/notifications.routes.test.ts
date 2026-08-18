import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { notificationHref } from "./notifications.routes.ts";

/**
 * ============================================================
 * WHERE A NOTIFICATION LEADS
 * ============================================================
 *
 * The property worth pinning is negative: a citizen must never be handed
 * an /officer route.
 *
 * A work-order event has two audiences — the officer acts on it, the
 * reporting citizen reads about it — so the same notification row is
 * rendered in both trays and must resolve to different places. Getting
 * that backwards would send a citizen to a URL the workspace guard
 * redirects and row-level security would refuse anyway; both would stop
 * them, but a link that leads nowhere a reader can go is broken whether
 * or not it is also a boundary.
 */

const COMPLAINT_ONLY = {
  complaintId: "11111111-1111-1111-1111-111111111111",
  workOrderId: null,
};

const WITH_WORK_ORDER = {
  complaintId: "11111111-1111-1111-1111-111111111111",
  workOrderId: "22222222-2222-2222-2222-222222222222",
};

const ORPHANED = { complaintId: null, workOrderId: null };

describe("a citizen is never sent to an officer route", () => {
  test("a complaint notification goes to their report", () => {
    assert.equal(
      notificationHref(COMPLAINT_ONLY, "citizen"),
      "/citizen/complaints/11111111-1111-1111-1111-111111111111"
    );
  });

  test("a work-order notification still goes to their report", () => {
    /*
     * The important one. The row carries a workOrderId, and the officer
     * tray uses it — but /officer/* is staff-only, so offering it to the
     * citizen would be offering a redirect. Their report is where the
     * timeline, the evidence and the confirmation action are anyway.
     */
    assert.equal(
      notificationHref(WITH_WORK_ORDER, "citizen"),
      "/citizen/complaints/11111111-1111-1111-1111-111111111111"
    );
  });

  test("no citizen destination ever contains /officer", () => {
    for (const item of [COMPLAINT_ONLY, WITH_WORK_ORDER, ORPHANED]) {
      const href = notificationHref(item, "citizen");

      if (href !== null) {
        assert.ok(
          !href.includes("/officer"),
          `a citizen was offered ${href}`
        );
      }
    }
  });
});

describe("an officer is sent to the work order", () => {
  test("a work-order notification goes to the work order", () => {
    assert.equal(
      notificationHref(WITH_WORK_ORDER, "officer"),
      "/officer/work-orders/22222222-2222-2222-2222-222222222222"
    );
  });

  test("a complaint-only notification has nowhere staff-side to go", () => {
    /*
     * There is no officer-side complaint route, and sending staff to the
     * citizen's would fail the workspace guard. Null rather than a guess:
     * the tray renders those as a button that marks the row read, so the
     * notification is still readable without offering a broken link.
     */
    assert.equal(notificationHref(COMPLAINT_ONLY, "officer"), null);
  });

  test("no officer destination ever contains /citizen", () => {
    for (const item of [COMPLAINT_ONLY, WITH_WORK_ORDER, ORPHANED]) {
      const href = notificationHref(item, "officer");

      if (href !== null) {
        assert.ok(
          !href.includes("/citizen"),
          `staff were offered ${href}`
        );
      }
    }
  });
});

describe("a notification with nothing to point at", () => {
  test("resolves to null rather than a malformed path", () => {
    // Rows predating the triggers carry no complaint id. They are still a
    // record of what somebody was told, so they render — as an entry that
    // can be marked read, not as a link to /citizen/complaints/null.
    assert.equal(notificationHref(ORPHANED, "citizen"), null);
    assert.equal(notificationHref(ORPHANED, "officer"), null);
  });

  test("no destination ever interpolates a null id", () => {
    for (const workspace of ["citizen", "officer"] as const) {
      const href = notificationHref(ORPHANED, workspace);

      assert.ok(
        href === null || !href.includes("null"),
        `${workspace} got ${href}`
      );
    }
  });
});

describe("the two workspaces disagree, which is the point", () => {
  test("one row yields two destinations", () => {
    assert.notEqual(
      notificationHref(WITH_WORK_ORDER, "citizen"),
      notificationHref(WITH_WORK_ORDER, "officer")
    );
  });
});
