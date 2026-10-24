-- Permisos del proceso de Railway. Ejecutar como administrador tras schema.sql.
-- Crear primero un LOGIN reserva_whatsapp con una contraseña aleatoria privada.
-- Este archivo no crea contraseñas ni concede privilegios de administrador.
begin;
grant connect on database postgres to reserva_whatsapp;
grant usage on schema public,whatsapp_cloud to reserva_whatsapp;

grant select(id,owner_id) on public.companies to reserva_whatsapp;
grant select(id,company_id,full_name,phone) on public.customers to reserva_whatsapp;
grant select(id,company_id,customer_id,starts_at,status),update(status)
  on public.reservations to reserva_whatsapp;

drop policy if exists wa_runtime_read on public.companies;
create policy wa_runtime_read on public.companies for select to reserva_whatsapp using(true);
drop policy if exists wa_runtime_read on public.customers;
create policy wa_runtime_read on public.customers for select to reserva_whatsapp using(true);
drop policy if exists wa_runtime_read on public.reservations;
create policy wa_runtime_read on public.reservations for select to reserva_whatsapp using(true);
drop policy if exists wa_runtime_status on public.reservations;
create policy wa_runtime_status on public.reservations for update to reserva_whatsapp
  using(true) with check(status in ('confirmed','cancelled'));

-- El runtime no puede aprobar pruebas, alterar planes, modificar tokens o consentimientos.
grant select on whatsapp_cloud.companies,whatsapp_cloud.consents to reserva_whatsapp;
grant update(mensajes_enviados_mes,usage_period) on whatsapp_cloud.companies to reserva_whatsapp;
grant select,insert,update on whatsapp_cloud.usage to reserva_whatsapp;
grant select,insert on whatsapp_cloud.outbox,whatsapp_cloud.inbox to reserva_whatsapp;
grant update(state,meta_message_id,updated_at) on whatsapp_cloud.outbox to reserva_whatsapp;
grant update(state,attempts,available_at,processed_at) on whatsapp_cloud.inbox to reserva_whatsapp;

drop policy if exists wa_runtime_read on whatsapp_cloud.companies;
create policy wa_runtime_read on whatsapp_cloud.companies for select to reserva_whatsapp using(true);
drop policy if exists wa_runtime_counter on whatsapp_cloud.companies;
create policy wa_runtime_counter on whatsapp_cloud.companies for update to reserva_whatsapp
  using(true) with check(true);
drop policy if exists wa_runtime_read on whatsapp_cloud.consents;
create policy wa_runtime_read on whatsapp_cloud.consents for select to reserva_whatsapp using(true);

drop policy if exists wa_runtime_usage on whatsapp_cloud.usage;
create policy wa_runtime_usage on whatsapp_cloud.usage for all to reserva_whatsapp
  using(true) with check(true);
drop policy if exists wa_runtime_outbox on whatsapp_cloud.outbox;
create policy wa_runtime_outbox on whatsapp_cloud.outbox for all to reserva_whatsapp
  using(true) with check(true);
drop policy if exists wa_runtime_inbox on whatsapp_cloud.inbox;
create policy wa_runtime_inbox on whatsapp_cloud.inbox for all to reserva_whatsapp
  using(true) with check(true);
commit;
