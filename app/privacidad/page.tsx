import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { privacySections } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Información sobre los datos, proveedores y controles de privacidad de Reservas - Codesc.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      description="Cómo se utilizan los datos en el servicio y cómo contactar al responsable para gestionar tus solicitudes."
      sections={privacySections}
    />
  );
}
