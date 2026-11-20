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
