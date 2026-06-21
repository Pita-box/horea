-- ---------------------------------------------------------------------------
-- 0052 — Perzistence běhů cronů (cron_runs)
-- ---------------------------------------------------------------------------
-- Feature `admin-system-tools`, sekce Cron_Monitor + Cron_Trigger + recordCronRun.
--
-- Tabulka cron_runs uchovává záznamy o jednotlivých bězích plánovaných i ručně
-- spuštěných cron jobů (cleanup | billing | warnings | email-retry). Slouží jako
-- zdroj pravdy pro monitoring posledního běhu na stránce /admin/system (R11) a pro
-- výsledek ručního spuštění (R12). Jde o provozní telemetrii, NIKOLI o auditní
-- stopu — na rozdíl od append-only Audit_Log smí být cron_runs prořezáván retencí
-- (R19).
--
-- Zápis běhu (start + finish) probíhá VÝHRADNĚ přes service-role klienta z helperu
-- recordCronRun() v cron routách; service role obchází RLS. Čtení je vyhrazeno
-- přihlášenému administrátorovi přes RLS admin override (public.current_user_is_admin()).
-- Detail (jsonb) nese metriky běhu (processed/failed…) a nesmí obsahovat tajemství.
-- _Requirements: 11.4, 15.4_

create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,                          -- 'cleanup' | 'billing' | 'warnings' | 'email-retry'
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,                       -- 'ok' | 'error'
  trigger text not null default 'scheduled',  -- 'scheduled' | 'manual'
  detail jsonb,                               -- metriky běhu (processed/failed…), BEZ Secret_Value
  created_at timestamptz not null default now()
);

create index if not exists cron_runs_job_started_idx
  on public.cron_runs (job, started_at desc);

comment on table public.cron_runs is
  'Záznamy běhů cron jobů (monitoring posledního běhu + výsledek ručního spuštění). Provozní telemetrie (lze prořezávat retencí), ne auditní stopa. Zápis jen service-role.';

-- ---------------------------------------------------------------------------
-- RLS — čtení jen pro přihlášeného admina, zápis výhradně přes service role
-- ---------------------------------------------------------------------------
-- (1) Zapnout RLS: bez výslovné policy je každý přístup rolí anon/authenticated
--     zamítnut.
alter table public.cron_runs enable row level security;

-- (2) Jediná povolená policy pro authenticated: ČTENÍ přihlášeným adminem
--     (monitoring cronů na /admin/system, R11) přes RLS admin override.
drop policy if exists cron_runs_admin_select on public.cron_runs;
create policy cron_runs_admin_select on public.cron_runs
  for select
  to authenticated
  using (public.current_user_is_admin());

-- (3) Table-level granty: vyčistit a nastavit minimální přístup.
--     service_role obchází RLS, proto se jeho rozsah řídí výhradně granty.
revoke all on public.cron_runs from public;
revoke all on public.cron_runs from anon;
revoke all on public.cron_runs from authenticated;
revoke all on public.cron_runs from service_role;

-- authenticated: pouze SELECT (čte admin skrze policy cron_runs_admin_select).
grant select on public.cron_runs to authenticated;

-- service_role: INSERT + UPDATE + SELECT — zápis běhů (start + následný finish)
--     přes recordCronRun(), čtení (Cron_Monitor) může běžet i přes service role.
grant insert, update, select on public.cron_runs to service_role;
