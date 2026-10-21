import Link from "next/link";
import { Check, CreditCard, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requireCompany } from "@/lib/tenant";
import { hasActiveSubscription, trialDaysRemaining } from "@/lib/subscription";
import { signOut } from "@/app/actions/auth";
import { pricing } from "@/lib/pricing";

export default async function SubscriptionPage() {
  const { company } = await requireCompany();
  const active = hasActiveSubscription(company);
  const checkout = process.env.BILLING_CHECKOUT_URL;
  const validCheckout =
    checkout && URL.canParse(checkout) && new URL(checkout).protocol === "https:" ? checkout : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <Brand />
      <span className="mt-12 flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        {active ? <CreditCard size={27} /> : <LockKeyhole size={27} />}
      </span>
      <h1 className="mt-7 text-3xl font-medium tracking-tight">
        {active ? "Tu espacio sigue creciendo." : "Sigamos haciendo espacio."}
      </h1>
      <p className="mt-4 text-base leading-7 text-slate-500">
        {active
          ? company.subscription_status === "trial"
            ? `A ${company.name} le quedan ${trialDaysRemaining(company.trial_ends_at)} días de prueba.`
            : `${company.name} tiene una suscripción activa.`
          : "Tu prueba ha terminado o tu suscripción requiere atención. Activa tu plan para volver a gestionar tus reservas."}
      </p>
      <div className="pricing-glow mt-7 w-full rounded-2xl px-6 py-7">
        <div className="relative z-10">
          <h2 className="text-xl font-medium">Reserva Pro</h2>
          <p className="mt-3 text-4xl font-medium text-slate-900">
            ${pricing.monthlyAmount}
            <span className="ml-2 text-base font-normal text-slate-600">
              {pricing.currency} / {pricing.period}
            </span>
          </p>
          <p className="mt-3 text-base leading-7 text-slate-600">
            {pricing.trialDays} días gratis para empezar. Una agenda más simple para tu negocio.
          </p>
        </div>
      </div>
      <div className="mt-7 w-full space-y-3 rounded-xl border border-slate-200 p-6 text-left">
        {[
          "Calendario y reservas de tu negocio",
          "Directorio e historial de clientes",
          "Tus datos permanecen en tu espacio",
        ].map((text) => (
          <p key={text} className="flex items-center gap-3 text-base text-slate-600">
            <Check size={16} className="text-emerald-600" />
            {text}
          </p>
        ))}
      </div>
      {validCheckout ? (
        <Button asChild className="mt-7 h-11 w-full">
          <a href={validCheckout}>Continuar al pago</a>
        </Button>
      ) : (
        <p className="mt-7 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          La pantalla de suscripción está preparada. El proveedor de pagos aún no está configurado.
        </p>
      )}
      {active && (
        <Link href="/dashboard/calendario" className="mt-6 text-sm font-medium text-emerald-700">
          Volver a mi agenda
        </Link>
      )}
      <form action={signOut}>
        <Button variant="link" className="mt-5 text-xs text-slate-400">
          Cerrar sesión
        </Button>
      </form>
    </main>
  );
}
