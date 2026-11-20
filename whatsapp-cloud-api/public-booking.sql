-- Public booking pages: apply after native-automation.sql as an administrator.
-- Only the API runtime can execute the booking function. No anonymous table access.
begin;
create table if not exists whatsapp_cloud.booking_pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  title text not null check (length(title) between 2 and 100),
  service text not null check (length(service) between 2 and 160),
  duration_minutes integer not null default 30 check(duration_minutes between 15 and 120),
  slot_step_minutes integer not null default 30 check(slot_step_minutes between 1 and 120),
  weekdays integer[] not null default array[1,2,3,4,5],
  opens_at time not null default '09:00',
  closes_at time not null default '18:00',
  notice_minutes integer not null default 1 check(notice_minutes between 1 and 1440),
  horizon_days integer not null default 30 check(horizon_days between 1 and 60),
  enabled boolean not null default false,
  check(closes_at > opens_at),
  check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7])
);
create table if not exists whatsapp_cloud.public_booking_requests (
  request_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null,
  fingerprint text not null,
  phone_hash text not null,
  whatsapp_consent boolean not null,
  consent_version text not null default 'public-booking-v1',
  created_at timestamptz not null default now(),
  foreign key(company_id,reservation_id) references public.reservations(company_id,id) on delete cascade
);
create index if not exists public_booking_daily on whatsapp_cloud.public_booking_requests(company_id,created_at);
create index if not exists public_booking_phone on whatsapp_cloud.public_booking_requests(company_id,phone_hash,created_at);
alter table whatsapp_cloud.booking_pages enable row level security;
alter table whatsapp_cloud.public_booking_requests enable row level security;
revoke all on whatsapp_cloud.booking_pages,whatsapp_cloud.public_booking_requests from public,anon,authenticated;
grant select on whatsapp_cloud.booking_pages to reserva_whatsapp;
grant select(subscription_status,trial_ends_at) on public.companies to reserva_whatsapp;
drop policy if exists booking_pages_runtime on whatsapp_cloud.booking_pages;
create policy booking_pages_runtime on whatsapp_cloud.booking_pages for select to reserva_whatsapp using(true);

-- Serialize writes from public booking, the dashboard and imported appointments.
-- Existing companies without an enabled page retain their existing capacity rules.
create or replace function whatsapp_cloud.protect_public_booking_slot()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='confirmed' and exists(select 1 from whatsapp_cloud.booking_pages where company_id=new.company_id and enabled) then
    perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
    if exists(select 1 from public.reservations r where r.company_id=new.company_id
      and r.id<>new.id and r.status='confirmed' and r.starts_at<new.ends_at and r.ends_at>new.starts_at) then
      raise exception 'SLOT_UNAVAILABLE' using errcode='23P01';
    end if;
  end if;
  return new;
end; $$;
revoke all on function whatsapp_cloud.protect_public_booking_slot() from public,anon,authenticated;
drop trigger if exists reservations_public_availability on public.reservations;
create trigger reservations_public_availability before insert or update of starts_at,ends_at,status on public.reservations
  for each row execute function whatsapp_cloud.protect_public_booking_slot();

