"use client";

import { useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import esLocale from "@fullcalendar/core/locales/es";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Booking } from "@/lib/types";

export default function CalendarView({
  bookings,
  timezone,
  initialDate,
  onDateClick,
  onBookingClick,
}: {
  bookings: Booking[];
  timezone: string;
  initialDate: string;
  onDateClick: (date: string) => void;
  onBookingClick: (booking: Booking) => void;
}) {
  const calendar = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState("timeGridWeek");
  return (
    <div className="calendar-wrap overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Semana o mes anterior"
              onClick={() => calendar.current?.getApi().prev()}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Semana o mes siguiente"
              onClick={() => calendar.current?.getApi().next()}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
          <h2 aria-live="polite" className="text-xl font-medium capitalize">
            {title}
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => calendar.current?.getApi().today()}
          >
            Hoy
          </Button>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1">
          {[
            { id: "timeGridWeek", label: "Semana" },
            { id: "dayGridMonth", label: "Mes" },
          ].map((option) => (
            <button
              key={option.id}
              aria-pressed={view === option.id}
              onClick={() => {
                setView(option.id);
                calendar.current?.getApi().changeView(option.id);
              }}
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-medium",
                view === option.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[650px]">
          <FullCalendar
            ref={calendar}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
            locale={esLocale}
            timeZone={timezone}
            initialDate={initialDate}
            initialView="timeGridWeek"
            headerToolbar={false}
            firstDay={1}
            height={620}
            allDaySlot={false}
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            scrollTime="08:00:00"
            slotDuration="00:30:00"
            nowIndicator
            dayMaxEvents={3}
            eventMinHeight={36}
            datesSet={({ view: currentView }) => setTitle(currentView.title)}
            dateClick={({ dateStr, allDay }) =>
              onDateClick(
                allDay
                  ? `${dateStr}T09:00`
                  : DateTime.fromISO(dateStr, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm"),
              )
            }
            eventClick={({ event }) => {
              const booking = bookings.find((item) => item.id === event.id);
              if (booking) onBookingClick(booking);
            }}
            events={bookings
              .filter((booking) => booking.status !== "cancelled")
              .map((booking, index) => ({
                id: booking.id,
                title: booking.customer.full_name,
                start: booking.starts_at,
                end: booking.ends_at,
                classNames: [
                  booking.status === "completed"
                    ? "booking-completed"
                    : ["booking-green", "booking-blue", "booking-violet"][index % 3],
                ],
                extendedProps: { service: booking.service },
              }))}
            eventContent={(event) => (
              <div className="overflow-hidden px-1 py-0.5">
                <p className="truncate text-xs font-medium">{event.event.title}</p>
                <p className="mt-0.5 truncate text-xs opacity-80">
                  {event.event.extendedProps.service}
                </p>
                <p className="mt-1 text-[11px] opacity-70">{event.timeText}</p>
              </div>
            )}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-5 border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" />
          Confirmada
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-slate-300" />
          Completada
        </span>
        <span className="ml-auto">Haz clic en una fecha para reservar</span>
      </div>
    </div>
  );
}
