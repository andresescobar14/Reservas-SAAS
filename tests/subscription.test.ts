import { test } from "node:test";
import assert from "node:assert/strict";
import { hasActiveSubscription } from "../lib/subscription";

const now = Date.parse("2026-10-21T12:00:00Z");
test("Suscripción: el servidor aplica el mismo límite de la prueba que PostgreSQL", () => {
  assert.equal(
    hasActiveSubscription(
      { subscription_status: "trial", trial_ends_at: "2026-10-21T12:00:01Z" },
      now,
    ),
    true,
  );
  assert.equal(
    hasActiveSubscription(
      { subscription_status: "trial", trial_ends_at: "2026-10-21T12:00:00Z" },
      now,
    ),
    false,
  );
  assert.equal(
    hasActiveSubscription(
      { subscription_status: "trial", trial_ends_at: "2026-10-20T12:00:00Z" },
      now,
    ),
    false,
  );
  assert.equal(
    hasActiveSubscription(
      { subscription_status: "past_due", trial_ends_at: "2027-01-01T00:00:00Z" },
      now,
    ),
    false,
  );
  assert.equal(
    hasActiveSubscription(
      { subscription_status: "active", trial_ends_at: "2020-01-01T00:00:00Z" },
      now,
    ),
    true,
  );
  assert.equal(
    hasActiveSubscription({ subscription_status: "trial", trial_ends_at: "invalid" }, now),
    false,
  );
});
