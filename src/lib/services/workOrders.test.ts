import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { allowedTransitions } from "./workOrders.transitions.ts";

import type { WorkOrderStatus } from "../../types/workOrder.ts";

/**
 * ============================================================
 * THE STATE MACHINE MIRROR
 * ============================================================
 *
 * allowedTransitions() is a mirror of work_order_transition_allowed() in
 * supabase/migrations/20260816120000_work_order_lifecycle.sql. The
 * database is the authority — it refuses anything it does not recognise
 * regardless of what this function says — so these tests are not
 * checking authorization. They are checking that the two agree, because
 * a mirror that has drifted is worse than no mirror: it offers an
 * officer a button whose only outcome is a refusal.
 *
 * The corresponding SQL is asserted directly against Postgres in
 * supabase/tests/04_officer_lifecycle_test.sql. If one of these fails,
 * check which side is wrong before changing either.
 */

const ALL_STATUSES: WorkOrderStatus[] = [
  "assigned",
  "accepted",
  "in_progress",
  "proof_submitted",
  "supervisor_review",
  "citizen_confirmation",
  "resolved",
  "reopened",
];

describe("the officer's path", () => {
  test("assigned leads only to accepted", () => {
    assert.deepEqual(allowedTransitions("assigned", false), ["accepted"]);
  });

  test("accepted leads only to in_progress", () => {
    assert.deepEqual(allowedTransitions("accepted", false), ["in_progress"]);
  });

  test("in_progress leads only to proof_submitted", () => {
    assert.deepEqual(allowedTransitions("in_progress", false), [
      "proof_submitted",
    ]);
  });

  test("a reopened job goes back to in_progress, not back to accepted", () => {
    // Rework does not need re-acknowledging: the officer already has it.
    assert.deepEqual(allowedTransitions("reopened", false), ["in_progress"]);
  });

  test("an officer cannot resolve anything, from any state", () => {
    /*
     * The single most important property here. An officer declaring
     * their own work resolved is what the verification stage exists to
     * prevent, and the old code allowed it from every state including
     * `assigned` — a job could be closed without anyone visiting it.
     */
    for (const from of ALL_STATUSES) {
      assert.ok(
        !allowedTransitions(from, false).includes("resolved"),
        `an officer must not be able to resolve from ${from}`
      );
    }
  });

  test("an officer's terminal state is proof_submitted", () => {
    for (const from of [
      "proof_submitted",
      "supervisor_review",
      "citizen_confirmation",
      "resolved",
    ] as WorkOrderStatus[]) {
      assert.deepEqual(
        allowedTransitions(from, false),
        [],
        `an officer has nothing to do from ${from}`
      );
    }
  });
});

describe("oversight's path", () => {
  test("sign-off runs review, then confirmation, then resolved", () => {
    assert.ok(
      allowedTransitions("proof_submitted", true).includes("supervisor_review")
    );
    assert.ok(
      allowedTransitions("supervisor_review", true).includes(
        "citizen_confirmation"
      )
    );
    assert.ok(
      allowedTransitions("citizen_confirmation", true).includes("resolved")
    );
  });

  test("every sign-off stage can send the job back for rework", () => {
    for (const from of [
      "proof_submitted",
      "supervisor_review",
      "citizen_confirmation",
    ] as WorkOrderStatus[]) {
      assert.ok(
        allowedTransitions(from, true).includes("reopened"),
        `oversight must be able to reject from ${from}`
      );
    }
  });

  test("resolved can only be reopened", () => {
    // Not walked backwards to in_progress or quietly reassigned: a
    // closed job that reopens must record that the repair was rejected.
    assert.deepEqual(allowedTransitions("resolved", true), ["reopened"]);
  });

  test("oversight keeps the officer's transitions too", () => {
    // A supervisor holds an officer workspace and can be an assignee.
    assert.ok(allowedTransitions("assigned", true).includes("accepted"));
    assert.ok(allowedTransitions("in_progress", true).includes("proof_submitted"));
  });
});

describe("nothing offers a transition to itself", () => {
  test("a status is never its own next step", () => {
    for (const from of ALL_STATUSES) {
      for (const oversight of [false, true]) {
        assert.ok(
          !allowedTransitions(from, oversight).includes(from),
          `${from} must not offer itself (oversight=${oversight})`
        );
      }
    }
  });
});

describe("the machine is closed", () => {
  test("every status has a defined answer, never undefined", () => {
    for (const from of ALL_STATUSES) {
      for (const oversight of [false, true]) {
        const next = allowedTransitions(from, oversight);

        assert.ok(
          Array.isArray(next),
          `${from} must return an array (oversight=${oversight})`
        );
      }
    }
  });

  test("every offered transition is a real work_order_status", () => {
    // A typo here would render a button that produces an enum error.
    for (const from of ALL_STATUSES) {
      for (const oversight of [false, true]) {
        for (const to of allowedTransitions(from, oversight)) {
          assert.ok(
            ALL_STATUSES.includes(to),
            `${from} -> ${to} is not a work_order_status`
          );
        }
      }
    }
  });

  test("an officer is never offered more than oversight is", () => {
    for (const from of ALL_STATUSES) {
      const officer = allowedTransitions(from, false);
      const oversight = allowedTransitions(from, true);

      for (const to of officer) {
        assert.ok(
          oversight.includes(to),
          `oversight must also be able to do ${from} -> ${to}`
        );
      }
    }
  });
});
