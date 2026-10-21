import type { Metadata } from "next";
import { DateTime } from "luxon";
import { CalendarWorkspace } from "@/components/dashboard/calendar-workspace";
import { getWorkspaceData } from "@/lib/tenant";
import { saveReservation, setReservationStatus } from "@/app/actions/workspace";

export const metadata: Metadata = { title: "Calendario" };
export default async function CalendarPage() {
  const data = await getWorkspaceData();
  return (
    <CalendarWorkspace
      {...data}
      initialDate={DateTime.now().setZone(data.company.timezone).toISODate()!}
      onSave={saveReservation}
      onStatusChange={setReservationStatus}
    />
  );
}
