"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-medium">Necesitamos intentarlo otra vez.</h1>
      <p className="mt-4 text-base leading-6 text-slate-500">
        No se pudo cargar la aplicación. Comprueba tu conexión y que Supabase tenga el esquema
        inicial instalado.
      </p>
      <Button className="mt-6" onClick={reset}>
        Volver a intentar
      </Button>
      <Link href="/" className="mt-5 text-sm text-emerald-700">
        Volver al inicio
      </Link>
    </main>
  );
}
