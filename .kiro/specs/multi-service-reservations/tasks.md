# Implementation Plan: Multi-service reservations

## Overview

Implementační plán rozšiřuje rezervaci z jedné služby na uspořádanou množinu služeb v jednom souvislém bloku. Postupuje zdola nahoru dle závislostí: nejdřív sdílený modul limitů a čisté helpery (testovatelné property testy bez DB), poté aditivní migrace `0049` s novými RPC, následně server vrstva volající nové RPC, klient (multi-select + průběžné součty + průnik zaměstnanců), zobrazovací vrstva (souhrn, detail, e-maily, CSV) a nakonec rozšíření e2e.

Pořadí nasazení je závazné: **nejdřív migrace `0049` (tabulka + RPC + idempotentní backfill), až poté aplikační kód**, který nové RPC volá. Migrace je aditivní a koexistuje se starým kódem.

Zachovává se zpětná kompatibilita jednoslužbových rezervací (mezní případ `n = 1`): `reservations.service_id` zůstává zdrojem pravdy pro single-service cestu a `position = 0` službu.

Jazyk implementace: **TypeScript + plpgsql/SQL** (dle návrhu, žádný pseudokód). Správce balíčků **pnpm**, build pod **Node 20**. Ověřování dle `AGENTS.md`: `pnpm lint`, `pnpm test:run`, pro route/layout změny navíc `pnpm build`; property testy běží minimálně 100 iterací.

## Tasks

- [x] 1. Sdílený modul limitů a čisté doménové helpery
  - [x] 1.1 Vytvořit sdílený modul limitů
    - Vytvořit `src/lib/reservation/limits.ts` s `MIN_SERVICES_PER_RESERVATION = 1` a `MAX_SERVICES_PER_RESERVATION = 10` jako jediný zdroj pravdy pro klient, server i komentář SQL
    - Exportovat `validateServiceCount(n: number)` vracející rozlišení v rozsahu / mimo rozsah s českými hláškami „Vyberte alespoň jednu službu" a „Najednou lze vybrat nejvýše 10 služeb"
    - _Requirements: 5.1, 5.2, 5.3, 1.5, 1.6_

  - [x] 1.2 Implementovat čisté helpery součtů a spojení názvů
    - Vytvořit `src/lib/reservation/combine.ts` s `combinedDuration(services)` (součet `durationMinutes`), `combinedPrice(services)` (součet `priceCzk`) a `joinServiceNames(services)` (spojení názvů ` + ` v pořadí `position`)
    - _Requirements: 2.1, 3.1, 4.3, 14.1_

  - [x] 1.3 Implementovat toggle reducer výběru služeb
    - Vytvořit `src/lib/reservation/selection.ts` s čistým reducerem `toggleService(list, serviceId)`: nevybraná → přidat na konec, vybraná → odebrat, bez duplicit
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.4 Implementovat průnik zaměstnanců přes vybrané služby
    - Vytvořit `src/lib/reservation/employees.ts` s `employeesForSelection(mapping, selection)`: průnik `service_employees` přes vybrané služby; služba bez řádku = „umí ji všichni"; helper pro zrušení dříve vybraného zaměstnance mimo průnik
    - _Requirements: 8.2, 8.3_

  - [x] 1.5 Property test pro combinedDuration
    - **Property 1: Combined_Duration je součet délek**
    - **Validates: Requirements 2.1, 2.3, 9.2, 11.3, 15.3**
    - `src/lib/reservation/__tests__/combine.property.test.ts`, fast-check, ≥100 iterací, tag `// Feature: multi-service-reservations, Property 1: ...`

  - [x] 1.6 Property test pro combinedPrice
    - **Property 2: Combined_Price je součet cen**
    - **Validates: Requirements 3.1, 3.2, 9.2, 11.3, 15.3**
    - fast-check, ≥100 iterací, tag `// Feature: multi-service-reservations, Property 2: ...`

  - [x] 1.7 Property test pro toggle reducer
    - **Property 5: Korektnost toggle výběru služeb**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - `src/lib/reservation/__tests__/selection.property.test.ts`, fast-check, ≥100 iterací (dvojí toggle = identita, bez duplicit, přidání na konec)

  - [x] 1.8 Property test pro rozsahovou validaci počtu služeb
    - **Property 6: Přijetí závisí jen na rozsahu počtu služeb**
    - **Validates: Requirements 1.5, 1.6, 5.1, 5.2, 5.3, 5.4, 9.6**
    - `src/lib/reservation/__tests__/limits.property.test.ts`, fast-check, ≥100 iterací, hraniční `n = 1`, `n = 10`

  - [x] 1.9 Property test pro průnik zaměstnanců
    - **Property 11: Nabídka zaměstnanců je průnik přes vybrané služby**
    - **Validates: Requirements 8.2, 8.3**
    - `src/lib/reservation/__tests__/employees.property.test.ts`, fast-check, ≥100 iterací (služba bez řádku = umí všichni; zrušení vybraného zaměstnance mimo průnik)

  - [x] 1.10 Property test pro joinServiceNames (CSV spojení)
    - **Property 13: CSV spojuje názvy služeb oddělovačem " + "**
    - **Validates: Requirements 14.1**
    - fast-check, ≥100 iterací, spojení v pořadí `position`

