create extension if not exists pgcrypto with schema extensions;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  is_admin boolean not null default false,
  dpa_version_accepted text,
  dpa_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Application user profile extending auth.users. Password hashes remain managed by Supabase Auth.';
comment on column public.users.id is 'Matches auth.users.id.';
