"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { ArrowUpRight, CalendarDays, LoaderCircle, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import type { ActionResult, Booking, Company, Customer } from "@/lib/types";

export function CustomersWorkspace({
  company,
  customers,
  bookings,
  onSave,
}: {
  company: Company;
  customers: Customer[];
  bookings: Booking[];
  onSave: (data: FormData) => Promise<ActionResult>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Customer | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const filtered = customers.filter((customer) =>
    `${customer.full_name} ${customer.phone}`
      .toLocaleLowerCase("es")
      .includes(query.toLocaleLowerCase("es")),
  );
  const visits = (customerId: string) =>
    bookings
      .filter((booking) => booking.customer_id === customerId)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const formatDate = (date: string) =>
    DateTime.fromISO(date).setZone(company.timezone).setLocale("es").toFormat("d LLL yyyy, HH:mm");
  const labels = { confirmed: "Confirmada", completed: "Completada", cancelled: "Cancelada" };

  return (
    <>
      <div className="mb-8 flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">PERSONAS, NO SOLO RESERVAS</p>
          <h1 className="mt-2 text-[32px] font-medium tracking-tight">Tu directorio de clientes</h1>
          <p className="mt-2 text-base text-slate-500">
            Cada visita cuenta una historia. Encuéntrala aquí.
          </p>
        </div>
        <Button
          className="h-10 px-4"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          <Plus size={16} />
          Nuevo cliente
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-medium">Todos los clientes</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
              {customers.length}
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-2.5 left-3 text-slate-400" size={15} />
            <Input
              aria-label="Buscar clientes"
              placeholder="Buscar por nombre o WhatsApp…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 border-slate-200 pl-9 text-xs"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[620px] text-left text-sm">
            <TableCaption className="sr-only">
              Directorio de clientes e historial de reservas
            </TableCaption>
            <TableHeader>
              <TableRow className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-medium text-slate-400">
                <TableHead className="px-6 py-3 font-medium">Cliente</TableHead>
                <TableHead className="px-6 py-3 font-medium">WhatsApp</TableHead>
                <TableHead className="px-6 py-3 font-medium">Reservas</TableHead>
                <TableHead className="px-6 py-3 font-medium">Última cita registrada</TableHead>
                <TableHead className="px-4 py-3">
                  <span className="sr-only">Historial</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((customer, index) => {
                const customerVisits = visits(customer.id);
                return (
                  <TableRow
                    key={customer.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <TableCell className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex size-9 items-center justify-center rounded-full text-[11px] font-medium ${["bg-emerald-50 text-emerald-700", "bg-emerald-50 text-emerald-700", "bg-violet-50 text-violet-700"][index % 3]}`}
                        >
                          {customer.full_name
                            .split(" ")
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        <span className="font-medium text-slate-700">{customer.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-sm text-slate-500">
                      {customer.phone}
                    </TableCell>
                    <TableCell className="px-6 py-5 text-sm text-slate-500">
                      {customerVisits.length} citas
                    </TableCell>
                    <TableCell className="px-6 py-5 text-sm text-slate-500">
                      {customerVisits[0]
                        ? formatDate(customerVisits[0].starts_at)
                        : "Sin reservas todavía"}
                    </TableCell>
                    <TableCell className="px-4 py-5">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Ver historial de ${customer.full_name}`}
                        onClick={() => setHistory(customer)}
                      >
                        <ArrowUpRight size={16} className="text-slate-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center px-6 py-20 text-center">
            <Users size={30} className="text-slate-300" />
            <h3 className="mt-4 text-sm font-medium">
              {query ? "No encontramos coincidencias" : "Tu próximo cliente empieza aquí"}
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              {query
                ? "Prueba con otro nombre o número."
                : "Añade un cliente o crea tu primera reserva."}
            </p>
          </div>
        )}
        <div className="border-t border-slate-100 px-6 py-4 text-[11px] text-slate-400">
          {filtered.length} de {customers.length} clientes en tu espacio de trabajo
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conoce a tu próximo cliente</DialogTitle>
            <DialogDescription>
              Guarda sus datos para encontrarlos en tu próxima reserva.
            </DialogDescription>
          </DialogHeader>
          <form
            className="mt-3 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              setError("");
              startTransition(async () => {
                try {
                  const result = await onSave(formData);
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  toast.success(result.success);
                  setOpen(false);
                } catch {
                  setError("No se pudo guardar el cliente. Inténtalo de nuevo.");
                }
              });
            }}
          >
            <div className="space-y-2">
              <label htmlFor="customer-name" className="field-label">
                Nombre completo
              </label>
              <Input
                id="customer-name"
                name="full_name"
                minLength={2}
                maxLength={100}
                required
                placeholder="Ej. Ana García"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="customer-phone" className="field-label">
                WhatsApp
              </label>
              <Input
                id="customer-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                pattern="\+[1-9][0-9]{6,14}"
                required
                placeholder="+584121234567"
              />
              <p className="text-sm text-slate-400">
                Incluye + y el código del país, sin espacios.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-base text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button disabled={pending} type="submit">
                {pending && <LoaderCircle size={15} className="animate-spin" />}Guardar cliente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(history)}
        onOpenChange={(value) => {
          if (!value) setHistory(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{history?.full_name}</DialogTitle>
            <DialogDescription>Historial de reservas · {history?.phone}</DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-3">
            {history &&
              visits(history.id).map((booking) => (
                <div key={booking.id} className="flex gap-3 rounded-xl border border-slate-100 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <CalendarDays size={17} />
                  </span>
                  <div>
                    <p className="text-base font-medium">{booking.service}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(booking.starts_at)}</p>
                    <p className="mt-2 text-xs text-slate-400">{labels[booking.status]}</p>
                  </div>
                </div>
              ))}
            {history && visits(history.id).length === 0 && (
              <p className="py-10 text-center text-base text-slate-400">
                Todavía no hay reservas para este cliente.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
