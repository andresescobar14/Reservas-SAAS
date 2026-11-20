export type InboxMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  sentAt: string;
  kind: "text" | "template" | "unsupported";
  delivery?:
    "simulated" | "received" | "sending" | "accepted" | "delivered" | "read" | "failed" | "unknown";
};

export type InboxConversation = {
  id: string;
  name: string;
  phone: string;
  unread: number;
  lastInboundAt: string | null;
  messages: InboxMessage[];
  appointment: {
    reservationId?: string;
    patientName?: string;
    startsAt: string;
    service: string;
    response: "confirmed" | "reschedule_requested" | "pending";
  } | null;
};

export type InboxFilter = "all" | "unread" | "closed";
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Only an inbound customer message opens the service window, never an outgoing template.
export function serviceWindow(lastInboundAt: string | null, now: number) {
  const inbound = lastInboundAt ? Date.parse(lastInboundAt) : Number.NaN;
  const remainingMs =
    Number.isFinite(inbound) && inbound <= now ? Math.max(0, inbound + WINDOW_MS - now) : 0;
  return { open: remainingMs > 0, remainingMs };
}

// List and thread requests can finish out of order. An older snapshot must not
// close a service window that was already renewed by a newer customer message.
export function latestInboundAt(previous: string | null, incoming: string | null) {
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  const incomingTime = incoming ? Date.parse(incoming) : Number.NaN;
  if (!Number.isFinite(previousTime)) return Number.isFinite(incomingTime) ? incoming : null;
  return Number.isFinite(incomingTime) && incomingTime > previousTime ? incoming : previous;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function filterConversations(
  conversations: InboxConversation[],
  query: string,
  filter: InboxFilter,
  now: number,
) {
  const text = normalize(query.trim());
  const phoneQuery = text.replace(/[\s()+-]/g, "");
  return conversations
    .filter((item) => {
      const matches =
        !text ||
        normalize(item.name).includes(text) ||
        (phoneQuery.length > 0 && item.phone.replace(/\D/g, "").includes(phoneQuery));
      return (
        matches &&
        (filter !== "unread" || item.unread > 0) &&
        (filter !== "closed" || !serviceWindow(item.lastInboundAt, now).open)
      );
    })
    .sort(
      (a, b) =>
        Date.parse(b.messages.at(-1)?.sentAt || "") - Date.parse(a.messages.at(-1)?.sentAt || ""),
    );
}

export function previewReply(
  conversation: InboxConversation,
  body: string,
  now: number,
): InboxConversation {
  const text = body.trim();
  if (!serviceWindow(conversation.lastInboundAt, now).open)
    throw new Error("La ventana de 24 horas está cerrada. Selecciona una plantilla aprobada.");
  if (!text || text.length > 4096) throw new Error("Escribe un mensaje de hasta 4096 caracteres.");
  return {
    ...conversation,
    unread: 0,
    messages: [
      ...conversation.messages,
      {
        id: `preview-${crypto.randomUUID()}`,
        direction: "outgoing",
        kind: "text",
        body: text,
        sentAt: new Date(now).toISOString(),
        delivery: "simulated",
      },
    ],
  };
}

export function createPreviewConversations(referenceTime: string): InboxConversation[] {
  const now = Date.parse(referenceTime);
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const appointment = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const message = (
    id: string,
    direction: InboxMessage["direction"],
    body: string,
    minutes: number,
    kind: InboxMessage["kind"] = "text",
  ): InboxMessage => ({
    id,
    direction,
    body,
    sentAt: ago(minutes),
    kind,
    ...(direction === "outgoing" ? { delivery: "read" as const } : {}),
  });
  return [
    {
      id: "preview-ana",
      name: "Ana Martínez",
      phone: "+52 55 0000 0101",
      unread: 2,
      lastInboundAt: ago(8),
      appointment: {
        startsAt: appointment(1),
        service: "Consulta de seguimiento",
        response: "confirmed",
      },
      messages: [
        message(
          "ana-1",
          "outgoing",
          "Hola Ana, tu cita quedó agendada para mañana. Puedes confirmar, solicitar un cambio o cancelar con los botones.",
          95,
          "template",
        ),
        message("ana-2", "incoming", "Confirmar", 52),
        message(
          "ana-3",
          "outgoing",
          "¡Gracias, Ana! Tenemos tu confirmación. Te esperamos mañana.",
          48,
        ),
        message("ana-4", "incoming", "¡Hola! Una pregunta sobre mi cita de mañana 😊", 9),
        message("ana-5", "incoming", "¿Podría llegar unos 15 minutos antes?", 8),
      ],
    },
    {
      id: "preview-luis",
      name: "Luis Herrera",
      phone: "+52 55 0000 0102",
      unread: 1,
      lastInboundAt: ago(24),
      appointment: {
        startsAt: appointment(2),
        service: "Corte de cabello",
        response: "reschedule_requested",
      },
      messages: [
        message(
          "luis-1",
          "outgoing",
          "Hola Luis, te recordamos tu próxima cita. Puedes confirmar o solicitar un cambio.",
          80,
          "template",
        ),
        message("luis-2", "incoming", "Cambiar cita", 27),
        message("luis-3", "incoming", "¿Tienen disponibilidad el viernes por la tarde?", 24),
      ],
    },
    {
      id: "preview-sofia",
      name: "Sofía Ramírez",
      phone: "+52 55 0000 0103",
      unread: 0,
      lastInboundAt: ago(150),
      appointment: {
        startsAt: appointment(3),
        service: "Sesión de bienestar",
        response: "confirmed",
      },
      messages: [
        message(
          "sofia-1",
          "outgoing",
          "Hola Sofía, ya tenemos tu reserva. Te enviaremos un recordatorio antes de tu visita.",
          190,
          "template",
        ),
        message("sofia-2", "incoming", "Perfecto, muchas gracias. ¡Nos vemos!", 150),
        message("sofia-3", "outgoing", "¡Con gusto, Sofía! Que tengas un bonito día.", 145),
      ],
    },
    {
      id: "preview-valeria",
      name: "Valeria Torres",
      phone: "+52 55 0000 0104",
      unread: 0,
      lastInboundAt: ago(49 * 60),
      appointment: { startsAt: appointment(1), service: "Servicio reservado", response: "pending" },
      messages: [
        message(
          "valeria-1",
          "incoming",
          "Hola, quisiera reservar un espacio para esta semana.",
          49 * 60 + 10,
        ),
        message(
          "valeria-2",
          "outgoing",
          "¡Hola, Valeria! Claro, ya tenemos tu reserva preparada.",
          49 * 60 + 5,
        ),
        message("valeria-3", "incoming", "Gracias, quedo pendiente del recordatorio.", 49 * 60),
      ],
    },
  ];
}
