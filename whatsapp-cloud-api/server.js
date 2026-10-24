"use strict";

// Toda la aplicación (Express, Meta, adaptador PostgreSQL y mock) vive aquí.
// schema.sql prepara las transacciones y tablas privadas en el Supabase existente.
const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const PLANS = Object.freeze({
  TRIAL: Object.freeze({ priceMXN: 0, limit: 35, trialDays: 7 }),
  PRO: Object.freeze({ priceMXN: 599, limit: 1000 }),
  PREMIUM: Object.freeze({ priceMXN: 999, limit: 2500 }),
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

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
    verifyToken: env.WEBHOOK_VERIFY_TOKEN,
    encryptionKey: env.META_TOKEN_ENCRYPTION_KEY,
    buttonSecret: env.BUTTON_SIGNING_SECRET,
    templateName: env.WHATSAPP_TEMPLATE_NAME || "recordatorio_cita",
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
    !/^[a-z0-9_]{1,512}$/.test(config.templateName) ||
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
  };
}
function fingerprint(input) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([input.companyId, input.phone, input.patientName, input.date, input.time]),
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
  if (version !== "r1" || !["confirm", "cancel"].includes(action) || !UUID.test(id || "") || extra)
    return null;
  return equalSecret(payload, buttonPayload(action, id, secret)) ? { action, requestId: id } : null;
}
function templatePayload(input, requestId, config) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.phone,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [input.patientName, input.date, input.time].map((text) => ({
            type: "text",
            text,
          })),
        },
        ...["confirm", "cancel"].map((action, index) => ({
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
        if (
          !company.template_approved ||
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
          `SELECT r.id,c.full_name FROM public.reservations r JOIN public.customers c ON c.company_id=r.company_id AND c.id=r.customer_id WHERE r.company_id=$1 AND regexp_replace(c.phone,'[^0-9]','','g')=$2 AND (r.starts_at AT TIME ZONE $3)::date=$4::date AND to_char(r.starts_at AT TIME ZONE $3,'HH24:MI')=$5 AND r.starts_at > $6 AND r.status='confirmed' LIMIT 2`,
          [input.companyId, input.phone, company.timezone, input.date, input.time, now],
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
          "INSERT INTO whatsapp_cloud.outbox(id,company_id,idempotency_key,fingerprint,reservation_id,phone,phone_id,period,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sending')",
          [
            id,
            input.companyId,
            input.idempotencyKey,
            fingerprint(input),
            appointments.rows[0].id,
            input.phone,
            company.whatsapp_phone_id,
            period,
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
          const event = item.event,
            action = resolveAction(event, secret);
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
                "UPDATE public.reservations SET status=$3 WHERE company_id=$1 AND id=$2 AND status='confirmed' AND starts_at>now()",
                [
                  match.company_id,
                  match.reservation_id,
                  action.action === "cancel" ? "cancelled" : "confirmed",
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
    },
    async close() {
      await pool.end();
    },
  };
  return db;
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
  // Debe ir ANTES de express.json: la firma corresponde a los bytes originales.
  app.post(
    "/webhook",
    express.raw({ type: "application/json", limit: "512kb", inflate: false }),
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
        await db.enqueue(extractEvents(body));
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
          access: false,
          quota: false,
        },
        plan: null,
        sent: 0,
        limit: 0,
        period: null,
        checkedAt: new Date().toISOString(),
      };
      if (company) {
        response.plan = PLANS[company.plan_actual] ? company.plan_actual : null;
        response.sent = Number(company.mensajes_enviados_mes) || 0;
        response.limit = PLANS[company.plan_actual]?.limit || 0;
        response.period = periodFor(company);
        response.checks.credentials = Boolean(
          company.whatsapp_token_oficial && /^[0-9]{5,30}$/.test(company.whatsapp_phone_id || ""),
        );
        response.checks.template = company.template_approved === true;
        response.checks.quota = response.sent < response.limit;
        try {
          validateCompany(company);
          response.checks.access = true;
          if (!response.checks.quota) throw quotaError(company.plan_actual);
          if (response.checks.credentials && response.checks.template) {
            response.status = "READY";
            response.message =
              "La configuración permite solicitar envíos. Meta validará la credencial y la plantilla al enviar cada recordatorio.";
          }
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
    let reservation,
      accepted = false,
      dispatched = false,
      acceptedMessageId = null;
    try {
      if (!req.is("application/json"))
        fail(415, "CONTENT_TYPE", "Usa Content-Type: application/json.");
      const ownerId = await authenticate(req.get("Authorization"));
      const input = validateSend(req.body, req.get("Idempotency-Key"));
      reservation = await db.reserve(input, ownerId);
      if (reservation.replayed)
        return res.json({
          success: true,
          requestId: reservation.id,
          messageId: reservation.messageId,
          replayed: true,
        });
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
      // URL oficial; nunca facebook.com{phoneId}/messages ni una URL aportada por el cliente.
      const url = `https://graph.facebook.com/${config.graphVersion}/${reservation.company.whatsapp_phone_id}/messages`;
      let response;
      try {
        dispatched = true;
        response = await http.post(url, templatePayload(input, reservation.id, config), {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 12000,
          maxRedirects: 0,
          maxBodyLength: 32768,
          maxContentLength: 65536,
        });
      } catch (error) {
        const definiteRejection =
          Number.isInteger(error.response?.status) &&
          error.response.status >= 400 &&
          error.response.status < 500;
        await db.finish(reservation.id, definiteRejection ? "failed" : "unknown");
        const requestId = reservation.id;
        reservation = null;
        logger.error(
          `[meta] Envío ${definiteRejection ? "rechazado" : "pendiente de conciliación"}: ${requestId}`,
        );
        return res.status(definiteRejection ? 502 : 503).json({
          error: definiteRejection ? "META_REJECTED" : "SEND_OUTCOME_UNKNOWN",
          message: definiteRejection
            ? "Meta rechazó el envío. Revisa el token, el número y la plantilla aprobada."
            : "No se pudo confirmar el resultado. No repitas el envío con otra clave; requiere conciliación.",
          requestId,
        });
      }
      const messageId = response.data?.messages?.[0]?.id;
      if (typeof messageId !== "string" || !messageId || messageId.length > 512) {
        await db.finish(reservation.id, "unknown");
        const id = reservation.id;
        reservation = null;
        return res.status(503).json({
          error: "META_RESPONSE_INVALID",
          message:
            "Meta no devolvió un identificador válido. No repitas este envío con otra clave.",
          requestId: id,
        });
      }
      accepted = true;
      acceptedMessageId = messageId;
      await db.finish(reservation.id, "sent", messageId);
      res.json({ success: true, requestId: reservation.id, messageId, replayed: false });
    } catch (error) {
      if (reservation && !reservation.replayed) {
        await db
          .finish(reservation.id, dispatched ? "unknown" : "failed", acceptedMessageId)
          .catch(() => {});
      }
      if (accepted) {
        logger.error(`[send] Conciliación de contador pendiente: ${reservation.id}`);
        return res.status(503).json({
          error: "ACCOUNTING_PENDING",
          message:
            "Meta aceptó el mensaje, pero falta confirmar su registro. No lo vuelvas a enviar.",
          requestId: reservation.id,
          messageId: acceptedMessageId,
        });
      }
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
    active = Promise.resolve();
  async function tick() {
    try {
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
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 25000);
    timeout.unref();
    await Promise.all([new Promise((resolve) => server.close(resolve)), stopWorker()]);
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
  startWorker,
  startServer,
};
