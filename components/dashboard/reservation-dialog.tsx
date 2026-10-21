"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Clock3, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult, Customer } from "@/lib/types";

export function ReservationDialog({
  open,
  onOpenChange,
  initialStart,
  timezone,
  customers,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStart: string;
  timezone: string;
  customers: Customer[];
  onSave: (data: FormData) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedPhone, setSelectedPhone] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setError("");
        setSelectedPhone("");
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Una nueva reserva</DialogTitle>
          <DialogDescription>Un espacio en tu agenda para alguien importante.</DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setError("");
            const startsAt = DateTime.fromISO(String(formData.get("date")), { zone: timezone });
            if (!startsAt.isValid || startsAt.toMillis() <= Date.now()) {
              setError("Elige una fecha y hora futuras.");
              return;
            }
            formData.set("starts_at", startsAt.toISO()!);
            startTransition(async () => {
              try {
                const result = await onSave(formData);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                toast.success(result.success || "Reserva guardada con éxito.");
                onOpenChange(false);
                setSelectedPhone("");
              } catch {
                setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
              }
            });
          }}
        >
          <div className="space-y-2">
            <label className="field-label" htmlFor="booking-name">
              Nombre del cliente
            </label>
            <Input
              id="booking-name"
              name="full_name"
              list="customer-options"
              placeholder="Ej. Ana García"
              required
              minLength={2}
              maxLength={100}
              onChange={(event) => {
                const match = customers.find(
                  (customer) => customer.full_name === event.target.value,
                );
                if (match) setSelectedPhone(match.phone);
              }}
            />
            <datalist id="customer-options">
              {customers.map((customer) => (
                <option key={customer.id} value={customer.full_name}>
                  {customer.phone}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <label className="field-label" htmlFor="booking-phone">
              WhatsApp
            </label>
            <Input
              id="booking-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+584121234567"
              pattern="\+[1-9][0-9]{6,14}"
              required
              value={selectedPhone}
              onChange={(event) => setSelectedPhone(event.target.value.replace(/[\s()-]/g, ""))}
            />
            <p className="text-xs text-slate-400">Incluye + y el código del país.</p>
          </div>
          <div className="space-y-2">
            <label className="field-label" htmlFor="booking-service">
              Servicio o motivo
            </label>
            <Input
              id="booking-service"
              name="service"
              placeholder="Ej. Consulta inicial"
              required
              minLength={2}
              maxLength={160}
            />
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-4">
            <div className="space-y-2">
              <label className="field-label" htmlFor="booking-date">
                Fecha y hora
              </label>
              <Input
                id="booking-date"
                name="date"
                type="datetime-local"
                required
                defaultValue={initialStart}
              />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="booking-duration">
                Duración
              </label>
              <select
                id="booking-duration"
                name="duration"
                defaultValue="60"
                className="native-select"
              >
                {[15, 30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <Clock3 size={14} />
            Hora del negocio: {timezone}
          </p>
          {error && (
            <p role="alert" className="text-base text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle size={15} className="animate-spin" />}Guardar reserva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
