import { DateTime } from "luxon";
import type { Booking, Company, Customer } from "@/lib/types";

// Estos datos solo se usan en /demo. Nunca se consultan desde /dashboard.
export function createDemoData() {
  const now = DateTime.now().setZone("America/Caracas");
  const timestamp = now.toISO()!;
  const company: Company = {
    id: "demo-company",
    owner_id: "demo-owner",
    name: "Estudio Bienestar",
    timezone: "America/Caracas",
    subscription_status: "trial",
    trial_ends_at: now.plus({ days: 14 }).toISO()!,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const customers: Customer[] = [
    "Ana García",
    "Luis Pérez",
    "María Torres",
    "Carlos Ruiz",
    "Lucía Fernández",
    "Sofía Martínez",
  ].map((name, index) => ({
    id: `demo-customer-${index}`,
    company_id: company.id,
    full_name: name,
    phone: `+58412123450${index}`,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const services = [
    "Consulta inicial",
    "Sesión de bienestar",
    "Servicio personalizado",
    "Seguimiento",
    "Consulta inicial",
    "Sesión de bienestar",
  ];
  const bookings: Booking[] = [
    { day: 0, hour: 9, customer: 0 },
    { day: 0, hour: 11, customer: 1 },
    { day: 1, hour: 10, customer: 2 },
    { day: 2, hour: 9, customer: 3 },
    { day: 3, hour: 12, customer: 4 },
    { day: 4, hour: 10, customer: 5 },
    { day: 2, hour: 14, customer: 0 },
  ].map((item, index) => {
    const start = now.startOf("week").plus({ days: item.day, hours: item.hour });
    return {
      id: `demo-booking-${index}`,
      company_id: company.id,
      customer_id: customers[item.customer].id,
      customer: customers[item.customer],
      service: services[item.customer],
      starts_at: start.toISO()!,
      ends_at: start.plus({ hours: 1 }).toISO()!,
      status: start < now ? "completed" : "confirmed",
      reminder_due_at: start.minus({ hours: 24 }).toISO()!,
      reminder_sent_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
  });
  return { company, customers, bookings, initialDate: now.toISODate()! };
}
