const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  createPostgresDb,
  createApp,
  createMetaOnboarding,
  decryptToken,
  encryptToken,
  extractCoexistenceEvents,
  buttonPayload,
  extractEvents,
} = require("../server");
const OWNER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE_ID = "123456789012345",
  WABA = "987654321098765",
  APP = "2016633605668910",
  PATIENT = "525555555555";
const config = {
  port: 0,
  host: "127.0.0.1",
  production: false,
  dbMode: "mock",
  databaseUrl: "postgresql://localhost/test",
  encryptionKey: crypto.randomBytes(32).toString("hex"),
  appSecret: "s".repeat(32),
  verifyToken: "v".repeat(32),
  buttonSecret: "b".repeat(32),
  graphVersion: "v26.0",
  appId: APP,
  signupConfigId: "123456789012346",
  signupEnabled: true,
  legacyMakeEnabled: true,
  confirmationTemplateName: "reserva_confirmacion",
  templateName: "recordatorio_cita",
  templateLanguage: "es_MX",
  origins: ["http://localhost:3000"],
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "public-test",
};
async function fixture(
  t,
  {
    coexistence = true,
    signup = {},
    exchangeError,
    exchangeRedirectUri,
    phoneStatus = "CONNECTED",
    scopes = ["whatsapp_business_management", "whatsapp_business_messaging"],
  } = {},
) {
  const { PGlite } = require("@electric-sql/pglite");
  const sql = new PGlite();
  await sql.waitReady;
  t.after(() => sql.close());
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE reserva_whatsapp NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.companies(id uuid primary key,owner_id uuid,timezone text default 'America/Mexico_City');
    CREATE TABLE public.customers(id uuid primary key default gen_random_uuid(),company_id uuid,full_name text,phone text,unique(company_id,id),unique(company_id,phone));
    CREATE TABLE public.reservations(id uuid primary key default gen_random_uuid(),company_id uuid,customer_id uuid,service text,starts_at timestamptz,ends_at timestamptz,reminder_due_at timestamptz,reminder_sent_at timestamptz,status text);`);
  for (let repeat = 0; repeat < 2; repeat++)
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
  const query = async (text, params = []) => {
    const r = await sql.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
  await query("INSERT INTO public.companies(id,owner_id) VALUES($1,$2),($3,$4)", [
    COMPANY,
    OWNER,
    SECOND,
    OTHER,
  ]);
  await sql.exec(
    "ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY; ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY; ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY; SET ROLE reserva_whatsapp;",
  );
  const pool = {
    query,
    on() {},
    async connect() {
      return { query, release() {} };
    },
    async end() {},
  };
  const db = createPostgresDb(config, pool),
    calls = [];
  const http = {
    async get(url, options) {
      calls.push({ url, params: options?.params });
      if (url.endsWith("/oauth/access_token")) {
        if (exchangeError) throw exchangeError;
        if (exchangeRedirectUri && options?.params?.redirect_uri !== exchangeRedirectUri)
          throw Object.assign(new Error("redirect_uri mismatch"), {
            isAxiosError: true,
            response: { status: 400, data: { error: { code: 100, error_subcode: 36008 } } },
          });
        return { data: { access_token: "meta-tenant-token-for-tests-only" } };
      }
      if (url.endsWith("/debug_token"))
        return {
          data: {
            data: {
              app_id: APP,
              is_valid: true,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              scopes,
            },
          },
        };
      if (url.endsWith("/phone_numbers"))
        return {
          data: {
            data: [
              {
                id: PHONE_ID,
                display_phone_number: "+52 55 5555 0000",
                verified_name: "Clínica de prueba",
              },
            ],
          },
        };
      if (url.endsWith("/message_templates"))
        return {
          data: {
            data: [
              {
                name: config.templateName,
                language: config.templateLanguage,
                status: "APPROVED",
                category: "UTILITY",
                components: [
                  { type: "BODY", text: "Hola {{1}}, cita {{2}} {{3}}" },
                  {
                    type: "BUTTONS",
                    buttons: [
                      { type: "QUICK_REPLY", text: "Confirmar" },
                      { type: "QUICK_REPLY", text: "Cancelar" },
                    ],
                  },
                ],
              },
            ],
          },
        };
      if (url.endsWith(PHONE_ID))
        return {
          data: { is_on_biz_app: coexistence, platform_type: "CLOUD_API", status: phoneStatus },
        };
      throw Error("Ruta Graph inesperada");
    },
    async post(url, data) {
      calls.push({ url, data });
      if (url.endsWith("/subscribed_apps")) return { data: { success: true } };
      if (url.endsWith("/smb_app_data")) return { data: { request_id: `sync-${data.sync_type}` } };
      if (url.endsWith("/messages"))
        return { data: { messages: [{ id: `wamid.${crypto.randomUUID()}` }] } };
      throw Error("Ruta Graph inesperada");
    },
  };
  const app = createApp({
    config: { ...config, ...signup },
    db,
    http,
    authenticate: async (header) => {
      if (!header) throw new (require("../server").HttpError)(401, "UNAUTHORIZED", "Inicia sesión");
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
    const response = await fetch(`${base}/api/${route}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  async function admin(text, params = []) {
    await sql.exec("RESET ROLE");
    try {
      return await query(text, params);
    } finally {
      await sql.exec("SET ROLE reserva_whatsapp");
    }
  }
  async function connect(
    companyId = COMPANY,
    auth = "owner",
    code = `code-${crypto.randomUUID()}`,
  ) {
    const start = await api("whatsapp/onboarding/start", { companyId }, auth);
    assert.equal(start.status, 201);
    const proof = { companyId, ...start.body };
    const exchange = await api("whatsapp/onboarding/exchange", { ...proof, code }, auth);
    assert.equal(exchange.status, 200);
    return {
      proof,
      result: await api(
        "whatsapp/onboarding/complete",
        {
          ...proof,
          event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          wabaId: WABA,
          phoneId: PHONE_ID,
        },
        auth,
      ),
    };
  }
  return { api, db, sql, query, admin, connect, calls };
}

