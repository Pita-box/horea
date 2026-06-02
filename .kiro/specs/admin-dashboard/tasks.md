# Implementation Plan: admin-dashboard

## Overview

Plán implementuje administrátorský dashboard provozovatele platformy (`/admin`) v Next.js aplikaci na Vercelu (TypeScript, Supabase, Resend). Postup je inkrementální: nejdřív datová vrstva (nová tabulka `audit_log` + DB-level append-only, `coupons.is_active`), pak řízení přístupu a auditní jádro, poté čtecí plochy (statistiky, audit log, seznam a detail podniku), následně citlivé admin akce (override, free trial / comp, pozastavení, vynucené smazání, kupóny, párování plateb, opětovné odeslání faktury), nakonec napojení akcí do detailu a integrační / E2E testy. Každý krok navazuje na předchozí a končí napojením do funkčního celku — žádný osamocený kód.

V souladu s `CLAUDE.md` (Simplicity First) implementujeme minimum kódu na vyřešení problému — žádné spekulativní vrstvy, žádné BI nástroje, žádná nevyžádaná konfigurabilita. Doménová logika žije v `lib/admin/`, stránky pod `app/admin/` jsou tenké SSR adaptéry, zápisy běží jako server actions se service role klíčem.

**Vědomé znovupoužití (nezduplikovat):**
- **Efekt spárování platby** (`paid` → prodloužení období + přechod stavu) vlastní `subscription-payments` (tamní R5.5/R5.6, Property 6). PaymentMatcher pouze nastaví `paid` a deleguje na existující efekt.
- **Mazání tenant dat** při vynuceném smazání znovupoužívá cleanup logiku ze `subscription-payments` (tamní Cleanup_Cron, Property 8) — spuštěno ručně a okamžitě, s zachováním historie `subscriptions`/`payments`.

Testovací konvence (z designu, sekce *Testing Strategy*):
- Property testy se píší v **fast-check**, **min. 100 iterací**, otagované `Feature: admin-dashboard, Property {číslo}: {text vlastnosti}`.
- Property / unit / integrační / E2E testy jsou volitelné sub-tasky označené `*`.

## Tasks

- [ ] 1. Datová vrstva a migrace
  - [ ] 1.1 Migrace tabulky `audit_log`
    - Vytvořit tabulku `audit_log` se sloupci `id` (uuid PK), `actor_user_id` (uuid FK na `users`), `action_type` (text), `target_type` (text), `target_id` (uuid), `before` (jsonb, nullable), `after` (jsonb, nullable), `created_at` (timestamp, default now)
    - Soubor `supabase/migrations/{ts}_create_audit_log.sql`
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 1.2 Vynutit append-only nad `audit_log` na úrovni DB
    - Grant pouze `INSERT`/`SELECT`, odebrat (`REVOKE`) `UPDATE` a `DELETE` nad `audit_log` i pro service role; doplnit RLS policy povolující výhradně `INSERT`/`SELECT`, takže existující záznam nelze změnit ani odstranit žádnou cestou
    - Soubor `supabase/migrations/{ts}_audit_log_append_only.sql`
    - _Requirements: 9.5_
    - _Properties: 3_

  - [ ] 1.3 Migrace sloupce `coupons.is_active`
    - Přidat sloupec `is_active` (bool, default `true`) do tabulky `coupons`; checkout v `subscription-payments` jej musí při aplikaci respektovat
    - Soubor `supabase/migrations/{ts}_coupons_is_active.sql`
    - _Requirements: 7.6_

