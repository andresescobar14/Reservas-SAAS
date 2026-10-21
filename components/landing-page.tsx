import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { LandingMotion } from "@/components/landing-motion";
import { SiteHeader } from "@/components/marketing/site-header";
import { ProductPreview } from "@/components/marketing/product-preview";
import { PricingSection } from "@/components/marketing/pricing-section";

const features = [
  {
    Icon: CalendarDays,
    title: "Cada cita, en su lugar",
    text: "Mira tu semana o tu mes. Crea y organiza reservas sin perderte entre conversaciones.",
  },
  {
    Icon: Users,
    title: "Conoce a quien vuelve",
    text: "Encuentra los datos y el historial de tus clientes. Dale continuidad a cada visita.",
  },
  {
    Icon: ShieldCheck,
    title: "Un espacio solo tuyo",
    text: "Tu negocio tiene su propia agenda. Las reservas y los clientes permanecen en tu espacio.",
  },
  {
    Icon: MessageCircle,
    title: "El próximo paso: WhatsApp",
    text: "Preparamos la conexión de recordatorios para acompañar tus citas. Próximamente.",
  },
];

export function LandingPage() {
  return (
    <main className="marketing-page overflow-hidden bg-white">
      <LandingMotion />
      <SiteHeader />
      <section className="hero-surface relative px-5 pt-20 pb-16 text-center sm:px-8 lg:pt-24 lg:pb-24">
        <div className="relative mx-auto max-w-[1200px]">
          <div className="hero-reveal inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-800 shadow-[inset_0_-5px_12px_#d1fae570]">
            <Sparkles size={15} strokeWidth={1.5} />
            Más orden. Más tiempo para ti.
          </div>
          <h1 className="hero-reveal mx-auto mt-7 max-w-4xl text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.1] font-medium tracking-[-0.035em] text-slate-900">
            Tu agenda en orden.
            <br />
            <span className="brand-text">Tu tiempo de vuelta.</span>
          </h1>
          <p className="hero-reveal mx-auto mt-6 max-w-[590px] text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
            Reservas, clientes y próximas citas en un solo espacio. Para que te concentres en lo que
            mejor haces.
          </p>
          <div className="hero-reveal mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="h-12 px-6 text-base">
              <Link href="/register">
                Prueba 14 días gratis
                <ArrowUpRight size={17} />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 border-slate-200 bg-white px-6 text-base text-slate-700"
            >
              <Link href="/demo">
                Explorar la demo
                <ArrowRight size={17} />
              </Link>
            </Button>
          </div>
          <p className="hero-reveal mt-5 flex items-center justify-center gap-2 text-base text-slate-500">
            <Check size={15} strokeWidth={1.5} className="text-primary" />
            Sin tarjeta de crédito. A tu ritmo.
          </p>
          <div className="hero-reveal relative mx-auto mt-14 max-w-[1100px] sm:mt-16">
            <ProductPreview />
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            <span className="text-xs tracking-[.12em] text-slate-400">HECHO PARA TU NEGOCIO</span>
            {["Clínicas", "Barberías", "Spas", "Profesionales independientes"].map((industry) => (
              <span key={industry}>{industry}</span>
            ))}
          </div>
        </div>
      </section>
      <section
        id="funcionalidades"
        className="relative mx-auto max-w-[1200px] scroll-mt-10 px-5 py-20 sm:px-8 lg:py-24"
      >
        <div className="aurora-divider absolute inset-x-8 top-0" aria-hidden="true" />
        <div data-aos="fade-up" className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">MENOS PESTAÑAS. MÁS CLARIDAD.</p>
          <h2 className="section-heading mt-4">
            Todo lo esencial.
            <br />
            Justo donde lo necesitas.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Una forma tranquila de llevar el ritmo de tu negocio, desde la primera cita hasta la
            próxima visita.
          </p>
        </div>
        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ Icon, title, text }) => (
            <article key={title} data-aos="fade-up" className="px-1">
              <Icon size={26} strokeWidth={1.5} className="mb-5 text-primary" />
              <h3 className="text-xl leading-7 font-medium text-slate-800">{title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        id="como-funciona"
        className="mx-auto max-w-[1200px] scroll-mt-10 px-5 py-20 sm:px-8 lg:py-24"
      >
        <div data-aos="fade-up" className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">UN COMIENZO SENCILLO</p>
          <h2 className="section-heading mt-4">
            Del primer clic
            <br />a tu próxima cita.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Empieza con lo que ya conoces. Nosotros ponemos el espacio para organizarlo.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
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
          ].map(({ number, title, text }) => (
            <article key={number} data-aos="fade-up" className="rim-card rounded-2xl p-7 sm:p-8">
              <span className="text-sm text-primary">{number} /</span>
              <h3 className="mt-6 text-xl font-medium text-slate-800">{title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <PricingSection />
      <section className="px-5 py-24 text-center sm:px-8">
        <div
          data-aos="fade-up"
          className="relative mx-auto max-w-[1000px] overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/30 px-6 py-16"
        >
          <div aria-hidden="true" className="aurora-divider absolute inset-x-0 top-0" />
          <Sparkles size={25} strokeWidth={1.5} className="mx-auto text-primary" />
          <h2 className="section-heading mt-6">Haz espacio para lo que viene.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Empieza con una agenda más simple. Tu negocio y tu tiempo lo van a agradecer.
          </p>
          <Button asChild className="mt-8 h-12 px-6 text-base">
            <Link href="/register">
              Crear mi espacio gratis
              <ArrowUpRight size={17} />
            </Link>
          </Button>
        </div>
      </section>
      <footer className="border-t border-slate-100 px-5 py-9 sm:px-8">
        <div className="mx-auto flex max-w-[1136px] flex-col items-center justify-between gap-6 sm:flex-row">
          <Brand />
          <p className="text-base text-slate-500">Menos pendientes. Más posibilidades.</p>
          <div className="flex gap-6 text-sm text-slate-600">
            <a href="#precios" className="hover:text-primary">
              Precios
            </a>
            <Link href="/login" className="hover:text-primary">
              Iniciar sesión
              <ArrowUpRight size={13} className="ml-1 inline" />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
