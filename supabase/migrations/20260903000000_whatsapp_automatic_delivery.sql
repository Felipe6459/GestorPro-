create unique index if not exists whatsapp_message_logs_delivery_once_idx on public.whatsapp_message_logs (organization_id, client_id, template_day_offset, scheduled_for);

create or replace function public.get_whatsapp_delivery_config(p_organization_id uuid)
returns table(phone_number_id text, business_account_id text, access_token text, enabled boolean, daily_limit integer)
language sql
security definer
set search_path = public, vault
as $$
  select w.phone_number_id,
         w.business_account_id,
         s.decrypted_secret,
         w.enabled,
         w.daily_limit
    from public.whatsapp_settings w
    left join vault.decrypted_secrets s on s.id = w.access_token_secret_id
   where w.organization_id = p_organization_id;
$$;
revoke all on function public.get_whatsapp_delivery_config(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_delivery_config(uuid) to service_role;

create or replace function public.queue_whatsapp_expiry_messages(p_run_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_offset integer;
  v_template record;
  v_message text;
  v_count integer := 0;
begin
  for r in
    select c.id as client_id, c.organization_id, c.name, c.whatsapp, c.due_date, c.value,
           c.status, s.name as server_name
      from public.clients c
      left join public.servers s on s.id = c.server_id
     where c.whatsapp is not null
       and btrim(c.whatsapp) <> ''
       and c.due_date is not null
       and lower(coalesce(c.status, 'active')) = 'active'
  loop
    v_offset := r.due_date - p_run_date;

    for v_template in
      select id, day_offset, name, message, active
        from public.whatsapp_templates
       where organization_id = r.organization_id
         and active = true
         and day_offset = v_offset
    loop
      v_message := replace(v_template.message, '{nome}', coalesce(r.name, ''));
      v_message := replace(v_message, '{dias}', abs(v_offset)::text);
      v_message := replace(v_message, '{vencimento}', to_char(r.due_date, 'DD/MM/YYYY'));
      v_message := replace(v_message, '{valor}', replace(to_char(coalesce(r.value, 0), 'FM999999990D00'), '.', ','));
      v_message := replace(v_message, '{servidor}', coalesce(r.server_name, ''));
      v_message := replace(v_message, '{whatsapp}', coalesce(r.whatsapp, ''));

      insert into public.whatsapp_message_logs
        (organization_id, client_id, template_day_offset, phone, message, channel, status, scheduled_for, created_at, updated_at)
      values
        (r.organization_id, r.client_id, v_template.day_offset, r.whatsapp, v_message, 'whatsapp', 'pending', p_run_date, now(), now())
      on conflict (organization_id, client_id, template_day_offset, scheduled_for) do nothing;

      if found then v_count := v_count + 1; end if;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.queue_whatsapp_expiry_messages(date) from public, anon, authenticated;
grant execute on function public.queue_whatsapp_expiry_messages(date) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'gestorpro_whatsapp_cron_token') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'gestorpro_whatsapp_cron_token', 'Internal token for GestorPro WhatsApp scheduled delivery');
  end if;
end $$;

create or replace function public.get_whatsapp_job_token()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gestorpro_whatsapp_cron_token' limit 1;
$$;
revoke all on function public.get_whatsapp_job_token() from public, anon, authenticated;
grant execute on function public.get_whatsapp_job_token() to service_role;
