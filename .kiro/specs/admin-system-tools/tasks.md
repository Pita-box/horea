# Implementation Plan: admin-system-tools

## Overview

Implementace postupuje od čistého, testovatelného jádra k I/O vrstvě, migracím, server actions a UI:

1. **Čisté funkce** (`src/lib/system/`) — mapování stavu, agregace, config report, allowlist, redakce, a nově build info, outbox agregace, stav záloh, prune cutoff, čerstvost webhooku, cooldown testovacího e-mailu, rozvrh/drift cronů — a jejich property testy (P1–P14).
2. **I/O vrstva** — orchestrace health checku, čtení `process.env`, čtení `email_outbox`/`subscriptions`/`payments`, agregované `count` metriky, čtení/zápis `cron_runs`/`system_settings`.
3. **DB migrace** `0052_create_cron_runs.sql` a `0053_create_system_settings.sql` (oba `db push` proti sdílené DB — **flagováno k potvrzení uživatelem**).
4. **Záznam běhů cronu** — `recordCronRun()` helper a integrace do 4 existujících cron rout (minimální změna).
5. **Server actions** — `revalidateTarget`, `triggerCron`, `pruneCronRuns`, `recheckHealth`, `sendTestEmail` (vše `requireAdmin()` re-check).
6. **Stránka & UI** — `/admin/system` se všemi sekcemi a klientskými panely (revalidace, ruční cron, prune `cron_runs`, test e-mail, re-check health) + ozubené kolo v hlavičce.
7. **Integrační a příkladové testy** — header/routing, admin re-check + side-effect guards, health orchestrace, render sekcí, chybové stavy, přístupnost, rovnost `CRON_SCHEDULE_MAP` s `vercel.json`, migrace `system_settings`.

Jazyk implementace: **TypeScript**, balíčkovač **pnpm**. Property testy běží přes **fast-check** (≥ 100 iterací, `numRuns: 100`), zarovnané s `src/__tests__/pbt-smoke.test.ts`; každá vlastnost má **jeden** property test s tagem `// Feature: admin-system-tools, Property {N}: {text}`. Ověřovací příkazy: `pnpm test:run`, `pnpm lint`, `pnpm build`.

## Tasks

- [x] 1. Čisté funkce stavu služeb (`src/lib/system/status.ts`)
  - [x] 1.1 Implementovat `mapProbeStatus` a `aggregateStatus`
    - Vytvořit `src/lib/system/status.ts` s typy `ServiceStatus`, `AggregateStatus`, `ProbeOutcome`, `StatusThresholds`.
    - `mapProbeStatus`: success & latency ≤ práh → `ok`; success & latency > práh → `degraded`; error i timeout → `down`.
    - `aggregateStatus`: precedence `down` > `degraded` > `ok`; prázdné pole → `ok`.
    - Bez I/O, čistě deterministické funkce.
    - _Requirements: 3.2, 3.3, 4.2, 5.1, 5.2, 5.3_

  - [x]* 1.2 Property test — mapování výsledku probe na status
    - **Property 1: Mapování výsledku probe na Service_Status**
    - Soubor `src/lib/system/__tests__/status.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 1: Mapování výsledku probe na Service_Status`.
    - Generovat `ProbeOutcome` (success/error/timeout) + prahy latence; ověřit mapování a `errorKind='timeout'` u timeoutu.
    - **Validates: Requirements 3.2, 3.3, 4.2, 5.3**

  - [x]* 1.3 Property test — precedence agregovaného stavu
    - **Property 2: Precedence agregovaného stavu (down > degraded > ok)**
    - Tentýž soubor `status.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 2: Precedence agregovaného stavu (down > degraded > ok)`.
    - Generovat pole `ServiceStatus`; ověřit precedenci včetně prázdného pole → `ok`.
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 2. Čistá funkce config reportu (`src/lib/system/config-report.ts`)
  - [x] 2.1 Implementovat `buildConfigReport` a `EXPECTED_ENV_KEYS`
    - Vytvořit `src/lib/system/config-report.ts` s typy `EnvPresence`, `ConfigReport` a konstantou `EXPECTED_ENV_KEYS` (dle design.md).
    - `buildConfigReport(env, expectedKeys)`: pro každý očekávaný klíč právě jeden `{ key, isSet }` (truthy → `isSet=true`), NIKDY hodnotu; `logLevel` z `LOG_LEVEL` (default `info`); statický `logLocationInfo`.
    - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.4_

  - [x]* 2.2 Property test — config report bez hodnot a věrná přítomnost
    - **Property 4: Config report nikdy neobsahuje hodnoty a věrně reflektuje přítomnost**
    - Soubor `src/lib/system/__tests__/config-report.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 4: Config report nikdy neobsahuje hodnoty a věrně reflektuje přítomnost`.
    - Generovat env mapy (klíče × tajné hodnoty); ověřit absenci hodnot, korespondenci `isSet`, odvození `logLevel`.
    - **Validates: Requirements 6.2, 6.3, 7.1, 7.2, 7.4**

