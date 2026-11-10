-- Cal.com → Make → Reserva. Ejecutar después de onboarding.sql.
-- El runtime no recibe permisos para aprobar planes ni modificar pagos.
begin;
alter table whatsapp_cloud.outbox add column if not exists reservation_starts_at timestamptz;
create table if not exists whatsapp_cloud.automation_keys (
  company_id uuid primary key references whatsapp_cloud.companies(company_id) on delete cascade,
  token_hash text unique,
  token_hint text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_event_at timestamptz,
  last_result text,
  rate_window timestamptz not null default now(),
  rate_count integer not null default 0
);
create table if not exists whatsapp_cloud.external_bookings (
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  booking_id text not null,
  reservation_id uuid not null,
  source_updated_at timestamptz not null,
  event_digest text not null,
  whatsapp_consent boolean not null default false,
  primary key(company_id,booking_id),
  foreign key(company_id,reservation_id) references public.reservations(company_id,id) on delete cascade
);
alter table whatsapp_cloud.consents add column if not exists evidence text;
alter table whatsapp_cloud.automation_keys enable row level security;
alter table whatsapp_cloud.external_bookings enable row level security;
revoke all on whatsapp_cloud.automation_keys,whatsapp_cloud.external_bookings from public,anon,authenticated;
grant select,insert,update on whatsapp_cloud.automation_keys,whatsapp_cloud.external_bookings to reserva_whatsapp;
drop policy if exists wa_runtime_automation on whatsapp_cloud.automation_keys;
create policy wa_runtime_automation on whatsapp_cloud.automation_keys for all to reserva_whatsapp using(true) with check(true);
drop policy if exists wa_runtime_external on whatsapp_cloud.external_bookings;
create policy wa_runtime_external on whatsapp_cloud.external_bookings for all to reserva_whatsapp using(true) with check(true);
grant insert(company_id,phone,opted_in_at,evidence) on whatsapp_cloud.consents to reserva_whatsapp;
-- No puede deshacer una revocación: solo crea un registro nuevo con evidencia explícita.
drop policy if exists wa_runtime_consent_record on whatsapp_cloud.consents;
create policy wa_runtime_consent_record on whatsapp_cloud.consents for insert to reserva_whatsapp with check(true);
grant insert(id,company_id,full_name,phone) on public.customers to reserva_whatsapp;
drop policy if exists wa_runtime_insert on public.customers;
create policy wa_runtime_insert on public.customers for insert to reserva_whatsapp with check(true);
grant select(ends_at,service) on public.reservations to reserva_whatsapp;
grant insert(id,company_id,customer_id,service,starts_at,ends_at,reminder_due_at,status),
  update(customer_id,service,starts_at,ends_at,reminder_sent_at) on public.reservations to reserva_whatsapp;
drop policy if exists wa_runtime_insert on public.reservations;
create policy wa_runtime_insert on public.reservations for insert to reserva_whatsapp with check(status in ('confirmed','cancelled'));
commit;
