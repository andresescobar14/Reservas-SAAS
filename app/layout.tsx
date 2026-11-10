import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/lib/brand";
import "@fontsource-variable/inter";
import "./globals.css";

const themeScript = `(function(){try{var t=localStorage.getItem("reserva-theme");var d=t!=="light";var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("light",!d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export const metadata: Metadata = {
  applicationName: brand.name,
  title: { default: `${brand.name} · Tu agenda en orden`, template: `%s | ${brand.name}` },
  description:
    "Un espacio para las reservas y los clientes de tu negocio. Organiza tu agenda y prepara tus recordatorios por WhatsApp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className="light h-full antialiased"
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
