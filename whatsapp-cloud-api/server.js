"use strict";

// Toda la aplicación (Express, Meta, adaptador PostgreSQL y mock) vive aquí.
// schema.sql prepara las transacciones y tablas privadas en el Supabase existente.
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const {
  createNativeAutomation,
  installNativeRoutes,
  installCalWebhook,
  startAutomationWorker,
} = require("./native-automation");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const PLANS = Object.freeze({
  TRIAL: Object.freeze({ priceMXN: 0, limit: 35, trialDays: 7 }),
  PRO: Object.freeze({ priceMXN: 599, limit: 1000 }),
  PREMIUM: Object.freeze({ priceMXN: 999, limit: 2500 }),
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// URI pública del puente del SDK oficial, verificada el 3-11-2026 en sdk.js.
// No contiene el fragmento de sesión ni acepta una URL proporcionada por el cliente.
const META_SDK_REDIRECT_URI = "https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46";

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new HttpError(status, code, message);
};

function readConfig(env = process.env) {
  const config = {
    port: Number(env.PORT || 3001),
    host: env.HOST || "0.0.0.0",
    production: env.NODE_ENV === "production",
    dbMode: env.DB_MODE || "postgres",
    databaseUrl: env.DATABASE_URL,
    pgCA: env.PG_CA_CERT,
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY,
    graphVersion: env.META_GRAPH_VERSION,
    appSecret: env.META_APP_SECRET,
    appId: env.META_APP_ID || "",
    signupConfigId: env.META_SIGNUP_CONFIG_ID || "",
    signupEnabled: env.META_SIGNUP_ENABLED === "true",
    signupTestCompanyIds: (env.META_SIGNUP_TEST_COMPANY_IDS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    legacyMakeEnabled: env.LEGACY_MAKE_ENABLED === "true",
    verifyToken: env.WEBHOOK_VERIFY_TOKEN,
    encryptionKey: env.META_TOKEN_ENCRYPTION_KEY,
    buttonSecret: env.BUTTON_SIGNING_SECRET,
    templateName: env.WHATSAPP_TEMPLATE_NAME || "recordatorio_cita",
    confirmationTemplateName: env.WHATSAPP_CONFIRMATION_TEMPLATE_NAME || "reserva_confirmacion",
    templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "es_MX",
    origins: (env.CORS_ORIGINS || "http://localhost:3000")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  };
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535)
    throw new Error("PORT inválido.");
  if (!["postgres", "mock"].includes(config.dbMode)) throw new Error("DB_MODE inválido.");
  if (config.production && config.dbMode !== "postgres")
    throw new Error("El mock no está permitido en producción.");
  for (const key of ["appSecret", "verifyToken", "buttonSecret"]) {
    if (typeof config[key] !== "string" || config[key].length < 32)
      throw new Error(`Configura ${key} con al menos 32 caracteres.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(config.encryptionKey || ""))
    throw new Error("META_TOKEN_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales.");
  if (!/^v[1-9][0-9]*\.0$/.test(config.graphVersion || ""))
    throw new Error("Configura META_GRAPH_VERSION desde el panel de Meta (vNN.0).");
  if (
    (config.signupEnabled || config.signupTestCompanyIds.length > 0) &&
    (!/^[0-9]{5,30}$/.test(config.appId) || !/^[0-9]{5,30}$/.test(config.signupConfigId))
  )
    throw new Error("Embedded Signup requiere META_APP_ID y META_SIGNUP_CONFIG_ID reales.");
  if (config.signupTestCompanyIds.some((id) => !UUID.test(id)))
    throw new Error("META_SIGNUP_TEST_COMPANY_IDS solo admite identificadores UUID de empresas.");
  if (
    !/^[a-z0-9_]{1,512}$/.test(config.templateName) ||
    !/^[a-z0-9_]{1,512}$/.test(config.confirmationTemplateName) ||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.templateLanguage)
  )
    throw new Error("Plantilla o idioma inválido.");
  if (!config.supabaseKey || new URL(config.supabaseUrl).protocol !== "https:")
    throw new Error("Configura la URL HTTPS y la clave pública de Supabase.");
  if (config.supabaseKey.startsWith("sb_secret_"))
    throw new Error("La verificación de usuarios necesita la clave pública de Supabase.");
  if (config.dbMode === "postgres" && !config.databaseUrl)
    throw new Error("Configura DATABASE_URL y ejecuta schema.sql.");
  for (const origin of config.origins) {
    const u = new URL(origin);
    if (u.origin !== origin || !["http:", "https:"].includes(u.protocol))
      throw new Error("CORS_ORIGINS debe contener orígenes sin rutas.");
  }
  return config;
}

function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function encryptToken(token, hexKey) {
  if (typeof token !== "string" || !token || !/^[a-f0-9]{64}$/i.test(hexKey || ""))
    throw new Error("Token o clave de cifrado inválido.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(hexKey, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
function decryptToken(envelope, hexKey) {
  const [version, iv, tag, encrypted, extra] = String(envelope || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra)
    throw new Error("Token sin cifrar o inválido.");
  const cipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(hexKey, "hex"),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    cipher.update(Buffer.from(encrypted, "base64url")),
    cipher.final(),
  ]).toString("utf8");
}
function validateCompany(company, now = new Date()) {
  if (!company) fail(404, "COMPANY_NOT_FOUND", "No se encontró la empresa o no tienes acceso.");
  const plan = PLANS[company.plan_actual];
  if (!plan) fail(403, "INVALID_PLAN", "El plan de WhatsApp no está configurado.");
  if (company.status_pago !== "ACTIVO")
    fail(403, "SUSPENDED", "El envío de WhatsApp está suspendido. Renueva tu suscripción.");
  if (company.plan_actual === "TRIAL") {
    const start = Date.parse(company.trial_started_at),
      end = Date.parse(company.trial_ends_at);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > +now ||
      Math.min(end, start + 7 * 86400000) <= +now
    ) {
      fail(403, "TRIAL_EXPIRED", "Tu prueba de 7 días ha finalizado. Actualiza tu plan.");
    }
    if (company.whatsapp_acceso_aprobado !== true)
      fail(403, "TRIAL_REVIEW", "Tu acceso de prueba a WhatsApp está en proceso de revisión");
  } else if (
    !Number.isFinite(Date.parse(company.subscription_ends_at)) ||
    Date.parse(company.subscription_ends_at) <= +now
  ) {
    fail(
      403,
      "SUBSCRIPTION_EXPIRED",
      "La suscripción venció. Renueva tu plan para enviar recordatorios.",
    );
  }
  if (Number(company.limite_mensajes) !== plan.limit)
    fail(403, "INVALID_QUOTA", "El límite del plan no está configurado correctamente.");
  return plan;
}
function quotaError(plan) {
  return new HttpError(
    403,
    "MESSAGE_LIMIT",
    plan === "TRIAL"
      ? "Límite de 35 recordatorios de prueba alcanzado. Por favor, actualiza tu plan"
      : "Límite de recordatorios mensuales alcanzado. Por favor, actualiza tu plan",
  );
}
function periodFor(company, now = new Date()) {
  // TRIAL no se reinicia al cambiar de mes. Planes pagados: mes calendario del negocio.
  if (company.plan_actual === "TRIAL") return "TRIAL";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.timezone || "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}
function normalizePhone(value) {
  if (typeof value !== "string" || !/^\+?[1-9][0-9 ()-]{6,24}$/.test(value))
    fail(400, "INVALID_PHONE", "Usa un teléfono internacional; en México, +52 y los 10 dígitos.");
  const digits = value.replace(/\D/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(digits))
    fail(400, "INVALID_PHONE", "El teléfono debe tener entre 7 y 15 dígitos.");
  return digits;
}
function validateSend(body, idempotencyKey) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail(400, "INVALID_BODY", "Se requiere un objeto JSON.");
  const { companyId, phone, patientName, date, time } = body;
  if (
    body.notificationKind !== undefined &&
    !["confirmation", "reminder"].includes(body.notificationKind)
  )
    fail(400, "INVALID_NOTIFICATION", "Tipo de mensaje inválido.");
  if (body.reservationId !== undefined && !UUID.test(body.reservationId || ""))
    fail(400, "INVALID_RESERVATION", "reservationId no válido.");
  if (typeof companyId !== "string" || !UUID.test(companyId))
    fail(400, "INVALID_COMPANY", "companyId debe ser un UUID válido.");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey))
    fail(400, "IDEMPOTENCY_REQUIRED", "Envía la cabecera Idempotency-Key (8 a 128 caracteres).");
  if (
    typeof patientName !== "string" ||
    patientName.trim().length < 2 ||
    patientName.trim().length > 100 ||
    /[\u0000-\u001f\u007f]/.test(patientName)
  )
    fail(400, "INVALID_NAME", "patientName debe contener entre 2 y 100 caracteres.");
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    fail(400, "INVALID_DATE", "date debe ser una fecha válida YYYY-MM-DD.");
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    fail(400, "INVALID_TIME", "time debe tener formato HH:mm de 24 horas.");
  return {
    companyId: companyId.toLowerCase(),
    phone: normalizePhone(phone),
    patientName: patientName.trim(),
    date,
    time,
    idempotencyKey,
    ...(body.reservationId ? { reservationId: body.reservationId } : {}),
    ...(body.notificationKind ? { notificationKind: body.notificationKind } : {}),
  };
}
function fingerprint(input) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        input.companyId,
        input.phone,
        input.patientName,
        input.date,
        input.time,
        ...(input.reservationId ? [input.reservationId] : []),
        ...(input.notificationKind ? [input.notificationKind] : []),
      ]),
    )
    .digest("hex");
}
function buttonPayload(action, requestId, secret) {
  const value = `r1:${action}:${requestId}`;
  return `${value}:${crypto.createHmac("sha256", secret).update(value).digest("base64url")}`;
}
function parseButtonPayload(payload, secret) {
  if (typeof payload !== "string") return null;
  const [version, action, id, signature, extra] = payload.split(":");
  if (
    version !== "r1" ||
    !["confirm", "cancel", "reschedule"].includes(action) ||
    !UUID.test(id || "") ||
    extra
  )
    return null;
  return equalSecret(payload, buttonPayload(action, id, secret)) ? { action, requestId: id } : null;
}
function templatePayload(input, requestId, config) {
  const actions =
    config.buttonCount === 3 ? ["confirm", "reschedule", "cancel"] : ["confirm", "cancel"];
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.phone,
    type: "template",
    template: {
      name:
        input.notificationKind === "confirmation"
          ? config.confirmationTemplateName
          : config.templateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [input.patientName, input.date, input.time].map((text) => ({
            type: "text",
            text,
          })),
        },
        ...actions.map((action, index) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [
            { type: "payload", payload: buttonPayload(action, requestId, config.buttonSecret) },
          ],
        })),
      ],
    },
  };
}
function verifyWebhook(rawBody, signature, appSecret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !/^sha256=[0-9a-f]{64}$/.test(signature)
  )
    return false;
  return equalSecret(
    signature,
    `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`,
  );
}
function extractEvents(body) {
  const result = [];
  if (body?.object !== "whatsapp_business_account") return result;
  for (const entry of Array.isArray(body.entry) ? body.entry : [])
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value,
        phoneId = value?.metadata?.phone_number_id;
      if (change?.field !== "messages" || !/^[0-9]{5,30}$/.test(phoneId || "")) continue;
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        if (
          !["button", "interactive"].includes(message?.type) ||
          typeof message.id !== "string" ||
          message.id.length > 512 ||
          !/^[1-9][0-9]{6,14}$/.test(message.from || "")
        )
          continue;
        const reply = message.button || message.interactive?.button_reply;
        if (!reply) continue;
        result.push({
          id: message.id,
          phoneId,
          from: message.from,
          payload: String(reply.payload || reply.id || "").slice(0, 512),
          text: String(reply.text || reply.title || "").slice(0, 80),
          contextId:
            typeof message.context?.id === "string" ? message.context.id.slice(0, 512) : null,
        });
      }
    }
  return result;
}
function resolveAction(event, secret) {
  const signed = parseButtonPayload(event.payload, secret);
  if (signed) return signed;
  if (event.payload.startsWith("r1:")) return null; // No aceptar una firma alterada mediante fallback.
  const text = (event.text || event.payload).trim().toLocaleLowerCase("es-MX");
  if (!event.contextId || !["confirmar", "cancelar"].includes(text)) return null;
  return { action: text === "confirmar" ? "confirm" : "cancel", contextId: event.contextId };
}

function extractCoexistenceEvents(body, encryptionKey, includeActivity = true) {
  const events = [];
  const list = (value) => (Array.isArray(value) ? value : []);
  if (body?.object !== "whatsapp_business_account") return events;
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of list(entry?.changes)) {
      if (!change || typeof change !== "object") continue;
      const v = change?.value,
        phoneId = v?.metadata?.phone_number_id;
      const wabaId =
        change.field === "account_update" ? v?.waba_info?.waba_id || entry.id : entry.id;
      if (!META_ID.test(wabaId || "")) continue;
      if (
        change.field === "account_update" &&
        ["PARTNER_REMOVED", "ACCOUNT_OFFBOARDED"].includes(v?.event)
      ) {
        const timestamp = Number(entry.time);
        if (Number.isFinite(timestamp) && timestamp > 0)
          events.push({
            id: `account:${sha256(JSON.stringify([wabaId, v.event, timestamp]))}`,
            kind: "disconnect",
            wabaId,
            timestamp,
          });
        continue;
      }
      if (!includeActivity || !META_ID.test(phoneId || "")) continue;
      const activity = (message, source, threadPhone) => {
        if (typeof message?.id !== "string" || message.id.length > 512) return;
        const timestamp = Number(message.timestamp);
        if (
          !Number.isFinite(timestamp) ||
          timestamp < 1 ||
          timestamp * 1000 > Date.now() + 86400000
        )
          return;
        const phone = threadPhone || (source === "mobile" ? message.to : message.from);
        if (!/^[1-9][0-9]{6,14}$/.test(phone || "")) return;
        const content = {
          phone,
          source,
          type: String(message.type || "unknown").slice(0, 30),
          text: String(
            message.text?.body ||
              message.button?.text ||
              message.interactive?.button_reply?.title ||
              "",
          ).slice(0, 4096),
        };
        events.push({
          id: `activity:${sha256(`${wabaId}:${message.id}`)}`,
          kind: "activity",
          wabaId,
          phoneId,
          timestamp,
          encrypted: encryptToken(JSON.stringify(content), encryptionKey),
        });
      };
      if (change.field === "smb_message_echoes")
        for (const m of list(v.message_echoes)) activity(m, "mobile");
      if (change.field === "messages") for (const m of list(v.messages)) activity(m, "incoming");
      if (change.field === "history")
        for (const h of list(v.history)) {
          const declined = list(h?.errors).some((e) => e?.code === 2593109),
            progress = h?.metadata?.progress;
          if (declined || (Number.isInteger(progress) && progress >= 0 && progress <= 100))
            events.push({
              id: `sync:${sha256(JSON.stringify([wabaId, phoneId, "history", declined, h?.metadata]))}`,
              kind: "sync",
              wabaId,
              phoneId,
              syncType: "history",
              state: declined ? "DECLINED" : progress === 100 ? "COMPLETE" : "RECEIVING",
              progress: declined ? null : progress,
            });
          for (const thread of list(h?.threads))
            for (const m of list(thread?.messages)) activity(m, "history", thread.id);
        }
      if (change.field === "smb_app_state_sync" && Array.isArray(v.state_sync))
        events.push({
          id: `sync:${sha256(JSON.stringify([wabaId, phoneId, v.state_sync.map((s) => s?.metadata?.timestamp)]))}`,
          kind: "sync",
          wabaId,
          phoneId,
          syncType: "smb_app_state_sync",
          state: "RECEIVING",
          progress: null,
        });
    }
  }
  return events;
}

async function processCoexistenceEvent(client, event) {
  if (event.kind === "disconnect") {
    await client.query(
      "UPDATE whatsapp_cloud.companies SET connection_state='DISCONNECTED',whatsapp_token_oficial=NULL,template_approved=false,sync_state='{}'::jsonb,connection_checked_at=now() WHERE meta_waba_id=$1 AND connected_at<to_timestamp($2)+interval '1 second'",
      [event.wabaId, event.timestamp],
    );
    return;
  }
  const company = (
    await client.query(
      "SELECT company_id FROM whatsapp_cloud.companies WHERE meta_waba_id=$1 AND whatsapp_phone_id=$2 AND connection_state='CONNECTED' AND coexistence",
      [event.wabaId, event.phoneId],
    )
  ).rows[0];
  if (!company) return;
  if (event.kind === "activity")
    await client.query(
      "INSERT INTO whatsapp_cloud.activity(id,company_id,encrypted_content,occurred_at) VALUES($1,$2,$3,to_timestamp($4)) ON CONFLICT DO NOTHING",
      [event.id, company.company_id, event.encrypted, event.timestamp],
    );
  if (event.kind === "sync") {
    // El progreso puede llegar desordenado. Nunca retroceder de COMPLETE/DECLINED.
    await client.query(
      "UPDATE whatsapp_cloud.companies SET sync_state=jsonb_set(sync_state,ARRAY[$2],coalesce(sync_state->$2,'{}'::jsonb) || $3::jsonb) WHERE company_id=$1 AND coalesce(sync_state->$2->>'state','') NOT IN ('COMPLETE','DECLINED') AND coalesce((sync_state->$2->>'progress')::integer,-1)<=coalesce($4,100)",
      [
        company.company_id,
        event.syncType,
        JSON.stringify({ state: event.state, progress: event.progress }),
        event.progress,
      ],
    );
  }
}

// Adaptador real. Las reservas de cuota y la deduplicación se hacen dentro de
// transacciones PostgreSQL, también si Railway ejecuta varias réplicas.
function createPostgresDb(config, poolOverride) {
  const { Pool } = require("pg");
  const url = new URL(config.databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL inválida.");
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const pool =
    poolOverride ||
    new Pool({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true, ...(config.pgCA ? { ca: config.pgCA } : {}) },
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 8000,
      application_name: "reserva-whatsapp-cloud",
    });
  pool.on("error", () => console.error("[database] Conexión interrumpida."));
  async function tx(callback) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  const db = {
    companies: {
      async isOwner({ company_id, owner_id }) {
        const result = await pool.query(
          "SELECT id FROM public.companies WHERE id=$1 AND owner_id=$2",
          [company_id, owner_id],
        );
        return result.rowCount === 1;
      },
      async findOne({ company_id, owner_id }, client = pool, lock = false) {
        const result = await client.query(
          `SELECT w.*,coalesce(u.sent,0) AS mensajes_enviados_mes FROM whatsapp_cloud.companies w JOIN public.companies c ON c.id=w.company_id LEFT JOIN whatsapp_cloud.usage u ON u.company_id=w.company_id AND u.period=CASE WHEN w.plan_actual='TRIAL' THEN 'TRIAL' ELSE to_char(now() AT TIME ZONE w.timezone,'YYYY-MM') END WHERE w.company_id=$1 AND c.owner_id=$2 ${lock ? "FOR UPDATE OF w" : ""}`,
          [company_id, owner_id],
        );
        return result.rows[0] || null;
      },
      // Administración exclusivamente por el servidor/SQL, nunca una ruta pública.
      async updateOne({ company_id }, { whatsapp_acceso_aprobado }) {
        if (typeof whatsapp_acceso_aprobado !== "boolean") throw new Error("Aprobación inválida.");
        await pool.query(
          "UPDATE whatsapp_cloud.companies SET whatsapp_acceso_aprobado=$2 WHERE company_id=$1",
          [company_id, whatsapp_acceso_aprobado],
        );
      },
    },
    async reserve(input, ownerId, now = new Date()) {
      return tx(async (client) => {
        const company = await db.companies.findOne(
          { company_id: input.companyId, owner_id: ownerId },
          client,
          true,
        );
        validateCompany(company, now);
        if (company.token_expires_at && Date.parse(company.token_expires_at) <= +now)
          fail(
            403,
            "META_TOKEN_EXPIRED",
            "El permiso de Meta expiró. Vuelve a conectar WhatsApp Business.",
          );
        if (company.connection_state && company.connection_state !== "CONNECTED")
          fail(403, "NUMBER_DISCONNECTED", "Vuelve a conectar el número de WhatsApp Business.");
        if (
          !(input.notificationKind === "confirmation"
            ? company.confirmation_template_approved
            : company.template_approved) ||
          !/^[0-9]{5,30}$/.test(company.whatsapp_phone_id || "") ||
          !company.whatsapp_token_oficial
        )
          fail(
            403,
            "META_NOT_CONFIGURED",
            "Configura el número oficial y la plantilla aprobada en Meta.",
          );
        const prior = (
          await client.query(
            "SELECT * FROM whatsapp_cloud.outbox WHERE company_id=$1 AND idempotency_key=$2",
            [input.companyId, input.idempotencyKey],
          )
        ).rows[0];
        if (prior) return replay(prior, input);
        const appointments = await client.query(
          `SELECT r.id,r.starts_at,c.full_name FROM public.reservations r JOIN public.customers c ON c.company_id=r.company_id AND c.id=r.customer_id WHERE r.company_id=$1 AND regexp_replace(c.phone,'[^0-9]','','g')=$2 AND (r.starts_at AT TIME ZONE $3)::date=$4::date AND to_char(r.starts_at AT TIME ZONE $3,'HH24:MI')=$5 AND r.starts_at > $6 AND r.status='confirmed' AND ($7::uuid IS NULL OR r.id=$7) LIMIT 2`,
          [
            input.companyId,
            input.phone,
            company.timezone,
            input.date,
            input.time,
            now,
            input.reservationId || null,
          ],
        );
        if (appointments.rows.length !== 1)
          fail(
            409,
            "APPOINTMENT_AMBIGUOUS",
            "Debe existir una única cita futura activa para ese teléfono, fecha y hora.",
          );
        const consent = await client.query(
          "SELECT 1 FROM whatsapp_cloud.consents WHERE company_id=$1 AND phone=$2 AND opted_in_at IS NOT NULL AND revoked_at IS NULL",
          [input.companyId, input.phone],
        );
        if (!consent.rowCount)
          fail(
            403,
            "CONSENT_REQUIRED",
            "Registra el consentimiento del cliente para recibir recordatorios por WhatsApp.",
          );
        const period = periodFor(company, now);
        await client.query(
          "INSERT INTO whatsapp_cloud.usage(company_id,period) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [input.companyId, period],
        );
        const quota = (
          await client.query(
            "SELECT * FROM whatsapp_cloud.usage WHERE company_id=$1 AND period=$2 FOR UPDATE",
            [input.companyId, period],
          )
        ).rows[0];
        if (quota.sent + quota.reserved >= company.limite_mensajes)
          throw quotaError(company.plan_actual);
        const id = crypto.randomUUID();
        await client.query(
          "UPDATE whatsapp_cloud.usage SET reserved=reserved+1 WHERE company_id=$1 AND period=$2",
          [input.companyId, period],
        );
        await client.query(
          "INSERT INTO whatsapp_cloud.outbox(id,company_id,idempotency_key,fingerprint,reservation_id,phone,phone_id,period,state,reservation_starts_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sending',$9)",
          [
            id,
            input.companyId,
            input.idempotencyKey,
            fingerprint(input),
            appointments.rows[0].id,
            input.phone,
            company.whatsapp_phone_id,
            period,
            appointments.rows[0].starts_at,
          ],
        );
        return { id, company, period };
      });
    },
    async finish(id, state, messageId = null) {
      await tx(async (client) => {
        const owner = (
          await client.query("SELECT company_id FROM whatsapp_cloud.outbox WHERE id=$1", [id])
        ).rows[0];
        if (!owner) return;
        // Mismo orden de bloqueo que reserve(): empresa -> outbox -> cuota.
        await client.query(
          "SELECT company_id FROM whatsapp_cloud.companies WHERE company_id=$1 FOR UPDATE",
          [owner.company_id],
        );
        const row = (
          await client.query("SELECT * FROM whatsapp_cloud.outbox WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!row || !["sending", "unknown"].includes(row.state)) return;
        if (state === "sent" || state === "failed")
          await client.query(
            "UPDATE whatsapp_cloud.usage SET reserved=reserved-1,sent=sent+$3 WHERE company_id=$1 AND period=$2",
            [row.company_id, row.period, state === "sent" ? 1 : 0],
          );
        await client.query(
          "UPDATE whatsapp_cloud.outbox SET state=$2,meta_message_id=coalesce($3,meta_message_id),updated_at=now() WHERE id=$1",
          [id, state, messageId],
        );
        if (state === "sent")
          await client.query(
            "UPDATE whatsapp_cloud.companies SET mensajes_enviados_mes=(SELECT sent FROM whatsapp_cloud.usage WHERE company_id=$1 AND period=$2), usage_period=$2 WHERE company_id=$1 AND CASE WHEN plan_actual='TRIAL' THEN 'TRIAL' ELSE to_char(now() AT TIME ZONE timezone,'YYYY-MM') END=$2",
            [row.company_id, row.period],
          );
      });
    },
    async enqueue(events) {
      await tx(async (client) => {
        for (const event of events)
          await client.query(
            "INSERT INTO whatsapp_cloud.inbox(id,event) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
            [event.id, JSON.stringify(event)],
          );
      });
    },
    async processNext(secret) {
      // Una transacción pequeña: no hay llamadas a Meta dentro del worker.
      return tx(async (client) => {
        const item = (
          await client.query(
            "SELECT * FROM whatsapp_cloud.inbox WHERE state='pending' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
          )
        ).rows[0];
        if (!item) return false;
        await client.query("SAVEPOINT process_event");
        try {
          const event = item.event;
          if (event.kind) await processCoexistenceEvent(client, event);
          const action = event.kind ? null : resolveAction(event, secret);
          if (action) {
            const selector = action.requestId ? "o.id=$3::uuid" : "o.meta_message_id=$3";
            const match = (
              await client.query(
                `SELECT o.* FROM whatsapp_cloud.outbox o JOIN whatsapp_cloud.companies w ON w.company_id=o.company_id AND w.whatsapp_phone_id=o.phone_id WHERE o.phone_id=$1 AND o.phone=$2 AND ${selector} AND o.state IN ('sent','unknown') FOR UPDATE OF o`,
                [event.phoneId, event.from, action.requestId || action.contextId],
              )
            ).rows[0];
            if (match)
              await client.query(
                "UPDATE public.reservations SET status=$3,customer_response=$5,customer_responded_at=now() WHERE company_id=$1 AND id=$2 AND status='confirmed' AND starts_at>now() AND (starts_at=$4 OR $4::timestamptz IS NULL)",
                [
                  match.company_id,
                  match.reservation_id,
                  action.action === "cancel" ? "cancelled" : "confirmed",
                  match.reservation_starts_at,
                  action.action === "reschedule" ? "reschedule_requested" : "confirmed",
                ],
              );
          }
          await client.query(
            "UPDATE whatsapp_cloud.inbox SET state='done',processed_at=now() WHERE id=$1",
            [item.id],
          );
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT process_event");
          await client.query(
            "UPDATE whatsapp_cloud.inbox SET attempts=attempts+1,state=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,available_at=now()+interval '30 seconds' WHERE id=$1",
            [item.id],
          );
        }
        return true;
      });
    },
    async health() {
      await pool.query("SELECT company_id FROM whatsapp_cloud.companies LIMIT 0");
      await pool.query("SELECT id FROM whatsapp_cloud.onboarding_sessions LIMIT 0");
      await pool.query("SELECT company_id FROM whatsapp_cloud.automation_keys LIMIT 0");
      await pool.query("SELECT id FROM whatsapp_cloud.jobs LIMIT 0");
    },
    async close() {
      await pool.end();
    },
  };
  db.onboarding = createPostgresOnboarding(pool, tx);
  db.automation = createPostgresAutomation(pool, tx);
  db.native = createNativeAutomation({
    pool,
    tx,
    HttpError,
    encryptToken,
    decryptToken,
    encryptionKey: config.encryptionKey,
    validateAutomation,
    importBooking: (companyId, input, client) => db.automation.booking(companyId, input, client),
  });
  return db;
}
// El nonce une cada ventana de Meta a un usuario, empresa y sesión de 10 minutos.
// El código OAuth solo se intercambia una vez. Nunca se guarda en texto plano.
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const META_ID = /^[0-9]{5,30}$/;
function signupProof(body) {
  if (
    !body ||
    !UUID.test(body.companyId || "") ||
    !UUID.test(body.sessionId || "") ||
    !/^[a-f0-9]{64}$/.test(body.nonce || "")
  )
    fail(400, "INVALID_SIGNUP", "La sesión de conexión no es válida. Inicia de nuevo.");
  return { companyId: body.companyId, sessionId: body.sessionId, nonceHash: sha256(body.nonce) };
}
function createPostgresOnboarding(pool, tx) {
  const checkClaim = (rows) => {
    if (!rows[0])
      fail(409, "SIGNUP_EXPIRED", "La conexión expiró o ya se utilizó. Inicia de nuevo.");
    return rows[0];
  };
  return {
    async start(companyId, ownerId) {
      const nonce = crypto.randomBytes(32).toString("hex"),
        id = crypto.randomUUID();
      await tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [companyId]);
        const recent = await client.query(
          "SELECT 1 FROM whatsapp_cloud.onboarding_sessions WHERE company_id=$1 AND (created_at>now()-interval '30 seconds' OR (state IN ('exchanging','completing') AND expires_at>now())) LIMIT 1",
          [companyId],
        );
        if (recent.rowCount)
          fail(429, "SIGNUP_IN_PROGRESS", "Espera antes de iniciar otra conexión.");
        await client.query(
          "INSERT INTO whatsapp_cloud.companies(company_id) VALUES($1) ON CONFLICT DO NOTHING",
          [companyId],
        );
        await client.query(
          "UPDATE whatsapp_cloud.onboarding_sessions SET state='cancelled',encrypted_token=NULL WHERE company_id=$1 AND state IN ('pending','token_ready')",
          [companyId],
        );
        await client.query(
          "INSERT INTO whatsapp_cloud.onboarding_sessions(id,company_id,owner_id,nonce_hash,state) VALUES($1,$2,$3,$4,'pending')",
          [id, companyId, ownerId, sha256(nonce)],
        );
      });
      return { sessionId: id, nonce };
    },
    async exchange(proof, ownerId, codeHash) {
      try {
        return checkClaim(
          (
            await pool.query(
              "UPDATE whatsapp_cloud.onboarding_sessions SET state='exchanging',code_hash=$5 WHERE id=$1 AND company_id=$2 AND owner_id=$3 AND nonce_hash=$4 AND state='pending' AND expires_at>now() RETURNING id",
              [proof.sessionId, proof.companyId, ownerId, proof.nonceHash, codeHash],
            )
          ).rows,
        );
      } catch (error) {
        if (error.code === "23505")
          fail(409, "CODE_ALREADY_USED", "Este código de Meta ya se utilizó.");
        throw error;
      }
    },
    async saveToken(id, token) {
      checkClaim(
        (
          await pool.query(
            "UPDATE whatsapp_cloud.onboarding_sessions SET state='token_ready',encrypted_token=$2 WHERE id=$1 AND state='exchanging' AND expires_at>now() RETURNING id",
            [id, token],
          )
        ).rows,
      );
    },
    async complete(proof, ownerId) {
      return checkClaim(
        (
          await pool.query(
            "UPDATE whatsapp_cloud.onboarding_sessions SET state='completing' WHERE id=$1 AND company_id=$2 AND owner_id=$3 AND nonce_hash=$4 AND state='token_ready' AND expires_at>now() RETURNING encrypted_token",
            [proof.sessionId, proof.companyId, ownerId, proof.nonceHash],
          )
        ).rows,
      );
    },
    async saveConnection(proof, connection) {
      try {
        await tx(async (client) => {
          const old = (
            await client.query(
              "SELECT * FROM whatsapp_cloud.companies WHERE company_id=$1 FOR UPDATE",
              [proof.companyId],
            )
          ).rows[0];
          if (
            old.connection_state === "CONNECTED" &&
            (old.whatsapp_phone_id !== connection.phoneId || old.meta_waba_id !== connection.wabaId)
          )
            fail(
              409,
              "NUMBER_ALREADY_CONNECTED",
              "Desconecta primero el número actual antes de cambiarlo.",
            );
          const sameNumber =
            old.whatsapp_phone_id === connection.phoneId && old.meta_waba_id === connection.wabaId;
          await client.query(
            "UPDATE whatsapp_cloud.companies SET whatsapp_token_oficial=$2,whatsapp_phone_id=$3,meta_waba_id=$4,connection_state='CONNECTED',coexistence=true,display_phone=$5,verified_name=$6,token_expires_at=$7,connected_at=now(),connection_checked_at=now(),template_approved=false,template_status='NOT_CHECKED',sync_state=CASE WHEN $8 THEN sync_state ELSE '{}'::jsonb END WHERE company_id=$1",
            [
              proof.companyId,
              connection.token,
              connection.phoneId,
              connection.wabaId,
              connection.displayPhone,
              connection.name,
              connection.expiresAt,
              sameNumber,
            ],
          );
          checkClaim(
            (
              await client.query(
                "UPDATE whatsapp_cloud.onboarding_sessions SET state='completed',encrypted_token=NULL WHERE id=$1 AND state='completing' RETURNING id",
                [proof.sessionId],
              )
            ).rows,
          );
        });
      } catch (error) {
        if (error.code === "23505")
          fail(
            409,
            "ASSET_ALREADY_LINKED",
            "Este número o cuenta ya pertenece a otra empresa en esta plataforma.",
          );
        throw error;
      }
    },
    async saveDirectConnection(companyId, ownerId, connection, checked) {
      try {
        await tx(async (client) => {
          await client.query(
            `INSERT INTO whatsapp_cloud.companies(company_id)
             SELECT id FROM public.companies WHERE id=$1 AND owner_id=$2
             ON CONFLICT DO NOTHING`,
            [companyId, ownerId],
          );
          const saved = await client.query(
            `UPDATE whatsapp_cloud.companies w SET
               whatsapp_token_oficial=$3,whatsapp_phone_id=$4,meta_waba_id=$5,
               display_phone=$6,verified_name=$7,token_expires_at=$8,
               connection_state='CONNECTED',coexistence=false,sync_state='{}'::jsonb,
               connected_at=now(),connection_checked_at=now(),
               template_status=$9,template_approved=($9='APPROVED'),template_button_count=$10,
               confirmation_template_status=$11,confirmation_template_approved=($11='APPROVED'),confirmation_button_count=$12
             FROM public.companies c WHERE w.company_id=$1 AND c.id=w.company_id AND c.owner_id=$2
               AND (w.connection_state IS DISTINCT FROM 'CONNECTED'
                 OR (NOT w.coexistence AND w.whatsapp_phone_id=$4 AND w.meta_waba_id=$5))`,
            [
              companyId,
              ownerId,
              connection.token,
              connection.phoneId,
              connection.wabaId,
              connection.displayPhone,
              connection.name,
              connection.expiresAt,
              checked.templateStatus,
              checked.buttonCount,
              checked.confirmationStatus,
              checked.confirmationButtonCount,
            ],
          );
          if (!saved.rowCount)
            fail(
              409,
              "NUMBER_ALREADY_CONNECTED",
              "Desconecta primero el número actual antes de cambiarlo.",
            );
        });
      } catch (error) {
        if (error.code === "23505")
          fail(
            409,
            "ASSET_ALREADY_LINKED",
            "Este número o cuenta ya pertenece a otra empresa en esta plataforma.",
          );
        throw error;
      }
    },
    async fail(id) {
      await pool.query(
        "UPDATE whatsapp_cloud.onboarding_sessions SET state='failed',encrypted_token=NULL WHERE id=$1 AND state<>'completed'",
        [id],
      );
    },
    async cancel(proof, ownerId) {
      await pool.query(
        "UPDATE whatsapp_cloud.onboarding_sessions SET state='cancelled',encrypted_token=NULL WHERE id=$1 AND company_id=$2 AND owner_id=$3 AND nonce_hash=$4 AND state IN ('pending','exchanging','token_ready','completing')",
        [proof.sessionId, proof.companyId, ownerId, proof.nonceHash],
      );
    },
    async claimSync(companyId, phoneId, kind) {
      return (
        (
          await pool.query(
            "UPDATE whatsapp_cloud.companies SET sync_state=jsonb_set(sync_state,ARRAY[$3],'{\"state\":\"REQUESTING\"}'::jsonb) WHERE company_id=$1 AND whatsapp_phone_id=$2 AND connection_state='CONNECTED' AND NOT sync_state ? $3 RETURNING company_id",
            [companyId, phoneId, kind],
          )
        ).rowCount === 1
      );
    },
    async syncResult(companyId, phoneId, kind, result) {
      // El webhook puede llegar antes de que termine el POST. No sobrescribir su progreso.
      await pool.query(
        "UPDATE whatsapp_cloud.companies SET sync_state=jsonb_set(sync_state,ARRAY[$3],coalesce(sync_state->$3,'{}'::jsonb) || $4::jsonb) WHERE company_id=$1 AND whatsapp_phone_id=$2 AND sync_state->$3->>'state'='REQUESTING'",
        [companyId, phoneId, kind, JSON.stringify(result)],
      );
    },
    async checked(
      companyId,
      phoneId,
      {
        connected,
        templateStatus,
        confirmationStatus = "NOT_CHECKED",
        buttonCount = 2,
        confirmationButtonCount = 3,
      },
    ) {
      await pool.query(
        "UPDATE whatsapp_cloud.companies SET connection_state=CASE WHEN $3 THEN 'CONNECTED' ELSE 'DISCONNECTED' END,template_status=$4,template_approved=($4='APPROVED'),confirmation_template_status=$5,confirmation_template_approved=($5='APPROVED'),template_button_count=$6,confirmation_button_count=$7,connection_checked_at=now() WHERE company_id=$1 AND whatsapp_phone_id=$2 AND connection_state='CONNECTED'",
        [
          companyId,
          phoneId,
          connected,
          templateStatus,
          confirmationStatus,
          buttonCount,
          confirmationButtonCount,
        ],
      );
    },
    async disconnect(companyId) {
      await pool.query(
        "UPDATE whatsapp_cloud.companies SET connection_state='DISCONNECTED',whatsapp_token_oficial=NULL,template_approved=false,connection_checked_at=now() WHERE company_id=$1",
        [companyId],
      );
      await pool.query(
        "UPDATE whatsapp_cloud.onboarding_sessions SET state='cancelled',encrypted_token=NULL WHERE company_id=$1 AND state<>'completed'",
        [companyId],
      );
    },
    async activity(companyId) {
      return (
        await pool.query(
          "SELECT encrypted_content,occurred_at FROM whatsapp_cloud.activity WHERE company_id=$1 AND received_at>now()-interval '7 days' ORDER BY occurred_at DESC LIMIT 25",
          [companyId],
        )
      ).rows;
    },
    async cleanup() {
      await pool.query(
        "UPDATE whatsapp_cloud.onboarding_sessions SET encrypted_token=NULL,state='failed' WHERE expires_at<=now() AND state IN ('pending','exchanging','token_ready','completing')",
      );
      await pool.query(
        "DELETE FROM whatsapp_cloud.activity WHERE received_at<now()-interval '7 days'",
      );
      await pool.query(
        "UPDATE whatsapp_cloud.inbox SET event='{\"kind\":\"purged\"}'::jsonb,state='done' WHERE created_at<now()-interval '7 days' AND event ? 'encrypted'",
      );
    },
  };
}

// Cliente Graph cerrado a dominios/rutas oficiales. Sin logs de códigos, tokens o cuerpos.
function createMetaOnboarding(config, http, logger = console) {
  const base = `https://graph.facebook.com/${config.graphVersion}`;
  const options = (token) => ({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 10000,
    maxRedirects: 0,
    maxContentLength: 1048576,
  });
  async function graph(method, route, token, data, params) {
    return (
      await http[method](
        `${base}/${route}`,
        ...(method === "post"
          ? [data, { ...options(token), params }]
          : [{ ...options(token), params }]),
      )
    ).data;
  }
  return {
    async exchange(code, redirectUri) {
      const params = {
        client_id: config.appId,
        client_secret: config.appSecret,
        code,
      };
      let data;
      const redirects = [
        { mode: "embedded", uri: undefined },
        ...(redirectUri ? [{ mode: "dashboard", uri: redirectUri }] : []),
        { mode: "sdk", uri: META_SDK_REDIRECT_URI },
      ];
      for (let attempt = 0; attempt < redirects.length; attempt++) {
        const { mode, uri } = redirects[attempt];
        try {
          data = await graph("get", "oauth/access_token", null, null, {
            ...params,
            ...(uri ? { redirect_uri: uri } : {}),
          });
          break;
        } catch (error) {
          const rejection = error.response?.data?.error;
          const redirectRejected =
            (rejection?.code === 100 && rejection.error_subcode === 36008) ||
            (rejection?.code === 191 &&
              typeof rejection.message === "string" &&
              /\bredirect[ _-]+ur[il]\b/i.test(rejection.message));
          if (!redirectRejected) throw error;
          const reference = rejection.code === 100 ? "100/36008" : "191";
          logger.warn?.(`[whatsapp:oauth] Meta rechazó la URL de retorno (${mode}, ${reference}).`);
          // Meta rechazó la URI antes de entregar un token. Los demás errores
          // (incluidos timeouts o códigos usados) no se reintentan.
          if (attempt === redirects.length - 1)
            fail(
              502,
              "META_REDIRECT_MISMATCH",
              `Meta rechazó la URL de retorno de WhatsApp. Vuelve a preparar la conexión desde el dominio autorizado. Referencia de Meta: ${reference}.`,
            );
        }
      }
      if (typeof data?.access_token !== "string" || data.access_token.length < 20)
        fail(
          502,
          "META_TOKEN_INVALID",
          "Meta no devolvió una credencial válida. Vuelve a conectar.",
        );
      return data.access_token;
    },
    async assets(token, wabaId, phoneId, { direct = false } = {}) {
      const debug = await graph("get", "debug_token", `${config.appId}|${config.appSecret}`, null, {
        input_token: token,
      });
      if (
        debug?.data?.is_valid !== true ||
        String(debug.data.app_id) !== config.appId ||
        (debug.data.expires_at && debug.data.expires_at * 1000 <= Date.now())
      )
        fail(
          403,
          "INVALID_META_GRANT",
          "El permiso de Meta no pertenece a esta aplicación o expiró.",
        );
      if (
        direct &&
        !["whatsapp_business_management", "whatsapp_business_messaging"].every((scope) =>
          debug.data.scopes?.includes(scope),
        )
      )
        fail(
          403,
          "MISSING_META_PERMISSIONS",
          "El token debe incluir los permisos de administración y envío de WhatsApp.",
        );
      const phones = await graph("get", `${wabaId}/phone_numbers`, token, null, {
        fields: "id,display_phone_number,verified_name",
        limit: 100,
      });
      // En Coexistencia Meta puede devolver solo waba_id. Resolver en el servidor,
      // sin adivinar un número si la cuenta contiene varios activos.
      if (!phoneId) {
        const candidates = [];
        for (const p of phones?.data || []) {
          const state = await graph("get", p.id, token, null, {
            fields: "is_on_biz_app,platform_type",
          });
          if (state.is_on_biz_app === true && state.platform_type === "CLOUD_API")
            candidates.push(p.id);
        }
        if (candidates.length !== 1)
          fail(
            409,
            "PHONE_SELECTION_REQUIRED",
            "Meta debe devolver un número concreto o una sola conexión de Coexistencia en esta cuenta.",
          );
        phoneId = candidates[0];
      }
      const phone = phones?.data?.find((p) => p.id === phoneId);
      if (!phone)
        fail(403, "PHONE_NOT_OWNED", "El número no pertenece a la cuenta de WhatsApp autorizada.");
      if (!direct) {
        const state = await graph("get", phoneId, token, null, {
          fields: "is_on_biz_app,platform_type",
        });
        if (state?.is_on_biz_app !== true || state?.platform_type !== "CLOUD_API")
          fail(
            409,
            "COEXISTENCE_REQUIRED",
            "Meta no habilitó Coexistencia para este número. No se realizará una migración que desconecte tu móvil.",
          );
      }
      return {
        phoneId,
        wabaId,
        displayPhone: String(phone.display_phone_number || "").slice(0, 40),
        name: String(phone.verified_name || "").slice(0, 150),
        expiresAt: debug.data.expires_at
          ? new Date(debug.data.expires_at * 1000).toISOString()
          : null,
      };
    },
    async subscribe(token, wabaId) {
      const result = await graph("post", `${wabaId}/subscribed_apps`, token, {});
      if (result?.success !== true)
        fail(
          502,
          "META_SUBSCRIBE_FAILED",
          "No se pudo suscribir el número al webhook del servicio.",
        );
    },
    async sync(token, phoneId, kind) {
      const result = await graph("post", `${phoneId}/smb_app_data`, token, {
        messaging_product: "whatsapp",
        sync_type: kind,
      });
      if (typeof result?.request_id !== "string")
        throw new Error("Respuesta de sincronización sin ID.");
      return result.request_id.slice(0, 200);
    },
    async check(token, wabaId, phoneId, { direct = false } = {}) {
      const state = await graph("get", phoneId, token, null, {
        fields: direct ? "status,platform_type" : "is_on_biz_app,platform_type",
      });
      if (
        state?.platform_type !== "CLOUD_API" ||
        (direct ? state.status !== "CONNECTED" : state.is_on_biz_app !== true)
      )
        return { connected: false, templateStatus: "NOT_CHECKED" };
      async function inspect(name) {
        const templates = await graph("get", `${wabaId}/message_templates`, token, null, {
          name,
          fields: "name,language,status,category,components",
          limit: 100,
        });
        const t = templates?.data?.find(
          (item) => item.name === name && item.language === config.templateLanguage,
        );
        let status = t?.status || "MISSING";
        const buttons = t?.components?.find((c) => c.type === "BUTTONS")?.buttons || [];
        if (status === "APPROVED") {
          const text = t.components?.find((c) => c.type === "BODY")?.text || "";
          const expected =
            buttons.length === 3
              ? ["Confirmar", "Cambiar cita", "Cancelar"]
              : ["Confirmar", "Cancelar"];
          if (
            t.category !== "UTILITY" ||
            !["{{1}}", "{{2}}", "{{3}}"].every((x) => text.includes(x)) ||
            /\{\{(?:[4-9]|[1-9][0-9]+)\}\}/.test(text) ||
            ![2, 3].includes(buttons.length) ||
            !expected.every(
              (label, i) => buttons[i]?.type === "QUICK_REPLY" && buttons[i]?.text === label,
            )
          )
            status = "INCOMPATIBLE";
        }
        return { status, count: buttons.length === 3 ? 3 : 2 };
      }
      const reminder = await inspect(config.templateName);
      const confirmation = await inspect(config.confirmationTemplateName || "reserva_confirmacion");
      return {
        connected: true,
        templateStatus: reminder.status,
        buttonCount: reminder.count,
        confirmationStatus: confirmation.status,
        confirmationButtonCount: confirmation.count,
      };
    },
    async submitTemplate(token, wabaId, kind = "reminder") {
      return graph("post", `${wabaId}/message_templates`, token, {
        name: kind === "confirmation" ? config.confirmationTemplateName : config.templateName,
        language: config.templateLanguage,
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text:
              kind === "confirmation"
                ? "Hola {{1}}, tu cita quedó agendada para el {{2}} a las {{3}}. Puedes confirmar, solicitar un cambio o cancelar con los botones."
                : "Hola {{1}}, te recordamos tu cita del {{2}} a las {{3}}. Puedes confirmar, solicitar un cambio o cancelar con los botones.",
            example: { body_text: [["Ana", "15/12/2026", "10:00"]] },
          },
          {
            type: "BUTTONS",
            buttons: [
              { type: "QUICK_REPLY", text: "Confirmar" },
              { type: "QUICK_REPLY", text: "Cambiar cita" },
              { type: "QUICK_REPLY", text: "Cancelar" },
            ],
          },
        ],
      });
    },
  };
}

function installOnboardingRoutes(app, { config, db, http, authenticate, logger }) {
  const meta = createMetaOnboarding(config, http, logger);
  async function owned(req, companyId) {
    const ownerId = await authenticate(req.get("Authorization"));
    if (!UUID.test(companyId || "")) fail(400, "INVALID_COMPANY", "Empresa no válida.");
    if (!(await db.companies.isOwner({ company_id: companyId, owner_id: ownerId })))
      fail(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    return ownerId;
  }
  const signupAvailable = (companyId) =>
    Boolean(config.signupEnabled) ||
    (config.signupTestCompanyIds || []).includes(companyId?.toLowerCase());
  const enabled = (companyId) => {
    if (!signupAvailable(companyId))
      fail(
        503,
        "SIGNUP_NOT_ENABLED",
        "El administrador debe completar la configuración y revisión de Embedded Signup en Meta.",
      );
  };
  function signupRedirectUri(value) {
    if (value === undefined) return undefined;
    let url;
    try {
      url = new URL(value);
    } catch {
      fail(400, "INVALID_REDIRECT_URI", "La URL de devolución de Meta no es válida.");
    }
    if (
      typeof value !== "string" ||
      !config.origins.includes(url.origin) ||
      value !== `${url.origin}/dashboard/whatsapp`
    )
      fail(400, "INVALID_REDIRECT_URI", "La URL de devolución de Meta no está autorizada.");
    return value;
  }
  const wrap = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      if (error.isAxiosError || error.response) {
        const metaError = error.response?.data?.error;
        // Solo códigos numéricos; nunca reenviar mensajes crudos, tokens o la URL de Axios.
        const reference = [metaError?.code, metaError?.error_subcode]
          .filter((value) => Number.isSafeInteger(value) && value >= 0)
          .join("/");
        return next(
          new HttpError(
            502,
            "META_UNAVAILABLE",
            "Meta no pudo completar la operación. Revisa los permisos, la cuenta y la configuración de la aplicación." +
              (reference ? ` Referencia de Meta: ${reference}.` : ""),
          ),
        );
      }
      next(error);
    }
  };
  async function sync(company, token) {
    for (const kind of ["smb_app_state_sync", "history"]) {
      if (!(await db.onboarding.claimSync(company.company_id, company.whatsapp_phone_id, kind)))
        continue;
      let result;
      try {
        result = {
          state: "REQUESTED",
          requestId: await meta.sync(token, company.whatsapp_phone_id, kind),
        };
      } catch (error) {
        result = {
          state:
            error.response?.status >= 400 && error.response.status < 500 ? "FAILED" : "UNKNOWN",
        };
      }
      await db.onboarding.syncResult(company.company_id, company.whatsapp_phone_id, kind, result);
    }
  }
  async function check(company, token) {
    try {
      const result = await meta.check(token, company.meta_waba_id, company.whatsapp_phone_id, {
        direct: company.coexistence !== true,
      });
      await db.onboarding.checked(company.company_id, company.whatsapp_phone_id, result);
      return result;
    } catch (error) {
      if (error.response?.data?.error?.code === 190)
        await db.onboarding.disconnect(company.company_id);
      throw error;
    }
  }
  app.get(
    "/api/whatsapp/onboarding/config/:companyId",
    wrap(async (req, res) => {
      await owned(req, req.params.companyId);
      const available = signupAvailable(req.params.companyId);
      res.json({
        enabled: available,
        testing: available && !config.signupEnabled,
        appId: available ? config.appId : null,
        configId: available ? config.signupConfigId : null,
        version: config.graphVersion,
        mode: "coexistence",
        message: available
          ? config.signupEnabled
            ? "Conecta desde el asistente oficial de Meta."
            : "Prueba privada: utiliza la cuenta administradora de la app de Meta. Meta comprobará si permite conectar este número. La verificación comercial y el acceso de clientes siguen pendientes."
          : "El alta está preparada. Falta habilitar la configuración de Embedded Signup y sus permisos en Meta.",
      });
    }),
  );
  app.post(
    "/api/whatsapp/onboarding/start",
    wrap(async (req, res) => {
      const ownerId = await owned(req, req.body?.companyId);
      enabled(req.body.companyId);
      res
        .status(201)
        .json({ ...(await db.onboarding.start(req.body.companyId, ownerId)), expiresIn: 600 });
    }),
  );
  app.post(
    "/api/whatsapp/onboarding/exchange",
    wrap(async (req, res) => {
      const proof = signupProof(req.body),
        ownerId = await owned(req, proof.companyId);
      enabled(proof.companyId);
      const code = req.body.code;
      if (typeof code !== "string" || code.length < 10 || code.length > 4096)
        fail(400, "INVALID_CODE", "Falta el código de autorización de Meta.");
      const redirectUri = signupRedirectUri(req.body.redirectUri);
      await db.onboarding.exchange(proof, ownerId, sha256(code));
      try {
        const token = await meta.exchange(code, redirectUri);
        await db.onboarding.saveToken(proof.sessionId, encryptToken(token, config.encryptionKey));
      } catch (error) {
        await db.onboarding.fail(proof.sessionId);
        throw error;
      }
      res.json({ exchanged: true });
    }),
  );
  app.post(
    "/api/whatsapp/onboarding/complete",
    wrap(async (req, res) => {
      const proof = signupProof(req.body),
        ownerId = await owned(req, proof.companyId);
      enabled(proof.companyId);
      if (
        !META_ID.test(req.body.wabaId || "") ||
        (req.body.phoneId !== undefined && !META_ID.test(req.body.phoneId || ""))
      )
        fail(400, "INVALID_ASSETS", "Selecciona un número y una cuenta de WhatsApp en Meta.");
      if (req.body.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")
        fail(
          409,
          "COEXISTENCE_REQUIRED",
          "Completa la opción para mantener WhatsApp Business en el móvil.",
        );
      const session = await db.onboarding.complete(proof, ownerId);
      try {
        const token = decryptToken(session.encrypted_token, config.encryptionKey);
        const connection = await meta.assets(token, req.body.wabaId, req.body.phoneId);
        await meta.subscribe(token, connection.wabaId);
        await db.onboarding.saveConnection(proof, {
          ...connection,
          token: session.encrypted_token,
        });
        const company = await db.companies.findOne({
          company_id: proof.companyId,
          owner_id: ownerId,
        });
        // Sync se solicita una sola vez; un timeout nunca dispara duplicados.
        await sync(company, token);
        let checked = false;
        try {
          await check(company, token);
          checked = true;
        } catch {
          /* Se puede comprobar desde Actualizar. */
        }
        res.json({ connected: true, coexistence: true, checked });
      } catch (error) {
        await db.onboarding.fail(proof.sessionId);
        throw error;
      }
    }),
  );
  app.post(
    "/api/whatsapp/onboarding/cancel",
    wrap(async (req, res) => {
      const proof = signupProof(req.body),
        ownerId = await owned(req, proof.companyId);
      await db.onboarding.cancel(proof, ownerId);
      res.json({ cancelled: true });
    }),
  );
  app.post(
    "/api/whatsapp/connection/direct",
    wrap(async (req, res) => {
      const { companyId, wabaId, phoneId, token } = req.body || {};
      const ownerId = await owned(req, companyId);
      if (!META_ID.test(config.appId))
        fail(503, "META_NOT_CONFIGURED", "Falta configurar la aplicación de Meta en el servidor.");
      if (
        typeof wabaId !== "string" ||
        !META_ID.test(wabaId) ||
        typeof phoneId !== "string" ||
        !META_ID.test(phoneId)
      )
        fail(
          400,
          "INVALID_ASSETS",
          "Introduce los dos identificadores numéricos que muestra Meta.",
        );
      if (typeof token !== "string" || !/^[A-Za-z0-9_.|-]{20,4096}$/.test(token))
        fail(400, "INVALID_TOKEN", "Introduce un token de acceso válido de Meta.");
      const current = await db.companies.findOne({ company_id: companyId, owner_id: ownerId });
      if (
        current?.connection_state === "CONNECTED" &&
        (current.coexistence ||
          current.whatsapp_phone_id !== phoneId ||
          current.meta_waba_id !== wabaId)
      )
        fail(
          409,
          "NUMBER_ALREADY_CONNECTED",
          "Desconecta primero el número actual antes de cambiarlo.",
        );
      const connection = await meta.assets(token, wabaId, phoneId, { direct: true });
      const checked = await meta.check(token, wabaId, phoneId, { direct: true });
      if (!checked.connected)
        fail(
          409,
          "PHONE_NOT_REGISTERED",
          "Termina el registro del número en Meta antes de conectarlo en Reservas.",
        );
      await meta.subscribe(token, wabaId);
      await db.onboarding.saveDirectConnection(
        companyId,
        ownerId,
        {
          ...connection,
          token: encryptToken(token, config.encryptionKey),
        },
        checked,
      );
      res.json({ connected: true });
    }),
  );
  app.post(
    "/api/whatsapp/connection/check",
    wrap(async (req, res) => {
      const ownerId = await owned(req, req.body?.companyId);
      const company = await db.companies.findOne({
        company_id: req.body.companyId,
        owner_id: ownerId,
      });
      if (!company?.meta_waba_id || company.connection_state !== "CONNECTED")
        return res.json({ checked: false });
      if (Date.parse(company.connection_checked_at) > Date.now() - 10000)
        return res.json({ checked: true, cached: true });
      await check(company, decryptToken(company.whatsapp_token_oficial, config.encryptionKey));
      res.json({ checked: true });
    }),
  );
  app.post(
    "/api/whatsapp/connection/disconnect",
    wrap(async (req, res) => {
      await owned(req, req.body?.companyId);
      await db.onboarding.disconnect(req.body.companyId);
      res.json({
        disconnected: true,
        message:
          "Se detuvieron los envíos de Reservas y se eliminó la credencial del servicio. Puedes gestionar el número y los permisos desde Meta.",
      });
    }),
  );
  app.post(
    "/api/whatsapp/template/submit",
    wrap(async (req, res) => {
      const kind = req.body?.kind || "reminder";
      if (!["confirmation", "reminder"].includes(kind))
        fail(400, "INVALID_TEMPLATE", "Tipo de plantilla inválido.");
      const ownerId = await owned(req, req.body?.companyId);
      const company = await db.companies.findOne({
        company_id: req.body.companyId,
        owner_id: ownerId,
      });
      if (!company?.meta_waba_id || company.connection_state !== "CONNECTED")
        fail(409, "NUMBER_DISCONNECTED", "Conecta primero el número de tu negocio.");
      const token = decryptToken(company.whatsapp_token_oficial, config.encryptionKey);
      const state = await check(company, token);
      const status = kind === "confirmation" ? state.confirmationStatus : state.templateStatus;
      if (status !== "MISSING") return res.json({ submitted: false, status });
      const template = await meta.submitTemplate(token, company.meta_waba_id, kind);
      await db.onboarding.checked(company.company_id, company.whatsapp_phone_id, {
        ...state,
        ...(kind === "confirmation"
          ? { confirmationStatus: "PENDING" }
          : { templateStatus: "PENDING" }),
      });
      res.status(202).json({
        submitted: true,
        status: "PENDING",
        message: "Plantilla enviada a revisión de Meta. Actualiza el estado más tarde.",
      });
    }),
  );
  app.get(
    "/api/whatsapp/activity/:companyId",
    wrap(async (req, res) => {
      await owned(req, req.params.companyId);
      const rows = await db.onboarding.activity(req.params.companyId);
      res.json({
        items: rows.map((row) => ({
          ...JSON.parse(decryptToken(row.encrypted_content, config.encryptionKey)),
          at: row.occurred_at,
        })),
      });
    }),
  );
}

function validateAutomation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail(400, "INVALID_BODY", "Usa un objeto JSON.");
  if (!["created", "rescheduled", "cancelled", "remind"].includes(body.event))
    fail(400, "INVALID_EVENT", "event debe ser created, rescheduled, cancelled o remind.");
  if (typeof body.bookingId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(body.bookingId))
    fail(400, "INVALID_BOOKING", "Usa el UID estable de la reserva de Cal.com en bookingId.");
  function instant(value, name) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)
    )
      fail(400, "INVALID_DATETIME", `${name} debe tener formato ISO 8601 con zona horaria.`);
    return new Date(value).toISOString();
  }
  const result = { event: body.event, bookingId: body.bookingId };
  if (body.event !== "remind") {
    result.eventAt = instant(body.eventAt, "eventAt");
    if (Date.parse(result.eventAt) > Date.now() + 300000)
      fail(400, "INVALID_EVENT_TIME", "eventAt no puede estar en el futuro.");
  }
  if (body.event !== "cancelled") result.startsAt = instant(body.startsAt, "startsAt");
  if (["created", "rescheduled"].includes(body.event)) {
    if (
      typeof body.patientName !== "string" ||
      body.patientName.trim().length < 2 ||
      body.patientName.trim().length > 100 ||
      /[\u0000-\u001f\u007f]/.test(body.patientName)
    )
      fail(400, "INVALID_NAME", "patientName debe tener de 2 a 100 caracteres.");
    result.patientName = body.patientName.trim();
    result.phone = normalizePhone(body.phone);
    result.endsAt = instant(body.endsAt, "endsAt");
    if (
      Date.parse(result.endsAt) <= Date.parse(result.startsAt) ||
      Date.parse(result.endsAt) - Date.parse(result.startsAt) > 86400000
    )
      fail(400, "INVALID_DURATION", "La duración debe ser positiva y no superar 24 horas.");
    result.service = typeof body.service === "string" ? body.service.trim() : "Cita de Cal.com";
    if (result.service.length < 2 || result.service.length > 160)
      fail(400, "INVALID_SERVICE", "service debe tener de 2 a 160 caracteres.");
    if (body.whatsappConsent === true) {
      if (
        typeof body.consentEvidence !== "string" ||
        body.consentEvidence.trim().length < 10 ||
        body.consentEvidence.length > 500
      )
        fail(
          400,
          "CONSENT_EVIDENCE_REQUIRED",
          "Mapea la respuesta de consentimiento de Cal.com en consentEvidence.",
        );
      result.consentEvidence = body.consentEvidence.trim();
    }
  }
  if (body.sendReminder !== undefined && typeof body.sendReminder !== "boolean")
    fail(400, "INVALID_SEND_FLAG", "sendReminder debe ser true o false.");
  result.sendReminder =
    body.event === "remind" ||
    (["created", "rescheduled"].includes(body.event) && body.sendReminder === true);
  return result;
}

