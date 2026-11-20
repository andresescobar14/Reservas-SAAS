import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPreviewConversations,
  filterConversations,
  latestInboundAt,
  previewReply,
  serviceWindow,
} from "../lib/inbox";
const now = Date.parse("2026-11-18T14:00:00Z");
test("La ventana requiere un mensaje entrante válido y cierra exactamente a las 24 horas", () => {
  assert.equal(serviceWindow(null, now).open, false);
  assert.equal(serviceWindow("invalid", now).open, false);
  assert.equal(serviceWindow(new Date(now + 1000).toISOString(), now).open, false);
  assert.equal(serviceWindow(new Date(now - 86400000).toISOString(), now).open, false);
  assert.equal(serviceWindow(new Date(now - 86399999).toISOString(), now).open, true);
});
test("Una respuesta tardía no cierra la ventana renovada por otro mensaje del cliente", () => {
  const expired = new Date(now - 86400000).toISOString();
  const renewed = new Date(now - 1000).toISOString();
  assert.equal(serviceWindow(expired, now).open, false);
  const latest = latestInboundAt(renewed, expired);
  assert.equal(latest, renewed);
  assert.equal(serviceWindow(latest, now).open, true);
  assert.equal(latestInboundAt(expired, renewed), renewed);
  assert.equal(latestInboundAt(renewed, null), renewed);
});
test("La actualización de la ventana conserva solo fechas válidas de mensajes entrantes", () => {
  const received = new Date(now - 1000).toISOString();
  assert.equal(latestInboundAt(null, received), received);
  assert.equal(latestInboundAt("invalid", received), received);
  assert.equal(latestInboundAt(received, "invalid"), received);
  assert.equal(latestInboundAt(null, "invalid"), null);
  assert.equal(latestInboundAt(null, null), null);
});
test("La vista previa permite responder solo dentro de la ventana y no la renueva al enviar", () => {
  const sample = createPreviewConversations(new Date(now).toISOString());
  const reply = previewReply(sample[0], "Hola, te esperamos.", now);
  assert.equal(reply.messages.at(-1)?.delivery, "simulated");
  assert.equal(reply.lastInboundAt, sample[0].lastInboundAt);
  assert.throws(() => previewReply(sample[3], "Hola", now), /ventana/);
  assert.throws(() => previewReply(sample[0], " ", now), /4096/);
  assert.throws(() => previewReply(sample[0], "a".repeat(4097), now), /4096/);
});
test("Búsqueda por nombre sin acentos, teléfono formateado y filtros de lectura/ventana", () => {
  const sample = createPreviewConversations(new Date(now).toISOString());
  assert.equal(filterConversations(sample, "martinez", "all", now)[0].name, "Ana Martínez");
  assert.equal(filterConversations(sample, "+52 55 0000 0101", "all", now)[0].name, "Ana Martínez");
  assert.equal(filterConversations(sample, "", "unread", now).length, 2);
  assert.equal(filterConversations(sample, "", "closed", now)[0].name, "Valeria Torres");
});
