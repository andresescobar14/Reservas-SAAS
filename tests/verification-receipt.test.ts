import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVerificationReceipt,
  readVerificationReceipt,
  EMAIL_VERIFICATION_TTL,
} from "../lib/verification-receipt";

const secret = "a-local-test-key-that-is-at-least-32-characters";
const identity = { userId: "owner-one", email: "owner@example.com" };
const now = Date.parse("2026-10-21T16:00:00Z");

test("El comprobante verificado solo pertenece a la misma cuenta y correo", () => {
  const receipt = createVerificationReceipt(secret, identity, now);
  assert.equal(
    readVerificationReceipt(receipt, secret, identity, now + 1000),
    new Date(now).toISOString(),
  );
  assert.equal(
    readVerificationReceipt(receipt, secret, { ...identity, userId: "owner-two" }, now),
    null,
  );
  assert.equal(
    readVerificationReceipt(receipt, secret, { ...identity, email: "another@example.com" }, now),
    null,
  );
});

test("Editar el contenido o la firma no permite fingir la verificación", () => {
  const receipt = createVerificationReceipt(secret, identity, now);
  const [body, signature] = receipt.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  const forgedBody = Buffer.from(
    JSON.stringify({ ...payload, email: "attacker@example.com" }),
  ).toString("base64url");
  assert.equal(
    readVerificationReceipt(
      `${forgedBody}.${signature}`,
      secret,
      { ...identity, email: "attacker@example.com" },
      now,
    ),
    null,
  );
  assert.equal(readVerificationReceipt(`${body}.${"A".repeat(43)}`, secret, identity, now), null);
});

test("La caducidad, la rotación de clave y los comprobantes futuros se invalidan", () => {
  const receipt = createVerificationReceipt(secret, identity, now);
  assert.equal(
    readVerificationReceipt(receipt, secret, identity, now + EMAIL_VERIFICATION_TTL * 1000),
    null,
  );
  assert.equal(readVerificationReceipt(receipt, secret + "rotated", identity, now), null);
  assert.equal(readVerificationReceipt(receipt, secret, identity, now - 1), null);
});

test("Un comprobante ausente o malformado no rompe la cuenta ni genera una verificación", () => {
  for (const receipt of [undefined, "", "bad.signature", "..", "a".repeat(3000)]) {
    assert.equal(readVerificationReceipt(receipt, secret, identity, now), null);
  }
  assert.equal(
    readVerificationReceipt(createVerificationReceipt(secret, identity, now), "", identity, now),
    null,
  );
  assert.throws(() => createVerificationReceipt("short", identity, now));
});
