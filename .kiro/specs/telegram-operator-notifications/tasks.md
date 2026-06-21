# Implementation Plan: Telegram notifikace pro operátora (telegram-operator-notifications)

## Overview

Plán zavádí do platformy Horea první Telegram integraci čistě pro operátora platformy. Postup je
inkrementální a staví na sobě: nejdřív čisté (pure) funkce v `src/lib/telegram/` spolu s jejich
property testy (P1–P11), pak server-only I/O moduly (Telegram_Client, kalkulátorové wrappery,
health probes, Notifier, webhook orchestrace), pak surgical napojení do existujících toků
(onboarding a GoPay webhook), následně příchozí Route Handler a nakonec wiring (`.env.example`)
a integrační testy.

Klíčové hranice z návrhu:
- **Žádné nové DB tabulky ani migrace** — čtou se jen read-only `payments`, `subscriptions`,
  `businesses` přes service-role klienta.
- **Dedup notifikací** je odvozen z existující sémantiky (guarded flip platby na `paid`,
  unikátnost slugu podniku) — žádné nové úložiště.
- Tajemství (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`) čte
  výhradně server-only kód a nikdy se nelogují.

Implementační jazyk: **TypeScript** (návrh používá konkrétní TS). Správce balíčků: **pnpm**.
Změny v existujících tocích jsou surgical a best-effort — nikdy neovlivní původní výsledek.

Ověřovací příkazy: `pnpm test:run`, `pnpm lint`, `pnpm build`.

## Tasks

- [x] 1. Konfigurace (čistá) a sdílené typy
  - [x] 1.1 Vytvořit `src/lib/telegram/config.ts` — čistá resoluce konfigurace
    - Definovat typ `TelegramConfig` (`botToken`, `operatorChatId`)
    - Implementovat čistou funkci `resolveTelegramConfig(env)`: vrací `TelegramConfig` jen když
      jsou `TELEGRAM_BOT_TOKEN` i `TELEGRAM_OPERATOR_CHAT_ID` neprázdné, jinak `null`
    - Implementovat čistou funkci `resolveWebhookSecret(env)`: vrací secret nebo `null`, když
      `TELEGRAM_WEBHOOK_SECRET` není nastaven
    - Funkce nikdy nepředávají hodnoty do logů, jen je vrací volajícímu
    - _Requirements: 1.1, 1.2, 1.4, 7.3_

  - [x]* 1.2 Property test pro resoluci konfigurace
    - **Property 1: Feature_Enabled právě když je konfigurace úplná**
    - **Validates: Requirements 1.1, 1.2**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 1: ...`

- [x] 2. Čisté kalkulátory — tržby a odhad
  - [x] 2.1 Vytvořit `src/lib/telegram/revenue.ts` — čistý výpočet tržeb
    - Definovat typ `RevenuePaymentRow` (`amount_czk`)
    - Implementovat čistou funkci `calculateRevenueCzk(payments)`: součet `amount_czk`, prázdný
      vstup → 0 (filtr `paid`/období dělá až I/O vrstva)
    - _Requirements: 9.2, 9.3, 13.1, 13.3_

  - [x]* 2.2 Property test pro výpočet tržeb
    - **Property 3: Výpočet tržeb je součet částek**
    - **Validates: Requirements 9.2, 9.3, 13.1, 13.3**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 3: ...`

  - [x] 2.3 Vytvořit `src/lib/telegram/estimate.ts` — čistý odhad tržeb
    - Definovat typ `EstimateSubscriptionRow` (`plan`)
    - Implementovat čistou funkci `estimateNextMonthRevenueCzk(subscriptions)`: součet
      `planPriceCzk(plan)` z jednotného ceníku `src/lib/checkout/pricing.ts`; vždy nezáporný,
      prázdný vstup → 0
    - _Requirements: 10.2, 10.3, 10.4, 13.2, 13.4_

  - [x]* 2.4 Property test pro odhad tržeb
    - **Property 4: Odhad odpovídá ceníku a je nezáporný**
    - **Validates: Requirements 10.2, 10.3, 10.4, 13.2, 13.4**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 4: ...`

- [x] 3. Čisté funkce — zdraví služeb, příkazy a autorizace
  - [x] 3.1 Vytvořit `src/lib/telegram/health.ts` — čistá agregace zdraví
    - Definovat typy `ServiceStatus` (`ok`/`degraded`/`down`), `MonitoredService`, `ServiceHealth`,
      `HealthReport` (sladěné s `admin-system-tools`)
    - Implementovat čistou funkci `aggregateHealth(statuses)` s precedencí `down > degraded > ok`
      (prázdný vstup → `ok`)
    - Implementovat čistou funkci `buildHealthReport(services)`: vrací seznam šesti služeb +
      agregovaný stav, bez Secret_Value
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x]* 3.2 Property test pro agregaci zdraví
    - **Property 5: Agregace zdraví dodržuje precedenci down > degraded > ok**
    - **Validates: Requirements 11.3, 11.4**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 5: ...`

  - [x]* 3.3 Property test pro report zdraví
    - **Property 6: Report zdraví pokrývá všech šest služeb bez tajemství**
    - **Validates: Requirements 11.2, 11.5, 11.6**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 6: ...`

  - [x] 3.4 Vytvořit `src/lib/telegram/commands.ts` — čisté parsování příkazů
    - Definovat typy `Command` a `ParsedCommand`
    - Implementovat čistou funkci `parseCommand(text)`: rozpozná `/trzby`, `/odhad`, `/stav`,
      `/start`, `/help` (tolerance velikosti písmen, okolního whitespace a `@botname` sufixu);
      cokoli jiného → `unknown`
    - _Requirements: 8.1, 12.1, 12.2_

  - [x]* 3.5 Property test pro parsování příkazů
    - **Property 9: Rozpoznání příkazů a odmítnutí neznámého textu**
    - **Validates: Requirements 12.2**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 9: ...`

  - [x] 3.6 Vytvořit `src/lib/telegram/webhook.ts` — čisté autorizační predikáty
    - Implementovat čistou funkci `isAuthorizedSecret(headerValue, configured)`: konstantní
      porovnání; `false` když `configured` je `null`
    - Implementovat čistou funkci `isOperatorChat(chatId, operatorChatId)`: `true` jen při shodě
    - (orchestraci `handleTelegramUpdate` doplní task 9.1 do téhož souboru)
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2_

  - [ ]* 3.7 Property test pro autorizaci secretu
    - **Property 7: Autorizace webhook secretu**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 7: ...`

  - [x]* 3.8 Property test pro autorizaci chatu
    - **Property 8: Autorizace chatu odesílatele**
    - **Validates: Requirements 8.1, 8.2**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 8: ...`

- [x] 4. Message_Builder — české texty a formátování CZK
  - [x] 4.1 Vytvořit `src/lib/telegram/messages.ts` — čisté buildery zpráv
    - Implementovat `formatCzk(amountCzk)` (cs-CZ, bez desetin, sufix „Kč") a
      `formatPragueDateTime(at)` (Europe/Prague)
    - Implementovat `buildBusinessCreatedMessage`, `buildPaymentConfirmedMessage` (české labely
      tarifů Start/Pokročilý/Max dle `planDescription`), `buildRevenueMessage`,
      `buildEstimateMessage`, `buildHealthMessage`, `buildHelpMessage`, `buildUnknownCommandMessage`
    - Veškeré texty v češtině, CZK přes `formatCzk`
    - _Requirements: 3.2, 3.3, 4.2, 4.3, 9.1, 9.3, 10.1, 10.4, 11.1, 12.1, 12.2, 14.1, 14.2, 14.3_

  - [x]* 4.2 Property test pro formátování CZK
    - **Property 10: Formátování CZK**
    - **Validates: Requirements 14.1, 14.2**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 10: ...`

  - [ ]* 4.3 Property test pro obsah notifikačních zpráv
    - **Property 11: Notifikační zprávy obsahují požadovaná pole**
    - **Validates: Requirements 3.2, 3.3, 4.2, 4.3**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 11: ...`

  - [x]* 4.4 Unit testy pro nápovědu a odpovědi na příkazy
    - `buildHelpMessage` obsahuje všechny příkazy; `buildUnknownCommandMessage` odkazuje na `/help`;
      reprezentativní příklady CZK formátu a `buildHealthMessage`
    - _Requirements: 11.1, 12.1, 12.2, 14.3_

- [x] 5. Checkpoint — čisté jádro
  - Spustit `pnpm test:run` a `pnpm lint`. Ensure all tests pass, ask the user if questions arise.

- [x] 6. Server-only I/O: konfigurace a Telegram_Client
  - [x] 6.1 Doplnit I/O wrapper do `src/lib/telegram/config.ts`
    - Přidat `import 'server-only'` a funkci `getTelegramConfig()` předávající `process.env` do
      `resolveTelegramConfig` (jediné místo čtení tokenu/chatu)
    - _Requirements: 1.4_

  - [x] 6.2 Vytvořit `src/lib/telegram/client.ts` — odesílací helper a health probe
    - `import 'server-only'`; definovat typy `SendResult` a `GetMeResult`
    - Implementovat `sendTelegramMessage(text)`: bez konfigurace → `skipped`; jinak `fetch` na
      `sendMessage` na Operator_Chat_Id (`parse_mode: 'HTML'`, escapovaný obsah); chyba/nedostupnost
      → `failed` s kategorií; nikdy nevyhodí; token ani text se nelogují (jen `status`/`errorKind`)
    - Implementovat `telegramGetMe()`: read-only `getMe` bez odeslání zprávy; vrací jen
      `status`/`errorKind`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 1.2, 1.3, 15.1, 15.2, 15.3_

  - [x]* 6.3 Unit testy Telegram_Client (mock `fetch`)
    - Ověřit URL a cílový chat u `sendMessage`/`getMe`, mapování 5xx/network na `failed`/`error`,
      a že `serverLog` nikdy nedostane token ani text (spy)
    - _Requirements: 2.1, 2.2, 2.3, 15.2, 15.3_

- [x] 7. Server-only I/O: kalkulátorové wrappery a health probes
  - [x] 7.1 Doplnit I/O wrapper do `src/lib/telegram/revenue.ts`
    - `import 'server-only'`; `getCurrentMonthRevenueCzk(supabase, now)`: hranice aktuálního
      kalendářního měsíce v Europe/Prague, načíst `payments` se `status='paid'` a `created_at`
      v období (vzor `sumPaidRevenueCzk` z `src/lib/admin/stats.ts`), předat do `calculateRevenueCzk`
    - _Requirements: 9.1, 9.2_

  - [x] 7.2 Doplnit I/O wrapper do `src/lib/telegram/estimate.ts`
    - `import 'server-only'`; `getNextMonthEstimateCzk(supabase, now)`: hranice příštího
      kalendářního měsíce v Europe/Prague, načíst `subscriptions` se `status='active'`,
      `auto_renew=true` a `current_period_end` v období, předat do `estimateNextMonthRevenueCzk`
    - _Requirements: 10.1, 10.2_

  - [ ] 7.3 Doplnit `runServiceProbes()` do `src/lib/telegram/health.ts`
    - `import 'server-only'`; paralelní read-only probe šesti služeb (Supabase, Resend, SMTP2GO,
      GoPay, Cloudflare R2, Google) přes `Promise.allSettled`; selhání/timeout → `status: 'down'`
      u dané služby a pokračovat; výsledek bez Secret_Value
    - _Requirements: 11.2, 11.5, 11.6_

  - [x]* 7.4 Unit testy health probes (mock klientů)
    - Read-only volání, selhání jedné probe neshodí ostatní, výsledek bez Secret_Value
    - _Requirements: 11.1, 11.5, 11.6_

- [x] 8. Notifier — best-effort PUSH notifikace
  - [x] 8.1 Vytvořit `src/lib/telegram/notifications.ts`
    - `import 'server-only'`; definovat typy `BusinessCreatedInput` (jen `businessName`,
      `createdAt`) a `PaymentConfirmedInput` (`businessName`, `plan`, `amountCzk`)
    - Implementovat `notifyBusinessCreated` a `notifyPaymentConfirmed`: sestaví český text přes
      Message_Builder a odešle přes `sendTelegramMessage`; celé tělo v `try/catch` — vrací
      `SendResult` pro log/test, ale nikdy nevyhodí výjimku
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.3, 14.1, 14.3_

  - [x]* 8.2 Property test pro no-op a fail-safe notifikace
    - **Property 2: No-op a nevyhození bez kompletní konfigurace**
    - **Validates: Requirements 1.2, 1.3, 5.1, 5.2, 5.3**
    - fast-check `{ numRuns: 100 }`, tag `// Feature: telegram-operator-notifications, Property 2: ...`