- [x] 2. Migrace 0049 — tabulka, RLS, backfill a nové RPC
  - [x] 2.1 Vytvořit tabulku reservation_services, indexy a RLS
    - Vytvořit `supabase/migrations/0049_reservation_services.sql`: tabulka `reservation_services` (PK `(reservation_id, position)`, `unique (reservation_id, service_id)`, snapshoty `duration_minutes_snapshot`/`price_czk_snapshot`, checky), indexy na `reservation_id` a `service_id`, `enable row level security` + politika `reservation_services_owner_read` (mirror tenant_isolation)
    - `service_id` zůstává `position = 0` „primary"; schéma `reservations` se nemění
    - _Requirements: 4.1, 4.2, 7.5, 10.3, 11.1, 13.1_

  - [x] 2.2 Doplnit idempotentní backfill z reservations.service_id
    - Do `0049` přidat `insert ... select ... on conflict do nothing` z `reservations` join `services` (position 0, snapshoty z aktuálních `services`)
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 2.3 Implementovat RPC create_reservation_multi
    - V `0049` vytvořit `create_reservation_multi(p_business_id, p_service_ids uuid[], p_starts_at, kontakt, p_note)`: advisory lock, kontrola publikovanosti, validace rozsahu `[1,10]` + bez duplicit, ověření příslušnosti všech služeb k podniku, autoritativní `Combined_Duration = SUM(services.duration_minutes)`, `ends_at = starts_at + interval`, overlap re-check při `allow_parallel_slots = false`, insert `reservations` (`service_id = p_service_ids[1]`) + `reservation_services` přes `unnest ... with ordinality` (`position = ord - 1`); vrací příznaky `conflict`/`not_published`/`invalid`; `revoke from public` + `grant execute to service_role`
    - _Requirements: 5.1, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 4.1, 4.2_

  - [x] 2.4 Implementovat RPC create_manual_reservation_multi
    - V `0049` vytvořit `create_manual_reservation_multi(...)`: stejný vzor jako 2.3, status vždy `approved`, stejné rozsahové omezení a overlap re-check
    - _Requirements: 5.4, 15.1, 15.2, 15.3, 15.5_

  - [x] 2.5 Implementovat RPC edit_reservation_multi
    - V `0049` vytvořit `edit_reservation_multi(p_reservation_id, p_business_id, p_service_ids uuid[], p_starts_at)`: advisory lock, validace rozsahu, ověření příslušnosti služeb, přepočet `Combined_Duration`/`ends_at`, overlap re-check s `r.id != p_reservation_id` (vyloučení sebe sama), `delete` staré množiny + `update` rezervace + insert nové `reservation_services` přes `with ordinality`; vrací `updated`/`conflict`/`invalid`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 2.6 Dry-run a push migrace na sdílenou DB
    - Ověřit migraci proti lokální/stínové DB (`pnpm dlx supabase db reset` / `db diff`), zkontrolovat plán, poté `pnpm dlx supabase db push`; ověřit počet řádků `reservation_services` = počet rezervací s validním `service_id`
    - _Requirements: 11.1, 11.3_

  - [x] 2.7 Integrační property test backfillu
    - **Property 16: Backfill jednoslužbové rezervace**
    - **Validates: Requirements 11.1**
    - `tests/properties/`, ověření po běhu `0049`: přesně jeden řádek s `position = 0` a `service_id` = původní `reservations.service_id`

