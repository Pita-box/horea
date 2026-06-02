# Implementation Plan: subscription-payments

## Overview

Plán implementuje kompletní platební a předplatitelský životní cyklus podniku v Next.js aplikaci na Vercelu (TypeScript, Supabase, GoPay, Resend). Postup je inkrementální: nejdřív datová vrstva a čisté doménové funkce (stavový automat, variabilní symbol, SPAYD, číslování faktur), pak služby (kupóny, checkout, webhook, billing), poté cron úlohy a UI, nakonec integrace a E2E. Každý krok navazuje na předchozí a končí napojením do funkčního celku — žádný osamocený kód.

V souladu s `CLAUDE.md` (Simplicity First) implementujeme minimum kódu na vyřešení problému — žádné spekulativní vrstvy ani nevyžádaná konfigurabilita. Doménová logika žije v `lib/`, route handlery jsou tenké adaptéry.

Testovací konvence (z designu, sekce *Testing Strategy*):
- Property testy se píší v **fast-check**, **min. 100 iterací**, otagované `Feature: subscription-payments, Property {číslo}: {text vlastnosti}`.
- Property/unit/integration testy jsou volitelné sub-tasky označené `*`.

## Tasks

- [ ] 1. Datová vrstva a migrace
  - [ ] 1.1 Migrace tabulky `subscriptions`
    - Přidat sloupce `auto_renew` (bool, default `true`), `first_failed_charge_at` (timestamp, nullable), `pending_plan_change` (nullable) do tabulky `subscriptions`
    - _Requirements: 2.2, 6.4, 6.7, 8.1, 11.1, 11.3_

  - [ ] 1.2 Migrace tabulky `invoice_counter`
    - Vytvořit tabulku `invoice_counter` držící poslední přidělené pořadové číslo faktury per kalendářní rok, vhodnou pro zamykání řádku (`SELECT ... FOR UPDATE`)
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ] 1.3 Migrace tabulky `payments`
    - Přidat sloupec `invoice_number` a unique constraint na `variable_symbol` i `invoice_number` napříč celou tabulkou
    - _Requirements: 5.2, 7.4_

- [ ] 2. Stavový automat a doménové výpočty (čisté funkce)
  - [ ] 2.1 Implementovat `computeState(first_failed_charge_at, now)`
    - Čistá funkce vracející `status` dle kotvy: `null` ⇒ `active`; `0 ≤ Δ < 30 dní` ⇒ `grace_period`; `30 ≤ Δ < 90 dní` ⇒ `expired`; `Δ ≥ 90 dní` ⇒ `deleted_data` (Δ v sekundách, Jeden_Mesic = 2 592 000 s)
    - Soubor `lib/subscription/state-machine.ts`
    - _Requirements: 6.1, 6.4, 6.7_
    - _Properties: 1_

  - [ ]* 2.2 Property test pro stavový automat
    - **Property 1: Validita stavového automatu a deterministické anchored timeouty**
    - Generátor varíruje kotvu (vč. `null`) a `now` včetně hranic kolem 30/90 dní; ověřuje status + invarianty `is_published`
    - _Properties: 1_
    - _Requirements: 1.3, 1.6, 3.6, 4.1, 4.2, 4.3, 5.6, 6.3, 6.4, 6.5, 6.6, 6.7, 11.3_

  - [ ] 2.3 Implementovat aplikaci přechodů a doprovodné efekty
    - Funkce perzistující přechod: `status`, `business.is_published`, zámek dashboardu, nastavení kotvy při prvním selhání (bez přepisu existující), vymazání kotvy při úspěšné platbě/reaktivaci — vše v jedné DB transakci
    - Soubor `lib/subscription/transitions.ts`
    - _Requirements: 1.3, 4.1, 4.2, 4.3, 5.6, 6.5, 6.6, 11.3_

  - [ ] 2.4 Implementovat prodloužení období `extendPeriod`
    - Čistá funkce prodlužující `current_period_end` přesně o Jeden_Mesic (2 592 000 s)
    - Soubor `lib/subscription/period.ts`
    - _Requirements: 1.5, 2.3, 5.5_
    - _Properties: 6_

  - [ ]* 2.5 Property test pro prodloužení období
    - **Property 6: Prodloužení období o přesně jeden měsíc**
    - _Properties: 6_
    - _Requirements: 1.5, 2.3, 5.5_

- [ ] 3. Generátor variabilního symbolu
  - [ ] 3.1 Implementovat `generateVariableSymbol`
    - Číselný VS o délce 1–10 číslic, unikátní napříč `payments` (odvození z monotónní sekvence, ne náhody — unikátnost zaručená, ne pravděpodobnostní)
    - Soubor `lib/payments/variable-symbol.ts`
    - _Requirements: 5.1, 5.2_
    - _Properties: 3_

  - [ ]* 3.2 Property test pro variabilní symbol
    - **Property 3: Formát a unikátnost variabilního symbolu**
    - Generátor varíruje posloupnost pokusů včetně hranic délky 1 a 10 číslic
    - _Properties: 3_
    - _Requirements: 5.1, 5.2_

