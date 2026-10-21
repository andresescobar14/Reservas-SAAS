"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { CalendarDays, Check, Clock3, MessageCircle, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReservationDialog } from "@/components/dashboard/reservation-dialog";
import type { ActionResult, Booking, Company, Customer } from "@/lib/types";

const CalendarView = dynamic(() => import("@/components/dashboard/calendar-view"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-[700px] items-center justify-center rounded-xl border bg-white text-sm text-slate-400"
    >
      Preparando tu agenda…
    </div>
  ),
});
const statusLabels = { confirmed: "Confirmada", completed: "Completada", cancelled: "Cancelada" };

export function CalendarWorkspace({
  company,
  customers,
  bookings,
  initialDate,
  onSave,
  onStatusChange,
}: {
  company: Company;
  customers: Customer[];
  bookings: Booking[];
  initialDate: string;
  onSave: (data: FormData) => Promise<ActionResult>;
  onStatusChange: (id: string, status: "completed" | "cancelled") => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [pending, startTransition] = useTransition();
  const today = DateTime.fromISO(initialDate, { zone: company.timezone });
  const dayBookings = bookings.filter(
    (booking) =>
      booking.status !== "cancelled" &&
      DateTime.fromISO(booking.starts_at).setZone(company.timezone).hasSame(today, "day"),
  );
  const weekBookings = bookings.filter(
    (booking) =>
      booking.status !== "cancelled" &&
      DateTime.fromISO(booking.starts_at).setZone(company.timezone).hasSame(today, "week"),
  );
  const newReservation = (date?: string) => {
    setStart(
      date ||
        DateTime.now()
          .setZone(company.timezone)
          .plus({ hours: 1 })
          .startOf("hour")
          .toFormat("yyyy-MM-dd'T'HH:mm"),
    );
    setOpen(true);
  };

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm capitalize text-slate-400">
            {today.setLocale("es").toFormat("cccc, d 'de' LLLL")}
          </p>
          <h1 className="text-[32px] font-medium tracking-tight">Un buen día empieza con orden.</h1>
          <p className="mt-2 text-base text-slate-500">
            Aquí tienes el espacio para todo lo que viene.
          </p>
        </div>
        <Button onClick={() => newReservation()} className="h-10 gap-2 px-4">
          <Plus size={17} />
          Nueva reserva
        </Button>
      </div>
      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Reservas de hoy",
            value: dayBookings.length,
            icon: CalendarDays,
            detail: "Tu día, de un vistazo",
            color: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Esta semana",
            value: weekBookings.length,
            icon: Clock3,
            detail: "Citas en tu agenda",
            color: "bg-emerald-50 text-primary",
          },
          {
            label: "Tus clientes",
            value: customers.length,
            icon: Users,
            detail: "Personas que confían en ti",
            color: "bg-emerald-50 text-primary",
          },
        ].map(({ icon: Icon, ...stat }) => (
          <Card key={stat.label} className="gap-0 border-slate-200/80 p-5 shadow-none">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <span className={`flex size-8 items-center justify-center rounded-lg ${stat.color}`}>
                <Icon size={16} />
              </span>
            </div>
            <p className="mt-2 text-3xl font-medium tracking-tight">
              {stat.value.toString().padStart(2, "0")}
            </p>
            <p className="mt-2 text-xs text-slate-400">{stat.detail}</p>
          </Card>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium text-slate-700">Tu agenda</h2>
        <p className="text-xs text-slate-400">Zona horaria: {company.timezone}</p>
      </div>
      <CalendarView
        bookings={bookings}
        timezone={company.timezone}
        initialDate={initialDate}
        onDateClick={newReservation}
        onBookingClick={setSelected}
      />
      {bookings.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-400">
          Tu agenda está lista. Crea tu primera reserva para comenzar.
        </p>
      )}
      <ReservationDialog
        open={open}
        onOpenChange={setOpen}
        initialStart={start}
        timezone={company.timezone}
        customers={customers}
        onSave={onSave}
      />
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de la reserva</DialogTitle>
            <DialogDescription>Consulta la cita y actualiza su estado.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="mt-3 rounded-xl bg-slate-50 p-5">
                <p className="text-lg font-medium">{selected.customer.full_name}</p>
                <p className="mt-1 text-base text-slate-500">{selected.service}</p>
                <p className="mt-4 text-base font-medium text-emerald-800">
                  {DateTime.fromISO(selected.starts_at)
                    .setZone(company.timezone)
                    .setLocale("es")
                    .toFormat("dd LLL yyyy · HH:mm")}{" "}
                  – {DateTime.fromISO(selected.ends_at).setZone(company.timezone).toFormat("HH:mm")}
                </p>
                <p className="mt-2 text-sm text-slate-400">{company.timezone}</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500">
                  <MessageCircle size={16} />
                  {selected.customer.phone}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {statusLabels[selected.status]}
                </span>
              </div>
              <p className="text-sm leading-5 text-slate-400">
                {selected.reminder_sent_at
                  ? "Recordatorio enviado."
                  : "No se ha enviado un recordatorio. Requiere WhatsApp conectado y el servicio de envíos activo."}
              </p>
              {selected.status === "confirmed" && (
                <div className="flex justify-end gap-2 border-t pt-5">
                  {(["cancelled", "completed"] as const).map((status) => (
                    <Button
                      key={status}
                      disabled={pending}
                      variant={status === "completed" ? "default" : "outline"}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const result = await onStatusChange(selected.id, status);
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success(result.success);
                            setSelected(null);
                          } catch {
                            toast.error("No se pudo actualizar la reserva.");
                          }
                        })
                      }
                    >
                      {status === "completed" && <Check size={14} />}
                      {status === "completed" ? "Completar cita" : "Cancelar cita"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
