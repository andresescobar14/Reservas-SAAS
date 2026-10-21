"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { authErrorFeedback } from "@/lib/auth-errors";
import { getAuthSettings } from "@/lib/supabase/auth-settings";
import { createIsolatedAuthClient } from "@/lib/isolated-auth-client";
import type { ActionResult } from "@/lib/types";

const credentials = z.object({
  email: z.email("Introduce un correo válido.").max(254),
  password: z.string().min(8, "Usa una contraseña de al menos 8 caracteres.").max(128),
});

export async function authenticate(
  mode: "login" | "register",
  formData: FormData,
): Promise<ActionResult> {
  if (!isSupabaseConfigured())
    return { error: "Configura Supabase en .env.local para activar el acceso." };
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();

  if (mode === "register") {
    const name = z.string().trim().min(2).max(100).safeParse(formData.get("company_name"));
    if (!name.success)
      return { error: "El nombre del negocio debe tener entre 2 y 100 caracteres." };
    const settings = await getAuthSettings();
    if (!settings)
      return {
        error: "No pudimos comprobar la disponibilidad del registro. Inténtalo más tarde.",
        errorCode: "auth_settings_unavailable",
      };
    if (!settings.emailProviderEnabled)
      return authErrorFeedback({ code: "email_provider_disabled" }, "register");
    if (!settings.signupEnabled) return authErrorFeedback({ code: "signup_disabled" }, "register");
    if (!settings.autoConfirmEmail)
      return {
        error:
          "Para activar el registro directo, deja Enable Email provider activado, desactiva Confirm email en Supabase y guarda los cambios.",
        errorCode: "email_confirmation_required",
      };
    const { data, error } = await createIsolatedAuthClient(getSupabaseConfig()).auth.signUp({
      ...parsed.data,
      options: {
        data: { company_name: name.data, timezone: String(formData.get("timezone") || "UTC") },
      },
    });
    if (error) {
      const result = authErrorFeedback(error, "register");
      console.warn("[auth:register]", { code: result.errorCode, status: error.status });
      return result;
    }
    if (!data.session)
      return {
        error:
          "El registro no devolvió una sesión. Prueba iniciar sesión o revisa la configuración de acceso del proyecto.",
        errorCode: "signup_session_missing",
      };
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionError) return authErrorFeedback(sessionError, "register");
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      const result = authErrorFeedback(error, "login");
      console.warn("[auth:login]", { code: result.errorCode, status: error.status });
      return result;
    }
  }
  redirect("/dashboard/calendario");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("No se pudo cerrar la sesión. Inténtalo otra vez.");
  }
  redirect("/login");
}
