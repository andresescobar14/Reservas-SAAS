"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailVerificationResult } from "@/lib/types";

export function OptionalEmailVerification({
  email,
  available,
  initialVerifiedAt,
  demo = false,
  requestCodeAction,
  confirmCodeAction,
  onContinue,
}: {
  email: string;
  available: boolean;
  initialVerifiedAt: string | null;
  demo?: boolean;
  requestCodeAction: () => Promise<EmailVerificationResult>;
  confirmCodeAction: (data: FormData) => Promise<EmailVerificationResult>;
  onContinue?: () => void;
}) {
  const [verifiedAt, setVerifiedAt] = useState(initialVerifiedAt);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [requested, setRequested] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState<EmailVerificationResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<"request" | "confirm" | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((remaining) => Math.max(0, remaining - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  return (
    <Card className="border-slate-200 shadow-none">
      <CardHeader className="border-b border-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Mail size={21} />
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500">
            OPCIONAL
          </span>
        </div>
        <CardTitle className="text-lg">Verifica tu correo cuando quieras</CardTitle>
        <CardDescription className="leading-6">
          Tu cuenta y tu agenda ya están disponibles. Este paso solo comprueba que puedes recibir
          mensajes en tu correo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Correo de tu cuenta</p>
            <p className="mt-1 truncate text-base font-medium text-slate-700">{email}</p>
          </div>
          {verifiedAt && <ShieldCheck size={21} className="shrink-0 text-emerald-600" />}
        </div>
        {verifiedAt ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-900"
          >
            <p className="flex items-center gap-2 text-base font-medium">
              <Check size={17} />
              Verificado en este navegador
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-800/75">
              Comprobación válida durante 30 días para esta cuenta y este correo. Puedes seguir
              usando tu agenda.
            </p>
          </div>
        ) : (
          <>
            {!available && (
              <p
                role="status"
                className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-800"
              >
                {demo
                  ? "La demo no envía correos. En tu cuenta podrás solicitar y comprobar un código real."
                  : "La verificación opcional todavía no está configurada. Puedes seguir usando todas las funciones de tu cuenta."}
              </p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={!available || pending || cooldown > 0}
                className="h-10 w-full"
                onClick={() => {
                  setError(null);
                  setInfo("");
                  setOperation("request");
                  startTransition(async () => {
                    try {
                      const result = await requestCodeAction();
                      if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds);
                      if (result.error) {
                        setError(result);
                        return;
                      }
                      setRequested(true);
                      setInfo(result.success || "Revisa tu correo para encontrar el código.");
                    } catch {
                      setError({
                        error: "No se pudo solicitar el código. Tu cuenta sigue disponible.",
                      });
                    } finally {
                      setOperation(null);
                    }
                  });
                }}
              >
                {pending && operation === "request" ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Mail size={15} />
                )}
                {cooldown > 0
                  ? `Puedes reenviar en ${cooldown} s`
                  : requested
                    ? "Reenviar código"
                    : "Enviar código a mi correo"}
              </Button>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Lo enviaremos únicamente a la dirección de tu cuenta.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                setError(null);
                setInfo("");
                setOperation("confirm");
                startTransition(async () => {
                  try {
                    const result = await confirmCodeAction(formData);
                    if (result.error) {
                      setError(result);
                      return;
                    }
                    if (!result.verifiedAt) {
                      setError({
                        error: "No se pudo completar la comprobación. Inténtalo de nuevo.",
                      });
                      return;
                    }
                    setVerifiedAt(result.verifiedAt);
                    setCode("");
                    toast.success(result.success);
                  } catch {
                    setError({
                      error: "No se pudo comprobar el código. Tu cuenta sigue disponible.",
                    });
                  } finally {
                    setOperation(null);
                  }
                });
              }}
            >
              <label htmlFor="email-code" className="field-label">
                Código de 6 dígitos
              </label>
              <div className="flex gap-3">
                <Input
                  id="email-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  disabled={!available || pending}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className="h-11 text-center text-lg tracking-[.35em]"
                />
                <Button
                  type="submit"
                  className="h-11 px-4"
                  disabled={!available || pending || code.length !== 6}
                >
                  {pending && operation === "confirm" && (
                    <LoaderCircle size={15} className="animate-spin" />
                  )}
                  Comprobar
                </Button>
              </div>
            </form>
            {info && (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 p-3 text-sm leading-6 text-emerald-800"
              >
                {info}
              </p>
            )}
            {error?.error && (
              <div
                role="alert"
                className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900"
              >
                <p>{error.error}</p>
                <p className="mt-1">Puedes continuar usando la agenda sin verificar.</p>
                {error.errorCode && (
                  <p className="mt-1 text-xs">Referencia para soporte: {error.errorCode}</p>
                )}
              </div>
            )}
          </>
        )}
        <div className="border-t border-slate-100 pt-4">
          {onContinue ? (
            <Button type="button" variant="link" className="px-0" onClick={onContinue}>
              Continuar con mi agenda
            </Button>
          ) : (
            <Button asChild variant="link" className="px-0">
              <Link href="/dashboard/calendario">Continuar con mi agenda</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