- [x] 3. Checkpoint — migrace nasazena, helpery ověřeny
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Server vrstva nad množinou služeb
  - [x] 4.1 Rozšířit loadAvailableSlots na serviceIds[]
    - `src/server/slots/loadAvailableSlots.ts`: `serviceId: string` → `serviceIds: string[]`, načíst `duration_minutes` všech služeb jedním dotazem (`.in('id', serviceIds).eq('business_id', businessId)`), `Combined_Duration = Σ` předat do `calculateSlots`; prázdná/nevalidní množina → `[]`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 4.2 Rozšířit atomicSlotWrite na serviceIds[]
    - `src/lib/reservations/atomicSlotWrite.ts`: `serviceId: string` → `serviceIds: string[]` a předat do `loadAvailableSlots`; orchestrace beze změny
    - _Requirements: 7.2, 9.3, 15.2_

  - [x] 4.3 Rozšířit ReservationCreator
    - `src/server/ReservationCreator.ts`: `CreateReservationInput.serviceId` → `serviceIds: string[]`, rozsahová validace přes `validateServiceCount`, načtení služeb (provizorní `Combined_Duration` + data pro e-mail), volání `create_reservation_multi` přes `atomicSlotWrite`, payload e-mailů rozšířen o seznam služeb + součty
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 7.1, 7.2, 7.3, 7.6, 8.5_

  - [x] 4.4 Rozšířit ManualReservationCreator
    - `src/server/ManualReservationCreator.ts`: `serviceIds: string[]`, rozsahová validace (R5.4), volání `create_manual_reservation_multi`, bez potvrzovacího e-mailu klientovi
    - _Requirements: 5.4, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 4.5 Rozšířit ReservationEditor
    - `src/server/ReservationEditor.ts`: `EditReservationInput.serviceId` → `serviceIds: string[]`, rozsahová validace (R9.6), volání `edit_reservation_multi` přes `atomicSlotWrite` s `excludeReservationId`, přepočet součtů; `Reservation_Modified_Email` se seznamem služeb a součty
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 4.6 Rozšířit AvailableSlotsService na serviceIds[]
    - `src/server/AvailableSlotsService.ts`: vstup z kroku 2 na `serviceIds`, klíč fetch `serviceIds.join(',')|date`, předání do `loadAvailableSlots`
    - _Requirements: 6.1, 6.4_

  - [x] 4.7 Property test ends_at = starts_at + Combined_Duration
    - **Property 3: ends_at = starts_at + Combined_Duration**
    - **Validates: Requirements 2.2, 9.2, 15.2**
    - Čistý výpočet v TS; ≥100 iterací

  - [x] 4.8 Integrační property test pořadí (round-trip)
    - **Property 4: Zachování pořadí služeb (round-trip)**
    - **Validates: Requirements 1.2, 4.1, 4.2, 4.3, 12.1, 13.1, 15.1**
    - `tests/properties/`, zápis přes RPC → načtení `reservation_services` dle `position`, pozice `0..n-1`

  - [x] 4.9 Integrační property test cizí služby
    - **Property 7: Cizí služba způsobí odmítnutí**
    - **Validates: Requirements 7.1, 9.4**
    - `tests/properties/`, RPC vrací `invalid`, žádný zápis

  - [x] 4.10 Integrační property test atomicity vytvoření
    - **Property 8: Atomicita a vyloučení překryvu při vytvoření**
    - **Validates: Requirements 6.3, 7.2, 7.3, 15.2, 15.5**
    - `tests/properties/`, generované aktivní rezervace; úspěch ⇒ bez překryvu a přesně `|set|` řádků; konflikt ⇒ žádný částečný zápis

  - [x] 4.11 Integrační property test atomicity editace
    - **Property 9: Atomicita editace s vyloučením sebe sama**
    - **Validates: Requirements 9.3, 9.5**
    - `tests/properties/`, vyloučení vlastního intervalu, množina nahrazena bez zbytků

  - [x] 4.12 Integrační property test stability snapshotu
    - **Property 10: Stabilita snapshotu délky a ceny**
    - **Validates: Requirements 7.5**
    - `tests/properties/`, změna ceníku po zápisu nemění snapshot

  - [x] 4.13 Integrační property test cascade delete
    - **Property 12: Hard delete kaskáduje na množinu služeb**
    - **Validates: Requirements 10.3**
    - `tests/properties/`, po hard delete neexistují řádky `reservation_services`

  - [x] 4.14 Unit/edge testy server vrstvy
    - `serviceIds = []` → `loadAvailableSlots` vrací `[]` (R6.4); `n = 0`/`n = 11` hlášky; `auto_approve` true/false → `approved`/`pending`; ruční vždy `approved` bez e-mailu; UTC ukládání; best-effort selhání e-mailu/logu nezruší rezervaci
    - _Requirements: 6.4, 5.2, 5.3, 7.4, 7.6, 15.4, 16.4, 16.5_

