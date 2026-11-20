"use strict";
const crypto = require("node:crypto");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PHONE = /^[1-9][0-9]{6,14}$/;
const WINDOW = 86400000;

function extractChatEvents(body) {
  const events = [];
  if (body?.object !== "whatsapp_business_account") return events;
  for (const entry of Array.isArray(body.entry) ? body.entry : [])
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value,
        phoneId = v?.metadata?.phone_number_id;
      if (change?.field !== "messages" || !/^\d{5,30}$/.test(phoneId || "")) continue;
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        const stamp = Number(m?.timestamp),
          peer = m?.from || m?.from_user_id;
        if (
          typeof peer !== "string" ||
          peer.length > 160 ||
          !peer ||
          typeof m.id !== "string" ||
          !m.id.startsWith("wamid.") ||
          m.id.length > 512 ||
          !Number.isSafeInteger(stamp) ||
          stamp <= 0 ||
          stamp * 1000 > Date.now() + 300000
        )
          continue;
        const contact = (Array.isArray(v.contacts) ? v.contacts : []).find(
          (c) => c.wa_id === peer || c.user_id === peer,
        );
        const text =
          m.text?.body ||
          m.button?.text ||
          m.interactive?.button_reply?.title ||
          m.interactive?.list_reply?.title;
        const supported = typeof text === "string" && text.length > 0;
        events.push({
          phoneId,
          peer,
          phone: PHONE.test(m.from || "") ? m.from : null,
          name: String(contact?.profile?.name || "").slice(0, 120),
          messageId: m.id,
          sentAt: new Date(stamp * 1000).toISOString(),
          kind: supported ? "text" : "unsupported",
          body: supported
            ? text.slice(0, 4096)
            : `[Mensaje de tipo ${String(m.type || "desconocido")
                .replace(/[^a-z_]/g, "")
                .slice(0, 32)}: vista previa no disponible]`,
        });
      }
    }
  return events;
}