- [ ] 4. SPAYD QR generátor
  - [ ] 4.1 Implementovat `encodeSpayd` a generování QR
    - SPAYD 1.0 řetězec `SPD*1.0*` s poli `ACC` (IBAN), `AM` (částka CZK), `CC` (`CZK`), `X-VS` (variabilní symbol); round-trip bezpečné formátování částky a escapování hodnot; z řetězce QR obrázek
    - Soubor `lib/payments/spayd.ts`
    - _Requirements: 4.4, 4.7_
    - _Properties: 4_

  - [ ]* 4.2 Property test pro SPAYD round-trip
    - **Property 4: SPAYD round-trip**
    - Generátor varíruje IBAN, částku, VS; ověří, že encode→decode zachová IBAN, částku, měnu a VS
    - _Properties: 4_
    - _Requirements: 4.4, 4.7_

- [ ] 5. Faktura_Generator
  - [ ] 5.1 Implementovat atomické přidělení čísla faktury
    - Transakce se zámkem nad řádkem `invoice_counter` per rok: přečíst poslední, inkrementovat o 1, zapsat; číslo se přiděluje až při přechodu Payment na `paid`
    - Soubor `lib/invoices/invoice-number.ts`
    - _Requirements: 7.2, 7.3, 7.4_
    - _Properties: 5_

  - [ ]* 5.2 Property test pro číslování faktur
    - **Property 5: Monotonie a bezmezerovost číslování faktur**
    - Generátor varíruje posloupnost (i souběžných) přidělení; ověří striktně rostoucí, unikátní, gap-free v rámci roku
    - _Properties: 5_
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ] 5.3 Implementovat generování PDF a uložení faktury
    - Vygenerovat PDF faktury, uložit do Supabase Storage, zapsat odkaz do `payment.invoice_url`, přidělit číslo přes `invoice-number`
    - Soubor `lib/invoices/invoice-generator.ts`
    - _Requirements: 7.1, 7.5, 7.6_

  - [ ]* 5.4 Integrační test číslování faktur proti reálné DB
    - Ověřit skutečný zámek řádku `invoice_counter` při souběžném dokončení plateb (Property 5 na úrovni DB)
    - _Properties: 5_
    - _Requirements: 7.3, 7.4_

  - [ ]* 5.5 Integrační test uložení faktury
    - Generování PDF, upload do Supabase Storage, nastavení `invoice_url`
    - _Requirements: 7.1, 7.5, 7.6_

- [ ] 6. Checkpoint — průběžná validace jádra
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Aplikace kupónu
  - [ ] 7.1 Implementovat validaci kupónu
    - Ověřit existenci, platnost (datum) a dostupný počet použití; české chybové hlášky; inkrement počtu použití při aplikaci (CRUD kupónů mimo rozsah)
    - Soubor `lib/coupons/validate.ts`
    - _Requirements: 9.1, 9.2_

  - [ ]* 7.2 Unit test validace kupónu
    - Neexistující / expirovaný / vyčerpaný kupón → platba nezahájena + česká hláška
    - _Requirements: 9.1, 9.2_

  - [ ] 7.3 Implementovat aplikaci slevy a aktivačních kupónů
    - Procentuální sleva, fixní sleva s floor 0 Kč, free trial (`active`, `is_published`, `current_period_end = now + dny`, bez stržení), comp účet (`active`, `is_published`, bez stržení a bez recurring schedule)
    - Soubor `lib/coupons/apply.ts`
    - _Requirements: 9.3, 9.4, 9.5, 9.6_
    - _Properties: 7_

  - [ ]* 7.4 Property test pro slevu kupónu
    - **Property 7: Korektnost slevy kupónu**
    - Generátor varíruje tarif a typ/velikost slevy včetně hranic 0/100 %; ověří účtovaná částka ≥ 0
    - _Properties: 7_
    - _Requirements: 9.3, 9.4_