- [x] 9. Webhook orchestrace
  - [x] 9.1 Doplnit `handleTelegramUpdate(update)` do `src/lib/telegram/webhook.ts`
    - `import 'server-only'`; autorizace chatu přes `isOperatorChat` (cizí chat → ignorovat bez
      odpovědi), `parseCommand`, dispatch příkazů (`/trzby`→`getCurrentMonthRevenueCzk`,
      `/odhad`→`getNextMonthEstimateCzk`, `/stav`→`runServiceProbes`+`buildHealthReport`,
      `/start`+`/help`→nápověda, jinak unknown), odpověď výhradně na Operator_Chat_Id přes
      `sendTelegramMessage`; selhání čtení DB → krátká česká chybová hláška bez Secret_Value
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.3, 10.1, 10.4, 11.1, 12.1, 12.2_

  - [x]* 9.2 Unit testy orchestrace (mock kalkulátorů/probe/clientu)
    - Cizí chat → žádná odpověď; dispatch každého příkazu volá správný kalkulátor a odpovídá na
      Operator_Chat_Id; neznámý text → nápověda; selhání DB → chybová hláška
    - _Requirements: 8.2, 8.3, 9.1, 9.3, 10.1, 11.1, 12.1, 12.2_

- [x] 10. Checkpoint — server-only moduly
  - Spustit `pnpm test:run` a `pnpm lint`. Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Integrace do existujících toků (surgical hooky)
  - [ ] 11.1 Napojit notifikaci nového podniku v `src/app/onboarding/6/actions.ts`
    - Po `result.ok` a **před** `redirect('/dashboard')` načíst název nově vzniklého podniku
      a zavolat `await notifyBusinessCreated(...)` v `try/catch`; selhání nezmění výsledek ani
      redirect (dedup odvozen z unikátnosti slugu — notifikace jen po `{ ok: true }`)
    - _Requirements: 3.1, 5.1, 6.2_

  - [ ] 11.2 Napojit notifikaci platby v `src/lib/webhooks/handler.ts`
    - Ve větvi `applyPaid` v místě úspěšného `return { ok: true, outcome: 'paid_applied' }`
      zavolat `await notifyPaymentConfirmed({ businessName, plan: sub.plan, amountCzk:
      payment.amount_czk })` v `try/catch`; selhání jen zalogovat, výsledek webhooku nezměnit
      (dedup odvozen z guarded flip na `paid` — notifikace jen z `paid_applied`)
    - _Requirements: 4.1, 5.2, 6.1_

  - [ ]* 11.3 Integrační testy hooků (mock Notifieru)
    - `notifyBusinessCreated` se volá po `commitOnboarding` ok; `notifyPaymentConfirmed` ve větvi
      `paid_applied`; dvojí doručení webhooku → notify právě jednou; selhání notifikace nezmění
      výsledek toku ani redirect
    - _Requirements: 3.1, 4.1, 5.1, 5.2, 6.1, 6.2_

