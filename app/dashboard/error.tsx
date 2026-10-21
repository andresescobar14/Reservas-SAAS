"use client";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="flex min-h-96 flex-col items-center justify-center text-center">
      <TriangleAlert className="text-amber-500" size={32} />
      <h2 className="mt-5 text-xl font-medium">No pudimos cargar tu espacio.</h2>
      <p className="mt-3 max-w-md text-base leading-6 text-slate-500">
        Comprueba la conexión y la configuración de Supabase. Si acabas de crear el proyecto,
        ejecuta primero el esquema SQL.
      </p>
      <Button onClick={reset} className="mt-6">
        Intentar de nuevo
      </Button>
    </div>
  );
}