test("conexión directa verifica propiedad, cifra el token y mantiene el acceso de prueba pendiente", async (t) => {
  const { api, admin, calls } = await fixture(t, {
    coexistence: false,
    signup: { signupEnabled: false },
  });
  const token = "meta-direct-token-for-tests-only";
  const body = { companyId: COMPANY, wabaId: WABA, phoneId: PHONE_ID, token };
  const route = "whatsapp/connection/direct";
  assert.equal((await api(route, body, "other")).status, 404);
  assert.equal((await api(route, { ...body, phoneId: "invalid" })).status, 400);
  assert.equal(calls.length, 0);
  assert.deepEqual(await api(route, body), { status: 200, body: { connected: true } });
  const result = await admin("SELECT * FROM whatsapp_cloud.companies WHERE company_id=$1", [
    COMPANY,
  ]);
  const saved = result.rows[0];
  assert.equal(saved.connection_state, "CONNECTED");
  assert.equal(saved.coexistence, false);
  assert.equal(saved.whatsapp_acceso_aprobado, false);
  assert.equal(saved.template_status, "APPROVED");
  assert.equal(saved.confirmation_template_status, "MISSING");
  assert.equal(decryptToken(saved.whatsapp_token_oficial, config.encryptionKey), token);
  assert.equal(
    (await api(route, { ...body, companyId: SECOND }, "other")).body.error,
    "ASSET_ALREADY_LINKED",
  );
  assert.equal(
    (await api(route, { ...body, phoneId: "12345678900" })).body.error,
    "NUMBER_ALREADY_CONNECTED",
  );
  await admin(
    "UPDATE whatsapp_cloud.companies SET connection_checked_at=NULL WHERE company_id=$1",
    [COMPANY],
  );
  assert.deepEqual(await api("whatsapp/connection/check", { companyId: COMPANY }), {
    status: 200,
    body: { checked: true },
  });
  const status = await api(`whatsapp/status/${COMPANY}`);
  assert.equal(status.body.connection.state, "CONNECTED");
  assert.equal(JSON.stringify(status).includes(token), false);
  assert.equal(
    calls.some(({ url }) => /smb_app_data|\/messages$|\/register$/.test(url)),
    false,
  );
});

