"use strict";
const { nextReminderTime } = require("./quiet-hours");

const crypto = require("node:crypto");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function verifyCalSignature(raw, signature, secret) {
  return (
    Buffer.isBuffer(raw) &&
    /^[a-f0-9]{64}$/i.test(signature || "") &&
    safeEqual(
      signature.toLowerCase(),
      crypto.createHmac("sha256", secret).update(raw).digest("hex"),
    )
  );
}

// Contrato estándar Cal.com. Nunca inferir consentimiento a partir de un teléfono.
function parseCalEvent(body, validateAutomation) {
  const types = {
    BOOKING_CREATED: "created",
    BOOKING_RESCHEDULED: "rescheduled",
    BOOKING_CANCELLED: "cancelled",
  };
  if (!body || !types[body.triggerEvent]) return null;
  const p = body.payload;
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("INVALID_CAL_PAYLOAD");
  if (p.seatsPerTimeSlot || (Array.isArray(p.attendees) && p.attendees.length !== 1))
    throw new Error("CAL_GROUP_BOOKING_UNSUPPORTED");
  const answer = (key) => p.responses?.[key]?.value;
  const attendee = p.attendees?.[0];
  const optedIn = answer("whatsappConsent") === true;
  const input = validateAutomation({
    event: types[body.triggerEvent],
    bookingId: p.uid,
    eventAt: body.createdAt,
    startsAt: p.startTime,
    endsAt: p.endTime,
    patientName: attendee?.name || answer("name"),
    phone: answer("attendeePhoneNumber") || attendee?.phoneNumber,
    service: p.eventTitle || p.title || "Reserva de Cal.com",
    whatsappConsent: optedIn,
    consentEvidence: optedIn
      ? "Campo whatsappConsent de Cal.com aceptado explícitamente"
      : undefined,
    sendReminder: false,
  });
  if (input.event !== "cancelled" && p.status && p.status !== "ACCEPTED")
    throw new Error("CAL_BOOKING_NOT_ACCEPTED");
  const previousUid = p.rescheduleUid;
  if (previousUid !== undefined && !/^[A-Za-z0-9_-]{1,200}$/.test(previousUid))
    throw new Error("INVALID_CAL_PREVIOUS_UID");
  return { ...input, previousUid: previousUid !== input.bookingId ? previousUid : undefined };
}

