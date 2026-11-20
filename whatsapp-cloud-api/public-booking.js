"use strict";
const crypto = require("node:crypto");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONSENT_VERSION = "public-booking-v1";

function createPublicBooking({ pool }) {
  return {
    async page(slug, date) {
      const page = (
        await pool.query(
          `select p.*,c.timezone from whatsapp_cloud.booking_pages p join public.companies c on c.id=p.company_id
        where p.slug=$1 and p.enabled and (c.internal_owner_access or c.subscription_status='active' or (c.subscription_status='trial' and c.trial_ends_at>now()))`,
          [slug],
        )
      ).rows[0];
      if (!page) return null;
      const dates = (
        await pool.query(
          `select ((now() at time zone $1)::date+i)::text as date from generate_series(0,$2::integer) i
        where extract(isodow from ((now() at time zone $1)::date+i))::integer=any($3::integer[])
        and (((now() at time zone $1)::date+i)+$4::time) at time zone $1>now()+make_interval(mins=>$5::integer)`,
          [page.timezone, page.horizon_days, page.weekdays, page.closes_at, page.notice_minutes],
        )
      ).rows.map((r) => r.date);
      const selectedDate = date || dates[0];
      const slots = dates.includes(selectedDate)
        ? (
            await pool.query(
              `select s at time zone $2 as "startsAt",(s+make_interval(mins=>$5::integer)) at time zone $2 as "endsAt"
        from generate_series($3::date+$4::time,$3::date+$6::time-make_interval(mins=>$5::integer),make_interval(mins=>$8::integer)) s
        where s at time zone $2>=now()+make_interval(mins=>$7::integer)
        and not exists(select 1 from public.reservations r where r.company_id=$1 and r.status='confirmed'
          and r.starts_at<(s+make_interval(mins=>$5::integer)) at time zone $2 and r.ends_at>s at time zone $2)`,
              [
                page.company_id,
                page.timezone,
                selectedDate,
                page.opens_at,
                page.duration_minutes,
                page.closes_at,
                page.notice_minutes,
                page.slot_step_minutes,
              ],
            )
          ).rows
        : [];
      return {
        slug: page.slug,
        businessName: page.title,
        service: page.service,
        durationMinutes: page.duration_minutes,
        timezone: page.timezone,
        noticeMinutes: page.notice_minutes,
        dates,
        selectedDate: selectedDate || null,
        slots,
        consentVersion: CONSENT_VERSION,
      };
    },
    async book(slug, requestId, input, fingerprint, phoneHash) {
      return (
        await pool.query(
          "select whatsapp_cloud.book_public_reservation($1,$2,$3,$4,$5,$6,$7,$8) as receipt",
          [
            slug,
            requestId,
            fingerprint,
            phoneHash,
            input.fullName,
            input.phone,
            input.startsAt,
            input.whatsappConsent,
          ],
        )
      ).rows[0].receipt;
    },
  };
}