function createPostgresAutomation(pool, tx) {
  return {
    async keyInfo(companyId) {
      return (
        (
          await pool.query(
            "SELECT token_hint,created_at,expires_at,revoked_at,last_event_at,last_result,(token_hash IS NOT NULL AND revoked_at IS NULL AND expires_at>now()) AS active FROM whatsapp_cloud.automation_keys WHERE company_id=$1",
            [companyId],
          )
        ).rows[0] || null
      );
    },
    async rotate(companyId) {
      const token = `rsv_make_${crypto.randomBytes(32).toString("hex")}`;
      await tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [companyId]);
        const row = (
          await client.query(
            "SELECT created_at FROM whatsapp_cloud.automation_keys WHERE company_id=$1",
            [companyId],
          )
        ).rows[0];
        if (row && Date.parse(row.created_at) > Date.now() - 30000)
          fail(429, "KEY_RATE_LIMIT", "Espera antes de generar otra clave.");
        await client.query(
          "INSERT INTO whatsapp_cloud.companies(company_id) VALUES($1) ON CONFLICT DO NOTHING",
          [companyId],
        );
        await client.query(
          "INSERT INTO whatsapp_cloud.automation_keys(company_id,token_hash,token_hint,expires_at) VALUES($1,$2,$3,now()+interval '90 days') ON CONFLICT(company_id) DO UPDATE SET token_hash=excluded.token_hash,token_hint=excluded.token_hint,created_at=now(),expires_at=excluded.expires_at,revoked_at=NULL",
          [companyId, sha256(token), token.slice(-6)],
        );
      });
      return token;
    },
    async revoke(companyId) {
      await pool.query(
        "UPDATE whatsapp_cloud.automation_keys SET token_hash=NULL,revoked_at=now() WHERE company_id=$1",
        [companyId],
      );
    },
    async authenticate(token) {
      if (!/^rsv_make_[a-f0-9]{64}$/.test(token || ""))
        fail(401, "INVALID_AUTOMATION_KEY", "La clave de Make no es válida.");
      const row = (
        await pool.query(
          "SELECT k.company_id,c.owner_id FROM whatsapp_cloud.automation_keys k JOIN public.companies c ON c.id=k.company_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND k.expires_at>now()",
          [sha256(token)],
        )
      ).rows[0];
      if (!row) fail(401, "INVALID_AUTOMATION_KEY", "La clave de Make expiró o fue revocada.");
      const allowed = await pool.query(
        "UPDATE whatsapp_cloud.automation_keys SET rate_count=CASE WHEN rate_window<now()-interval '1 minute' THEN 1 ELSE rate_count+1 END,rate_window=CASE WHEN rate_window<now()-interval '1 minute' THEN now() ELSE rate_window END WHERE company_id=$1 AND (rate_window<now()-interval '1 minute' OR rate_count<60) RETURNING company_id",
        [row.company_id],
      );
      if (!allowed.rowCount)
        fail(
          429,
          "AUTOMATION_RATE_LIMIT",
          "Demasiadas solicitudes. Reintenta en un minuto con la misma reserva.",
        );
      return row;
    },
    async result(companyId, result) {
      await pool.query(
        "UPDATE whatsapp_cloud.automation_keys SET last_event_at=now(),last_result=$2 WHERE company_id=$1",
        [companyId, result],
      );
    },
    async booking(companyId, input, clientOverride) {
      const operation = async (client) => {
        // Serializa cambios de una reserva, incluso cuando Make reintenta en paralelo.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${companyId}:${input.bookingId}`,
        ]);
        const old = (
          await client.query(
            "SELECT e.*,r.starts_at,r.status,c.full_name,c.phone FROM whatsapp_cloud.external_bookings e JOIN public.reservations r ON r.company_id=e.company_id AND r.id=e.reservation_id JOIN public.customers c ON c.company_id=r.company_id AND c.id=r.customer_id WHERE e.company_id=$1 AND e.booking_id=$2",
            [companyId, input.bookingId],
          )
        ).rows[0];
        if (input.event === "remind") {
          if (!old)
            fail(
              404,
              "BOOKING_NOT_SYNCED",
              "Primero sincroniza la reserva de Cal.com con event created.",
            );
          if (+new Date(old.starts_at) !== Date.parse(input.startsAt))
            fail(
              409,
              "STALE_BOOKING",
              "La cita fue reprogramada. No envíes el recordatorio anterior.",
            );
          return old;
        }
        const digest = sha256(
          JSON.stringify([
            input.event,
            input.startsAt,
            input.endsAt,
            input.phone,
            input.patientName,
            input.service,
            Boolean(input.consentEvidence),
          ]),
        );
        if (old && Date.parse(input.eventAt) < +new Date(old.source_updated_at))
          return { ...old, ignored: true };
        if (old && Date.parse(input.eventAt) === +new Date(old.source_updated_at)) {
          if (old.event_digest !== digest)
            fail(409, "EVENT_CONFLICT", "La misma versión de la reserva contiene datos distintos.");
          return old;
        }
        if (input.event === "cancelled") {
          if (!old)
            fail(404, "BOOKING_NOT_SYNCED", "No se encontró la reserva que deseas cancelar.");
          await client.query(
            "UPDATE public.reservations SET status='cancelled' WHERE company_id=$1 AND id=$2 AND status='confirmed'",
            [companyId, old.reservation_id],
          );
          await client.query(
            "UPDATE whatsapp_cloud.external_bookings SET source_updated_at=$3,event_digest=$4 WHERE company_id=$1 AND booking_id=$2",
            [companyId, input.bookingId, input.eventAt, digest],
          );
          return { ...old, status: "cancelled" };
        }
        if (old && old.status !== "confirmed" && input.event !== "rescheduled")
          fail(
            409,
            "BOOKING_CLOSED",
            "La cita ya está cancelada o completada. No se reabrirá con otro evento created.",
          );
        if (old?.status === "completed")
          fail(409, "BOOKING_CLOSED", "Una cita completada no se reprograma automáticamente.");
        const id = old?.reservation_id || crypto.randomUUID(),
          customerId = crypto.randomUUID();
        await client.query(
          "INSERT INTO public.customers(id,company_id,full_name,phone) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,phone) DO NOTHING",
          [customerId, companyId, input.patientName, `+${input.phone}`],
        );
        const customer = (
          await client.query("SELECT id FROM public.customers WHERE company_id=$1 AND phone=$2", [
            companyId,
            `+${input.phone}`,
          ])
        ).rows[0];
        if (old)
          await client.query(
            "UPDATE public.reservations SET customer_id=$3,service=$4,starts_at=$5,ends_at=$6,status='confirmed',whatsapp_authorized=$7,customer_response=CASE WHEN starts_at<>$5::timestamptz THEN 'pending' ELSE customer_response END WHERE company_id=$1 AND id=$2",
            [
              companyId,
              id,
              customer.id,
              input.service,
              input.startsAt,
              input.endsAt,
              Boolean(input.consentEvidence),
            ],
          );
        else
          await client.query(
            "INSERT INTO public.reservations(id,company_id,customer_id,service,starts_at,ends_at,reminder_due_at,status,whatsapp_authorized) VALUES($1,$2,$3,$4,$5,$6,$5::timestamptz-interval '24 hours','confirmed',$7)",
            [
              id,
              companyId,
              customer.id,
              input.service,
              input.startsAt,
              input.endsAt,
              Boolean(input.consentEvidence),
            ],
          );
        await client.query(
          "INSERT INTO whatsapp_cloud.external_bookings(company_id,booking_id,reservation_id,source_updated_at,event_digest,whatsapp_consent) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,booking_id) DO UPDATE SET source_updated_at=excluded.source_updated_at,event_digest=excluded.event_digest,whatsapp_consent=excluded.whatsapp_consent",
          [companyId, input.bookingId, id, input.eventAt, digest, Boolean(input.consentEvidence)],
        );
        if (input.consentEvidence)
          await client.query(
            "INSERT INTO whatsapp_cloud.consents(company_id,phone,opted_in_at,evidence) VALUES($1,$2,now(),$3) ON CONFLICT DO NOTHING",
            [companyId, input.phone, `Cal.com ${input.bookingId}: ${input.consentEvidence}`],
          );
        return {
          reservation_id: id,
          starts_at: input.startsAt,
          status: "confirmed",
          full_name: input.patientName,
          phone: input.phone,
          whatsapp_consent: Boolean(input.consentEvidence),
        };
      };
      return clientOverride ? operation(clientOverride) : tx(operation);
    },
  };
}