function createNativeAutomation({
  pool,
  tx,
  HttpError,
  encryptToken,
  decryptToken,
  encryptionKey,
  importBooking,
  validateAutomation,
}) {
  const error = (status, code, message) => {
    throw new HttpError(status, code, message);
  };
  async function ensure(client, companyId) {
    await client.query(
      "INSERT INTO whatsapp_cloud.companies(company_id) VALUES($1) ON CONFLICT DO NOTHING",
      [companyId],
    );
    await client.query(
      "INSERT INTO whatsapp_cloud.automation_settings(company_id) VALUES($1) ON CONFLICT DO NOTHING",
      [companyId],
    );
  }
  return {
    async info(companyId) {
      const settings = (
        await pool.query(
          "SELECT enabled,reminder_minutes,cal_endpoint,cal_enabled,cal_last_event_at,cal_last_result FROM whatsapp_cloud.automation_settings WHERE company_id=$1",
          [companyId],
        )
      ).rows[0];
      const counts = (
        await pool.query(
          "SELECT state,count(*)::int AS count FROM whatsapp_cloud.jobs WHERE company_id=$1 GROUP BY state",
          [companyId],
        )
      ).rows;
      const jobs = (
        await pool.query(
          "SELECT id,reservation_id,kind,due_at,state,attempts,last_code,updated_at FROM whatsapp_cloud.jobs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 30",
          [companyId],
        )
      ).rows;
      return {
        scheduler: "native",
        settings: settings || {
          enabled: false,
          reminder_minutes: 1440,
          cal_enabled: false,
          cal_endpoint: null,
        },
        counts,
        jobs,
      };
    },
    async configure(companyId, { enabled, reminderMinutes }) {
      if (
        typeof enabled !== "boolean" ||
        !Number.isInteger(reminderMinutes) ||
        reminderMinutes < 15 ||
        reminderMinutes > 10080
      )
        error(
          400,
          "INVALID_SETTINGS",
          "Indica si activar los envíos y una anticipación entre 15 minutos y 7 días.",
        );
      await tx(async (client) => {
        await ensure(client, companyId);
        await client.query(
          "UPDATE whatsapp_cloud.companies SET timezone=(SELECT timezone FROM public.companies WHERE id=$1) WHERE company_id=$1",
          [companyId],
        );
        await client.query(
          "UPDATE whatsapp_cloud.automation_settings SET enabled=$2,reminder_minutes=$3,updated_at=now() WHERE company_id=$1",
          [companyId, enabled, reminderMinutes],
        );
        if (!enabled)
          await client.query(
            "UPDATE whatsapp_cloud.jobs SET state='cancelled',last_code='AUTOMATION_PAUSED',updated_at=now() WHERE company_id=$1 AND state IN ('pending','blocked')",
            [companyId],
          );
      });
    },
    async rotateCal(companyId) {
      const secret = crypto.randomBytes(32).toString("hex"),
        endpoint = crypto.randomUUID();
      await tx(async (client) => {
        await ensure(client, companyId);
        await client.query(
          "UPDATE whatsapp_cloud.automation_settings SET cal_endpoint=$2,cal_secret=$3,cal_enabled=true,updated_at=now() WHERE company_id=$1",
          [companyId, endpoint, encryptToken(secret, encryptionKey)],
        );
      });
      return { secret, path: `/webhooks/cal/${endpoint}` };
    },
    async revokeCal(companyId) {
      await pool.query(
        "UPDATE whatsapp_cloud.automation_settings SET cal_enabled=false,cal_secret=NULL WHERE company_id=$1",
        [companyId],
      );
    },
    async receiveCal(endpoint, raw, signature) {
      if (!UUID.test(endpoint || "")) error(404, "NOT_FOUND", "Webhook no encontrado.");
      const settings = (
        await pool.query(
          "SELECT company_id,cal_secret FROM whatsapp_cloud.automation_settings WHERE cal_endpoint=$1 AND cal_enabled=true",
          [endpoint],
        )
      ).rows[0];
      if (
        !settings ||
        !verifyCalSignature(raw, signature, decryptToken(settings.cal_secret, encryptionKey))
      )
        error(403, "INVALID_CAL_SIGNATURE", "Firma de Cal.com inválida.");
      let input;
      try {
        input = parseCalEvent(JSON.parse(raw.toString("utf8")), validateAutomation);
      } catch {
        error(
          400,
          "INVALID_CAL_EVENT",
          "Revisa el webhook estándar, teléfono internacional y consentimiento de Cal.com. Solo se admiten reservas individuales aceptadas.",
        );
      }
      if (!input) return { ignored: true };
      const canonical = JSON.stringify(input);
      const id = digest(`${settings.company_id}:${canonical}`);
      // Solo guarda los campos necesarios cifrados; no conserva notas médicas, email ni ICS.
      const inserted = await pool.query(
        "INSERT INTO whatsapp_cloud.cal_events(id,company_id,encrypted_payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
        [id, settings.company_id, encryptToken(canonical, encryptionKey)],
      );
      return { queued: true, duplicate: inserted.rowCount === 0 };
    },
    async processCal() {
      return tx(async (client) => {
        const item = (
          await client.query(
            "SELECT * FROM whatsapp_cloud.cal_events WHERE state='pending' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
          )
        ).rows[0];
        if (!item) return false;
        await client.query("SAVEPOINT cal_import");
        try {
          const settings = (
            await client.query(
              "SELECT cal_enabled FROM whatsapp_cloud.automation_settings WHERE company_id=$1",
              [item.company_id],
            )
          ).rows[0];
          if (!settings?.cal_enabled) throw new Error("CAL_DISABLED");
          const input = JSON.parse(decryptToken(item.encrypted_payload, encryptionKey));
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
            `cal-company:${item.company_id}`,
          ]);
          async function apply(event) {
            const old = (
              await client.query(
                "SELECT * FROM whatsapp_cloud.cal_booking_versions WHERE company_id=$1 AND booking_id=$2",
                [item.company_id, event.bookingId],
              )
            ).rows[0];
            if (
              old &&
              (Date.parse(event.eventAt) < +new Date(old.event_at) ||
                (old.cancelled && event.event !== "cancelled"))
            )
              return;
            if (event.event === "cancelled") {
              const existing = await client.query(
                "SELECT reservation_id FROM whatsapp_cloud.external_bookings WHERE company_id=$1 AND booking_id=$2",
                [item.company_id, event.bookingId],
              );
              if (existing.rowCount) await importBooking(item.company_id, event, client);
            } else await importBooking(item.company_id, event, client);
            await client.query(
              "INSERT INTO whatsapp_cloud.cal_booking_versions(company_id,booking_id,event_at,cancelled) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,booking_id) DO UPDATE SET event_at=excluded.event_at,cancelled=excluded.cancelled",
              [item.company_id, event.bookingId, event.eventAt, event.event === "cancelled"],
            );
          }
          if (input.previousUid)
            await apply({
              event: "cancelled",
              bookingId: input.previousUid,
              eventAt: input.eventAt,
            });
          await apply(input);
          await client.query(
            "UPDATE whatsapp_cloud.cal_events SET state='done',encrypted_payload=NULL WHERE id=$1",
            [item.id],
          );
          await client.query(
            "UPDATE whatsapp_cloud.automation_settings SET cal_last_event_at=now(),cal_last_result='IMPORTED' WHERE company_id=$1",
            [item.company_id],
          );
        } catch (failure) {
          await client.query("ROLLBACK TO SAVEPOINT cal_import");
          const code =
            failure instanceof HttpError
              ? failure.code
              : failure.message === "CAL_DISABLED"
                ? "CAL_DISABLED"
                : "CAL_IMPORT_FAILED";
          await client.query(
            "UPDATE whatsapp_cloud.cal_events SET attempts=attempts+1,last_code=$2,state=CASE WHEN attempts>=4 OR $2='CAL_DISABLED' THEN 'failed' ELSE 'pending' END,available_at=now()+interval '1 minute' WHERE id=$1",
            [item.id, code],
          );
          await client.query(
            "UPDATE whatsapp_cloud.automation_settings SET cal_last_event_at=now(),cal_last_result=$2 WHERE company_id=$1",
            [item.company_id, code],
          );
        }
        return true;
      });
    },
    async claim() {
      return tx(async (client) => {
        const job = (
          await client.query(
            `SELECT j.* FROM whatsapp_cloud.jobs j JOIN whatsapp_cloud.automation_settings s ON s.company_id=j.company_id
           WHERE s.enabled AND s.next_dispatch_at<=now() AND j.due_at<=now() AND j.available_at<=now()
           AND (j.state IN ('pending','blocked') OR (j.state='processing' AND j.leased_until<now()))
           ORDER BY j.due_at,j.kind FOR UPDATE OF j,s SKIP LOCKED LIMIT 1`,
          )
        ).rows[0];
        if (!job) return null;
        const lease = crypto.randomUUID();
        await client.query(
          "UPDATE whatsapp_cloud.jobs SET state='processing',lease_id=$2,leased_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE id=$1",
          [job.id, lease],
        );
        // Tope distribuido de una salida/segundo por negocio, incluso con varias réplicas.
        await client.query(
          "UPDATE whatsapp_cloud.automation_settings SET next_dispatch_at=now()+interval '1 second' WHERE company_id=$1",
          [job.company_id],
        );
        return { ...job, lease_id: lease, attempts: job.attempts + 1 };
      });
    },
    async context(job) {
      return (
        await pool.query(
          `SELECT r.starts_at,r.status,r.customer_response,r.whatsapp_authorized,c.full_name,c.phone,b.owner_id,w.timezone,s.enabled
         FROM public.reservations r JOIN public.customers c ON c.company_id=r.company_id AND c.id=r.customer_id
         JOIN public.companies b ON b.id=r.company_id JOIN whatsapp_cloud.companies w ON w.company_id=r.company_id
         JOIN whatsapp_cloud.automation_settings s ON s.company_id=r.company_id WHERE r.company_id=$1 AND r.id=$2`,
          [job.company_id, job.reservation_id],
        )
      ).rows[0];
    },
    async finish(job, state, code, requestId = null, retrySeconds = 0) {
      await tx(async (client) => {
        const updated = await client.query(
          "UPDATE whatsapp_cloud.jobs SET state=$3,last_code=$4,request_id=coalesce($5,request_id),available_at=now()+make_interval(secs=>$6),due_at=case when $4='QUIET_HOURS' then now()+make_interval(secs=>$6) else due_at end,leased_until=NULL,updated_at=now() WHERE id=$1 AND lease_id=$2 AND state='processing' RETURNING id",
          [job.id, job.lease_id, state, code, requestId, retrySeconds],
        );
        if (updated.rowCount && state === "sent" && job.kind === "reminder")
          await client.query(
            "UPDATE public.reservations SET reminder_sent_at=now() WHERE company_id=$1 AND id=$2 AND starts_at=$3 AND status='confirmed'",
            [job.company_id, job.reservation_id, job.starts_at],
          );
      });
    },
    async cleanup() {
      await pool.query(
        "UPDATE whatsapp_cloud.cal_events SET encrypted_payload=NULL,state='failed',last_code='EVENT_EXPIRED' WHERE encrypted_payload IS NOT NULL AND created_at<now()-interval '7 days'",
      );
    },
  };
}

