import {
  CalendarDays,
  CheckCheck,
  Clock3,
  Code2,
  Link2,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WhatsAppWorkspace() {
  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">MÁS CERCA, SIN MÁS PENDIENTES</p>
        <h1 className="mt-2 text-[32px] font-medium tracking-tight">Tu WhatsApp, conectado</h1>
        <p className="mt-2 text-base text-slate-500">
          Prepara el número de tu negocio para acompañar cada reserva.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-slate-200 shadow-none">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Conexión del negocio</CardTitle>
              <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] text-slate-500">
                <span className="size-1.5 rounded-full bg-slate-400" />
                Desconectado
              </span>
            </div>
            <CardDescription>Usa el número con el que tus clientes ya te conocen.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center px-6 py-12 text-center">
            <div className="flex size-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
              <QrCode size={56} className="text-slate-300" strokeWidth={1.4} />
            </div>
            <h2 className="mt-6 text-2xl font-medium">El primer paso es conectar tu servicio</h2>
            <p className="mt-3 max-w-sm text-base leading-6 text-slate-500">
              El código QR aparecerá aquí cuando esté configurado el servicio de WhatsApp. Todavía
              no hay una sesión vinculada.
            </p>
            <span className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Servicio de mensajería pendiente de configurar
            </span>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 size={17} className="text-emerald-600" />
                Un recordatorio, a tiempo
              </CardTitle>
              <CardDescription>Vista previa del mensaje · no se ha enviado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl bg-emerald-50 p-5">
                <div className="rounded-lg rounded-tl-none bg-white p-4 shadow-sm">
                  <p className="text-sm leading-6 text-slate-600">
                    ¡Hola, Ana! 👋
                    <br />
                    Te recordamos tu cita de mañana a las <strong>10:00</strong>.<br />
                    Te esperamos en tu negocio de siempre.
                  </p>
                  <p className="mt-2 flex justify-end text-emerald-500">
                    <CheckCheck size={14} />
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-5 text-slate-400">
                El envío se programa 24 horas antes. Solo se enviará con una conexión activa y un
                servicio de recordatorios en funcionamiento.
              </p>
            </CardContent>
          </Card>
          <div className="space-y-4 px-2">
            {[
              { icon: Smartphone, text: "Tu número, tu relación con el cliente" },
              { icon: ShieldCheck, text: "Una sesión independiente por empresa" },
              { icon: MessageCircle, text: "Recordatorios vinculados a cada reserva" },
            ].map(({ icon: Icon, text }) => (
              <p key={text} className="flex items-center gap-3 text-sm text-slate-500">
                <Icon size={16} className="text-emerald-600" />
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function IntegrationsWorkspace() {
  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">UN ESPACIO, MÁS POSIBILIDADES</p>
        <h1 className="mt-2 text-[32px] font-medium tracking-tight">
          Conecta tu forma de trabajar
        </h1>
        <p className="mt-2 text-base text-slate-500">
          Aquí vivirán las conexiones con las herramientas de tu negocio.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[
          {
            icon: CalendarDays,
            title: "Google Calendar",
            description: "Tus citas, también en tu calendario de siempre.",
            text: "La conexión permitirá sincronizar reservas en ambas direcciones. Requiere configurar la autorización de Google y el servicio de sincronización.",
            tag: "OAuth pendiente de configurar",
            color: "bg-emerald-50 text-primary",
          },
          {
            icon: Code2,
            title: "API y webhooks",
            description: "Un puente entre Reserva y tus herramientas.",
            text: "Los eventos de reservas podrán conectarse con tus automatizaciones. La URL y la clave de acceso estarán disponibles al implementar el servicio de webhooks.",
            tag: "Endpoint pendiente de implementar",
            color: "bg-emerald-50 text-primary",
          },
        ].map(({ icon: Icon, title, description, text, tag, color }) => (
          <Card key={title} className="border-slate-200 p-2 shadow-none">
            <CardHeader>
              <span className={`mb-4 flex size-12 items-center justify-center rounded-xl ${color}`}>
                <Icon size={23} />
              </span>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-7 text-slate-500">{text}</p>
              <div className="mt-6 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                <Link2 size={14} />
                {tag}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
