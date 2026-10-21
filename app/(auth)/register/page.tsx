import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Crear una cuenta" };
export default function RegisterPage() {
  return (
    <>
      <p className="eyebrow">EMPIEZA ALGO MÁS SIMPLE</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">Más tiempo para tu negocio.</h1>
      <p className="mt-3 mb-8 text-base leading-6 text-slate-500">
        Crea tu espacio y organiza tu primera reserva.
      </p>
      <AuthForm mode="register" configured={isSupabaseConfigured()} />
    </>
  );
}