function createChatStore({
  pool,
  tx,
  config,
  encryptToken,
  decryptToken,
  HttpError,
  findCompany,
  validateCompany,
}) {
  const enc = (value) => encryptToken(JSON.stringify(value), config.encryptionKey);
  const dec = (value) => JSON.parse(decryptToken(value, config.encryptionKey));
  const error = (status, code, message) => {
    throw new HttpError(status, code, message);
  };
  const hash = (company, peer) =>
    crypto
      .createHmac("sha256", Buffer.from(config.encryptionKey, "hex"))
      .update(`${company}:${peer}`)
      .digest("hex");
  const publicMessage = (m) => ({
    id: m.id,
    direction: m.direction,
    kind: m.kind,
    body: dec(m.body_encrypted),
    sentAt: new Date(m.sent_at).toISOString(),
    delivery: m.delivery,
  });
  async function conversation(client, companyId, phoneId, peer, phone, name) {
    return (
      await client.query(
        `insert into whatsapp_cloud.chat_conversations(company_id,phone_id,peer_hash,peer_encrypted)
      values($1,$2,$3,$4) on conflict(company_id,phone_id,peer_hash) do update set
      peer_encrypted=case when $5 then excluded.peer_encrypted else chat_conversations.peer_encrypted end returning *`,
        [companyId, phoneId, hash(companyId, peer), enc({ phone, name, peer }), Boolean(name)],
      )
    ).rows[0];
  }
  async function thread(company, id, client = pool, lock = false) {
    const row = (
      await client.query(
        `select * from whatsapp_cloud.chat_conversations where company_id=$1 and id=$2 and phone_id=$3 ${lock ? "for update" : ""}`,
        [company.company_id, id, company.whatsapp_phone_id],
      )
    ).rows[0];
    if (!row) error(404, "CHAT_NOT_FOUND", "Conversación no encontrada.");
    return row;
  }
  const store = {
    async capture(events, receipts = []) {
      if (!events.length && !receipts.length) return;
      await tx(async (client) => {
        for (const event of events) {
          const company = (
            await client.query(
              "select company_id from whatsapp_cloud.companies where whatsapp_phone_id=$1",
              [event.phoneId],
            )
          ).rows[0];
          if (!company) continue;
          const c = await conversation(
            client,
            company.company_id,
            event.phoneId,
            event.peer,
            event.phone,
            event.name,
          );
          const inserted = await client.query(
            `insert into whatsapp_cloud.chat_messages(company_id,conversation_id,direction,kind,body_encrypted,meta_message_id,delivery,sent_at)
            values($1,$2,'incoming',$3,$4,$5,'received',$6) on conflict(company_id,meta_message_id) do nothing returning id`,
            [company.company_id, c.id, event.kind, enc(event.body), event.messageId, event.sentAt],
          );
          if (inserted.rowCount)
            await client.query(
              `update whatsapp_cloud.chat_conversations set last_inbound_at=greatest(last_inbound_at,$3::timestamptz),updated_at=greatest(updated_at,$3::timestamptz) where company_id=$1 and id=$2`,
              [company.company_id, c.id, event.sentAt],
            );
        }
        for (const receipt of receipts)
          await client.query(
            `update whatsapp_cloud.chat_messages m set delivery=$4,delivery_at=to_timestamp($5)
          from whatsapp_cloud.chat_conversations c where c.company_id=m.company_id and c.id=m.conversation_id and c.phone_id=$1 and m.meta_message_id=$2 and m.direction='outgoing'
          and (m.delivery_at is null or m.delivery_at<=to_timestamp($5))
          and (($4='failed' and m.delivery not in('delivered','read')) or ($4<>'failed' and (case m.delivery when 'read' then 3 when 'delivered' then 2 when 'accepted' then 1 else 0 end)<= $3))`,
            [
              receipt.phoneId,
              receipt.messageId,
              { sent: 1, delivered: 2, read: 3, failed: 0 }[receipt.status],
              receipt.status === "sent" ? "accepted" : receipt.status,
              receipt.timestamp,
            ],
          );
      });
    },
    async list(company, before) {
      const boundary = before
        ? (
            await pool.query(
              "select updated_at,id from whatsapp_cloud.chat_conversations where company_id=$1 and phone_id=$2 and id=$3",
              [company.company_id, company.whatsapp_phone_id, before],
            )
          ).rows[0]
        : null;
      if (before && !boundary)
        error(400, "INVALID_CURSOR", "El cursor no pertenece a esta empresa.");
      const rows = (
        await pool.query(
          `select c.*,m.id as message_id,m.body_encrypted,m.direction,m.kind,m.delivery,m.sent_at,
        (select count(*)::int from whatsapp_cloud.chat_messages u where u.company_id=c.company_id and u.conversation_id=c.id and u.direction='incoming' and u.created_at>c.last_read_at) as unread
        from whatsapp_cloud.chat_conversations c
        join lateral(select * from whatsapp_cloud.chat_messages where company_id=c.company_id and conversation_id=c.id order by sent_at desc,id desc limit 1)m on true
        where c.company_id=$1 and c.phone_id=$2 and($3::timestamptz is null or (c.updated_at,c.id)<($3::timestamptz,$4::uuid)) order by c.updated_at desc,c.id desc limit 51`,
          [
            company.company_id,
            company.whatsapp_phone_id,
            boundary?.updated_at || null,
            boundary?.id || null,
          ],
        )
      ).rows;
      const visible = rows.slice(0, 50);
      return {
        hasMore: rows.length > 50,
        nextCursor: rows.length > 50 ? visible.at(-1).id : null,
        conversations: visible.map((c) => {
          const peer = dec(c.peer_encrypted);
          return {
            id: c.id,
            name: peer.name || peer.phone || "Contacto de WhatsApp",
            phone: peer.phone ? `+${peer.phone}` : "Número no compartido",
            unread: c.unread,
            lastInboundAt: c.last_inbound_at ? new Date(c.last_inbound_at).toISOString() : null,
            appointment: null,
            messages: [publicMessage({ ...c, id: c.message_id })],
          };
        }),
      };
    },
    async messages(company, id, before) {
      const c = await thread(company, id);
      const boundary = before
        ? (
            await pool.query(
              "select sent_at,id from whatsapp_cloud.chat_messages where company_id=$1 and conversation_id=$2 and id=$3",
              [company.company_id, id, before],
            )
          ).rows[0]
        : null;
      if (before && !boundary)
        error(400, "INVALID_CURSOR", "El cursor no pertenece a esta conversación.");
      const rows = (
        await pool.query(
          `select * from whatsapp_cloud.chat_messages where company_id=$1 and conversation_id=$2
        and ($3::timestamptz is null or (sent_at,id)<($3::timestamptz,$4::uuid)) order by sent_at desc,id desc limit 51`,
          [company.company_id, id, boundary?.sent_at || null, boundary?.id || null],
        )
      ).rows;
      const hasMore = rows.length > 50,
        visible = rows.slice(0, 50).reverse();
      const peer = dec(c.peer_encrypted);
      const appointment = peer.phone
        ? (
            await pool.query(
              `select r.id,r.starts_at,r.status,r.customer_response,p.full_name from public.reservations r join public.customers p on p.company_id=r.company_id and p.id=r.customer_id
        where r.company_id=$1 and p.phone in($2,$3) and r.starts_at>=now() and r.status='confirmed' order by r.starts_at limit 1`,
              [company.company_id, peer.phone, "+" + peer.phone],
            )
          ).rows[0]
        : null;
      return {
        messages: visible.map(publicMessage),
        hasMore,
        nextCursor: hasMore ? visible[0].id : null,
        lastInboundAt: c.last_inbound_at ? new Date(c.last_inbound_at).toISOString() : null,
        appointment: appointment
          ? {
              reservationId: appointment.id,
              patientName: appointment.full_name,
              startsAt: new Date(appointment.starts_at).toISOString(),
              service: "Reserva agendada",
              response: appointment.customer_response || "pending",
            }
          : null,
      };
    },
    async markRead(company, id, messageId) {
      await thread(company, id);
      await pool.query(
        `update whatsapp_cloud.chat_conversations c set last_read_at=greatest(c.last_read_at,m.created_at) from whatsapp_cloud.chat_messages m
        where c.company_id=$1 and c.id=$2 and m.company_id=c.company_id and m.conversation_id=c.id and m.id=$3`,
        [company.company_id, id, messageId],
      );
    },
    async reserveReply(companyId, ownerId, id, text, key) {
      return tx(async (client) => {
        const company = await findCompany(
          { company_id: companyId, owner_id: ownerId },
          client,
          true,
        );
        validateCompany(company);
        if (
          !company.whatsapp_token_oficial ||
          company.connection_state !== "CONNECTED" ||
          (company.token_expires_at && Date.parse(company.token_expires_at) <= Date.now())
        )
          error(403, "NUMBER_DISCONNECTED", "Revisa la conexión y la credencial de WhatsApp.");
        const c = await thread(company, id, client, true),
          peer = dec(c.peer_encrypted);
        const fingerprint = crypto
          .createHash("sha256")
          .update(JSON.stringify([id, text]))
          .digest("hex");
        const prior = (
          await client.query(
            "select * from whatsapp_cloud.chat_messages where company_id=$1 and idempotency_key=$2",
            [companyId, key],
          )
        ).rows[0];
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            error(409, "IDEMPOTENCY_CONFLICT", "La clave ya pertenece a otro mensaje.");
          return { replayed: true, message: publicMessage(prior) };
        }
        const pending = (
          await client.query(
            "select id from whatsapp_cloud.chat_messages where company_id=$1 and conversation_id=$2 and direction='outgoing' and delivery in('sending','unknown') limit 1",
            [companyId, id],
          )
        ).rows[0];
        if (pending)
          error(
            409,
            "SEND_PENDING_REVIEW",
            "Hay un envío en curso o de resultado incierto en este chat. Revisa su estado antes de enviar otro.",
          );
        if (!peer.phone)
          error(
            403,
            "PHONE_UNAVAILABLE",
            "Meta no compartió un número compatible para responder desde esta conexión.",
          );
        if (
          !c.last_inbound_at ||
          Date.parse(c.last_inbound_at) + WINDOW <= Date.now() ||
          Date.parse(c.last_inbound_at) > Date.now() + 300000
        )
          error(
            403,
            "WINDOW_CLOSED",
            "La ventana de 24 horas está cerrada. Usa una plantilla aprobada.",
          );
        const recent = (
          await client.query(
            "select id from whatsapp_cloud.chat_messages where company_id=$1 and direction='outgoing' and created_at>now()-interval '1 second' limit 1",
            [companyId],
          )
        ).rows[0];
        if (recent) error(429, "SLOW_DOWN", "Espera un segundo antes de enviar otro mensaje.");
        const row = (
          await client.query(
            `insert into whatsapp_cloud.chat_messages(company_id,conversation_id,direction,kind,body_encrypted,idempotency_key,fingerprint,delivery,sent_at)
          values($1,$2,'outgoing','text',$3,$4,$5,'sending',now()) returning *`,
            [companyId, id, enc(text), key, fingerprint],
          )
        ).rows[0];
        await client.query(
          "update whatsapp_cloud.chat_conversations set updated_at=now() where company_id=$1 and id=$2",
          [companyId, id],
        );
        return { row, company, phone: peer.phone };
      });
    },
    async finishReply(id, companyId, delivery, messageId = null) {
      let row = (
        await pool.query(
          "update whatsapp_cloud.chat_messages set delivery=$3,meta_message_id=$4 where id=$1 and company_id=$2 returning *",
          [id, companyId, delivery, messageId],
        )
      ).rows[0];
      if (messageId) {
        const early = (
          await pool.query(
            `select i.event from whatsapp_cloud.inbox i join whatsapp_cloud.chat_conversations c on c.company_id=$1 and c.id=$2
          where i.event->>'kind'='delivery' and i.event->>'messageId'=$3 and i.event->>'phoneId'=c.phone_id order by (i.event->>'timestamp')::bigint limit 20`,
            [companyId, row.conversation_id, messageId],
          )
        ).rows;
        if (early.length) {
          await store.capture(
            [],
            early.map((r) => r.event),
          );
          row = (
            await pool.query(
              "select * from whatsapp_cloud.chat_messages where company_id=$1 and id=$2",
              [companyId, id],
            )
          ).rows[0];
        }
      }
      return publicMessage(row);
    },
    async recordTemplate(company, input, messageId) {
      await tx(async (client) => {
        const c = await conversation(
          client,
          company.company_id,
          company.whatsapp_phone_id,
          input.phone,
          input.phone,
          input.patientName,
        );
        const body =
          input.notificationKind === "confirmation"
            ? `Hola ${input.patientName}, tu cita quedó agendada para el ${input.date} a las ${input.time}. Puedes confirmar, solicitar un cambio o cancelar con los botones.`
            : `Hola ${input.patientName}, te recordamos tu cita del ${input.date} a las ${input.time}. Puedes confirmar, solicitar un cambio o cancelar con los botones.`;
        await client.query(
          `insert into whatsapp_cloud.chat_messages(company_id,conversation_id,direction,kind,body_encrypted,meta_message_id,delivery,sent_at)
          values($1,$2,'outgoing','template',$3,$4,'accepted',now()) on conflict(company_id,meta_message_id) do nothing`,
          [company.company_id, c.id, enc(body), messageId],
        );
        await client.query(
          "update whatsapp_cloud.chat_conversations set updated_at=now() where company_id=$1 and id=$2",
          [company.company_id, c.id],
        );
      });
    },
  };
  return store;
}

