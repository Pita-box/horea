create policy admin_full_access on public.users
  for all
  to authenticated
  using (auth.is_admin())
  with check (auth.is_admin());

create policy admin_full_access on public.coupons
  for all
  to authenticated
  using (auth.is_admin())
  with check (auth.is_admin());
