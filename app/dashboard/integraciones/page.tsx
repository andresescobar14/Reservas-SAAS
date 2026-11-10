import type { Metadata } from "next";
import { requireActiveCompany } from "@/lib/tenant";
import { AutomationPanel } from "@/components/dashboard/automation-panel";
import { brand } from "@/lib/brand";
export const metadata: Metadata = { title: "Integraciones" };
export default async function IntegrationsPage() {
  const { company } = await requireActiveCompany();
  const apiUrl = process.env.WHATSAPP_CLOUD_API_URL?.replace(/\/$/, "") || "";
  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">TU NEGOCIO, CONECTADO</p>
        <h1 className="mt-2 text-3xl font-medium">Automatización e integraciones</h1>
        <p className="mt-3 text-lg leading-8 text-slate-600">
          Gestiona tus mensajes y conecta tu agenda con {brand.name}.
        </p>
      </div>
      <AutomationPanel companyId={company.id} apiUrl={apiUrl} />
    </>
  );
}
