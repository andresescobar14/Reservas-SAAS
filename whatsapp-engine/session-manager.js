const { ApiError } = require("./auth");

function createSessionManager({
  sessions,
  createClient,
  encodeQr,
  maxSessions = 10,
  startupTimeoutMs = 120000,
  qrLifetimeMs = 60000,
}) {
  const closing = new Set();
  let shuttingDown = false;

  function snapshot(companyId) {
    const entry = sessions.get(companyId);
    if (!entry)
      return { companyId, status: "DISCONNECTED", initializing: false, qr: null, error: null };
    const qr = entry.qrExpiresAt > Date.now() ? entry.qr : null;
    return {
      companyId,
      status: entry.status === "CONNECTED" ? "CONNECTED" : qr ? "QR_READY" : "DISCONNECTED",
      initializing: entry.initializing,
      qr,
      error: entry.error,
    };
  }

  function notify(entry) {
    for (const listener of [...entry.waiters]) listener();
  }

  function retire(companyId, entry, code) {
    if (sessions.get(companyId) !== entry || !entry.client || entry.closing) return;
    clearTimeout(entry.timer);
    entry.closing = true;
    entry.status = "DISCONNECTED";
    entry.initializing = false;
    entry.qr = null;
    ++entry.qrVersion;
    entry.error = code;
    notify(entry);
    const client = entry.client;
    // Cierra también durante un arranque atascado. Se repite al terminar initialize
    // por si Chromium todavía no tenía un identificador en el primer intento.
    void client.destroy().catch(() => {});
    const cleanup = Promise.resolve(entry.startup)
      .catch(() => {})
      .then(async () => {
        try {
          await client.destroy();
        } catch {
          /* Un navegador ya cerrado no requiere limpieza. */
        }
      })
      .finally(() => {
        entry.client = null;
        entry.closing = false;
        closing.delete(cleanup);
      });
    closing.add(cleanup);
  }

  function ensure(companyId) {
    if (shuttingDown)
      throw new ApiError(503, "ENGINE_STOPPING", "El servicio se está reiniciando.");
    const existing = sessions.get(companyId);
    if (existing?.client) return snapshot(companyId);
    const activeSessions = [...sessions.values()].filter((session) => session.client).length;
    if (activeSessions >= maxSessions)
      throw new ApiError(503, "SESSION_LIMIT", "El servicio alcanzó su capacidad de conexiones.");
    // Las entradas retiradas no guardan credenciales ni crecen indefinidamente en memoria.
    for (const [id, session] of sessions)
      if (!session.client && !session.waiters.size) sessions.delete(id);
    const client = createClient(companyId);
    const entry = {
      client,
      status: "DISCONNECTED",
      initializing: true,
      qr: null,
      qrExpiresAt: 0,
      qrVersion: 0,
      error: null,
      closing: false,
      waiters: new Set(),
      startup: null,
      timer: null,
    };
    // Se registra antes de initialize: peticiones QR simultáneas comparten el mismo navegador.
    sessions.set(companyId, entry);
    client.on("qr", async (value) => {
      const version = ++entry.qrVersion;
      try {
        const qr = await encodeQr(value);
        if (
          sessions.get(companyId) !== entry ||
          !entry.client ||
          entry.closing ||
          version !== entry.qrVersion ||
          entry.status === "CONNECTED"
        )
          return;
        entry.qr = qr;
        entry.qrExpiresAt = Date.now() + qrLifetimeMs;
        entry.status = "QR_READY";
        entry.initializing = false;
        notify(entry);
      } catch {
        retire(companyId, entry, "QR_GENERATION_FAILED");
      }
    });
    client.on("authenticated", () => {
      if (sessions.get(companyId) !== entry || !entry.client || entry.error) return;
      ++entry.qrVersion;
      entry.qr = null;
      entry.status = "DISCONNECTED";
      entry.initializing = true;
      notify(entry);
    });
    client.on("ready", () => {
      if (sessions.get(companyId) !== entry || !entry.client || entry.closing || entry.error)
        return;
      clearTimeout(entry.timer);
      ++entry.qrVersion;
      entry.qr = null;
      entry.status = "CONNECTED";
      entry.initializing = false;
      entry.error = null;
      notify(entry);
    });
    client.on("auth_failure", () => retire(companyId, entry, "AUTH_FAILURE"));
    client.on("disconnected", () => retire(companyId, entry, "SESSION_DISCONNECTED"));
    entry.timer = setTimeout(
      () => retire(companyId, entry, "INITIALIZATION_TIMEOUT"),
      startupTimeoutMs,
    );
    entry.timer.unref?.();
    entry.startup = Promise.resolve().then(() => client.initialize());
    entry.startup
      .then(() => {
        client.pupBrowser?.once("disconnected", () =>
          retire(companyId, entry, "BROWSER_DISCONNECTED"),
        );
      })
      .catch(() => retire(companyId, entry, "INITIALIZATION_FAILED"));
    return snapshot(companyId);
  }

  async function waitForQr(companyId, { timeoutMs = 15000, signal } = {}) {
    const current = ensure(companyId);
    if (current.status !== "DISCONNECTED" || current.error || signal?.aborted) return current;
    const entry = sessions.get(companyId);
    return new Promise((resolve) => {
      let timer;
      const finish = () => {
        clearTimeout(timer);
        entry.waiters.delete(onUpdate);
        signal?.removeEventListener("abort", finish);
        resolve(snapshot(companyId));
      };
      const onUpdate = () => {
        const state = snapshot(companyId);
        if (state.status !== "DISCONNECTED" || state.error) finish();
      };
      entry.waiters.add(onUpdate);
      signal?.addEventListener("abort", finish, { once: true });
      timer = setTimeout(finish, timeoutMs);
      onUpdate();
    });
  }

  async function send(companyId, phone, message) {
    const entry = sessions.get(companyId);
    if (!entry?.client || entry.status !== "CONNECTED" || entry.closing) {
      throw new ApiError(
        409,
        "WHATSAPP_DISCONNECTED",
        "Conecta primero el WhatsApp de tu negocio.",
      );
    }
    const number = await entry.client.getNumberId(phone);
    if (!number)
      throw new ApiError(422, "PHONE_NOT_REGISTERED", "El número no está registrado en WhatsApp.");
    const sent = await entry.client.sendMessage(number._serialized, message, { sendSeen: false });
    return { success: true, messageId: sent.id?._serialized || null };
  }

  async function stop() {
    shuttingDown = true;
    for (const [id, entry] of sessions) if (entry.client) retire(id, entry, "ENGINE_STOPPING");
    await Promise.allSettled([...closing]);
  }

  return { snapshot, ensure, waitForQr, send, stop };
}

module.exports = { createSessionManager };