async function runAutomationJob({ db, config, deliver, validateSend, clock = Date.now }, job) {
  const dispatchNow = clock();
  const context = await db.native.context(job);
  if (
    !context?.enabled ||
    context.status !== "confirmed" ||
    +new Date(context.starts_at) !== +new Date(job.starts_at)
  )
    return db.native.finish(job, "cancelled", "BOOKING_CHANGED");
  if (+new Date(context.starts_at) <= dispatchNow)
    return db.native.finish(job, "skipped", "APPOINTMENT_PAST");
  if (context.whatsapp_authorized !== true)
    return db.native.finish(job, "skipped", "CONSENT_REQUIRED");
  if (job.kind === "reminder" && context.customer_response === "reschedule_requested")
    return db.native.finish(job, "skipped", "RESCHEDULE_REQUESTED");
  if (job.kind === "reminder" && config.quietHours !== false) {
    const now = dispatchNow,
      allowed = nextReminderTime(now, context.timezone);
    if (allowed > now)
      return db.native.finish(
        job,
        allowed >= +new Date(context.starts_at) ? "skipped" : "blocked",
        allowed >= +new Date(context.starts_at) ? "QUIET_HOURS_TOO_LATE" : "QUIET_HOURS",
        null,
        Math.ceil((allowed - now) / 1000),
      );
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: context.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(context.starts_at));
    const part = (type) => parts.find((p) => p.type === type).value;
    const input = validateSend(
      {
        companyId: job.company_id,
        reservationId: job.reservation_id,
        phone: context.phone,
        patientName: context.full_name,
        date: `${part("year")}-${part("month")}-${part("day")}`,
        time: `${part("hour")}:${part("minute")}`,
        notificationKind: job.kind,
      },
      `auto:${job.id}`,
    );
    const result = await deliver(input, context.owner_id);
    if (result.status === 200)
      return db.native.finish(job, "sent", "META_ACCEPTED", result.body.requestId);
    return db.native.finish(
      job,
      result.body.error === "META_REJECTED" ? "failed" : "review",
      result.body.error,
      result.body.requestId,
    );
  } catch (failure) {
    const code = failure.code || "SERVICE_UNAVAILABLE";
    const review = ["SEND_PENDING_REVIEW", "IDEMPOTENCY_CONFLICT", "PREVIOUS_SEND_FAILED"].includes(
      code,
    );
    const skipped = ["CONSENT_REQUIRED", "APPOINTMENT_AMBIGUOUS"].includes(code);
    const blocked = failure.status === 403 || code === "TENANT_TOKEN_INVALID";
    const state = review
      ? "review"
      : skipped
        ? "skipped"
        : blocked
          ? "blocked"
          : job.attempts >= 8
            ? "failed"
            : "pending";
    return db.native.finish(
      job,
      state,
      code,
      null,
      blocked ? 300 : Math.min(300, 5 * 2 ** Math.min(job.attempts, 6)),
    );
  }
}

