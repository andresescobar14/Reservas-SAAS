import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { hasActiveSubscription } from "@/lib/subscription";
import type { Booking } from "@/lib/types";

export const requireCompany = cache(async () => {
  if (!isSupabaseConfigured()) redirect("/login?setup=required");
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("owner_id", user.id)
    .single();
  if (error || !company)
    throw new Error(
      "No se pudo cargar la empresa. Verifica que ejecutaste supabase-schema.sql antes del registro.",
    );
  return { supabase, company, user };
});

// Cada página y cada acción comprueba permisos; el layout por sí solo no basta.
export async function requireActiveCompany() {
  const context = await requireCompany();
  if (!hasActiveSubscription(context.company)) redirect("/suscripcion");
  return context;
}

export async function getWorkspaceData() {
  const { supabase, company } = await requireActiveCompany();
  const [customersResult, reservationsResult] = await Promise.all([
    supabase.from("customers").select("*").eq("company_id", company.id).order("full_name"),
    supabase.from("reservations").select("*").eq("company_id", company.id).order("starts_at"),
  ]);
  if (customersResult.error || reservationsResult.error)
    throw new Error("No pudimos cargar la agenda. Inténtalo de nuevo.");
  const customers = customersResult.data ?? [];
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const bookings: Booking[] = (reservationsResult.data ?? []).flatMap((reservation) => {
    const customer = customersById.get(reservation.customer_id);
    return customer ? [{ ...reservation, customer }] : [];
  });
  return { company, customers, bookings };
}
