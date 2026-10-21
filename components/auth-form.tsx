"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, LoaderCircle, MailCheck, Eye, EyeOff } from "lucide-react";
import { authenticate } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({
  mode,
  configured,
}: {
  mode: "login" | "register";
  configured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const register = mode === "register";

  return (
    <div>
      {!configured && (
        <div
          role="status"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"
        >
          Configura las variables de Supabase en <code>.env.local</code> y ejecuta el esquema SQL
          para activar las cuentas. Mientras tanto, puedes{" "}
          <Link href="/demo" className="font-medium underline">
            explorar la demo
          </Link>
          .
        </div>
      )}
      {success ? (
        <div role="status" className="rounded-xl bg-emerald-50 p-6 text-emerald-900">
          <MailCheck className="mb-3" />
          <p>{success}</p>
          <Link className="mt-5 inline-block text-sm font-medium underline" href="/login">
            Volver al inicio de sesión
          </Link>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setError("");
            setErrorCode("");
            formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
            startTransition(async () => {
              try {
                const result = await authenticate(mode, formData);
                if (result.error) {
                  setError(result.error);
                  setErrorCode(result.errorCode || "");
                }
                if (result.success) setSuccess(result.success);
              } catch (cause) {
                if (cause instanceof Error && cause.message.includes("NEXT_REDIRECT")) throw cause;
                setError("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
              }
            });
          }}
        >
          {register && (
            <div className="space-y-2">
              <label htmlFor="company_name" className="field-label">
                Nombre del negocio
              </label>
              <Input
                id="company_name"
                name="company_name"
                placeholder="Tu negocio"
                autoComplete="organization"
                minLength={2}
                maxLength={100}
                required
                className="h-11"
              />
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="email" className="field-label">
              Correo electrónico
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="hola@tunegocio.com"
              autoComplete="email"
              maxLength={254}
              required
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="field-label">
              Contraseña
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder={register ? "Al menos 8 caracteres" : "Tu contraseña"}
                autoComplete={register ? "new-password" : "current-password"}
                minLength={8}
                maxLength={128}
                required
                className="h-11 pr-12"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p>
              {errorCode && <p className="mt-2 text-sm">Referencia para soporte: {errorCode}</p>}
            </div>
          )}
          <Button type="submit" disabled={pending || !configured} className="h-11 w-full">
            {pending ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <>
                {register ? "Crear mi cuenta" : "Entrar a mi espacio"}
                <ArrowRight size={16} />
              </>
            )}
          </Button>
          {register && (
            <p className="text-center text-sm leading-relaxed text-slate-500">
              Tu prueba de 14 días comienza al crear la cuenta.
              <br />
              Podrás verificar tu correo después desde Mi cuenta.
            </p>
          )}
        </form>
      )}
      <p className="mt-8 text-center text-base text-slate-500">
        {register ? "¿Ya tienes una cuenta?" : "¿Aún no tienes una cuenta?"}{" "}
        <Link
          className="font-medium text-emerald-800 hover:underline"
          href={register ? "/login" : "/register"}
        >
          {register ? "Inicia sesión" : "Comienza gratis"}
        </Link>
      </p>
    </div>
  );
}
