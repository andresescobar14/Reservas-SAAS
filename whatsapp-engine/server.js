const path = require("node:path");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { readConfig } = require("./config");
const { ApiError, createTenantAuthorizer, normalizeCompanyId } = require("./auth");
const { createSessionManager } = require("./session-manager");

const sessions = new Map();

function createWhatsAppManager(config) {
  // La caché de Chromium permanece dentro del microservicio y fuera de Git/Vercel.
  process.env.PUPPETEER_CACHE_DIR ||= path.join(__dirname, ".cache", "puppeteer");
  const { Client, LocalAuth } = require("whatsapp-web.js");
  return createSessionManager({
    sessions,
    maxSessions: config.maxSessions,
    createClient: (companyId) =>
      new Client({
        authStrategy: new LocalAuth({ clientId: companyId, dataPath: config.authPath }),
        puppeteer: {
          headless: true,
          executablePath: config.executablePath,
          timeout: 60000,
          // Conservar el sandbox de Chromium. Ejecutar como usuario sin privilegios.
        },
        authTimeoutMs: 90000,
        qrMaxRetries: 5,
        takeoverOnConflict: false,
      }),
    encodeQr: (value) => QRCode.toDataURL(value, { type: "image/png", width: 320, margin: 4 }),
  });
}

function createApp({
  config,
  manager,
  authorize = createTenantAuthorizer(config),
  qrWaitMs = 15000,
}) {
  const app = express();
  const sendWindows = new Map();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.origins.includes(origin)) return callback(null, true);
        callback(new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origen no permitido."));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "32kb", strict: true }));
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "whatsapp-engine" }));

  async function authorizeRequest(req, companyId) {
    const header = req.get("Authorization") || "";
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) throw new ApiError(401, "UNAUTHORIZED", "Inicia sesión para conectar WhatsApp.");
    await authorize(match[1], companyId);
  }

  app.get("/api/whatsapp/status/:companyId", async (req, res, next) => {
    try {
      const companyId = normalizeCompanyId(req.params.companyId);
      await authorizeRequest(req, companyId);
      res.json(manager.snapshot(companyId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp/qr/:companyId", async (req, res, next) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on("close", abort);
    try {
      const companyId = normalizeCompanyId(req.params.companyId);
      await authorizeRequest(req, companyId);
      if (controller.signal.aborted) return;
      const state = await manager.waitForQr(companyId, {
        timeoutMs: qrWaitMs,
        signal: controller.signal,
      });
      if (res.destroyed) return;
      if (state.error)
        throw new ApiError(
          503,
          state.error,
          "No se pudo iniciar WhatsApp. Intenta generar el código de nuevo.",
        );
      res.status(state.status === "DISCONNECTED" ? 202 : 200).json(state);
    } catch (error) {
      next(error);
    } finally {
      res.off("close", abort);
    }
  });

  app.post("/api/whatsapp/send", async (req, res, next) => {
    try {
      const companyId = normalizeCompanyId(req.body?.companyId);
      await authorizeRequest(req, companyId);
      const { phone, message } = req.body;
      if (typeof phone !== "string" || !/^\+?[1-9][0-9 ()\-\.]{5,24}$/.test(phone)) {
        throw new ApiError(400, "INVALID_PHONE", "Usa un número internacional con código de país.");
      }
      const digits = phone.replace(/\D/g, "");
      if (!/^[1-9]\d{6,14}$/.test(digits))
        throw new ApiError(400, "INVALID_PHONE", "El teléfono debe tener entre 7 y 15 dígitos.");
      if (typeof message !== "string" || !message.trim() || message.length > 4096) {
        throw new ApiError(
          400,
          "INVALID_MESSAGE",
          "El mensaje debe contener entre 1 y 4096 caracteres.",
        );
      }
      const now = Date.now();
      for (const [id, window] of sendWindows) if (window.endsAt <= now) sendWindows.delete(id);
      const window = sendWindows.get(companyId) || { count: 0, endsAt: now + 60000 };
      if (window.count >= 10) {
        res.set("Retry-After", String(Math.ceil((window.endsAt - now) / 1000)));
        throw new ApiError(429, "SEND_RATE_LIMIT", "Espera antes de enviar más mensajes.");
      }
      window.count++;
      sendWindows.set(companyId, window);
      // No se reintenta automáticamente: un timeout no demuestra que el mensaje no se haya enviado.
      res.json(await manager.send(companyId, digits, message.trim()));
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND", "Ruta no encontrada.")));
  app.use((error, _req, res, _next) => {
    if (res.headersSent || res.destroyed) return;
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.code, message: error.message });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "INVALID_JSON", message: "El JSON no es válido." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "BODY_TOO_LARGE", message: "La solicitud es demasiado grande." });
    // No registrar JWT, QR, teléfonos, mensajes ni el contenido de las sesiones.
    console.error("[whatsapp-engine] Falló una operación.");
    res.status(503).json({
      error: "ENGINE_UNAVAILABLE",
      message: "WhatsApp no está disponible. Comprueba la conexión e inténtalo de nuevo.",
    });
  });
  return app;
}

function startServer() {
  const config = readConfig();
  const manager = createWhatsAppManager(config);
  const app = createApp({ config, manager });
  const server = app.listen(config.port, config.host, () => {
    console.log(`[whatsapp-engine] Escuchando en http://${config.host}:${config.port}`);
  });
  server.on("error", (error) => {
    console.error(`[whatsapp-engine] No se pudo abrir el puerto (${error.code || "ERROR"}).`);
    process.exitCode = 1;
  });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const forcedExit = setTimeout(() => process.exit(1), 15000);
    forcedExit.unref();
    server.close();
    await manager.stop();
    clearTimeout(forcedExit);
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return { app, server, manager };
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    console.error(`[whatsapp-engine] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createApp, createWhatsAppManager, startServer };
