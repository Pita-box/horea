alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.opening_hours enable row level security;
alter table public.reservations enable row level security;
alter table public.clients enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.coupons enable row level security;

grant usage on schema public to anon, authenticated;

grant select on public.businesses to anon;
grant select on public.services to anon;
grant select on public.opening_hours to anon;

grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.opening_hours to authenticated;
grant select, insert, update, delete on public.reservations to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
