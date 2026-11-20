"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { DateTime } from "luxon";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock3,
  Globe2,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import type { PublicBookingPage, PublicBookingReceipt } from "@/lib/public-booking";

function formatDate(value: string, timezone: string) {
  return DateTime.fromISO(value)
    .setZone(timezone)
    .setLocale("es")
    .toFormat("cccc d 'de' LLLL, HH:mm");
}

export function PublicBookingForm({
  slug,
  apiUrl,
  initialPage,
  initialError,
}: {
  slug: string;
  apiUrl: string;
  initialPage: PublicBookingPage | null;
  initialError: string;
}) {
  const [page, setPage] = useState<PublicBookingPage | null>(initialPage);
  const [date, setDate] = useState(initialPage?.selectedDate || "");
  const [time, setTime] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(initialError);
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(null);
  const website = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const chosen =
    page?.selectedDate === date
      ? page.slots.find(
          (slot) =>
            DateTime.fromISO(slot.startsAt).setZone(page.timezone).toFormat("HH:mm") === time,
        )
      : undefined;

  const load = useCallback(
    async (selectedDate?: string, signal?: AbortSignal) => {
      const sequence = ++loadSequence.current;
      setBusy(true);
      setError("");
      try {
        if (!apiUrl)
          throw new Error("Esta agenda todavía no está disponible. Inténtalo más tarde.");
        const response = await fetch(
          `${apiUrl}/api/public-booking/${encodeURIComponent(slug)}${selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : ""}`,
          {
            cache: "no-store",
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
              : AbortSignal.timeout(20000),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "No pudimos consultar los horarios.");
        if (signal?.aborted || sequence !== loadSequence.current) return;
        const result = data as PublicBookingPage;
        setPage(result);
        setDate(result.selectedDate || "");
        setTime("");
      } catch (e) {
        if (!signal?.aborted && sequence === loadSequence.current)
          setError(e instanceof Error ? e.message : "No pudimos consultar la agenda.");
      } finally {
        if (!signal?.aborted && sequence === loadSequence.current) setBusy(false);
      }
    },
    [apiUrl, slug],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page || !chosen || sending || busy) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/public-booking/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.replace(/[\s()-]/g, ""),
          startsAt: chosen.startsAt,
          whatsappConsent: consent,
          challenge: page.challenge,
          website: website.current?.value || "",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.error === "SLOT_UNAVAILABLE") {
          await load(date);
        }
        throw new Error(data.message || "No pudimos guardar tu reserva. Inténtalo de nuevo.");
      }
      setReceipt(data.receipt);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "No pudimos confirmar el resultado. Reintenta sin cambiar los datos; conservamos tu solicitud para evitar duplicados.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Brand />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex"
          >
            <ArrowLeft size={15} /> Volver al inicio
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pt-6 pb-16 sm:px-8 sm:pt-12">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Una cita, toda la experiencia
        </div>
        {receipt ? (
          <section
            className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-7 sm:p-10"
            aria-labelledby="booking-confirmed"
          >
            <span className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-primary">
              <CalendarCheck2 size={32} />
            </span>
            <p className="text-xs font-medium tracking-widest text-primary">RESERVA GUARDADA</p>
            <h1
              id="booking-confirmed"
              className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl"
            >
              Tu próxima cita ya tiene lugar.
            </h1>
            <dl className="mt-7 space-y-4 rounded-2xl border border-border bg-background p-5 text-sm">
              <div>
                <dt className="text-muted-foreground">Servicio</dt>
                <dd className="mt-1 font-medium">{receipt.service}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha y hora</dt>
                <dd className="mt-1 font-medium capitalize">
                  {formatDate(receipt.startsAt, receipt.timezone)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Negocio</dt>
                <dd className="mt-1 font-medium">{receipt.businessName}</dd>
              </div>
            </dl>
            <div className="mt-5 rounded-2xl bg-emerald-500/10 p-5 text-sm leading-6">
              <MessageCircle size={20} className="mb-2 text-primary" />
              {!receipt.whatsappConsent
                ? "Tu reserva está guardada. Elegiste no recibir mensajes por WhatsApp."
                : receipt.confirmationScheduled
                  ? "La confirmación de WhatsApp quedó programada. La entrega depende de que tu número pueda recibir mensajes y del servicio de WhatsApp."
                  : "Tu reserva está guardada, pero los mensajes de WhatsApp no quedaron programados. Contacta con el negocio para confirmarlo."}
              {receipt.reminderAt && (
                <p className="mt-2">
                  Recordatorio previsto: {formatDate(receipt.reminderAt, receipt.timezone)}. Los
                  recordatorios se envían entre las 8:00 y las 20:00, hora del negocio; se aplazan o
                  se omiten si llegarían tarde.
                </p>
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Hora del negocio: {receipt.timezone}. Para cambiar o cancelar, usa los botones del
              mensaje de WhatsApp o contacta con el negocio.
            </p>
            <Button asChild className="mt-7 h-11 px-5">
              <Link href="/">
                Volver al inicio <ArrowRight size={16} />
              </Link>
            </Button>
          </section>
        ) : (
          <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <aside className="lg:sticky lg:top-10">
              <p className="text-xs font-medium tracking-[0.18em] text-primary">
                {page?.businessName || "RESERVAS - CODESC"}
              </p>
              <h1 className="mt-4 max-w-lg text-4xl leading-[1.12] font-medium tracking-[-0.035em] sm:text-5xl">
                Reserva una cita.
                <br />
                <span className="text-primary">Pruébalo de verdad.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
                Conoce la experiencia que podrán tener los clientes de tu negocio. Elige tu horario
                y agenda una demostración con nosotros.
              </p>
              <div className="mt-8 space-y-5 text-sm">
                <div className="flex gap-3">
                  <Clock3 className="mt-0.5 shrink-0 text-primary" size={19} />
                  <div>
                    <p className="font-medium">
                      {page?.durationMinutes || 30} minutos para conocer Reservas
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Elige cualquier día y hora futura disponibles.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MessageCircle className="mt-0.5 shrink-0 text-primary" size={19} />
                  <div>
                    <p className="font-medium">Vive la experiencia de WhatsApp</p>
                    <p className="mt-1 leading-6 text-muted-foreground">
                      Si lo autorizas, recibirás una confirmación y un recordatorio desde nuestro
                      número terminado en 4553.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={19} />
                  <div>
                    <p className="font-medium">Sin crear una cuenta</p>
                    <p className="mt-1 text-muted-foreground">
                      Solo necesitamos tu nombre y teléfono.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <Globe2 size={15} /> {page?.timezone || "America/Caracas"}
              </p>
            </aside>
            <section
              className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-emerald-950/5 sm:p-8"
              aria-labelledby="booking-form-title"
            >
              <div className="mb-7 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-widest text-muted-foreground">
                    TU PRÓXIMO PASO
                  </p>
                  <h2 id="booking-form-title" className="mt-2 text-xl font-medium">
                    {page?.service || "Demostración de Reservas"}
                  </h2>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-primary">
                  <CalendarDays size={22} />
                </span>
              </div>
              {busy && !page ? (
                <p
                  role="status"
                  className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
                >
                  <LoaderCircle size={17} className="animate-spin" /> Consultando la agenda…
                </p>
              ) : page ? (
                <form onSubmit={(event) => void submit(event)} className="space-y-6">
                  <fieldset disabled={sending} className="space-y-6 disabled:opacity-70">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="booking-date" className="mb-2 block text-sm font-medium">
                          Día
                        </label>
                        <Input
                          id="booking-date"
                          type="date"
                          required
                          value={date}
                          min={page.dates[0]}
                          max={page.dates.at(-1)}
                          disabled={busy}
                          onChange={(e) => {
                            setDate(e.target.value);
                            setTime("");
                            if (e.target.value) void load(e.target.value);
                          }}
                          className="h-12"
                        />
                      </div>
                      <div>
                        <label htmlFor="booking-time" className="mb-2 block text-sm font-medium">
                          Hora del negocio
                        </label>
                        <Input
                          id="booking-time"
                          type="time"
                          required
                          value={time}
                          disabled={busy}
                          step={60}
                          onChange={(e) => setTime(e.target.value)}
                          className="h-12"
                        />
                      </div>
                    </div>
                    <div
                      aria-live="polite"
                      className="-mt-2 text-xs leading-5 text-muted-foreground"
                    >
                      {busy ? (
                        "Actualizando disponibilidad…"
                      ) : time ? (
                        chosen ? (
                          <span className="inline-flex items-center gap-1.5 text-primary">
                            <Check size={14} /> Horario disponible · termina a las{" "}
                            {DateTime.fromISO(chosen.endsAt)
                              .setZone(page.timezone)
                              .toFormat("HH:mm")}
                          </span>
                        ) : (
                          "Ese horario no está disponible o está demasiado cerca. Elige otra hora."
                        )
                      ) : (
                        "Escribe la hora que prefieras. La disponibilidad se comprueba al guardar."
                      )}
                    </div>
                    {!busy && page.slots.length > 0 && !time && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mr-1 text-xs text-muted-foreground">Puedes probar:</span>
                        {[page.slots[0], page.slots[Math.min(29, page.slots.length - 1)]]
                          .filter(
                            (slot, index, all) =>
                              all.findIndex((s) => s.startsAt === slot.startsAt) === index,
                          )
                          .map((slot) => {
                            const label = DateTime.fromISO(slot.startsAt)
                              .setZone(page.timezone)
                              .toFormat("HH:mm");
                            return (
                              <button
                                key={slot.startsAt}
                                type="button"
                                onClick={() => setTime(label)}
                                className="rounded-lg border border-border px-3 py-2 text-xs hover:border-emerald-500 hover:text-primary"
                              >
                                {label}
                              </button>
                            );
                          })}
                      </div>
                    )}
                    <div className="border-t border-border pt-6">
                      <label htmlFor="booking-name" className="mb-2 block text-sm font-medium">
                        Tu nombre
                      </label>
                      <Input
                        id="booking-name"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={100}
                        placeholder="¿Cómo te llamas?"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="h-12"
                      />
                    </div>
                    <div>
                      <label htmlFor="booking-phone" className="mb-2 block text-sm font-medium">
                        Tu WhatsApp
                      </label>
                      <Input
                        id="booking-phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        placeholder="+58 412 1234567"
                        maxLength={25}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-12"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Incluye el código del país. También puedes usar números de otros países.
                      </p>
                    </div>
                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="booking-website">Sitio web</label>
                      <input
                        id="booking-website"
                        name="website"
                        ref={website}
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-emerald-600"
                      />
                      <span>
                        Acepto recibir de {page.businessName} una confirmación y un recordatorio de
                        esta reserva por WhatsApp. Podré confirmar, solicitar un cambio o cancelar
                        desde el mensaje.
                      </span>
                    </label>
                    {consent && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        La confirmación se programa al reservar. Para citas cercanas, el
                        recordatorio se programa a mitad del tiempo disponible; si faltan menos de
                        10 minutos, se omite. Los recordatorios se envían entre las 8:00 y las
                        20:00.
                      </p>
                    )}
                    <p className="text-xs leading-5 text-muted-foreground">
                      Usaremos estos datos para gestionar tu cita. Consulta nuestra{" "}
                      <Link
                        href="/privacidad"
                        target="_blank"
                        className="text-primary underline underline-offset-2"
                      >
                        política de privacidad
                      </Link>
                      .
                    </p>
                    <Button
                      type="submit"
                      disabled={busy || !chosen || !fullName.trim() || !phone.trim()}
                      className="h-13 w-full gap-2 bg-emerald-600 text-base text-white hover:bg-emerald-700"
                    >
                      {sending ? (
                        <LoaderCircle className="animate-spin" size={18} />
                      ) : (
                        <CalendarCheck2 size={18} />
                      )}
                      {sending ? "Guardando tu reserva…" : "Confirmar mi cita"}
                    </Button>
                  </fieldset>
                  <p className="text-center text-xs text-muted-foreground">
                    Sin cobros ni tarjeta de crédito.
                  </p>
                </form>
              ) : null}
              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm leading-6 text-red-600"
                >
                  {error}
                  <button
                    type="button"
                    disabled={sending || busy}
                    onClick={() => void load(date || undefined)}
                    className="mt-3 flex items-center gap-1.5 font-medium underline underline-offset-2"
                  >
                    <RefreshCw size={13} /> Actualizar horarios
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        Reservas - Codesc · Tu agenda, más cerca de cada cliente.
      </footer>
    </div>
  );
}
