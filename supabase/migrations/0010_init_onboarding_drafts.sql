create table public.onboarding_drafts (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_step smallint not null default 0,
  type_data jsonb,
  slug_data jsonb,
  profile_data jsonb,
  services_data jsonb,
  hours_data jsonb,
  updated_at timestamptz not null default now(),
  constraint onboarding_drafts_current_step_range check (current_step between 0 and 5)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger onboarding_drafts_set_updated_at
  before update on public.onboarding_drafts
  for each row
  execute function public.set_updated_at();

comment on table public.onboarding_drafts is 'Server-side persistence for an authenticated user onboarding wizard draft.';