- [x] 3. Čistá allowlist logika revalidace (`src/lib/system/cache-targets.ts`)
  - [x] 3.1 Implementovat `isAllowedTarget` + `ALLOWED_PATHS`/`ALLOWED_TAGS`
    - Vytvořit `src/lib/system/cache-targets.ts` s typem `RevalidateTarget` a allowlisty.
    - `isAllowedTarget(target)`: `true` právě tehdy, když cíl patří do příslušného allowlistu (path/tag); jinak `false`.
    - _Requirements: 10.5, 10.6_

  - [x]* 3.2 Property test — vynucení allowlistu cílů revalidace
    - **Property 5: Vynucení allowlistu cílů revalidace**
    - Soubor `src/lib/system/__tests__/cache-targets.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 5: Vynucení allowlistu cílů revalidace`.
    - Generovat cíle uvnitř i mimo allowlist; ověřit ekvivalenci s členstvím v allowlistu.
    - **Validates: Requirements 10.5, 10.6**

- [x] 4. Reuse/rozšíření redakce tajemství (`src/lib/log.ts`)
  - [x] 4.1 Zpřístupnit redakční helper pro znovupoužití
    - Exportovat existující `redact` (případně tenký wrapper `redactContext`) z `src/lib/log.ts` bez změny chování — minimální zásah, aby šel přímo property-testovat a použít health/cron vrstvou.
    - Ověřit, že `SENSITIVE_KEYS` pokrývá `secret` (tedy i `CRON_SECRET`), `token`, `password`.
    - _Requirements: 6.1, 6.4, 12.5, 15.4_

  - [x]* 4.2 Property test — redakce nikdy neemituje tajnou hodnotu
    - **Property 6: Redakce nikdy neemituje tajnou hodnotu**
    - Soubor `src/lib/__tests__/log-redaction.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 6: Redakce nikdy neemituje tajnou hodnotu`.
    - Generovat log kontexty s citlivými klíči (vč. `CRON_SECRET`, tokeny, hesla); ověřit, že výstup neobsahuje původní tajnou hodnotu (`[REDACTED]`).
    - **Validates: Requirements 12.5, 15.4**

- [x] 5. Čistá funkce informací o nasazení (`src/lib/system/build-info.ts`)
  - [x] 5.1 Implementovat `buildDeployInfo` + `UNAVAILABLE`
    - Vytvořit `src/lib/system/build-info.ts` s typy `DeployEnvironment`, `DeployInfo`, konstantou `UNAVAILABLE = 'nedostupné'`.
    - `buildDeployInfo(env, nodeVersion)`: čte jen neutajené `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV`, `VERCEL_DEPLOYMENT_ID`/`VERCEL_DEPLOY_ID`; chybějící/prázdné → `'nedostupné'`; `environment` mapovat jen na `production`/`preview`/`development`, jinak `'nedostupné'`; `nodeVersion` = předaný řetězec. Bez I/O.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [x]* 5.2 Property test — build info placeholder a bez tajemství
    - **Property 7: Informace o nasazení — placeholder pro chybějící a bez tajemství**
    - Soubor `src/lib/system/__tests__/build-info.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 7: Informace o nasazení — placeholder pro chybějící a bez tajemství`.
    - Generovat env mapy (s/bez `VERCEL_*`, neplatné `VERCEL_ENV`, tajné klíče) a verzi Node; ověřit `'nedostupné'`, mapování `environment` a absenci tajemství v serializovaném výstupu.
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7**

- [x] 6. Čistá agregace stavu e-mailové fronty (`src/lib/system/outbox-status.ts`)
  - [x] 6.1 Implementovat `summarizeOutbox` + `OutboxRowMeta`
    - Vytvořit `src/lib/system/outbox-status.ts` s typy `OutboxRowMeta` (`status`, `createdAt`, `nextAttemptAt`) a `OutboxStatus`.
    - `summarizeOutbox(rows, now)`: `counts` (pending/sent/dead, součet == počet vstupů); `oldestPendingAt` = nejmenší `createdAt` mezi pending, jinak `null`; `readyToRetry` = počet pending s `nextAttemptAt <= now`. Bez PII na vstupu i výstupu. Bez I/O.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x]* 6.2 Property test — agregace stavu e-mailové fronty
    - **Property 8: Agregace stavu e-mailové fronty**
    - Soubor `src/lib/system/__tests__/outbox-status.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 8: Agregace stavu e-mailové fronty`.
    - Generovat pole `OutboxRowMeta` (náhodné stavy, `createdAt`, `nextAttemptAt`) a `now`; ověřit partici počtů, `oldestPendingAt`, `readyToRetry` a absenci PII.
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5**

- [x] 7. Čistá funkce stavu záloh (`src/lib/system/backup-status.ts`)
  - [x] 7.1 Implementovat `buildBackupStatus` + `GOOGLE_BACKUP_ENV_KEYS`
    - Vytvořit `src/lib/system/backup-status.ts` s konstantou `GOOGLE_BACKUP_ENV_KEYS` a typem `BackupStatus`.
    - `buildBackupStatus(env, driveStatus)`: `configured = true` právě tehdy, když jsou všechny `GOOGLE_BACKUP_ENV_KEYS` truthy; `driveStatus` = předaný stav; statický informativní `info` (job není implementován). NIKDY hodnoty proměnných. Bez I/O.
    - _Requirements: 18.1, 18.5_

  - [x]* 7.2 Property test — stav záloh nakonfigurováno iff všechny klíče přítomné
    - **Property 9: Stav záloh — nakonfigurováno právě tehdy, když jsou všechny GOOGLE_* klíče přítomné**
    - Soubor `src/lib/system/__tests__/backup-status.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 9: Stav záloh — nakonfigurováno právě tehdy, když jsou všechny GOOGLE_* klíče přítomné`.
    - Generovat env mapy s náhodnou podmnožinou `GOOGLE_*` a tajnými hodnotami + libovolný `driveStatus`; ověřit `configured` iff všechny klíče přítomné a absenci hodnot.
    - **Validates: Requirements 18.1, 18.5**

