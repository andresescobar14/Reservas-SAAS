-- Internal owner access is set only by an administrator. New customers default to false.
-- Run after supabase-schema.sql; does not activate WhatsApp automation or change usage.
begin;
alter table public.companies
  add column if not exists internal_owner_access boolean not null default false;

-- Client updates remain limited to the existing editable business fields.
revoke update(internal_owner_access),insert(internal_owner_access)
  on public.companies from public,anon,authenticated;

create or replace function public.has_company_access(target_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.companies c
    where c.id = target_company_id and c.owner_id = (select auth.uid())
      and (c.internal_owner_access or c.subscription_status = 'active'
        or (c.subscription_status = 'trial' and c.trial_ends_at > now()))
  );
$$;
revoke all on function public.has_company_access(uuid) from public,anon;
grant execute on function public.has_company_access(uuid) to authenticated;

do $$
begin
  if exists(select 1 from pg_catalog.pg_roles where rolname='reserva_whatsapp') then
    grant select(internal_owner_access) on public.companies to reserva_whatsapp;
    revoke update(internal_owner_access),insert(internal_owner_access)
      on public.companies from reserva_whatsapp;
  end if;
end;
$$;
commit;