test("conexión directa rechaza un número pendiente y tokens sin permisos antes de suscribir", async (t) => {
  const body = {
    companyId: COMPANY,
    wabaId: WABA,
    phoneId: PHONE_ID,
    token: "meta-direct-token-for-tests-only",
  };
  const route = "whatsapp/connection/direct";
  await t.test("número pendiente", async (subtest) => {
    const { api, calls } = await fixture(subtest, { phoneStatus: "PENDING" });
    assert.equal((await api(route, body)).body.error, "PHONE_NOT_REGISTERED");
    assert.equal(
      calls.some(({ url }) => url.endsWith("/subscribed_apps")),
      false,
    );
  });
  await t.test("token sin permiso de envío", async (subtest) => {
    const { api, calls } = await fixture(subtest, { scopes: ["whatsapp_business_management"] });
    assert.equal((await api(route, body)).body.error, "MISSING_META_PERMISSIONS");
    assert.equal(calls.length, 1);
  });
});

test("prueba privada de Embedded Signup exige propietario y no habilita otras empresas ni aprueba TRIAL", async (t) => {
  const f = await fixture(t, {
    signup: { signupEnabled: false, signupTestCompanyIds: [COMPANY] },
  });
  const own = await f.api(`whatsapp/onboarding/config/${COMPANY}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.enabled, true);
  assert.equal(own.body.testing, true);
  assert.equal((await f.api(`whatsapp/onboarding/config/${COMPANY}`, null, "other")).status, 404);
  const outside = await f.api(`whatsapp/onboarding/config/${SECOND}`, null, "other");
  assert.equal(outside.body.enabled, false);
  assert.equal(outside.body.appId, null);
  assert.equal(outside.body.configId, null);
  const { proof, result } = await f.connect();
  assert.equal(result.status, 200);
  const before = f.calls.length;
  for (const route of ["start", "exchange", "complete"]) {
    const denied = await f.api(
      `whatsapp/onboarding/${route}`,
      {
        ...proof,
        companyId: SECOND,
        code: "another-authorization-code",
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        wabaId: WABA,
        phoneId: PHONE_ID,
      },
      "other",
    );
    assert.equal(denied.status, 503);
    assert.equal(denied.body.error, "SIGNUP_NOT_ENABLED");
  }
  assert.equal(f.calls.length, before);
  const stored = await f.query(
    "select whatsapp_acceso_aprobado from whatsapp_cloud.companies where company_id=$1",
    [COMPANY],
  );
  assert.equal(stored.rows[0].whatsapp_acceso_aprobado, false);
});

test("un rechazo de OAuth muestra la referencia numérica de Meta sin exponer credenciales", async (t) => {
  const secret = "sensitive-oauth-code-in-request-only";
  const exchangeError = Object.assign(new Error(`axios token=${secret}`), {
    isAxiosError: true,
    response: { status: 400, data: { error: { code: 190, error_subcode: 460, message: secret } } },
  });
  const f = await fixture(t, { exchangeError });
  const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
  const result = await f.api("whatsapp/onboarding/exchange", {
    companyId: COMPANY,
    ...start.body,
    code: secret,
  });
  assert.equal(result.status, 502);
  assert.equal(result.body.error, "META_UNAVAILABLE");
  assert.match(result.body.message, /Referencia de Meta: 190\/460/);
  assert.ok(!JSON.stringify(result.body).includes(secret));
  const session = await f.query(
    "select state,encrypted_token from whatsapp_cloud.onboarding_sessions where id=$1",
    [start.body.sessionId],
  );
  assert.deepEqual(session.rows[0], { state: "failed", encrypted_token: null });
  assert.ok(!f.calls.some((call) => call.url.endsWith("/messages")));
});

test("OAuth recupera 100/36008 con la página autorizada y rechaza redirecciones externas antes de consumir el código", async (t) => {
  const redirectUri = "http://localhost:3000/dashboard/whatsapp";
  const f = await fixture(t, { exchangeRedirectUri: redirectUri });
  const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
  const proof = { companyId: COMPANY, ...start.body, code: "one-use-browser-code" };
  for (const invalid of [
    "https://attacker.example/dashboard/whatsapp",
    "http://localhost:3000@attacker.example/dashboard/whatsapp",
    `${redirectUri}?next=https://attacker.example`,
    `${redirectUri}#fragment`,
    "http://localhost:3000/login",
    null,
    42,
  ]) {
    const denied = await f.api("whatsapp/onboarding/exchange", { ...proof, redirectUri: invalid });
    assert.equal(denied.status, 400);
    assert.equal(denied.body.error, "INVALID_REDIRECT_URI");
  }
  assert.equal(f.calls.length, 0);
  assert.equal(
    (
      await f.query("select state from whatsapp_cloud.onboarding_sessions where id=$1", [
        start.body.sessionId,
      ])
    ).rows[0].state,
    "pending",
  );
  const result = await f.api("whatsapp/onboarding/exchange", { ...proof, redirectUri });
  assert.equal(result.status, 200);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].params.redirect_uri, undefined);
  assert.equal(f.calls[1].params.redirect_uri, redirectUri);
  assert.equal(f.calls[0].params.code, f.calls[1].params.code);
  assert.equal(
    (
      await f.query("select state from whatsapp_cloud.onboarding_sessions where id=$1", [
        start.body.sessionId,
      ])
    ).rows[0].state,
    "token_ready",
  );
  assert.equal(
    (await f.api("whatsapp/onboarding/exchange", { ...proof, redirectUri })).status,
    409,
  );
  assert.equal(f.calls.length, 2);
  assert.ok(!f.calls.some((call) => call.url.endsWith("/messages")));
});

