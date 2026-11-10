-- Automatización propia. Después de schema.sql, runtime-role.sql, onboarding.sql y automation.sql.
-- Activación por empresa, inicialmente apagada. No cambia aprobaciones, precios ni planes.
begin;
alter table whatsapp_cloud.companies
  add column if not exists confirmation_template_approved boolean not null default false,
  add column if not exists confirmation_template_status text not null default 'NOT_CHECKED',
  add column if not exists template_button_count integer not null default 2,
  add column if not exists confirmation_button_count integer not null default 3;
alter table public.reservations
  add column if not exists customer_response text not null default 'pending'
    check(customer_response in ('pending','confirmed','reschedule_requested')),
  add column if not exists customer_responded_at timestamptz;
alter table public.reservations add column if not exists whatsapp_authorized boolean not null default false;

create table if not exists whatsapp_cloud.automation_settings (
  company_id uuid primary key references whatsapp_cloud.companies(company_id) on delete cascade,
  enabled boolean not null default false,
  reminder_minutes integer not null default 1440 check(reminder_minutes between 15 and 10080),
  next_dispatch_at timestamptz not null default now(),
  cal_endpoint uuid unique,
  cal_secret text check(cal_secret like 'v1.%'),
  cal_enabled boolean not null default false,
  cal_last_event_at timestamptz,
  cal_last_result text,
  updated_at timestamptz not null default now()
);
create table if not exists whatsapp_cloud.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  reservation_id uuid not null,
  starts_at timestamptz not null,
  kind text not null check(kind in ('confirmation','reminder')),
  due_at timestamptz not null,
  available_at timestamptz not null,
  state text not null default 'pending'
    check(state in ('pending','processing','blocked','sent','cancelled','skipped','failed','review')),
  attempts integer not null default 0,
  lease_id uuid,
  leased_until timestamptz,
  request_id uuid references whatsapp_cloud.outbox(id),
  last_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,reservation_id,starts_at,kind),
  foreign key(company_id,reservation_id) references public.reservations(company_id,id) on delete cascade
);
create index if not exists cloud_jobs_due on whatsapp_cloud.jobs(available_at,due_at)
  where state in ('pending','blocked','processing');
