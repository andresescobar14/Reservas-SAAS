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
  const { error } = await supabase.rpc("book_reservation_with_whatsapp", {
    p_company_id: company.id,
    p_full_name: full_name,
    p_phone: phone,
    p_service: service,
    p_starts_at: starts_at,
    p_ends_at: new Date(new Date(starts_at).getTime() + duration * 60_000).toISOString(),
    p_whatsapp_consent: formData.get("whatsapp_consent") === "on",
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

export async function rescheduleReservation(
  id: string,
  startsAt: string,
  duration: number,
): Promise<ActionResult> {
  const { supabase, company } = await requireActiveCompany();
  if (
    !z.uuid().safeParse(id).success ||
    !z.iso.datetime({ offset: true }).safeParse(startsAt).success ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 480 ||
    Date.parse(startsAt) <= Date.now()
  )
    return { error: "Elige una fecha futura y una duración válida." };
  const { data, error } = await supabase.rpc("reschedule_reservation", {
    p_company_id: company.id,
    p_reservation_id: id,
    p_starts_at: startsAt,
    p_ends_at: new Date(Date.parse(startsAt) + duration * 60000).toISOString(),
  });
  if (error || !data)
    return {
      error:
        "No se pudo cambiar la reserva. Si proviene de Cal.com, reprograma allí para mantener ambas agendas sincronizadas.",
    };
  revalidatePath("/dashboard", "layout");
  return { success: "Reserva reprogramada. Se actualizaron los mensajes pendientes." };
}
