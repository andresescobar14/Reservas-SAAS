import Link from "next/link";
import { ArrowUpRight, Check, CircleCheck, LockKeyhole, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthlyFeatures, pricing, trialFeatures } from "@/lib/pricing";

export function PricingSection() {
  return (
    <section
      id="precios"
      aria-labelledby="pricing-title"
      className="pricing-section relative scroll-mt-8 px-5 py-24 sm:px-8 lg:py-28"
    >
      <div className="relative mx-auto max-w-[1000px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">PRECIOS, SIN COMPLICACIONES</p>
          <h2 id="pricing-title" className="section-heading mt-4">
            Un pequeño cambio.
            <br />
            <span className="text-primary">Mucho más tiempo.</span>
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Prueba Reserva durante {pricing.trialDays} días. Descubre una forma más simple de
            organizar tu negocio.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-[860px] items-stretch gap-6 md:grid-cols-2 md:gap-10">
          <article
            aria-labelledby="trial-plan-title"
            className="flex flex-col rounded-2xl border border-slate-200/70 bg-white/70 px-7 py-9 sm:px-9 md:mt-6 md:border-transparent md:bg-transparent"
          >
            <div className="text-center">
              <h3 id="trial-plan-title" className="text-xl font-medium text-slate-800">
                Prueba gratuita
              </h3>
              <p className="mt-5 flex items-baseline justify-center gap-1.5">
                <span className="text-2xl text-slate-500">$</span>
                <span className="text-[64px] leading-none font-medium tracking-tight text-slate-900">
                  0
                </span>
                <span className="text-sm text-slate-500">/ {pricing.trialDays} días</span>
              </p>
              <p className="mt-4 text-base text-slate-500">
                Tu primer paso hacia una mejor agenda.
              </p>
            </div>
            <ul className="mt-8 space-y-4" aria-label="Funciones de la prueba gratuita">
              {trialFeatures.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 text-base leading-6 text-slate-600"
                >
                  <Check size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-9">
              <Button
                asChild
                variant="outline"
                className="h-12 w-full border-emerald-200 bg-white text-primary hover:border-primary hover:bg-emerald-50"
              >
                <Link href="/register">
                  Comenzar prueba gratis
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
              <p className="mt-4 text-center text-base text-slate-500">Sin tarjeta de crédito.</p>
            </div>
          </article>
          <article
            aria-labelledby="monthly-plan-title"
            className="pricing-glow flex flex-col rounded-2xl px-7 py-9 sm:px-9"
          >
            <div className="relative z-10 flex h-full flex-col">
              <div className="text-center">
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-medium text-emerald-800">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  UN PLAN PARA TU NEGOCIO
                </span>
                <h3 id="monthly-plan-title" className="text-xl font-medium text-slate-800">
                  Reserva Pro
                </h3>
                <p className="mt-5 flex items-baseline justify-center gap-1.5">
                  <span className="text-2xl text-slate-500">$</span>
                  <span className="text-[64px] leading-none font-medium tracking-tight text-slate-900">
                    {pricing.monthlyAmount}
                  </span>
                  <span className="text-sm text-slate-500">
                    {pricing.currency} / {pricing.period}
                  </span>
                </p>
                <p className="mt-4 text-base text-slate-600">
                  Para seguir creciendo después de la prueba.
                </p>
              </div>
              <ul className="mt-8 space-y-4" aria-label="Funciones del plan Reserva Pro">
                {monthlyFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-base leading-6 text-slate-700"
                  >
                    <CircleCheck
                      size={17}
                      strokeWidth={1.5}
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-9">
                <Button asChild className="h-12 w-full">
                  <Link href="/register">
                    Empezar con {pricing.trialDays} días gratis
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
                <p className="mt-4 text-center text-base text-emerald-800">
                  Tú decides si continúas al finalizar.
                </p>
              </div>
            </div>
          </article>
        </div>
        <p className="mx-auto mt-9 flex max-w-xl items-start justify-center gap-2 text-center text-base leading-6 text-slate-500">
          <LockKeyhole size={15} strokeWidth={1.5} className="mt-1 shrink-0 text-primary" />
          Sin cobros automáticos durante la prueba. Todos los importes están expresados en pesos
          mexicanos.
        </p>
        <div className="mx-auto mt-16 max-w-[800px] border-t border-emerald-900/10 pt-5">
          {[
            {
              question: "¿Necesito una tarjeta para empezar?",
              answer:
                "No. Crea tu cuenta y disfruta de 14 días gratis. Puedes explorar la agenda y el directorio de clientes sin introducir datos de pago.",
            },
            {
              question: "¿Qué pasa cuando terminan los 14 días?",
              answer: `Puedes continuar con Reserva Pro por $${pricing.monthlyAmount} MXN al mes. Si no activas una suscripción, se pausa el acceso a la agenda y tus datos permanecen en tu espacio.`,
            },
            {
              question: "¿Los recordatorios de WhatsApp ya están disponibles?",
              answer:
                "La conexión de WhatsApp y la sincronización con Google Calendar están en preparación. La agenda visual, las reservas y el directorio de clientes ya están disponibles.",
            },
          ].map(({ question, answer }) => (
            <details key={question} className="group border-b border-emerald-900/10 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
                {question}
                <Plus
                  size={18}
                  strokeWidth={1.5}
                  className="shrink-0 text-primary transition-transform group-open:rotate-45"
                />
              </summary>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
