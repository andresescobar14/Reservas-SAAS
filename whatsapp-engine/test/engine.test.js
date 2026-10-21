const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { once } = require("node:events");
const { setImmediate: tick, setTimeout: delay } = require("node:timers/promises");
const { createApp } = require("../server");
const { createSessionManager } = require("../session-manager");
const { ApiError, createTenantAuthorizer } = require("../auth");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

class FakeClient extends EventEmitter {
  initialized = 0;
  destroyed = 0;
  sent = [];
  registered = true;
  async initialize() {
    this.initialized++;
  }
  async destroy() {
    this.destroyed++;
  }
  async getNumberId(number) {
    return this.registered ? { _serialized: `${number}@c.us` } : null;
  }
  async sendMessage(to, message) {
    this.sent.push({ to, message });
    return { id: { _serialized: `fake-${this.sent.length}` } };
  }
}

function fixture(options = {}) {
  const sessions = new Map();
  const clients = new Map();
  const manager = createSessionManager({
    sessions,
    createClient(id) {
      const client = new FakeClient();
      clients.set(id, client);
      return client;
    },
    encodeQr: async (text) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
    ...options,
  });
  return { sessions, clients, manager };
}

async function serverFixture(t, options = {}) {
  const state = fixture();
  const app = createApp({
    config: { origins: ["http://localhost:3000"] },
    manager: state.manager,
    qrWaitMs: 1,
    authorize: async (token, companyId) => {
      if (token !== "tenant-a" && token !== "tenant-b")
        throw new ApiError(401, "UNAUTHORIZED", "Sesión inválida.");
      if (companyId !== (token === "tenant-a" ? A : B))
        throw new ApiError(403, "FORBIDDEN", "Otra empresa.");
    },
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await state.manager.stop();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    ...state,
    request: (route, init = {}) =>
      fetch(url + route, {
        ...init,
        headers: { Authorization: "Bearer tenant-a", ...init.headers },
      }),
  };
}

test("sesiones simultáneas aisladas y un único initialize por empresa", async (t) => {
  const { manager, clients } = fixture();
  t.after(() => manager.stop());
  manager.ensure(A);
  manager.ensure(A);
  manager.ensure(B);
  await tick();
  assert.equal(clients.size, 2);
  assert.equal(clients.get(A).initialized, 1);
  clients.get(A).emit("qr", "qr-a");
  clients.get(B).emit("qr", "qr-b");
  await tick();
  assert.notEqual(manager.snapshot(A).qr, manager.snapshot(B).qr);
  clients.get(A).emit("ready");
  assert.equal(manager.snapshot(A).status, "CONNECTED");
  assert.equal(manager.snapshot(A).qr, null);
  assert.equal(manager.snapshot(B).status, "QR_READY");
  await manager.send(A, "525555555555", "Hola desde A");
  assert.equal(clients.get(A).sent.length, 1);
  assert.equal(clients.get(B).sent.length, 0);
  await assert.rejects(manager.send(B, "525555555555", "No enviar"), {
    code: "WHATSAPP_DISCONNECTED",
  });
});

test("QR se espera de forma asíncrona y gira sin crear otra sesión", async (t) => {
  const { manager, clients } = fixture();
  t.after(() => manager.stop());
  const pending = manager.waitForQr(A, { timeoutMs: 500 });
  clients.get(A).emit("qr", "primero");
  assert.equal((await pending).status, "QR_READY");
  const first = manager.snapshot(A).qr;
  clients.get(A).emit("qr", "segundo");
  await tick();
  assert.notEqual(manager.snapshot(A).qr, first);
  assert.equal(clients.get(A).initialized, 1);
});

test("QR con PNG real generado por qrcode", async (t) => {
  const QRCode = require("qrcode");
  const { manager, clients } = fixture({ encodeQr: (value) => QRCode.toDataURL(value) });
  t.after(() => manager.stop());
  manager.ensure(A);
  const pending = manager.waitForQr(A, { timeoutMs: 2000 });
  clients.get(A).emit("qr", "qr-ficticio-para-prueba");
  const state = await pending;
  assert.match(state.qr, /^data:image\/png;base64,/);
  const png = Buffer.from(state.qr.split(",")[1], "base64");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
});

test("un QR antiguo no reaparece después de conectar o desconectar", async (t) => {
  let encode;
  const { manager, clients } = fixture({
    encodeQr: () =>
      new Promise((resolve) => {
        encode = resolve;
      }),
  });
  t.after(() => manager.stop());
  manager.ensure(A);
  clients.get(A).emit("qr", "pendiente");
  clients.get(A).emit("ready");
  encode("data:image/png;base64,QQ==");
  await tick();
  assert.equal(manager.snapshot(A).qr, null);
  clients.get(A).emit("disconnected");
  await tick();
  clients.get(A).emit("ready");
  assert.equal(manager.snapshot(A).status, "DISCONNECTED");
});

test("fallo de inicialización libera recursos y permite reintentar", async (t) => {
  let fail = true;
  const { manager } = fixture({
    createClient() {
      const client = new FakeClient();
      client.initialize = async () => {
        if (fail) throw new Error("fallo");
        client.emit("ready");
      };
      return client;
    },
  });
  t.after(() => manager.stop());
  manager.ensure(A);
  await tick();
  await tick();
  assert.equal(manager.snapshot(A).error, "INITIALIZATION_FAILED");
  fail = false;
  manager.ensure(A);
  await tick();
  assert.equal(manager.snapshot(A).status, "CONNECTED");
});

test("timeout cierra Chromium aunque initialize siga pendiente", async () => {
  let finish;
  const client = new FakeClient();
  client.initialize = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const { manager } = fixture({ createClient: () => client, startupTimeoutMs: 10 });
  manager.ensure(A);
  await delay(30);
  assert.equal(manager.snapshot(A).error, "INITIALIZATION_TIMEOUT");
  assert.ok(client.destroyed > 0);
  finish();
  await tick();
  await manager.stop();
});

test("cancelar espera QR retira listeners; límite de sesiones impide otro Chromium", async (t) => {
  const { manager, sessions } = fixture({ maxSessions: 1 });
  t.after(() => manager.stop());
  const controller = new AbortController();
  const pending = manager.waitForQr(A, { signal: controller.signal });
  controller.abort();
  await pending;
  assert.equal(sessions.get(A).waiters.size, 0);
  assert.throws(() => manager.ensure(B), { code: "SESSION_LIMIT" });
});

test("health y preflight CORS desde Next.js", async (t) => {
  const { request } = await serverFixture(t);
  const health = await request("/health");
  assert.equal(health.status, 200);
  const cors = await request(`/api/whatsapp/qr/${A}`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.match(cors.headers.get("access-control-allow-headers"), /Authorization/);
});

test("sin token no se puede leer QR, consultar estado ni enviar", async (t) => {
  const { request, clients } = await serverFixture(t);
  for (const route of [`/api/whatsapp/qr/${A}`, `/api/whatsapp/status/${A}`]) {
    assert.equal((await request(route, { headers: { Authorization: "" } })).status, 401);
  }
  const response = await request("/api/whatsapp/send", {
    method: "POST",
    headers: { Authorization: "", "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: A }),
  });
  assert.equal(response.status, 401);
  assert.equal(clients.size, 0);
});

test("otra empresa y orígenes ajenos no acceden a las sesiones", async (t) => {
  const { request, clients } = await serverFixture(t);
  assert.equal((await request(`/api/whatsapp/qr/${B}`)).status, 403);
  assert.equal(
    (await request(`/api/whatsapp/status/${A}`, { headers: { Origin: "https://ajeno.example" } }))
      .status,
    403,
  );
  assert.equal(clients.size, 0);
});

test("contrato HTTP: pending 202 → QR_READY → CONNECTED y envío por empresa", async (t) => {
  const { request, clients } = await serverFixture(t);
  assert.equal((await request(`/api/whatsapp/qr/${A}`)).status, 202);
  clients.get(A).emit("qr", "qr-a");
  await tick();
  const qr = await request(`/api/whatsapp/qr/${A}`);
  assert.equal(qr.status, 200);
  assert.match((await qr.json()).qr, /^data:image\/png;base64,/);
  assert.equal(qr.headers.get("cache-control"), "no-store");
  clients.get(A).emit("ready");
  assert.equal((await (await request(`/api/whatsapp/status/${A}`)).json()).status, "CONNECTED");
  const sent = await request("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: A, phone: "+52 (55) 5555-5555", message: " Hola " }),
  });
  assert.equal(sent.status, 200);
  assert.deepEqual(clients.get(A).sent, [{ to: "525555555555@c.us", message: "Hola" }]);
});

test("rechaza JSON malformado, teléfonos inválidos y mensajes vacíos", async (t) => {
  const { request } = await serverFixture(t);
  const jsonHeaders = { "Content-Type": "application/json" };
  assert.equal(
    (await request("/api/whatsapp/send", { method: "POST", headers: jsonHeaders, body: "{" }))
      .status,
    400,
  );
  for (const body of [
    { companyId: A, phone: "123@g.us", message: "Hola" },
    { companyId: A, phone: "+525555555555", message: " " },
    { companyId: "../../otro", phone: "+525555555555", message: "Hola" },
  ])
    assert.equal(
      (
        await request("/api/whatsapp/send", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(body),
        })
      ).status,
      400,
    );
});

test("número no registrado y control de frecuencia de envío", async (t) => {
  const { request, clients, manager } = await serverFixture(t);
  manager.ensure(A);
  clients.get(A).emit("ready");
  clients.get(A).registered = false;
  const send = () =>
    request("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: A, phone: "+525555555555", message: "Hola" }),
    });
  assert.equal((await send()).status, 422);
  clients.get(A).registered = true;
  for (let i = 0; i < 9; i++) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429);
  assert.equal(clients.get(A).sent.length, 9);
});