- [x] 8. Čistá funkce hranice retence cronů (`src/lib/system/prune-cutoff.ts`)
  - [x] 8.1 Implementovat `computePruneCutoff` + `DEFAULT_CRON_RETENTION_DAYS`
    - Vytvořit `src/lib/system/prune-cutoff.ts` s konstantou `DEFAULT_CRON_RETENTION_DAYS = 90`.
    - `computePruneCutoff(now, days)`: vrátí ISO `now - days`; záznam je kandidát na smazání právě tehdy, když je jeho čas ostře starší než cutoff. Bez I/O.
    - _Requirements: 19.1, 19.2_

  - [x]* 8.2 Property test — monotonie hranice retence a „older-than"
    - **Property 10: Hranice retence běhů cronů je monotónní a týká se jen starších záznamů**
    - Soubor `src/lib/system/__tests__/prune-cutoff.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 10: Hranice retence běhů cronů je monotónní a týká se jen starších záznamů`.
    - Generovat `now` a `days`; ověřit `cutoff = now - days`, monotonii (`days1<=days2 ⇒ cutoff(days2)<=cutoff(days1)`) a predikát „older-than".
    - **Validates: Requirements 19.1, 19.2**

- [x] 9. Čistá funkce čerstvosti webhooku (`src/lib/system/webhook-freshness.ts`)
  - [x] 9.1 Implementovat `computeWebhookFreshness` + `WEBHOOK_FRESHNESS_THRESHOLD_HOURS`
    - Vytvořit `src/lib/system/webhook-freshness.ts` s konstantou `WEBHOOK_FRESHNESS_THRESHOLD_HOURS = 48` a typem `WebhookFreshness`.
    - `computeWebhookFreshness(lastActivityAt, now, thresholdHours, isProxy)`: `null` → `{ hasActivity: false }`; jinak `stale` iff věk > hranice, `isProxy` = předaný příznak. Jen časové razítko a příznaky, žádná Secret_Value/Personal_Data. Bez I/O.
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 20.6_

  - [x]* 9.2 Property test — čerstvost GoPay webhooku
    - **Property 11: Čerstvost GoPay webhooku**
    - Soubor `src/lib/system/__tests__/webhook-freshness.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 11: Čerstvost GoPay webhooku`.
    - Generovat `lastActivityAt` (vč. `null`), `now`, kladnou hranici a `isProxy`; ověřit větev „bez aktivity", `stale` iff věk > hranice, `isProxy` a absenci tajemství/PII.
    - **Validates: Requirements 20.2, 20.3, 20.4, 20.5, 20.6**

- [x] 10. Čistá funkce cooldownu testovacího e-mailu (`src/lib/system/email-cooldown.ts`)
  - [x] 10.1 Implementovat `computeCooldownState` + `TEST_EMAIL_COOLDOWN_SECONDS`
    - Vytvořit `src/lib/system/email-cooldown.ts` s konstantou `TEST_EMAIL_COOLDOWN_SECONDS = 60` a typem `CooldownState`.
    - `computeCooldownState(lastSentAt, now, cooldownSeconds)`: `allowed=true` právě tehdy, když `lastSentAt=null` nebo uplynulý čas ≥ cooldown; jinak `{ allowed:false, remainingSeconds }` (kladné). Bez I/O.
    - _Requirements: 22.4_

  - [x]* 10.2 Property test — cooldown testovacího e-mailu
    - **Property 12: Cooldown testovacího e-mailu**
    - Soubor `src/lib/system/__tests__/email-cooldown.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 12: Cooldown testovacího e-mailu`.
    - Generovat `lastSentAt` (vč. `null`), `now`, kladnou délku cooldownu; ověřit `allowed` iff uplynulý čas ≥ cooldown a korektní `remainingSeconds`.
    - **Validates: Requirements 22.4**

- [x] 11. Čisté funkce rozvrhu a driftu cronů (`src/lib/system/cron-schedule.ts`)
  - [x] 11.1 Implementovat `CRON_SCHEDULE_MAP`, `computeNextRun`, `detectScheduleDrift`
    - Vytvořit `src/lib/system/cron-schedule.ts` s `CRON_SCHEDULE_MAP` (dle `vercel.json`: `billing '0 3 * * *'`, `warnings '30 3 * * *'`, `cleanup '0 4 * * *'`, `email-retry '*/15 * * * *'`).
    - `computeNextRun(cronExpr, now)`: minimalistický čistý parser POUZE pro `'M H * * *'` a `'*/N * * * *'`; vrátí nejbližší čas ostře po `now` (UTC); nepodporovaný výraz → vyhodí chybu.
    - `detectScheduleDrift(configured, monitored)`: `missing` = configured \ monitored, `extra` = monitored \ configured, `mismatched` = průnik s různým výrazem. Bez I/O.
    - _Requirements: 24.2, 24.3, 24.4_

  - [x]* 11.2 Property test — výpočet příštího běhu cronu
    - **Property 13: Výpočet příštího běhu cronu pro podporované výrazy**
    - Soubor `src/lib/system/__tests__/cron-schedule.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 13: Výpočet příštího běhu cronu pro podporované výrazy`.
    - Generovat `now` a podporované výrazy (`M H * * *`, `*/N * * * *`); ověřit, že `computeNextRun` vrací nejbližší budoucí vyhovující čas a nic mezi `now` a výsledkem nevyhovuje.
    - **Validates: Requirements 24.2**

  - [x]* 11.3 Property test — detekce driftu rozvrhu cronů
    - **Property 14: Detekce driftu rozvrhu cronů**
    - Tentýž soubor `cron-schedule.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 14: Detekce driftu rozvrhu cronů`.
    - Generovat dvojice map rozvrhů; ověřit set-logiku `missing`/`extra`/`mismatched` a žádný drift iff mapy shodné.
    - **Validates: Requirements 24.4**

