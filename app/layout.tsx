import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Reserva · Tu agenda en orden", template: "%s | Reserva" },
  description:
    "Un espacio para las reservas y los clientes de tu negocio. Organiza tu agenda y prepara tus recordatorios por WhatsApp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="light h-full antialiased" style={{ colorScheme: "light" }}>
      <body className="min-h-full">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