- [x] 5. Checkpoint — server vrstva ověřena
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Klientská vrstva — multi-select a průběžné součty
  - [x] 6.1 Rozšířit ReservationFormController
    - `src/components/reservation/ReservationFormController.tsx`: `selectedServiceId: string | null` → `selectedServiceIds: string[]` (pořadí výběru), `Combined_Duration`/`Combined_Price` přes `useMemo`, fetch slotů klíčovaný `serviceIds.join(',')|date`, výběr zaměstnance jako průnik přes `employeesForSelection` (zrušení mimo průnik), přechod z kroku 1 jen při `length ≥ 1`
    - _Requirements: 1.5, 2.3, 3.2, 6.1, 8.1, 8.3, 8.4_

  - [x] 6.2 Rozšířit Step1ServicePicker na multi-select
    - `src/components/reservation/Step1ServicePicker.tsx`: `onToggle(serviceId)` přes reducer, limit 11. služby → hláška „Najednou lze vybrat nejvýše 10 služeb" + odmítnutí, pořadové číslo u vybraných, průběžný souhrn `Combined_Duration`/`Combined_Price` (0 Kč skryto), prázdný seznam → „Tento podnik zatím nemá žádné rezervovatelné služby"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 3.3_

  - [x] 6.3 Unit testy klientského výběru
    - 0 Kč cena se nezobrazuje (R1.4, R3.3); 11. služba odmítnuta; prázdný seznam hláška (R1.7); zrušení zaměstnance mimo průnik (R8.3)
    - _Requirements: 1.4, 1.6, 1.7, 3.3, 8.3_