test("OAuth admite la devolución del SDK oficial sin exponer la credencial", async (t) => {
  const sdkUri = "https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46";
  const f = await fixture(t, { exchangeRedirectUri: sdkUri });
  const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
  const result = await f.api("whatsapp/onboarding/exchange", {
    companyId: COMPANY,
    ...start.body,
    code: "one-use-popup-code",
    redirectUri: "http://localhost:3000/dashboard/whatsapp",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { exchanged: true });
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[2].params.redirect_uri, sdkUri);
  assert.ok(!JSON.stringify(result.body).includes("meta-tenant-token"));
  assert.ok(!f.calls.some((call) => call.url.endsWith("/messages")));
});

test("OAuth recupera el 191 que exige redirect_uri sin reintentar un código consumido", async () => {
  const redirectUri = "https://reservas-saas-ae.vercel.app/dashboard/whatsapp";
  const code = "private-test-authorization-code";
  const calls = [];
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  const missingRedirect = {
    response: { data: { error: { code: 191, message: "Missing redirect_uri parameter." } } },
  };
  const meta = createMetaOnboarding(
    config,
    {
      async get(_url, { params }) {
        calls.push(params.redirect_uri);
        if (!params.redirect_uri) throw missingRedirect;
        return { data: { access_token: "meta-tenant-token-for-tests-only" } };
      },
    },
    logger,
  );

  assert.equal(await meta.exchange(code, redirectUri), "meta-tenant-token-for-tests-only");
  assert.deepEqual(calls, [undefined, redirectUri]);
  assert.deepEqual(warnings, ["[whatsapp:oauth] Meta rechazó la URL de retorno (embedded, 191)."]);

  let attempts = 0;
  const usedCode = { response: { data: { error: { code: 100, error_subcode: 36009 } } } };
  const expired = createMetaOnboarding(
    config,
    {
      async get() {
        attempts++;
        throw usedCode;
      },
    },
    logger,
  );
  await assert.rejects(expired.exchange(code, redirectUri), (error) => error === usedCode);
  assert.equal(attempts, 1);
});

test("OAuth no reintenta timeouts y limita el rechazo de URL de devolución a tres intentos", async (t) => {
  const redirectUri = "http://localhost:3000/dashboard/whatsapp";
  await t.test("un timeout conserva el error sin repetir el intercambio", async (subtest) => {
    const f = await fixture(subtest, {
      exchangeError: Object.assign(new Error("timeout"), {
        isAxiosError: true,
        code: "ECONNABORTED",
      }),
    });
    const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
    const result = await f.api("whatsapp/onboarding/exchange", {
      companyId: COMPANY,
      ...start.body,
      code: "one-use-browser-code",
      redirectUri,
    });
    assert.equal(result.status, 502);
    assert.equal(f.calls.length, 1);
  });
  await t.test(
    "agotadas las URLs autorizadas devuelve instrucciones y elimina la credencial temporal",
    async (subtest) => {
      const f = await fixture(subtest, {
        exchangeRedirectUri: "https://different.example/callback",
      });
      const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
      const result = await f.api("whatsapp/onboarding/exchange", {
        companyId: COMPANY,
        ...start.body,
        code: "one-use-browser-code",
        redirectUri,
      });
      assert.equal(result.status, 502);
      assert.equal(result.body.error, "META_REDIRECT_MISMATCH");
      assert.match(result.body.message, /100\/36008/);
      assert.equal(f.calls.length, 3);
      assert.deepEqual(
        (
          await f.query(
            "select state,encrypted_token from whatsapp_cloud.onboarding_sessions where id=$1",
            [start.body.sessionId],
          )
        ).rows[0],
        { state: "failed", encrypted_token: null },
      );
    },
  );
});