function installChatRoutes(
  app,
  { db, config, http, authenticate, HttpError, logger, decryptToken },
) {
  if (!db.chat) return;
  const wrap = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (e) {
      next(e);
    }
  };
  async function authorize(req) {
    const ownerId = await authenticate(req.get("Authorization")),
      companyId = req.params.companyId;
    if (!UUID.test(companyId)) throw new HttpError(400, "INVALID_COMPANY", "Empresa no válida.");
    if (!(await db.companies.isOwner({ company_id: companyId, owner_id: ownerId })))
      throw new HttpError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    const company = await db.companies.findOne({ company_id: companyId, owner_id: ownerId });
    if (!company)
      throw new HttpError(409, "SETUP_REQUIRED", "Conecta el número de tu empresa en WhatsApp.");
    return { ownerId, companyId, company };
  }
  function chatId(req) {
    if (!UUID.test(req.params.conversationId))
      throw new HttpError(400, "INVALID_CHAT", "Conversación no válida.");
    return req.params.conversationId;
  }
  app.get(
    "/api/whatsapp/inbox/:companyId",
    wrap(async (req, res) => {
      const { company } = await authorize(req);
      if (req.query.before && !UUID.test(req.query.before))
        throw new HttpError(400, "INVALID_CURSOR", "Cursor no válido.");
      res.set("Cache-Control", "no-store").json({
        ...(await db.chat.list(company, req.query.before)),
        connected: company.connection_state === "CONNECTED",
        phoneId: company.whatsapp_phone_id || null,
      });
    }),
  );
  app.get(
    "/api/whatsapp/inbox/:companyId/:conversationId",
    wrap(async (req, res) => {
      const { company } = await authorize(req),
        before = req.query.before;
      if (before && !UUID.test(before))
        throw new HttpError(400, "INVALID_CURSOR", "Cursor no válido.");
      res
        .set("Cache-Control", "no-store")
        .json(await db.chat.messages(company, chatId(req), before));
    }),
  );
  app.post(
    "/api/whatsapp/inbox/:companyId/:conversationId/read",
    wrap(async (req, res) => {
      const { company } = await authorize(req);
      if (!UUID.test(req.body?.messageId || ""))
        throw new HttpError(400, "INVALID_MESSAGE", "Mensaje no válido.");
      await db.chat.markRead(company, chatId(req), req.body.messageId);
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/whatsapp/inbox/:companyId/:conversationId/reply",
    wrap(async (req, res) => {
      const { ownerId, companyId } = await authorize(req),
        id = chatId(req),
        text = req.body?.text,
        key = req.get("Idempotency-Key");
      if (
        typeof text !== "string" ||
        !text.trim() ||
        text.trim().length > 4096 ||
        !UUID.test(key || "")
      )
        throw new HttpError(
          400,
          "INVALID_MESSAGE",
          "Escribe hasta 4096 caracteres y usa una clave de envío válida.",
        );
      const reserved = await db.chat.reserveReply(companyId, ownerId, id, text.trim(), key);
      if (reserved.replayed) return res.json({ message: reserved.message, replayed: true });
      let token;
      try {
        token = decryptToken(reserved.company.whatsapp_token_oficial, config.encryptionKey);
      } catch {
        await db.chat.finishReply(reserved.row.id, companyId, "failed");
        throw new HttpError(503, "TOKEN_INVALID", "Revisa la credencial de la empresa.");
      }
      let messageId;
      try {
        const response = await http.post(
          `https://graph.facebook.com/${config.graphVersion}/${reserved.company.whatsapp_phone_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: reserved.phone,
            type: "text",
            text: { body: text.trim(), preview_url: false },
          },
          {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            timeout: 12000,
            maxRedirects: 0,
            maxBodyLength: 32768,
            maxContentLength: 65536,
          },
        );
        messageId = response.data?.messages?.[0]?.id;
        if (
          typeof messageId !== "string" ||
          !messageId.startsWith("wamid.") ||
          messageId.length > 512
        )
          throw new Error("Unknown result");
      } catch (e) {
        const rejected = e.response?.status >= 400 && e.response?.status < 500;
        await db.chat.finishReply(reserved.row.id, companyId, rejected ? "failed" : "unknown");
        throw new HttpError(
          rejected ? 502 : 503,
          rejected ? "META_REJECTED" : "SEND_OUTCOME_UNKNOWN",
          rejected
            ? "Meta rechazó el mensaje. Actualiza el estado antes de volver a intentarlo."
            : "El resultado del envío es incierto. No lo repitas con otra clave.",
        );
      }
      try {
        res.json({
          message: await db.chat.finishReply(reserved.row.id, companyId, "accepted", messageId),
        });
      } catch {
        logger.error("[chat] Meta aceptó el mensaje; requiere conciliación de su estado.");
        throw new HttpError(
          503,
          "SEND_OUTCOME_UNKNOWN",
          "Meta aceptó el mensaje. No repitas el envío; revisa su estado.",
        );
      }
    }),
  );
}
module.exports = { extractChatEvents, createChatStore, installChatRoutes };
