import { ShieldCheck, CalendarCheck2 } from "lucide-react";
import { OptionalEmailVerification } from "@/components/dashboard/optional-email-verification";
import type { EmailVerificationResult } from "@/lib/types";

export function AccountWorkspace({
  companyName,
  email,
  available,
  verifiedAt,
  demo = false,
  requestCodeAction,
  confirmCodeAction,
  onContinue,
}: {
  companyName: string;
  email: string;
  available: boolean;
  verifiedAt: string | null;
  demo?: boolean;
  requestCodeAction: () => Promise<EmailVerificationResult>;
  confirmCodeAction: (data: FormData) => Promise<EmailVerificationResult>;
  onContinue?: () => void;
}) {
  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">A TU RITMO</p>
        <h1 className="mt-2 text-[32px] font-medium tracking-tight">
          Tu cuenta, un poco más completa
        </h1>
        <p className="mt-2 text-base text-slate-500">
          Administra tu correo sin interrumpir el día a día de {companyName}.
        </p>
      </div>
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <OptionalEmailVerification
          email={email}
          available={available}
          initialVerifiedAt={verifiedAt}
          demo={demo}
          requestCodeAction={requestCodeAction}
          confirmCodeAction={confirmCodeAction}
          onContinue={onContinue}
        />
        <aside className="space-y-6 py-3">
          <div className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <CalendarCheck2 size={20} />
            </span>
            <div>
              <h2 className="text-xl font-medium">Tu agenda sigue su curso</h2>
              <p className="mt-2 text-base leading-7 text-slate-500">
                El código es un complemento. No se exige para registrarte, iniciar sesión, crear
                reservas ni consultar tus clientes.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="text-xl font-medium">La dirección correcta, comprobada</h2>
              <p className="mt-2 text-base leading-7 text-slate-500">
                Introduce el código que recibas para comprobar que tienes acceso a este correo. Si
                no llega, puedes volver más tarde.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
