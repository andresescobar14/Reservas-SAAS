"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, RefreshCw, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type KeyInfo = {
  active: boolean;
  token_hint: string;
  expires_at: string;
  last_event_at: string | null;
  last_result: string | null;
};
const example = JSON.stringify(
  {
    event: "created",
    bookingId: "{{UID de la reserva de Cal.com}}",
    eventAt: "{{fecha del evento en ISO 8601}}",
    patientName: "{{nombre del asistente}}",
    phone: "{{teléfono internacional del asistente}}",
    startsAt: "{{inicio ISO 8601 con zona}}",
    endsAt: "{{fin ISO 8601 con zona}}",
    service: "{{nombre del tipo de cita}}",
    whatsappConsent: false,
    consentEvidence: "{{respuesta afirmativa a la autorización de WhatsApp}}",
    sendReminder: false,
  },
  null,
  2,
);

export function MakeIntegrationPanel({ companyId, apiUrl }: { companyId: string; apiUrl: string }) {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [action, setAction] = useState<"rotate" | "revoke" | null>(null);
  const endpoint = `${apiUrl}/api/integrations/make/events`;
  const api = useCallback(
    async <T,>(path: string, body?: object, signal?: AbortSignal): Promise<T> => {
      if (!apiUrl)
        throw new Error("La API de automatizaciones no está configurada en este entorno.");
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
      const response = await fetch(`${apiUrl}/api/integrations/make/${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo consultar la integración.");
      return data as T;
    },
    [apiUrl],
  );
  const load = useCallback(
    (signal?: AbortSignal) =>
      api<{ key: KeyInfo | null }>(companyId, undefined, signal).then((data) => {
        if (!signal?.aborted) setInfo(data.key);
      }),
    [api, companyId],
  );
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal)
      .catch((e: unknown) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "No se pudo consultar Make.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [load]);
  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => setToken(""), 5 * 60000);
    return () => window.clearTimeout(timer);
  }, [token]);
  async function confirm() {
    setBusy(true);
    setError("");
    setToken("");
    try {
      if (action === "rotate") {
        const data = await api<{ token: string }>("key", { companyId });
        setToken(data.token);
        setNotice(
          "Clave generada. Cópiala en la conexión privada de Make; solo se muestra una vez.",
        );
      } else {
        await api("revoke", { companyId });
        setNotice("La clave anterior ya no permite importar citas ni enviar recordatorios.");
      }
      setAction(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la clave.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setError("No se pudo copiar. Selecciona el campo y cópialo manualmente.");
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-8 space-y-6">
      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Workflow className="text-emerald-600" /> Cal.com → Make → WhatsApp
          </CardTitle>
          <CardDescription className="text-base leading-7">
            Conserva tu escenario de Make y sustituye Evolution API por la API oficial de Meta. Make
            decide cuándo enviar; {brand.name} valida cada solicitud.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-base leading-7 text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-xl bg-emerald-50 p-4 text-base leading-7 text-emerald-900"
            >
              {notice}
            </p>
          )}
          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-base font-medium">
              {info?.active ? `Clave activa · termina en ${info.token_hint}` : "Sin clave activa"}
            </p>
            {info?.active && (
              <p className="mt-2 text-sm text-slate-500">
                Caduca el {new Date(info.expires_at).toLocaleDateString("es-MX")}. Cada empresa
                utiliza una clave distinta.
              </p>
            )}
            <p className="mt-3 text-base leading-7 text-slate-600">
              Último evento:{" "}
              {info?.last_event_at
                ? new Date(info.last_event_at).toLocaleString("es-MX")
                : "Todavía no recibido"}
              {info?.last_result ? ` · ${info.last_result}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setAction("rotate")}
              disabled={busy}
              className="h-11 gap-2 text-base"
            >
              <KeyRound className="size-4" />
              {info?.active ? "Reemplazar clave" : "Generar clave para Make"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={busy}
              className="h-11 gap-2 text-base"
            >
              <RefreshCw className="size-4" /> Actualizar
            </Button>
            {info?.active && (
              <Button variant="ghost" onClick={() => setAction("revoke")} disabled={busy}>
                Revocar clave
              </Button>
            )}
          </div>
          {token && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label htmlFor="make-key" className="block text-base font-medium text-amber-900">
                Clave privada · cópiala ahora
              </label>
              <input
                id="make-key"
                type="password"
                readOnly
                value={token}
                className="h-11 w-full rounded-md border border-amber-200 bg-white px-3 font-mono text-sm"
              />
              <Button
                variant="outline"
                onClick={() => void copy(token, "Clave copiada. Guárdala únicamente en Make.")}
                className="gap-2"
              >
                <Copy className="size-4" /> Copiar clave
              </Button>
              <Button variant="ghost" onClick={() => setToken("")}>
                Ocultar definitivamente
              </Button>
              <p className="text-sm leading-6 text-amber-900">
                Permite importar citas y solicitar recordatorios de esta empresa durante 90 días. No
                permite cambiar planes o pagos. No la compartas por chat ni la pongas en la URL.
              </p>
            </div>
          )}
          <div>
            <label htmlFor="make-endpoint" className="mb-2 block text-base font-medium">
              URL del módulo HTTP de Make
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="make-endpoint"
                readOnly
                value={endpoint}
                className="h-11 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-sm"
              />
              <Button
                variant="outline"
                disabled={!apiUrl}
                onClick={() => void copy(endpoint, "URL copiada.")}
              >
                Copiar URL
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Configura el módulo HTTP paso a paso</CardTitle>
          <CardDescription className="text-base leading-7">
            Primero sincroniza una cita sin enviar mensajes. Activa el envío después de conectar
            Meta y revisar el consentimiento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-base leading-7 text-slate-600">
          <ol className="list-decimal space-y-4 pl-5">
            <li>
              En Make, conserva el disparador de Cal.com. Desactiva el módulo que envía mediante
              Evolution API para evitar mensajes duplicados.
            </li>
            <li>
              Añade un módulo HTTP: método <code>POST</code>, URL de arriba y cuerpo JSON.
            </li>
            <li>
              Añade <code>Content-Type: application/json</code> y{" "}
              <code>Authorization: Bearer TU_CLAVE_PRIVADA</code>. Guarda la clave en la conexión
              privada del módulo, nunca en parámetros de URL.
            </li>
            <li>
              Mapea el UID estable, nombre, teléfono y fechas del evento. Las fechas deben incluir
              zona horaria: por ejemplo <code>2030-12-01T16:00:00Z</code>.
            </li>
            <li>
              En Cal.com, solicita autorización expresa para recordatorios por WhatsApp. Mapea esa
              respuesta a <code>whatsappConsent</code> y su evidencia; no pongas <code>true</code>{" "}
              para todos los clientes.
            </li>
            <li>
              Ejecuta una prueba con <code>sendReminder: false</code>. La cita debe aparecer en tu
              calendario de {brand.name}.
            </li>
            <li>
              Conecta el número y comprueba la plantilla en{" "}
              <Link href="/dashboard/whatsapp" className="font-medium text-emerald-700 underline">
                WhatsApp
              </Link>
              . Cuando el acceso esté aprobado, puedes usar <code>sendReminder: true</code> para
              enviar al recibir la reserva.
            </li>
          </ol>
          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer font-medium text-slate-800">
              Ver cuerpo JSON para mapear en Make
            </summary>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100">
              {example}
            </pre>
            <Button
              variant="outline"
              onClick={() =>
                void copy(
                  example,
                  "JSON copiado. Sustituye los marcadores por los datos de Cal.com.",
                )
              }
              className="mt-4"
            >
              Copiar ejemplo
            </Button>
          </details>
          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer font-medium text-slate-800">
              Reprogramaciones, cancelaciones y recordatorios posteriores
            </summary>
            <ul className="mt-4 list-disc space-y-3 pl-5">
              <li>
                <code>rescheduled</code>: mismos campos que created con la fecha actualizada y la
                fecha real del evento en eventAt.
              </li>
              <li>
                <code>cancelled</code>: envía event, bookingId y eventAt. No se enviará un WhatsApp.
              </li>
              <li>
                <code>remind</code>: después de sincronizar, Make llama con event, bookingId y
                startsAt. Usa la fecha vigente para no recordar una cita reprogramada.
              </li>
              <li>
                {brand.name} utiliza una clave de envío derivada de la cita y su horario: los
                reintentos del mismo recordatorio no generan otro mensaje.
              </li>
            </ul>
          </details>
          <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
            El flujo termina cuando Meta envía la respuesta del botón al webhook de Railway. La
            plataforma comprueba el remitente y el contexto antes de confirmar o cancelar la cita
            correcta.
          </p>
          <p className="text-sm leading-6">
            Un 403 indica acceso, consentimiento o cuota pendientes. Un 503 con resultado
            desconocido requiere comprobar el envío; no generes otro UID para forzarlo. Los eventos
            de Make se autentican con la clave de esta empresa.
          </p>
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "rotate" ? "Crear clave privada para Make" : "Revocar acceso de Make"}
            </DialogTitle>
            <DialogDescription className="text-base leading-7">
              {action === "rotate"
                ? "La nueva clave permitirá sincronizar citas y solicitar recordatorios solo de esta empresa. Caducará en 90 días. Si había otra clave, dejará de funcionar y tendrás que actualizarla en Make."
                : "El escenario dejará de poder importar citas o solicitar recordatorios con esta clave. Podrás generar otra cuando quieras."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>
              Volver
            </Button>
            <Button onClick={() => void confirm()} disabled={busy}>
              {busy ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
