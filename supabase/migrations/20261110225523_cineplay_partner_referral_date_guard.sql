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
  if lower(trim(coalesce(new.payment_status, ''))) not in
    ('paid','received','confirmed','payment_received','succeeded','approved') then
    return new;
  end if;

  v_paid_at := coalesce(new.paid_at, new.created_at, now());

  select r.id, r.partner_id, r.first_paid_at, r.referred_at
    into v_ref
  from public.cineplay_partner_referrals r
  where r.organization_id = new.organization_id
    and r.client_id = new.client_id
    and r.status = 'active'
  limit 1;

  if not found then return new; end if;
  if v_paid_at < v_ref.referred_at then return new; end if;

  if exists (
    select 1 from public.cineplay_partner_commissions c
    where c.payment_id = new.id
  ) then
    return new;
  end if;

  select min(coalesce(p.paid_at, p.created_at))
    into v_prior_paid_at
  from public.payments p
  where p.organization_id = new.organization_id
    and p.client_id = new.client_id
    and p.id <> new.id
    and lower(trim(coalesce(p.payment_status, ''))) in
      ('paid','received','confirmed','payment_received','succeeded','approved')
    and (
      coalesce(p.paid_at, p.created_at) < v_paid_at
      or (
        coalesce(p.paid_at, p.created_at) = v_paid_at
        and p.id < new.id
      )
    );

  select s.commission_subscription, s.commission_renewal
    into v_settings
  from public.cineplay_partner_settings s
  where s.organization_id = new.organization_id;

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
      select 1
      from public.cineplay_partner_commissions c
      where c.referral_id = v_ref.id
        and c.commission_type = 'renewal'
        and c.cycle_due_date = v_cycle_due_date
        and c.status <> 'void'
    ) then
      update public.cineplay_partner_referrals
      set first_paid_at = coalesce(first_paid_at, v_first_paid_at),
          updated_at = now()
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
  )
  on conflict do nothing;

  update public.cineplay_partner_referrals
  set first_paid_at = coalesce(first_paid_at, v_first_paid_at),
      updated_at = now()
  where id = v_ref.id;

  return new;
end;
$$;