- [x] 12. Checkpoint — čisté jádro a jeho property testy
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Health_Checker — orchestrace a I/O (`src/lib/system/health.ts`)
  - [x] 13.1 Implementovat `runHealthChecks` a 6 Service_Probe
    - Vytvořit `src/lib/system/health.ts` s typy `ServiceName`, `ServiceProbeResult`, `HealthReport`.
    - 6 read-only/non-mutating probe (supabase, resend, smtp2go, gopay, r2, google) měřících latenci a vracejících `ProbeOutcome` + bezpečný `errorKind` (kategorie, NIKDY původní zprávu/tajemství).
    - `withTimeout` (Promise.race, 5 s → `down`/`timeout`); `Promise.allSettled` pro paralelní běh; tvrdý strop 6 s nad celým během; `checkedAt` (ISO UTC).
    - Skládat výsledky přes čisté `mapProbeStatus`/`aggregateStatus`; běží výhradně server-side (`server-only`).
    - _Requirements: 3.1, 3.4, 3.5, 4.1, 4.3, 4.4, 6.1, 6.4_

  - [ ]* 13.2 Property test — výsledek health checku bez tajné hodnoty
    - **Property 3: Výsledek health checku nikdy neobsahuje tajnou hodnotu**
    - Soubor `src/lib/system/__tests__/health-redaction.pbt.test.ts`, fast-check `numRuns: 100`.
    - Tag: `// Feature: admin-system-tools, Property 3: Výsledek health checku nikdy neobsahuje tajnou hodnotu`.
    - Generovat chybové outcomes se „secret-like" řetězci; ověřit, že `JSON.stringify(ServiceProbeResult)` neobsahuje žádný tajný token (nese jen `service`, `label`, `status`, `latencyMs`, `errorKind`).
    - **Validates: Requirements 6.1, 6.4**

  - [ ]* 13.3 Integrační test orchestrace health checku
    - Mock probe s řízenými delays/výsledky; ověřit pokrytí všech 6 služeb, paralelismus (čas ≪ součet), tvrdý strop 6 s (fake timers), izolaci selhání jedné probe.
    - _Requirements: 3.1, 3.4, 4.1, 4.3, 4.4_

- [x] 14. Config_Inspector — I/O wrapper (`src/lib/system/config-report.ts`)
  - [x] 14.1 Implementovat `getConfigReport()`
    - Doplnit do `config-report.ts` tenký I/O wrapper: předá `process.env` a `EXPECTED_ENV_KEYS` čisté funkci; `logLevel` z `process.env.LOG_LEVEL` (default `info`); `logLocationInfo` český text (Vercel logs / log drains, neperzistence). `server-only`.
    - _Requirements: 7.1, 7.3, 8.1, 8.2, 8.3_

  - [ ]* 14.2 Unit testy `getConfigReport`
    - Mock `process.env`; ověřit `logLevel`, `Log_Location_Info`, absenci hodnot, příznaky set/unset.
    - _Requirements: 7.1, 7.3, 8.1, 8.2, 8.3_

- [x] 15. Build_Inspector — I/O wrapper (`src/lib/system/build-info.ts`)
  - [x] 15.1 Implementovat `getDeployInfo()`
    - Doplnit do `build-info.ts` tenký I/O wrapper: předá `process.env` (jen `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV`, `VERCEL_DEPLOYMENT_ID`/`VERCEL_DEPLOY_ID`) a `process.version` čisté funkci. `server-only`.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ]* 15.2 Unit testy `getDeployInfo`
    - Mock `process.env`/`process.version`; ověřit mapování, `'nedostupné'` pro chybějící údaje, žádnou hodnotu tajného klíče.
    - _Requirements: 16.6, 16.7_

- [x] 16. Outbox_Monitor — I/O wrapper (`src/lib/system/outbox-status.ts`)
  - [x] 16.1 Implementovat `getOutboxStatus()`
    - Doplnit do `outbox-status.ts` I/O wrapper: přes service-role klienta načíst z `email_outbox` **jen ne-PII sloupce** `status, created_at, next_attempt_at` (potvrzeno dle `src/lib/email/outbox.ts` / migrace 0041) a předat `summarizeOutbox`. NIKDY nečíst `to_email`/`subject`/`html_body`/`text_body`. Nedostupný zdroj → signál pro „stav e-mailové fronty je momentálně nedostupný". `server-only`.
    - _Requirements: 17.1, 17.5, 17.6, 17.7_

  - [ ]* 16.2 Unit testy `getOutboxStatus`
    - Mock čtení `email_outbox`; ověřit, že dotaz vybírá jen `status,created_at,next_attempt_at` (žádné PII), korektní agregaci a fallback při nedostupnosti.
    - _Requirements: 17.5, 17.6, 17.7_

