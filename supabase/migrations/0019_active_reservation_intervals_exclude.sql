-- Migrace 0019: rozšíření SECURITY DEFINER funkce get_active_reservation_intervals
-- o volitelné vyloučení jedné rezervace z výsledku (`p_exclude_reservation_id`).
--
-- Kontext: úprava rezervace (`Reservation_Editor`, spec reservation-management R9.3)
-- musí při re-checku dostupnosti slotu VYLOUČIT sebe sama — jinak by upravovaná
-- rezervace kolidovala se svým vlastním (starým) intervalem a slot by vypadal
-- obsazeně. Insert cesta (`ReservationCreator`, `Manual_Reservation_Creator`)
-- parametr nepoužívá a chová se beze změny.
--
-- Parametr má DEFAULT null a přidává se přes `create or replace`, takže stávající
-- volání se třemi argumenty (veřejná stránka pod anon, insert cesta) funguje
-- nezměněně — default vyhodnotí podmínku na `true` a nic nevyloučí.

create or replace function public.get_active_reservation_intervals(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude_reservation_id uuid default null
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.starts_at, r.ends_at
  from public.reservations r
  where r.business_id = p_business_id
    and r.status in ('pending', 'approved')
    and r.starts_at >= p_from
    and r.starts_at < p_to
    and (p_exclude_reservation_id is null or r.id != p_exclude_reservation_id)
    and public.is_business_published(p_business_id);
$$;

comment on function public.get_active_reservation_intervals(uuid, timestamptz, timestamptz, uuid) is
  'Vrací jen časové intervaly (starts_at, ends_at) aktivních rezervací (pending/approved) Published_Business v okně [p_from, p_to). Volitelný p_exclude_reservation_id vyloučí jednu rezervaci (vyloučení sebe sama při úpravě). Bez PII.';

-- Zachováváme grant z migrace 0016 i pro novou signaturu se čtyřmi parametry.
revoke all on function public.get_active_reservation_intervals(uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public.get_active_reservation_intervals(uuid, timestamptz, timestamptz, uuid) to anon, authenticated, service_role;
