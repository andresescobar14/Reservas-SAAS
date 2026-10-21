"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveCompany } from "@/lib/tenant";
import type { ActionResult } from "@/lib/types";

const customerSchema = z.object({
  full_name: z.string().trim().min(2, "Escribe el nombre del cliente.").max(100),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Usa formato internacional: +584121234567."),
});

const reservationSchema = customerSchema.extend({
  service: z.string().trim().min(2, "Indica el servicio o motivo.").max(160),
  starts_at: z.iso.datetime({ offset: true }),
  duration: z.coerce.number().int().min(15).max(480),
});

export async function saveCustomer(formData: FormData): Promise<ActionResult> {
  const { supabase, company } = await requireActiveCompany();
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase
    .from("customers")
    .insert({ company_id: company.id, ...parsed.data });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Ya existe un cliente con ese WhatsApp."
          : "No se pudo guardar el cliente.",
    };
  revalidatePath("/dashboard", "layout");
  return { success: "Cliente guardado con éxito." };
}

export async function saveReservation(formData: FormData): Promise<ActionResult> {
  const { supabase, company } = await requireActiveCompany();
  const parsed = reservationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { full_name, phone, service, starts_at, duration } = parsed.data;
  if (new Date(starts_at).getTime() <= Date.now())
    return { error: "Elige una fecha y hora futuras." };
  const { error } = await supabase.rpc("book_reservation", {
    p_company_id: company.id,
    p_full_name: full_name,
    p_phone: phone,
    p_service: service,
    p_starts_at: starts_at,
    p_ends_at: new Date(new Date(starts_at).getTime() + duration * 60_000).toISOString(),
  });
  if (error)
    return { error: "No se pudo guardar la reserva. Revisa tu conexión e inténtalo de nuevo." };
  revalidatePath("/dashboard", "layout");
  return { success: "Reserva guardada con éxito." };
}

export async function setReservationStatus(
  id: string,
  status: "completed" | "cancelled",
): Promise<ActionResult> {
  const { supabase, company } = await requireActiveCompany();
  if (!z.uuid().safeParse(id).success || !["completed", "cancelled"].includes(status))
    return { error: "Reserva no válida." };
  const { data, error } = await supabase
    .from("reservations")
    .update({ status })
    .eq("id", id)
    .eq("company_id", company.id)
    .eq("status", "confirmed")
    .select("id");
  if (error || !data?.length)
    return { error: "No se pudo actualizar la reserva. Puede que su estado ya haya cambiado." };
  revalidatePath("/dashboard", "layout");
  return {
    success: status === "completed" ? "Reserva marcada como completada." : "Reserva cancelada.",
  };
}
