import type { Metadata } from "next";
import { DemoWorkspace } from "@/components/dashboard/demo-workspace";
import { createDemoData } from "@/lib/demo-data";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Explora la demo",
  robots: { index: false, follow: false },
};
export default function DemoPage() {
  return <DemoWorkspace {...createDemoData()} />;
}