create index if not exists cloud_jobs_reservation on whatsapp_cloud.jobs(company_id,reservation_id);
create table if not exists whatsapp_cloud.cal_events (
  id text primary key,
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  encrypted_payload text,
  state text not null default 'pending' check(state in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  lease_id uuid,
  last_code text,
  created_at timestamptz not null default now()
);
create index if not exists cloud_cal_events_due on whatsapp_cloud.cal_events(available_at)
  where state in ('pending','processing');
-- Conserva cancelaciones incluso si llegan antes que BOOKING_CREATED.
create table if not exists whatsapp_cloud.cal_booking_versions (
  company_id uuid not null references whatsapp_cloud.companies(company_id) on delete cascade,
  booking_id text not null,
  event_at timestamptz not null,
  cancelled boolean not null,
  primary key(company_id,booking_id)
);

-- Se ejecuta en la misma transacción que la reserva. No hay llamadas HTTP en triggers.
create or replace function whatsapp_cloud.schedule_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
declare settings whatsapp_cloud.automation_settings; reminder_at timestamptz;
begin
  update whatsapp_cloud.jobs set state='cancelled',last_code='BOOKING_CHANGED',updated_at=now()
    where company_id=new.company_id and reservation_id=new.id
      and state in ('pending','blocked','processing')
      and (new.status<>'confirmed' or not new.whatsapp_authorized or starts_at<>new.starts_at
        or (kind='reminder' and new.customer_response='reschedule_requested'));
  if new.status<>'confirmed' or not new.whatsapp_authorized or new.starts_at<=now() then return new; end if;
  if TG_OP='UPDATE' and new.starts_at=old.starts_at then return new; end if;
  select * into settings from whatsapp_cloud.automation_settings where company_id=new.company_id;
  if not found or not settings.enabled then return new; end if;
  insert into whatsapp_cloud.jobs(company_id,reservation_id,starts_at,kind,due_at,available_at)
    values(new.company_id,new.id,new.starts_at,'confirmation',now(),now()) on conflict do nothing;
  -- En reservas cercanas, separar los dos mensajes en vez de enviarlos juntos.
  if new.starts_at>now()+interval '10 minutes' then
    reminder_at:=new.starts_at-make_interval(mins=>settings.reminder_minutes);
    if reminder_at<=now()+interval '5 minutes' then
      reminder_at:=now()+(new.starts_at-now())/2;
    end if;
    insert into whatsapp_cloud.jobs(company_id,reservation_id,starts_at,kind,due_at,available_at)
      values(new.company_id,new.id,new.starts_at,'reminder',reminder_at,reminder_at) on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function whatsapp_cloud.schedule_reservation() from public,anon,authenticated;
drop trigger if exists reservations_whatsapp_schedule on public.reservations;
create trigger reservations_whatsapp_schedule after insert or update of starts_at,status,customer_response,whatsapp_authorized
  on public.reservations for each row execute function whatsapp_cloud.schedule_reservation();

-- La reserva y su consentimiento se guardan atómicamente; siempre se comprueba el propietario.
create or replace function public.book_reservation_with_whatsapp(
  p_company_id uuid,p_full_name text,p_phone text,p_service text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_whatsapp_consent boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare customer uuid; reservation uuid;
begin
  if not public.has_company_access(p_company_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_starts_at<=now() or p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '8 hours' then
    raise exception 'Invalid appointment time';
  end if;
  insert into public.customers(company_id,full_name,phone) values(p_company_id,p_full_name,p_phone)
    on conflict(company_id,phone) do update set full_name=excluded.full_name returning id into customer;
  if p_whatsapp_consent then
    insert into whatsapp_cloud.companies(company_id) values(p_company_id) on conflict do nothing;
    insert into whatsapp_cloud.consents(company_id,phone,opted_in_at,evidence)
      values(p_company_id,regexp_replace(p_phone,'[^0-9]','','g'),now(),
        'Autorización afirmativa registrada por propietario autenticado en Reserva') on conflict do nothing;
  end if;
  insert into public.reservations(company_id,customer_id,service,starts_at,ends_at,reminder_due_at,whatsapp_authorized)
    values(p_company_id,customer,p_service,p_starts_at,p_ends_at,p_starts_at-interval '24 hours',coalesce(p_whatsapp_consent,false)) returning id into reservation;
  return reservation;
end; $$;
revoke all on function public.book_reservation_with_whatsapp(uuid,text,text,text,timestamptz,timestamptz,boolean)
  from public,anon,authenticated;
grant execute on function public.book_reservation_with_whatsapp(uuid,text,text,text,timestamptz,timestamptz,boolean)
  to authenticated;
grant select(customer_response,customer_responded_at) on public.reservations to authenticated,reserva_whatsapp;
grant select(whatsapp_authorized),insert(whatsapp_authorized),update(whatsapp_authorized) on public.reservations to reserva_whatsapp;
grant update(customer_response,customer_responded_at) on public.reservations to reserva_whatsapp;
grant update(confirmation_template_approved,confirmation_template_status,template_button_count,confirmation_button_count)
  on whatsapp_cloud.companies to reserva_whatsapp;
grant select(timezone) on public.companies to reserva_whatsapp;
grant update(timezone) on whatsapp_cloud.companies to reserva_whatsapp;

create or replace function public.reschedule_reservation(
  p_company_id uuid,p_reservation_id uuid,p_starts_at timestamptz,p_ends_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if not public.has_company_access(p_company_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_starts_at<=now() or p_ends_at<=p_starts_at or p_ends_at>p_starts_at+interval '8 hours' then
    raise exception 'Invalid appointment time';
  end if;
  -- Cal.com es la fuente para reservas externas; evita que las agendas diverjan.
  if exists(select 1 from whatsapp_cloud.external_bookings where company_id=p_company_id and reservation_id=p_reservation_id) then
    raise exception 'Reschedule this booking in Cal.com';
  end if;
  update public.reservations set starts_at=p_starts_at,ends_at=p_ends_at,customer_response='pending',customer_responded_at=null
    where company_id=p_company_id and id=p_reservation_id and status='confirmed';
  get diagnostics changed=row_count;
  return changed=1;
end; $$;
revoke all on function public.reschedule_reservation(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.reschedule_reservation(uuid,uuid,timestamptz,timestamptz) to authenticated;

alter table whatsapp_cloud.jobs enable row level security;
alter table whatsapp_cloud.automation_settings enable row level security;
alter table whatsapp_cloud.cal_events enable row level security;
alter table whatsapp_cloud.cal_booking_versions enable row level security;
revoke all on whatsapp_cloud.jobs,whatsapp_cloud.automation_settings,whatsapp_cloud.cal_events from public,anon,authenticated;
grant select,insert,update on whatsapp_cloud.jobs,whatsapp_cloud.automation_settings,whatsapp_cloud.cal_events to reserva_whatsapp;
revoke all on whatsapp_cloud.cal_booking_versions from public,anon,authenticated;
grant select,insert,update on whatsapp_cloud.cal_booking_versions to reserva_whatsapp;
drop policy if exists wa_runtime_jobs on whatsapp_cloud.jobs;
create policy wa_runtime_jobs on whatsapp_cloud.jobs for all to reserva_whatsapp using(true) with check(true);
drop policy if exists wa_runtime_settings on whatsapp_cloud.automation_settings;
create policy wa_runtime_settings on whatsapp_cloud.automation_settings for all to reserva_whatsapp using(true) with check(true);
drop policy if exists wa_runtime_cal on whatsapp_cloud.cal_events;
create policy wa_runtime_cal on whatsapp_cloud.cal_events for all to reserva_whatsapp using(true) with check(true);
drop policy if exists wa_runtime_cal_versions on whatsapp_cloud.cal_booking_versions;
create policy wa_runtime_cal_versions on whatsapp_cloud.cal_booking_versions for all to reserva_whatsapp using(true) with check(true);
commit;
