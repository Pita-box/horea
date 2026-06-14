-- Migrace 0024: rozšíření tabulky `subscriptions` o sloupce životního cyklu
-- předplatného pro feature `subscription-payments`.
--
-- Aditivní migrace: přidává TŘI sloupce, nemění ani nemaže žádná existující
-- data. Stávající předplatná dostanou `auto_renew = true` (výchozí chování),
-- `first_failed_charge_at = NULL` a `pending_plan_change = NULL`.

-- 1) auto_renew — řídí automatickou obnovu předplatného. `true` = na konci
--    období se iniciuje strhnutí (Billing_Cron); `false` = na konci období
--    přechod do `expired` bez stržení. Výchozí `true`, aby nově vytvořená i
--    existující předplatná pokračovala v automatické obnově.
--    _Requirements: 11.1, 11.3_
alter table public.subscriptions
  add column if not exists auto_renew boolean not null default true;

comment on column public.subscriptions.auto_renew is
  'Automatická obnova předplatného: true = na konci období se iniciuje strhnutí, false = přechod do expired bez stržení. Výchozí true.';

-- 2) first_failed_charge_at — kotva (anchor) stavového automatu. Nastaví se při
--    PRVNÍM selhání strhnutí (bez přepisu existující hodnoty) a smaže se
--    (`NULL`) při úspěšné platbě / reaktivaci. Z této kotvy se deterministicky
--    odvozují přechody grace_period → expired → deleted_data. Nullable:
--    `NULL` znamená, že žádné selhání není evidováno (předplatné je v pořádku).
--    _Requirements: 6.4, 6.7_
alter table public.subscriptions
  add column if not exists first_failed_charge_at timestamptz;

comment on column public.subscriptions.first_failed_charge_at is
  'Kotva stavového automatu: čas prvního selhání strhnutí (bez přepisu), NULL při úspěšné platbě/reaktivaci. Z kotvy se odvozují přechody grace_period/expired/deleted_data.';

-- 3) pending_plan_change — evidovaná žádost o změnu tarifu, která se aplikuje
--    až na konci aktuálního období (žádná prorace). Aktuální `plan` se nemění,
--    dokud období neskončí. Používá existující enum `subscription_plan`.
--    Nullable: `NULL` = žádná nevyřízená změna.
--    _Requirements: 8.1_
alter table public.subscriptions
  add column if not exists pending_plan_change public.subscription_plan;

comment on column public.subscriptions.pending_plan_change is
  'Nevyřízená změna tarifu aplikovaná na konci období (bez prorace). NULL = žádná změna; aktuální plan se mění až při dosažení current_period_end.';
