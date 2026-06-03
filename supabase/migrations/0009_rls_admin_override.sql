create policy admin_full_access on public.users
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy admin_full_access on public.coupons
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