function installAutomationRoutes(app, { config, db, http, authenticate, logger }) {
  const wrap = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
  async function owned(req, companyId) {
    const ownerId = await authenticate(req.get("Authorization"));
    if (!UUID.test(companyId || "")) fail(400, "INVALID_COMPANY", "Empresa no válida.");
    if (!(await db.companies.isOwner({ company_id: companyId, owner_id: ownerId })))
      fail(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    return ownerId;
  }
  app.get(
    "/api/integrations/make/:companyId",
    wrap(async (req, res) => {
      await owned(req, req.params.companyId);
      res.json({
        key: await db.automation.keyInfo(req.params.companyId),
        path: "/api/integrations/make/events",
        provider: "meta-cloud",
        scheduler: "make",
      });
    }),
  );
  app.post(
    "/api/integrations/make/key",
    wrap(async (req, res) => {
      await owned(req, req.body?.companyId);
      res
        .status(201)
        .json({ token: await db.automation.rotate(req.body.companyId), expiresInDays: 90 });
    }),
  );
  app.post(
    "/api/integrations/make/revoke",
    wrap(async (req, res) => {
      await owned(req, req.body?.companyId);
      await db.automation.revoke(req.body.companyId);
      res.json({ revoked: true });
    }),
  );
  app.post(
    "/api/integrations/make/events",
    wrap(async (req, res) => {
      if (!req.is("application/json"))
        fail(415, "CONTENT_TYPE", "Usa Content-Type: application/json.");
      const key = req.get("Authorization")?.match(/^Bearer (rsv_make_[a-f0-9]{64})$/)?.[1];
      const tenant = await db.automation.authenticate(key);
      // La clave determina la empresa: nunca aceptar companyId como autorización.
      if (req.body?.companyId && req.body.companyId !== tenant.company_id)
        fail(403, "TENANT_MISMATCH", "La clave no pertenece a esa empresa.");
      const input = validateAutomation(req.body);
      try {
        const booking = await db.automation.booking(tenant.company_id, input);
        if (!input.sendReminder || booking.ignored || input.event === "cancelled") {
          await db.automation.result(
            tenant.company_id,
            booking.ignored ? "STALE_EVENT_IGNORED" : "BOOKING_SYNCED",
          );
          return res.json({
            synced: true,
            ignored: Boolean(booking.ignored),
            reservationId: booking.reservation_id,
            sent: false,
          });
        }
        const company = await db.companies.findOne({
          company_id: tenant.company_id,
          owner_id: tenant.owner_id,
        });
        validateCompany(company);
        if (!booking.whatsapp_consent)
          fail(
            403,
            "CONSENT_REQUIRED",
            "La reserva no contiene una autorización afirmativa para WhatsApp.",
          );
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: company.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(new Date(booking.starts_at));
        const part = (type) => parts.find((p) => p.type === type).value;
        const request = validateSend(
          {
            companyId: tenant.company_id,
            phone: booking.phone,
            patientName: booking.full_name,
            date: `${part("year")}-${part("month")}-${part("day")}`,
            time: `${part("hour")}:${part("minute")}`,
            reservationId: booking.reservation_id,
          },
          `cal:${sha256(`${input.bookingId}:${new Date(booking.starts_at).toISOString()}`)}:reminder`,
        );
        const result = await deliverReminder(
          { config, db, http, logger },
          request,
          tenant.owner_id,
        );
        await db.automation.result(
          tenant.company_id,
          result.status === 200 ? "META_ACCEPTED" : result.body.error,
        );
        res
          .status(result.status)
          .json({ ...result.body, synced: true, reservationId: booking.reservation_id });
      } catch (error) {
        await db.automation
          .result(
            tenant.company_id,
            error instanceof HttpError ? error.code : "SERVICE_UNAVAILABLE",
          )
          .catch(() => {});
        throw error;
      }
    }),
  );
}

async function deliverReminder({ config, db, http, logger = console }, input, ownerId) {
  let reservation,
    accepted = false,
    dispatched = false,
    acceptedMessageId = null;
  try {
    reservation = await db.reserve(input, ownerId);
    if (reservation.replayed)
      return {
        status: 200,
        body: {
          success: true,
          requestId: reservation.id,
          messageId: reservation.messageId,
          replayed: true,
        },
      };
    let token;
    try {
      token = decryptToken(reservation.company.whatsapp_token_oficial, config.encryptionKey);
    } catch {
      await db.finish(reservation.id, "failed");
      reservation = null;
      fail(
        503,
        "TENANT_TOKEN_INVALID",
        "Las credenciales de WhatsApp de esta empresa necesitan revisión.",
      );
    }
    let response;
    try {
      dispatched = true;
      response = await http.post(
        `https://graph.facebook.com/${config.graphVersion}/${reservation.company.whatsapp_phone_id}/messages`,
        templatePayload(input, reservation.id, {
          ...config,
          buttonCount:
            input.notificationKind === "confirmation"
              ? reservation.company.confirmation_button_count
              : reservation.company.template_button_count,
        }),
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 12000,
          maxRedirects: 0,
          maxBodyLength: 32768,
          maxContentLength: 65536,
        },
      );
    } catch (error) {
      const rejected =
        Number.isInteger(error.response?.status) &&
        error.response.status >= 400 &&
        error.response.status < 500;
      await db.finish(reservation.id, rejected ? "failed" : "unknown");
      const requestId = reservation.id;
      reservation = null;
      logger.error(
        `[meta] Envío ${rejected ? "rechazado" : "pendiente de conciliación"}: ${requestId}`,
      );
      return {
        status: rejected ? 502 : 503,
        body: {
          error: rejected ? "META_REJECTED" : "SEND_OUTCOME_UNKNOWN",
          message: rejected
            ? "Meta rechazó el envío. Revisa el token, el número y la plantilla aprobada."
            : "No se pudo confirmar el resultado. No repitas el envío con otra clave; requiere conciliación.",
          requestId,
        },
      };
    }
    const messageId = response.data?.messages?.[0]?.id;
    if (typeof messageId !== "string" || !messageId || messageId.length > 512) {
      await db.finish(reservation.id, "unknown");
      const requestId = reservation.id;
      reservation = null;
      return {
        status: 503,
        body: {
          error: "META_RESPONSE_INVALID",
          message:
            "Meta no devolvió un identificador válido. No repitas este envío con otra clave.",
          requestId,
        },
      };
    }
    accepted = true;
    acceptedMessageId = messageId;
    await db.finish(reservation.id, "sent", messageId);
    return {
      status: 200,
      body: { success: true, requestId: reservation.id, messageId, replayed: false },
    };
  } catch (error) {
    if (reservation && !reservation.replayed)
      await db
        .finish(reservation.id, dispatched ? "unknown" : "failed", acceptedMessageId)
        .catch(() => {});
    if (accepted) {
      logger.error(`[send] Conciliación de contador pendiente: ${reservation.id}`);
      return {
        status: 503,
        body: {
          error: "ACCOUNTING_PENDING",
          message:
            "Meta aceptó el mensaje, pero falta confirmar su registro. No lo vuelvas a enviar.",
          requestId: reservation.id,
          messageId: acceptedMessageId,
        },
      };
    }
    throw error;
  }
}

