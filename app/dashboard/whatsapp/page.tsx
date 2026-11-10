import type { Metadata } from "next";
import { WhatsAppCloudWorkspace } from "@/components/dashboard/whatsapp-cloud-workspace";
import { requireCompany } from "@/lib/tenant";
import { hasActiveSubscription } from "@/lib/subscription";
export const metadata: Metadata = { title: "WhatsApp" };
export default async function WhatsAppPage() {
  const { company } = await requireCompany();
  const apiUrl = process.env.WHATSAPP_CLOUD_API_URL?.replace(/\/$/, "") || "";
  return (
    <WhatsAppCloudWorkspace
      companyId={company.id}
      companyName={company.name}
      apiUrl={apiUrl}
      subscriptionActive={hasActiveSubscription(company)}
    />
  );
}
