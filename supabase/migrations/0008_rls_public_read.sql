create policy public_read_published on public.businesses
  for select
  to anon
  using (is_published = true);

create policy public_read_published_services on public.services
  for select
  to anon
  using (
    exists (
      select 1
      from public.businesses
      where businesses.id = services.business_id
        and businesses.is_published = true
    )
  );

create policy public_read_published_opening_hours on public.opening_hours
  for select
  to anon
  using (
    exists (
      select 1
      from public.businesses
      where businesses.id = opening_hours.business_id
        and businesses.is_published = true
    )
  );