test("Embedded Signup real: propietario, código de un solo uso, cifrado, Coexistencia y sin aprobación automática", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.api("whatsapp/onboarding/start", { companyId: COMPANY }, "other")).status,
    404,
  );
  const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
  const proof = { companyId: COMPANY, ...start.body },
    code = "authorization-code-unique";
  assert.equal(
    (await f.api("whatsapp/onboarding/exchange", { ...proof, nonce: "0".repeat(64), code })).status,
    409,
  );
  assert.equal((await f.api("whatsapp/onboarding/exchange", { ...proof, code })).status, 200);
  assert.equal((await f.api("whatsapp/onboarding/exchange", { ...proof, code })).status, 409);
  assert.equal(
    (
      await f.api("whatsapp/onboarding/complete", {
        ...proof,
        event: "FINISH",
        phoneId: PHONE_ID,
        wabaId: WABA,
      })
    ).status,
    409,
  );
  const complete = await f.api("whatsapp/onboarding/complete", {
    ...proof,
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    phoneId: PHONE_ID,
    wabaId: WABA,
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.connected, true);
  const company = (
    await f.query("SELECT * FROM whatsapp_cloud.companies WHERE company_id=$1", [COMPANY])
  ).rows[0];
  assert.equal(company.connection_state, "CONNECTED");
  assert.equal(company.whatsapp_acceso_aprobado, false);
  assert.equal(company.plan_actual, "TRIAL");
  assert.match(company.whatsapp_token_oficial, /^v1\./);
  assert.ok(!company.whatsapp_token_oficial.includes("meta-tenant-token"));
  assert.equal(company.template_approved, true);
  const session = (
    await f.query(
      "SELECT state,encrypted_token FROM whatsapp_cloud.onboarding_sessions WHERE id=$1",
      [proof.sessionId],
    )
  ).rows[0];
  assert.deepEqual(session, { state: "completed", encrypted_token: null });
  const status = await f.api(`whatsapp/status/${COMPANY}`);
  assert.equal(status.body.status, "BLOCKED");
  assert.equal(status.body.connection.coexistence, true);
  assert.ok(!JSON.stringify(status.body).includes("v1."));
  assert.ok(!JSON.stringify(status.body).includes(WABA));
  assert.equal(f.calls.filter((c) => c.url.endsWith("/smb_app_data")).length, 2);
  assert.ok(!f.calls.some((c) => c.url.endsWith("/register")));
  await assert.rejects(
    () => f.query("UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=true"),
    /permission denied/,
  );
  await assert.rejects(
    () => f.query("UPDATE whatsapp_cloud.companies SET status_pago='ACTIVO'"),
    /permission denied/,
  );
  const second = await f.connect(SECOND, "other");
  assert.equal(second.result.status, 409);
  assert.equal(second.result.body.error, "ASSET_ALREADY_LINKED");
  await f.admin(
    "UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=true,token_expires_at=now()-interval '1 minute' WHERE company_id=$1",
    [COMPANY],
  );
  const expired = await f.api(`whatsapp/status/${COMPANY}`);
  assert.equal(expired.body.status, "BLOCKED");
  assert.equal(expired.body.checks.credentials, false);
  await assert.rejects(
    () => f.db.reserve({ companyId: COMPANY, idempotencyKey: crypto.randomUUID() }, OWNER),
    { code: "META_TOKEN_EXPIRED" },
  );
});

test("si Meta no confirma móvil y API simultáneos no se migra ni almacena el número", async (t) => {
  const f = await fixture(t, { coexistence: false });
  const { result } = await f.connect();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "COEXISTENCE_REQUIRED");
  assert.equal(
    (
      await f.query(
        "SELECT whatsapp_token_oficial FROM whatsapp_cloud.companies WHERE company_id=$1",
        [COMPANY],
      )
    ).rows[0].whatsapp_token_oficial,
    null,
  );
  assert.ok(!f.calls.some((c) => c.url.endsWith("/register")));
});

