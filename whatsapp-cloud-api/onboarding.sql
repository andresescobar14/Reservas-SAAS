-- Ejecutar después de schema.sql y runtime-role.sql, como administrador.
-- Alta oficial con Coexistencia. No cambia planes, pagos ni aprobación del TRIAL.
begin;
alter table whatsapp_cloud.companies
  add column if not exists meta_waba_id text,
  add column if not exists connection_state text,
  add column if not exists coexistence boolean not null default false,
  add column if not exists display_phone text,
  add column if not exists verified_name text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists connected_at timestamptz,
  add column if not exists connection_checked_at timestamptz,
  add column if not exists template_status text not null default 'NOT_CHECKED',
  add column if not exists sync_state jsonb not null default '{}'::jsonb;
create unique index if not exists cloud_waba_tenant on whatsapp_cloud.companies(meta_waba_id);

create table if not exists whatsapp_cloud.onboarding_sessions (
  id uuid primary key,
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  owner_id uuid not null,
  nonce_hash text not null,
  code_hash text unique,
  state text not null check(state in ('pending','exchanging','token_ready','completing','completed','failed','cancelled')),
  encrypted_token text check(encrypted_token like 'v1.%'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '10 minutes')
);
create index if not exists cloud_signup_company on whatsapp_cloud.onboarding_sessions(company_id,created_at desc);
alter table whatsapp_cloud.onboarding_sessions enable row level security;
revoke all on whatsapp_cloud.onboarding_sessions from public,anon,authenticated;

-- Actividad cifrada de Coexistencia; retención máxima 7 días tras recepción.
-- No convierte contactos ni conversaciones históricas en consentimiento de marketing.
create table if not exists whatsapp_cloud.activity (
  id text primary key,
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  encrypted_content text not null check(encrypted_content like 'v1.%'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists cloud_activity_company on whatsapp_cloud.activity(company_id,occurred_at desc);
alter table whatsapp_cloud.activity enable row level security;
revoke all on whatsapp_cloud.activity from public,anon,authenticated;

-- Permisos nuevos del runtime: solo campos de conexión, sesiones y actividad.
-- No puede cambiar plan_actual, status_pago, whatsapp_acceso_aprobado ni fechas de suscripción.
grant insert(company_id) on whatsapp_cloud.companies to reserva_whatsapp;
grant update(whatsapp_token_oficial,whatsapp_phone_id,meta_waba_id,connection_state,
  coexistence,display_phone,verified_name,token_expires_at,connected_at,
  connection_checked_at,template_approved,template_status,sync_state)
  on whatsapp_cloud.companies to reserva_whatsapp;
drop policy if exists wa_runtime_signup on whatsapp_cloud.companies;
create policy wa_runtime_signup on whatsapp_cloud.companies for insert to reserva_whatsapp with check(true);
grant select,insert,update on whatsapp_cloud.onboarding_sessions to reserva_whatsapp;
drop policy if exists wa_runtime_signup on whatsapp_cloud.onboarding_sessions;
create policy wa_runtime_signup on whatsapp_cloud.onboarding_sessions for all to reserva_whatsapp using(true) with check(true);
grant select,insert,delete on whatsapp_cloud.activity to reserva_whatsapp;
grant update(event) on whatsapp_cloud.inbox to reserva_whatsapp;
drop policy if exists wa_runtime_activity on whatsapp_cloud.activity;
create policy wa_runtime_activity on whatsapp_cloud.activity for all to reserva_whatsapp using(true) with check(true);
commit;
