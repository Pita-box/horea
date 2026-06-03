-- Supabase linked CLI role cannot create custom functions in the managed auth schema.
-- These helpers live in public but still derive identity from auth.uid().
create or replace function public.current_user_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select businesses.id
  from public.businesses
  where businesses.owner_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select users.is_admin
      from public.users
      where users.id = auth.uid()
    ),
    false
  )
$$;

grant execute on function public.current_user_business_id() to authenticated;
grant execute on function public.current_user_is_admin() to anon, authenticated;

create policy tenant_isolation on public.businesses
  for all
  to authenticated
  using (id = public.current_user_business_id() or public.current_user_is_admin())
  with check (owner_user_id = auth.uid() or public.current_user_is_admin());

create policy tenant_isolation on public.services
  for all
  to authenticated
  using (business_id = public.current_user_business_id() or public.current_user_is_admin())
  with check (business_id = public.current_user_business_id() or public.current_user_is_admin());

create policy tenant_isolation on public.opening_hours
  for all
  to authenticated
  using (business_id = public.current_user_business_id() or public.current_user_is_admin())
  with check (business_id = public.current_user_business_id() or public.current_user_is_admin());

create policy tenant_isolation on public.reservations
  for all
  to authenticated
  using (business_id = public.current_user_business_id() or public.current_user_is_admin())
  with check (business_id = public.current_user_business_id() or public.current_user_is_admin());

create policy tenant_isolation on public.clients
  for all
  to authenticated
  using (business_id = public.current_user_business_id() or public.current_user_is_admin())
  with check (business_id = public.current_user_business_id() or public.current_user_is_admin());

create policy tenant_isolation on public.subscriptions
  for all
  to authenticated
  using (business_id = public.current_user_business_id() or public.current_user_is_admin())
  with check (business_id = public.current_user_business_id() or public.current_user_is_admin());

create policy tenant_isolation on public.payments
  for all
  to authenticated
  using (business_id = public.current_user_business_id() or public.current_user_is_admin())
  with check (business_id = public.current_user_business_id() or public.current_user_is_admin());
