import type { Metadata } from "next";
import { PublicBookingForm } from "@/components/public-booking-form";
import {
  bookingServiceUnavailable,
  readBookingResponse,
  type PublicBookingPage,
} from "@/lib/public-booking";

export const metadata: Metadata = {
  title: "Reservar cita",
  description: "Elige tu horario y reserva una demostración de Reservas - Codesc.",
  robots: { index: false, follow: true },
};

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apiUrl = process.env.WHATSAPP_CLOUD_API_URL?.replace(/\/$/, "") || "";
  let initialPage: PublicBookingPage | null = null;
  let initialError = "";
  try {
    if (!apiUrl) throw new Error("Esta agenda todavía no está disponible.");
    const response = await fetch(`${apiUrl}/api/public-booking/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const parsed = await readBookingResponse(response, "No pudimos consultar los horarios.");
    if (!parsed.ok) throw new Error(parsed.message);
    initialPage = parsed.data as unknown as PublicBookingPage;
  } catch (error) {
    initialError =
      error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError"
        ? error.message
        : bookingServiceUnavailable;
  }
  return (
    <PublicBookingForm
      slug={slug}
      apiUrl={apiUrl}
      initialPage={initialPage}
      initialError={initialError}
    />
  );
}