- [x] 17. Backup_Status_Info — I/O wrapper (`src/lib/system/backup-status.ts`)
  - [x] 17.1 Implementovat `getBackupStatus()`
    - Doplnit do `backup-status.ts` I/O wrapper: předá `process.env` a Google `Service_Status` z `Health_Checker` čisté funkci. `server-only`.
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ]* 17.2 Unit testy `getBackupStatus`
    - Mock `process.env` + `driveStatus`; ověřit `configured` dle přítomnosti `GOOGLE_*`, převzetí `driveStatus`, informativní text, absenci hodnot.
    - _Requirements: 18.1, 18.2, 18.3_

- [x] 18. Webhook_Freshness_Monitor — I/O wrapper (`src/lib/system/webhook-freshness.ts`)
  - [x] 18.1 Implementovat `getWebhookFreshness()`
    - Doplnit do `webhook-freshness.ts` I/O wrapper: zjistit proxy čas `max(nejnovější subscriptions.updated_at, nejnovější payments.created_at)` (`payments` má jen `created_at`), předat `computeWebhookFreshness` s `isProxy=true`. Nedostupný zdroj → signál pro „čerstvost webhooku je momentálně nedostupná". `server-only`.
    - _Requirements: 20.1, 20.7_

  - [ ]* 18.2 Unit testy `getWebhookFreshness`
    - Mock čtení `subscriptions`/`payments`; ověřit proxy čas (max), `isProxy=true`, fallback při nedostupnosti, absenci PII.
    - _Requirements: 20.1, 20.7_

- [x] 19. Metrics_Inspector — agregované metriky (`src/lib/system/metrics.ts`)
  - [x] 19.1 Implementovat `getOperationalMetrics()`
    - Vytvořit `src/lib/system/metrics.ts` (`server-only`) s typy `DbMetrics`, `StorageMetrics`, `OperationalMetrics`.
    - Přes service-role `count` (`select('*', { count: 'exact', head: true })`) zjistit počty `businesses`, `reservations`, `clients`; jen agregované počty, žádná data řádků/PII. `storage` → `{ available: false }` (`'nedostupné'`), pokud velikost není levně zjistitelná — žádné nákladné volání. Selhání DB count → `db: null`.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

  - [ ]* 19.2 Příkladové testy `getOperationalMetrics`
    - Mock service-role `count`; ověřit počty, `storage` „nedostupné" bez nákladného volání, `db: null` fallback při selhání, žádná data řádků. (I/O — nikoli PBT.)
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [x] 20. Checkpoint — I/O vrstva (health, config, build, outbox, backup, webhook, metriky)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. DB migrace tabulky `cron_runs`
  - [x] 21.1 Vytvořit migraci `0052_create_cron_runs.sql`
    - Tabulka `cron_runs` (id, job, started_at, finished_at, status, trigger, detail jsonb, created_at) + index `cron_runs_job_started_idx` + RLS.
    - Policy: admin `select` přes `public.current_user_is_admin()`; `insert/update/select` pro `service_role`; revoke pro public/anon.
    - **Pozor:** aplikace migrace `pnpm dlx supabase db push` běží proti sdílené DB — sdílený/destruktivní dopad, **vyžaduje potvrzení uživatele** před spuštěním.
    - _Requirements: 11.4, 15.4_

- [x] 22. DB migrace tabulky `system_settings`
  - [x] 22.1 Vytvořit migraci `0053_create_system_settings.sql`
    - Tabulka `system_settings` (`key` text PK, `value` text not null, `updated_at` timestamptz default now()) + RLS.
    - Policy: admin `select` přes `public.current_user_is_admin()`; `insert/update/select` pro `service_role`; revoke pro public/anon. První uživatel: klíč `test_email_last_sent_at` (časové razítko, žádná Secret_Value/Personal_Data).
    - **Pozor:** `pnpm dlx supabase db push` běží proti sdílené DB — **vyžaduje potvrzení uživatele** před spuštěním.
    - _Requirements: 22.4_

- [x] 23. Záznam a monitoring běhů cronu (`src/lib/cron/`, `src/lib/system/`)
  - [x] 23.1 Implementovat `recordCronRun()` helper
    - Vytvořit `src/lib/cron/record-run.ts` (`server-only`) s typem `CronJobName`.
    - Obalí běh: zapíše start do `cron_runs`, spustí handler, doplní `finished_at` + `status` + `detail` (jen číselné metriky, BEZ Secret_Value). Zápis je best-effort (chyba zápisu nesmí shodit job, jen se zaloguje). Service-role klient.
    - _Requirements: 11.4, 15.4_

  - [ ]* 23.2 Unit testy `recordCronRun`
    - Mock DB klient; ověřit zápis start+finish, best-effort chování (selhání zápisu nezhodí job), absenci tajemství v `detail`.
    - _Requirements: 11.4, 15.4_

  - [x] 23.3 Implementovat `getCronStatuses()` (`src/lib/system/cron-monitor.ts`)
    - Vytvořit `cron-monitor.ts` s typy `CronRunRecord`, `CronJobStatus`.
    - Pro každý ze 4 jobů poslední `cron_runs` (`order by started_at desc limit 1`); chybí-li → `lastRun: null`; nedostupný zdroj → signál pro „stav cronů je momentálně nedostupný".
    - _Requirements: 11.1, 11.2, 11.3, 13.4_

  - [ ]* 23.4 Unit testy `getCronStatuses`
    - Mock čtení `cron_runs`; ověřit poslední běh per job, „bez zaznamenaného běhu", fallback při nedostupnosti zdroje.
    - _Requirements: 11.1, 11.2, 11.3, 13.4_

