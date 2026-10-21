import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Esquema y aislamiento multi-tenant en PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    // Equivalente mínimo de los roles y Auth que Supabase provee.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase-schema.sql", import.meta.url), "utf8"));
    const ownerA = "11111111-1111-4111-8111-111111111111";
    const ownerB = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id, raw_user_meta_data) values ($1, $2), ($3, $4)", [
      ownerA,
      { company_name: "Negocio A", timezone: "America/Caracas", subscription_status: "active" },
      ownerB,
      { company_name: "Negocio B" },
    ]);
    const { rows: companies } = await db.query<{
      id: string;
      owner_id: string;
      subscription_status: string;
      trial_days: number;
    }>(
      "select *, extract(epoch from (trial_ends_at-created_at))/86400 as trial_days from companies order by name",
    );
    const [companyA, companyB] = companies;
    const asOwner = async (id: string) => {
      await db.exec("reset role; set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    };
    let customerA: string;
    let customerB: string;
    let bookingA: string;
    let bookingB: string;

    await t.test(
      "El registro crea una empresa con exactamente 14 días; ignora el plan enviado por el cliente",
      () => {
        assert.equal(companies.length, 2);
        assert.equal(companyA.subscription_status, "trial");
        assert.equal(Number(companyA.trial_days), 14);
      },
    );

    await t.test("Cada propietario puede guardar cliente y reserva de su empresa", async () => {
      await asOwner(ownerA);
      const resultA = await db.query<{ id: string }>(
        "select public.book_reservation($1, 'Ana Prueba', '+584121111111', 'Consulta', now() + interval '2 days', now() + interval '2 days 1 hour') as id",
        [companyA.id],
      );
      bookingA = resultA.rows[0].id;
      customerA = (await db.query<{ id: string }>("select id from customers")).rows[0].id;
      await asOwner(ownerB);
      const resultB = await db.query<{ id: string }>(
        "select public.book_reservation($1, 'Luis Prueba', '+584122222222', 'Servicio', now() + interval '3 days', now() + interval '3 days 1 hour') as id",
        [companyB.id],
      );
      bookingB = resultB.rows[0].id;
      customerB = (await db.query<{ id: string }>("select id from customers")).rows[0].id;
      assert.ok(bookingA && bookingB && customerA && customerB);
    });

    await t.test("No puede leer, actualizar ni eliminar filas de otra empresa", async () => {
      await asOwner(ownerA);
      assert.equal((await db.query("select * from companies")).rows.length, 1);
      assert.equal(
        (await db.query("select * from customers where company_id = $1", [companyB.id])).rows
          .length,
        0,
      );
      assert.equal(
        (await db.query("select * from reservations where id = $1", [bookingB])).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query("update customers set full_name = 'Intruso' where id = $1 returning id", [
            customerB,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("delete from customers where id = $1 returning id", [customerB])).rows
          .length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update reservations set status = 'cancelled' where id = $1 returning id",
            [bookingB],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query("delete from reservations where id = $1 returning id", [bookingB])).rows
          .length,
        0,
      );
      await assert.rejects(
        db.query(
          "insert into customers(company_id, full_name, phone) values ($1, 'Intruso', '+584123333333')",
          [companyB.id],
        ),
        /row-level security/,
      );
    });

    await t.test(
      "La FK compuesta impide mezclar un cliente de otra empresa en una reserva",
      async () => {
        await assert.rejects(
          db.query(
            "insert into reservations(company_id, customer_id, service, starts_at, ends_at) values ($1, $2, 'Cruce', now(), now() + interval '1 hour')",
            [companyA.id, customerB],
          ),
          /foreign key/,
        );
      },
    );

    await t.test(
      "Los campos de suscripción, propietario y recordatorios no son editables por el cliente",
      async () => {
        for (const statement of [
          "update companies set subscription_status = 'active'",
          "update companies set trial_ends_at = now() + interval '1 year'",
          `update companies set owner_id = '${ownerB}'`,
          "insert into companies(owner_id, name) values (auth.uid(), 'Otra empresa')",
          "update reservations set reminder_sent_at = now()",
          `update customers set company_id = '${companyB.id}'`,
        ])
          await assert.rejects(db.exec(statement), /permission denied/);
        assert.equal(
          (await db.query("update companies set name = 'Nombre actualizado' returning id")).rows
            .length,
          1,
        );
      },
    );

    await t.test(
      "La función de reservas es atómica y calcula el recordatorio 24 horas antes",
      async () => {
        const reminder = await db.query<{ hours: number }>(
          "select extract(epoch from (starts_at - reminder_due_at))/3600 as hours from reservations where id = $1",
          [bookingA],
        );
        assert.equal(Number(reminder.rows[0].hours), 24);
        await assert.rejects(
          db.query(
            "select public.book_reservation($1, 'Cliente fallido', '+584124444444', 'Fecha inválida', now(), now() - interval '1 hour')",
            [companyA.id],
          ),
          /check constraint/,
        );
        assert.equal(
          (await db.query("select * from customers where phone = '+584124444444'")).rows.length,
          0,
        );
        await db.query(
          "select public.book_reservation($1, 'Ana Actualizada', '+584121111111', 'Otra consulta', now() + interval '4 days', now() + interval '4 days 1 hour')",
          [companyA.id],
        );
        assert.equal((await db.query("select * from customers")).rows.length, 1);
      },
    );

    await t.test(
      "Al expirar la prueba se bloquean lectura y escritura; facturación sigue visible",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update companies set trial_ends_at = now() - interval '1 second' where id = $1",
          [companyA.id],
        );
        await asOwner(ownerA);
        assert.equal((await db.query("select * from companies")).rows.length, 1);
        assert.equal((await db.query("select * from customers")).rows.length, 0);
        assert.equal((await db.query("select * from reservations")).rows.length, 0);
        await assert.rejects(
          db.query(
            "insert into customers(company_id, full_name, phone) values ($1, 'Bloqueado', '+584125555555')",
            [companyA.id],
          ),
          /row-level security/,
        );
        assert.equal(
          (await db.query("update reservations set status = 'completed' returning id")).rows.length,
          0,
        );
        assert.equal((await db.query("delete from customers returning id")).rows.length, 0);
        await db.exec("reset role");
        await db.query("update companies set subscription_status = 'active' where id = $1", [
          companyA.id,
        ]);
        await asOwner(ownerA);
        assert.equal((await db.query("select * from customers")).rows.length, 1);
        await db.exec("reset role");
        await db.query("update companies set subscription_status = 'past_due' where id = $1", [
          companyA.id,
        ]);
        await asOwner(ownerA);
        assert.equal((await db.query("select * from customers")).rows.length, 0);
      },
    );

    await t.test(
      "Los visitantes anónimos no pueden acceder a datos ni crear reservas",
      async () => {
        await db.exec("reset role; set role anon");
        for (const table of ["companies", "customers", "reservations"]) {
          for (const statement of [
            `select * from ${table}`,
            `delete from ${table}`,
            `update ${table} set id = id`,
            `insert into ${table} default values`,
          ]) {
            await assert.rejects(db.exec(statement), /permission denied/);
          }
        }
        await assert.rejects(
          db.query(
            "select public.book_reservation($1, 'Anon', '+584126666666', 'Servicio', now(), now() + interval '1 hour')",
            [companyA.id],
          ),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
