"use strict";
// Entrada para Vercel: el mismo servicio Express, sin servidor siempre encendido.
// - Cada petición la atiende la app normal (webhook de Meta, bandeja, reservas).
// - Tras cada POST se hace una pasada de las colas en segundo plano, para que
//   confirmaciones y respuestas a botones salgan en segundos.
// - Una tarea programada de Supabase llama a /internal/tick cada minuto para los
//   recordatorios que vencen sin que nadie haga peticiones.
const crypto = require("node:crypto");
const { waitUntil } = require("@vercel/functions");
const {
  readConfig,
  createPostgresDb,
  createMockDb,
  createApp,
  runWorkerPass,
  validateSend,
  deliverReminder,
} = require("../server");
const { runAutomationPass } = require("../native-automation");
const axios = require("axios");

let state;
function init() {
  if (state) return state;
  const config = readConfig({ PG_POOL_MAX: "3", ...process.env });
  const db = config.dbMode === "mock" ? createMockDb() : createPostgresDb(config);
  const app = createApp({ config, db });
  state = { config, db, app, lastCleanup: 0, running: null };
  return state;
}

// Ejecuta las dos colas una vez. Si ya hay una pasada en curso en esta
// instancia, reutiliza esa; entre instancias distintas protegen las leases.
function runPasses(s, budgetMs) {
  if (s.running) return s.running;
  const deadline = Date.now() + budgetMs;
  const cleanup = Date.now() - s.lastCleanup > 3600000;
  if (cleanup) s.lastCleanup = Date.now();
  s.running = (async () => {
    const result = { events: 0, jobs: 0 };
    try {
      result.events = await runWorkerPass(s.db, s.config.buttonSecret, { deadline, cleanup });
    } catch {
      console.error("[worker] Evento pendiente. Se reintentará desde la base de datos.");
    }
    if (s.db.native) {
      try {
        result.jobs = await runAutomationPass(
          {
            db: s.db,
            config: s.config,
            validateSend,
            deliver: (input, ownerId) =>
              deliverReminder({ config: s.config, db: s.db, http: axios }, input, ownerId),
          },
          { deadline, cleanup },
        );
      } catch {
        console.error("[automation] Trabajo pendiente en la cola persistente.");
      }
    }
    return result;
  })().finally(() => {
    s.running = null;
  });
  return s.running;
}

function validCronAuth(header) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 32 || typeof header !== "string") return false;
  const a = Buffer.from(header),
    b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  let s;
  try {
    s = init();
  } catch {
    console.error("[meta-cloud] Revisa las variables de entorno. No se inició el servicio.");
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ status: "unavailable" }));
  }
  const path = (req.url || "").split("?")[0];
  if (path === "/internal/tick") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST" || !validCronAuth(req.headers.authorization)) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
    }
    const result = await runPasses(s, 45000);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ...result }));
  }
  if (req.method === "POST") res.once("finish", () => waitUntil(runPasses(s, 20000)));
  return s.app(req, res);
};
