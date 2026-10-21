import Link from "next/link";
import { ArrowLeft, Check, MessageCircle, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { StarField } from "@/components/marketing/motion";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col overflow-hidden border-r border-emerald-100 bg-emerald-50/60 p-12 text-slate-800 lg:flex xl:p-16">
        <StarField />
        <div
          aria-hidden="true"
          className="aurora-blob -top-20 -left-24 h-80 w-80 bg-emerald-300/40"
        />
        <div
          aria-hidden="true"
          className="aurora-blob right-0 bottom-10 h-72 w-72 bg-teal-200/50 [animation-delay:-8s]"
        />
        <div className="relative z-10">
          <Brand />
        </div>
        <div className="relative z-10 my-auto max-w-md py-16">
          <span className="mb-6 inline-flex items-center gap-2 text-base text-primary">
            <Sparkles size={16} /> Un poco más de orden. Mucho más tiempo.
          </span>
          <h2 className="text-5xl leading-[1.15] font-medium tracking-tight">
            Tu negocio crece.
            <br />
            <span className="landing-accent-text">Tu agenda fluye.</span>
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Todas tus reservas, tus clientes y tus próximas citas en un mismo espacio.
          </p>
          <div className="mt-9 space-y-4 text-base text-slate-600">
            {[
              "Una agenda que se adapta a tu negocio",
              "Un directorio con el historial de tus clientes",
              "14 días para descubrir una forma más simple",
            ].map((text) => (
              <p key={text} className="flex items-center gap-3">
                <Check size={17} className="shrink-0 text-primary" />
                {text}
              </p>
            ))}
          </div>
          <div className="rim-card float-soft mt-12 rounded-2xl bg-white/80 p-6 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-primary">
                <MessageCircle size={23} />
              </div>
              <div>
                <p className="text-base font-medium">Un recordatorio a tiempo</p>
                <p className="mt-1 text-base text-slate-500">Así se verá con WhatsApp conectado</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-emerald-50/70 p-4 text-base leading-7 text-slate-600">
              ¡Hola, Ana! Te recordamos tu cita de mañana a las 10:00. Te esperamos ✨
            </p>
          </div>
        </div>
        <p className="text-base text-slate-500">Hecho para negocios que valoran su tiempo.</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-48 size-[600px] rounded-full border border-emerald-900/5"
        />
      </aside>
      <main className="flex min-h-screen flex-col p-6 sm:p-12">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-base text-slate-600 hover:text-primary"
          >
            <ArrowLeft size={15} />
            Volver al inicio
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="lg:hidden">
              <Brand compact />
            </div>
          </div>
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4 mx-auto my-auto w-full max-w-md py-16 duration-700">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-7 shadow-[inset_0_0_24px_#10b9810d] backdrop-blur sm:p-9">
            {children}
          </div>
        </div>
        <p className="text-center text-sm text-slate-400">
          Reserva · Menos pendientes, más posibilidades.
        </p>
      </main>
    </div>
  );
}