function fakeSupabase({ user = { id: "owner-a" }, company, error = null }) {
  let filters = [];
  return {
    client: {
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: () => ({
        select() {
          return this;
        },
        eq(key, value) {
          filters.push([key, value]);
          return this;
        },
        maybeSingle: async () => ({ data: company, error }),
      }),
    },
    filters,
  };
}

test("autorización real valida identidad, propietario y vigencia de suscripción", async () => {
  const config = { supabaseUrl: "https://example.supabase.co", supabaseKey: "public" };
  const fake = fakeSupabase({
    company: { id: A, owner_id: "owner-a", subscription_status: "active" },
  });
  let options;
  const authorize = createTenantAuthorizer(config, (_url, _key, value) => {
    options = value;
    return fake.client;
  });
  assert.deepEqual(await authorize("jwt", A), { userId: "owner-a", companyId: A });
  assert.deepEqual(fake.filters, [
    ["id", A],
    ["owner_id", "owner-a"],
  ]);
  assert.equal(options.global.headers.Authorization, "Bearer jwt");
  assert.equal(options.auth.persistSession, false);
  for (const input of [
    { user: null, company: null, code: "UNAUTHORIZED" },
    { company: null, code: "FORBIDDEN" },
    {
      company: { id: A, subscription_status: "trial", trial_ends_at: "2000-01-01" },
      code: "SUBSCRIPTION_REQUIRED",
    },
    { company: { id: A, subscription_status: "past_due" }, code: "SUBSCRIPTION_REQUIRED" },
  ]) {
    const fixture = fakeSupabase(input);
    await assert.rejects(createTenantAuthorizer(config, () => fixture.client)("jwt", A), {
      code: input.code,
    });
  }
});
