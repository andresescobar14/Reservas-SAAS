"use client";

import { useEffect, useState } from "react";
import {
  CheckCheck,
  CircleCheck,
  Clock3,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ConnectionState = {
  companyId: string;
  status: "CONNECTED" | "DISCONNECTED" | "QR_READY";
  initializing: boolean;
  qr: string | null;
  error: string | null;
};

export function WhatsAppWorkspace({
  companyId,
  companyName,
  engineUrl,
}: {
  companyId: string;
  companyName: string;
  engineUrl: string;
}) {
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    if (!engineUrl) return;
    const controller = new AbortController();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;
    let initializeRequested = requestId > 0;

    async function request(endpoint: "status" | "qr"): Promise<ConnectionState> {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      const response = await fetch(
        `${engineUrl}/api/whatsapp/${endpoint}/${encodeURIComponent(companyId)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
          cache: "no-store",
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "No se pudo comprobar la conexión de WhatsApp.");
      if (
        data.companyId !== companyId ||
        !["CONNECTED", "DISCONNECTED", "QR_READY"].includes(data.status)
      ) {
        throw new Error("El servicio devolvió una respuesta de conexión no válida.");
      }
      const validQr =
        typeof data.qr === "string" &&
        data.qr.length < 200000 &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.qr);
      return { ...data, qr: validQr ? data.qr : null };
    }

    async function poll() {
      try {
        let state = await request("status");
        if (controller.signal.aborted) return;
        if (initializeRequested) {
          initializeRequested = false;
          if (state.status !== "CONNECTED") state = await request("qr");
        }
        if (controller.signal.aborted) return;
        setConnection(state);
        setOnline(true);
        setError(
          state.error
            ? "La conexión se interrumpió. Genera un nuevo código para volver a conectar."
            : "",
        );
      } catch (failure) {
        if (controller.signal.aborted) return;
        setOnline(false);
        setError(
          failure instanceof TypeError
            ? "No se pudo contactar con el servicio de WhatsApp. Comprueba que el motor esté iniciado."
            : failure instanceof Error
              ? failure.message
              : "No se pudo conectar con WhatsApp.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          // Una petición a la vez, sin acumular intervalos ni recrear sesiones.
          timer = setTimeout(poll, 4000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [companyId, engineUrl, requestId]);

  const connected = online && connection?.status === "CONNECTED";
  const initializing = busy || (online && connection?.initializing);
  const qr = online && connection?.status === "QR_READY" ? connection.qr : null;
  const label = !engineUrl
    ? "Sin configurar"
    : !online && error
      ? "Servicio no disponible"
      : connected
        ? "Conectado"
        : qr
          ? "Código QR listo"
          : initializing
            ? "Preparando conexión"
            : "Desconectado";

  function refresh() {
    setBusy(true);
    setError("");
    setRequestId((value) => value + 1);
  }

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">MÁS CERCA, SIN MÁS PENDIENTES</p>
        <h1 className="mt-2 text-[32px] font-medium tracking-tight">Tu WhatsApp, conectado</h1>
        <p className="mt-2 text-base text-slate-600">
          Conecta el número de {companyName} para enviar mensajes desde tu negocio.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-slate-200 shadow-none">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">Conexión del negocio</CardTitle>
              <span
                role="status"
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${connected ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
              >
                <span
                  className={`size-1.5 rounded-full ${connected ? "bg-emerald-600" : "bg-slate-400"}`}
                />
                {label}
              </span>
            </div>
            <CardDescription>Usa el número con el que tus clientes ya te conocen.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center px-5 py-10 text-center sm:px-8">
            {connected ? (
              <div className="flex size-36 items-center justify-center rounded-2xl bg-emerald-50">
                <CircleCheck size={64} className="text-emerald-600" strokeWidth={1.5} />
              </div>
            ) : qr ? (
              <div className="max-w-full rounded-2xl border border-slate-200 bg-white p-2">
                {/* El motor devuelve un PNG Base64 privado y temporal, no una URL de imagen remota. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt={`Código QR para conectar el WhatsApp de ${companyName}`}
                  width={320}
                  height={320}
                  className="h-auto max-w-full"
                />
              </div>
            ) : (
              <div className="flex size-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                {initializing ? (
                  <LoaderCircle size={48} className="animate-spin text-emerald-600" />
                ) : (
                  <QrCode size={56} className="text-slate-400" strokeWidth={1.4} />
                )}
              </div>
            )}
            <h2 className="mt-6 text-2xl font-medium">
              {connected
                ? "Tu negocio ya está conectado"
                : qr
                  ? "Escanea el código con tu teléfono"
                  : initializing
                    ? "Estamos preparando tu conexión"
                    : "Conecta tu WhatsApp en un paso"}
            </h2>
            <p className="mt-3 max-w-md text-base leading-7 text-slate-600">
              {connected
                ? "La sesión está lista para enviar mensajes desde el número que vinculaste."
                : qr
                  ? "En WhatsApp abre Dispositivos vinculados → Vincular un dispositivo y escanea este código. Se actualizará automáticamente."
                  : initializing
                    ? "El primer inicio puede tardar unos segundos. La página comprobará el estado automáticamente."
                    : "Genera un código QR y vincula el teléfono de tu negocio. Cada empresa utiliza su propia sesión."}
            </p>
            {!engineUrl && (
              <p className="mt-5 max-w-md text-base text-slate-600">
                La conexión de WhatsApp todavía no está configurada para este entorno.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="mt-5 w-full rounded-lg border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-800"
              >
                {error}
              </p>
            )}
            <Button
              onClick={refresh}
              disabled={!engineUrl || Boolean(initializing)}
              className="mt-6 h-11 gap-2 px-5 text-base"
            >
              {initializing ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : connected || qr ? (
                <RefreshCw size={17} />
              ) : (
                <QrCode size={17} />
              )}
              {initializing
                ? "Preparando conexión…"
                : connected || qr
                  ? "Actualizar estado"
                  : "Generar Código QR"}
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 size={19} className="text-emerald-600" />
                Un recordatorio, a tiempo
              </CardTitle>
              <CardDescription>Vista previa del mensaje · no se ha enviado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-emerald-50 p-5">
                <div className="rounded-lg bg-white p-4">
                  <p className="text-base leading-7 text-slate-600">
                    ¡Hola, Ana! 👋
                    <br />
                    Te recordamos tu cita de mañana a las{" "}
                    <strong className="font-medium">10:00</strong>.<br />
                    Te esperamos en {companyName}.
                  </p>
                  <p className="mt-2 flex justify-end text-emerald-600">
                    <CheckCheck size={16} />
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Este paso habilita la conexión y el envío desde el motor. La programación automática
                de recordatorios 24 horas antes se conectará en el siguiente paso.
              </p>
            </CardContent>
          </Card>
          <div className="space-y-4 px-2">
            <p className="flex items-center gap-3 text-base text-slate-600">
              <Smartphone size={18} className="shrink-0 text-emerald-600" />
              Tu número, tu relación con el cliente
            </p>
            <p className="flex items-center gap-3 text-base text-slate-600">
              <ShieldCheck size={18} className="shrink-0 text-emerald-600" />
              Una sesión independiente por empresa
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
