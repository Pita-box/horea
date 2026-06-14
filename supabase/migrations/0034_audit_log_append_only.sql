-- Migrace 0034: append-only vynucení nad public.audit_log na úrovni databáze
-- (feature `admin-dashboard`, Audit_Log, task 1.2).
--
-- CÍL (R9.5, Property 3): jednou zapsaný auditní záznam nelze ŽÁDNOU cestou
-- změnit (`UPDATE`) ani odstranit (`DELETE`) — ani z administrátorského rozhraní,
-- ani přímým service-role zápisem. Povoleny zůstávají výhradně `INSERT` a `SELECT`.
--
-- DVĚ VRSTVY VYNUCENÍ (obě jsou potřeba):
--   1. RLS policy — řídí přístup rolí `anon`/`authenticated` (přihlášený admin
--      smí auditní stopu pouze ČÍST přes RLS admin override, R10). Bez policy pro
--      UPDATE/DELETE je RLS ve výchozím stavu zamítne.
--   2. Table-level GRANT/REVOKE — `service_role` (kterým AuditLogger zapisuje)
--      OBCHÁZÍ RLS, takže jeho omezení MUSÍ stát na úrovni table grantů. Proto se
--      `UPDATE`/`DELETE` service_role explicitně odebírá a ponechává se mu jen
--      `INSERT` + `SELECT`.
--
-- POZN.: vlastník tabulky (migrující superuser) má vždy plná práva a obchází RLS
-- i granty — to je standardní a týká se pouze migrací, nikoli běhové aplikace.
-- Append-only se tedy vztahuje na všechny aplikační role, jak požaduje R9.5.
--
-- Vlastní INSERT auditních záznamů ve stejné transakci jako citlivá akce řeší
-- SECURITY DEFINER funkce `write_audit_log` (samostatná migrace 0035, task 3.1);
-- funkce běží jako vlastník, takže append-only granty aplikačních rolí jí
-- nebrání v zápisu.
-- _Requirements: 9.5_
-- _Properties: 3_

-- (1) Zapnout RLS — od této chvíle musí být každý přístup rolí anon/authenticated
--     výslovně povolen policy; co není povoleno, je zamítnuto.
alter table public.audit_log enable row level security;

-- (2) Jediná povolená policy pro authenticated: ČTENÍ přihlášeným adminem
--     (prohlížení auditní stopy, R10, přes RLS admin override). Žádná policy pro
--     UPDATE ani DELETE neexistuje → tyto operace jsou pro authenticated zamítnuty.
create policy audit_log_admin_select on public.audit_log
  for select
  to authenticated
  using (public.current_user_is_admin());

-- (3) Table-level granty: vyčistit a nastavit výhradně append-only přístup.
--     Nejprve odebrat vše aplikačním rolím (service_role obchází RLS — viz hlavička),
--     pak vrátit pouze to, co append-only dovoluje.
revoke all on public.audit_log from public;
revoke all on public.audit_log from anon;
revoke all on public.audit_log from authenticated;
revoke all on public.audit_log from service_role;

-- authenticated: pouze SELECT (čtení adminem skrze policy audit_log_admin_select).
grant select on public.audit_log to authenticated;

-- service_role: pouze INSERT + SELECT — žádné UPDATE/DELETE (append-only i pro
--     service role). AuditLogger zapisuje přes service role / SECURITY DEFINER
--     funkci write_audit_log; čtení (AuditLogViewer) může běžet i přes service role.
grant insert, select on public.audit_log to service_role;
