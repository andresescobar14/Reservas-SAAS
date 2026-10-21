import type { Metadata } from "next";
import { WhatsAppWorkspace } from "@/components/dashboard/whatsapp-workspace";
import { requireActiveCompany } from "@/lib/tenant";
export const metadata: Metadata = { title: "WhatsApp" };
export default async function WhatsAppPage() {
  const { company } = await requireActiveCompany();
  const engineUrl =
    process.env.NEXT_PUBLIC_WHATSAPP_ENGINE_URL?.replace(/\/$/, "") ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");
  return (
    <WhatsAppWorkspace companyId={company.id} companyName={company.name} engineUrl={engineUrl} />
  );
}
