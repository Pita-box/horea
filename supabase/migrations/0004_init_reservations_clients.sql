create type public.reservation_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  client_name text not null,
  client_phone text,
  client_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.reservation_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_valid_interval check (starts_at < ends_at),
  constraint reservations_client_contact_present check (
    nullif(btrim(coalesce(client_phone, '')), '') is not null
    or nullif(btrim(coalesce(client_email, '')), '') is not null
  )
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reservations_business_id_starts_at_idx on public.reservations (business_id, starts_at);
create index reservations_service_id_idx on public.reservations (service_id);
create index clients_business_id_idx on public.clients (business_id);
