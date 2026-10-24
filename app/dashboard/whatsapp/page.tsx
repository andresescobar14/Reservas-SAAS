import type { Metadata } from "next";
import { WhatsAppCloudWorkspace } from "@/components/dashboard/whatsapp-cloud-workspace";
import { requireActiveCompany } from "@/lib/tenant";
export const metadata: Metadata = { title: "WhatsApp" };
export default async function WhatsAppPage() {
  const { company } = await requireActiveCompany();
  const apiUrl = process.env.WHATSAPP_CLOUD_API_URL?.replace(/\/$/, "") || "";
  return (
    <WhatsAppCloudWorkspace companyId={company.id} companyName={company.name} apiUrl={apiUrl} />
  );
}