function installPublicBookingRoutes(app, { db, config, HttpError, clock = Date.now }) {
  if (!db.publicBooking) return;
  // Front-door limits supplement transactional per-phone and per-company limits.
  const buckets = new Map();
  const fail = (status, code, message) => {
    throw new HttpError(status, code, message);
  };
  const hash = (value) =>
    crypto.createHmac("sha256", config.buttonSecret).update(value).digest("hex");
  const sign = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const challenge = (slug) => {
    const body = sign({ slug, id: crypto.randomUUID(), at: clock() });
    return `${body}.${hash(body)}`;
  };
  const wrap = (handler) => async (req, res, next) => {
    try {
      if (!SLUG.test(req.params.slug || "") || req.params.slug.length > 80)
        fail(404, "PAGE_UNAVAILABLE", "Esta página de reservas no está disponible.");
      const key = hash(`${req.ip}:${req.method}`),
        now = clock();
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.expires) {
        bucket = { count: 0, expires: now + 60000 };
        buckets.set(key, bucket);
      }
      if (++bucket.count > (req.method === "POST" ? 10 : 120))
        fail(429, "SLOW_DOWN", "Espera un minuto antes de volver a intentarlo.");
      if (buckets.size > 10000)
        for (const [k, v] of buckets) if (v.expires <= now) buckets.delete(k);
      await handler(req, res);
    } catch (e) {
      const messages = {
        PAGE_UNAVAILABLE: [404, "Esta página de reservas no está disponible."],
        SLOT_UNAVAILABLE: [409, "Ese horario acaba de ocuparse. Elige otro."],
        INVALID_SLOT: [400, "Elige uno de los horarios disponibles."],
        BOOKING_LIMIT: [
          429,
          "Se alcanzó el límite de reservas de prueba. Contacta con el negocio.",
        ],
        REQUEST_CONFLICT: [409, "Esta solicitud ya pertenece a otra reserva. Actualiza la página."],
        INVALID_BOOKING: [400, "Revisa los datos de la reserva."],
      };
      if (messages[e.message]) {
        const [status, message] = messages[e.message];
        return next(new HttpError(status, e.message, message));
      }
      next(e);
    }
  };
  app.get(
    "/api/public-booking/:slug",
    wrap(async (req, res) => {
      const date = req.query.date;
      if (
        date !== undefined &&
        (typeof date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date)
      )
        fail(400, "INVALID_DATE", "Elige una fecha válida.");
      const page = await db.publicBooking.page(req.params.slug, date);
      if (!page) fail(404, "PAGE_UNAVAILABLE", "Esta página de reservas no está disponible.");
      res.json({ ...page, challenge: challenge(req.params.slug) });
    }),
  );
  app.post(
    "/api/public-booking/:slug",
    wrap(async (req, res) => {
      const body = req.body;
      if (
        !body ||
        typeof body.fullName !== "string" ||
        body.fullName.trim().length < 2 ||
        body.fullName.trim().length > 100 ||
        typeof body.phone !== "string" ||
        !/^\+[1-9]\d{6,14}$/.test(body.phone) ||
        typeof body.whatsappConsent !== "boolean" ||
        typeof body.startsAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(body.startsAt) ||
        !Number.isFinite(Date.parse(body.startsAt)) ||
        typeof body.challenge !== "string" ||
        body.challenge.length > 600 ||
        body.website
      )
        fail(400, "INVALID_BOOKING", "Revisa tu nombre, teléfono internacional y horario.");
      const [encoded, signature, ...extra] = body.challenge.split(".");
      const expected = hash(encoded || "");
      if (
        extra.length ||
        !/^[a-f0-9]{64}$/.test(signature || "") ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        fail(400, "INVALID_CHALLENGE", "Actualiza los horarios y vuelve a intentarlo.");
      let proof;
      try {
        proof = JSON.parse(Buffer.from(encoded, "base64url").toString());
      } catch {
        fail(400, "INVALID_CHALLENGE", "Actualiza los horarios y vuelve a intentarlo.");
      }
      if (
        proof.slug !== req.params.slug ||
        !Number.isFinite(proof.at) ||
        clock() - proof.at < 2000 ||
        clock() - proof.at > 1800000 ||
        !/^[a-f0-9-]{36}$/.test(proof.id || "")
      )
        fail(400, "INVALID_CHALLENGE", "Actualiza los horarios y vuelve a intentarlo.");
      const input = {
        fullName: body.fullName.trim(),
        phone: body.phone,
        startsAt: new Date(body.startsAt).toISOString(),
        whatsappConsent: body.whatsappConsent,
      };
      const fingerprint = hash(JSON.stringify([req.params.slug, input, CONSENT_VERSION]));
      const receipt = await db.publicBooking.book(
        req.params.slug,
        proof.id,
        input,
        fingerprint,
        hash(`${req.params.slug}:${input.phone}`),
      );
      res.status(201).json({ receipt });
    }),
  );
}
module.exports = { createPublicBooking, installPublicBookingRoutes };
