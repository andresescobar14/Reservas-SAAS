import { DashboardShell } from "@/components/dashboard/shell";
import { requireCompany } from "@/lib/tenant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Cada página de producto exige su plan; la configuración de conexión sigue accesible.
  const { company } = await requireCompany();
  return <DashboardShell company={company}>{children}</DashboardShell>;
}
