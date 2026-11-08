create table if not exists public.client_app_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  access_number integer not null check (access_number between 1 and 50),
  app_name text,
  mac_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_app_accesses_client_slot_unique unique (client_id, access_number),
  constraint client_app_accesses_has_data check (
    nullif(btrim(coalesce(app_name, '')), '') is not null
    or nullif(btrim(coalesce(mac_address, '')), '') is not null
  )
);

create index if not exists client_app_accesses_org_client_idx
  on public.client_app_accesses (organization_id, client_id, access_number);

alter table public.client_app_accesses enable row level security;

drop policy if exists client_app_accesses_select on public.client_app_accesses;
create policy client_app_accesses_select on public.client_app_accesses
for select to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = client_app_accesses.client_id
      and c.organization_id = client_app_accesses.organization_id
      and (c.seller_user_id = auth.uid() or public.gestorpro_is_manager(c.organization_id))
  )
);

drop policy if exists client_app_accesses_insert on public.client_app_accesses;
create policy client_app_accesses_insert on public.client_app_accesses
for insert to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = client_app_accesses.client_id
      and c.organization_id = client_app_accesses.organization_id
      and (c.seller_user_id = auth.uid() or public.gestorpro_is_manager(c.organization_id))
  )
);

drop policy if exists client_app_accesses_update on public.client_app_accesses;
create policy client_app_accesses_update on public.client_app_accesses
for update to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = client_app_accesses.client_id
      and c.organization_id = client_app_accesses.organization_id
      and (c.seller_user_id = auth.uid() or public.gestorpro_is_manager(c.organization_id))
  )
)
with check (
  exists (
    select 1 from public.clients c
    where c.id = client_app_accesses.client_id
      and c.organization_id = client_app_accesses.organization_id
      and (c.seller_user_id = auth.uid() or public.gestorpro_is_manager(c.organization_id))
  )
);

drop policy if exists client_app_accesses_delete on public.client_app_accesses;
create policy client_app_accesses_delete on public.client_app_accesses
for delete to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = client_app_accesses.client_id
      and c.organization_id = client_app_accesses.organization_id
      and (c.seller_user_id = auth.uid() or public.gestorpro_is_manager(c.organization_id))
  )
);

grant select, insert, update, delete on public.client_app_accesses to authenticated;