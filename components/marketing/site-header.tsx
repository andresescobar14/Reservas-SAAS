"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const links = [
  { id: "funcionalidades", label: "Producto" },
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "precios", label: "Precios" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const { id } of links) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 mx-auto max-w-[1200px] px-5 pt-4 sm:px-8 sm:pt-5">
      <motion.nav
        aria-label="Navegación principal"
        data-scrolled={scrolled}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="site-nav"
      >
        <div
          className={`flex items-center justify-between gap-4 px-5 transition-[min-height] duration-300 sm:px-6 ${
            scrolled ? "min-h-14" : "min-h-16"
          }`}
        >
          <Brand />
          <div className="hidden items-center gap-1 text-sm text-slate-600 lg:flex">
            {links.map(({ id, label }) => (
              <Link
                key={id}
                href={`/#${id}`}
                className="relative rounded-full px-4 py-2 transition-colors hover:text-primary"
              >
                {active === id && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-emerald-50"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className={`relative ${active === id ? "text-emerald-800" : ""}`}>
                  {label}
                </span>
              </Link>
            ))}
            <Link
              href="/demo"
              className="relative rounded-full px-4 py-2 transition-colors hover:text-primary"
            >
              Demo
            </Link>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="hidden text-sm text-slate-600 transition-colors hover:text-primary sm:block"
            >
              Iniciar sesión
            </Link>
            <Button asChild className="h-10 px-4">
              <Link href="/register">
                Empezar gratis
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-6 border-t border-emerald-900/5 px-5 py-3 text-sm text-slate-600 lg:hidden">
          <Link href="/#funcionalidades" className="hover:text-primary">
            Producto
          </Link>
          <Link href="/#precios" className="hover:text-primary">
            Precios
          </Link>
          <Link href="/demo" className="hover:text-primary">
            Demo
          </Link>
          <Link href="/login" className="hover:text-primary sm:hidden">
            Acceder
          </Link>
        </div>
      </motion.nav>
    </header>
  );
}
