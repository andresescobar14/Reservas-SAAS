import "server-only";
import { cookies } from "next/headers";
import {
  EMAIL_VERIFICATION_COOKIE,
  readVerificationReceipt,
  type EmailIdentity,
} from "@/lib/verification-receipt";

export function getEmailVerificationSecret() {
  const secret = process.env.EMAIL_VERIFICATION_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

export async function getOptionalEmailVerification(identity: EmailIdentity) {
  const secret = getEmailVerificationSecret();
  if (!secret) return { available: false, verifiedAt: null };
  const cookieStore = await cookies();
  return {
    available: true,
    verifiedAt: readVerificationReceipt(
      cookieStore.get(EMAIL_VERIFICATION_COOKIE)?.value,
      secret,
      identity,
    ),
  };
}
