-- Additive, nullable client state field for the optional customer map.
-- Existing client records and policies are preserved.
alter table public.clients
  add column if not exists uf text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_uf_valid'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_uf_valid
      check (uf is null or uf in (
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
        'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
        'SP','SE','TO'
      )) not valid;
  end if;
end $$;

alter table public.clients validate constraint clients_uf_valid;
