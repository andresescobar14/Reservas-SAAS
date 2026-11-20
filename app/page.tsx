"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleCheck,
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
  CursorGlow,
  ScrollTilt,
  SpotlightCard,
  StarField,
  fadeUp,
  revealViewport,
  stagger,
} from "@/components/marketing/motion";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";
import { monthlyFeatures, pricing } from "@/lib/pricing";
import { brand } from "@/lib/brand";
import { ownerBookingPath } from "@/lib/public-booking";

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
    title: "Más cerca, por WhatsApp",
    text: "Confirma tus citas y programa recordatorios desde el número conectado de tu negocio.",
    label: "Confirmación y recordatorio",
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
    title: "Elige cuándo probar Reservas",
    text: "Reserva una demostración sin tarjeta y conoce cómo agendarán tus clientes.",
  },
  {
    number: "02",
    title: "Guarda tu cita",
    text: "Elige un horario disponible, completa tus datos y confirma la reserva.",
  },
  {
    number: "03",
    title: "Recibe tus avisos por WhatsApp",
    text: "Si lo autorizas, recibirás una confirmación y un recordatorio antes de tu cita.",
  },
];

const questions = [
  {
    question: "¿Qué incluye la demostración?",
    answer:
      "Una cita de 30 minutos que puedes agendar sin cuenta ni tarjeta. Si autorizas WhatsApp, también puedes probar la confirmación y el recordatorio.",
  },
  {
    question: "¿Los recordatorios de WhatsApp ya están disponibles?",
    answer:
      "Sí. Los envíos requieren un número conectado a WhatsApp Cloud API, plantillas aprobadas, automatización activa y autorización del cliente. Puedes probar la experiencia reservando una demostración con nosotros.",
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
            <CursorGlow />
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
                className="landing-badge beam relative inline-flex items-center gap-2 rounded-[32px] border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800"
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
                  <Button
                    asChild
                    className="landing-cta h-13 gap-2 bg-emerald-600 px-7 text-base text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-700"
                  >
                    <Link href={ownerBookingPath}>
                      <CalendarDays size={19} aria-hidden="true" /> Reservar ahora
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
                  Demostración de 30 minutos, sin tarjeta.
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
                    <div className="chip-float float-soft absolute -top-5 -left-6 z-10 hidden items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm lg:flex">
                      <CircleCheck size={18} className="text-emerald-600" aria-hidden="true" />
                      <span>
                        <span className="block font-medium text-slate-900">Cita confirmada</span>
                        <span className="block text-xs text-slate-500">Ana García · 09:00</span>
                      </span>
                    </div>
                    <div className="chip-float float-soft absolute -right-6 bottom-16 z-10 hidden items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm lg:flex">
                      <CalendarDays size={18} className="text-emerald-600" aria-hidden="true" />
                      <span>
                        <span className="block font-medium text-slate-900">Semana al día</span>
                        <span className="block text-xs text-slate-500">
                          7 reservas · 6 clientes
                        </span>
                      </span>
                    </div>
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
                  Conoce {brand.proPlan} y reserva una demostración para ver cómo funciona.
                </p>
              </motion.div>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={revealViewport}
                className="mx-auto mt-16 max-w-xl"
              >
                <motion.article
                  variants={fadeUp}
                  aria-labelledby="monthly-plan-title"
                  className="landing-pro beam relative flex flex-col rounded-2xl border-2 border-primary bg-white p-8 md:p-10"
                >
                  <h3 id="monthly-plan-title" className="text-2xl font-medium tracking-tight">
                    {brand.proPlan}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">
                    Agenda, clientes y recordatorios para tu negocio.
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
                  <ul className="space-y-4" aria-label={`Funciones del plan ${brand.proPlan}`}>
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
                      <Link href={ownerBookingPath}>
                        Reservar ahora
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </motion.article>
              </motion.div>
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
                Elige un horario y prueba el mismo proceso de reserva que usarán tus clientes.
              </p>
              <Button
                asChild
                className="landing-cta relative mt-9 h-12 px-6 text-base shadow-[0_0_40px_#10b98166]"
              >
                <Link href={ownerBookingPath}>
                  Reservar ahora
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </Button>
            </motion.div>
          </section>
        </main>
        <footer className="border-t border-slate-200 px-5 py-10 sm:px-8">
          <div className="mx-auto flex max-w-[1136px] flex-col items-center justify-between gap-6 sm:flex-row">
            <Brand />
            <p className="text-base text-slate-600">Menos pendientes. Más posibilidades.</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-600">
              <Link href="/privacidad" className="transition-colors hover:text-emerald-700">
                Privacidad
              </Link>
              <Link
                href="/eliminacion-de-datos"
                className="transition-colors hover:text-emerald-700"
              >
                Eliminación de datos
              </Link>
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