- [x] 7. Zobrazovací vrstva — souhrn, detail, e-maily, CSV
  - [x] 7.1 Rozšířit Step5Summary a veřejný souhrn
    - Seznam služeb v pořadí (název + délka), `Combined_Duration`, `Combined_Price` (skryté při 0 Kč), jeden časový blok v Europe/Prague
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 17.1, 17.2, 17.3_

  - [x] 7.2 Rozšířit detail rezervace v dashboardu
    - Načíst `reservation_services(position, service_id, duration_minutes_snapshot, price_czk_snapshot, services(name))` dle `position`; zobrazit seznam, součty, blok `starts_at`–`ends_at` v Europe/Prague, `Assigned_Employee` je-li přiřazen
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 7.3 Rozšířit EmailNotifier a šablony
    - `src/server/EmailNotifier.ts` + šablony: payload o `services: { name, durationMinutes }[]`, `combinedDurationMinutes`, `combinedPriceCzk`; potvrzovací i notifikační e-mail obsahuje seznam služeb v pořadí, součty a jeden blok v Europe/Prague
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 7.4 Rozšířit CsvExporter
    - `src/server/CsvExporter.ts`: select o `reservation_services(position, price_czk_snapshot, duration_minutes_snapshot, services(name))`; `service_name` = názvy spojené ` + ` v pořadí `position`; nové sloupce `combined_duration_minutes`, `combined_price_czk`; filtr služby zahrne rezervaci při neprázdném průniku s množinou
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 7.5 Property test obsahu transakčního e-mailu
    - **Property 15: Transakční e-mail obsahuje všechny služby a součty**
    - **Validates: Requirements 16.1, 16.2**
    - Render šablony nad generovaným seznamem služeb; ≥100 iterací

  - [x] 7.6 Property test CSV filtru služby
    - **Property 14: CSV filtr služby je test neprázdného průniku**
    - **Validates: Requirements 14.2, 14.3, 14.4**
    - Predikát zahrnutí; doplňuje stávající `tests/integration/csv-scope.test.ts`; ≥100 iterací

- [x] 8. Rozšíření e2e scénářů
  - [x] 8.1 Rozšířit e2e happy-path o více služeb
    - `e2e/reservation-happy-path.spec.ts`: výběr více služeb → průběžné součty → potvrzení → blok rovný součtu délek
    - _Requirements: 1.1, 2.2, 12.2, 12.4_

  - [x] 8.2 Rozšířit e2e editace a ručního vytvoření
    - `e2e/edit-flow.spec.ts` (editace množiny + revalidace slotu), `e2e/manual-creation.spec.ts` (ruční kombinovaná rezervace majitelem)
    - _Requirements: 9.1, 9.2, 9.3, 15.1, 15.2_

- [x] 9. Závěrečný checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasky označené `*` jsou volitelné (testy) a lze je přeskočit pro rychlejší MVP; core implementaci přeskakovat nelze.
- Každý task odkazuje na konkrétní (sub)požadavky kvůli sledovatelnosti; property tasky navíc odkazují na číslo vlastnosti z návrhu.
- Property testy běží přes fast-check, ≥100 iterací, s tagem `// Feature: multi-service-reservations, Property N: ...`; čisté vlastnosti v `src/lib/**/__tests__/*.property.test.ts`, DB vlastnosti v `tests/properties/`.
- Pořadí nasazení je závazné: migrace `0049` (task 2) PŘED aplikačním kódem (tasky 4+). Migrace je aditivní → starý kód ji přežije.
- Zpětná kompatibilita: jednoslužbová rezervace je mezní případ `n = 1`; `reservations.service_id` zůstává a ukazuje na `position = 0`.
- Ověřování dle `AGENTS.md`: `pnpm lint` + `pnpm test:run` pro doménovou/server logiku; `pnpm build` pro route/layout změny; `pnpm test:e2e` pro viditelné toky. Build pod Node 20, výhradně `pnpm`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "2.1"] },
    { "id": 1, "tasks": ["1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["2.6"] },
    { "id": 3, "tasks": ["2.7", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "4.6"] },
    { "id": 5, "tasks": ["4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14"] },
    { "id": 6, "tasks": ["6.1", "6.2", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 7, "tasks": ["6.3", "7.5", "7.6", "8.1", "8.2"] }
  ]
}
```
