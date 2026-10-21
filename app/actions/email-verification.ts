"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCompany } from "@/lib/tenant";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createIsolatedAuthClient } from "@/lib/isolated-auth-client";
import { getEmailVerificationSecret } from "@/lib/email-verification";
import { authErrorFeedback } from "@/lib/auth-errors";
import {
  createVerificationReceipt,
  EMAIL_VERIFICATION_COOKIE,
  EMAIL_VERIFICATION_TTL,
} from "@/lib/verification-receipt";
import type { EmailVerificationResult } from "@/lib/types";

function createCodeClient() {
  // La solicitud/validación de OTP no reemplaza las cookies de la sesión actual.
  return createIsolatedAuthClient(getSupabaseConfig());
}

export async function requestEmailCode(): Promise<EmailVerificationResult> {
  const { user } = await requireCompany();
  if (!user.email) return { error: "Esta cuenta no tiene una dirección de correo disponible." };
  if (!getEmailVerificationSecret())
    return {
      error: "La verificación opcional aún no está configurada. Puedes seguir usando tu cuenta.",
    };
  const { error } = await createCodeClient().auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    const result = authErrorFeedback(error, "verify-email");
    console.warn("[auth:email-code]", { code: result.errorCode, status: error.status });
    return result;
  }
  return {
    success: "Código solicitado. Revisa la bandeja de entrada y spam.",
    retryAfterSeconds: 60,
  };
}

export async function confirmEmailCode(formData: FormData): Promise<EmailVerificationResult> {
  const { supabase, user } = await requireCompany();
  const token = z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Introduce los 6 dígitos del código.")
    .safeParse(formData.get("code"));
  if (!token.success) return { error: token.error.issues[0].message };
  const secret = getEmailVerificationSecret();
  if (!secret || !user.email)
    return { error: "La verificación no está disponible. Puedes seguir usando tu cuenta." };
  const { data, error } = await createCodeClient().auth.verifyOtp({
    email: user.email,
    token: token.data,
    type: "email",
  });
  if (error) return authErrorFeedback(error, "verify-email");
  if (
    !data.session ||
    data.user?.id !== user.id ||
    data.user.email?.toLowerCase() !== user.email.toLowerCase()
  ) {
    return { error: "El código no corresponde a la cuenta actual. Solicita uno nuevo." };
  }
  // Solo se guarda la nueva sesión después de comprobar que es la misma cuenta.
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (sessionError) return authErrorFeedback(sessionError, "verify-email");
  const verifiedAt = new Date().toISOString();
  const cookieStore = await cookies();
  cookieStore.set(
    EMAIL_VERIFICATION_COOKIE,
    createVerificationReceipt(
      secret,
      { userId: user.id, email: user.email },
      Date.parse(verifiedAt),
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: EMAIL_VERIFICATION_TTL,
    },
  );
  revalidatePath("/dashboard", "layout");
  return { success: "Tu correo quedó verificado en este navegador.", verifiedAt };
}