- [x] 24. Integrace `recordCronRun` do existujících cron rout
  - [x] 24.1 Obalit `cleanup` route
    - V `src/app/api/cron/cleanup/route.ts` po úspěšném `verifyCronAuthorization` obalit stávající `handle` logiku `recordCronRun('cleanup', trigger, ...)`; doménová logika beze změny; trigger odvodit (`scheduled`/`manual`).
    - _Requirements: 11.4_

  - [x] 24.2 Obalit `billing` route
    - Analogicky v `src/app/api/cron/billing/route.ts`.
    - _Requirements: 11.4_

  - [x] 24.3 Obalit `warnings` route
    - Analogicky v `src/app/api/cron/warnings/route.ts`.
    - _Requirements: 11.4_

  - [x] 24.4 Obalit `email-retry` route
    - Analogicky v `src/app/api/cron/email-retry/route.ts`.
    - _Requirements: 11.4_

  - [ ]* 24.5 Test neměnnosti návratových hodnot rout
    - Ověřit, že obalení `recordCronRun` nemění návratovou hodnotu/HTTP status žádné ze 4 rout (mock DB zápis).
    - _Requirements: 11.4_

- [ ] 25. Checkpoint — perzistence a monitoring cronů
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 26. Server actions (`src/app/admin/system/actions.ts`)
  - [x] 26.1 Implementovat `revalidateTarget`
    - `server-only` action: `requireAdmin()` re-check; `isAllowedTarget` — mimo allowlist → `{ ok:false }` bez dotčení cache; jinak `revalidatePath`/`revalidateTag`; vrátit výsledek s názvem cíle.
    - _Requirements: 2.4, 10.1, 10.2, 10.5, 10.6, 15.1, 15.3_

  - [ ] 26.2 Implementovat `triggerCron`
    - `server-only` action: `requireAdmin()` re-check; chybějící `CRON_SECRET` → „cron tajemství není nastaveno" (žádný fetch); jinak server-side `fetch` cron endpointu s `Authorization: Bearer <CRON_SECRET>` a příznakem ručního spuštění; vrátit výsledek. `CRON_SECRET` se nikdy neodešle klientovi ani nezaloguje.
    - _Requirements: 2.4, 12.1, 12.3, 12.4, 12.5, 15.1, 15.3, 15.4_

  - [ ] 26.3 Implementovat `pruneCronRuns`
    - `server-only` action: `requireAdmin()` re-check (Non_Admin_User → 403, žádné smazání); bez `days` → `DEFAULT_CRON_RETENTION_DAYS`; přes service-role `delete from cron_runs where started_at < computePruneCutoff(now, days)`; vrátit počet smazaných. Maže **výhradně** `cron_runs`, NIKDY `audit_log`.
    - _Requirements: 2.4, 19.1, 19.2, 19.4, 19.5, 19.6, 15.1, 15.3_

  - [ ] 26.4 Implementovat `recheckHealth`
    - `server-only` action: `requireAdmin()` re-check (Non_Admin_User → 403, žádná kontrola); znovu spustí `runHealthChecks()`; vrátí nový `HealthReport` včetně `checkedAt`. Žádná nová čistá funkce (reuse health).
    - _Requirements: 2.4, 21.1, 21.2, 21.4, 15.1, 15.3_

  - [ ] 26.5 Implementovat `sendTestEmail`
    - `server-only` action **bez parametru cíle** (cíl se nikdy nebere od klienta): `requireAdmin()` re-check (Non_Admin_User → 403, žádné odeslání); chybějící `HOREA_ADMIN_EMAIL` → „administrátorská adresa není nastavena"; načíst `test_email_last_sent_at` ze `system_settings`, `computeCooldownState` → při zákazu vrátit zbývající dobu; jinak odeslat výhradně na `HOREA_ADMIN_EMAIL` (`sendEmail`), při úspěchu zapsat nový `last_sent_at`. Výsledek bez PII nad rámec adresy.
    - _Requirements: 2.4, 22.1, 22.3, 22.4, 22.5, 22.6, 22.7, 15.1, 15.3_

  - [ ]* 26.6 Integrační test server-side admin re-check + side-effect guards
    - Soubor `src/app/admin/system/__tests__/admin-recheck.test.ts`. Mock neadmin session → `revalidateTarget`/`triggerCron`/`pruneCronRuns`/`recheckHealth`/`sendTestEmail` vrací `ok:false`/403 a **nevolá** žádný side-effect (`revalidatePath`/`fetch`/`delete`/health/`sendEmail`); ověřit `server-only` import.
    - _Requirements: 2.4, 15.1, 19.6, 21.4, 22.7_

  - [ ]* 26.7 Integrační test revalidace cache
    - Soubor `src/app/admin/system/__tests__/revalidate.test.ts`. Mock `revalidatePath`/`revalidateTag`; povolený cíl → volání + výsledek; cíl mimo allowlist → odmítnutí bez volání.
    - _Requirements: 10.1, 10.2, 10.4, 10.6_

  - [ ]* 26.8 Integrační test `triggerCron`
    - Soubor `src/app/admin/system/__tests__/trigger-cron.test.ts`. Mock `fetch`; ověřit `Bearer` autorizaci, chybějící `CRON_SECRET` → odmítnutí, zobrazení výsledku.
    - _Requirements: 12.1, 12.3, 12.4, 12.5_

  - [ ]* 26.9 Integrační test `pruneCronRuns`
    - Soubor `src/app/admin/system/__tests__/prune-cron-runs.test.ts`. Mock `cron_runs` delete → počet smazaných, použití cutoffu, **žádný** dotaz na `audit_log`.
    - _Requirements: 19.1, 19.4, 19.5_

  - [ ]* 26.10 Integrační test `sendTestEmail`
    - Soubor `src/app/admin/system/__tests__/send-test-email.test.ts`. Mock `sendEmail` + `system_settings`; odeslání **jen** na `HOREA_ADMIN_EMAIL`, chybějící env → odmítnutí, aktivní cooldown → zbývající doba, zápis `last_sent_at` jen při úspěchu, výsledek bez PII.
    - _Requirements: 22.1, 22.3, 22.4, 22.5, 22.6_

  - [ ]* 26.11 Integrační test `recheckHealth`
    - Soubor `src/app/admin/system/__tests__/recheck-health.test.ts`. Mock admin session + `runHealthChecks`; ověřit, že akce znovu spustí health check a vrátí nový `HealthReport` včetně aktualizovaného `checkedAt`; výsledek nese jen `service`/`label`/`status`/`latencyMs`/`errorKind` (žádná Secret_Value).
    - _Requirements: 21.1, 21.2_

