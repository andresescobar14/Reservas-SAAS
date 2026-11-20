"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Workflow, RefreshCw, Copy, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type State = {
  scheduler: "native";
  settings: {
    enabled: boolean;
    reminder_minutes: number;
    cal_enabled: boolean;
    cal_endpoint: string | null;
    cal_last_result?: string;
    cal_last_event_at?: string;
  };
  counts: { state: string; count: number }[];
  jobs: { id: string; kind: string; due_at: string; state: string; last_code: string | null }[];
};
const states: Record<string, string> = {
  pending: "Programado",
  processing: "Procesando",
  sent: "Aceptado por Meta",
  blocked: "Bloqueado",
  cancelled: "Cancelado",
  skipped: "Omitido",
  failed: "Falló",
  review: "Requiere revisión",
};
const reasons: Record<string, string> = {
  CONSENT_REQUIRED: "Falta autorización del cliente",
  TRIAL_REVIEW: "Acceso de WhatsApp pendiente de aprobación",
  TRIAL_EXPIRED: "Prueba vencida",
  NUMBER_DISCONNECTED: "Vuelve a conectar WhatsApp",
  META_NOT_CONFIGURED: "Revisa número y plantillas",
  MESSAGE_LIMIT: "Límite de mensajes alcanzado",
  RESCHEDULE_REQUESTED: "El cliente solicitó cambiar la fecha",
  APPOINTMENT_PAST: "La fecha de la reserva ya pasó",
  SEND_OUTCOME_UNKNOWN: "Resultado incierto: no se reenviará automáticamente",
  META_REJECTED: "Meta rechazó el mensaje",
  AUTOMATION_PAUSED: "Automatización pausada",
  QUIET_HOURS: "Recordatorio aplazado hasta las 8:00 a. m. del negocio",
  QUIET_HOURS_TOO_LATE: "Omitido: no hay horario permitido antes de la cita",
};

