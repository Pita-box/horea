-- Migrace 0053: tabulka public.system_settings (feature `admin-system-tools`, task 22.1).
--
-- ÚČEL: obecné klíč/hodnota úložiště provozních nastavení. První a jediný
-- současný uživatel je klíč `test_email_last_sent_at` — ISO časové razítko
-- posledního úspěšného odeslání testovacího e-mailu. Slouží k vynucení cooldownu
-- napříč serverless instancemi a nasazeními (modulová proměnná není spolehlivá
-- přes studené starty / izoláty).
--
-- POZOR — obsah: ukládá se VÝHRADNĚ časové razítko. Žádný Secret_Value
-- (klíče, hesla, tokeny) ani Personal_Data (e-maily, telefony) sem nepatří.
--
-- DVĚ VRSTVY PŘÍSTUPU (obě jsou potřeba):
--   1. RLS policy — přihlášený admin smí nastavení pouze ČÍST (admin select přes
--      public.current_user_is_admin()). Bez policy pro INSERT/UPDATE je RLS pro
--      anon/authenticated zamítne.
--   2. Table-level GRANT/REVOKE — service_role (kterým server action zapisuje
--      `last_sent_at`) OBCHÁZÍ RLS, takže jeho oprávnění stojí na úrovni grantů:
--      INSERT + UPDATE + SELECT. Zápis běží výhradně ze server-only kódu.
-- _Requirements: 22.4_

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Zapnout RLS — od této chvíle musí být každý přístup rolí anon/authenticated
-- výslovně povolen policy; co není povoleno, je zamítnuto.
alter table public.system_settings enable row level security;

-- Jediná povolená policy pro authenticated: ČTENÍ přihlášeným adminem.
-- Žádná policy pro INSERT ani UPDATE → tyto operace jsou pro authenticated zamítnuty;
-- zápis obstarává service_role (obchází RLS, viz granty níže).
create policy system_settings_admin_select on public.system_settings
  for select
  to authenticated
  using (public.current_user_is_admin());

-- Table-level granty: nejprve odebrat vše aplikačním rolím i public/anon,
-- pak vrátit pouze nezbytné minimum.
revoke all on public.system_settings from public;
revoke all on public.system_settings from anon;
revoke all on public.system_settings from authenticated;
revoke all on public.system_settings from service_role;

-- authenticated: pouze SELECT (čtení adminem skrze policy system_settings_admin_select).
grant select on public.system_settings to authenticated;

-- service_role: INSERT + UPDATE + SELECT (čtení/zápis cooldownu ze server action).
grant insert, update, select on public.system_settings to service_role;
