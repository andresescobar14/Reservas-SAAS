import { test } from "node:test";
import assert from "node:assert/strict";
import { openMetaSignup, parseSignupEvent } from "../lib/meta-embedded-signup";

const finish = {
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  data: { waba_id: "1234567890", phone_number_id: "9876543210" },
};
test("Embedded Signup ignora orígenes parecidos a Facebook y no acepta migración sin Coexistencia", () => {
  assert.equal(parseSignupEvent("https://evilfacebook.com", finish), null);
  assert.equal(parseSignupEvent("https://www.facebook.com.attacker.example", finish), null);
  assert.equal(parseSignupEvent("http://www.facebook.com", finish), null);
  assert.equal(parseSignupEvent("https://www.facebook.com", "not-json"), null);
  assert.equal(
    parseSignupEvent("https://www.facebook.com", { ...finish, event: "FINISH" }),
    "ERROR",
  );
  assert.deepEqual(parseSignupEvent("https://www.facebook.com", JSON.stringify(finish)), {
    event: finish.event,
    wabaId: "1234567890",
    phoneId: "9876543210",
  });
});
test("Coexistencia admite el evento oficial con solo WABA para resolver el número en el servidor", () => {
  assert.deepEqual(
    parseSignupEvent("https://www.facebook.com", { ...finish, data: { waba_id: "1234567890" } }),
    {
      event: finish.event,
      wabaId: "1234567890",
    },
  );
});
test("el código OAuth se intercambia antes de esperar FINISH y se eliminan los listeners", async () => {
  const listeners = new Set<(event: MessageEvent) => void>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      addEventListener(_name: string, callback: (event: MessageEvent) => void) {
        listeners.add(callback);
      },
      removeEventListener(_name: string, callback: (event: MessageEvent) => void) {
        listeners.delete(callback);
      },
    },
  });
  try {
    let exchanged = false;
    const sdk = {
      init() {},
      login(
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) {
        assert.equal(options.response_type, "code");
        assert.deepEqual(options.extras, {
          setup: {},
          version: "v4",
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        });
        callback({ authResponse: { code: "short-lived-code" } });
      },
    };
    const pending = openMetaSignup(
      sdk,
      { enabled: true, appId: "12345", configId: "67890", version: "v26.0", message: "" },
      async (code) => {
        assert.equal(code, "short-lived-code");
        exchanged = true;
      },
      new AbortController().signal,
    );
    assert.equal(exchanged, true);
    for (const listener of listeners)
      listener({ origin: "https://www.facebook.com", data: finish } as MessageEvent);
    const result = await pending;
    assert.equal(result.phoneId, "9876543210");
    assert.equal(listeners.size, 0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

function fakeSignupWindow() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const listeners = new Set<(event: MessageEvent) => void>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(callback: () => void, delay: number) {
        timers.set(++nextTimer, { callback, delay });
        return nextTimer;
      },
      clearTimeout(id?: number) {
        if (id !== undefined) timers.delete(id);
      },
      addEventListener(_name: string, listener: (event: MessageEvent) => void) {
        listeners.add(listener);
      },
      removeEventListener(_name: string, listener: (event: MessageEvent) => void) {
        listeners.delete(listener);
      },
    },
  });
  return {
    listeners,
    timers,
    restore() {
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

test("un login de Facebook sin alta de Coexistencia nunca confirma el número y termina con instrucciones", async () => {
  const browser = fakeSignupWindow();
  try {
    const progress: string[] = [];
    let respond!: (response: { authResponse?: { code?: string } }) => void;
    const pending = openMetaSignup(
      {
        init() {},
        login(callback) {
          respond = callback;
        },
      },
      { enabled: true, appId: "12345", configId: "67890", version: "v26.0", message: "" },
      async () => {},
      new AbortController().signal,
      (phase) => progress.push(phase),
    );
    const rejected = assert.rejects(pending, /Facebook se autorizó, pero Meta no devolvió el alta/);
    const popupHelp = [...browser.timers.values()].find((timer) => timer.delay === 12000);
    assert.ok(popupHelp);
    popupHelp.callback();
    respond({ authResponse: { code: "single-use-facebook-code" } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(progress, ["opening", "popup_help", "exchanging", "awaiting_whatsapp"]);
    const finishTimeout = [...browser.timers.values()].find((timer) => timer.delay === 60000);
    assert.ok(finishTimeout);
    finishTimeout.callback();
    await rejected;
    assert.equal(browser.listeners.size, 0);
    assert.equal(browser.timers.size, 0);
  } finally {
    browser.restore();
  }
});

test("cancelar durante el intercambio impide que una respuesta tardía reactive la espera", async () => {
  const browser = fakeSignupWindow();
  try {
    let finishExchange!: () => void;
    const exchange = new Promise<void>((resolve) => {
      finishExchange = resolve;
    });
    const controller = new AbortController();
    const progress: string[] = [];
    const pending = openMetaSignup(
      {
        init() {},
        login(callback) {
          callback({ authResponse: { code: "one-use-code" } });
        },
      },
      { enabled: true, appId: "12345", configId: "67890", version: "v26.0", message: "" },
      () => exchange,
      controller.signal,
      (phase) => progress.push(phase),
    );
    const rejected = assert.rejects(pending, /Conexión cancelada/);
    controller.abort();
    await rejected;
    finishExchange();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(progress, ["opening", "exchanging"]);
    assert.equal(browser.listeners.size, 0);
    assert.equal(browser.timers.size, 0);
  } finally {
    browser.restore();
  }
});

test("un error del servidor conserva la referencia de Meta y limpia la sesión del asistente", async () => {
  const listeners = new Set<(event: MessageEvent) => void>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      addEventListener(_name: string, callback: (event: MessageEvent) => void) {
        listeners.add(callback);
      },
      removeEventListener(_name: string, callback: (event: MessageEvent) => void) {
        listeners.delete(callback);
      },
    },
  });
  try {
    const diagnostic = "Meta no pudo completar la operación. Referencia de Meta: 190/460.";
    await assert.rejects(
      openMetaSignup(
        {
          init() {},
          login(callback) {
            callback({ authResponse: { code: "short-lived-code" } });
          },
        },
        { enabled: true, appId: "12345", configId: "67890", version: "v26.0", message: "" },
        async () => {
          throw new Error(diagnostic);
        },
        new AbortController().signal,
      ),
      { message: diagnostic },
    );
    assert.equal(listeners.size, 0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
