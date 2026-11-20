const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresDb, createApp, encryptToken, HttpError } = require("../server");
const { extractChatEvents } = require("../chat");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
const PHONE = "584121111111",
  NUMBER = "1357561000784853",
  SECOND = "123456789012345";
async function fixture(t) {
  const sql = new PGlite();
  await sql.waitReady;
  t.after(() => sql.close());
  await sql.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role reserva_whatsapp nologin nosuperuser nobypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;`);
  await sql.exec(fs.readFileSync(path.join(__dirname, "../../supabase-schema.sql"), "utf8"));
  for (let repeat = 0; repeat < 2; repeat++)
    for (const file of [
      "schema.sql",
      "runtime-role.sql",
      "onboarding.sql",
      "automation.sql",
      "native-automation.sql",
      "chat.sql",
    ])
      await sql.exec(
        fs
          .readFileSync(path.join(__dirname, "..", file), "utf8")
          .replace("grant connect on database postgres to reserva_whatsapp;", ""),
      );
  await sql.query("insert into auth.users(id) values($1),($2)", [OWNER, OTHER]);
  await sql.query("update public.companies set id=$2 where owner_id=$1", [OWNER, A]);
  await sql.query("update public.companies set id=$2 where owner_id=$1", [OTHER, B]);
  const config = {
    dbMode: "postgres",
    databaseUrl: "postgresql://localhost/test",
    encryptionKey: crypto.randomBytes(32).toString("hex"),
    appSecret: "s".repeat(32),
    verifyToken: "v".repeat(32),
    buttonSecret: "b".repeat(32),
    graphVersion: "v26.0",
    origins: ["http://localhost:3000"],
    supabaseUrl: "https://test.supabase.co",
    supabaseKey: "public-test-key",
  };
  await sql.query(
    `insert into whatsapp_cloud.companies(company_id,whatsapp_token_oficial,whatsapp_phone_id,whatsapp_acceso_aprobado,connection_state) values($1,$3,$4,true,'CONNECTED'),($2,$3,$5,true,'CONNECTED')`,
    [A, B, encryptToken("private-token", config.encryptionKey), NUMBER, SECOND],
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
  const db = createPostgresDb(config, pool),
    calls = [];
  const http = {
    async post(url, body) {
      calls.push({ url, body });
      return { data: { messages: [{ id: "wamid." + crypto.randomUUID() }] } };
    },
  };
  await sql.exec("set role reserva_whatsapp");
  const app = createApp({
    db,
    config,
    http,
    authenticate: async (header) => {
      if (!header) throw new HttpError(401, "UNAUTHORIZED", "Inicia sesión");
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
  const base = "http://127.0.0.1:" + server.address().port;
  async function api(route, { body, key, auth = "owner" } = {}) {
    const r = await fetch(base + "/api/whatsapp/inbox/" + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + auth,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const inbound = (patch = {}) => ({
    phoneId: NUMBER,
    peer: PHONE,
    phone: PHONE,
    name: "Ana Prueba",
    messageId: "wamid." + crypto.randomUUID(),
    sentAt: new Date().toISOString(),
    kind: "text",
    body: "Mensaje privado de prueba",
    ...patch,
  });
  const company = () => db.companies.findOne({ company_id: A, owner_id: OWNER });
  return { sql, db, query, config, http, calls, base, api, inbound, company };
}
test("bandeja real: captura cifrada, deduplicación, permisos y aislamiento de números/empresas", async (t) => {
  const f = await fixture(t),
    event = f.inbound();
  await f.db.chat.capture([
    event,
    event,
    f.inbound({ phoneId: SECOND, body: "Privado de otra empresa" }),
  ]);
  const list = await f.api(A);
  assert.equal(list.status, 200);
  assert.equal(list.data.conversations.length, 1);
  const chat = list.data.conversations[0];
  assert.equal(chat.unread, 1);
  assert.equal(chat.messages[0].body, event.body);
  assert.equal((await f.api(B)).status, 404);
  assert.equal((await f.api(A, { auth: "other" })).status, 404);
  assert.equal((await f.api(`${B}/${chat.id}`, { auth: "other" })).status, 404);
  const raw = await f.query("select body_encrypted from whatsapp_cloud.chat_messages");
  assert.ok(
    raw.rows.every(
      (row) => row.body_encrypted.startsWith("v1.") && !row.body_encrypted.includes("privado"),
    ),
  );
  await f.sql.exec("reset role;set role authenticated");
  await assert.rejects(f.query("select * from whatsapp_cloud.chat_messages"), /permission denied/);
});
test("lectura explícita no consume un mensaje que llega después; conserva la ventana original", async (t) => {
  const f = await fixture(t);
  await f.db.chat.capture([f.inbound()]);
  const c = (await f.api(A)).data.conversations[0],
    first = c.messages[0];
  await f.db.chat.capture([f.inbound({ sentAt: new Date(Date.now() - 3600000).toISOString() })]);
  assert.equal((await f.api(`${A}/${c.id}/read`, { body: { messageId: first.id } })).status, 200);
  const list = (await f.api(A)).data.conversations[0];
  assert.equal(list.unread, 1);
  assert.equal(list.lastInboundAt, c.lastInboundAt);
});
test("respuesta real: destinatario del servidor, idempotencia y texto cifrado sin activar automatización", async (t) => {
  const f = await fixture(t);
  await f.db.chat.capture([f.inbound()]);
  const c = (await f.api(A)).data.conversations[0],
    key = crypto.randomUUID();
  const route = `${A}/${c.id}/reply`,
    body = { text: "Hola, te esperamos.", phone: "525599999999", companyId: B };
  assert.equal((await f.api(route, { body, key })).status, 200);
  assert.equal((await f.api(route, { body, key })).status, 200);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.to, PHONE);
  assert.equal(f.calls[0].body.type, "text");
  assert.equal((await f.api(route, { body: { text: "Otro mensaje" }, key })).status, 409);
  assert.equal((await f.api(route, { body, key, auth: "other" })).status, 404);
  assert.equal((await f.query("select * from whatsapp_cloud.usage")).rows.length, 0);
});
test("ventana cerrada, texto inválido y suspensión se bloquean antes de Meta", async (t) => {
  const f = await fixture(t);
  await f.db.chat.capture([f.inbound({ sentAt: new Date(Date.now() - 86401000).toISOString() })]);
  const c = (await f.api(A)).data.conversations[0];
  assert.equal(
    (await f.api(`${A}/${c.id}/reply`, { body: { text: "Hola" }, key: crypto.randomUUID() })).data
      .error,
    "WINDOW_CLOSED",
  );
  assert.equal(
    (
      await f.api(`${A}/${c.id}/reply`, {
        body: { text: "a".repeat(4097) },
        key: crypto.randomUUID(),
      })
    ).status,
    400,
  );
  await f.sql.exec("reset role");
  await f.query(
    "update whatsapp_cloud.companies set status_pago='SUSPENDIDO' where company_id=$1",
    [A],
  );
  await f.sql.exec("set role reserva_whatsapp");
  assert.equal(
    (await f.api(`${A}/${c.id}/reply`, { body: { text: "Hola" }, key: crypto.randomUUID() })).data
      .error,
    "SUSPENDED",
  );
  assert.equal(f.calls.length, 0);
});
test("timeout no reenvía, recibos asíncronos fallidos se muestran y no hay regresión desde leído", async (t) => {
  const f = await fixture(t);
  await f.db.chat.capture([f.inbound()]);
  const c = (await f.api(A)).data.conversations[0],
    key = crypto.randomUUID();
  f.http.post = async () => {
    f.calls.push({});
    throw new Error("timeout");
  };
  const route = `${A}/${c.id}/reply`,
    body = { text: "Respuesta" };
  assert.equal((await f.api(route, { body, key })).status, 503);
  const repeated = await f.api(route, { body, key });
  assert.equal(repeated.data.message.delivery, "unknown");
  assert.equal(f.calls.length, 1);
  assert.equal(
    (await f.api(route, { body, key: crypto.randomUUID() })).data.error,
    "SEND_PENDING_REVIEW",
  );
  const company = await f.company();
  await f.db.chat.recordTemplate(
    company,
    { phone: PHONE, patientName: "Ana", date: "2100-01-01", time: "12:00" },
    "wamid.template",
  );
  const stamp = Math.floor(Date.now() / 1000),
    receipt = { phoneId: NUMBER, messageId: "wamid.template", status: "failed", timestamp: stamp };
  await f.db.chat.capture([], [receipt]);
  let messages = (await f.api(`${A}/${c.id}`)).data.messages;
  assert.equal(messages.find((m) => m.kind === "template").delivery, "failed");
  await f.db.chat.capture(
    [],
    [
      { ...receipt, status: "read", timestamp: stamp + 1 },
      { ...receipt, status: "sent", timestamp: stamp + 2 },
    ],
  );
  messages = (await f.api(`${A}/${c.id}`)).data.messages;
  assert.equal(messages.find((m) => m.kind === "template").delivery, "read");
});
test("el webhook firmado persiste texto antes del 200 y no abre la ventana con plantillas salientes", async (t) => {
  const f = await fixture(t),
    body = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: NUMBER },
                contacts: [{ wa_id: PHONE, profile: { name: "Ana" } }],
                messages: [
                  {
                    id: "wamid.incoming",
                    from: PHONE,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hola, ¿están abiertos?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  assert.equal(extractChatEvents(body)[0].body, "Hola, ¿están abiertos?");
  const raw = JSON.stringify(body),
    signature =
      "sha256=" + crypto.createHmac("sha256", f.config.appSecret).update(raw).digest("hex");
  const send = (sign) =>
    fetch(f.base + "/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign },
      body: raw,
    });
  assert.equal((await send("sha256=invalid")).status, 403);
  assert.equal((await send(signature)).status, 200);
  assert.equal((await send(signature)).status, 200);
  assert.equal((await f.api(A)).data.conversations[0].messages[0].body, "Hola, ¿están abiertos?");
  const company = await f.company();
  await f.db.chat.recordTemplate(
    company,
    { phone: "584122222222", patientName: "Luis", date: "2100-01-01", time: "12:00" },
    "wamid.only-template",
  );
  const outbound = (await f.api(A)).data.conversations.find((c) => c.phone === "+584122222222");
  assert.equal(outbound.lastInboundAt, null);
});

test("paginación recorre conversaciones y mensajes sin mezclar cursores de otra empresa", async (t) => {
  const f = await fixture(t);
  const events = Array.from({ length: 52 }, (_, i) =>
    f.inbound({
      peer: "584120000" + String(i).padStart(3, "0"),
      phone: "584120000" + String(i).padStart(3, "0"),
    }),
  );
  await f.db.chat.capture(events);
  const first = (await f.api(A)).data;
  assert.equal(first.conversations.length, 50);
  assert.equal(first.hasMore, true);
  const second = (await f.api(`${A}?before=${first.nextCursor}`)).data;
  assert.equal(second.conversations.length, 2);
  assert.equal(second.hasMore, false);
  assert.equal(
    new Set([...first.conversations, ...second.conversations].map((c) => c.id)).size,
    52,
  );
  assert.equal((await f.api(`${B}?before=${first.nextCursor}`, { auth: "other" })).status, 400);
  assert.equal((await f.api(`${A}?before=invalid`)).status, 400);
  const chat = first.conversations[0],
    event = events.find((e) => "+" + e.phone === chat.phone);
  await f.db.chat.capture(
    Array.from({ length: 55 }, (_, i) =>
      f.inbound({
        peer: event.peer,
        phone: event.phone,
        sentAt: new Date(Date.now() - i * 1000).toISOString(),
      }),
    ),
  );
  const page1 = (await f.api(`${A}/${chat.id}`)).data,
    page2 = (await f.api(`${A}/${chat.id}?before=${page1.nextCursor}`)).data;
  assert.equal(page1.messages.length, 50);
  assert.equal(page2.messages.length, 6);
  assert.equal(new Set([...page1.messages, ...page2.messages].map((m) => m.id)).size, 56);
});

test("un recibo que llega antes de guardar el ID de envío se concilia desde la cola durable", async (t) => {
  const f = await fixture(t);
  await f.db.chat.capture([f.inbound()]);
  const chat = (await f.api(A)).data.conversations[0];
  f.http.post = async () => {
    const receipt = {
      id: "delivery:early",
      kind: "delivery",
      phoneId: NUMBER,
      messageId: "wamid.early",
      status: "read",
      timestamp: Math.floor(Date.now() / 1000),
    };
    await f.db.enqueue([receipt]);
    await f.db.chat.capture([], [receipt]);
    return { data: { messages: [{ id: "wamid.early" }] } };
  };
  const result = await f.api(`${A}/${chat.id}/reply`, {
    body: { text: "Respuesta de prueba" },
    key: crypto.randomUUID(),
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.message.delivery, "read");
});
