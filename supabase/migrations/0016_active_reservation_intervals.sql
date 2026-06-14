-- Migrace 0016: SECURITY DEFINER funkce pro čtení časových intervalů aktivních
-- rezervací (BEZ PII) pro výpočet dostupných slotů na veřejné stránce.
--
-- Kontext: AvailableSlotsService běží pod ANON klíčem a pro výpočet volných
-- termínů potřebuje znát obsazené intervaly. Anon ale NESMÍ číst tabulku
-- `reservations` (migrace 0014 — explicitní deny + revoke; tabulka obsahuje PII
-- klienta: jméno, telefon, e-mail, poznámku). Přímý SELECT pod anon proto padá
-- s `42501 permission denied`.
--
-- Tato funkce vrací VÝHRADNĚ dvojici (starts_at, ends_at) aktivních rezervací
-- (status pending/approved) daného podniku v okně [p_from, p_to) — žádné
-- kontaktní údaje. Slot_Calculator z těchto intervalů spočítá kolize, aniž by
-- anon kdy viděl PII. Deny policy na tabulce `reservations` zůstává beze změny.
--
-- Navíc je výstup omezen na Published_Business (anon by neměl zjišťovat obsazenost
-- nepublikovaného podniku) — pro nepublikovaný podnik vrátí prázdno.

create or replace function public.get_active_reservation_intervals(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
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
    and public.is_business_published(p_business_id);
$$;

comment on function public.get_active_reservation_intervals(uuid, timestamptz, timestamptz) is
  'Vrací jen časové intervaly (starts_at, ends_at) aktivních rezervací (pending/approved) Published_Business v okně [p_from, p_to). Bez PII. Umožňuje anon výpočet dostupných slotů, aniž by měl přístup k tabulce reservations.';

-- Funkci volá veřejná stránka pod anon klíčem i server-side ReservationCreator.
revoke all on function public.get_active_reservation_intervals(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_active_reservation_intervals(uuid, timestamptz, timestamptz) to anon, authenticated, service_role;
