"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plug,
  Users,
} from "lucide-react";
import { CountUp } from "@/components/marketing/motion";

const stats = [
  { value: 2, label: "Reservas de hoy" },
  { value: 7, label: "Esta semana" },
  { value: 6, label: "Clientes" },
];

const appointments = [
  { name: "Ana García", service: "Consulta inicial", time: "09:00 – 10:00", offset: 12 },
  { name: "Luis Pérez", service: "Corte y estilo", time: "10:00 – 11:00", offset: 70 },
  { name: "María Torres", service: "Sesión de bienestar", time: "11:00 – 12:00", offset: 128 },
  { name: "Carlos Ruiz", service: "Seguimiento", time: "09:30 – 10:30", offset: 40 },
  { name: "Lucía Fernández", service: "Consulta inicial", time: "10:30 – 11:30", offset: 100 },
];

export function ProductPreview() {
  return (
    <Link
      href="/demo"
      aria-label="Explorar la demo interactiva del calendario"
      className="product-preview group block text-left"
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 bg-white px-5 py-3 text-xs text-slate-500 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="pulse-dot size-2 rounded-full bg-emerald-500" />
          Tu próximo espacio de trabajo
        </div>
        <span className="flex items-center gap-2 text-primary">
          Explorar demo
          <ArrowUpRight size={14} />
        </span>
      </div>
      <div className="grid sm:grid-cols-[170px_1fr] lg:grid-cols-[190px_1fr]">
        <aside
          aria-hidden="true"
          className="hidden border-r border-slate-200/70 bg-white p-5 sm:block"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-primary">
              EB
            </span>
            Estudio Bienestar
          </div>
          <p className="mt-8 mb-3 text-xs text-slate-400">TU NEGOCIO</p>
          <div className="space-y-2">
            {[
              { Icon: CalendarDays, label: "Calendario" },
              { Icon: Users, label: "Clientes" },
              { Icon: MessageCircle, label: "WhatsApp" },
              { Icon: Plug, label: "Integraciones" },
            ].map(({ Icon, label }, index) => (
              <div
                key={label}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm ${index === 0 ? "bg-emerald-50 text-primary" : "text-slate-500"}`}
              >
                <Icon size={17} strokeWidth={1.5} />
                {label}
              </div>
            ))}
          </div>
          <div className="mt-16 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm leading-6 text-emerald-800">
            <Check size={16} className="mb-2" />
            Todo listo para tu próxima cita.
          </div>
        </aside>
        <div className="relative min-w-0 bg-slate-50/70 p-4 sm:p-6 lg:p-7">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">UN BUEN DÍA EMPIEZA CON ORDEN</p>
              <p className="mt-1.5 text-xl font-medium text-slate-800 sm:text-2xl">
                Tu agenda, de un vistazo.
              </p>
            </div>
            <span className="hidden items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs text-pure md:flex">
              + Nueva reserva
            </span>
          </div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {stats.map(({ value, label }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200/70 bg-white px-3 py-3 sm:px-4"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-medium text-slate-800">
                  <CountUp value={value} />
                </p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">19 – 25 octubre</span>
              <div aria-hidden="true" className="flex items-center gap-3 text-xs text-slate-500">
                <ChevronLeft size={14} />
                <ChevronRight size={14} />
                <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-primary">Semana</span>
              </div>
            </div>
            <div className="grid grid-cols-[35px_1fr] p-3 sm:grid-cols-[42px_1fr]">
              <div className="space-y-[43px] pt-10 text-[10px] text-slate-400 sm:text-xs">
                {["09:00", "10:00", "11:00", "12:00"].map((time) => (
                  <div key={time}>{time}</div>
                ))}
              </div>
              <div className="min-w-0">
                <div className="grid grid-cols-3 pb-3 text-center text-xs text-slate-500 lg:grid-cols-5">
                  {["LUN 19", "MAR 20", "MIÉ 21", "JUE 22", "VIE 23"].map((day, index) => (
                    <span
                      key={day}
                      className={`${index > 2 ? "hidden lg:block" : ""} ${index === 2 ? "text-primary" : ""}`}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <div className="grid h-[235px] grid-cols-3 gap-1.5 bg-[linear-gradient(to_bottom,#edf1ef_1px,transparent_1px)] bg-[size:100%_59px] lg:grid-cols-5">
                  {appointments.map((appointment, index) => (
                    <motion.div
                      key={appointment.name}
                      initial={{ opacity: 0, y: 14, scale: 0.94 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={{
                        duration: 0.5,
                        delay: 0.5 + index * 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      style={{ marginTop: appointment.offset }}
                      className={`${index > 2 ? "hidden lg:block" : ""} h-[82px] rounded-md border-l-2 border-emerald-500 bg-emerald-50/90 px-2 py-2 text-emerald-900 transition-shadow hover:shadow-md`}
                    >
                      <p className="truncate text-xs font-medium">{appointment.name}</p>
                      <p className="mt-1 truncate text-[10px] text-emerald-700 sm:text-xs">
                        {appointment.service}
                      </p>
                      <p className="mt-2 text-[9px] text-emerald-700 sm:text-[11px]">
                        {appointment.time}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-right text-xs text-slate-500">
            Vista previa con datos de ejemplo
          </p>
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 1.9, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="float-soft absolute right-4 bottom-12 hidden items-center gap-2.5 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-medium text-emerald-900 shadow-lg shadow-emerald-900/10 md:flex"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-pure">
              <Check size={13} />
            </span>
            Reserva guardada con éxito
          </motion.div>
        </div>
      </div>
    </Link>
  );
}