- [ ] 12. Příchozí Route Handler
  - [ ] 12.1 Vytvořit `src/app/api/telegram/webhook/route.ts`
    - Tenký adaptér dle vzoru `app/api/webhooks/gopay/route.ts`: `resolveWebhookSecret` → `null` →
      HTTP 401 + log `telegram_webhook_secret_missing` bez Secret_Value; `isAuthorizedSecret`
      nad hlavičkou `x-telegram-bot-api-secret-token` → neshoda/chybí → HTTP 401 bez business
      logiky; `await request.json()` v `try/catch` → neplatné tělo → HTTP 200 bez příkazu; jinak
      `handleTelegramUpdate(update)` a HTTP 200
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 12.2 Unit testy Route Handleru
    - Nenastavený/neshodný/chybějící secret → 401 bez dispatch; neplatné tělo → 200 bez příkazu;
      validní ověřený update → 200 a volání `handleTelegramUpdate`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 13. Wiring konfigurace
  - [ ] 13.1 Doplnit nové proměnné do `.env.example`
    - Přidat `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
      s krátkým českým komentářem (server-only, bez nich je feature no-op / webhook odmítá vše)
    - _Requirements: 1.1, 1.4, 7.3_

- [ ] 14. Finální checkpoint
  - Spustit `pnpm test:run`, `pnpm lint` a `pnpm build`. Ensure all tests pass, ask the user if
    questions arise.

## Notes

- Tasky označené `*` jsou volitelné (testy) a lze je přeskočit pro rychlejší MVP; povinné jsou
  jádro a wiring.
- Žádné nové DB tabulky ani migrace — čte se jen read-only `payments`, `subscriptions`,
  `businesses`. Dedup notifikací je odvozen z existující sémantiky (guarded flip / unikátnost slugu).
- Každá vlastnost P1–P11 má vlastní property test (fast-check, `{ numRuns: 100 }`, otagováno
  `// Feature: telegram-operator-notifications, Property {n}: {text}`), sladěno s
  `src/__tests__/pbt-smoke.test.ts`.
- Property testy cílí na čisté funkce v `src/lib/telegram/`; Telegram Bot API, čtení DB, hooky
  v existujících tocích a Route Handler jsou ověřeny unit/integračními testy s mocky.
- Moduly s I/O začínají `import 'server-only'`; tajemství se nikdy nelogují.
- Checkpointy zajišťují inkrementální ověření (lint/test, u Route Handleru i build).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "3.1", "3.4", "3.6", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.4", "3.2", "3.3", "3.5", "3.7", "3.8", "4.2", "4.3", "4.4"] },
    { "id": 2, "tasks": ["6.1", "7.1", "7.2", "7.3"] },
    { "id": 3, "tasks": ["6.2", "7.4"] },
    { "id": 4, "tasks": ["6.3", "8.1", "9.1"] },
    { "id": 5, "tasks": ["8.2", "9.2", "11.1", "11.2", "12.1", "13.1"] },
    { "id": 6, "tasks": ["11.3", "12.2"] }
  ]
}
```