function replay(prior, input) {
  if (prior.fingerprint !== fingerprint(input))
    fail(409, "IDEMPOTENCY_CONFLICT", "Esa Idempotency-Key ya se usó con otros datos.");
  if (prior.state === "sent")
    return { replayed: true, id: prior.id, messageId: prior.meta_message_id };
  fail(
    409,
    prior.state === "failed" ? "PREVIOUS_SEND_FAILED" : "SEND_PENDING_REVIEW",
    prior.state === "failed"
      ? "El intento anterior falló. Revisa su configuración antes de crear un nuevo intento."
      : "El envío está en curso o pendiente de conciliación. No lo repitas con otra clave.",
  );
}

// Mock asíncrono para ejemplos y pruebas. No conserva datos y no puede usarse
// con NODE_ENV=production. Sustituye estas operaciones por un adaptador transaccional.
function createMockDb({ companies = [], appointments = [], consents = [] } = {}) {
  const data = {
    companies: new Map(companies.map((c) => [c.company_id, structuredClone(c)])),
    appointments: structuredClone(appointments),
    consents: structuredClone(consents),
    outbox: new Map(),
    usage: new Map(),
    inbox: new Map(),
  };
  let chain = Promise.resolve();
  const atomic = (fn) => {
    const next = chain.then(fn);
    chain = next.catch(() => {});
    return next;
  };
  return {
    data,
    companies: {
      async isOwner({ company_id, owner_id }) {
        return data.companies.get(company_id)?.owner_id === owner_id;
      },
      async findOne({ company_id, owner_id }) {
        const c = data.companies.get(company_id);
        return c && c.owner_id === owner_id ? structuredClone(c) : null;
      },
      async updateOne({ company_id }, patch) {
        const c = data.companies.get(company_id);
        if (c) Object.assign(c, patch);
      },
    },
    async reserve(input, ownerId, now = new Date()) {
      return atomic(() => {
        const c = data.companies.get(input.companyId);
        validateCompany(c?.owner_id === ownerId ? c : null, now);
        if (
          !c.template_approved ||
          !c.whatsapp_token_oficial ||
          !/^[0-9]{5,30}$/.test(c.whatsapp_phone_id || "")
        )
          fail(
            403,
            "META_NOT_CONFIGURED",
            "Configura el número oficial y la plantilla aprobada en Meta.",
          );
        const previous = [...data.outbox.values()].find(
          (x) => x.company_id === input.companyId && x.idempotency_key === input.idempotencyKey,
        );
        if (previous) return replay(previous, input);
        const matches = data.appointments.filter(
          (a) =>
            a.company_id === input.companyId &&
            a.phone === input.phone &&
            a.date === input.date &&
            a.time === input.time &&
            a.status === "confirmed" &&
            Date.parse(a.starts_at) > +now,
        );
        if (matches.length !== 1)
          fail(
            409,
            "APPOINTMENT_AMBIGUOUS",
            "Debe existir una única cita futura activa para ese teléfono, fecha y hora.",
          );
        if (
          !data.consents.some(
            (x) =>
              x.company_id === input.companyId &&
              x.phone === input.phone &&
              x.opted_in_at &&
              !x.revoked_at,
          )
        )
          fail(
            403,
            "CONSENT_REQUIRED",
            "Registra el consentimiento del cliente para recibir recordatorios por WhatsApp.",
          );
        const period = periodFor(c, now),
          key = `${input.companyId}:${period}`;
        const quota = data.usage.get(key) || {
          sent: c.usage_period === period ? c.mensajes_enviados_mes || 0 : 0,
          reserved: 0,
        };
        if (quota.sent + quota.reserved >= c.limite_mensajes) throw quotaError(c.plan_actual);
        quota.reserved++;
        data.usage.set(key, quota);
        const id = crypto.randomUUID();
        data.outbox.set(id, {
          id,
          company_id: input.companyId,
          idempotency_key: input.idempotencyKey,
          fingerprint: fingerprint(input),
          reservation_id: matches[0].id,
          phone: input.phone,
          phone_id: c.whatsapp_phone_id,
          period,
          state: "sending",
        });
        return { id, company: structuredClone(c), period };
      });
    },
    async finish(id, state, messageId = null) {
      return atomic(() => {
        const row = data.outbox.get(id);
        if (!row || !["sending", "unknown"].includes(row.state)) return;
        const quota = data.usage.get(`${row.company_id}:${row.period}`);
        if (["sent", "failed"].includes(state)) {
          quota.reserved--;
          if (state === "sent") quota.sent++;
        }
        Object.assign(row, { state, meta_message_id: messageId || row.meta_message_id });
        const company = data.companies.get(row.company_id);
        if (state === "sent" && periodFor(company) === row.period)
          Object.assign(company, { mensajes_enviados_mes: quota.sent, usage_period: row.period });
      });
    },
    async enqueue(events) {
      for (const event of events)
        if (!data.inbox.has(event.id)) data.inbox.set(event.id, { event, state: "pending" });
    },
    async processNext(secret) {
      return atomic(() => {
        const item = [...data.inbox.values()].find((x) => x.state === "pending");
        if (!item) return false;
        const action = resolveAction(item.event, secret),
          event = item.event;
        if (action) {
          const row = [...data.outbox.values()].find(
            (x) =>
              ["sent", "unknown"].includes(x.state) &&
              x.phone_id === event.phoneId &&
              x.phone === event.from &&
              data.companies.get(x.company_id)?.whatsapp_phone_id === x.phone_id &&
              (action.requestId
                ? x.id === action.requestId
                : x.meta_message_id === action.contextId),
          );
          const appointment =
            row &&
            data.appointments.find(
              (a) => a.company_id === row.company_id && a.id === row.reservation_id,
            );
          if (appointment?.status === "confirmed" && Date.parse(appointment.starts_at) > Date.now())
            appointment.status = action.action === "cancel" ? "cancelled" : "confirmed";
        }
        item.state = "done";
        return true;
      });
    },
    async health() {},
    async close() {},
  };
}

