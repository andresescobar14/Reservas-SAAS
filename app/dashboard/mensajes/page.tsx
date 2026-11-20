import type { Metadata } from "next";
import { InboxWorkspace } from "@/components/dashboard/inbox-workspace";
import { requireActiveCompany } from "@/lib/tenant";

export const metadata: Metadata = { title: "Mensajes" };

export default async function MessagesPage() {
  const { company } = await requireActiveCompany();
  return (
    <InboxWorkspace
      companyName={company.name}
      companyId={company.id}
      apiUrl={process.env.WHATSAPP_CLOUD_API_URL?.replace(/\/$/, "") || ""}
      timezone={company.timezone}
      referenceTime={new Date().toISOString()}
    />
  );
}
