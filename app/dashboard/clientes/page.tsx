import type { Metadata } from "next";
import { CustomersWorkspace } from "@/components/dashboard/customers-workspace";
import { getWorkspaceData } from "@/lib/tenant";
import { saveCustomer } from "@/app/actions/workspace";
export const metadata: Metadata = { title: "Clientes" };
export default async function CustomersPage() {
  const data = await getWorkspaceData();
  return <CustomersWorkspace {...data} onSave={saveCustomer} />;
}