- [ ] 27. Klientské panely `/admin/system`
  - [ ] 27.1 Panel revalidace cache (`RevalidatePanel`)
    - Client komponenta s explicitním potvrzením, `aria-live="polite"` regionem, textovými labely stavů (ne jen barva), klávesovou ovladatelností; volá `revalidateTarget`. Reuse `Card`/`Notice`/`Button`.
    - _Requirements: 10.3, 14.1, 14.2, 14.3, 15.2_

  - [ ] 27.2 Panel ručního spuštění cronu (`CronTriggerPanel`)
    - Client komponenta s potvrzením, `aria-live` regionem, klávesovou ovladatelností; volá `triggerCron` a zobrazí výsledek.
    - _Requirements: 12.2, 12.3, 14.2, 14.3, 15.2_

  - [ ] 27.3 Panel retence `cron_runs` (`PruneCronRunsPanel`)
    - Client komponenta s **explicitním potvrzením** (destruktivní), `aria-live` regionem, klávesovou ovladatelností; volá `pruneCronRuns` a zobrazí počet smazaných.
    - _Requirements: 19.3, 19.4, 14.2, 14.3, 15.2_

  - [ ] 27.4 Panel testovacího e-mailu (`TestEmailPanel`)
    - Client komponenta s **explicitním potvrzením**, `aria-live` regionem, klávesovou ovladatelností; volá `sendTestEmail` (bez cíle od klienta) a zobrazí výsledek/cooldown bez PII nad rámec adresy.
    - _Requirements: 22.2, 22.6, 14.2, 14.3, 15.2_

  - [ ] 27.5 Tlačítko re-checku health (`HealthRecheckButton`)
    - Client komponenta „Zkontrolovat znovu" s `aria-live="polite"` regionem a klávesovou ovladatelností; volá `recheckHealth`, aktualizuje výsledek a `checkedAt`.
    - _Requirements: 21.1, 21.2, 21.3, 14.2, 14.3_

