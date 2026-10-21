import { createHmac, timingSafeEqual } from "node:crypto";

export const EMAIL_VERIFICATION_COOKIE = "reserva-email-verification";
export const EMAIL_VERIFICATION_TTL = 30 * 24 * 60 * 60;

export type EmailIdentity = { userId: string; email: string };
type Receipt = EmailIdentity & {
  purpose: "optional-email-v1";
  issuedAt: number;
  expiresAt: number;
};

export function createVerificationReceipt(
  secret: string,
  identity: EmailIdentity,
  now = Date.now(),
) {
  if (secret.length < 32) throw new Error("La clave de verificación no está configurada.");
  const payload: Receipt = {
    purpose: "optional-email-v1",
    userId: identity.userId,
    email: identity.email.toLowerCase(),
    issuedAt: now,
    expiresAt: now + EMAIL_VERIFICATION_TTL * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

// Es un comprobante para la UI en este navegador; nunca concede acceso a datos.
export function readVerificationReceipt(
  token: string | undefined,
  secret: string,
  identity: EmailIdentity,
  now = Date.now(),
): string | null {
  if (!token || token.length > 2048 || secret.length < 32) return null;
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    return null;
  try {
    const expected = createHmac("sha256", secret).update(parts[0]).digest();
    const received = Buffer.from(parts[1], "base64url");
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) return null;
    const receipt = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Receipt;
    if (
      receipt.purpose !== "optional-email-v1" ||
      receipt.userId !== identity.userId ||
      receipt.email !== identity.email.toLowerCase() ||
      !Number.isSafeInteger(receipt.issuedAt) ||
      receipt.issuedAt > now ||
      receipt.expiresAt !== receipt.issuedAt + EMAIL_VERIFICATION_TTL * 1000 ||
      receipt.expiresAt <= now
    )
      return null;
    return new Date(receipt.issuedAt).toISOString();
  } catch {
    return null;
  }
}
