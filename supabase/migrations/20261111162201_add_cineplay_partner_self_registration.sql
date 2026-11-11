alter table public.cineplay_partners
  add column if not exists whatsapp text;

alter table public.cineplay_partners
  drop constraint if exists cineplay_partners_status_check;

alter table public.cineplay_partners
  add constraint cineplay_partners_status_check
  check (status = any (array['active'::text, 'suspended'::text, 'pending'::text]));