test("evento oficial de Coexistencia con solo WABA resuelve el único número en el servidor", async (t) => {
  const f = await fixture(t);
  const start = await f.api("whatsapp/onboarding/start", { companyId: COMPANY });
  const proof = { companyId: COMPANY, ...start.body };
  await f.api("whatsapp/onboarding/exchange", {
    ...proof,
    code: `single-waba-${crypto.randomUUID()}`,
  });
  const complete = await f.api("whatsapp/onboarding/complete", {
    ...proof,
    wabaId: WABA,
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.coexistence, true);
  const stored = (
    await f.query("SELECT whatsapp_phone_id FROM whatsapp_cloud.companies WHERE company_id=$1", [
      COMPANY,
    ])
  ).rows[0];
  assert.equal(stored.whatsapp_phone_id, PHONE_ID);
  assert.ok(!f.calls.some((call) => call.url.endsWith("/register")));
});

test("Make sincroniza Cal.com, aplica consentimiento y cuota, deduplica y protege reprogramaciones", async (t) => {
  const f = await fixture(t);
  await f.connect();
  const key = await f.api("integrations/make/key", { companyId: COMPANY });
  assert.equal(key.status, 201);
  const token = key.body.token;
  assert.match(token, /^rsv_make_[a-f0-9]{64}$/);
  const info = await f.api(`integrations/make/${COMPANY}`);
  assert.ok(!JSON.stringify(info).includes(token));
  const booking = {
    event: "created",
    bookingId: "cal-uid-1",
    eventAt: new Date(Date.now() - 60000).toISOString(),
    patientName: "Ana López",
    phone: `+${PATIENT}`,
    startsAt: "2100-01-02T16:00:00Z",
    endsAt: "2100-01-02T17:00:00Z",
    service: "Consulta",
    sendReminder: true,
  };
  assert.equal(
    (await f.api("integrations/make/events", { ...booking, companyId: SECOND }, token)).status,
    403,
  );
  const review = await f.api("integrations/make/events", booking, token);
  assert.equal(review.status, 403);
  assert.equal(review.body.error, "TRIAL_REVIEW");
  assert.equal((await f.query("SELECT count(*) AS n FROM public.reservations")).rows[0].n, 1);
  await f.admin(
    "UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=true WHERE company_id=$1",
    [COMPANY],
  );
  const consent = await f.api("integrations/make/events", booking, token);
  assert.equal(consent.body.error, "CONSENT_REQUIRED");
  // La evidencia debe poder registrarse también al reintentar el mismo evento.
  const withConsent = {
    ...booking,
    eventAt: new Date(Date.now() - 50000).toISOString(),
    whatsappConsent: true,
    consentEvidence: "Formulario de Cal.com: acepto recibir recordatorios por WhatsApp",
  };
  const sent = await f.api("integrations/make/events", withConsent, token);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.success, true);
  const replay = await f.api("integrations/make/events", withConsent, token);
  assert.equal(replay.body.replayed, true);
  assert.equal(f.calls.filter((c) => c.url.endsWith("/messages")).length, 1);
  const rescheduled = {
    ...withConsent,
    event: "rescheduled",
    eventAt: new Date(Date.now() - 40000).toISOString(),
    startsAt: "2100-01-03T16:00:00Z",
    endsAt: "2100-01-03T17:00:00Z",
    sendReminder: false,
  };
  assert.equal((await f.api("integrations/make/events", rescheduled, token)).status, 200);
  const stale = await f.api(
    "integrations/make/events",
    { event: "remind", bookingId: booking.bookingId, startsAt: booking.startsAt },
    token,
  );
  assert.equal(stale.body.error, "STALE_BOOKING");
  await f.db.enqueue([
    {
      id: "button-old",
      phoneId: PHONE_ID,
      from: PATIENT,
      payload: buttonPayload("cancel", sent.body.requestId, config.buttonSecret),
      text: "Cancelar",
      contextId: null,
    },
  ]);
  await f.db.processNext(config.buttonSecret);
  assert.equal(
    (await f.query("SELECT status FROM public.reservations")).rows[0].status,
    "confirmed",
  );
  const outOfOrder = await f.api("integrations/make/events", withConsent, token);
  assert.equal(outOfOrder.body.ignored, true);
  const current = await f.api(
    "integrations/make/events",
    { event: "remind", bookingId: booking.bookingId, startsAt: rescheduled.startsAt },
    token,
  );
  assert.equal(current.status, 200);
  assert.equal(f.calls.filter((c) => c.url.endsWith("/messages")).length, 2);
  const cancel = await f.api(
    "integrations/make/events",
    {
      event: "cancelled",
      bookingId: booking.bookingId,
      eventAt: new Date(Date.now() - 30000).toISOString(),
    },
    token,
  );
  assert.equal(cancel.status, 200);
  assert.equal(
    (await f.query("SELECT status FROM public.reservations")).rows[0].status,
    "cancelled",
  );
  const denied = await f.api("integrations/make/key", { companyId: COMPANY }, "other");
  assert.equal(denied.status, 404);
  await f.api("integrations/make/revoke", { companyId: COMPANY });
  assert.equal((await f.api("integrations/make/events", booking, token)).status, 401);
});

