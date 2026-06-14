alter table public.onboarding_drafts enable row level security;

grant select, insert, update, delete on public.onboarding_drafts to authenticated;

create policy own_draft_only on public.onboarding_drafts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