function installCalWebhook(app, { db, HttpError, rawParser }) {
  app.post("/webhooks/cal/:endpoint", rawParser, async (req, res, next) => {
    try {
      if (!db.native)
        throw new HttpError(503, "AUTOMATION_UNAVAILABLE", "La automatización no está disponible.");
      res
        .status(202)
        .json(
          await db.native.receiveCal(req.params.endpoint, req.body, req.get("x-cal-signature-256")),
        );
    } catch (error) {
      next(error);
    }
  });
}

function installNativeRoutes(app, { db, authenticate, HttpError }) {
  const wrap = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  const owned = async (req, companyId) => {
    const owner = await authenticate(req.get("Authorization"));
    if (
      !UUID.test(companyId || "") ||
      !(await db.companies.isOwner({ company_id: companyId, owner_id: owner }))
    )
      throw new HttpError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  };
  app.get(
    "/api/automation/:companyId",
    wrap(async (req, res) => {
      await owned(req, req.params.companyId);
      res.json(await db.native.info(req.params.companyId));
    }),
  );
  app.post(
    "/api/automation/settings",
    wrap(async (req, res) => {
      await owned(req, req.body?.companyId);
      await db.native.configure(req.body.companyId, req.body);
      res.json({ saved: true });
    }),
  );
  app.post(
    "/api/automation/cal/connect",
    wrap(async (req, res) => {
      await owned(req, req.body?.companyId);
      res.status(201).json(await db.native.rotateCal(req.body.companyId));
    }),
  );
  app.post(
    "/api/automation/cal/disconnect",
    wrap(async (req, res) => {
      await owned(req, req.body?.companyId);
      await db.native.revokeCal(req.body.companyId);
      res.json({ disconnected: true });
    }),
  );
}

