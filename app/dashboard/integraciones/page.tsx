import type { Metadata } from "next";
import { IntegrationsWorkspace } from "@/components/dashboard/integrations-workspace";
import { requireActiveCompany } from "@/lib/tenant";
export const metadata: Metadata = { title: "Integraciones" };
export default async function IntegrationsPage() {
  await requireActiveCompany();
  return <IntegrationsWorkspace />;
}