- [ ] 8. Checkout a první platba
  - [ ] 8.1 Implementovat mapování tarif → částka a vytvoření Payment
    - Mapování `start`/`pokrocily`/`max` → 199/299/599 Kč; vytvoření Payment `pending` s metodou `auto_charge` a variabilním symbolem
    - Soubor `lib/checkout/pricing.ts`
    - _Requirements: 1.1_

  - [ ]* 8.2 Unit test mapování tarif → částka
    - Ověřit částky 199/299/599 a vytvoření Payment `pending`/`auto_charge`
    - _Requirements: 1.1_

  - [ ] 8.3 Implementovat checkout server action `/api/checkout`
    - Validace + aplikace kupónu, vytvoření Payment `pending`, iniciace GoPay platby + recurring schedule a redirect; u free trial / comp přímá aktivace bez platby; opakování platby při selhání/zrušení
    - Soubory `app/api/checkout/route.ts`, `lib/checkout/checkout.ts`
    - _Requirements: 1.1, 1.2, 1.6, 9.5, 9.6_

- [ ] 9. Webhook handler
  - [ ] 9.1 Implementovat HMAC ověření
    - Ověření podpisu webhooku proti sdílenému tajemství; při neshodě 401 a žádná změna
    - Soubor `lib/webhooks/hmac.ts`
    - _Requirements: 3.1, 3.2_

  - [ ]* 9.2 Unit test HMAC ověření
    - Validní podpis akceptován, neplatný → 401
    - _Requirements: 3.1, 3.2_

  - [ ] 9.3 Implementovat handler `/api/webhooks/gopay`
    - Dohledání Payment podle `gopay_payment_id`, idempotentní aktualizace stavu (kontrola cílového stavu před aplikací), neznámé ID → 200 bez změny, vyvolání přechodu Stavoveho_Automatu a Faktura_Generator při `paid`
    - Soubory `app/api/webhooks/gopay/route.ts`, `lib/webhooks/handler.ts`
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [ ]* 9.4 Property test idempotence webhooku
    - **Property 2: Idempotence webhooku**
    - Generátor varíruje payload vč. neznámého `gopay_payment_id`; ověří stejný stav po 1× i 2× aplikaci
    - _Properties: 2_
    - _Requirements: 3.4, 3.5_

  - [ ]* 9.5 Integrační test webhooku end-to-end
    - HMAC, mapování stavu, idempotence při opakovaném doručení, aktivace předplatného
    - _Requirements: 3.3, 1.3, 1.4_

- [ ] 10. Billing_Engine
  - [ ] 10.1 Implementovat založení recurring schedule
    - Po úspěšné první platbě založit GoPay recurring schedule a uložit `gopay_schedule_id` do subscription
    - Soubor `lib/billing/schedule.ts`
    - _Requirements: 2.1_

  - [ ] 10.2 Implementovat měsíční charge
    - Vytvořit Payment `pending`/`auto_charge` před voláním GoPay charge; při selhání iniciace (GoPay nedostupné) log + admin notifikace, stav zůstává `active`
    - Soubor `lib/billing/charge.ts`
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [ ]* 10.3 Unit test billing
    - Payment `pending` vzniká před charge; selhání iniciace ponechá `active` + notifikace admina
    - _Requirements: 2.4, 2.5_

- [ ] 11. Checkpoint — platební jádro
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Cron úlohy a konfigurace
  - [ ] 12.1 Implementovat Billing_Cron `/api/cron/billing`
    - Iterovat předplatná `active` + `auto_renew` + dosažený `current_period_end`, iniciovat charge; při selhání přechod do `grace_period`; continue-on-error (log + admin, pokračuj); ochrana cron secret
    - Soubor `app/api/cron/billing/route.ts`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 12.2 Implementovat Cleanup_Cron `/api/cron/cleanup`
    - Pro podniky ≥ 90 dní od kotvy nastavit `deleted_data` a smazat tenant data (profil, služby, otvírací doby, rezervace, klienti); zachovat `users` (email + password hash) a historii `subscriptions`/`payments`; continue-on-error; cron secret
    - Soubor `app/api/cron/cleanup/route.ts`
    - _Requirements: 6.7, 6.8, 10.4, 10.6_
    - _Properties: 8_

  - [ ]* 12.3 Property test úplnosti mazání dat
    - **Property 8: Úplnost mazání dat**
    - Generátor varíruje dataset podniku (prázdný i bohatý); ověří zachování jen email+hash + historie plateb
    - _Properties: 8_
    - _Requirements: 6.7, 6.8_

  - [ ] 12.4 Implementovat Warning_Cron `/api/cron/warnings`
    - Predikáty odeslání e-mailu v den 23 (před `grace_period`→`expired`) a den 83 (před `expired`→`deleted_data`) od kotvy; continue-on-error; cron secret
    - Soubory `app/api/cron/warnings/route.ts`, `lib/warnings/predicates.ts`
    - _Requirements: 6.10, 6.11, 10.5, 10.6_

  - [ ]* 12.5 Unit test warning predikátů
    - E-mail jen v den 23 a den 83 od kotvy, jinak ne
    - _Requirements: 6.10, 6.11_

  - [ ]* 12.6 Integrační test stavových přechodů přes cron
    - Billing → `grace_period`, cleanup → `deleted_data`
    - _Requirements: 10.1, 10.2, 10.4_

  - [ ] 12.7 Konfigurace Vercel Cron ve `vercel.json`
    - Deklarovat denní cron triggery pro `/api/cron/billing`, `/api/cron/warnings`, `/api/cron/cleanup`
    - _Requirements: 10.1, 10.4, 10.5_