function createAuthenticator(config, http = axios) {
  return async (header) => {
    const match = typeof header === "string" && /^Bearer ([^\s]{10,8192})$/i.exec(header);
    if (!match) fail(401, "UNAUTHORIZED", "Inicia sesión para enviar recordatorios.");
    try {
      const response = await http.get(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
        headers: { apikey: config.supabaseKey, Authorization: `Bearer ${match[1]}` },
        timeout: 5000,
        maxRedirects: 0,
      });
      if (!UUID.test(response.data?.id || "")) fail(401, "UNAUTHORIZED", "Tu sesión no es válida.");
      return response.data.id;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if ([401, 403].includes(error.response?.status))
        fail(401, "UNAUTHORIZED", "Tu sesión expiró. Inicia sesión de nuevo.");
      fail(503, "AUTH_UNAVAILABLE", "No se pudo verificar la sesión. Inténtalo más tarde.");
    }
  };
}

function createApp({
  config,
  db,
  http = axios,
  authenticate = createAuthenticator(config),
  logger = console,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    next();
  });
  app.get("/health", async (_req, res) => {
    try {
      await db.health();
      res.json({ status: "ok", provider: "meta-cloud", database: config.dbMode });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.get("/webhook", (req, res) => {
    if (
      req.query["hub.mode"] !== "subscribe" ||
      !equalSecret(req.query["hub.verify_token"], config.verifyToken)
    )
      return res.sendStatus(403);
    const challenge = req.query["hub.challenge"];
    if (typeof challenge !== "string" || !/^[0-9]{1,128}$/.test(challenge))
      return res.sendStatus(400);
    res.status(200).type("text/plain").send(challenge);
  });
  installCalWebhook(app, {
    db,
    HttpError,
    rawParser: express.raw({ type: "application/json", limit: "256kb", inflate: false }),
  });
  // Debe ir ANTES de express.json: la firma corresponde a los bytes originales.
  app.post(
    "/webhook",
    express.raw({ type: "application/json", limit: "5mb", inflate: false }),
    async (req, res) => {
      if (!verifyWebhook(req.body, req.get("X-Hub-Signature-256"), config.appSecret))
        return res.sendStatus(403);
      let body;
      try {
        body = JSON.parse(req.body.toString("utf8"));
      } catch {
        return res.sendStatus(400);
      }
      try {
        // Confirmar recepción después de persistir. Procesamiento asíncrono por worker.
        // Un 200 antes de guardar perdería eventos al reiniciar Railway.
        await db.enqueue([
          ...extractEvents(body),
          ...extractCoexistenceEvents(
            body,
            config.encryptionKey,
            config.signupEnabled === true || (config.signupTestCompanyIds || []).length > 0,
          ),
        ]);
        res.sendStatus(200);
      } catch {
        logger.error("[webhook] No se pudo persistir el evento.");
        res.sendStatus(503);
      }
    },
  );
  app.use(
    "/api",
    cors({
      origin(origin, callback) {
        if (!origin || config.origins.includes(origin)) return callback(null, true);
        callback(new HttpError(403, "ORIGIN_NOT_ALLOWED", "Origen no permitido."));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "16kb", strict: true }));
  installOnboardingRoutes(app, { config, db, http, authenticate, logger });
  if (config.legacyMakeEnabled)
    installAutomationRoutes(app, { config, db, http, authenticate, logger });
  installNativeRoutes(app, { db, authenticate, HttpError });
  app.get("/api/whatsapp/status/:companyId", async (req, res, next) => {
    try {
      const ownerId = await authenticate(req.get("Authorization"));
      const companyId = req.params.companyId;
      if (!UUID.test(companyId)) fail(400, "INVALID_COMPANY", "companyId debe ser un UUID válido.");
      const query = { company_id: companyId, owner_id: ownerId };
      if (!(await db.companies.isOwner(query)))
        fail(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
      const company = await db.companies.findOne(query);
      const response = {
        companyId,
        provider: "meta-cloud",
        status: "PENDING_SETUP",
        message:
          "La API está disponible. Falta dar de alta el número oficial, la plantilla y el acceso de WhatsApp de tu empresa.",
        checks: {
          account: Boolean(company),
          credentials: false,
          template: false,
          confirmationTemplate: false,
          access: false,
          quota: false,
        },
        plan: null,
        sent: 0,
        limit: 0,
        period: null,
        checkedAt: new Date().toISOString(),
        connection: company
          ? {
              state: company.connection_state || "NOT_CONNECTED",
              coexistence: company.coexistence === true,
              phone: company.display_phone || null,
              name: company.verified_name || null,
              templateStatus: company.template_status || "NOT_CHECKED",
              confirmationStatus: company.confirmation_template_status || "NOT_CHECKED",
              tokenExpiresAt: company.token_expires_at || null,
              sync: company.sync_state || {},
            }
          : null,
      };
      if (company) {
        response.plan = PLANS[company.plan_actual] ? company.plan_actual : null;
        response.sent = Number(company.mensajes_enviados_mes) || 0;
        response.limit = PLANS[company.plan_actual]?.limit || 0;
        response.period = periodFor(company);
        response.checks.credentials = Boolean(
          company.whatsapp_token_oficial &&
          /^[0-9]{5,30}$/.test(company.whatsapp_phone_id || "") &&
          (!company.token_expires_at || Date.parse(company.token_expires_at) > Date.now()) &&
          (!company.connection_state || company.connection_state === "CONNECTED"),
        );
        response.checks.template = company.template_approved === true;
        response.checks.confirmationTemplate = company.confirmation_template_approved === true;
        response.checks.quota = response.sent < response.limit;
        try {
          validateCompany(company);
          response.checks.access = true;
          if (company.token_expires_at && Date.parse(company.token_expires_at) <= Date.now())
            fail(
              403,
              "META_TOKEN_EXPIRED",
              "El permiso de Meta expiró. Vuelve a conectar WhatsApp Business.",
            );
          if (!response.checks.quota) throw quotaError(company.plan_actual);
          if (
            response.checks.credentials &&
            response.checks.template &&
            response.checks.confirmationTemplate
          ) {
            response.status = "READY";
            response.message =
              "La configuración permite solicitar envíos. Meta validará la credencial y la plantilla al enviar cada recordatorio.";
          }
          if (company.connection_state === "DISCONNECTED")
            response.message =
              "El número está desconectado. Vuelve a conectarlo con el asistente de Meta.";
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          response.status = "BLOCKED";
          response.message = error.message;
        }
      }
      // No devolver tokens, IDs de teléfono, datos de pacientes o secretos al navegador.
      res.json(response);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/whatsapp/send", async (req, res, next) => {
    try {
      if (!req.is("application/json"))
        fail(415, "CONTENT_TYPE", "Usa Content-Type: application/json.");
      const ownerId = await authenticate(req.get("Authorization"));
      const input = validateSend(req.body, req.get("Idempotency-Key"));
      const result = await deliverReminder({ config, db, http, logger }, input, ownerId);
      res.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });
  app.use((_req, _res, next) => next(new HttpError(404, "NOT_FOUND", "Ruta no encontrada.")));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: error.code, message: error.message });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "INVALID_JSON", message: "JSON inválido." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "BODY_TOO_LARGE", message: "Solicitud demasiado grande." });
    if (error.type === "encoding.unsupported") return res.sendStatus(415);
    // Nunca registrar error de Axios completo: incluye tokens, teléfonos y cuerpos.
    logger.error("[server] Falló una operación.");
    res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "El servicio no está disponible. Inténtalo más tarde.",
    });
  });
  return app;
}