function startAutomationWorker({
  db,
  config,
  deliver,
  validateSend,
  logger = console,
  pollMs = 5000,
}) {
  let stopped = false,
    timer,
    active,
    cleanupAt = 0;
  async function tick() {
    let processedJobs = false;
    try {
      for (let i = 0; i < 20 && !stopped; i++) if (!(await db.native.processCal())) break;
      const jobs = [];
      for (let i = 0; i < 4 && !stopped; i++) {
        const job = await db.native.claim();
        if (!job) break;
        jobs.push(job);
      }
      processedJobs = jobs.length > 0;
      const results = await Promise.allSettled(
        jobs.map((job) => runAutomationJob({ db, config, deliver, validateSend }, job)),
      );
      if (results.some((result) => result.status === "rejected"))
        logger.error("[automation] Un trabajo se recuperará tras vencer su lease.");
      if (Date.now() - cleanupAt > 3600000) {
        await db.native.cleanup();
        cleanupAt = Date.now();
      }
    } catch {
      logger.error("[automation] Trabajo pendiente en la cola persistente.");
    }
    if (!stopped) {
      timer = setTimeout(
        () => {
          active = tick();
        },
        processedJobs ? 1000 : pollMs,
      );
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

module.exports = {
  createNativeAutomation,
  installNativeRoutes,
  installCalWebhook,
  startAutomationWorker,
  runAutomationJob,
  verifyCalSignature,
  parseCalEvent,
};
