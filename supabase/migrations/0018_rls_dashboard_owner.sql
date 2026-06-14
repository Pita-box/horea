-- Migrace 0018: RLS izolace dashboardu majitele pro `reservations` a `clients`
--               (třetí, databázová vrstva — defense-in-depth, R1.4 / R1.5).
--
-- ZÁVĚR ANALÝZY: požadovaná izolace JIŽ EXISTUJE.
--
-- Migrace 0007 (`0007_rls_tenant_policies.sql`) vytváří na obou tabulkách
-- `public.reservations` i `public.clients` policy `tenant_isolation`:
--
--     create policy tenant_isolation on public.reservations
--       for all                              -- pokrývá SELECT, INSERT, UPDATE, DELETE
--       to authenticated
--       using      (business_id = public.current_user_business_id() or public.current_user_is_admin())
--       with check (business_id = public.current_user_business_id() or public.current_user_is_admin());
--
-- (analogicky pro `public.clients`).
--
-- Tím je R1.4 (všechny dotazy omezené na business_id přihlášeného majitele) i
-- R1.5 (zápis/čtení cizího business_id odmítnut) na DB vrstvě splněno:
--   * `using`      brání majiteli VIDĚT cizí řádky (SELECT/UPDATE/DELETE),
--   * `with check`  brání majiteli ZAPSAT řádek s cizím business_id (INSERT/UPDATE).
-- Grant select/insert/update/delete pro `authenticated` dává migrace 0006.
-- Žádná z migrací 0008–0016 tyto policies nemění.
--
-- Vytvářet zde nové policy by znamenalo DUPLIKACI (kolize názvu `tenant_isolation`)
-- a porušení Simplicity First. Tato migrace proto NEVYTVÁŘÍ nové policies — pouze
-- IDEMPOTENTNĚ OVĚŘUJE, že invariant, na kterém dashboard staví, skutečně platí.
-- Pokud by očekávané policies chyběly (např. po manuálním zásahu), migrace selže
-- s jasnou hláškou místo tichého úniku dat napříč podniky.

do $$
declare
  missing text;
begin
  select string_agg(format('%s.%s', t.schemaname, t.tablename), ', ')
    into missing
  from (values
    ('public', 'reservations'),
    ('public', 'clients')
  ) as t(schemaname, tablename)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = t.schemaname
      and p.tablename = t.tablename
      and p.policyname = 'tenant_isolation'
  );

  if missing is not null then
    raise exception
      'Chybí RLS policy tenant_isolation na: %. Dashboard majitele (R1.4/R1.5) vyžaduje tenant izolaci z migrace 0007.',
      missing;
  end if;
end;
$$;