function startWorker(db, secret, logger = console) {
  let stopped = false,
    timer,
    active = Promise.resolve(),
    lastCleanup = 0;
  async function tick() {
    try {
      if (db.onboarding && Date.now() - lastCleanup > 60000) {
        await db.onboarding.cleanup();
        lastCleanup = Date.now();
      }
      for (let i = 0; i < 100 && !stopped; i++) if (!(await db.processNext(secret))) break;
    } catch {
      logger.error("[worker] Evento pendiente. Se reintentará desde la base de datos.");
    }
    if (!stopped) {
      timer = setTimeout(() => {
        active = tick();
      }, 1000);
      timer.unref();
    }
  }
  active = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
  };
}
async function startServer() {
  const config = readConfig();
  const db = config.dbMode === "mock" ? createMockDb() : createPostgresDb(config);
  try {
    await db.health();
  } catch (error) {
    await db.close();
    throw error;
  } // Fallar antes de escuchar si falta la migración o la BD.
  const app = createApp({ config, db });
  const server = app.listen(config.port, config.host, () =>
    console.log(`[meta-cloud] Puerto ${config.port}; BD ${config.dbMode}.`),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
  } catch (error) {
    await db.close();
    throw error;
  }
  const stopWorker = startWorker(db, config.buttonSecret);
  const stopAutomation = db.native
    ? startAutomationWorker({
        db,
        config,
        validateSend,
        deliver: (input, ownerId) => deliverReminder({ config, db, http: axios }, input, ownerId),
      })
    : async () => {};
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 25000);
    timeout.unref();
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      stopWorker(),
      stopAutomation(),
    ]);
    await db.close();
    clearTimeout(timeout);
  }
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { app, server, db };
}
if (require.main === module)
  startServer().catch(() => {
    console.error(
      "[meta-cloud] Revisa variables, certificado de PostgreSQL y schema.sql. No se inició el servidor.",
    );
    process.exitCode = 1;
  });
module.exports = {
  PLANS,
  HttpError,
  readConfig,
  validateCompany,
  periodFor,
  validateSend,
  fingerprint,
  encryptToken,
  decryptToken,
  buttonPayload,
  parseButtonPayload,
  templatePayload,
  verifyWebhook,
  extractEvents,
  resolveAction,
  createPostgresDb,
  createMockDb,
  createAuthenticator,
  createApp,
  createMetaOnboarding,
  extractCoexistenceEvents,
  signupProof,
  validateAutomation,
  deliverReminder,
  startWorker,
  startServer,
};
