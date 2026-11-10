create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  org_id uuid;
  org_name text;
  new_role text;
begin
  -- Partner accounts use the separate Cine Player Pro portal and must not
  -- receive a new GestorPro organization or owner permissions.
  if coalesce(new.raw_user_meta_data->>'account_type', '') = 'cineplay_partner' then
    insert into public.profiles(id, organization_id, full_name, role)
    values (
      new.id,
      null,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      'staff'
    )
    on conflict(id) do update
      set organization_id = null,
          full_name = excluded.full_name,
          role = 'staff';
    return new;
  end if;

  org_name := coalesce(
    nullif(new.raw_user_meta_data->>'company_name',''),
    nullif(new.raw_user_meta_data->>'organization_name',''),
    'Minha empresa'
  );
  new_role := case
    when not exists(select 1 from public.profiles where role='master') then 'master'
    else 'owner'
  end;

  insert into public.organizations(name,slug,status)
  values (
    org_name,
    lower(regexp_replace(org_name||'-'||substr(new.id::text,1,8),'[^a-zA-Z0-9]+','-','g')),
    'trial'
  )
  returning id into org_id;

  insert into public.profiles(id,organization_id,full_name,role)
  values(new.id,org_id,coalesce(new.raw_user_meta_data->>'full_name',new.email),new_role)
  on conflict(id) do update
    set organization_id=excluded.organization_id,
        full_name=excluded.full_name,
        role=excluded.role;

  insert into public.subscriptions(organization_id,status,starts_at,expires_at)
  values(
    org_id,
    case when new_role='master' then 'active' else 'trial' end,
    now(),
    case when new_role='master' then null else now()+interval '7 days' end
  );

  return new;
end;
$function$;