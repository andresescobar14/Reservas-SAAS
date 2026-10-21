"use client";

import { useState } from "react";
import { DashboardShell, type DashboardView } from "@/components/dashboard/shell";
import { CalendarWorkspace } from "@/components/dashboard/calendar-workspace";
import { CustomersWorkspace } from "@/components/dashboard/customers-workspace";
import {
  WhatsAppWorkspace,
  IntegrationsWorkspace,
} from "@/components/dashboard/integrations-workspace";
import type { ActionResult, Booking, Company, Customer } from "@/lib/types";
import { AccountWorkspace } from "@/components/dashboard/account-workspace";

export function DemoWorkspace({
  company,
  customers: initialCustomers,
  bookings: initialBookings,
  initialDate,
}: {
  company: Company;
  customers: Customer[];
  bookings: Booking[];
  initialDate: string;
}) {
  const [view, setView] = useState<DashboardView>("calendario");
  const [customers, setCustomers] = useState(initialCustomers);
  const [bookings, setBookings] = useState(initialBookings);

  function makeCustomer(data: FormData): Customer {
    return {
      id: crypto.randomUUID(),
      company_id: company.id,
      full_name: String(data.get("full_name")).trim(),
      phone: String(data.get("phone")),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async function saveCustomer(data: FormData): Promise<ActionResult> {
    if (customers.some((customer) => customer.phone === data.get("phone")))
      return { error: "Ya existe un cliente con ese WhatsApp." };
    setCustomers((previous) => [...previous, makeCustomer(data)]);
    return { success: "Cliente añadido a la demo." };
  }

  async function saveReservation(data: FormData): Promise<ActionResult> {
    const existing = customers.find((customer) => customer.phone === data.get("phone"));
    const customer = existing
      ? { ...existing, full_name: String(data.get("full_name")).trim() }
      : makeCustomer(data);
    const start = new Date(String(data.get("starts_at")));
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now())
      return { error: "Elige una fecha y hora futuras." };
    const booking: Booking = {
      id: crypto.randomUUID(),
      company_id: company.id,
      customer_id: customer.id,
      customer,
      service: String(data.get("service")).trim(),
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + Number(data.get("duration")) * 60_000).toISOString(),
      status: "confirmed",
      reminder_due_at: new Date(start.getTime() - 86_400_000).toISOString(),
      reminder_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setCustomers((previous) =>
      existing
        ? previous.map((item) => (item.id === customer.id ? customer : item))
        : [...previous, customer],
    );
    setBookings((previous) => [
      ...previous.map((item) => (item.customer_id === customer.id ? { ...item, customer } : item)),
      booking,
    ]);
    return { success: "Reserva añadida a la demo." };
  }

  async function changeStatus(
    id: string,
    status: "completed" | "cancelled",
  ): Promise<ActionResult> {
    setBookings((previous) =>
      previous.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    return {
      success:
        status === "completed" ? "Cita completada en la demo." : "Cita cancelada en la demo.",
    };
  }

  return (
    <DashboardShell company={company} demo activeView={view} onNavigate={setView}>
      {view === "calendario" && (
        <CalendarWorkspace
          company={company}
          customers={customers}
          bookings={bookings}
          initialDate={initialDate}
          onSave={saveReservation}
          onStatusChange={changeStatus}
        />
      )}
      {view === "clientes" && (
        <CustomersWorkspace
          company={company}
          customers={customers}
          bookings={bookings}
          onSave={saveCustomer}
        />
      )}
      {view === "whatsapp" && <WhatsAppWorkspace />}
      {view === "integraciones" && <IntegrationsWorkspace />}
      {view === "cuenta" && (
        <AccountWorkspace
          companyName={company.name}
          email="demo@reserva.example"
          available={false}
          verifiedAt={null}
          demo
          onContinue={() => setView("calendario")}
          requestCodeAction={async () => ({ error: "La demo no envía correos." })}
          confirmCodeAction={async () => ({ error: "La demo no comprueba códigos." })}
        />
      )}
    </DashboardShell>
  );
}
