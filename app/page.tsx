"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleCheck,
  LockKeyhole,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ProductPreview } from "@/components/marketing/product-preview";
import {
  ScrollProgress,
  ScrollTilt,
  SpotlightCard,
  StarField,
  fadeUp,
  revealViewport,
  stagger,
} from "@/components/marketing/motion";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import { monthlyFeatures, pricing, trialFeatures } from "@/lib/pricing";

const features = [
  {
    Icon: CalendarDays,
    title: "Cada cita, en su lugar",
    text: "Mira tu semana o tu mes. Crea y organiza reservas sin perderte entre conversaciones.",
    label: "Calendario visual",
  },
  {
    Icon: Users,
    title: "Conoce a quien vuelve",
    text: "Encuentra los datos y el historial de tus clientes. Dale continuidad a cada visita.",
    label: "Directorio de clientes",
  },
  {
    Icon: ShieldCheck,
    title: "Un espacio solo tuyo",
    text: "Tu negocio tiene su propia agenda. Las reservas y los clientes permanecen en tu espacio.",
    label: "Datos por negocio",
  },
  {
    Icon: MessageCircle,
    title: "El próximo paso: WhatsApp",
    text: "Preparamos recordatorios 24 horas antes de cada cita, desde el número de tu negocio.",
    label: "Próximamente",
  },
];

const industries = [
  "Clínicas",
  "Barberías",
  "Spas",
  "Talleres",
  "Consultorías",
  "Canchas deportivas",
  "Profesionales independientes",
];

const steps = [
  {
    number: "01",
    title: "Crea tu espacio",
    text: "Registra tu negocio y empieza tu prueba gratuita de 14 días, sin tarjeta.",
  },
  {
    number: "02",
    title: "Añade tu primera cita",
    text: "Elige la fecha, registra al cliente y guarda el servicio que necesita.",
  },
  {
    number: "03",
    title: "Disfruta de una agenda clara",
    text: "Consulta las próximas visitas y encuentra el historial de tus clientes en segundos.",
  },
];

const questions = [
  {
    question: "¿Necesito una tarjeta para empezar?",
    answer: `No. Crea tu cuenta y disfruta de ${pricing.trialDays} días gratis. Puedes explorar la agenda y el directorio de clientes sin introducir datos de pago.`,
  },
  {
    question: "¿Qué pasa cuando terminan los 14 días?",
    answer: `Puedes continuar con Reserva Pro por $${pricing.monthlyAmount} MXN al mes. Si no activas una suscripción, se pausa el acceso a la agenda y tus datos permanecen en tu espacio.`,
  },
  {
    question: "¿Los recordatorios de WhatsApp ya están disponibles?",
    answer:
      "La conexión de WhatsApp por QR y la sincronización con Google Calendar están en preparación. La agenda visual, las reservas y el directorio de clientes ya están disponibles.",
  },
];

