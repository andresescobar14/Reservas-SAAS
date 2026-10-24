"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleHelp, Cloud, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CloudStatus = {
  companyId: string;
  provider: "meta-cloud";
  status: "READY" | "PENDING_SETUP" | "BLOCKED";
  message: string;
  checks: {
    account: boolean;
    credentials: boolean;
    template: boolean;
    access: boolean;
    quota: boolean;
  };
  plan: "TRIAL" | "PRO" | "PREMIUM" | null;
  sent: number;
  limit: number;
  period: string | null;
  checkedAt: string;
};

export function WhatsAppCloudWorkspace({
  companyId,
  companyName,
  apiUrl,
}: {
  companyId: string;
  companyName: string;
  apiUrl: string;
}) {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(
    async (signal?: AbortSignal) => {
      const {
        data: { session },
        error: sessionError,
      } = await createClient().auth.getSession();
      if (!apiUrl)
        throw new Error("La conexión con Meta todavía no está configurada en este entorno.");
      if (sessionError || !session) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      const response = await fetch(
        `${apiUrl}/api/whatsapp/status/${encodeURIComponent(companyId)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "No se pudo comprobar la conexión con Meta.");
      if (
        data.companyId !== companyId ||
        data.provider !== "meta-cloud" ||
        !["READY", "PENDING_SETUP", "BLOCKED"].includes(data.status) ||
        !data.checks
      ) {
        throw new Error("La API devolvió un estado no válido. Vuelve a intentarlo.");
      }
      return data as CloudStatus;
    },
    [apiUrl, companyId],
  );

  const refresh = useCallback(
    (signal?: AbortSignal) =>
      fetchStatus(signal)
        .then((data) => {
          if (!signal?.aborted) setStatus(data);
        })
        .catch((failure: unknown) => {
          if (signal?.aborted) return;
          setStatus(null);
          setError(
            failure instanceof TypeError
              ? "No se pudo contactar con la API de WhatsApp. Inténtalo de nuevo."
              : failure instanceof Error
                ? failure.message
                : "No se pudo actualizar el estado.",
          );
        })
        .finally(() => {
          if (!signal?.aborted) setBusy(false);
        }),
    [fetchStatus],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const ready = status?.status === "READY";
  const checks = [
    { label: "API y base de datos disponibles", done: Boolean(status) },
    { label: "Empresa dada de alta en WhatsApp", done: status?.checks.account },
    { label: "Número oficial y credencial configurados", done: status?.checks.credentials },
    { label: "Plantilla de recordatorio aprobada", done: status?.checks.template },
    { label: "Acceso aprobado y plan vigente", done: status?.checks.access },
  ];

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">WHATSAPP BUSINESS PLATFORM</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          El WhatsApp de tu negocio
        </h1>
        <p className="mt-3 text-lg leading-8 text-slate-600">
          Consulta la configuración de Meta para {companyName}.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Cloud className="text-emerald-600" /> API oficial de Meta
              </CardTitle>
              <span
                role="status"
                className={`rounded-full px-3 py-1 text-sm ${ready ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
              >
                {busy
                  ? "Comprobando…"
                  : error
                    ? "Sin verificar"
                    : ready
                      ? "Configuración completa"
                      : status?.status === "BLOCKED"
                        ? "Envíos bloqueados"
                        : "Alta pendiente"}
              </span>
            </div>
            <CardDescription className="text-base leading-7">
              Esta conexión utiliza Meta Cloud API. El alta se realiza con el número oficial de tu
              empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error ? (
              <p
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50 p-5 text-base leading-7 text-red-800"
              >
                {error}
              </p>
            ) : (
              <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-base leading-7 text-emerald-900">
                {status?.message || "Consultando el estado de tu empresa…"}
              </p>
            )}
            <ul className="space-y-4">
              {checks.map((check) => (
                <li key={check.label} className="flex items-start gap-3 text-base text-slate-700">
                  {check.done ? (
                    <Check
                      className="mt-0.5 size-5 shrink-0 text-emerald-600"
                      aria-label="Completado"
                    />
                  ) : (
                    <CircleHelp
                      className="mt-0.5 size-5 shrink-0 text-slate-400"
                      aria-label="Pendiente"
                    />
                  )}
                  {check.label}
                </li>
              ))}
            </ul>
            <Button
              onClick={() => {
                setBusy(true);
                setError("");
                void refresh();
              }}
              disabled={busy}
              className="h-11 gap-2 px-5 text-base"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {busy ? "Actualizando…" : "Actualizar estado"}
            </Button>
            {status && (
              <p className="text-sm text-slate-500">
                Comprobado: {new Date(status.checkedAt).toLocaleString("es-MX")}. Actualiza después
                de guardar cambios en la configuración.
              </p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Uso de recordatorios</CardTitle>
              <CardDescription className="text-base">
                Cuota de WhatsApp de tu empresa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-medium">
                {status?.plan
                  ? `${status.sent.toLocaleString("es-MX")} / ${status.limit.toLocaleString("es-MX")}`
                  : "Pendiente de activación"}
              </p>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {status?.plan === "TRIAL"
                  ? "TRIAL · 35 recordatorios totales durante 7 días. El envío requiere aprobación manual."
                  : status?.plan
                    ? `${status.plan} · Mensajes aceptados por Meta durante el mes actual.`
                    : "El administrador debe activar el plan y configurar el número antes del primer envío."}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Un mensaje aceptado por la API todavía puede estar pendiente de entrega.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Costos de Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-base leading-7 text-slate-600">
              <p>
                Meta cobra por mensajes entregados según el país del destinatario y la categoría.
                Los recordatorios deben usar una plantilla de utilidad aprobada.
              </p>
              <p>
                Las tarifas de Meta y el alojamiento del servicio son costos independientes del plan
                de Reserva.
              </p>
              <a
                href="https://business.whatsapp.com/products/platform-pricing"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-emerald-700 underline underline-offset-4"
              >
                Consultar tarifas oficiales de Meta
              </a>
            </CardContent>
          </Card>
          <p className="flex items-start gap-3 px-2 text-base leading-7 text-slate-600">
            <ShieldCheck className="mt-1 size-5 shrink-0 text-emerald-600" />
            Los tokens se guardan en el servidor. Esta pantalla permite consultar y actualizar el
            estado sin exponer credenciales.
          </p>
        </div>
      </div>
    </>
  );
}
