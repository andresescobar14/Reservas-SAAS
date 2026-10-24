const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  PLANS,
  readConfig,
  validateCompany,
  periodFor,
  encryptToken,
  decryptToken,
  buttonPayload,
  extractEvents,
  createMockDb,
  createPostgresDb,
  createAuthenticator,
  createApp,
} = require("../server");
const OWNER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  APPT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PHONE = "525555555555",
  PHONE_ID = "123456789012345";
const key = crypto.randomBytes(32).toString("hex");
const config = {
  port: 0,
  host: "127.0.0.1",
  production: false,
  dbMode: "mock",
  databaseUrl: "postgresql://localhost/test",
  encryptionKey: key,
  appSecret: "a".repeat(32),
  verifyToken: "v".repeat(32),
  buttonSecret: "b".repeat(32),
  graphVersion: "v99.0",
  templateName: "recordatorio_cita",
  templateLanguage: "es_MX",
  origins: ["http://localhost:3000"],
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "public-test-key",
};
function company(patch = {}) {
  return {
    company_id: COMPANY,
    owner_id: OWNER,
    whatsapp_token_oficial: encryptToken("tenant-meta-token", key),
    whatsapp_phone_id: PHONE_ID,
    plan_actual: "TRIAL",
    status_pago: "ACTIVO",
    whatsapp_acceso_aprobado: true,
    template_approved: true,
    mensajes_enviados_mes: 0,
    limite_mensajes: 35,
    trial_started_at: new Date(Date.now() - 86400000).toISOString(),
    trial_ends_at: new Date(Date.now() + 6 * 86400000).toISOString(),
    subscription_ends_at: new Date(Date.now() + 28 * 86400000).toISOString(),
    timezone: "America/Mexico_City",
    ...patch,
  };
}
const body = {
  companyId: COMPANY,
  phone: PHONE,
  patientName: "Ana López",
  date: "2100-01-02",
  time: "10:00",
};
function fixture(patch = {}) {
  return createMockDb({
    companies: [company(patch)],
    appointments: [
      {
        id: APPT,
        company_id: COMPANY,
        phone: PHONE,
        date: body.date,
        time: body.time,
        status: "confirmed",
        starts_at: "2100-01-02T16:00:00Z",
      },
    ],
    consents: [{ company_id: COMPANY, phone: PHONE, opted_in_at: new Date().toISOString() }],
  });
}
async function serve(t, { db = fixture(), http, authenticate } = {}) {
  const calls = [];
  const app = createApp({
    config,
    db,
    http: http || {
      async post(url, payload, options) {
        calls.push({ url, payload, options });
        return { data: { messages: [{ id: `wamid.${crypto.randomUUID()}` }] } };
      },
    },
    authenticate:
      authenticate ||
      (async (header) => {
        if (!header)
          throw Object.assign(
            new (require("../server").HttpError)(401, "UNAUTHORIZED", "Inicia sesión"),
          );
        return header === "Bearer other-user" ? OTHER : OWNER;
      }),
    logger: { error() {} },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  async function send(data = body, idem = crypto.randomUUID(), headers = {}) {
    return fetch(`${base}/api/whatsapp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner-user",
        "Idempotency-Key": idem,
        ...headers,
      },
      body: JSON.stringify(data),
    });
  }
  async function webhook(event, signature = true) {
    const raw = JSON.stringify(event);
    return fetch(`${base}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature
          ? `sha256=${crypto.createHmac("sha256", config.appSecret).update(raw).digest("hex")}`
          : "sha256=" + "0".repeat(64),
      },
      body: raw,
    });
  }
  return { db, calls, base, send, webhook };
}
function event(
  payload,
  { phone = PHONE, phoneId = PHONE_ID, id = crypto.randomUUID(), contextId } = {},
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneId },
              messages: [
                {
                  id,
                  from: phone,
                  type: "button",
                  button: { text: "Cancelar", payload },
                  ...(contextId ? { context: { id: contextId } } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("estado de WhatsApp exige propietario y nunca expone credenciales", async (t) => {
  const f = await serve(t);
  const url = `${f.base}/api/whatsapp/status/${COMPANY}`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: "Bearer other-user" } })).status, 404);
  const response = await fetch(url, {
    headers: { Authorization: "Bearer owner-user", Origin: "http://localhost:3000" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
  const data = await response.json();
  assert.equal(data.status, "READY");
  assert.equal(data.limit, 35);
  assert.equal(data.checks.access, true);
  assert.equal(JSON.stringify(data).includes("whatsapp_token_oficial"), false);
  assert.equal(JSON.stringify(data).includes(PHONE_ID), false);
});

test("estado muestra revisión y alta pendiente sin permitir envíos", async (t) => {
  const f = await serve(t, { db: fixture({ whatsapp_acceso_aprobado: false }) });
  const headers = { Authorization: "Bearer owner-user" };
  const url = `${f.base}/api/whatsapp/status/${COMPANY}`;
  const pendingReview = await (await fetch(url, { headers })).json();
  assert.equal(pendingReview.status, "BLOCKED");
  assert.equal(pendingReview.checks.access, false);
  f.db.companies.isOwner = async ({ owner_id }) => owner_id === OWNER;
  f.db.data.companies.clear();
  const noSetup = await (await fetch(url, { headers })).json();
  assert.equal(noSetup.status, "PENDING_SETUP");
  assert.equal(noSetup.checks.account, false);
  assert.equal(noSetup.plan, null);
});

test("planes exactos, expiración y aprobación manual obligatoria", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLANS).map(([p, x]) => [p, [x.priceMXN, x.limit]])),
    { TRIAL: [0, 35], PRO: [599, 1000], PREMIUM: [999, 2500] },
  );
  assert.throws(() => validateCompany(company({ whatsapp_acceso_aprobado: false })), {
    status: 403,
    code: "TRIAL_REVIEW",
  });
  assert.throws(() => validateCompany(company({ status_pago: "SUSPENDIDO" })), {
    status: 403,
    code: "SUSPENDED",
  });
  assert.throws(
    () =>
      validateCompany(
        company({
          trial_started_at: new Date(Date.now() - 8 * 86400000).toISOString(),
          trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
        }),
      ),
    { code: "TRIAL_EXPIRED" },
  );
  assert.throws(
    () =>
      validateCompany(
        company({
          plan_actual: "PRO",
          limite_mensajes: 1000,
          subscription_ends_at: new Date(Date.now() - 1).toISOString(),
        }),
      ),
    { code: "SUBSCRIPTION_EXPIRED" },
  );
  assert.throws(() => validateCompany(company({ limite_mensajes: 9999 })), {
    code: "INVALID_QUOTA",
  });
});
test("TRIAL conserva cuota total y los planes pagados usan mes de México", () => {
  assert.equal(periodFor(company(), new Date("2026-11-01T00:00:00Z")), "TRIAL");
  assert.equal(
    periodFor(company({ plan_actual: "PRO" }), new Date("2026-11-01T00:00:00Z")),
    "2026-10",
  );
  assert.equal(
    periodFor(company({ plan_actual: "PRO" }), new Date("2026-11-01T06:00:00Z")),
    "2026-11",
  );
});
test("cifrado autenticado: clave incorrecta o token alterado falla", () => {
  const envelope = encryptToken("secret", key);
  assert.equal(decryptToken(envelope, key), "secret");
  assert.throws(() => decryptToken(envelope, "0".repeat(64)));
  assert.throws(() => decryptToken("plain-secret", key));
});
test("producción rechaza mock y variables incompletas", () => {
  assert.throws(() => readConfig({ NODE_ENV: "production", DB_MODE: "mock" }), /mock/);
  assert.throws(() => readConfig({}), /Configura/);
});
test("rechazos de negocio no llaman a Meta", async (t) => {
  for (const patch of [
    { whatsapp_acceso_aprobado: false },
    { status_pago: "SUSPENDIDO" },
    { template_approved: false },
    { plan_actual: "PRO", limite_mensajes: 1000, subscription_ends_at: null },
  ]) {
    const f = await serve(t, { db: fixture(patch) });
    const r = await f.send();
    assert.equal(r.status, 403);
    assert.equal(f.calls.length, 0);
  }
});
test("tenant ajeno, falta de consentimiento y cita ambigua se bloquean", async (t) => {
  const f = await serve(t);
  assert.equal(
    (await f.send(body, crypto.randomUUID(), { Authorization: "Bearer other-user" })).status,
    404,
  );
  f.db.data.consents = [];
  assert.equal((await f.send()).status, 403);
  f.db.data.consents = [{ company_id: COMPANY, phone: PHONE, opted_in_at: "2026-01-01" }];
  f.db.data.appointments.push({ ...f.db.data.appointments[0], id: crypto.randomUUID() });
  assert.equal((await f.send()).status, 409);
  assert.equal(f.calls.length, 0);
});
test("payload oficial, token del tenant, +1 solo tras éxito e idempotencia", async (t) => {
  const f = await serve(t),
    idem = crypto.randomUUID();
  const r = await f.send(body, idem);
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.ok(result.messageId);
  assert.equal(f.calls[0].url, `https://graph.facebook.com/v99.0/${PHONE_ID}/messages`);
  assert.equal(f.calls[0].options.headers.Authorization, "Bearer tenant-meta-token");
  const template = f.calls[0].payload.template;
  assert.equal(template.name, "recordatorio_cita");
  assert.equal(template.language.code, "es_MX");
  assert.equal(template.components[1].sub_type, "quick_reply");
  assert.equal(f.db.data.companies.get(COMPANY).mensajes_enviados_mes, 1);
  const repeated = await f.send(body, idem);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).replayed, true);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.send({ ...body, patientName: "Otro nombre" }, idem)).status, 409);
});
test("solicitudes simultáneas respetan la última unidad de cuota", async (t) => {
  const db = fixture({ usage_period: "TRIAL", mensajes_enviados_mes: 34 });
  const f = await serve(t, { db });
  const responses = await Promise.all([f.send(), f.send(), f.send()]);
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 403, 403]);
  assert.equal(f.calls.length, 1);
  assert.equal(db.data.companies.get(COMPANY).mensajes_enviados_mes, 35);
});
test("PRO y PREMIUM bloquean su cuota y empiezan un nuevo bucket cada mes", async (t) => {
  for (const [plan, limit] of [
    ["PRO", 1000],
    ["PREMIUM", 2500],
  ]) {
    const period = periodFor(company({ plan_actual: plan }));
    const f = await serve(t, {
      db: fixture({
        plan_actual: plan,
        limite_mensajes: limit,
        usage_period: period,
        mensajes_enviados_mes: limit,
      }),
    });
    const blocked = await f.send();
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).error, "MESSAGE_LIMIT");
    assert.equal(f.calls.length, 0);
    const nextMonth = await serve(t, {
      db: fixture({
        plan_actual: plan,
        limite_mensajes: limit,
        usage_period: "2000-01",
        mensajes_enviados_mes: limit,
      }),
    });
    assert.equal((await nextMonth.send()).status, 200);
    assert.equal(nextMonth.db.data.companies.get(COMPANY).mensajes_enviados_mes, 1);
  }
});
test("el mismo paciente en dos empresas nunca mezcla sus citas ni tokens", async (t) => {
  const db = fixture(),
    secondId = "987654321012345",
    secondAppointment = crypto.randomUUID();
  db.data.companies.set(
    SECOND,
    company({
      company_id: SECOND,
      whatsapp_phone_id: secondId,
      whatsapp_token_oficial: encryptToken("second-tenant-token", key),
    }),
  );
  db.data.appointments.push({
    ...db.data.appointments[0],
    company_id: SECOND,
    id: secondAppointment,
  });
  db.data.consents.push({ company_id: SECOND, phone: PHONE, opted_in_at: "2026-01-01" });
  const f = await serve(t, { db }),
    one = await (await f.send()).json(),
    two = await (await f.send({ ...body, companyId: SECOND })).json();
  assert.equal(f.calls[1].options.headers.Authorization, "Bearer second-tenant-token");
  await f.webhook(event(buttonPayload("cancel", two.requestId, config.buttonSecret)));
  await db.processNext(config.buttonSecret);
  assert.ok(db.data.appointments.every((a) => a.status === "confirmed"));
  await f.webhook(event(buttonPayload("cancel", one.requestId, config.buttonSecret)));
  await db.processNext(config.buttonSecret);
  assert.equal(db.data.appointments.find((a) => a.id === APPT).status, "cancelled");
  assert.equal(db.data.appointments.find((a) => a.id === secondAppointment).status, "confirmed");
});
test("si Meta aceptó pero falla el contador se conserva su ID para conciliar", async (t) => {
  const db = fixture(),
    finish = db.finish;
  let once = true;
  db.finish = async (...args) => {
    if (once) {
      once = false;
      throw new Error("db temporarily unavailable");
    }
    return finish(...args);
  };
  const f = await serve(t, { db });
  const r = await f.send();
  assert.equal(r.status, 503);
  const data = await r.json();
  assert.equal(data.error, "ACCOUNTING_PENDING");
  assert.ok(data.messageId);
  assert.equal(db.data.outbox.get(data.requestId).meta_message_id, data.messageId);
  assert.equal(db.data.usage.get(`${COMPANY}:TRIAL`).reserved, 1);
  await db.finish(data.requestId, "sent", data.messageId);
  await db.finish(data.requestId, "sent", data.messageId);
  assert.equal(db.data.usage.get(`${COMPANY}:TRIAL`).sent, 1);
  assert.equal(db.data.usage.get(`${COMPANY}:TRIAL`).reserved, 0);
});
test("rechazo explícito de Meta libera cuota y no suma enviados", async (t) => {
  const db = fixture(),
    f = await serve(t, {
      db,
      http: {
        async post() {
          throw { response: { status: 400, data: { secret: "NEVER_LEAK" } } };
        },
      },
    });
  const response = await f.send();
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("NEVER_LEAK"));
  assert.equal(db.data.usage.get(`${COMPANY}:TRIAL`).reserved, 0);
  assert.equal(db.data.companies.get(COMPANY).mensajes_enviados_mes, 0);
});
test("timeout de Meta mantiene reserva y no permite reenviar la misma clave", async (t) => {
  const db = fixture(),
    f = await serve(t, {
      db,
      http: {
        async post() {
          throw Object.assign(new Error("secret"), { code: "ECONNABORTED" });
        },
      },
    }),
    idem = crypto.randomUUID();
  assert.equal((await f.send(body, idem)).status, 503);
  assert.equal((await f.send(body, idem)).status, 409);
  assert.equal(db.data.usage.get(`${COMPANY}:TRIAL`).reserved, 1);
  assert.equal(db.data.companies.get(COMPANY).mensajes_enviados_mes, 0);
});
test("fallo al guardar resultado ambiguo nunca libera cuota accidentalmente", async (t) => {
  const db = fixture(),
    finish = db.finish;
  let failOnce = true;
  db.finish = async (...args) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("db temporary");
    }
    return finish(...args);
  };
  const f = await serve(t, {
    db,
    http: {
      async post() {
        throw new Error("timeout");
      },
    },
  });
  assert.equal((await f.send()).status, 503);
  assert.equal(db.data.usage.get(`${COMPANY}:TRIAL`).reserved, 1);
});
test("GET webhook devuelve challenge exacto y verifica token", async (t) => {
  const f = await serve(t);
  assert.equal(
    (await fetch(`${f.base}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`))
      .status,
    403,
  );
  const r = await fetch(
    `${f.base}/webhook?hub.mode=subscribe&hub.verify_token=${config.verifyToken}&hub.challenge=123456`,
  );
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "123456");
});
test("firma sobre bytes crudos obligatoria; persistir antes de confirmar a Meta", async (t) => {
  const f = await serve(t);
  const value = event("Cancelar");
  assert.equal((await f.webhook(value, false)).status, 403);
  assert.equal(f.db.data.inbox.size, 0);
  f.db.enqueue = async () => {
    throw new Error("offline");
  };
  assert.equal((await f.webhook(value)).status, 503);
});
test("cancelación vincula número receptor + paciente + cita; duplicados no revierten estados", async (t) => {
  const f = await serve(t),
    response = await (await f.send()).json(),
    payload = buttonPayload("cancel", response.requestId, config.buttonSecret);
  assert.equal((await f.webhook(event(payload, { phone: "525555555556" }))).status, 200);
  await f.db.processNext(config.buttonSecret);
  assert.equal(f.db.data.appointments[0].status, "confirmed");
  await f.webhook(event(payload, { phoneId: "999999999999999" }));
  await f.db.processNext(config.buttonSecret);
  assert.equal(f.db.data.appointments[0].status, "confirmed");
  const value = event(payload);
  await f.webhook(value);
  await f.webhook(value);
  while (await f.db.processNext(config.buttonSecret)) {}
  assert.equal(f.db.data.appointments[0].status, "cancelled");
  await f.webhook(event(buttonPayload("confirm", response.requestId, config.buttonSecret)));
  await f.db.processNext(config.buttonSecret);
  assert.equal(f.db.data.appointments[0].status, "cancelled");
});
test("texto de botón requiere contexto exacto, nunca solo el teléfono", async (t) => {
  const f = await serve(t),
    sent = await (await f.send()).json();
  await f.webhook(event("Cancelar"));
  await f.db.processNext(config.buttonSecret);
  assert.equal(f.db.data.appointments[0].status, "confirmed");
  await f.webhook(event("Cancelar", { contextId: sent.messageId }));
  await f.db.processNext(config.buttonSecret);
  assert.equal(f.db.data.appointments[0].status, "cancelled");
});
test("procesa todos los mensajes de un batch e ignora estructuras desconocidas", () => {
  const e = event("x");
  const v = e.entry[0].changes[0].value;
  v.messages.push({ ...v.messages[0], id: "second" });
  assert.equal(extractEvents(e).length, 2);
  assert.deepEqual(extractEvents({ object: "whatsapp_business_account", entry: 42 }), []);
  assert.deepEqual(
    extractEvents({ object: "whatsapp_business_account", entry: [{ changes: 42 }] }),
    [],
  );
});
test("HTTP valida fecha real, hora, idempotencia, JSON y CORS", async (t) => {
  const f = await serve(t);
  for (const bad of [
    { date: "2026-02-30" },
    { time: "25:00" },
    { phone: "foo" },
    { companyId: "not-uuid" },
    { patientName: "\nAna" },
  ])
    assert.equal((await f.send({ ...body, ...bad })).status, 400);
  assert.equal((await f.send(body, "short")).status, 400);
  assert.equal(
    (await f.send(body, crypto.randomUUID(), { Origin: "https://attacker.example" })).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${f.base}/api/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
    400,
  );
});
test("auth real diferencia sesión vencida de fallo de red", async () => {
  assert.equal(
    await createAuthenticator(config, {
      async get() {
        return { data: { id: OWNER } };
      },
    })("Bearer test-session-token"),
    OWNER,
  );
  await assert.rejects(
    () =>
      createAuthenticator(config, {
        async get() {
          throw { response: { status: 401 } };
        },
      })("Bearer test-session-token"),
    { status: 401 },
  );
  await assert.rejects(
    () =>
      createAuthenticator(config, {
        async get() {
          throw new Error("network");
        },
      })("Bearer test-session-token"),
    { status: 503 },
  );
});

