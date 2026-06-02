create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  duration_minutes integer not null,
  price_czk numeric(10, 2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_duration_minutes_positive check (duration_minutes > 0),
  constraint services_price_czk_non_negative check (price_czk >= 0)
);

create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week integer not null,
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opening_hours_day_of_week_range check (day_of_week between 0 and 6),
  constraint opening_hours_valid_interval check (opens_at < closes_at),
  constraint opening_hours_business_day_unique unique (business_id, day_of_week)
);

create index services_business_id_idx on public.services (business_id);
create index opening_hours_business_id_idx on public.opening_hours (business_id);
