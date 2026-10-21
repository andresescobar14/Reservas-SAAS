"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  MailCheck,
} from "lucide-react";
import { authenticate } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const list = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

function Field({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div variants={item} className="group space-y-2">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400 transition-colors group-focus-within:text-primary">
          {icon}
        </span>
        {children}
      </div>
    </motion.div>
  );
}

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
        <motion.div
          role="status"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl bg-emerald-50 p-6 text-emerald-900"
        >
          <MailCheck className="mb-3" />
          <p>{success}</p>
          <Link className="mt-5 inline-block text-sm font-medium underline" href="/login">
            Volver al inicio de sesión
          </Link>
        </motion.div>
      ) : (
        <motion.form
          variants={list}
          initial="hidden"
          animate="visible"
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
            <Field id="company_name" label="Nombre del negocio" icon={<Building2 size={17} />}>
              <Input
                id="company_name"
                name="company_name"
                placeholder="Tu negocio"
                autoComplete="organization"
                minLength={2}
                maxLength={100}
                required
                className="h-11 pl-11"
              />
            </Field>
          )}
          <Field id="email" label="Correo electrónico" icon={<Mail size={17} />}>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="hola@tunegocio.com"
              autoComplete="email"
              maxLength={254}
              required
              className="h-11 pl-11"
            />
          </Field>
          <Field id="password" label="Contraseña" icon={<Lock size={17} />}>
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={register ? "Al menos 8 caracteres" : "Tu contraseña"}
              autoComplete={register ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
              className="h-11 pr-12 pl-11"
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-primary"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </Field>
          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, height: 0, x: 0 }}
                animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
                className="overflow-hidden rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                <p>{error}</p>
                {errorCode && <p className="mt-2 text-sm">Referencia para soporte: {errorCode}</p>}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div variants={item}>
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
          </motion.div>
          {register && (
            <motion.p
              variants={item}
              className="text-center text-sm leading-relaxed text-slate-500"
            >
              Tu prueba de 14 días comienza al crear la cuenta.
              <br />
              Podrás verificar tu correo después desde Mi cuenta.
            </motion.p>
          )}
        </motion.form>
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