test("webhooks Coexistencia: actividad cifrada por empresa, progreso monotónico y revocación", async (t) => {
  const f = await fixture(t);
  await f.connect();
  const value = {
    metadata: { phone_number_id: PHONE_ID },
    message_echoes: [
      {
        id: "wamid.mobile1",
        from: "525500000000",
        to: PATIENT,
        type: "text",
        timestamp: String(Math.floor(Date.now() / 1000)),
        text: { body: "Mensaje privado de ejemplo" },
      },
    ],
  };
  const raw = {
    object: "whatsapp_business_account",
    entry: [{ id: WABA, changes: [{ field: "smb_message_echoes", value }] }],
  };
  const events = extractCoexistenceEvents(raw, config.encryptionKey);
  assert.equal(events.length, 1);
  assert.ok(!JSON.stringify(events).includes("Mensaje privado"));
  await f.db.enqueue(events);
  await f.db.enqueue(events);
  await f.db.processNext(config.buttonSecret);
  const activity = await f.api(`whatsapp/activity/${COMPANY}`);
  assert.equal(activity.body.items.length, 1);
  assert.equal(activity.body.items[0].text, "Mensaje privado de ejemplo");
  assert.equal((await f.api(`whatsapp/activity/${COMPANY}`, null, "other")).status, 404);
  await f.admin("UPDATE whatsapp_cloud.activity SET received_at=now()-interval '8 days'");
  await f.admin("UPDATE whatsapp_cloud.inbox SET created_at=now()-interval '8 days'");
  await f.db.onboarding.cleanup();
  assert.equal((await f.api(`whatsapp/activity/${COMPANY}`)).body.items.length, 0);
  assert.ok(
    !(await f.query("SELECT event FROM whatsapp_cloud.inbox")).rows.some((r) => r.event.encrypted),
  );
  await f.db.enqueue([
    {
      id: "progress100",
      kind: "sync",
      wabaId: WABA,
      phoneId: PHONE_ID,
      syncType: "history",
      state: "COMPLETE",
      progress: 100,
    },
    {
      id: "progress10",
      kind: "sync",
      wabaId: WABA,
      phoneId: PHONE_ID,
      syncType: "history",
      state: "RECEIVING",
      progress: 10,
    },
  ]);
  await f.db.processNext(config.buttonSecret);
  await f.db.processNext(config.buttonSecret);
  assert.equal(
    (
      await f.query("SELECT sync_state FROM whatsapp_cloud.companies WHERE company_id=$1", [
        COMPANY,
      ])
    ).rows[0].sync_state.history.progress,
    100,
  );
  await f.db.enqueue([{ id: "old-disconnect", kind: "disconnect", wabaId: WABA, timestamp: 1 }]);
  await f.db.processNext(config.buttonSecret);
  assert.equal(
    (
      await f.query("SELECT connection_state FROM whatsapp_cloud.companies WHERE company_id=$1", [
        COMPANY,
      ])
    ).rows[0].connection_state,
    "CONNECTED",
  );
  await f.db.enqueue([
    {
      id: "disconnect-now",
      kind: "disconnect",
      wabaId: WABA,
      timestamp: Math.ceil(Date.now() / 1000),
    },
  ]);
  await f.db.processNext(config.buttonSecret);
  const company = (
    await f.query(
      "SELECT connection_state,whatsapp_token_oficial FROM whatsapp_cloud.companies WHERE company_id=$1",
      [COMPANY],
    )
  ).rows[0];
  assert.deepEqual(company, { connection_state: "DISCONNECTED", whatsapp_token_oficial: null });
});
