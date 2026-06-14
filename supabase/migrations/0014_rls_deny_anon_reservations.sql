-- Migrace 0014: explicitní (defense-in-depth) zákaz anon přístupu k reservations
--
-- Kontext: migrace 0006 anonovi NEUDĚLILA žádný grant na public.reservations, takže
-- anon už teď nemůže číst ani zapisovat. Tato migrace přidává EXPLICITNÍ obrannou
-- vrstvu, aby se případný budoucí nechtěný grant nebo chyba v jiné migraci nemohly
-- projevit únikem rezervací nebo neoprávněným zápisem dat klientů.
--
-- INSERT do reservations probíhá VÝHRADNĚ přes server-side service role klíč
-- (ReservationCreator server action), který RLS obchází automaticky — restriktivní
-- policy níže se ho proto NETÝKÁ. Anon klíč se pro zápis rezervací NIKDY nepoužívá
-- (R15.4).

-- 1) Odebrat anonovi jakýkoli (i omylem udělený) grant na reservations.
revoke all on public.reservations from anon;

-- 2) Restriktivní policy: pro roli anon zakázat VŠECHNY operace (select/insert/update/delete).
--    AS RESTRICTIVE => kombinuje se s ostatními policies přes AND, takže i kdyby
--    někdy vznikla permisivní policy pro anon, tato ji přebije. using (false) /
--    with check (false) => žádný řádek nikdy neprojde čtením ani zápisem pod anonem.
drop policy if exists deny_anon_reservations on public.reservations;
create policy deny_anon_reservations on public.reservations
  as restrictive
  for all
  to anon
  using (false)
  with check (false);
