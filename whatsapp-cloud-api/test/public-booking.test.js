const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  express = require("express");
const { PGlite } = require("@electric-sql/pglite");
const { createPublicBooking, installPublicBookingRoutes } = require("../public-booking");
const { HttpError } = require("../server");
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("Reserva pública real: disponibilidad privada, consentimiento, cola, aislamiento e idempotencia", async (t) => {
  const sql = new PGlite();
  await sql.waitReady;
  t.after(() => sql.close());
  await sql.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role reserva_whatsapp nologin nosuperuser nobypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`);
  await sql.exec(fs.readFileSync(path.join(__dirname, "../../supabase-schema.sql"), "utf8"));
  for (const file of [
    "schema.sql",
    "runtime-role.sql",
    "onboarding.sql",
    "automation.sql",
    "native-automation.sql",
    "public-booking.sql",
    "public-booking.sql",
  ])
    await sql.exec(
      fs
        .readFileSync(path.join(__dirname, "..", file), "utf8")
        .replace("grant connect on database postgres to reserva_whatsapp;", ""),
    );
  await sql.exec(`insert into auth.users(id,raw_user_meta_data) values ('11111111-1111-4111-8111-111111111111','{"company_name":"Propietario","timezone":"America/Caracas"}'),('22222222-2222-4222-8222-222222222222','{"company_name":"Otro negocio"}');
    update public.companies set id='${COMPANY}',internal_owner_access=true where name='Propietario';
    update public.companies set id='${OTHER}' where name='Otro negocio';
    insert into whatsapp_cloud.companies(company_id) values('${COMPANY}'),('${OTHER}');
    insert into whatsapp_cloud.automation_settings(company_id,enabled) values('${COMPANY}',true);
    insert into whatsapp_cloud.booking_pages(slug,company_id,title,service,enabled,weekdays,opens_at,closes_at,slot_step_minutes)
      values('reservas-codesc','${COMPANY}','Reservas - Codesc','Demostración de Reservas',true,array[1,2,3,4,5,6,7],'00:00','24:00',1);`);
  const admin = async (query, params = []) => {
    await sql.exec("reset role");
    try {
      return await sql.query(query, params);
    } finally {
      await sql.exec("set role reserva_whatsapp");
    }
  };
  const store = createPublicBooking({ pool: { query: (q, p) => sql.query(q, p) } });
  await sql.exec("set role reserva_whatsapp");
  const page = await store.page("reservas-codesc");
  assert.equal(page.businessName, "Reservas - Codesc");
  assert.equal(page.timezone, "America/Caracas");
  assert.equal(page.durationMinutes, 30);
  assert.ok(page.slots.length > 0);
  assert.equal(JSON.stringify(page).includes(COMPANY), false);
  assert.equal(JSON.stringify(page).includes("phone"), false);
  assert.equal(await store.page("missing"), null);
  const input = {
    fullName: "Cliente de prueba",
    phone: "+584121111111",
    startsAt: new Date(page.slots[0].startsAt).toISOString(),
    whatsappConsent: true,
  };
  const fingerprint = "a".repeat(64),
    phoneHash = "b".repeat(64),
    key = crypto.randomUUID();
  const receipt = await store.book("reservas-codesc", key, input, fingerprint, phoneHash);
  assert.equal(receipt.confirmationScheduled, true);
  assert.ok(receipt.reservationId);
  assert.equal(
    (await admin("select count(*)::int as n from whatsapp_cloud.public_booking_requests")).rows[0]
      .n,
    1,
  );
  assert.equal(
    (await admin("select company_id,whatsapp_authorized from public.reservations")).rows[0]
      .company_id,
    COMPANY,
  );
  assert.equal(
    (await admin("select evidence from whatsapp_cloud.consents")).rows[0].evidence.includes(
      "public-booking-v1",
    ),
    true,
  );
  assert.equal(
    (await store.book("reservas-codesc", key, input, fingerprint, phoneHash)).reservationId,
    receipt.reservationId,
  );
  await assert.rejects(
    store.book("reservas-codesc", key, input, "c".repeat(64), phoneHash),
    /REQUEST_CONFLICT/,
  );
  await assert.rejects(
    store.book("reservas-codesc", crypto.randomUUID(), input, fingerprint, phoneHash),
    /SLOT_UNAVAILABLE/,
  );
  const updated = await store.page("reservas-codesc", page.selectedDate);
  assert.equal(
    updated.slots.some((slot) => new Date(slot.startsAt).toISOString() === input.startsAt),
    false,
  );
  const next = (await store.page("reservas-codesc", page.dates.at(-1))).slots[0];
  const withoutConsent = await store.book(
    "reservas-codesc",
    crypto.randomUUID(),
    {
      ...input,
      phone: "+584122222222",
      startsAt: new Date(next.startsAt).toISOString(),
      whatsappConsent: false,
    },
    "d".repeat(64),
    "e".repeat(64),
  );
  assert.equal(withoutConsent.confirmationScheduled, false);
  assert.equal(withoutConsent.reminderAt, null);
  assert.equal(
    (
      await admin("select count(*)::int as n from whatsapp_cloud.jobs where reservation_id=$1", [
        withoutConsent.reservationId,
      ])
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    store.book(
      "reservas-codesc",
      crypto.randomUUID(),
      { ...input, startsAt: "2020-01-01T10:00:00Z" },
      fingerprint,
      phoneHash,
    ),
    /INVALID_SLOT/,
  );
  await sql.exec("reset role;set role anon");
  await assert.rejects(
    sql.query("select * from whatsapp_cloud.booking_pages"),
    /permission denied/,
  );
  await assert.rejects(
    sql.query(
      "select whatsapp_cloud.book_public_reservation('reservas-codesc',null,null,null,null,null,null,null)",
    ),
    /permission denied/,
  );
  await sql.exec("reset role;set role authenticated");
  await assert.rejects(
    sql.query("select * from whatsapp_cloud.public_booking_requests"),
    /permission denied/,
  );
  await sql.exec("reset role");
  // Dashboard inserts are also guarded against overlapping a public booking.
  const customer = (
    await sql.query("select customer_id from public.reservations where id=$1", [
      receipt.reservationId,
    ])
  ).rows[0].customer_id;
  await assert.rejects(
    sql.query(
      "insert into public.reservations(company_id,customer_id,service,starts_at,ends_at) values($1,$2,'Otro servicio',$3,$3::timestamptz+interval '30 minutes')",
      [COMPANY, customer, input.startsAt],
    ),
    /SLOT_UNAVAILABLE/,
  );
  const future = await store.page("reservas-codesc", page.dates.at(-1));
  const contactHash = "f".repeat(64);
  for (let i = 0; i < 3; i++)
    await store.book(
      "reservas-codesc",
      crypto.randomUUID(),
      {
        ...input,
        phone: "+584123333333",
        startsAt: new Date(future.slots[i * 31 + 60].startsAt).toISOString(),
      },
      fingerprint,
      contactHash,
    );
  await assert.rejects(
    store.book(
      "reservas-codesc",
      crypto.randomUUID(),
      {
        ...input,
        phone: "+584123333333",
        startsAt: new Date(future.slots[160].startsAt).toISOString(),
      },
      fingerprint,
      contactHash,
    ),
    /BOOKING_LIMIT/,
  );
});

test("API pública: prueba firmada, campos protegidos, consentimiento explícito y límite de solicitudes", async (t) => {
  let now = Date.now(),
    calls = [];
  const app = express();
  app.use(express.json());
  installPublicBookingRoutes(app, {
    config: { buttonSecret: "x".repeat(32) },
    HttpError,
    clock: () => now,
    db: {
      publicBooking: {
        async page(slug) {
          return slug === "reservas-codesc" ? { slug, slots: [] } : null;
        },
        async book(...args) {
          calls.push(args);
          return { reservationId: crypto.randomUUID() };
        },
      },
    },
  });
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.code, message: error.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}/api/public-booking/reservas-codesc`;
  const result = await (await fetch(base)).json();
  now += 2100;
  const body = {
    fullName: "Ana Prueba",
    phone: "+584121111111",
    startsAt: new Date(now + 3600000).toISOString(),
    whatsappConsent: true,
    challenge: result.challenge,
    companyId: OTHER,
    service: "Manipulado",
  };
  const post = (input) =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  assert.equal((await post({ ...body, challenge: body.challenge + "a" })).status, 400);
  assert.equal((await post({ ...body, whatsappConsent: "true" })).status, 400);
  assert.equal((await post({ ...body, website: "bot.example" })).status, 400);
  assert.equal((await post(body)).status, 201);
  assert.equal(calls[0][0], "reservas-codesc");
  assert.equal(calls[0][2].companyId, undefined);
  assert.equal(calls[0][2].service, undefined);
  assert.equal(calls[0][2].whatsappConsent, true);
  assert.equal((await fetch(base + "?date=2026-02-31")).status, 400);
  for (let i = 0; i < 6; i++) await post(body);
  assert.equal((await post(body)).status, 429);
});
