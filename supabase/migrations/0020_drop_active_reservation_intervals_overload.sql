-- Migrace 0020: odstranění přetížení funkce get_active_reservation_intervals.
--
-- Problém: migrace 0016 vytvořila 3-argumentovou variantu
--   get_active_reservation_intervals(p_business_id, p_from, p_to)
-- a migrace 0019 přidala 4-argumentovou variantu s volitelným
--   p_exclude_reservation_id (default null). `create or replace` se 4. parametrem
-- ale NEVYTVOŘÍ náhradu 3-arg funkce — vytvoří NOVOU funkci s jinou signaturou.
-- Obě tak v DB koexistují a PostgREST při volání se třemi argumenty nedokáže
-- vybrat kandidáta → PGRST203 „Could not choose the best candidate function".
-- Důsledek: veřejná stránka padá při načítání slotů (available_slots_failed).
--
-- Řešení: zahodit starou 3-argumentovou variantu. Zůstane jen 4-arg funkce
-- s `p_exclude_reservation_id uuid default null`, takže tříargumentové volání
-- (veřejná stránka / insert cesta) se korektně rozhodne pro ni a default doplní
-- null (nic nevyloučí). Čtyřargumentové volání (úprava rezervace) funguje dál.

drop function if exists public.get_active_reservation_intervals(uuid, timestamptz, timestamptz);
