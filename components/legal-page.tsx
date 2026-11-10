import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { serviceContact, type LegalSection } from "@/lib/legal";

export function LegalPage({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-7">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base text-primary hover:underline"
        >
          <ArrowLeft size={17} aria-hidden="true" /> Volver al inicio
        </Link>
        <p className="mt-10 text-sm text-muted-foreground">
          Actualización: {serviceContact.updated}
        </p>
        <h1 className="mt-3 text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{description}</p>
        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="border-t border-border pt-8">
              <h2 className="text-2xl leading-8 font-medium sm:text-3xl">{section.title}</h2>
              <div className="mt-5 space-y-4 text-lg leading-8 text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <a
          href={`mailto:${serviceContact.email}`}
          className="mt-12 inline-flex max-w-full items-start gap-3 rounded-2xl border border-border p-5 text-base text-primary hover:underline sm:text-lg"
        >
          <Mail size={22} aria-hidden="true" className="mt-1 shrink-0" />
          <span className="break-all">{serviceContact.email}</span>
        </a>
      </main>
      <footer className="border-t border-border px-6 py-8">
        <nav
          aria-label="Información de privacidad"
          className="mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-3 text-base text-muted-foreground"
        >
          <Link href="/privacidad" className="hover:text-primary">
            Privacidad
          </Link>
          <Link href="/eliminacion-de-datos" className="hover:text-primary">
            Eliminación de datos
          </Link>
        </nav>
      </footer>
    </div>
  );
}
