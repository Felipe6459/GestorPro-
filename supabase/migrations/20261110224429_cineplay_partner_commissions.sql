create table public.cineplay_partner_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  commission_subscription numeric(12,2) not null default 10 check (commission_subscription >= 0),
  commission_renewal numeric(12,2) not null default 5 check (commission_renewal >= 0),
  monthly_close_day integer not null default 10 check (monthly_close_day between 1 and 31),
  timezone text not null default 'America/Maceio',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.cineplay_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete restrict,
  full_name text not null,
  email text not null,
  referral_code text not null unique,
  status text not null default 'active' check (status in ('active','suspended')),
  pix_key_type text check (pix_key_type in ('cpf','cnpj','email','phone','random')),
  pix_key text,
  pix_holder_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.cineplay_partner_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.cineplay_partners(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  client_name_snapshot text not null,
  referred_at timestamptz not null default now(),
  first_paid_at timestamptz,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create table public.cineplay_partner_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.cineplay_partners(id) on delete restrict,
  payout_type text not null check (payout_type in ('subscription','monthly_renewals')),
  period_start date,
  period_end date,
  amount numeric(12,2) not null check (amount > 0),
  pix_key_type_snapshot text not null,
  pix_key_snapshot text not null,
  pix_holder_snapshot text,
  paid_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

create table public.cineplay_partner_commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.cineplay_partners(id) on delete restrict,
  referral_id uuid not null references public.cineplay_partner_referrals(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  commission_type text not null check (commission_type in ('subscription','renewal')),
  cycle_due_date date,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','paid','void')),
  earned_at timestamptz not null default now(),
  eligible_at timestamptz not null default now(),
  payout_id uuid references public.cineplay_partner_payouts(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index cineplay_partners_org_status_idx on public.cineplay_partners (organization_id, status);
create index cineplay_partner_referrals_partner_idx on public.cineplay_partner_referrals (partner_id, status, referred_at desc);
create index cineplay_partner_commissions_partner_status_idx on public.cineplay_partner_commissions (partner_id, status, commission_type, eligible_at);
create unique index cineplay_partner_commissions_payment_uidx on public.cineplay_partner_commissions (payment_id) where payment_id is not null;
create unique index cineplay_partner_commissions_initial_uidx on public.cineplay_partner_commissions (referral_id) where commission_type = 'subscription' and status <> 'void';
create unique index cineplay_partner_commissions_renewal_cycle_uidx on public.cineplay_partner_commissions (referral_id, cycle_due_date) where commission_type = 'renewal' and cycle_due_date is not null and status <> 'void';

alter table public.cineplay_partner_settings enable row level security;
alter table public.cineplay_partners enable row level security;
alter table public.cineplay_partner_referrals enable row level security;
alter table public.cineplay_partner_payouts enable row level security;
alter table public.cineplay_partner_commissions enable row level security;

revoke all on public.cineplay_partner_settings from public, anon, authenticated;
revoke all on public.cineplay_partners from public, anon, authenticated;
revoke all on public.cineplay_partner_referrals from public, anon, authenticated;
revoke all on public.cineplay_partner_payouts from public, anon, authenticated;
revoke all on public.cineplay_partner_commissions from public, anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on public.cineplay_partner_settings to service_role;
grant all privileges on public.cineplay_partners to service_role;
grant all privileges on public.cineplay_partner_referrals to service_role;
grant all privileges on public.cineplay_partner_payouts to service_role;
grant all privileges on public.cineplay_partner_commissions to service_role;

create or replace function public.cineplay_partner_process_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref record;
  v_settings record;
  v_prior_paid_at timestamptz;
  v_first_paid_at timestamptz;
  v_paid_at timestamptz;
  v_type text;
  v_amount numeric(12,2);
  v_eligible_at timestamptz;
  v_cycle_due_date date;
begin
  if new.client_id is null or new.organization_id is null then return new; end if;
  if lower(trim(coalesce(new.payment_status, ''))) not in ('paid','received','confirmed','payment_received','succeeded','approved') then return new; end if;
  v_paid_at := coalesce(new.paid_at, new.created_at, now());

  select r.id, r.partner_id, r.first_paid_at into v_ref
  from public.cineplay_partner_referrals r
  where r.organization_id = new.organization_id and r.client_id = new.client_id and r.status = 'active'
  limit 1;
  if not found then return new; end if;
  if exists (select 1 from public.cineplay_partner_commissions c where c.payment_id = new.id) then return new; end if;

  select min(coalesce(p.paid_at, p.created_at)) into v_prior_paid_at
  from public.payments p
  where p.organization_id = new.organization_id and p.client_id = new.client_id and p.id <> new.id
    and lower(trim(coalesce(p.payment_status, ''))) in ('paid','received','confirmed','payment_received','succeeded','approved')
    and (coalesce(p.paid_at, p.created_at) < v_paid_at or (coalesce(p.paid_at, p.created_at) = v_paid_at and p.id < new.id));

  select s.commission_subscription, s.commission_renewal into v_settings
  from public.cineplay_partner_settings s where s.organization_id = new.organization_id;

  if v_ref.first_paid_at is null and v_prior_paid_at is null then
    v_type := 'subscription';
    v_amount := coalesce(v_settings.commission_subscription, 10);
    v_first_paid_at := v_paid_at;
    v_eligible_at := v_paid_at;
    v_cycle_due_date := null;
  else
    v_type := 'renewal';
    v_first_paid_at := coalesce(v_ref.first_paid_at, v_prior_paid_at, v_paid_at);
    v_amount := coalesce(v_settings.commission_renewal, 5);
    v_cycle_due_date := coalesce(new.due_date, v_paid_at::date);
    v_eligible_at := greatest(v_paid_at, v_first_paid_at + interval '30 days');
    if exists (
      select 1 from public.cineplay_partner_commissions c
      where c.referral_id = v_ref.id and c.commission_type = 'renewal'
        and c.cycle_due_date = v_cycle_due_date and c.status <> 'void'
    ) then
      update public.cineplay_partner_referrals
      set first_paid_at = coalesce(first_paid_at, v_first_paid_at), updated_at = now()
      where id = v_ref.id;
      return new;
    end if;
  end if;

  insert into public.cineplay_partner_commissions (
    organization_id, partner_id, referral_id, client_id, payment_id,
    commission_type, cycle_due_date, amount, status, earned_at, eligible_at
  ) values (
    new.organization_id, v_ref.partner_id, v_ref.id, new.client_id, new.id,
    v_type, v_cycle_due_date, v_amount, 'pending', v_paid_at, v_eligible_at
  ) on conflict do nothing;

  update public.cineplay_partner_referrals
  set first_paid_at = coalesce(first_paid_at, v_first_paid_at), updated_at = now()
  where id = v_ref.id;
  return new;
end;
$$;

revoke all on function public.cineplay_partner_process_payment() from public, anon, authenticated;
drop trigger if exists trg_cineplay_partner_payment_commission on public.payments;
create trigger trg_cineplay_partner_payment_commission
after insert or update of payment_status on public.payments
for each row execute function public.cineplay_partner_process_payment();

create or replace function public.cineplay_partner_mark_subscription_paid(p_commission_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commission record;
  v_partner record;
  v_payout_id uuid;
  v_now timestamptz := now();
begin
  select * into v_commission from public.cineplay_partner_commissions where id = p_commission_id for update;
  if not found then raise exception 'Comissão não encontrada.'; end if;
  if v_commission.commission_type <> 'subscription' or v_commission.status <> 'pending' then
    raise exception 'Esta comissão não está disponível para pagamento individual.';
  end if;
  select * into v_partner from public.cineplay_partners where id = v_commission.partner_id;
  if not found or coalesce(v_partner.pix_key, '') = '' or coalesce(v_partner.pix_key_type, '') = '' then
    raise exception 'O parceiro ainda não cadastrou uma chave Pix válida.';
  end if;
  insert into public.cineplay_partner_payouts (
    organization_id, partner_id, payout_type, amount, pix_key_type_snapshot,
    pix_key_snapshot, pix_holder_snapshot, paid_at, created_by, notes
  ) values (
    v_commission.organization_id, v_commission.partner_id, 'subscription',
    v_commission.amount, v_partner.pix_key_type, v_partner.pix_key,
    v_partner.pix_holder_name, v_now, p_actor_id, 'Pagamento individual da comissão por nova assinatura.'
  ) returning id into v_payout_id;
  update public.cineplay_partner_commissions
  set status = 'paid', payout_id = v_payout_id, paid_at = v_now
  where id = v_commission.id;
  return jsonb_build_object('ok', true, 'payout_id', v_payout_id, 'amount', v_commission.amount);
end;
$$;

create or replace function public.cineplay_partner_pay_monthly_renewals(p_partner_id uuid, p_close_date date, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner record;
  v_commission record;
  v_payout_id uuid;
  v_total numeric(12,2) := 0;
  v_count integer := 0;
  v_ids uuid[] := array[]::uuid[];
  v_now timestamptz := now();
  v_cutoff timestamptz;
begin
  select * into v_partner from public.cineplay_partners where id = p_partner_id;
  if not found then raise exception 'Parceiro não encontrado.'; end if;
  if coalesce(v_partner.pix_key, '') = '' or coalesce(v_partner.pix_key_type, '') = '' then
    raise exception 'O parceiro ainda não cadastrou uma chave Pix válida.';
  end if;
  v_cutoff := p_close_date::timestamp at time zone 'America/Maceio';

  for v_commission in
    select c.id, c.amount from public.cineplay_partner_commissions c
    where c.organization_id = v_partner.organization_id and c.partner_id = v_partner.id
      and c.commission_type = 'renewal' and c.status = 'pending' and c.eligible_at < v_cutoff
    order by c.eligible_at, c.created_at for update
  loop
    v_total := v_total + v_commission.amount;
    v_count := v_count + 1;
    v_ids := array_append(v_ids, v_commission.id);
  end loop;

  if v_count = 0 or v_total <= 0 then
    return jsonb_build_object('ok', true, 'paid', false, 'count', 0, 'amount', 0);
  end if;

  insert into public.cineplay_partner_payouts (
    organization_id, partner_id, payout_type, period_start, period_end, amount,
    pix_key_type_snapshot, pix_key_snapshot, pix_holder_snapshot, paid_at, created_by, notes
  ) values (
    v_partner.organization_id, v_partner.id, 'monthly_renewals',
    date_trunc('month', p_close_date::timestamp)::date, p_close_date, v_total,
    v_partner.pix_key_type, v_partner.pix_key, v_partner.pix_holder_name,
    v_now, p_actor_id, 'Fechamento mensal das comissões de renovação.'
  ) returning id into v_payout_id;

  update public.cineplay_partner_commissions
  set status = 'paid', payout_id = v_payout_id, paid_at = v_now
  where id = any(v_ids);
  return jsonb_build_object('ok', true, 'paid', true, 'payout_id', v_payout_id, 'count', v_count, 'amount', v_total);
end;
$$;

revoke all on function public.cineplay_partner_mark_subscription_paid(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cineplay_partner_pay_monthly_renewals(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.cineplay_partner_mark_subscription_paid(uuid, uuid) to service_role;
grant execute on function public.cineplay_partner_pay_monthly_renewals(uuid, date, uuid) to service_role;
