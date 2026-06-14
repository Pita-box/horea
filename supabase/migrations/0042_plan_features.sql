-- Migrace 0042: matice funkcí per tarif (entitlements) — admin nastavuje, které
-- funkce podniku jsou povolené v jakém tarifu (start / pokrocily / max).
--
-- NÁVRH „CHYBĚJÍCÍ ŘÁDEK = POVOLENO": tabulka neobsahuje seed. Gating v aplikaci
-- (`lib/plans/feature-matrix.ts`) interpretuje chybějící řádek jako `enabled = true`.
-- Díky tomu je výchozí stav „vše povoleno pro všechny tarify" (test mode) bez nutnosti
-- duplikovat katalog feature keys (ten žije v TS `lib/plans/features.ts`). Admin
-- vypnutím funkce vloží/aktualizuje řádek s `enabled = false`.
--
-- KEY: `feature_key` je volný text odpovídající `BusinessFeatureKey` v TS katalogu
-- (záměrně bez FK/enumu — katalog se vyvíjí v kódu, ne v DB).
--
-- PŘÍSTUP: čtení i zápis probíhá výhradně server-side přes service-role (gating
-- loader + admin server action). RLS je zapnuté bez politik → deny-all pro anon i
-- authenticated; service_role RLS obchází. Auditní zápis řeší aplikace přes
-- `write_audit_log` (migrace 0035) s action_type `plan_feature_update`.

create table public.plan_features (
  plan public.subscription_plan not null,
  feature_key text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (plan, feature_key)
);

comment on table public.plan_features is
  'Matice entitlements: která funkce podniku je povolená v jakém tarifu. Chybějící řádek = povoleno (default). Spravuje admin; čte gating vrstva. Přístup jen service-role (RLS deny-all).';
comment on column public.plan_features.feature_key is
  'Klíč funkce odpovídající BusinessFeatureKey v lib/plans/features.ts (volný text, bez FK).';
comment on column public.plan_features.enabled is
  'Zda je funkce v daném tarifu povolená. Chybějící řádek se interpretuje jako true.';

alter table public.plan_features enable row level security;
-- Bez politik: deny-all pro anon/authenticated; service_role (server-side) RLS obchází.
