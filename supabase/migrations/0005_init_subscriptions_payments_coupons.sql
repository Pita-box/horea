create type public.subscription_plan as enum (
  'start',
  'pokrocily',
  'max'
);

create type public.subscription_status as enum (
  'free',
  'active',
  'grace_period',
  'expired',
  'deleted_data'
);

create type public.payment_status as enum (
  'pending',
  'paid',
  'failed'
);

create type public.payment_method as enum (
  'auto_charge',
  'qr_manual',
  'admin_manual'
);

create type public.coupon_type as enum (
  'percent',
  'fixed',
  'free_trial_days',
  'comp'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  plan public.subscription_plan,
  status public.subscription_status not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  gopay_schedule_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_order check (
    current_period_start is null
    or current_period_end is null
    or current_period_start < current_period_end
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount_czk numeric(10, 2) not null,
  currency char(3) not null default 'CZK',
  variable_symbol text not null unique,
  gopay_payment_id text unique,
  status public.payment_status not null default 'pending',
  method public.payment_method not null,
  invoice_url text,
  created_at timestamptz not null default now(),
  constraint payments_amount_czk_non_negative check (amount_czk >= 0),
  constraint payments_currency_czk check (currency = 'CZK')
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type public.coupon_type not null,
  discount_value numeric(10, 2),
  valid_until timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint coupons_max_uses_non_negative check (max_uses is null or max_uses >= 0),
  constraint coupons_used_count_non_negative check (used_count >= 0),
  constraint coupons_used_count_within_max check (max_uses is null or used_count <= max_uses)
);

create index subscriptions_business_id_idx on public.subscriptions (business_id);
create index payments_business_id_idx on public.payments (business_id);
create index payments_subscription_id_idx on public.payments (subscription_id);
