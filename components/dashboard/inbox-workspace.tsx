"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  Info,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  createPreviewConversations,
  filterConversations,
  latestInboundAt,
  previewReply,
  serviceWindow,
  type InboxConversation,
  type InboxFilter,
  type InboxMessage,
} from "@/lib/inbox";

type Thread = {
  messages: InboxMessage[];
  lastInboundAt: string | null;
  appointment: InboxConversation["appointment"];
  hasMore: boolean;
  nextCursor: string | null;
};
type List = {
  conversations: InboxConversation[];
  connected: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  phoneId: string | null;
};
const deliveryLabel: Record<string, string> = {
  simulated: "Simulado",
  sending: "Enviando",
  accepted: "Aceptado por Meta",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
  unknown: "Por comprobar",
  received: "Recibido",
};
const templates = [
  {
    name: "reserva_confirmacion",
    title: "Confirmación de reserva",
    description: "Confirma una reserva recién creada.",
  },
  {
    name: "recordatorio_cita",
    title: "Recordatorio de cita",
    description: "Recuerda la fecha y hora de una reserva.",
  },
] as const;

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-100",
        small ? "size-9 text-xs" : "size-11 text-sm",
      )}
    >
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")}
    </span>
  );
}
function time(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}
function appointmentDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function InboxWorkspace({
  companyName,
  companyId,
  apiUrl,
  timezone,
  referenceTime,
  demo = false,
}: {
  companyName: string;
  companyId?: string;
  apiUrl?: string;
  timezone: string;
  referenceTime: string;
  demo?: boolean;
}) {
  const [preview, setPreview] = useState(demo);
  const [examples, setExamples] = useState(() => createPreviewConversations(referenceTime));
  const [live, setLive] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(demo ? "preview-ana" : null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [now, setNow] = useState(Date.parse(referenceTime));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(!demo);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileChat, setMobileChat] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [templateError, setTemplateError] = useState("");
  const [approved, setApproved] = useState<[boolean, boolean]>([false, false]);
  const [listPage, setListPage] = useState<{ hasMore: boolean; nextCursor: string | null }>({
    hasMore: false,
    nextCursor: null,
  });
  const [threadPages, setThreadPages] = useState<
    Record<string, { hasMore: boolean; nextCursor: string | null }>
  >({});
  const [loadingMore, setLoadingMore] = useState(false);
  const numberRef = useRef<string | null>(null);
  const olderLoaded = useRef(false);
  const threadsExpanded = useRef(new Set<string>());
  const bottom = useRef<HTMLDivElement>(null);
  const messageScroll = useRef<HTMLDivElement>(null);
  const requestKeys = useRef(new Map<string, string>());
  const conversations = preview ? examples : live;
  const selected = conversations.find((c) => c.id === selectedId) || null;
  const windowState = serviceWindow(selected?.lastInboundAt || null, now);
  const visible = filterConversations(conversations, query, filter, now);
  const unread = conversations.reduce((sum, c) => sum + c.unread, 0);
  const draft = selected ? drafts[selected.id] || "" : "";

  const api = useCallback(
    async <T,>(path: string, body?: unknown, signal?: AbortSignal, key?: string): Promise<T> => {
      if (!apiUrl || !companyId)
        throw new Error("La conexión de WhatsApp todavía no está configurada para esta bandeja.");
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
      const response = await fetch(`${apiUrl}/api/whatsapp/${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "No pudimos actualizar la bandeja. Inténtalo de nuevo.");
      return data;
    },
    [apiUrl, companyId],
  );

  const loadList = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<List>(`inbox/${companyId}`, undefined, signal);
      if (signal?.aborted) return;
      // A new inbound message may be newer than the 30-second clock tick.
      setNow(Date.now());
      setConnected(result.connected);
      const sameNumber = numberRef.current === result.phoneId;
      numberRef.current = result.phoneId;
      if (!sameNumber) olderLoaded.current = false;
      if (!olderLoaded.current)
        setListPage({ hasMore: result.hasMore, nextCursor: result.nextCursor });
      setLive((previous) => [
        ...result.conversations.map((c) => {
          const old = previous.find((item) => item.id === c.id);
          const messages = old
            ? [
                ...old.messages,
                ...c.messages.filter((m) => !old.messages.some((p) => p.id === m.id)),
              ].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
            : c.messages;
          return old
            ? {
                ...c,
                messages,
                lastInboundAt: latestInboundAt(old.lastInboundAt, c.lastInboundAt),
                appointment: old.appointment,
              }
            : c;
        }),
        ...(sameNumber
          ? previous.filter((c) => !result.conversations.some((row) => row.id === c.id))
          : []),
      ]);
      setSelectedId((previous) =>
        previous && sameNumber ? previous : result.conversations[0]?.id || null,
      );
      setError("");
      setBusy(false);
    },
    [api, companyId],
  );

  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    const load = () => {
      if (document.visibilityState !== "hidden")
        void loadList(controller.signal).catch((e) => {
          if (!controller.signal.aborted) {
            setError(e instanceof Error ? e.message : "No se pudo conectar con WhatsApp.");
            setBusy(false);
          }
        });
    };
    load();
    const timer = setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    void api<{ checks: { template: boolean; confirmationTemplate: boolean } }>(
      `status/${companyId}`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setApproved([result.checks.confirmationTemplate, result.checks.template]);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [preview, loadList, api, companyId]);

  useEffect(() => {
    if (preview || !selectedId) return;
    const controller = new AbortController(),
      id = selectedId;
    const load = () => {
      if (document.visibilityState !== "hidden")
        void api<Thread>(`inbox/${companyId}/${id}`, undefined, controller.signal)
          .then(async (result) => {
            if (controller.signal.aborted) return;
            setNow(Date.now());
            setLive((previous) =>
              previous.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      messages: [
                        ...new Map(
                          [...c.messages, ...result.messages].map((m) => [m.id, m]),
                        ).values(),
                      ].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)),
                      lastInboundAt: latestInboundAt(c.lastInboundAt, result.lastInboundAt),
                      appointment: result.appointment,
                      unread: 0,
                    }
                  : c,
              ),
            );
            const last = result.messages.at(-1);
            if (!threadsExpanded.current.has(id))
              setThreadPages((previous) => ({
                ...previous,
                [id]: { hasMore: result.hasMore, nextCursor: result.nextCursor },
              }));
            if (last)
              await api(`inbox/${companyId}/${id}/read`, { messageId: last.id }, controller.signal);
          })
          .catch((e) => {
            if (!controller.signal.aborted)
              setError(e instanceof Error ? e.message : "No se pudo cargar la conversación.");
          });
    };
    load();
    const timer = setInterval(load, 10000);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [preview, selectedId, api, companyId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (preview || !templateOpen) return;
    const controller = new AbortController();
    void api<{ checks: { template: boolean; confirmationTemplate: boolean } }>(
      `status/${companyId}`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setApproved([result.checks.confirmationTemplate, result.checks.template]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api, companyId, preview, templateOpen]);
  useEffect(() => {
    if (messageScroll.current) messageScroll.current.scrollTop = messageScroll.current.scrollHeight;
  }, [selectedId, selected?.messages.length]);

  function select(c: InboxConversation) {
    setSelectedId(c.id);
    setMobileChat(true);
    setNotice("");
    setError("");
    if (preview)
      setExamples((previous) =>
        previous.map((item) => (item.id === c.id ? { ...item, unread: 0 } : item)),
      );
  }
  function switchMode() {
    setPreview(!preview);
    setSelectedId(preview ? null : "preview-ana");
    setMobileChat(false);
    setQuery("");
    setFilter("all");
    setError("");
    setNotice("");
    setBusy(preview);
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!selected || sending || !draft.trim() || !windowState.open) return;
    setSending(true);
    setNotice("");
    setError("");
    try {
      if (preview) {
        const changed = previewReply(selected, draft, now);
        setExamples((previous) => previous.map((c) => (c.id === selected.id ? changed : c)));
        setNotice("Respuesta simulada. No se envió ningún WhatsApp.");
      } else {
        const fingerprint = JSON.stringify([selected.id, selected.lastInboundAt, draft.trim()]);
        if (!requestKeys.current.has(fingerprint))
          requestKeys.current.set(fingerprint, crypto.randomUUID());
        const result = await api<{ message: InboxMessage }>(
          `inbox/${companyId}/${selected.id}/reply`,
          { text: draft.trim() },
          undefined,
          requestKeys.current.get(fingerprint),
        );
        setLive((previous) =>
          previous.map((c) =>
            c.id === selected.id
              ? {
                  ...c,
                  messages: [
                    ...c.messages.filter((m) => m.id !== result.message.id),
                    result.message,
                  ],
                }
              : c,
          ),
        );
        if (!["accepted", "delivered", "read"].includes(result.message.delivery || ""))
          throw new Error(
            "El envío está fallido o pendiente de comprobar. Revisa su estado antes de repetirlo.",
          );
        setNotice("Meta aceptó tu mensaje. El estado de entrega se actualizará aquí.");
      }
      setDrafts((previous) => ({ ...previous, [selected.id]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  async function loadOlderMessages() {
    if (!selected || loadingMore) return;
    const cursor = threadPages[selected.id]?.nextCursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await api<Thread>(
        `inbox/${companyId}/${selected.id}?before=${encodeURIComponent(cursor)}`,
      );
      threadsExpanded.current.add(selected.id);
      setLive((previous) =>
        previous.map((c) =>
          c.id === selected.id
            ? {
                ...c,
                messages: [
                  ...result.messages.filter((m) => !c.messages.some((p) => p.id === m.id)),
                  ...c.messages,
                ],
              }
            : c,
        ),
      );
      setThreadPages((previous) => ({
        ...previous,
        [selected.id]: { hasMore: result.hasMore, nextCursor: result.nextCursor },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar más mensajes.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function sendTemplate() {
    if (
      preview ||
      sending ||
      !connected ||
      !selected?.appointment?.reservationId ||
      !approved[templateIndex]
    )
      return;
    setSending(true);
    setTemplateError("");
    setNotice("");
    try {
      const appointment = selected.appointment;
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(appointment.startsAt));
      const part = (name: string) => parts.find((p) => p.type === name)?.value || "";
      const body = {
        companyId,
        phone: selected.phone.replace(/\D/g, ""),
        patientName: appointment.patientName || selected.name,
        date: `${part("year")}-${part("month")}-${part("day")}`,
        time: `${part("hour")}:${part("minute")}`,
        reservationId: appointment.reservationId,
        notificationKind: templateIndex === 0 ? "confirmation" : "reminder",
      };
      const fingerprint = JSON.stringify(["template", body]);
      if (!requestKeys.current.has(fingerprint))
        requestKeys.current.set(fingerprint, crypto.randomUUID());
      await api("send", body, undefined, requestKeys.current.get(fingerprint));
      setTemplateOpen(false);
      setNotice("Meta aceptó la plantilla. Este envío cuenta en tu cuota de mensajes automáticos.");
      const thread = await api<Thread>(`inbox/${companyId}/${selected.id}`);
      setLive((previous) =>
        previous.map((c) =>
          c.id === selected.id
            ? {
                ...c,
                messages: [
                  ...new Map([...c.messages, ...thread.messages].map((m) => [m.id, m])).values(),
                ].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)),
              }
            : c,
        ),
      );
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "No se pudo enviar la plantilla.");
    } finally {
      setSending(false);
    }
  }
  async function loadMoreConversations() {
    if (!listPage.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api<List>(
        `inbox/${companyId}?before=${encodeURIComponent(listPage.nextCursor)}`,
      );
      olderLoaded.current = true;
      setLive((previous) => [
        ...previous,
        ...result.conversations.filter((c) => !previous.some((p) => p.id === c.id)),
      ]);
      setListPage({ hasMore: result.hasMore, nextCursor: result.nextCursor });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar más conversaciones.");
    } finally {
      setLoadingMore(false);
    }
  }

  const detailContent = selected && (
    <>
      <div className="flex flex-col items-center border-b border-border px-5 py-7">
        <Avatar name={selected.name} />
        <h2 className="mt-3 text-base font-medium">{selected.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{selected.phone}</p>
        <span className="mt-3 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {preview ? "Contacto de ejemplo" : "WhatsApp del cliente"}
        </span>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays size={16} className="text-emerald-700" /> Próxima reserva
          </h3>
          {selected.appointment ? (
            <div className="mt-3 rounded-xl border border-border bg-background p-4">
              <p className="text-sm font-medium leading-6">{selected.appointment.service}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {appointmentDate(selected.appointment.startsAt, timezone)}
              </p>
              <p className="mt-3 text-xs text-emerald-700">
                {selected.appointment.response === "confirmed"
                  ? "Confirmada por el cliente"
                  : selected.appointment.response === "reschedule_requested"
                    ? "Solicitó cambiar su cita"
                    : "Consulta los detalles en tu agenda"}
              </p>
              {!preview && (
                <Link
                  href="/dashboard/calendario"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
                >
                  Ver calendario <ArrowUpRight size={13} />
                </Link>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Este contacto no tiene una próxima reserva registrada.
            </p>
          )}
        </div>
        <div className="border-t border-border pt-5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck size={16} className="text-emerald-700" /> Atención por WhatsApp
          </h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {windowState.open
              ? "Puedes responder con texto libre mientras la ventana de atención esté abierta."
              : "Para retomar la conversación necesitas una plantilla aprobada y apropiada para el cliente."}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            La ventana se renueva cuando el cliente vuelve a escribir.
          </p>
        </div>
        <div className="rounded-xl bg-muted/70 p-4">
          <p className="text-xs font-medium">Tu negocio, sus conversaciones</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Solo las personas autorizadas en este espacio pueden acceder a estos mensajes.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">CERCA DE CADA CLIENTE</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
            Tu bandeja de mensajes<span className="text-emerald-600">.</span>
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Conversaciones y reservas de {companyName}, en un mismo lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!demo && (
            <Button variant="outline" className="h-10 px-4" onClick={switchMode}>
              {preview ? <MessagesSquare /> : <Sparkles />}
              {preview ? "Volver a mi bandeja" : "Ver ejemplo"}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Actualizar bandeja"
            disabled={busy || preview}
            onClick={() => {
              setBusy(true);
              void loadList().catch((e) => {
                setError(e.message);
                setBusy(false);
              });
            }}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      {preview ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <Sparkles className="size-4 shrink-0" />
          <span>
            <strong className="font-medium">Vista previa interactiva.</strong> Datos de ejemplo; los
            mensajes se simulan y no se envían por WhatsApp.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span
              className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-slate-400")}
            />
            {connected ? "Número conectado" : "Comprobando conexión"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole size={12} /> Conversaciones privadas de tu empresa
          </span>
          <Link href="/dashboard/whatsapp" className="ml-auto text-emerald-700 hover:underline">
            Configurar WhatsApp <ArrowUpRight size={12} className="inline" />
          </Link>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
        >
          {error}
        </div>
      )}
      <div className="grid h-[min(760px,calc(100dvh-250px))] min-h-[550px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_24px_-16px_#00000025] md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_248px]">
        <section
          aria-label="Conversaciones"
          className={cn(
            "min-h-0 flex-col border-r border-border",
            mobileChat ? "hidden md:flex" : "flex",
          )}
        >
          <div className="border-b border-border p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Conversaciones</h2>
              <span
                aria-label={`${unread} mensajes sin leer`}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
              >
                {unread}
              </span>
            </div>
            <label className="mt-4 flex h-10 items-center gap-2 rounded-[5px] border border-border bg-background px-3 text-muted-foreground">
              <Search size={16} />
              <span className="sr-only">Buscar conversación</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nombre o número"
                className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="mt-4 flex gap-1" aria-label="Filtrar conversaciones">
              {(
                [
                  ["all", "Todas"],
                  ["unread", "Sin leer"],
                  ["closed", "Fuera de 24 h"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-[5px] px-2.5 py-1.5 text-xs transition-colors",
                    filter === value
                      ? "bg-emerald-50 font-medium text-emerald-800"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {busy && !conversations.length ? (
              <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <LoaderCircle size={16} className="animate-spin" /> Cargando mensajes…
              </p>
            ) : visible.length ? (
              visible.map((c) => {
                const last = c.messages.at(-1);
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c)}
                    aria-current={selectedId === c.id ? "true" : undefined}
                    className={cn(
                      "mb-1 flex w-full gap-3 rounded-xl p-3 text-left transition-colors",
                      selectedId === c.id
                        ? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-100"
                        : "hover:bg-muted/70",
                    )}
                  >
                    <Avatar name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <time className="shrink-0 text-[11px] text-muted-foreground">
                          {last ? time(last.sentAt, timezone) : ""}
                        </time>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                          {last?.direction === "outgoing" && "Tú: "}
                          {last?.body || "Nueva conversación"}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-primary-foreground">
                            {c.unread}
                          </span>
                        )}
                      </span>
                      {!serviceWindow(c.lastInboundAt, now).open && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <FileText size={10} /> Requiere plantilla
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-5 py-12 text-center">
                <Search size={24} className="mx-auto text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium">
                  {query || filter !== "all" ? "No hay coincidencias" : "Aún no hay conversaciones"}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {query || filter !== "all"
                    ? "Prueba otro nombre o cambia el filtro."
                    : "Los nuevos mensajes de tu número conectado aparecerán aquí."}
                </p>
                {(query || filter !== "all") && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                    className="mt-4 text-xs font-medium text-emerald-700"
                  >
                    Restablecer filtros
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
            <ShieldCheck size={13} />
            {preview
              ? "Datos de ejemplo · Cambios temporales"
              : "Los mensajes se actualizan automáticamente"}
            {!preview && listPage.hasMore && (
              <button
                disabled={loadingMore}
                onClick={() => void loadMoreConversations()}
                className="ml-auto text-emerald-700"
              >
                {loadingMore ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </div>
        </section>
        <section
          aria-label="Chat"
          className={cn("min-h-0 min-w-0 flex-col", mobileChat ? "flex" : "hidden md:flex")}
        >
          {selected ? (
            <>
              <header className="flex min-h-20 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                <button
                  onClick={() => setMobileChat(false)}
                  aria-label="Volver a conversaciones"
                  className="-ml-1 p-1 text-muted-foreground md:hidden"
                >
                  <ArrowLeft size={20} />
                </button>
                <Avatar name={selected.name} small />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-medium">{selected.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selected.phone}</p>
                </div>
                <button
                  aria-label="Ver información del cliente"
                  onClick={() => setDetailsOpen(true)}
                  className="p-2 text-muted-foreground hover:text-foreground xl:hidden"
                >
                  <Info size={19} />
                </button>
                <span className="hidden items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground sm:inline-flex">
                  <MessageCircle size={12} /> WhatsApp
                </span>
              </header>
              <div
                className={cn(
                  "flex items-center gap-2 border-b border-border px-5 py-2.5 text-xs",
                  windowState.open
                    ? "bg-emerald-50/40 text-emerald-800"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Clock3 size={14} className="shrink-0" />
                <span>
                  {windowState.open
                    ? `Ventana abierta · ${Math.ceil(windowState.remainingMs / 3600000)} h para responder`
                    : "Ventana cerrada · Usa una plantilla aprobada"}
                </span>
                {!windowState.open && (
                  <button
                    onClick={() => setTemplateOpen(true)}
                    className="ml-auto shrink-0 font-medium underline underline-offset-4"
                  >
                    Ver plantillas
                  </button>
                )}
              </div>
              <div
                role="log"
                ref={messageScroll}
                aria-label={`Mensajes con ${selected.name}`}
                aria-live="polite"
                aria-relevant="additions"
                className="min-h-0 flex-1 overflow-y-auto bg-background/60 p-4 sm:px-6 sm:py-5 [background-image:radial-gradient(var(--border)_0.7px,transparent_0.7px)] [background-size:20px_20px]"
              >
                <div className="mb-6 text-center">
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-[10px] text-muted-foreground">
                    {preview ? "Conversación de ejemplo" : "Conversación de tu negocio"}
                  </span>
                </div>
                {!preview && threadPages[selected.id]?.hasMore && (
                  <div className="mb-4 text-center">
                    <Button
                      variant="outline"
                      disabled={loadingMore}
                      onClick={() => void loadOlderMessages()}
                    >
                      {loadingMore ? "Cargando…" : "Ver mensajes anteriores"}
                    </Button>
                  </div>
                )}
                <div className="space-y-3">
                  {selected.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        m.direction === "outgoing" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[90%] rounded-2xl border px-4 py-3 sm:max-w-[85%]",
                          m.direction === "outgoing"
                            ? "rounded-br-[5px] border-emerald-100 bg-emerald-50 text-emerald-900"
                            : "rounded-bl-[5px] border-border bg-card",
                        )}
                      >
                        {m.kind === "template" && (
                          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
                            <Sparkles size={11} /> Mensaje automático{preview && " · Ejemplo"}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 [overflow-wrap:anywhere]">
                          {m.body}
                        </p>
                        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
                          <time dateTime={m.sentAt}>{time(m.sentAt, timezone)}</time>
                          {m.direction === "outgoing" && (
                            <span
                              aria-label={deliveryLabel[m.delivery || "accepted"]}
                              title={deliveryLabel[m.delivery || "accepted"]}
                              className="inline-flex items-center gap-1"
                            >
                              {m.delivery === "read" || m.delivery === "delivered" ? (
                                <CheckCheck
                                  size={13}
                                  className={m.delivery === "read" ? "text-emerald-700" : ""}
                                />
                              ) : m.delivery === "failed" || m.delivery === "unknown" ? (
                                <Info size={12} />
                              ) : (
                                <Check size={13} />
                              )}
                              <span
                                className={
                                  m.delivery === "simulated" ||
                                  m.delivery === "failed" ||
                                  m.delivery === "unknown"
                                    ? ""
                                    : "sr-only"
                                }
                              >
                                {deliveryLabel[m.delivery || "accepted"]}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div ref={bottom} />
              </div>
              <form
                onSubmit={(event) => void send(event)}
                className="border-t border-border bg-card p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {windowState.open ? "Responder al cliente" : "Retomar conversación"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTemplateOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-emerald-700"
                  >
                    <FileText size={13} /> Plantillas <ChevronDown size={12} />
                  </button>
                </div>
                {windowState.open ? (
                  <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-emerald-500">
                    <label className="sr-only" htmlFor="chat-reply">
                      Escribe tu respuesta
                    </label>
                    <textarea
                      id="chat-reply"
                      value={draft}
                      onChange={(e) =>
                        setDrafts((previous) => ({ ...previous, [selected.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder={
                        preview ? "Escribe una respuesta de ejemplo…" : "Escribe tu respuesta…"
                      }
                      maxLength={4096}
                      rows={2}
                      className="min-h-12 w-full resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground"
                    />
                    <Button
                      type="submit"
                      aria-label={preview ? "Simular envío" : "Enviar mensaje"}
                      title={preview ? "Simular envío" : "Enviar mensaje"}
                      disabled={!draft.trim() || sending || (!preview && !connected)}
                      className="mb-0.5 size-10 rounded-[5px] p-0"
                    >
                      {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                    <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                      <LockKeyhole size={15} /> El texto libre está desactivado después de 24 horas.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTemplateOpen(true)}
                      className="h-9 text-xs"
                    >
                      Elegir plantilla
                    </Button>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap justify-between gap-1 text-[10px] text-muted-foreground">
                  <span>
                    {preview
                      ? "Simulación local. No se envían mensajes reales."
                      : "Enter para enviar · Mayús + Enter para nueva línea"}
                  </span>
                  <span>{draft.length}/4096</span>
                </div>
                {notice && (
                  <p role="status" className="mt-2 text-xs leading-5 text-emerald-700">
                    {notice}
                  </p>
                )}
              </form>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-[24px] bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <MessagesSquare size={32} strokeWidth={1.5} />
              </div>
              <h2 className="mt-6 text-2xl font-medium">Cada conversación, más cerca</h2>
              <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
                {busy
                  ? "Estamos preparando tu bandeja…"
                  : connected
                    ? "Cuando un cliente escriba a tu número conectado, podrás ver su mensaje y responder desde aquí."
                    : "Conecta el WhatsApp de tu negocio para recibir las conversaciones en este espacio."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(true);
                    setSelectedId("preview-ana");
                    setBusy(false);
                    setError("");
                  }}
                  className="h-10 px-4"
                >
                  <Sparkles /> Explorar un ejemplo
                </Button>
                {!preview && (
                  <Button asChild className="h-10 px-4">
                    <Link href="/dashboard/whatsapp">
                      Configurar número <ArrowUpRight />
                    </Link>
                  </Button>
                )}
              </div>
              <p className="mt-8 max-w-xs text-xs leading-6 text-muted-foreground">
                Se mostrarán los mensajes recibidos desde que se active esta bandeja. El historial
                anterior no se importa automáticamente.
              </p>
            </div>
          )}
        </section>
        <aside
          aria-label="Información del cliente"
          className="hidden min-h-0 overflow-y-auto border-l border-border bg-card xl:block"
        >
          {detailContent || (
            <div className="p-6 text-center">
              <UserRound size={24} className="mx-auto text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                Selecciona una conversación para ver los datos de su reserva.
              </p>
            </div>
          )}
        </aside>
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto p-0 sm:max-w-sm">
          <div className="px-5 pt-5">
            <DialogTitle>Información del cliente</DialogTitle>
            <DialogDescription>Su próxima reserva y ventana de atención.</DialogDescription>
          </div>
          {detailContent}
        </DialogContent>
      </Dialog>
      <Dialog
        open={templateOpen}
        onOpenChange={(open) => {
          setTemplateOpen(open);
          setTemplateError("");
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Plantillas de WhatsApp</DialogTitle>
            <DialogDescription>
              Fuera de las 24 horas necesitas una plantilla aprobada para la cuenta de tu negocio.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setTemplateIndex(i)}
                aria-pressed={templateIndex === i}
                className={cn(
                  "rounded-xl border p-3 text-left",
                  templateIndex === i ? "border-emerald-300 bg-emerald-50" : "border-border",
                )}
              >
                <p className="text-sm font-medium">{t.title}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{t.description}</p>
                <p className="mt-2 text-[10px] font-medium text-emerald-700">
                  {preview
                    ? "Ejemplo de plantilla"
                    : approved[i]
                      ? "Aprobada"
                      : "Pendiente de aprobación"}
                </p>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-[15px] leading-7">
              Hola {selected?.name.split(" ")[0] || "[nombre]"},{" "}
              {templateIndex === 0 ? "tu cita quedó agendada" : "te recordamos tu cita"} para{" "}
              {selected?.appointment
                ? appointmentDate(selected.appointment.startsAt, timezone)
                : "[fecha y hora]"}
              . Puedes confirmar, solicitar un cambio o cancelar con los botones.
            </p>
            <div className="mt-4 grid grid-cols-3 border-t border-emerald-200 pt-3 text-center text-xs text-emerald-800">
              <span>Confirmar</span>
              <span>Cambiar cita</span>
              <span>Cancelar</span>
            </div>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {preview
              ? "Esta es una vista previa. Los botones no envían mensajes ni modifican reservas."
              : !approved[templateIndex]
                ? "Esta plantilla todavía no está aprobada. Revisa su estado en la configuración de WhatsApp."
                : !selected?.appointment?.reservationId
                  ? "Este contacto necesita una próxima reserva para utilizar las plantillas de citas. Créala en tu calendario con autorización del cliente."
                  : "Se utilizarán el nombre, fecha y hora de la reserva. El servidor comprobará consentimiento, cuota y aprobación antes de enviar. Este envío cuenta como un mensaje automático."}
          </p>
          {templateError && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {templateError}
            </p>
          )}
          {!preview && (
            <Button
              disabled={
                sending ||
                !connected ||
                !approved[templateIndex] ||
                !selected?.appointment?.reservationId
              }
              onClick={() => void sendTemplate()}
              className="h-10"
            >
              {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
              {approved[templateIndex] ? "Enviar plantilla" : "Esperando aprobación de Meta"}
            </Button>
          )}
          <Button asChild variant="outline" className="mt-1 h-10">
            <Link href="/dashboard/whatsapp">
              {preview ? "Ver configuración de WhatsApp" : "Gestionar plantillas y automatización"}
              <ArrowUpRight />
            </Link>
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