- [ ] 13. Změna tarifu
  - [ ] 13.1 Implementovat žádost o změnu a její zrušení
    - Zaznamenat `pending_plan_change` bez změny aktuálního `plan` (žádná prorace); umožnit zrušení nevyřízené změny před koncem období
    - Soubor `lib/subscription/plan-change.ts`
    - _Requirements: 8.1, 8.3, 8.4_

  - [ ] 13.2 Implementovat aplikaci změny na konci období
    - Při dosažení `current_period_end` s evidovanou změnou nastavit `plan` na cílový a od dalšího období účtovat novou částku
    - Soubor `lib/subscription/plan-change.ts`
    - _Requirements: 8.2_

  - [ ]* 13.3 Unit test změny tarifu
    - Záznam pending, aplikace na konci období, žádná prorace, zrušení změny
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 14. Zrušení a obnova automatické obnovy
  - [ ] 14.1 Implementovat přepínání `auto_renew`
    - Zrušení (`auto_renew=false`, status zůstává `active`, profil publikovaný do konce období) a opětovné zapnutí (`auto_renew=true`); při dosažení konce období s `auto_renew=false` přechod do `expired` + nastavení kotvy = `current_period_end`
    - Soubor `lib/subscription/auto-renew.ts`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 14.2 Unit test přepínání auto-obnovy
    - Zrušení i opětovné zapnutí auto-obnovy
    - _Requirements: 11.1, 11.4_

- [ ] 15. České e-mailové šablony
  - [ ] 15.1 Implementovat e-mailové šablony
    - Šablony v češtině: faktura, QR fallback (QR + bankovní údaje + VS), varování (grace→expired den 23, expired→deleted den 83)
    - Soubor `lib/emails/templates.ts`
    - _Requirements: 4.6, 6.10, 6.11, 7.7_

- [ ] 16. Stránka předplatného a napojení UI
  - [ ] 16.1 Implementovat `/dashboard/subscription`
    - Výběr tarifu, zobrazení stavu a období, zrušení/obnova auto-obnovy, žádost o změnu tarifu a její zrušení, aplikace kupónu; napojení na checkout, plan-change a auto-renew akce
    - Soubor `app/dashboard/subscription/page.tsx`
    - _Requirements: 1.1, 8.1, 8.4, 9.1, 11.1, 11.4_

- [ ] 17. Integrace a E2E
  - [ ]* 17.1 Integrační test reaktivace
    - `deleted_data` → `active` s prázdným profilem a `expired` → `active` v okně 30–90 dní
    - _Requirements: 6.6, 6.9_

  - [ ]* 17.2 E2E test happy path (Playwright)
    - Registrace → výběr tarifu → checkout → GoPay sandbox → aktivace → publikovaný profil → doručená faktura
    - _Requirements: 1.2, 1.3, 1.4_

- [ ] 18. Závěrečný checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasky označené `*` jsou volitelné (property / unit / integrační / E2E testy) a lze je přeskočit pro rychlejší MVP.
- Každý task odkazuje na konkrétní požadavky (`_Requirements:_`) a kde se ověřuje vlastnost, i na vlastnost (`_Properties:_`) pro traceabilitu.
- Property testy (fast-check, ≥100 iterací, otagované) ověřují univerzální vlastnosti; unit testy cílí na konkrétní příklady a hranice; integrační testy běží proti lokálnímu Supabase / GoPay sandboxu.
- Checkpointy zajišťují inkrementální validaci ve třech bodech (jádro, platební jádro, závěr).
- Implementační jazyk je TypeScript (Next.js na Vercelu) dle designu.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "3.1", "4.1", "12.7"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "3.2", "4.2", "5.1", "7.1", "8.1", "9.1"] },
    { "id": 2, "tasks": ["2.5", "5.2", "5.3", "7.2", "7.3", "8.2", "9.2", "10.1", "13.1", "14.1", "15.1"] },
    { "id": 3, "tasks": ["5.4", "5.5", "7.4", "8.3", "9.3", "10.2", "13.2", "14.2"] },
    { "id": 4, "tasks": ["9.4", "9.5", "10.3", "12.1", "12.2", "12.4", "13.3"] },
    { "id": 5, "tasks": ["12.3", "12.5", "12.6", "16.1", "17.1"] },
    { "id": 6, "tasks": ["17.2"] }
  ]
}
```