test("PostgreSQL real: migración, reserva, contador y webhook transaccional", async (t) => {
  const { PGlite } = require("@electric-sql/pglite");
  const sql = new PGlite();
  await sql.waitReady;
  t.after(() => sql.close());
  await sql.exec(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public.companies(id uuid primary key,owner_id uuid); CREATE TABLE public.customers(id uuid primary key,company_id uuid,full_name text,phone text,unique(company_id,id)); CREATE TABLE public.reservations(id uuid primary key,company_id uuid,customer_id uuid,starts_at timestamptz,status text);`,
  );
  const migration = fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8");
  await sql.exec(migration);
  await sql.exec(migration);
  const query = async (text, params = []) => {
    const r = await sql.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
  const pool = {
    query,
    on() {},
    async connect() {
      return { query, release() {} };
    },
    async end() {},
  };
  const db = createPostgresDb(config, pool),
    c = company();
  await query("INSERT INTO public.companies VALUES($1,$2)", [COMPANY, OWNER]);
  await query("INSERT INTO public.customers VALUES($1,$2,$3,$4)", [
    OTHER,
    COMPANY,
    "Ana López",
    "+" + PHONE,
  ]);
  await query("INSERT INTO public.reservations VALUES($1,$2,$3,$4,'confirmed')", [
    APPT,
    COMPANY,
    OTHER,
    "2100-01-02T16:00:00Z",
  ]);
  await query(
    "INSERT INTO whatsapp_cloud.companies(company_id,whatsapp_token_oficial,whatsapp_phone_id,whatsapp_acceso_aprobado,template_approved) VALUES($1,$2,$3,true,true)",
    [COMPANY, c.whatsapp_token_oficial, PHONE_ID],
  );
  await query(
    "INSERT INTO whatsapp_cloud.consents(company_id,phone,opted_in_at) VALUES($1,$2,now())",
    [COMPANY, PHONE],
  );
  // Ejecutar todo el flujo con el rol limitado de Railway, sin BYPASSRLS.
  await sql.exec("CREATE ROLE reserva_whatsapp NOLOGIN NOSUPERUSER NOBYPASSRLS;");
  const permissions = fs.readFileSync(path.join(__dirname, "../runtime-role.sql"), "utf8");
  await sql.exec(
    permissions.replace("grant connect on database postgres to reserva_whatsapp;", ""),
  );
  await sql.exec(
    permissions.replace("grant connect on database postgres to reserva_whatsapp;", ""),
  );
  await sql.exec(
    "ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY; ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY; ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY; SET ROLE reserva_whatsapp;",
  );
  await assert.rejects(
    () => query("UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=true"),
    /permission denied/,
  );
  await assert.rejects(
    () => query("UPDATE whatsapp_cloud.companies SET plan_actual='PREMIUM'"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      query("INSERT INTO whatsapp_cloud.consents(company_id,phone) VALUES($1,$2)", [
        COMPANY,
        "525555555556",
      ]),
    /permission denied/,
  );
  await assert.rejects(() => query("DELETE FROM public.customers"), /permission denied/);
  const input = { ...body, idempotencyKey: crypto.randomUUID() };
  const reserved = await db.reserve(input, OWNER);
  await db.finish(reserved.id, "sent", "wamid.pg-integration");
  const stats = await query(
    "SELECT sent,reserved FROM whatsapp_cloud.usage WHERE company_id=$1 AND period='TRIAL'",
    [COMPANY],
  );
  assert.deepEqual(stats.rows[0], { sent: 1, reserved: 0 });
  assert.equal((await db.reserve(input, OWNER)).replayed, true);
  await db.enqueue(extractEvents(event(buttonPayload("cancel", reserved.id, config.buttonSecret))));
  await db.processNext(config.buttonSecret);
  assert.equal(
    (await query("SELECT status FROM public.reservations WHERE id=$1", [APPT])).rows[0].status,
    "cancelled",
  );
  await assert.rejects(() => db.reserve({ ...input, idempotencyKey: crypto.randomUUID() }, OTHER), {
    status: 404,
  });
  await sql.exec("RESET ROLE");
  await query(
    "UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=false WHERE company_id=$1",
    [COMPANY],
  );
  await assert.rejects(() => db.reserve({ ...input, idempotencyKey: crypto.randomUUID() }, OWNER), {
    code: "TRIAL_REVIEW",
  });
  assert.equal(
    (
      await query(
        "SELECT has_schema_privilege('authenticated','whatsapp_cloud','USAGE') AS allowed",
      )
    ).rows[0].allowed,
    false,
  );
});
