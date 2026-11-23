"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const CRON = "c".repeat(40);
Object.assign(process.env, {
  NODE_ENV: "test",
  DB_MODE: "mock",
  META_APP_SECRET: "a".repeat(32),
  WEBHOOK_VERIFY_TOKEN: "v".repeat(32),
  BUTTON_SIGNING_SECRET: "b".repeat(32),
  META_TOKEN_ENCRYPTION_KEY: "0".repeat(64),
  META_GRAPH_VERSION: "v21.0",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  CRON_SECRET: CRON,
});
const handler = require("../api/index.js");

function call({ method = "GET", url = "/", headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = new EventEmitter();
    const out = { status: 200, headers: {}, body: "" };
    Object.defineProperty(res, "statusCode", {
      set: (v) => (out.status = v),
      get: () => out.status,
    });
    Object.assign(res, {
      setHeader: (k, v) => (out.headers[k.toLowerCase()] = v),
      end: (body = "") => {
        out.body = String(body);
        resolve(out);
      },
    });
    handler({ method, url, headers }, res);
  });
}

test("la tarea programada exige el secreto correcto", async () => {
  assert.equal((await call({ method: "POST", url: "/internal/tick" })).status, 401);
  const wrong = await call({
    method: "POST",
    url: "/internal/tick",
    headers: { authorization: `Bearer ${"x".repeat(40)}` },
  });
  assert.equal(wrong.status, 401);
  const get = await call({
    method: "GET",
    url: "/internal/tick",
    headers: { authorization: `Bearer ${CRON}` },
  });
  assert.equal(get.status, 401);
});

test("con el secreto correcto procesa las colas y responde", async () => {
  const ok = await call({
    method: "POST",
    url: "/internal/tick?x=1",
    headers: { authorization: `Bearer ${CRON}` },
  });
  assert.equal(ok.status, 200);
  const body = JSON.parse(ok.body);
  assert.equal(body.ok, true);
  assert.equal(typeof body.events, "number");
});
