const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  createPostgresDb,
  createApp,
  encryptToken,
  validateSend,
  deliverReminder,
  HttpError,
  buttonPayload,
  extractEvents,
} = require("../server");
const { runAutomationJob, verifyCalSignature } = require("../native-automation");
const OWNER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE = "525555555555",
  PHONE_ID = "123456789012345";
const config = {
  dbMode: "postgres",
  databaseUrl: "postgresql://localhost/test",
  encryptionKey: crypto.randomBytes(32).toString("hex"),
  appSecret: "s".repeat(32),
  verifyToken: "v".repeat(32),
  buttonSecret: "b".repeat(32),
  graphVersion: "v26.0",
  origins: ["http://localhost:3000"],
  templateName: "recordatorio_cita",
  confirmationTemplateName: "reserva_confirmacion",
  templateLanguage: "es_MX",
};
async function fixture(t) {
  const { PGlite } = require("@electric-sql/pglite");
  const sql = new PGlite();
  await sql.waitReady;
  t.after(() => sql.close());
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE reserva_whatsapp NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    CREATE FUNCTION auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  await sql.exec(fs.readFileSync(path.join(__dirname, "../../supabase-schema.sql"), "utf8"));
  for (let i = 0; i < 2; i++)
    for (const file of [
      "schema.sql",
      "runtime-role.sql",
      "onboarding.sql",
      "automation.sql",
      "native-automation.sql",
    ])
      await sql.exec(
        fs
          .readFileSync(path.join(__dirname, "..", file), "utf8")
          .replace("grant connect on database postgres to reserva_whatsapp;", ""),
      );
  await sql.query("INSERT INTO auth.users(id) VALUES($1),($2)", [OWNER, OTHER]);
  await sql.query(
    "UPDATE public.companies SET id=$2,timezone='America/Caracas' WHERE owner_id=$1",
    [OWNER, COMPANY],
  );
  await sql.query("UPDATE public.companies SET id=$2 WHERE owner_id=$1", [OTHER, SECOND]);
  await sql.query(
    `INSERT INTO whatsapp_cloud.companies(company_id,whatsapp_token_oficial,whatsapp_phone_id,whatsapp_acceso_aprobado,template_approved,confirmation_template_approved,connection_state,template_button_count,confirmation_button_count)
    VALUES($1,$2,$3,true,true,true,'CONNECTED',3,3)`,
    [COMPANY, encryptToken("test-token", config.encryptionKey), PHONE_ID],
  );
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
  const db = createPostgresDb(config, pool);
  const calls = [];
  const http = {
    async post(url, payload) {
      calls.push({ url, payload });
      return { data: { messages: [{ id: `wamid.${crypto.randomUUID()}` }] } };
    },
  };
  await sql.exec("SET ROLE reserva_whatsapp");
  await db.native.configure(COMPANY, { enabled: true, reminderMinutes: 1440 });
  async function admin(text, params = []) {
    await sql.exec("RESET ROLE");
    try {
      return await query(text, params);
    } finally {
      await sql.exec("SET ROLE reserva_whatsapp");
    }
  }
  async function asOwner(owner, callback) {
    await sql.exec("RESET ROLE; SET ROLE authenticated");
    await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
    try {
      return await callback();
    } finally {
      await sql.exec("RESET ROLE; SET ROLE reserva_whatsapp");
    }
  }
  async function book({ consent = true, minutes = 2880, owner = OWNER, company = COMPANY } = {}) {
    return asOwner(
      owner,
      async () =>
        (
          await query(
            "SELECT public.book_reservation_with_whatsapp($1,'Ana Prueba',$2,'Servicio',now()+make_interval(mins=>$3),now()+make_interval(mins=>$3+60),$4) AS id",
            [company, `+${PHONE}`, minutes, consent],
          )
        ).rows[0].id,
    );
  }
  const run = (job, client = http) =>
    runAutomationJob(
      {
        db,
        config,
        validateSend,
        deliver: (input, owner) =>
          deliverReminder({ db, config, http: client, logger: { error() {} } }, input, owner),
      },
      job,
    );
  const app = createApp({
    config,
    db,
    http,
    authenticate: async (header) => {
      if (!header) throw new HttpError(401, "UNAUTHORIZED", "Sesión requerida");
      return header === "Bearer other" ? OTHER : OWNER;
    },
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
  async function api(route, body, auth = "owner") {
    const r = await fetch(`${base}/api/${route}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  }
  const calBody = (overrides = {}) => ({
    triggerEvent: "BOOKING_CREATED",
    createdAt: new Date().toISOString(),
    payload: {
      uid: "cal-booking-1",
      startTime: new Date(Date.now() + 3 * 86400000).toISOString(),
      endTime: new Date(Date.now() + 3 * 86400000 + 3600000).toISOString(),
      status: "ACCEPTED",
      eventTitle: "Servicio",
      attendees: [{ name: "Ana Prueba", phoneNumber: `+${PHONE}` }],
      responses: { whatsappConsent: { value: true } },
      ...overrides,
    },
  });
  async function cal(connect, body, signature) {
    const raw = JSON.stringify(body);
    const r = await fetch(`${base}${connect.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cal-signature-256":
          signature || crypto.createHmac("sha256", connect.secret).update(raw).digest("hex"),
      },
      body: raw,
    });
    return { status: r.status, body: await r.json() };
  }
  return { sql, query, admin, asOwner, db, calls, http, run, book, api, cal, calBody };
}

test("dos mensajes distintos, cuota exacta, recuperación e idempotencia sin Make", async (t) => {
  const f = await fixture(t);
  await f.book();
  const jobs = (await f.query("SELECT * FROM whatsapp_cloud.jobs ORDER BY kind")).rows;
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].kind, "reminder");
  assert.equal(+new Date(jobs[1].starts_at) - +new Date(jobs[1].due_at), 86400000);
  const first = await f.db.native.claim();
  assert.equal(first.kind, "confirmation");
  await f.run(first);
  await f.run(first);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].payload.template.name, "reserva_confirmacion");
  assert.equal(f.calls[0].payload.template.components.filter((c) => c.type === "button").length, 3);
  await f.admin(
    "UPDATE whatsapp_cloud.jobs SET due_at=now(),available_at=now() WHERE kind='reminder'",
  );
  await f.admin("UPDATE whatsapp_cloud.automation_settings SET next_dispatch_at=now()");
  const second = await f.db.native.claim();
  assert.equal(second.kind, "reminder");
  await f.run(second);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].payload.template.name, "recordatorio_cita");
  assert.deepEqual((await f.query("SELECT sent,reserved FROM whatsapp_cloud.usage")).rows, [
    { sent: 2, reserved: 0 },
  ]);
  assert.ok(
    (await f.admin("SELECT reminder_sent_at FROM public.reservations")).rows[0].reminder_sent_at,
  );
  assert.equal(await f.db.native.claim(), null);
  assert.equal((await f.api("integrations/make/key", { companyId: COMPANY })).status, 404);
});
test("RLS, RPC y endpoints aíslan empresas y no conceden aprobación ni secretos", async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => f.book({ owner: OTHER }), /Forbidden/);
  await assert.rejects(
    () => f.query("UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=true"),
    /permission denied/,
  );
  assert.equal((await f.api(`automation/${COMPANY}`, undefined, "other")).status, 404);
  assert.equal(
    (await f.api("automation/settings", { companyId: COMPANY, enabled: true, reminderMinutes: 1 }))
      .status,
    400,
  );
  const connect = await f.api("automation/cal/connect", { companyId: COMPANY });
  assert.equal(connect.status, 201);
  const info = await f.api(`automation/${COMPANY}`);
  assert.ok(!JSON.stringify(info).includes(connect.body.secret));
  await f.asOwner(OWNER, async () => {
    await assert.rejects(() => f.query("SELECT * FROM whatsapp_cloud.jobs"), /permission denied/);
  });
});
test("sin consentimiento no se llama a Meta; suspensión bloquea sin consumir cuota", async (t) => {
  const f = await fixture(t);
  await f.book({ consent: false });
  assert.equal(await f.db.native.claim(), null);
  assert.equal(f.calls.length, 0);
  await f.book();
  await f.admin("UPDATE whatsapp_cloud.companies SET status_pago='SUSPENDIDO'");
  await f.admin("UPDATE whatsapp_cloud.automation_settings SET next_dispatch_at=now()");
  const blocked = await f.db.native.claim();
  await f.run(blocked);
  assert.equal(
    (await f.query("SELECT state FROM whatsapp_cloud.jobs WHERE id=$1", [blocked.id])).rows[0]
      .state,
    "blocked",
  );
  assert.equal(f.calls.length, 0);
});