- [ ] 2. Řízení přístupu (Access_Guard + RLS admin override)
  - [ ] 2.1 Implementovat Access_Guard middleware pro `/admin/*`
    - Middleware ověří session a `users.is_admin` před vykreslením jakéhokoli obsahu: admin → povolit; neautentizovaný → redirect na login; autentizovaný ne-admin → HTTP 403 s českou hláškou; žádná data dashboardu se neodešlou v jiné než povolené větvi
    - Soubory `middleware.ts`, `lib/admin/access-guard.ts`
    - _Requirements: 1.1, 1.2, 1.3_
    - _Properties: 1_

  - [ ] 2.2 Ověřit / rozšířit RLS admin override policies
    - Ověřit a doplnit RLS policies (dle `architecture` ADR-5, R1/R17) tak, aby přihlášený admin mohl číst tenant-scoped data všech podniků (`businesses`, `subscriptions`, `payments`); cross-tenant zápisy zůstávají server-side přes service role
    - Soubor `supabase/migrations/{ts}_rls_admin_override.sql`
    - _Requirements: 1.4, 1.5_

  - [ ]* 2.3 Property test pro řízení přístupu
    - **Property 1: Řízení přístupu — ne-admin nikdy nedostane data dashboardu**
    - Generátor varíruje profil uživatele (admin / ne-admin / neautentizovaný) a cestu pod `/admin`; ověří data jen pro autentizovaného admina, jinak redirect/403 bez obsahu
    - _Properties: 1_
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. AuditLogger (auditní jádro)
  - [ ] 3.1 Implementovat AuditLogger
    - Zápis právě jednoho `audit_log` záznamu ve **stejné DB transakci** jako citlivá akce (actor, action_type, target_type, target_id, created_at, volitelně before/after); zachycení before/after je **best-effort** — při technickém selhání vznikne záznam s `before`/`after` = `null` a akce nesmí kvůli tomu padnout
    - Soubor `lib/admin/audit-logger.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
    - _Properties: 2_

  - [ ]* 3.2 Property test úplnosti auditní stopy
    - **Property 2: Úplnost auditní stopy**
    - Generátor varíruje typ citlivé akce (override/úprava předplatného, free trial, comp, pozastavení, vynucené smazání, CRUD kupónu, spárování platby); ověří přesně 1 nový záznam s povinnými poli
    - _Properties: 2_
    - _Requirements: 5.7, 6.4, 7.8, 8.5, 9.1, 9.2_

  - [ ]* 3.3 Property test append-only auditní stopy
    - **Property 3: Auditní stopa je append-only**
    - Generátor varíruje posloupnost operací včetně pokusů o `UPDATE`/`DELETE` auditních záznamů; ověří, že dříve zapsané záznamy zůstávají beze změny a nelze je odstranit
    - _Properties: 3_
    - _Requirements: 9.5_

  - [ ]* 3.4 Unit test best-effort zachycení before/after
    - Stavově-měnící akce: `before`/`after` odpovídá změně (R9.3); edge-case — selhání zachycení kontextu → záznam s `null` a akce nepadne (R9.4)
    - _Requirements: 9.3, 9.4_

- [ ] 4. Checkpoint — datová vrstva, přístup a audit
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Přehled a statistiky
  - [ ] 5.1 Implementovat StatsAggregator
    - Agregační SQL nad existujícími tabulkami pro zvolené období: počet nových registrací, počet `active` předplatných, Churn, rozpad podniků dle `subscription.status` (`free`/`active`/`grace_period`/`expired`), součet `amount_czk` plateb `paid`; časově závislé metriky se přepočítají při změně období
    - Soubor `lib/admin/stats.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
    - _Properties: 5_

  - [ ] 5.2 Implementovat přehledovou stránku `/admin`
    - SSR stránka s volbou časového období zobrazující metriky ze StatsAggregator
    - Soubor `app/admin/page.tsx`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 5.3 Property test správnosti statistik
    - **Property 5: Správnost statistik**
    - Generátor varíruje dataset podniků/plateb a hranice období; ověří (a) tržby = suma `amount_czk` `paid` plateb v období a (b) rozpad podniků dle stavu je partition (každý podnik právě jednou, součet kategorií = celek)
    - _Properties: 5_
    - _Requirements: 2.4, 2.5_

  - [ ]* 5.4 Unit test metrik přehledu
    - Počty registrací / Churn pro dataset uvnitř i vně období; rozlišení časově závislých vs. aktuálně-stavových metrik při změně období
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

