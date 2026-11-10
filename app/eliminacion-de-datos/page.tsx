import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { deletionSections } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description:
    "Cómo desconectar WhatsApp y solicitar la eliminación de datos en Reservas - Codesc.",
};

export default function DeletionPage() {
  return (
    <LegalPage
      title="Eliminación de datos"
      description="Puedes desconectar la integración y solicitar la eliminación de tus datos mediante el correo de soporte."
      sections={deletionSections}
    />
  );
}
