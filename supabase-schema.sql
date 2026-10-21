-- Reserva · esquema inicial. Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Modelo inicial: un propietario de Supabase Auth por empresa.
begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  timezone text not null default 'UTC',
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'past_due')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, phone),
  unique (company_id, id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  service text not null check (char_length(btrim(service)) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'completed', 'cancelled')),
  reminder_due_at timestamptz not null,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Impide asignar a una reserva un cliente de otra empresa.
  foreign key (company_id, customer_id)
    references public.customers(company_id, id) on delete restrict
);

create index reservations_calendar_idx on public.reservations(company_id, starts_at);
create index reservations_customer_idx on public.reservations(company_id, customer_id);
create index reservations_reminders_idx on public.reservations(reminder_due_at)
  where reminder_sent_at is null and status = 'confirmed';

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_updated before update on public.companies
  for each row execute function public.touch_updated_at();
create trigger customers_updated before update on public.customers
  for each row execute function public.touch_updated_at();

create function public.prepare_reservation()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.reminder_due_at := new.starts_at - interval '24 hours';
  if TG_OP = 'UPDATE' and new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
  end if;
  return new;
end;
$$;

create trigger reservations_prepare before insert or update on public.reservations
  for each row execute function public.prepare_reservation();

-- La empresa y la prueba se crean en la BD; el navegador no decide su estado.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  company_name text;
  company_timezone text;
begin
  company_name := left(btrim(coalesce(new.raw_user_meta_data->>'company_name', 'Mi negocio')), 100);
  if char_length(company_name) < 2 then company_name := 'Mi negocio'; end if;
  company_timezone := coalesce(new.raw_user_meta_data->>'timezone', 'UTC');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = company_timezone) then
    company_timezone := 'UTC';
  end if;
  insert into public.companies(owner_id, name, timezone)
    values (new.id, company_name, company_timezone);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- También bloquea el acceso directo a la API tras vencer la prueba.
create function public.has_company_access(target_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.companies c
    where c.id = target_company_id and c.owner_id = (select auth.uid())
      and (c.subscription_status = 'active'
        or (c.subscription_status = 'trial' and c.trial_ends_at > now()))
  );
$$;

alter table public.companies enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;

revoke all on public.companies, public.customers, public.reservations from anon, authenticated;
grant select on public.companies to authenticated;
grant update (name, timezone) on public.companies to authenticated;
grant select, delete on public.customers, public.reservations to authenticated;
grant insert (company_id, full_name, phone), update (full_name, phone)
  on public.customers to authenticated;
grant insert (company_id, customer_id, service, starts_at, ends_at),
  update (service, starts_at, ends_at, status) on public.reservations to authenticated;
grant all on public.companies, public.customers, public.reservations to service_role;

create policy companies_select_owner on public.companies for select to authenticated
  using (owner_id = (select auth.uid()));
create policy companies_update_owner on public.companies for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy customers_select on public.customers for select to authenticated
  using (public.has_company_access(company_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.has_company_access(company_id));
create policy customers_update on public.customers for update to authenticated
  using (public.has_company_access(company_id)) with check (public.has_company_access(company_id));
create policy customers_delete on public.customers for delete to authenticated
  using (public.has_company_access(company_id));

create policy reservations_select on public.reservations for select to authenticated
  using (public.has_company_access(company_id));
create policy reservations_insert on public.reservations for insert to authenticated
  with check (public.has_company_access(company_id));
create policy reservations_update on public.reservations for update to authenticated
  using (public.has_company_access(company_id)) with check (public.has_company_access(company_id));
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.has_company_access(company_id));

-- Una transacción para guardar cliente + reserva. SECURITY INVOKER conserva RLS.
create function public.book_reservation(
  p_company_id uuid, p_full_name text, p_phone text, p_service text,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  selected_customer_id uuid;
  reservation_id uuid;
begin
  insert into public.customers(company_id, full_name, phone)
    values (p_company_id, p_full_name, p_phone)
    on conflict (company_id, phone) do update set full_name = excluded.full_name
    returning id into selected_customer_id;
  insert into public.reservations(company_id, customer_id, service, starts_at, ends_at)
    values (p_company_id, selected_customer_id, p_service, p_starts_at, p_ends_at)
    returning id into reservation_id;
  return reservation_id;
end;
$$;

revoke all on function public.touch_updated_at(), public.prepare_reservation(),
  public.handle_new_user(), public.has_company_access(uuid),
  public.book_reservation(uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.has_company_access(uuid),
  public.book_reservation(uuid, text, text, text, timestamptz, timestamptz) to authenticated;

-- Un worker persistente debe consultar recordatorios vencidos y no enviados,
-- comprobar la suscripción y la conexión WhatsApp, enviar de forma idempotente
-- y actualizar reminder_sent_at con service_role (nunca en el navegador).
-- Este esquema NO instala un servicio de WhatsApp ni un procesador de pagos.
commit;