create or replace function whatsapp_cloud.book_public_reservation(
  p_slug text,p_request_id uuid,p_fingerprint text,p_phone_hash text,
  p_name text,p_phone text,p_starts_at timestamptz,p_consent boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare page whatsapp_cloud.booking_pages; company public.companies; prior whatsapp_cloud.public_booking_requests;
  local_start timestamp; local_today date; customer uuid; reservation uuid; ending timestamptz; result jsonb;
begin
  select * into page from whatsapp_cloud.booking_pages where slug=p_slug and enabled;
  if not found then raise exception 'PAGE_UNAVAILABLE'; end if;
  select * into company from public.companies where id=page.company_id;
  if not (company.internal_owner_access or company.subscription_status='active'
    or (company.subscription_status='trial' and company.trial_ends_at>now())) then
    raise exception 'PAGE_UNAVAILABLE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(page.company_id::text,0));
  select * into prior from whatsapp_cloud.public_booking_requests where request_id=p_request_id;
  if found then
    if prior.company_id<>page.company_id or prior.fingerprint<>p_fingerprint then raise exception 'REQUEST_CONFLICT'; end if;
    reservation:=prior.reservation_id;
  else
    if p_consent is null or length(btrim(p_name)) not between 2 and 100 or p_phone !~ '^\+[1-9][0-9]{6,14}$'
      or p_request_id is null or p_starts_at is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_phone_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'INVALID_BOOKING';
    end if;
    local_start:=p_starts_at at time zone company.timezone;
    local_today:=(now() at time zone company.timezone)::date;
    ending:=p_starts_at+make_interval(mins=>page.duration_minutes);
    if p_starts_at<now()+make_interval(mins=>page.notice_minutes)
      or local_start::date<local_today or local_start::date>local_today+page.horizon_days
      or not(extract(isodow from local_start)::integer=any(page.weekdays))
      or local_start<local_start::date+page.opens_at or (ending at time zone company.timezone)>local_start::date+page.closes_at
      or mod(extract(epoch from (local_start-(local_start::date+page.opens_at)))::numeric,page.slot_step_minutes*60)<>0 then
      raise exception 'INVALID_SLOT';
    end if;
    -- Pilot limits bound unsolicited bookings and messaging costs independently of owner quota.
    if (select count(*) from whatsapp_cloud.public_booking_requests where company_id=page.company_id and created_at>now()-interval '1 day')>=50
      or (select count(*) from whatsapp_cloud.public_booking_requests where company_id=page.company_id and phone_hash=p_phone_hash and created_at>now()-interval '1 day')>=3 then
      raise exception 'BOOKING_LIMIT';
    end if;
    if exists(select 1 from public.reservations where company_id=page.company_id and status='confirmed' and starts_at<ending and ends_at>p_starts_at) then
      raise exception 'SLOT_UNAVAILABLE' using errcode='23P01';
    end if;
    -- Public visitors cannot rename an existing customer by submitting their phone.
    insert into public.customers(company_id,full_name,phone) values(page.company_id,btrim(p_name),p_phone)
      on conflict(company_id,phone) do nothing returning id into customer;
    if customer is null then select id into customer from public.customers where company_id=page.company_id and phone=p_phone; end if;
    if p_consent then
      insert into whatsapp_cloud.consents(company_id,phone,opted_in_at,evidence)
        values(page.company_id,substring(p_phone from 2),now(),
          'public-booking-v1; /reservar/'||page.slug||'; Acepto recibir de '||page.title||' una confirmación y un recordatorio de esta reserva por WhatsApp.')
        on conflict do nothing;
    end if;
    insert into public.reservations(company_id,customer_id,service,starts_at,ends_at,reminder_due_at,whatsapp_authorized)
      values(page.company_id,customer,page.service,p_starts_at,ending,p_starts_at-interval '24 hours',p_consent) returning id into reservation;
    insert into whatsapp_cloud.public_booking_requests(request_id,company_id,reservation_id,fingerprint,phone_hash,whatsapp_consent)
      values(p_request_id,page.company_id,reservation,p_fingerprint,p_phone_hash,p_consent);
  end if;
  select jsonb_build_object('reservationId',r.id,'startsAt',r.starts_at,'endsAt',r.ends_at,'service',r.service,
    'timezone',company.timezone,'businessName',page.title,'whatsappConsent',r.whatsapp_authorized,
    'confirmationScheduled',exists(select 1 from whatsapp_cloud.jobs where reservation_id=r.id and kind='confirmation' and state in('pending','processing','blocked','sent')),
    'reminderAt',(select due_at from whatsapp_cloud.jobs where reservation_id=r.id and kind='reminder' and state in('pending','processing','blocked','sent') limit 1))
    into result from public.reservations r where r.id=reservation and r.company_id=page.company_id;
  return result;
end; $$;
revoke all on function whatsapp_cloud.book_public_reservation(text,uuid,text,text,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function whatsapp_cloud.book_public_reservation(text,uuid,text,text,text,text,timestamptz,boolean) to reserva_whatsapp;
commit;
