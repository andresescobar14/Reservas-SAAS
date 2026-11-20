const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextReminderTime } = require("../quiet-hours");
const { runAutomationJob } = require("../native-automation");
test("recordatorios 08:00–20:00: límites, Caracas y cambio horario de Nueva York", () => {
  const next = (date, zone) => new Date(nextReminderTime(Date.parse(date), zone)).toISOString();
  assert.equal(next("2026-11-18T11:59:00Z", "America/Caracas"), "2026-11-18T12:00:00.000Z");
  assert.equal(next("2026-11-18T12:00:00Z", "America/Caracas"), "2026-11-18T12:00:00.000Z");
  assert.equal(next("2026-11-18T23:59:00Z", "America/Caracas"), "2026-11-18T23:59:00.000Z");
  assert.equal(next("2026-11-19T00:00:00Z", "America/Caracas"), "2026-11-19T12:00:00.000Z");
  assert.equal(next("2026-03-08T06:30:00Z", "America/New_York"), "2026-03-08T12:00:00.000Z");
  assert.equal(next("2026-11-01T05:30:00Z", "America/New_York"), "2026-11-01T13:00:00.000Z");
});
test("worker aplaza recordatorios nocturnos, omite los que llegarían tarde y no aplaza confirmaciones", async () => {
  const now = Date.parse("2026-11-18T06:00:00Z"),
    calls = [],
    finishes = [];
  let starts = new Date(now + 2 * 86400000).toISOString();
  const db = {
    native: {
      context: async () => ({
        enabled: true,
        status: "confirmed",
        starts_at: starts,
        whatsapp_authorized: true,
        timezone: "America/Caracas",
        phone: "584121111111",
        full_name: "Ana",
        owner_id: "owner",
      }),
      finish: async (...args) => finishes.push(args),
    },
  };
  const run = (kind) =>
    runAutomationJob(
      {
        db,
        config: {},
        clock: () => now,
        validateSend: () => ({}),
        deliver: async () => {
          calls.push(1);
          return { status: 200, body: { requestId: "test" } };
        },
      },
      { kind, starts_at: starts },
    );
  await run("reminder");
  assert.equal(finishes.at(-1)[2], "QUIET_HOURS");
  assert.equal(calls.length, 0);
  starts = new Date(now + 3600000).toISOString();
  await run("reminder");
  assert.equal(finishes.at(-1)[2], "QUIET_HOURS_TOO_LATE");
  assert.equal(calls.length, 0);
  await run("confirmation");
  assert.equal(calls.length, 1);
  assert.equal(finishes.at(-1)[2], "META_ACCEPTED");
});