- [ ] 6. Prohlížení auditní stopy
  - [ ] 6.1 Implementovat AuditLogViewer
    - Read-only čtení `audit_log` seřazené sestupně dle `created_at`; filtry dle typu akce, časového rozsahu a cílového objektu; rozhraní neumožňuje úpravu ani mazání
    - Soubor `lib/admin/audit-viewer.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ] 6.2 Implementovat stránku `/admin/audit`
    - SSR stránka zobrazující auditní záznamy s filtry (typ akce, časový rozsah, cílový objekt)
    - Soubor `app/admin/audit/page.tsx`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 6.3 Unit test prohlížení auditu
    - Sestupné řazení dle `created_at`; filtry dle typu akce / rozsahu / cílového objektu
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 7. Seznam podniků
  - [ ] 7.1 Implementovat seznam podniků s filtry (BusinessManager)
    - Vrací podniky s názvem, slugem, stavem předplatného a tarifem; filtry dle `subscription.status` a data registrace; fulltext nad e-mailem vlastníka, názvem a slugem; prázdný výsledek → prázdný seznam s českou informační hláškou
    - Soubor `lib/admin/business-manager.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 7.2 Implementovat stránku `/admin/businesses`
    - SSR stránka se seznamem, filtry a vyhledávacím polem napojená na BusinessManager
    - Soubor `app/admin/businesses/page.tsx`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 7.3 Unit test seznamu a filtrů
    - Obsah položky (název, slug, stav, tarif), filtry dle stavu a data, fulltext shoda, prázdný stav s českou hláškou
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 8. Detail podniku
  - [ ] 8.1 Implementovat detail podniku (BusinessManager)
    - Vrací profil podniku a vlastníka (e-mail, datum registrace), aktuální stav/tarif/`current_period_end`, historii plateb (částka, stav, metoda, VS, datum) a celkový počet rezervací
    - Soubor `lib/admin/business-manager.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 8.2 Implementovat stránku `/admin/businesses/[id]`
    - SSR stránka zobrazující detail podniku (read-only data); akční tlačítka se napojí v tasku 17
    - Soubor `app/admin/businesses/[id]/page.tsx`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 8.3 Unit test detailu podniku
    - Profil + vlastník, stav/tarif/`current_period_end`, řádek historie plateb, počet rezervací
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 9. Checkpoint — čtecí plochy dashboardu
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Override předplatného a pozastavení podniku
  - [ ] 10.1 Implementovat override předplatného + audit
    - Server action (service role) přímo nastaví `subscription.plan`, `subscription.status` a `current_period_end` na zvolené hodnoty (vědomě obchází stavový automat ze `subscription-payments`); auditní záznam s before/after ve stejné transakci
    - Soubor `lib/admin/subscription-override.ts`
    - _Requirements: 5.1, 5.2, 5.7_
    - _Properties: 2_

  - [ ] 10.2 Implementovat pozastavení podniku + audit
    - Server action nastaví `business.is_published = false`; auditní záznam s before/after ve stejné transakci
    - Soubor `lib/admin/subscription-override.ts`
    - _Requirements: 5.5, 5.7_
    - _Properties: 2_

  - [ ]* 10.3 Unit test override a pozastavení
    - Cílové hodnoty `plan`/`status`/`current_period_end`; pozastavení `is_published=false`; auditní before/after odpovídá změně
    - _Requirements: 5.1, 5.2, 5.5, 5.7_

- [ ] 11. Free trial a comp účet
  - [ ] 11.1 Implementovat udělení Free_Trial a Comp_Ucet (atomicky) + audit
    - V jedné DB transakci: Free_Trial → `status=active`, `business.is_published=true`, `current_period_end` = konec zkušebního období, bez platby; Comp_Ucet → `status=active`, `is_published=true`, bez platby a bez recurring schedule; jakákoli dílčí chyba vrátí celou změnu; auditní záznam s before/after
    - Soubor `lib/admin/grants.ts`
    - _Requirements: 5.3, 5.4, 5.6, 5.7_
    - _Properties: 6, 2_

  - [ ]* 11.2 Property test atomicity Free_Trial a Comp_Ucet
    - **Property 6: Atomicita udělení Free_Trial a Comp_Ucet**
    - Generátor varíruje počáteční stav předplatného a bod selhání v sekvenci dílčích změn; ověří úplný rollback na původní stav (all-or-nothing)
    - _Properties: 6_
    - _Requirements: 5.6_

  - [ ]* 11.3 Unit test cílových hodnot Free_Trial / Comp_Ucet
    - Free_Trial (active + is_published + period_end, bez platby) a Comp_Ucet (active + is_published, bez platby a bez schedule)
    - _Requirements: 5.3, 5.4_

- [ ] 12. Vynucené smazání podniku
  - [ ] 12.1 Implementovat vynucené smazání + audit
    - Po explicitním potvrzení smazat tenant data (profil, služby, otvírací doby, rezervace, klienti) **znovupoužitím cleanup logiky ze `subscription-payments`** (neduplikovat); zachovat historii `subscriptions` a `payments`; auditní záznam ve stejné transakci
    - Soubor `lib/admin/force-delete.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
    - _Properties: 7, 2_

  - [ ]* 12.2 Property test úplnosti vynuceného smazání
    - **Property 7: Úplnost vynuceného smazání podniku**
    - Generátor varíruje dataset podniku (prázdný i bohatý); ověří, že po smazání neexistují tenant data, zatímco historie `subscriptions`/`payments` zůstává beze změny zachována
    - _Properties: 7_
    - _Requirements: 6.2, 6.3_

