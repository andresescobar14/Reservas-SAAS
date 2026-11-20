-- Private, encrypted conversations. No public Supabase table or self-service grants.
begin;
create table if not exists whatsapp_cloud.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  phone_id text not null,
  peer_hash text not null,
  peer_encrypted text not null check(peer_encrypted like 'v1.%'),
  last_inbound_at timestamptz,
  last_read_at timestamptz not null default '1970-01-01',
  updated_at timestamptz not null default now(),
  unique(company_id,phone_id,peer_hash),
  unique(company_id,id)
);
create table if not exists whatsapp_cloud.chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null,
  direction text not null check(direction in ('incoming','outgoing')),
  kind text not null check(kind in ('text','template','unsupported')),
  body_encrypted text not null check(body_encrypted like 'v1.%'),
  meta_message_id text,
  idempotency_key uuid,
  fingerprint text,
  delivery text not null check(delivery in ('received','sending','accepted','delivered','read','failed','unknown')),
  delivery_at timestamptz,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(company_id,meta_message_id),
  unique(company_id,idempotency_key),
  foreign key(company_id,conversation_id) references whatsapp_cloud.chat_conversations(company_id,id) on delete cascade
);
create index if not exists chat_conversations_recent on whatsapp_cloud.chat_conversations(company_id,phone_id,updated_at desc,id);
create index if not exists chat_messages_thread on whatsapp_cloud.chat_messages(company_id,conversation_id,sent_at desc,id);
create index if not exists chat_messages_unread on whatsapp_cloud.chat_messages(company_id,conversation_id,created_at) where direction='incoming';
create index if not exists chat_delivery_receipts on whatsapp_cloud.inbox((event->>'messageId'),(event->>'phoneId')) where event->>'kind'='delivery';
alter table whatsapp_cloud.chat_conversations enable row level security;
alter table whatsapp_cloud.chat_messages enable row level security;
revoke all on whatsapp_cloud.chat_conversations,whatsapp_cloud.chat_messages from public,anon,authenticated;
grant select,insert,update on whatsapp_cloud.chat_conversations,whatsapp_cloud.chat_messages to reserva_whatsapp;
drop policy if exists chat_runtime on whatsapp_cloud.chat_conversations;
create policy chat_runtime on whatsapp_cloud.chat_conversations for all to reserva_whatsapp using(true) with check(true);
drop policy if exists chat_runtime on whatsapp_cloud.chat_messages;
create policy chat_runtime on whatsapp_cloud.chat_messages for all to reserva_whatsapp using(true) with check(true);
commit;