test("una autorización anterior del teléfono no se reutiliza para otra reserva nativa o de Cal.com", async (t) => {
  const f = await fixture(t);
  await f.book();
  const withoutConsent = await f.book({ consent: false });
  assert.equal(
    (
      await f.query("SELECT count(*)::int AS n FROM whatsapp_cloud.jobs WHERE reservation_id=$1", [
        withoutConsent,
      ])
    ).rows[0].n,
    0,
  );
  const connect = await f.db.native.rotateCal(COMPANY);
  const body = f.calBody({ responses: { whatsappConsent: { value: false } } });
  await f.cal(connect, body);
  await f.db.native.processCal();
  assert.equal((await f.query("SELECT count(*)::int AS n FROM whatsapp_cloud.jobs")).rows[0].n, 2);
  await f.asOwner(OWNER, async () => {
    await assert.rejects(
      () =>
        f.query("UPDATE public.reservations SET whatsapp_authorized=true WHERE id=$1", [
          withoutConsent,
        ]),
      /permission denied/,
    );
  });
});
test("reprogramar cancela trabajos anteriores y cancelar elimina los pendientes", async (t) => {
  const f = await fixture(t);
  const id = await f.book();
  await f.asOwner(OWNER, () =>
    f.query(
      "SELECT public.reschedule_reservation($1,$2,now()+interval '4 days',now()+interval '4 days 1 hour')",
      [COMPANY, id],
    ),
  );
  const jobs = (
    await f.query(
      "SELECT state,count(*)::int AS count FROM whatsapp_cloud.jobs GROUP BY state ORDER BY state",
    )
  ).rows;
  assert.deepEqual(jobs, [
    { state: "cancelled", count: 2 },
    { state: "pending", count: 2 },
  ]);
  await f.admin("UPDATE public.reservations SET status='cancelled' WHERE id=$1", [id]);
  assert.equal(await f.db.native.claim(), null);
  assert.equal(f.calls.length, 0);
});
test("reserva cercana separa mensajes; pausar no produce ráfagas al reactivar", async (t) => {
  const f = await fixture(t);
  await f.book({ minutes: 60 });
  const rows = (
    await f.query("SELECT kind,due_at,starts_at FROM whatsapp_cloud.jobs ORDER BY kind")
  ).rows;
  assert.ok(+new Date(rows[1].due_at) - Date.now() > 25 * 60000);
  assert.ok(+new Date(rows[1].due_at) < +new Date(rows[1].starts_at));
  await f.db.native.configure(COMPANY, { enabled: false, reminderMinutes: 60 });
  await f.db.native.configure(COMPANY, { enabled: true, reminderMinutes: 60 });
  assert.equal(await f.db.native.claim(), null);
  await f.book({ minutes: 5 });
  assert.equal(
    (await f.query("SELECT count(*)::int AS n FROM whatsapp_cloud.jobs WHERE state='pending'"))
      .rows[0].n,
    1,
  );
});
test("lease vencida se recupera y un resultado incierto no genera un segundo envío", async (t) => {
  const f = await fixture(t);
  await f.book();
  const initial = await f.db.native.claim();
  assert.equal(await f.db.native.claim(), null);
  await f.admin(
    "UPDATE whatsapp_cloud.jobs SET leased_until=now()-interval '1 second' WHERE id=$1",
    [initial.id],
  );
  await f.admin("UPDATE whatsapp_cloud.automation_settings SET next_dispatch_at=now()");
  const recovered = await f.db.native.claim();
  assert.equal(recovered.id, initial.id);
  assert.notEqual(recovered.lease_id, initial.lease_id);
  let sends = 0;
  await f.run(recovered, {
    async post() {
      sends++;
      throw new Error("timeout");
    },
  });
  assert.equal(
    (await f.query("SELECT state FROM whatsapp_cloud.jobs WHERE id=$1", [initial.id])).rows[0]
      .state,
    "review",
  );
  await f.run(recovered);
  assert.equal(sends, 1);
  assert.equal(f.calls.length, 0);
  assert.deepEqual((await f.query("SELECT sent,reserved FROM whatsapp_cloud.usage")).rows, [
    { sent: 0, reserved: 1 },
  ]);
});
test("botón Cambiar cita registra solicitud, detiene recordatorio y conserva la reserva", async (t) => {
  const f = await fixture(t);
  await f.book();
  const job = await f.db.native.claim();
  await f.run(job);
  const out = (await f.query("SELECT * FROM whatsapp_cloud.outbox")).rows[0];
  await f.db.enqueue(
    extractEvents({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: PHONE_ID },
                messages: [
                  {
                    id: "change-1",
                    type: "button",
                    from: PHONE,
                    button: { payload: buttonPayload("reschedule", out.id, config.buttonSecret) },
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
  );
  await f.db.processNext(config.buttonSecret);
  assert.deepEqual(
    (await f.query("SELECT status,customer_response FROM public.reservations")).rows[0],
    { status: "confirmed", customer_response: "reschedule_requested" },
  );
  assert.equal(
    (await f.query("SELECT state FROM whatsapp_cloud.jobs WHERE kind='reminder'")).rows[0].state,
    "cancelled",
  );
});
test("Cal.com directo verifica firma, cifra campos mínimos y deduplica sin enviar desde el webhook", async (t) => {
  const f = await fixture(t);
  const connect = await f.db.native.rotateCal(COMPANY);
  const body = f.calBody();
  assert.equal(verifyCalSignature(Buffer.from("{}"), "0".repeat(64), connect.secret), false);
  assert.equal((await f.cal(connect, body, "0".repeat(64))).status, 403);
  assert.equal((await f.cal(connect, body)).status, 202);
  assert.equal((await f.cal(connect, body)).body.duplicate, true);
  const row = (await f.query("SELECT * FROM whatsapp_cloud.cal_events")).rows[0];
  assert.ok(!row.encrypted_payload.includes("Ana"));
  assert.equal(f.calls.length, 0);
  assert.equal(await f.db.native.processCal(), true);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM public.reservations")).rows[0].n, 1);
  assert.equal((await f.query("SELECT count(*)::int AS n FROM whatsapp_cloud.jobs")).rows[0].n, 2);
  assert.equal(
    (await f.query("SELECT encrypted_payload FROM whatsapp_cloud.cal_events")).rows[0]
      .encrypted_payload,
    null,
  );
});
test("Cal.com: cancelación adelantada y created retrasado no reabren una reserva", async (t) => {
  const f = await fixture(t);
  const connect = await f.db.native.rotateCal(COMPANY);
  const created = f.calBody();
  const cancelled = {
    ...created,
    triggerEvent: "BOOKING_CANCELLED",
    createdAt: new Date(Date.now() + 1000).toISOString(),
  };
  await f.cal(connect, cancelled);
  await f.db.native.processCal();
  await f.cal(connect, created);
  await f.db.native.processCal();
  assert.equal((await f.query("SELECT count(*)::int AS n FROM public.reservations")).rows[0].n, 0);
  assert.equal(f.calls.length, 0);
});
test("Cal.com: nuevo UID al reprogramar cancela el anterior y conserva aislamiento", async (t) => {
  const f = await fixture(t);
  const connect = await f.db.native.rotateCal(COMPANY);
  const created = f.calBody();
  await f.cal(connect, created);
  await f.db.native.processCal();
  const rescheduled = {
    ...created,
    triggerEvent: "BOOKING_RESCHEDULED",
    createdAt: new Date(Date.now() + 1000).toISOString(),
    payload: {
      ...created.payload,
      uid: "new-uid",
      rescheduleUid: created.payload.uid,
      startTime: new Date(Date.now() + 4 * 86400000).toISOString(),
      endTime: new Date(Date.now() + 4 * 86400000 + 3600000).toISOString(),
    },
  };
  await f.cal(connect, rescheduled);
  await f.db.native.processCal();
  const rows = (
    await f.query(
      "SELECT status,count(*)::int AS n FROM public.reservations GROUP BY status ORDER BY status",
    )
  ).rows;
  assert.deepEqual(rows, [
    { status: "cancelled", n: 1 },
    { status: "confirmed", n: 1 },
  ]);
  assert.equal(
    (await f.query("SELECT count(*)::int AS n FROM whatsapp_cloud.jobs WHERE state='pending'"))
      .rows[0].n,
    2,
  );
});