- [ ] 13. Checkpoint — admin akce nad podnikem
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Správa kupónů (CRUD)
  - [ ] 14.1 Implementovat CouponManager CRUD + audit
    - Vytvoření (ověření unikátnosti `code`, validace `percent` `value` v rozsahu 0–100, jinak odmítnutí s českou hláškou), úprava, deaktivace (`is_active=false`, bez mazání záznamu), smazání; seznam s aktuálním počtem použití; každá operace s auditním záznamem
    - Soubor `lib/admin/coupon-manager.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
    - _Properties: 4, 2_

  - [ ] 14.2 Implementovat stránku `/admin/coupons`
    - SSR stránka se seznamem kupónů (vč. počtu použití) a formuláři pro vytvoření / úpravu / deaktivaci / smazání
    - Soubor `app/admin/coupons/page.tsx`
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 14.3 Property test validace kupónu
    - **Property 4: Validace kupónu**
    - Generátor varíruje `code`, `type`, `value` vč. hranic 0/100 a duplicitních kódů; ověří unikátnost `code` a `percent` value v rozsahu 0–100 včetně
    - _Properties: 4_
    - _Requirements: 7.2, 7.3_

  - [ ]* 14.4 Unit test CRUD kupónů
    - Persistence atributů při vytvoření a úpravě, deaktivace, smazání, obsah seznamu s počtem použití
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.7_

- [ ] 15. Ruční párování plateb
  - [ ] 15.1 Implementovat PaymentMatcher + audit
    - Seznam Cekajici_Platba (`pending` + `qr_manual`) s VS, částkou, podnikem a datem; vyhledání dle VS; spárování nastaví `payment.status=paid`, čímž **spustí efekt prodloužení ze `subscription-payments`** (neduplikovat výpočet); při selhání nastavení `paid` zůstává `pending` + česká hláška; auditní záznam
    - Soubor `lib/admin/payment-matcher.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
    - _Properties: 2_

  - [ ] 15.2 Implementovat stránku `/admin/payments`
    - SSR stránka se seznamem čekajících plateb, vyhledáním dle VS a akcí spárování
    - Soubor `app/admin/payments/page.tsx`
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 15.3 Unit test párování plateb
    - Obsah řádku čekající platby, vyhledání dle VS; edge-case — selhání nastavení `paid` ponechá `pending` s českou hláškou
    - _Requirements: 8.1, 8.2, 8.4_

- [ ] 16. Opětovné odeslání faktury
  - [ ] 16.1 Implementovat InvoiceResender
    - Ověřit existenci alespoň jednoho `payment` se stavem `paid` a vyplněným `invoice_url`; poté odeslat nejnovější takovou fakturu na e-mail vlastníka přes Resend; bez faktury akci neprovést a zobrazit českou hlášku (akce se neaudituje)
    - Soubor `lib/admin/invoice-resender.ts`
    - _Requirements: 11.1, 11.2_

  - [ ]* 16.2 Unit test opětovného odeslání faktury
    - Ověření existence paid faktury a výběr nejnovější; absence faktury → česká hláška
    - _Requirements: 11.1, 11.2_

