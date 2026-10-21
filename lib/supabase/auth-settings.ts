import "server-only";
import { z } from "zod";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";

const publicAuthSettings = z.object({
  mailer_autoconfirm: z.boolean(),
  disable_signup: z.boolean(),
  external: z.object({ email: z.boolean() }),
});

export async function getAuthSettings() {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = getSupabaseConfig();
  try {
    // /settings contiene ajustes públicos del proveedor, sin usuarios ni credenciales.
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const settings = publicAuthSettings.safeParse(await response.json());
    if (!settings.success) return null;
    return {
      autoConfirmEmail: settings.data.mailer_autoconfirm,
      emailProviderEnabled: settings.data.external.email,
      signupEnabled: !settings.data.disable_signup,
    };
  } catch {
    return null;
  }
}