export default function HomePage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="premium-landing overflow-x-clip bg-slate-50 text-slate-900">
        <a href="#contenido" className="landing-skip-link">
          Ir al contenido
        </a>
        <ScrollProgress />
        <SiteHeader />
        <main id="contenido">
          <section
            aria-labelledby="hero-title"
            className="premium-hero relative px-5 pt-24 pb-24 text-center sm:px-8 lg:pt-28 lg:pb-32"
          >
            <div aria-hidden="true" className="landing-constellation" />
            <StarField />
            <div
              aria-hidden="true"
              className="aurora-blob top-10 left-[8%] h-72 w-72 bg-emerald-300/40"
            />
            <div
              aria-hidden="true"
              className="aurora-blob top-52 right-[6%] h-80 w-80 bg-teal-200/50 [animation-delay:-6s]"
            />
            <div className="relative mx-auto max-w-[1200px]">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="landing-badge inline-flex items-center gap-2 rounded-[32px] border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800"
              >
                <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
                Más orden. Más tiempo para ti.
              </motion.div>
              <motion.h1
                id="hero-title"
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6 }}
                className="mx-auto mt-7 max-w-4xl text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.11] font-medium tracking-[-0.04em] text-slate-900"
              >
                Tu agenda en orden.
                <br />
                <span className="landing-accent-text">Tu tiempo de vuelta.</span>
              </motion.h1>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                <p className="mx-auto mt-7 max-w-[620px] text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
                  Reservas, clientes y próximas citas en un solo espacio. Para que te concentres en
                  lo que mejor haces.
                </p>
                <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Button asChild className="landing-cta h-12 px-6 text-base">
                    <Link href="/register">
                      Prueba {pricing.trialDays} días gratis
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="landing-secondary h-12 border-slate-200 bg-white px-6 text-base text-slate-700"
                  >
                    <Link href="/demo">
                      Explorar la demo
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
                <p className="mt-5 flex items-center justify-center gap-2 text-base text-slate-600">
                  <Check
                    size={17}
                    strokeWidth={1.5}
                    className="text-emerald-700"
                    aria-hidden="true"
                  />
                  Sin tarjeta de crédito. A tu ritmo.
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="mx-auto mt-16 max-w-[1100px] sm:mt-20"
              >
                <ScrollTilt>
                  <div className="landing-preview-frame relative rounded-2xl p-2 shadow-2xl shadow-emerald-900/10 sm:p-3">
                    <ProductPreview />
                  </div>
                </ScrollTilt>
              </motion.div>
              <div className="mx-auto mt-14 max-w-4xl">
                <p className="text-xs font-medium tracking-[0.14em] text-slate-500">
                  HECHO PARA TU NEGOCIO
                </p>
                <div className="marquee mt-5">
                  <ul className="marquee-track text-base text-slate-600">
                    {[...industries, ...industries].map((industry, index) => (
                      <li
                        key={`${industry}-${index}`}
                        aria-hidden={index >= industries.length ? true : undefined}
                        className="flex items-center gap-12 whitespace-nowrap"
                      >
                        {industry}
                        <span className="size-1 rounded-full bg-emerald-400" aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section
            id="funcionalidades"
            aria-labelledby="features-title"
            className="relative mx-auto max-w-[1200px] scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32"
          >
            <div className="aurora-divider absolute inset-x-8 top-0" aria-hidden="true" />
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={revealViewport}
              className="mx-auto max-w-2xl text-center"
            >
              <p className="eyebrow">MENOS PESTAÑAS. MÁS CLARIDAD.</p>
              <h2 id="features-title" className="landing-heading mt-4">
                Todo lo esencial.
                <br />
                Justo donde lo necesitas.
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">
                Una forma tranquila de llevar el ritmo de tu negocio, desde la primera cita hasta la
                próxima visita.
              </p>
            </motion.div>
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={revealViewport}
              className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4"
            >
              {features.map(({ Icon, title, text, label }) => (
                <SpotlightCard
                  key={title}
                  className="landing-feature group flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-primary group-hover:text-pure">
                    <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <h3 className="text-xl leading-7 font-medium tracking-[-0.02em] text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-4 text-base leading-7 text-slate-600">{text}</p>
                  <p className="mt-auto pt-7 text-sm font-medium text-emerald-800">{label}</p>
                </SpotlightCard>
              ))}
            </motion.div>
          </section>

          <section
            id="como-funciona"
            aria-labelledby="steps-title"
            className="relative mx-auto max-w-[1200px] scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32"
          >
            <div className="aurora-divider absolute inset-x-8 top-0" aria-hidden="true" />
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={revealViewport}
              className="mx-auto max-w-2xl text-center"
            >
              <p className="eyebrow">UN COMIENZO SENCILLO</p>
              <h2 id="steps-title" className="landing-heading mt-4">
                Del primer clic
                <br />a tu próxima cita.
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-600">
                Empieza con lo que ya conoces. Nosotros ponemos el espacio para organizarlo.
              </p>
            </motion.div>
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={revealViewport}
              className="mt-14 grid gap-6 md:grid-cols-3 lg:mt-16"
            >
              {steps.map(({ number, title, text }) => (
                <SpotlightCard
                  key={number}
                  className="group rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <span className="flex size-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-base font-medium text-emerald-700 transition-colors duration-300 group-hover:bg-primary group-hover:text-pure">
                    {number}
                  </span>
                  <h3 className="mt-7 text-xl font-medium tracking-[-0.02em] text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-4 text-base leading-7 text-slate-600">{text}</p>
                </SpotlightCard>
              ))}
            </motion.div>
          </section>

          <section
            id="precios"
            aria-labelledby="pricing-title"
            className="relative scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32"
          >
            <div className="aurora-divider absolute inset-x-8 top-0" aria-hidden="true" />
            <div className="mx-auto max-w-[1000px]">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={revealViewport}
                className="mx-auto max-w-2xl text-center"
              >
                <p className="eyebrow">PRECIOS, SIN COMPLICACIONES</p>
                <h2 id="pricing-title" className="landing-heading mt-4">
                  Un pequeño cambio.
                  <br />
                  <span className="landing-accent-text">Mucho más tiempo.</span>
                </h2>
                <p className="mt-6 text-lg leading-8 text-slate-600">
                  Prueba Reserva durante {pricing.trialDays} días. Descubre una forma más simple de
                  organizar tu negocio.
                </p>
              </motion.div>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={revealViewport}
                className="mx-auto mt-16 grid max-w-[880px] items-center gap-7 md:grid-cols-2 md:gap-8"
              >
                <motion.article
                  variants={fadeUp}
                  aria-labelledby="trial-plan-title"
                  className="landing-trial flex flex-col rounded-2xl border border-slate-200 bg-white p-8 md:min-h-[550px] md:py-10"
                >
                  <h3 id="trial-plan-title" className="text-2xl font-medium tracking-tight">
                    Prueba gratuita
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">
                    Tu primer paso hacia una mejor agenda.
                  </p>
                  <p className="mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[64px] leading-none font-medium tracking-[-0.05em]">
                      $0
                    </span>
                    <span className="text-base text-slate-500">/ {pricing.trialDays} días</span>
                  </p>
                  <div className="my-7 h-px bg-slate-100" aria-hidden="true" />
                  <ul className="space-y-4" aria-label="Funciones de la prueba gratuita">
                    {trialFeatures.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-3 text-base leading-6 text-slate-600"
                      >
                        <Check
                          size={18}
                          strokeWidth={1.5}
                          className="mt-0.5 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-9">
                    <Button asChild className="landing-cta h-12 w-full text-base">
                      <Link href="/register">
                        Comenzar prueba gratis
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </Link>
                    </Button>
                    <p className="mt-4 text-center text-sm text-slate-600">
                      Sin tarjeta de crédito.
                    </p>
                  </div>
                </motion.article>
                <motion.article
                  variants={fadeUp}
                  aria-labelledby="monthly-plan-title"
                  className="landing-pro beam relative flex flex-col rounded-2xl border-2 border-primary bg-white p-8 pt-10 md:min-h-[606px] md:py-12"
                >
                  <span className="absolute -top-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[32px] bg-primary px-4 py-1.5 text-sm font-medium text-pure">
                    <Sparkles size={14} strokeWidth={1.5} aria-hidden="true" />
                    Más popular
                  </span>
                  <h3 id="monthly-plan-title" className="text-2xl font-medium tracking-tight">
                    Reserva Pro
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">
                    Para seguir creciendo después de la prueba.
                  </p>
                  <p className="mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[64px] leading-none font-medium tracking-[-0.05em]">
                      ${pricing.monthlyAmount}
                    </span>
                    <span className="text-base text-slate-500">
                      {pricing.currency} / {pricing.period}
                    </span>
                  </p>
                  <div className="my-7 h-px bg-emerald-100" aria-hidden="true" />
                  <ul className="space-y-4" aria-label="Funciones del plan Reserva Pro">
                    {monthlyFeatures.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-3 text-base leading-6 text-slate-700"
                      >
                        <CircleCheck
                          size={18}
                          strokeWidth={1.5}
                          className="mt-0.5 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-9">
                    <Button asChild className="landing-cta h-12 w-full text-base">
                      <Link href="/register">
                        Empezar con {pricing.trialDays} días gratis
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </Link>
                    </Button>
                    <p className="mt-4 text-center text-sm text-emerald-800">
                      Tú decides si continúas al finalizar.
                    </p>
                  </div>
                </motion.article>
              </motion.div>
              <p className="mx-auto mt-10 flex max-w-xl items-start justify-center gap-2 text-center text-base leading-7 text-slate-600">
                <LockKeyhole
                  size={17}
                  strokeWidth={1.5}
                  className="mt-1 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                Sin cobros automáticos durante la prueba. Todos los importes están expresados en
                pesos mexicanos.
              </p>
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={revealViewport}
                className="mx-auto mt-24 max-w-[800px]"
              >
                <h3 className="mb-7 text-center text-2xl font-medium tracking-tight">
                  Antes de empezar
                </h3>
                {questions.map(({ question, answer }) => (
                  <details key={question} className="group border-b border-slate-200 py-6">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                      {question}
                      <Plus
                        size={20}
                        strokeWidth={1.5}
                        className="shrink-0 text-emerald-700 transition-transform group-open:rotate-45"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{answer}</p>
                  </details>
                ))}
              </motion.div>
            </div>
          </section>

          <section
            aria-labelledby="closing-title"
            className="px-5 py-24 text-center sm:px-8 lg:py-32"
          >
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={revealViewport}
              className="void-panel relative mx-auto max-w-[1136px] overflow-hidden rounded-2xl px-6 py-20 sm:px-12 sm:py-24"
            >
              <StarField tone="dark" />
              <div aria-hidden="true" className="aurora-divider absolute inset-x-0 top-0" />
              <Sparkles
                size={27}
                strokeWidth={1.5}
                className="float-soft relative mx-auto text-emerald-300"
                aria-hidden="true"
              />
              <h2 id="closing-title" className="landing-heading relative mx-auto mt-7 max-w-2xl">
                Haz espacio para lo que viene.
              </h2>
              <p className="relative mx-auto mt-6 max-w-xl text-lg leading-8 text-emerald-100/80">
                Empieza con una agenda más simple. Tu negocio y tu tiempo lo van a agradecer.
              </p>
              <Button
                asChild
                className="landing-cta relative mt-9 h-12 px-6 text-base shadow-[0_0_40px_#10b98166]"
              >
                <Link href="/register">
                  Crear mi espacio gratis
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </Button>
              <p className="relative mt-4 text-base text-emerald-100/70">
                {pricing.trialDays} días para descubrir otra forma de organizarte.
              </p>
            </motion.div>
          </section>
        </main>
        <footer className="border-t border-slate-200 px-5 py-10 sm:px-8">
          <div className="mx-auto flex max-w-[1136px] flex-col items-center justify-between gap-6 sm:flex-row">
            <Brand />
            <p className="text-base text-slate-600">Menos pendientes. Más posibilidades.</p>
            <div className="flex gap-6 text-sm text-slate-600">
              <a href="#precios" className="transition-colors hover:text-emerald-700">
                Precios
              </a>
              <Link href="/login" className="transition-colors hover:text-emerald-700">
                Iniciar sesión
                <ArrowUpRight size={14} className="ml-1 inline" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
