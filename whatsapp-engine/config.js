const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

function readConfig(env = process.env) {
  const port = Number(env.PORT || 3001);
  const maxSessions = Number(env.MAX_SESSIONS || 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT inválido.");
  if (!Number.isInteger(maxSessions) || maxSessions < 1) throw new Error("MAX_SESSIONS inválido.");
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Completa SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en whatsapp-engine/.env.");
  }
  if (env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")) {
    throw new Error("Usa una publishable key; el motor no necesita una secret key.");
  }
  const origins = (env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("CORS_ORIGINS debe contener orígenes completos sin rutas ni barra final.");
    }
  }
  return {
    port,
    host: env.HOST || "127.0.0.1",
    origins,
    maxSessions,
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY,
    authPath: path.resolve(__dirname, env.WHATSAPP_AUTH_PATH || ".wwebjs_auth"),
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
  };
}

module.exports = { readConfig };
