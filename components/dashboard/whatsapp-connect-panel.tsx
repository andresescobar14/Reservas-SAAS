"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, RefreshCw, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Connection = {
  state: string;
  phone: string | null;
  name: string | null;
  templateStatus: string;
  confirmationStatus: string;
};

const labels: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "En revisión",
  MISSING: "Pendiente de crear",
  REJECTED: "Rechazada",
  INCOMPATIBLE: "Requiere ajustar texto o botones",
  NOT_CHECKED: "Pendiente de comprobar",
  PAUSED: "Pausada",
  DISABLED: "Deshabilitada",
};

export function WhatsAppConnectPanel({
  companyId,
  apiUrl,
  onChanged,
}: {
  companyId: string;
  apiUrl: string;
  onChanged: () => void;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const api = useCallback(
    async <T,>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
      if (!apiUrl) throw new Error("La API de WhatsApp todavía no está configurada.");
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
      const timeout = AbortSignal.timeout(70000);
      const response = await fetch(`${apiUrl}/api/whatsapp/${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo completar la operación.");
      return data as T;
    },
    [apiUrl],
  );

  const load = useCallback(
    (signal?: AbortSignal) =>
      api<{ connection: Connection | null }>(
        `status/${encodeURIComponent(companyId)}`,
        undefined,
        signal,
      ),
    [api, companyId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setConnection(result.connection);
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(messageFor(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [load]);

  async function act(path: string, values?: Record<string, string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ message?: string }>(path, { companyId, ...values });
      if (path === "connection/direct") {
        setShowForm(false);
        setNotice("Número conectado. Revisa las plantillas antes de activar los envíos.");
      } else {
        setNotice(result.message || "");
      }
      setDisconnectOpen(false);
      const updated = await load();
      setConnection(updated.connection);
      setLoaded(true);
      onChanged();
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  }

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const token = String(data.get("metaApiCredential") || "").trim();
    const tokenInput = form.elements.namedItem("metaApiCredential") as HTMLInputElement;
    tokenInput.value = "";
    void act("connection/direct", {
      wabaId: String(data.get("wabaId") || "").trim(),
      phoneId: String(data.get("phoneId") || "").trim(),
      token,
    });
  }

  const connected = connection?.state === "CONNECTED";
  const templates = [
    {
      kind: "confirmation",
      title: "Confirmación de reserva",
      status: connection?.confirmationStatus,
    },
    { kind: "reminder", title: "Recordatorio previo", status: connection?.templateStatus },
  ];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Smartphone className="size-5 text-emerald-600" /> Conectar un número de WhatsApp
        </CardTitle>
        <CardDescription className="text-base leading-7">
          Registra el número emisor en WhatsApp Manager y vincúlalo aquí para enviar confirmaciones
          y recordatorios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!connected && (
          <>
            <ol className="list-decimal space-y-2 pl-5 text-base leading-7 text-slate-700">
              <li>
                Agrega y registra un número dedicado a la API. Usa uno distinto del que quieres
                conservar en tu móvil.
              </li>
              <li>Añade tu método de pago en la cuenta de WhatsApp de Meta.</li>
              <li>Copia el ID de la cuenta y el ID del número.</li>
            </ol>
            <p className="text-base leading-7 text-slate-700">
              Para vincular una cuenta de otro negocio, Meta debe conceder acceso a la app de
              Reservas.
            </p>
            <a
              href="https://business.facebook.com/wa/manage/home/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-medium text-emerald-700 underline underline-offset-4"
            >
              Abrir WhatsApp Manager <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </>
        )}
        {connected && (
          <>
            <p className="text-base leading-7">
              <strong>Número conectado</strong> {connection.phone || connection.name}
            </p>
            <ul className="space-y-2">
              {templates.map(({ kind, title, status }) => (
                <li
                  key={kind}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <span>
                    {title} · {labels[status || "NOT_CHECKED"] || status}
                  </span>
                  {status === "MISSING" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act("template/submit", { kind })}
                    >
                      Enviar a revisión
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {loaded && showForm && (
          <form onSubmit={connect} className="grid max-w-xl gap-4" autoComplete="off">
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="whatsapp-waba">
                ID de la cuenta de WhatsApp Business (WABA)
              </label>
              <Input
                id="whatsapp-waba"
                name="wabaId"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{5,30}"
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="whatsapp-phone-id">
                ID del número de teléfono
              </label>
              <Input
                id="whatsapp-phone-id"
                name="phoneId"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{5,30}"
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="whatsapp-meta-token">
                Token de acceso de Meta
              </label>
              <Input
                id="whatsapp-meta-token"
                name="metaApiCredential"
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                minLength={20}
                maxLength={4096}
                required
                disabled={busy}
                aria-describedby="whatsapp-token-help"
              />
              <p id="whatsapp-token-help" className="text-sm text-slate-600">
                Usa un token de usuario del sistema emitido para la app de Meta de Reservas y con
                permisos de administración y envío. Se guarda cifrado en el servidor.
              </p>
            </div>
            <Button type="submit" disabled={busy} className="w-fit">
              Validar y conectar número
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
            {notice}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm text-slate-600">
            Comprobando la configuración…
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(!loaded || connected) && (
            <Button variant="outline" disabled={busy} onClick={() => void act("connection/check")}>
              <RefreshCw className="size-4" /> Actualizar desde Meta
            </Button>
          )}
          {loaded && (
            <Button
              variant={connected || showForm ? "outline" : "default"}
              disabled={busy}
              aria-expanded={showForm}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm
                ? "Cerrar formulario"
                : connected
                  ? "Actualizar credencial"
                  : "Introducir credenciales de Meta"}
            </Button>
          )}
          {connected && (
            <Button variant="outline" disabled={busy} onClick={() => setDisconnectOpen(true)}>
              Desconectar
            </Button>
          )}
        </div>
        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desconectar el número</DialogTitle>
              <DialogDescription>
                Reservas dejará de enviar mensajes con este número y eliminará la credencial
                guardada.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setDisconnectOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void act("connection/disconnect")}
              >
                Desconectar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function messageFor(failure: unknown) {
  return failure instanceof Error ? failure.message : "No se pudo completar la operación.";
}
