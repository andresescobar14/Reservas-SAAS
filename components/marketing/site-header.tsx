import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="relative z-20 mx-auto max-w-[1200px] px-5 pt-6 sm:px-8">
      <nav aria-label="Navegación principal" className="site-nav">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5 sm:px-6">
          <Brand />
          <div className="hidden items-center gap-7 text-sm text-slate-600 lg:flex">
            <Link href="/#funcionalidades" className="transition-colors hover:text-primary">
              Producto
            </Link>
            <Link href="/#como-funciona" className="transition-colors hover:text-primary">
              Cómo funciona
            </Link>
            <Link href="/#precios" className="transition-colors hover:text-primary">
              Precios
            </Link>
            <Link href="/demo" className="transition-colors hover:text-primary">
              Demo
            </Link>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="hidden text-sm text-slate-600 hover:text-primary sm:block"
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
      </nav>
    </header>
  );
}
