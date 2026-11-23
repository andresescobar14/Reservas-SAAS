import assert from "node:assert/strict";
import test from "node:test";
import { bookingServiceUnavailable, readBookingResponse } from "../lib/public-booking";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("oculta el error de la plataforma cuando el servicio no está desplegado", async () => {
  const result = await readBookingResponse(
    json({ status: "error", code: 404, message: "Application not found" }, 404),
    "fallback",
  );
  assert.deepEqual(result, {
    ok: false,
    code: "SERVICE_UNAVAILABLE",
    message: bookingServiceUnavailable,
  });
});

test("muestra los mensajes propios del backend", async () => {
  const result = await readBookingResponse(
    json(
      { error: "PAGE_UNAVAILABLE", message: "Esta página de reservas no está disponible." },
      404,
    ),
    "fallback",
  );
  assert.deepEqual(result, {
    ok: false,
    code: "PAGE_UNAVAILABLE",
    message: "Esta página de reservas no está disponible.",
  });
});

test("tolera respuestas que no son JSON", async () => {
  const result = await readBookingResponse(new Response("<html>502</html>", { status: 502 }), "fb");
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.message, bookingServiceUnavailable);
});

test("devuelve los datos cuando la respuesta es correcta", async () => {
  const result = await readBookingResponse(json({ slug: "demo" }, 200), "fb");
  assert.deepEqual(result, { ok: true, data: { slug: "demo" } });
});