export function AutomationPanel({
  companyId,
  apiUrl,
  showCal = true,
}: {
  companyId: string;
  apiUrl: string;
  showCal?: boolean;
}) {
  const [data, setData] = useState<State | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState(1440);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState("");
  const api = useCallback(
    async <T,>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
      if (!apiUrl) throw new Error("El servidor de automatización aún no está configurado.");
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) throw new Error("Vuelve a iniciar sesión para gestionar tu automatización.");
      const response = await fetch(`${apiUrl}/api/automation/${path}`, {
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
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "No se pudo consultar la automatización.");
      return result as T;
    },
    [apiUrl],
  );
  const load = useCallback(
    (signal?: AbortSignal) =>
      api<State>(companyId, undefined, signal).then((result) => {
        if (signal?.aborted) return;
        setData(result);
        setEnabled(result.settings.enabled);
        setMinutes(result.settings.reminder_minutes);
      }),
    [api, companyId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Servicio no disponible.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [load]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
    }
  }
  const webhook = data?.settings.cal_endpoint
    ? `${apiUrl}/webhooks/cal/${data.settings.cal_endpoint}`
    : "";
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Workflow className="text-emerald-600" />
            Mensajes automáticos
          </CardTitle>
          <CardDescription className="text-base leading-7">
            {brand.name} programa y envía los mensajes desde tu WhatsApp Business. El proceso
            continúa aunque cierres esta página.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
              {notice}
            </p>
          )}
          <ol className="grid gap-4 text-base leading-7 sm:grid-cols-2">
            <li className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <strong className="font-medium">1. Confirmación al reservar</strong>
              <p>
                El cliente recibe su fecha y hora. Puede confirmar, solicitar un cambio o cancelar.
              </p>
            </li>
            <li className="rounded-2xl border border-slate-200 p-5">
              <strong className="font-medium">2. Un recordatorio previo</strong>
              <p>Se envía con la anticipación que elijas. Cada envío cuenta como un mensaje.</p>
            </li>
          </ol>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                await api("settings", { companyId, enabled, reminderMinutes: minutes });
                setNotice(
                  enabled
                    ? "Automatización activada para las nuevas reservas autorizadas."
                    : "Automatización pausada. Los envíos pendientes se cancelaron.",
                );
              });
            }}
          >
            <label className="flex items-start gap-3 text-base leading-7">
              <input
                type="checkbox"
                className="mt-1.5 size-5 accent-emerald-600"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={busy || !data}
              />
              Activar confirmación y recordatorio para las nuevas reservas
            </label>
            <label className="block space-y-2 text-base">
              <span className="flex items-center gap-2">
                <Clock3 size={18} className="text-emerald-600" />
                Enviar el recordatorio
              </span>
              <select
                className="native-select max-w-xs"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                disabled={busy || !data}
              >
                {[
                  { value: 1440, label: "24 horas antes" },
                  { value: 120, label: "2 horas antes" },
                  { value: 60, label: "1 hora antes" },
                  { value: 30, label: "30 minutos antes" },
                ].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              Necesita número conectado, ambas plantillas aprobadas y autorización del cliente. Los
              cambios de anticipación se aplican a nuevas reservas. Al pausar se cancelan los
              pendientes; reactivar no envía mensajes de reservas antiguas.
            </p>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              Los recordatorios se envían entre las 8:00 a. m. y las 8:00 p. m. en la zona horaria
              del negocio. Si corresponde enviarlo fuera de ese horario, se aplaza a las 8:00 a. m.;
              si la cita ya habrá comenzado, se omite. Si una reserva se crea con menos
              anticipación, el recordatorio se coloca a mitad del tiempo disponible. Si faltan menos
              de 10 minutos, se envía solo la confirmación.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || !data} type="submit">
                Guardar automatización
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await load();
                  })
                }
              >
                <RefreshCw size={16} />
                Actualizar estado
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap gap-3 text-sm">
            {data?.counts.map((item) => (
              <span className="rounded-full bg-slate-100 px-3 py-2" key={item.state}>
                {states[item.state] || item.state}: {item.count}
              </span>
            ))}
          </div>
          {Boolean(data?.jobs.length) && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="pb-3 text-left text-base font-medium">
                  Últimos mensajes programados
                </caption>
                <thead>
                  <tr className="border-b">
                    <th className="p-3">Mensaje</th>
                    <th className="p-3">Programación</th>
                    <th className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.jobs.map((job) => (
                    <tr className="border-b" key={job.id}>
                      <td className="p-3">
                        {job.kind === "confirmation" ? "Confirmación" : "Recordatorio"}
                      </td>
                      <td className="p-3">{new Date(job.due_at).toLocaleString("es-MX")}</td>
                      <td className="p-3">
                        {states[job.state] || job.state}
                        {job.last_code && reasons[job.last_code] && (
                          <p className="mt-1 text-slate-500">{reasons[job.last_code]}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-slate-500">
                Aceptado por Meta indica que la API recibió el mensaje; no confirma que el
                destinatario ya lo leyó.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {showCal && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Conectar Cal.com directamente</CardTitle>
            <CardDescription className="text-base leading-7">
              Las reservas llegan a {brand.name} sin Make. Nuestro servidor se ocupa de la
              programación.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="flex items-start gap-2 text-base leading-7 text-slate-600">
              <ShieldCheck className="mt-1 shrink-0 text-emerald-600" size={20} />
              Cada negocio tiene una URL y una firma propias. Guarda el secreto en Cal.com; nunca
              necesitas copiar el token de Meta.
            </p>
            <Button
              disabled={busy || !data}
              onClick={() =>
                void perform(async () => {
                  const result = await api<{ secret: string }>("cal/connect", { companyId });
                  setSecret(result.secret);
                  setNotice("Copia el nuevo secreto a Cal.com. El anterior dejó de funcionar.");
                })
              }
            >
              {webhook ? "Renovar conexión de Cal.com" : "Preparar conexión de Cal.com"}
            </Button>
            {webhook && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                <label className="block text-sm font-medium" htmlFor="cal-webhook-url">
                  URL del webhook
                </label>
                <input
                  id="cal-webhook-url"
                  readOnly
                  value={webhook}
                  className="w-full rounded border bg-white p-3 text-sm"
                />
                <Button variant="outline" disabled={busy} onClick={() => void copy(webhook, "url")}>
                  <Copy size={15} />
                  {copied === "url" ? "URL copiada" : "Copiar URL"}
                </Button>
              </div>
            )}
            {secret && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label htmlFor="cal-webhook-secret" className="block text-base font-medium">
                  Secreto de firma: se muestra solo esta vez
                </label>
                <input
                  id="cal-webhook-secret"
                  readOnly
                  type="password"
                  value={secret}
                  className="w-full rounded border bg-white p-3 text-sm"
                  autoComplete="off"
                />
                <Button variant="outline" onClick={() => void copy(secret, "secret")}>
                  <Copy size={15} />
                  {copied === "secret" ? "Secreto copiado" : "Copiar secreto"}
                </Button>
                <Button variant="ghost" onClick={() => setSecret("")}>
                  Ya lo guardé en Cal.com
                </Button>
              </div>
            )}
            <ol className="list-decimal space-y-3 pl-5 text-base leading-7 text-slate-600">
              <li>
                En Cal.com, abre Ajustes → Desarrollador → Webhooks y crea uno con la URL anterior.
              </li>
              <li>
                Pega el secreto en el campo Secret. Selecciona Booking Created, Booking Rescheduled
                y Booking Cancelled. Conserva el formato estándar del webhook.
              </li>
              <li>
                En el formulario de reserva, pide teléfono internacional y añade una casilla
                opcional llamada <code>whatsappConsent</code>: «Acepto recibir confirmación y
                recordatorios de esta reserva por WhatsApp». Debe enviar un valor booleano.
              </li>
              <li>
                Activa el webhook y crea una reserva con la casilla aceptada. Actualiza esta página
                para ver los trabajos.
              </li>
            </ol>
            <p className="text-sm leading-6 text-slate-500">
              La integración admite reservas individuales aceptadas. Los cambios hechos en Cal.com
              actualizan {brand.name}. Las respuestas de WhatsApp se registran aquí; todavía no
              modifican Cal.com.
            </p>
            {data?.settings.cal_last_event_at && (
              <p className="text-sm text-slate-600">
                Último evento: {new Date(data.settings.cal_last_event_at).toLocaleString("es-MX")} ·{" "}
                {data.settings.cal_last_result === "IMPORTED"
                  ? "Reserva sincronizada"
                  : data.settings.cal_last_result}
              </p>
            )}
            {data?.settings.cal_enabled && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("cal/disconnect", { companyId });
                    setSecret("");
                    setNotice("Se detuvo la recepción de nuevas reservas de Cal.com.");
                  })
                }
              >
                Desconectar Cal.com
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
