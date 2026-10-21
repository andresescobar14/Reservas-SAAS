import type { Metadata } from "next";
import { WhatsAppWorkspace } from "@/components/dashboard/integrations-workspace";
import { requireActiveCompany } from "@/lib/tenant";
export const metadata: Metadata = { title: "WhatsApp" };
export default async function WhatsAppPage() {
  await requireActiveCompany();
  return <WhatsAppWorkspace />;
}
