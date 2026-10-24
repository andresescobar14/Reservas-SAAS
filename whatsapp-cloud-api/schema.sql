-- Extensión para la BD Supabase existente. No sustituye supabase-schema.sql.
-- Ejecutar como administrador. No crea ni activa cuentas de Meta ni pagos.
begin;
create schema if not exists whatsapp_cloud;
revoke all on schema whatsapp_cloud from public, anon, authenticated;

create table if not exists whatsapp_cloud.companies (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- AES-256-GCM; nunca almacenar el token oficial en texto plano.
  whatsapp_token_oficial text check (whatsapp_token_oficial like 'v1.%'),
  whatsapp_phone_id text unique check (whatsapp_phone_id ~ '^[0-9]{5,30}$'),
  plan_actual text not null default 'TRIAL' check (plan_actual in ('TRIAL','PRO','PREMIUM')),
  status_pago text not null default 'ACTIVO' check (status_pago in ('ACTIVO','SUSPENDIDO')),
  whatsapp_acceso_aprobado boolean not null default false,
  template_approved boolean not null default false,
  mensajes_enviados_mes integer not null default 0 check (mensajes_enviados_mes>=0),
  limite_mensajes integer generated always as (
    case plan_actual when 'TRIAL' then 35 when 'PRO' then 1000 when 'PREMIUM' then 2500 end
  ) stored,
  precio_mxn integer generated always as (
    case plan_actual when 'TRIAL' then 0 when 'PRO' then 599 when 'PREMIUM' then 999 end
  ) stored,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now()+interval '7 days'),
  subscription_ends_at timestamptz,
  timezone text not null default 'America/Mexico_City',
  usage_period text,
  created_at timestamptz not null default now(),
  check (trial_ends_at>trial_started_at),
  check (trial_ends_at<=trial_started_at+interval '7 days'),
  check (plan_actual='TRIAL' or subscription_ends_at is not null)
);

create or replace function whatsapp_cloud.check_timezone()
returns trigger language plpgsql set search_path='' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'Invalid timezone';
  end if;
  return new;
end; $$;
drop trigger if exists whatsapp_cloud_timezone on whatsapp_cloud.companies;
create trigger whatsapp_cloud_timezone before insert or update of timezone on whatsapp_cloud.companies
for each row execute function whatsapp_cloud.check_timezone();

create table if not exists whatsapp_cloud.consents (
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  phone text not null check (phone ~ '^[1-9][0-9]{6,14}$'),
  opted_in_at timestamptz,
  revoked_at timestamptz,
  primary key (company_id,phone)
);

-- Contadores autoritativos. TRIAL usa siempre el mismo bucket: 35 en toda la prueba.
-- Los buckets YYYY-MM son meses calendario según la zona horaria del negocio.
create table if not exists whatsapp_cloud.usage (
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  period text not null check (period='TRIAL' or period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sent integer not null default 0 check (sent>=0),
  reserved integer not null default 0 check (reserved>=0),
  primary key (company_id,period)
);

-- Mejora la clave externa compuesta sin cambiar el modelo existente de reservas.
create unique index if not exists reservations_company_cloud_id on public.reservations(company_id,id);
create table if not exists whatsapp_cloud.outbox (
  id uuid primary key,
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  fingerprint text not null,
  reservation_id uuid not null,
  phone text not null,
  phone_id text not null,
  period text not null,
  state text not null check (state in ('sending','sent','failed','unknown')),
  meta_message_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id,idempotency_key),
  foreign key (company_id,period) references whatsapp_cloud.usage(company_id,period),
  foreign key (company_id,reservation_id) references public.reservations(company_id,id) on delete restrict
);
create index if not exists cloud_outbox_context on whatsapp_cloud.outbox(phone_id,phone,meta_message_id);

-- Solo se guarda el identificador del botón, remitente y contexto necesarios;
-- no se conserva el contenido completo de conversaciones o historias clínicas.
create table if not exists whatsapp_cloud.inbox (
  id text primary key,
  event jsonb not null,
  state text not null default 'pending' check (state in ('pending','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists cloud_inbox_pending on whatsapp_cloud.inbox(available_at,created_at) where state='pending';

-- El servidor usa DATABASE_URL. Ni el navegador ni una publishable key acceden.
alter table whatsapp_cloud.companies enable row level security;
alter table whatsapp_cloud.consents enable row level security;
alter table whatsapp_cloud.usage enable row level security;
alter table whatsapp_cloud.outbox enable row level security;
alter table whatsapp_cloud.inbox enable row level security;
revoke all on all tables in schema whatsapp_cloud from public,anon,authenticated;
revoke all on all functions in schema whatsapp_cloud from public,anon,authenticated;
commit;

-- Alta manual de una empresa existente: TRIAL 7 días / 35 / sin aprobar.
-- insert into whatsapp_cloud.companies(company_id) values ('UUID_EXISTENTE');
-- Aprobar tras revisión, además de configurar token cifrado, número y plantilla:
-- update whatsapp_cloud.companies set whatsapp_acceso_aprobado=true where company_id='UUID_EXISTENTE';
-- PRO/PREMIUM se asignan solo después de verificar el pago desde el administrador.
-- update whatsapp_cloud.companies set plan_actual='PRO',status_pago='ACTIVO',
--   subscription_ends_at='FECHA_REAL_FIN_DEL_PERIODO' where company_id='UUID_EXISTENTE';
-- Revocación manual inmediata:
-- update whatsapp_cloud.companies set status_pago='SUSPENDIDO' where company_id='UUID_EXISTENTE';
