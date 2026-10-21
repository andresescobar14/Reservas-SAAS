import { DashboardShell } from "@/components/dashboard/shell";
import { requireActiveCompany } from "@/lib/tenant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { company } = await requireActiveCompany();
  return <DashboardShell company={company}>{children}</DashboardShell>;
}
