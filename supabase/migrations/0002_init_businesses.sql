create type public.business_type as enum (
  'kadernik',
  'nehtove_studio',
  'bistro',
  'masazni_salon',
  'spa',
  'beauty',
  'ostatni'
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  slug text not null unique,
  name text not null,
  type public.business_type not null,
  description text,
  logo_url text,
  is_published boolean not null default false,
  auto_approve_reservations boolean not null default false,
  allow_parallel_slots boolean not null default false,
  last_backup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_owner_user_id_unique unique (owner_user_id)
);

create index businesses_slug_idx on public.businesses (slug);
create index businesses_owner_user_id_idx on public.businesses (owner_user_id);
