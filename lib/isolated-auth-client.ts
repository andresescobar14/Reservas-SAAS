import { createClient } from "@supabase/supabase-js";

export function createIsolatedAuthClient(
  config: { url: string; key: string },
  fetcher?: typeof fetch,
) {
  return createClient(config.url, config.key, {
    auth: {
      // El registro con autoconfirmación necesita el flujo implicit.
      // Sus tokens solo llegan al servidor y después se guardan con @supabase/ssr.
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: fetcher ? { fetch: fetcher } : undefined,
  });
}
