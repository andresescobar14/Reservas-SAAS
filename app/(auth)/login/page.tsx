import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Iniciar sesión" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <p className="eyebrow">TU ESPACIO DE TRABAJO</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight">Qué bueno verte de nuevo.</h1>
      <p className="mt-3 mb-8 text-base leading-6 text-slate-500">
        Tu agenda y tus clientes te están esperando.
      </p>
      {error === "confirmation" && (
        <p role="alert" className="mb-5 text-base text-red-700">
          El enlace de confirmación expiró o no es válido. Solicita uno nuevo desde Supabase Auth.
        </p>
      )}
      <AuthForm mode="login" configured={isSupabaseConfigured()} />
    </>
  );
}
