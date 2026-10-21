"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronsUpDown,
  CircleHelp,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Plug,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { trialDaysRemaining } from "@/lib/subscription";
import { signOut } from "@/app/actions/auth";
import type { Company } from "@/lib/types";

export type DashboardView = "calendario" | "clientes" | "whatsapp" | "integraciones" | "cuenta";
const navigation = [
  { id: "calendario", title: "Calendario", icon: CalendarDays },
  { id: "clientes", title: "Clientes", icon: Users },
  { id: "whatsapp", title: "WhatsApp", icon: MessageCircle },
  { id: "integraciones", title: "Integraciones", icon: Plug },
] as const;

export function DashboardShell({
  company,
  children,
  demo = false,
  activeView,
  onNavigate,
}: {
  company: Company;
  children: React.ReactNode;
  demo?: boolean;
  activeView?: DashboardView;
  onNavigate?: (view: DashboardView) => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const days = trialDaysRemaining(company.trial_ends_at);
  const selected = activeView || pathname.split("/")[2] || "calendario";
  const title =
    selected === "cuenta" ? "Mi cuenta" : navigation.find((item) => item.id === selected)?.title;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen bg-slate-50">
        <div aria-hidden="true" className="dash-ambient" />
        {menuOpen && (
          <button
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-y-auto border-r border-slate-200/80 bg-white px-4 py-7 transition-transform lg:translate-x-0",
            menuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-3">
            <Brand />
            <button
              className="text-slate-400 lg:hidden"
              aria-label="Cerrar menú"
              onClick={() => setMenuOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-9 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-xs font-medium text-emerald-800">
              {company.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{company.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">Espacio de trabajo</p>
            </div>
            <ChevronsUpDown size={13} className="ml-auto shrink-0 text-slate-400" />
          </div>
          <p className="mt-8 mb-3 px-3 text-xs font-medium tracking-widest text-slate-400">
            TU NEGOCIO
          </p>
          <nav aria-label="Menú del dashboard" className="space-y-1">
            {navigation.map(({ id, title: label, icon: Icon }) => {
              const className = cn(
                "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                selected === id
                  ? "text-emerald-800"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              );
              const content = (
                <>
                  {selected === id && (
                    <motion.span
                      layoutId="dashboard-nav-active"
                      className="absolute inset-0 rounded-lg bg-emerald-50 shadow-[inset_0_0_0_1px_#a7f3d055]"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon size={18} strokeWidth={1.8} className="relative" />
                  <span className="relative">{label}</span>
                  {id === "whatsapp" && (
                    <span className="relative ml-auto size-1.5 rounded-full bg-slate-300" />
                  )}
                </>
              );
              return demo ? (
                <button
                  key={id}
                  className={className}
                  aria-current={selected === id ? "page" : undefined}
                  onClick={() => {
                    onNavigate?.(id);
                    setMenuOpen(false);
                  }}
                >
                  {content}
                </button>
              ) : (
                <Link
                  key={id}
                  href={`/dashboard/${id}`}
                  className={className}
                  aria-current={selected === id ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {content}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto pt-10">
            {company.subscription_status === "trial" && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-900">
                  <Sparkles size={15} />
                  Tu espacio está creciendo
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Tienes {days} días para explorar todas las posibilidades.
                </p>
                <Link
                  href={demo ? "/register" : "/suscripcion"}
                  className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-emerald-800"
                >
                  {demo ? "Crear mi cuenta" : "Ver mi suscripción"}
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            )}
            <Link
              href="/#como-funciona"
              className="mt-5 flex items-center gap-3 px-3 py-2 text-xs text-slate-400"
            >
              <CircleHelp size={16} />
              Conoce Reserva
            </Link>
            {!demo && (
              <form action={signOut}>
                <button className="flex items-center gap-3 px-3 py-2 text-xs text-slate-400 hover:text-slate-700">
                  <LogOut size={15} />
                  Cerrar sesión
                </button>
              </form>
            )}
            <div className="mt-4 flex items-center gap-3 border-t border-slate-100 px-2 pt-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                {company.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                {demo ? (
                  <button
                    className="text-xs font-medium hover:text-emerald-700"
                    onClick={() => {
                      onNavigate?.("cuenta");
                      setMenuOpen(false);
                    }}
                  >
                    Cuenta de ejemplo
                  </button>
                ) : (
                  <Link
                    href="/dashboard/cuenta"
                    className="text-xs font-medium hover:text-emerald-700"
                    onClick={() => setMenuOpen(false)}
                  >
                    Mi cuenta
                  </Link>
                )}
                <p className="mt-0.5 text-xs text-slate-400">Administrador</p>
              </div>
            </div>
          </div>
        </aside>
        <div className="relative z-10 lg:pl-60">
          <header className="sticky top-0 z-20 flex h-[73px] items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 backdrop-blur-md sm:px-8">
            <div className="flex items-center gap-3 text-xs">
              <button
                aria-label="Abrir menú"
                className="text-slate-400 lg:hidden"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={20} />
              </button>
              <LayoutGrid size={15} className="hidden text-slate-400 sm:block" />
              <span className="hidden text-slate-400 sm:block">Mi espacio</span>
              <span className="hidden text-slate-300 sm:block">/</span>
              <span className="font-medium text-slate-600">{title}</span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
                <span className="pulse-dot size-1.5 rounded-full bg-emerald-500" />
                {demo
                  ? "Modo demo"
                  : company.subscription_status === "trial"
                    ? "Prueba gratuita"
                    : "Plan activo"}
              </span>
              <span className="flex size-8 items-center justify-center rounded-full border border-slate-200 text-xs font-medium text-slate-500">
                {company.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
          </header>
          {demo && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-900">
              <span>Demo con datos de ejemplo. Los cambios duran hasta recargar la página.</span>
              <Link href="/register" className="font-medium underline underline-offset-2">
                Crear mi espacio
              </Link>
            </div>
          )}
          <main id="contenido" className="mx-auto max-w-[1500px] p-5 sm:p-8">
            <motion.div
              key={selected}
              className="dash-enter"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