- [ ] 28. Stránka `/admin/system`
  - [ ] 28.1 Implementovat stránku `src/app/admin/system/page.tsx`
    - Server komponenta, `export const dynamic = 'force-dynamic'`, na začátku `requireAdmin()` re-check (jinak 403/odmítnutí).
    - Skládá sekce: agregovaný stav + health tabulka (`runHealthChecks` + `HealthRecheckButton` s `checkedAt`), informace o nasazení (`getDeployInfo`), stav e-mailové fronty (`getOutboxStatus`, souvislost s `/api/cron/email-retry`), stav záloh (`getBackupStatus`), čerstvost GoPay webhooku (`getWebhookFreshness`, explicitní „proxy"), provozní metriky (`getOperationalMetrics`), konfigurace (`getConfigReport`), logy & hranice auditu (odkaz `/admin/audit`, text append-only/neperzistence), revalidace cache (`RevalidatePanel`), cron monitor (`getCronStatuses`) + rozvrh/příští běh/drift (`CRON_SCHEDULE_MAP`, `computeNextRun`, `detectScheduleDrift`) + retence (`PruneCronRunsPanel`) + ruční spuštění (`CronTriggerPanel`), test e-mail (`TestEmailPanel`).
    - Všechny stavy textovým labelem (ne jen barvou); chybové stavy: české hlášky + „Zkusit znovu"; fallbacky pro nedostupný cron monitor/outbox/webhook/metriky.
    - _Requirements: 2.1, 2.4, 5.4, 7.1, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 11.2, 13.1, 13.2, 13.3, 13.4, 16.8, 17.6, 18.2, 18.3, 18.4, 20.2, 20.3, 21.2, 23.1, 24.1, 24.4_

  - [ ]* 28.2 Integrační testy renderu stránky
    - Render sekcí: nasazení (textový label prostředí, „nedostupné"), outbox (souvislost s `/api/cron/email-retry`, fallback), zálohy (text „job není implementován", žádná akce ruční zálohy), webhook (proxy label, „bez aktivity"/stale), metriky (počty, storage „nedostupné"), konfigurace/logy, hranice auditu, cron rozvrh + drift, chybové stavy (mock throw → české hlášky, zbytek funkční).
    - _Requirements: 7.3, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 13.1, 13.2, 13.3, 13.4, 16.8, 17.6, 17.7, 18.2, 18.3, 18.4, 20.2, 20.4, 23.3, 23.5, 24.1, 24.4_

  - [ ]* 28.3 Testy přístupnosti
    - Textové labely stavů (ne jen barva) napříč sekcemi (health, nasazení, webhook, drift); fokus/aktivace klávesnicí; `aria-live` region aktualizovaný po akci (health re-check/revalidace/cron/prune/test e-mail).
    - _Requirements: 14.1, 14.2, 14.3, 16.8, 20.3, 21.3, 24.4_

- [x] 29. Napojení hlavičky (Settings_Icon)
  - [x] 29.1 Přidat prop `settingsLabel` do `DashboardHeader`
    - V `src/components/dashboard/DashboardHeader.tsx` přidat volitelný `settingsLabel?: string` (default „Nastavení") použitý jako `aria-label` odkazu ozubeného kola. Ikona účtu zůstává oddělená.
    - _Requirements: 1.3, 1.4, 14.4_

  - [x] 29.2 Zobrazit ozubené kolo pro admina v `DashboardChrome`
    - V `src/components/dashboard/DashboardChrome.tsx` pro admin předat `showSettings={true}`, `settingsHref="/admin/system"`, `settingsLabel="Správa systému"`; owner beze změny. Doplnit `/admin/system` do `TITLE_BY_PATH` („Správa systému").
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 29.3 Testy headeru/routingu
    - Render `DashboardHeader` v admin režimu — settings odkaz na `/admin/system`, `aria-label="Správa systému"`, vizuálně/funkčně oddělená ikona účtu (`/admin/account`).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 14.4_

- [ ] 30. Integrace a ověření konfigurace
  - [ ]* 30.1 Test rovnosti `CRON_SCHEDULE_MAP` s `vercel.json`
    - Soubor `src/lib/system/__tests__/cron-schedule-map.test.ts`. Načíst `vercel.json` a ověřit, že `CRON_SCHEDULE_MAP` přesně odpovídá rozvrhům (`billing '0 3 * * *'`, `warnings '30 3 * * *'`, `cleanup '0 4 * * *'`, `email-retry '*/15 * * * *'`) — ochrana proti driftu deklarace.
    - _Requirements: 24.3_

  - [ ]* 30.2 Test migrace `system_settings` (RLS a tvar)
    - Soubor `src/app/admin/system/__tests__/system-settings-migration.test.ts`. Načíst `0053_create_system_settings.sql` a ověřit textově: PK `key`, sloupce `value`/`updated_at`, `enable row level security`, admin `select` policy přes `current_user_is_admin()`, `grant insert, update, select` jen pro `service_role`, revoke pro public/anon.
    - _Requirements: 22.4_

- [ ] 31. Závěrečný checkpoint — kompletní funkce
  - Ensure all tests pass, ask the user if questions arise. Spustit `pnpm test:run`, `pnpm lint`, `pnpm build`.

## Notes

- Tasky označené `*` jsou volitelné (testy) a lze je přeskočit pro rychlejší MVP; core implementace se nikdy neoznačuje jako volitelná.
- Každý task odkazuje na konkrétní klauzule requirements (a property) pro dohledatelnost.
- Property testy (P1–P14) pokrývají čisté jádro (`status`, `config-report`, `cache-targets`, redakce, `build-info`, `outbox-status`, `backup-status`, `prune-cutoff`, `webhook-freshness`, `email-cooldown`, `cron-schedule`); I/O vrstva (probe, wrappery, revalidace, fetch, DB čtení/zápis, `count` metriky, odeslání e-mailu) se ověřuje příkladovými a integračními testy s mocky.
- `getOperationalMetrics` (metriky) je převážně I/O bez čisté transformační logiky → pokryto příkladovými testy, nikoli PBT.
- Migrace `cron_runs` (`0052`) i `system_settings` (`0053`) přes `pnpm dlx supabase db push` zasahují sdílenou DB — **před aplikací každé vyžadují potvrzení uživatele**.
- `CRON_SECRET`, `HOREA_ADMIN_EMAIL` a další Secret_Value se používají výhradně server-side a nikdy se nelogují; výpisy nikdy nenesou Personal_Data.
- `sendTestEmail` nemá parametr cíle — odesílá výhradně na `HOREA_ADMIN_EMAIL`; cooldown je perzistován v `system_settings` (serverless caveat).
- Checkpointy zajišťují inkrementální ověření (`pnpm test:run`, `pnpm lint`, případně `pnpm build`).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "10.1", "11.1", "19.1", "21.1", "22.1", "29.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "4.2", "5.2", "6.2", "7.2", "8.2", "9.2", "10.2", "11.2", "13.1", "14.1", "15.1", "16.1", "17.1", "18.1", "23.1", "23.3", "29.2"] },
    { "id": 2, "tasks": ["1.3", "11.3", "13.2", "13.3", "14.2", "15.2", "16.2", "17.2", "18.2", "19.2", "23.2", "23.4", "24.1", "24.2", "24.3", "24.4", "26.1"] },
    { "id": 3, "tasks": ["24.5", "26.2", "26.7"] },
    { "id": 4, "tasks": ["26.3", "26.8"] },
    { "id": 5, "tasks": ["26.4", "26.9"] },
    { "id": 6, "tasks": ["26.5"] },
    { "id": 7, "tasks": ["26.6", "26.10", "26.11", "27.1", "27.2", "27.3", "27.4", "27.5"] },
    { "id": 8, "tasks": ["28.1"] },
    { "id": 9, "tasks": ["28.2", "28.3", "29.3", "30.1", "30.2"] }
  ]
}
```
