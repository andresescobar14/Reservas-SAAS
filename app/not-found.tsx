import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Brand />
      <p className="mt-10 font-mono text-base text-emerald-700">404</p>
      <h1 className="mt-4 text-3xl font-medium tracking-tight">
        Esta página no está en la agenda.
      </h1>
      <p className="mt-3 text-base text-slate-500">Volvamos a un lugar conocido.</p>
      <Button asChild className="mt-7">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
