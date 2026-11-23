export const ownerBookingPath = "/reservar/reservas-codesc";

export type PublicBookingPage = {
  slug: string;
  businessName: string;
  service: string;
  durationMinutes: number;
  timezone: string;
  noticeMinutes: number;
  dates: string[];
  selectedDate: string | null;
  slots: { startsAt: string; endsAt: string }[];
  challenge: string;
};

export type PublicBookingReceipt = {
  reservationId: string;
  startsAt: string;
  endsAt: string;
  service: string;
  timezone: string;
  businessName: string;
  whatsappConsent: boolean;
  confirmationScheduled: boolean;
  reminderAt: string | null;
};

export const bookingServiceUnavailable =
  "La agenda no está disponible en este momento. Inténtalo de nuevo en unos minutos.";

/**
 * Lee la respuesta del servicio de reservas. Solo se muestran los mensajes que
 * envía nuestro backend (siempre incluyen un código en `error`). Las respuestas
 * de la plataforma de hosting, como "Application not found" cuando el servicio
 * no está desplegado, se sustituyen por un mensaje claro para el cliente.
 */
export async function readBookingResponse(
  response: Response,
  fallback: string,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; code: string; message: string }
> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (response.ok && body) return { ok: true, data: body };
  const fromBackend = body && typeof body.error === "string" && typeof body.message === "string";
  if (fromBackend)
    return { ok: false, code: body.error as string, message: body.message as string };
  return {
    ok: false,
    code: "SERVICE_UNAVAILABLE",
    message: response.ok || response.status >= 404 ? bookingServiceUnavailable : fallback,
  };
}
