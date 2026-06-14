-- Migrace 0033: ověření RLS admin override pro tenant-scoped data
-- (feature `admin-dashboard`, Access_Guard / privilegovaný přístup, task 2.2).
--
-- CÍL (R1.4): přihlášený administrátor (`users.is_admin = true`) musí mít možnost
-- ČÍST tenant-scoped data VŠECH podniků — `businesses`, `subscriptions`,
-- `payments`. Cross-tenant ZÁPISY (R1.5) běží výhradně server-side přes service
-- role klíč, který RLS obchází, takže se na úrovni policy neřeší.
--
-- ZJIŠTĚNÝ STAV (nic neduplikujeme):
--   * `public.businesses`     — policy `tenant_isolation` (migrace 0007),
--                               USING ... or public.current_user_is_admin()  → admin čte vše ✔
--   * `public.subscriptions`  — policy `tenant_isolation` (migrace 0007),
--                               USING ... or public.current_user_is_admin()  → admin čte vše ✔
--   * `public.payments`       — policy `tenant_isolation` (migrace 0007),
--                               USING ... or public.current_user_is_admin()  → admin čte vše ✔
--   * `public.users`/`coupons`— policy `admin_full_access` (migrace 0009)     → admin čte vše ✔
--
-- Admin override pro businesses/subscriptions/payments je tedy již PLNĚ pokryt
-- existujícími tenant policies (0007). Tato migrace proto NEZAVÁDÍ duplicitní
-- policy — slouží jako VERIFIKACE a idempotentní bezpečnostní síť: pro každou
-- ze tří tabulek ověří, že existuje policy umožňující adminovi čtení, a doplní
-- minimální admin SELECT override jen tehdy, kdyby chyběla (žádný běžící stav
-- to dnes nespustí).
-- _Requirements: 1.4, 1.5_

do $$
declare
  v_table text;
  v_has_admin_read boolean;
begin
  foreach v_table in array array['businesses', 'subscriptions', 'payments']
  loop
    -- Existuje pro tabulku policy, která adminovi povoluje čtení?
    -- (USING výraz odkazuje na public.current_user_is_admin() a pokrývá SELECT,
    --  tj. cmd 'ALL' nebo 'SELECT'.)
    select exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and cmd in ('ALL', 'SELECT')
        and coalesce(qual, '') ilike '%current_user_is_admin%'
    )
    into v_has_admin_read;

    if v_has_admin_read then
      raise notice 'RLS admin override pro public.% je již pokryt existující policy — nic se nemění.', v_table;
    else
      -- Bezpečnostní síť: doplníme minimální admin SELECT override.
      execute format(
        'create policy admin_read_override on public.%I for select to authenticated using (public.current_user_is_admin())',
        v_table
      );
      raise notice 'RLS admin override pro public.% chyběl — doplněna policy admin_read_override.', v_table;
    end if;
  end loop;
end;
$$;