- [ ] 17. Napojení admin akcí do detailu podniku
  - [ ] 17.1 Napojit akční tlačítka do `/admin/businesses/[id]`
    - Doplnit do detailu podniku tlačítka a formuláře pro override, Free_Trial, Comp_Ucet, pozastavení, vynucené smazání (s explicitním potvrzovacím dialogem) a opětovné odeslání faktury; napojit na server actions z tasků 10, 11, 12, 16
    - Soubor `app/admin/businesses/[id]/page.tsx`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 11.1_

- [ ] 18. Checkpoint — všechny admin akce napojeny
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Integrační testy (lokální Supabase / Docker)
  - [ ]* 19.1 Integrační test RLS admin override
    - Admin přečte řádky více podniků, ne-admin je nepřečte
    - _Requirements: 1.4, 1.5_

  - [ ]* 19.2 Integrační test append-only auditu na úrovni DB
    - Pokus o `UPDATE`/`DELETE` nad `audit_log` je odmítnut i se service role
    - _Requirements: 9.5_
    - _Properties: 3_

  - [ ]* 19.3 Integrační test spárování platby → efekt prodloužení
    - Nastavení `paid` vyvolá efekt definovaný v `subscription-payments`; korektnost prodloužení vlastní onen spec
    - _Requirements: 8.3_

  - [ ]* 19.4 Integrační test úplnosti vynuceného smazání
    - Proti reálné DB ověřit úplnost mazání tenant dat a zachování historie `subscriptions`/`payments`
    - _Requirements: 6.2, 6.3_
    - _Properties: 7_

- [ ] 20. End-to-end testy (Playwright, happy path)
  - [ ]* 20.1 E2E test CRUD kupónu
    - Vytvoření, úprava, deaktivace a smazání kupónu z `/admin/coupons`, vč. odmítnutí duplicitního kódu
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 7.7_

  - [ ]* 20.2 E2E test ručního párování platby
    - Vyhledání čekající platby dle VS na `/admin/payments` a její spárování po potvrzení
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 21. Závěrečný checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasky označené `*` jsou volitelné (property / unit / integrační / E2E testy) a lze je přeskočit pro rychlejší MVP.
- Každý task odkazuje na konkrétní požadavky (`_Requirements:_`) a kde se ověřuje vlastnost, i na vlastnost (`_Properties:_`) pro traceabilitu.
- Property testy (fast-check, ≥100 iterací, otagované) ověřují 7 univerzálních vlastností (každá jediným testem); unit testy cílí na konkrétní příklady a hranice; integrační testy běží proti lokálnímu Supabase, E2E proti Playwright.
- **Append-only auditu je vynucen na úrovni DB** (task 1.2, ověřeno property testem 3.3 i integračním testem 19.2) — nestojí jen na absenci UI.
- **Znovupoužití, ne duplikace:** PaymentMatcher (15.1) jen spouští efekt prodloužení ze `subscription-payments`; vynucené smazání (12.1) znovupoužívá tamní cleanup logiku. Koordinovat s `subscription-payments`.
- Checkpointy zajišťují inkrementální validaci ve čtyřech bodech (datová vrstva/přístup/audit, čtecí plochy, admin akce, závěr).
- Implementační jazyk je TypeScript (Next.js na Vercelu) dle designu; UI a hlášky v češtině.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "2.2", "5.1", "16.1"] },
    { "id": 1, "tasks": ["1.2", "2.3", "3.1", "5.2", "5.3", "5.4", "7.1", "16.2"] },
    { "id": 2, "tasks": ["3.3", "3.4", "6.1", "7.2", "7.3", "8.1", "10.1", "11.1", "12.1", "14.1", "15.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "8.2", "8.3", "10.2", "11.2", "11.3", "12.2", "14.2", "14.3", "14.4", "15.2", "15.3"] },
    { "id": 4, "tasks": ["3.2", "10.3", "17.1", "19.1", "19.2", "19.3", "19.4", "20.1", "20.2"] }
  ]
}
```
