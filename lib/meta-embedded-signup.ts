export type SignupConfiguration = {
  enabled: boolean;
  testing?: boolean;
  appId: string | null;
  configId: string | null;
  version: string;
  message: string;
};
type MetaResponse = { authResponse?: { code?: string }; status?: string };
export type SignupProgress = "opening" | "popup_help" | "exchanging" | "awaiting_whatsapp";
type MetaSDK = {
  init(options: Record<string, unknown>): void;
  login(callback: (response: MetaResponse) => void, options: Record<string, unknown>): void;
};
declare global {
  interface Window {
    FB?: MetaSDK;
    fbAsyncInit?: () => void;
  }
}
let sdkLoading: Promise<MetaSDK> | undefined;

// Solo se descarga cuando la persona prepara voluntariamente la conexión.
export function loadMetaSDK(config: SignupConfiguration): Promise<MetaSDK> {
  if (!config.enabled || !config.appId || !config.configId)
    return Promise.reject(new Error(config.message));
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<MetaSDK>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        reject(new Error("No se pudo cargar Meta. Comprueba si tu navegador bloquea Facebook.")),
      20000,
    );
    const initialize = () => {
      if (!window.FB) return;
      window.FB.init({
        appId: config.appId,
        version: config.version,
        autoLogAppEvents: false,
        xfbml: false,
        cookie: false,
      });
      window.clearTimeout(timer);
      resolve(window.FB);
    };
    if (window.FB) initialize();
    else {
      window.fbAsyncInit = initialize;
      const script = document.createElement("script");
      script.id = "reserva-meta-sdk";
      script.src = "https://connect.facebook.net/es_LA/sdk.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onerror = () => {
        window.clearTimeout(timer);
        script.remove();
        reject(new Error("No se pudo cargar el asistente de Meta."));
      };
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkLoading = undefined;
    throw error;
  });
  return sdkLoading;
}

export type SignupAssets = {
  event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
  wabaId: string;
  phoneId?: string;
};

export function parseSignupEvent(
  origin: string,
  value: unknown,
): SignupAssets | "CANCEL" | "ERROR" | null {
  if (
    ![
      "https://www.facebook.com",
      "https://web.facebook.com",
      "https://business.facebook.com",
    ].includes(origin)
  )
    return null;
  let payload: {
    type?: string;
    event?: string;
    data?: { waba_id?: string; phone_number_id?: string };
  };
  try {
    payload = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") return null;
  if (payload.event === "CANCEL" || payload.event === "ERROR") return payload.event;
  if (
    payload.event?.startsWith("FINISH") &&
    payload.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
  )
    return "ERROR";
  if (
    payload.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" ||
    !/^[0-9]{5,30}$/.test(payload.data?.waba_id || "") ||
    (payload.data?.phone_number_id !== undefined &&
      !/^[0-9]{5,30}$/.test(payload.data.phone_number_id))
  )
    return null;
  return {
    event: payload.event,
    wabaId: payload.data!.waba_id!,
    ...(payload.data?.phone_number_id ? { phoneId: payload.data.phone_number_id } : {}),
  };
}

// Se invoca directamente desde el clic: mantiene la activación de usuario del popup.
// El código de 30 segundos se intercambia al recibirlo, aunque FINISH llegue después.
export function openMetaSignup(
  sdk: MetaSDK,
  config: SignupConfiguration,
  exchangeCode: (code: string) => Promise<unknown>,
  signal: AbortSignal,
  onProgress: (progress: SignupProgress) => void = () => {},
): Promise<SignupAssets> {
  return new Promise((resolve, reject) => {
    let assets: SignupAssets | undefined,
      exchanged = false,
      codeReceived = false,
      settled = false;
    let finishTimer: number | undefined;
    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearTimeout(popupTimer);
      window.clearTimeout(finishTimer);
      window.removeEventListener("message", receive);
      signal.removeEventListener("abort", abort);
    };
    const end = (error?: Error) => {
      if (settled) return;
      if (!error && (!assets || !exchanged)) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(assets!);
    };
    const abort = () => end(new Error("Conexión cancelada."));
    const receive = (message: MessageEvent) => {
      const event = parseSignupEvent(message.origin, message.data);
      if (!event) return;
      if (event === "CANCEL")
        return end(new Error("Cerraste el asistente. Puedes volver a conectar cuando quieras."));
      if (event === "ERROR")
        return end(
          new Error(
            "Meta no completó Coexistencia. Elige mantener WhatsApp Business en tu móvil; no migraremos tu número automáticamente.",
          ),
        );
      assets = event;
      end();
    };
    const timer = window.setTimeout(
      () =>
        end(
          new Error(
            "Meta no completó la conexión. Comprueba que se abrió el asistente de WhatsApp Business y termina con Finalizar. Iniciar sesión en Facebook no conecta el número.",
          ),
        ),
      8 * 60000,
    );
    const popupTimer = window.setTimeout(() => {
      if (!codeReceived && !assets) onProgress("popup_help");
    }, 12000);
    window.addEventListener("message", receive);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    try {
      onProgress("opening");
      sdk.login(
        (response) => {
          if (settled || codeReceived) return;
          if (!response.authResponse?.code)
            return end(
              new Error("Meta no devolvió autorización. Termina el asistente pulsando Finalizar."),
            );
          codeReceived = true;
          window.clearTimeout(popupTimer);
          onProgress("exchanging");
          void exchangeCode(response.authResponse.code)
            .then(() => {
              if (settled) return;
              exchanged = true;
              if (!assets) {
                onProgress("awaiting_whatsapp");
                // Un login genérico no es un alta de WhatsApp. No dejar la pantalla
                // esperando ocho minutos ni aceptar el código como conexión exitosa.
                finishTimer = window.setTimeout(
                  () =>
                    end(
                      new Error(
                        "Facebook se autorizó, pero Meta no devolvió el alta de WhatsApp Business con Coexistencia. El número no quedó conectado al SaaS. Revisa el asistente y los permisos de la app en Meta antes de volver a intentarlo.",
                      ),
                    ),
                  60000,
                );
              }
              end();
            })
            .catch((error: unknown) =>
              end(
                error instanceof Error
                  ? error
                  : new Error("No se pudo intercambiar la autorización con Meta. Inicia de nuevo."),
              ),
            );
        },
        {
          config_id: config.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            version: "v4",
            featureType: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
          },
        },
      );
    } catch {
      end(
        new Error("No se pudo abrir Meta. Permite las ventanas emergentes e inténtalo de nuevo."),
      );
    }
  });
}
