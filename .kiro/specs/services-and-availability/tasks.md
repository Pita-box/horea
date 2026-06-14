# Implementation Plan: Služby a dostupnost

## Overview

Plán implementace feature `services-and-availability` postupuje zdola nahoru: nejprve **čistá funkce `Slot_Calculator`** (jádro feature) s unit testy a property-based testy, poté **CRUD manažery** jako server actions, **UI vrstva** v App Routeru, **revalidační utilita** a nakonec **integrační testy** + **migrační kontrola** kaskády.

Každý úkol staví na předchozích a je zaměřen výhradně na psaní, úpravu nebo testování kódu. Implementační jazyk: **TypeScript** (Next.js App Router, server actions, fast-check pro PBT, Vitest pro unit + integrační testy).

Konvence:
- `_Requirements:_` odkazuje na klauzuli z `requirements.md`.
- `_Properties:_` odkazuje na Property z `design.md` (sekce *Correctness Properties*).
- Sub-tasky postfixované `*` jsou volitelné (typicky testy).

## Tasks

- [x] 1. Připravit testovací infrastrukturu a typy pro `Slot_Calculator`
  - [x] 1.1 Vytvořit doménové typy v `src/lib/slots/types.ts`
    - Definovat `BusinessConfig` (`allowParallelSlots: boolean`, `timezone: 'Europe/Prague'`)
    - Definovat `OpeningHours` jako diskriminovaný union: `{ closed: true } | { closed: false, opensAt: string, closesAt: string }` (formát `HH:mm`)
    - Definovat `Service` (`durationMinutes: number`)
    - Definovat `Reservation` jako interval `{ start: string, end: string }` (formát `HH:mm`)
    - Definovat `SlotCalculatorInput` a výstup `string[]` (časy `HH:mm`)
    - _Requirements: 9.1, 9.2, 9.8_

  - [x] 1.2 Nainstalovat a nakonfigurovat Vitest + fast-check
    - Přidat `vitest`, `@vitest/ui`, `fast-check` do `devDependencies`
    - Vytvořit `vitest.config.ts` s aliasem `@/` na `src/`
    - Přidat skripty `test` a `test:run` do `package.json`
    - _Requirements: (infrastruktura)_

- [x] 2. Implementovat `Slot_Calculator` jako čistou funkci
  - [x] 2.1 Implementovat helper utility v `src/lib/slots/time.ts`
    - Funkce `parseTime(hhmm: string): number` (minuty od půlnoci)
    - Funkce `formatTime(minutes: number): string` (`HH:mm`)
    - Funkce `intervalsOverlap(a1, a2, b1, b2): boolean` (polootevřený průnik: `a1 < b2 && b1 < a2`)
    - _Requirements: 8.1, 8.2_

  - [x] 2.2 Implementovat `calculateSlots` v `src/lib/slots/calculator.ts`
    - Krok 1: pokud `openingHours.closed === true`, vrať `[]`
    - Krok 2: pokud `opensAt >= closesAt`, zaloguj a vrať `[]`
    - Krok 3: vygeneruj mřížku po 15 min od `opensAt`, ukonči když `t + D > closesAt + 15`
    - Krok 4a: pokud `allowParallelSlots === false`, vyfiltruj časy, kde `[t, t+D)` má neprázdný průnik s aktivní rezervací
    - Krok 4b: pokud `allowParallelSlots === true`, kontrolu rezervací přeskoč
    - Vrať seřazený seznam časů ve formátu `HH:mm`
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x]* 2.3 Napsat unit testy pro `calculateSlots` v `src/lib/slots/calculator.test.ts`
    - Zavřený den → `[]`
    - `opensAt >= closesAt` → `[]`
    - Jednoduchá mřížka (09:00–17:00, služba 60 min, prázdné rezervace) → očekávaný počet a první/poslední čas
    - Tolerance: `closesAt = 17:00`, služba 60 min, slot 16:15 (končí 17:15) OK; slot 16:16 NE
    - Adjacency: rezervace 10:00–11:00 + rezervace 11:00–12:00, kandidát 11:00 — pokud rezervace je 10:00–11:00, slot 11:00 je dostupný
    - Overlap konflikt: rezervace 10:00–11:00, slot 10:30 nedostupný
    - `allowParallelSlots = true` ignoruje rezervace (rezervace existuje, ale slot je stále ve výsledku)
    - _Requirements: 7.1, 7.2, 8.1, 8.2, 9.4, 9.5, 9.6, 9.7_

  - [x]* 2.4 Property test 1 — Adjacency v `src/lib/slots/calculator.property.test.ts`
    - **Property 1: Adjacency — dotykové sloty nejsou v konfliktu**
    - Generuj otevírací dobu, službu D, rezervaci `[a, b)` zarovnanou na 15min mřížku
    - Ověř, že `b` je ve výsledku (pokud `b + D <= closesAt + 15` a žádná jiná kolize)
    - **Validates: Requirements 8.1**
    - _Properties: 1_

  - [x]* 2.5 Property test 2 — Overlap symmetry
    - **Property 2: Konflikt je symetrický**
    - Generuj dva intervaly A, B; ověř že `A blocks B  <=>  B blocks A` při `allowParallelSlots = false`
    - **Validates: Requirements 8.2**
    - _Properties: 2_

  - [x]* 2.6 Property test 3 — Tolerance and grid alignment
    - **Property 3: Mřížka splňuje toleranční podmínku**
    - Při prázdných rezervacích a `allowParallelSlots = false` ověř: výstup = `{ t : t = opensAt + 15·k && t + D <= closesAt + 15 }`
    - Ověř obě strany ekvivalence (žádný čas nechybí, žádný čas nepřebývá)
    - **Validates: Requirements 7.1, 9.2, 9.3**
    - _Properties: 3_

  - [x]* 2.7 Property test 4 — Parallel slots invariant
    - **Property 4: `allowParallelSlots = true` ignoruje rezervace**
    - Generuj libovolné rezervace `R`; ověř `calc(cfg_true, day, svc, R) === calc(cfg_true, day, svc, [])`
    - **Validates: Requirements 9.5**
    - _Properties: 4_

  - [x]* 2.8 Property test 5 — Determinism
    - **Property 5: Referenční transparentnost**
    - Pro libovolný validní vstup: `calc(args) === calc(args)`
    - **Validates: Requirements 9.1**
    - _Properties: 5_

  - [x]* 2.9 Property test 6 — No valid opening
    - **Property 6: Prázdný výsledek pro neotevřený den**
    - Generuj zavřený den NEBO `opensAt >= closesAt`; ověř že výsledek je `[]` pro libovolné rezervace, službu a `allowParallelSlots`
    - **Validates: Requirements 9.6, 9.7**
    - _Properties: 6_

  - [x]* 2.10 Property test 7 — Ascending order
    - **Property 7: Výsledek je seřazený vzestupně**
    - Pro libovolný validní vstup ověř `result[i] < result[i+1]` (žádné duplicity)
    - **Validates: Requirements 9.8**
    - _Properties: 7_

- [x] 3. Checkpoint — `Slot_Calculator` hotový
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementovat `Public_Page_Revalidator`
  - [x] 4.1 Vytvořit utilitu `src/lib/revalidate.ts`
    - Funkce `revalidatePublicPage(slug: string): void`
    - Wrapper kolem Next.js `revalidatePath('/' + slug)`
    - Selhání zachytit `try/catch`, zalogovat, ale nepropagovat (best-effort)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x]* 4.2 Unit test pro `revalidatePublicPage`
    - Mock `revalidatePath`; ověř volání s `/{slug}`
    - Ověř, že selhání `revalidatePath` neházi výjimku
    - _Requirements: 10.4_

- [x] 5. Implementovat `Services_Manager` server actions
  - [x] 5.1 Vytvořit Zod schéma pro službu v `src/lib/services/schema.ts`
    - Validace: název 1–100 znaků (po trim), trvání kladný integer 5–480 a násobek 5 (s pořadím kontrol dle R2.4), cena 0–100 000, popis ≤ 500 znaků (volitelný)
    - České chybové hlášky odpovídající Requirementu 2
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 12.1_

  - [x] 5.2 Implementovat `listServices` server action v `src/app/dashboard/services/actions.ts`
    - Načíst služby pro `business_id` přihlášeného uživatele, řadit `created_at ASC`
    - _Requirements: 1.1, 11.1_

  - [x] 5.3 Implementovat `createService` server action
    - Validovat vstup přes Zod schéma
    - Ověřit `business_id` přihlášeného uživatele (defenzivní kontrola nad RLS)
    - INSERT do `services`, zalogovat, zavolat `revalidatePublicPage`
    - _Requirements: 1.2, 2.10, 11.1, 11.5, 11.6, 12.2_

  - [x] 5.4 Implementovat `updateService` server action
    - Validovat vstup, ověřit `business_id`, UPDATE, log, revalidace
    - _Requirements: 1.3, 2.10, 11.1, 11.5, 12.2_

  - [x] 5.5 Implementovat `getReservationCount` server action
    - `SELECT count(*) FROM reservations WHERE service_id = ? AND business_id = ?`
    - Ověřit `business_id` přihlášeného uživatele
    - _Requirements: 3.2, 11.1_

  - [x] 5.6 Implementovat `deleteService` server action
    - Ověřit `business_id`, otevřít transakci, `DELETE FROM services WHERE id = ?` (CASCADE smaže rezervace)
    - Po commitu zalogovat s počtem smazaných rezervací (vrátit z DB), zavolat revalidaci
    - Při chybě rollback + české chybové hlášky
    - _Requirements: 1.4, 3.4, 3.5, 3.6, 11.1, 12.2_

  - [x]* 5.7 Unit testy pro Zod schéma služby
    - Pokrýt všechny validační větve z R2 (každá hláška má test)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [x] 6. Implementovat UI služeb
  - [x] 6.1 Vytvořit server komponentu `src/app/dashboard/services/page.tsx`
    - Načíst seznam přes `listServices`
    - Vykreslit tabulku: název, trvání, cena, popis, akce (Upravit, Smazat)
    - Tlačítko „Přidat službu" otevírající `ServiceForm`
    - _Requirements: 1.1, 12.1_

  - [x] 6.2 Vytvořit klientskou komponentu `src/app/dashboard/services/ServiceForm.tsx`
    - Formulář s poli: název, trvání (min), cena (Kč), popis
    - Klientská validace (UX), serverová validace přes server action
    - Po submitu zobrazit chybové hlášky vrácené serverem (česky)
    - _Requirements: 1.2, 1.3, 12.1_

  - [x] 6.3 Vytvořit klientskou komponentu `src/app/dashboard/services/DeleteServiceDialog.tsx`
    - Při otevření dialogu zavolat `getReservationCount(serviceId)`
    - Zobrazit text „Smazat službu? Smaže se také N rezervací."
    - Tlačítka „Zrušit" / „Potvrdit"; po potvrzení zavolat `deleteService`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Implementovat `OpeningHours_Manager`
  - [x] 7.1 Vytvořit Zod schéma pro otevírací dobu v `src/lib/opening-hours/schema.ts`
    - Validace dne: buď `closed: true`, nebo `opens_at < closes_at` (formát `HH:mm`)
    - Validace celku: alespoň jeden den otevřený
    - České chybové hlášky dle R4.4 a R4.5
    - _Requirements: 4.4, 4.5, 12.1_

  - [x] 7.2 Implementovat server actions v `src/app/dashboard/opening-hours/actions.ts`
    - `listOpeningHours(): OpeningHoursWeek` — vrátit 7 dní (Po–Ne); chybějící řádek = zavřeno
    - `saveOpeningHours(week: OpeningHoursWeek)` — ověřit `business_id`, validovat, upsert per den, log, revalidace
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 10.2, 11.2, 11.5, 12.3_

  - [x]* 7.3 Unit testy pro Zod schéma otevírací doby
    - `opens_at >= closes_at` → chyba R4.4
    - Všechny dny zavřené → chyba R4.5
    - _Requirements: 4.4, 4.5_

- [x] 8. Implementovat UI otevírací doby
  - [x] 8.1 Vytvořit server komponentu `src/app/dashboard/opening-hours/page.tsx`
    - Načíst týden přes `listOpeningHours`
    - Vykreslit `OpeningHoursForm`
    - _Requirements: 4.1_

  - [x] 8.2 Vytvořit klientskou komponentu `src/app/dashboard/opening-hours/OpeningHoursForm.tsx`
    - Pro každý den (Po–Ne): checkbox „Zavřeno" + dva `<input type="time">` pro `opens_at` a `closes_at`
    - Při zaškrtnutí „Zavřeno" deaktivovat čas. inputy
    - Submit volá `saveOpeningHours`; chybové hlášky česky
    - _Requirements: 4.1, 4.2, 4.3, 12.1_

- [x] 9. Implementovat `Settings_Manager`
  - [x] 9.1 Implementovat server actions v `src/app/dashboard/settings/actions.ts`
    - `getSettings(): { allowParallelSlots, autoApproveReservations }`
    - `updateSetting(key, value)` — ověřit `business_id`, UPDATE jednoho sloupce na `businesses`, log, revalidace
    - České chybové hlášky
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 10.3, 11.3, 11.5, 12.4_

- [x] 10. Implementovat UI nastavení
  - [x] 10.1 Vytvořit server komponentu `src/app/dashboard/settings/page.tsx`
    - Načíst nastavení přes `getSettings`
    - Vykreslit `SettingsForm`
    - _Requirements: 5.1, 6.1_

  - [x] 10.2 Vytvořit klientskou komponentu `src/app/dashboard/settings/SettingsForm.tsx`
    - Toggle `allow_parallel_slots` s textovým vysvětlením v češtině (zobrazené před přepnutím z `false` na `true`)
    - Toggle `auto_approve_reservations`
    - Submit volá `updateSetting`
    - Pokud lokalizační text není dostupný a hodnota je `false` → toggle skrýt; pokud `true` → toggle zobrazit i bez vysvětlení
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 6.3, 12.1_

- [x] 11. Checkpoint — UI hotové
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Migrace — ověřit `ON DELETE CASCADE` na `reservations.service_id`
  - [x] 12.1 Zkontrolovat existující migraci `0004_init_reservations_clients.sql`
    - Ověřit, že `service_id` má `REFERENCES services(id) ON DELETE CASCADE`
    - Pokud chybí, vytvořit fix migraci `0008_fix_reservations_service_id_cascade.sql`:
      - `ALTER TABLE reservations DROP CONSTRAINT reservations_service_id_fkey, ADD CONSTRAINT reservations_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;`
    - _Requirements: 3.4_

- [x] 13. Integrační testy
  - [x]* 13.1 Test RLS izolace v `tests/integration/services-rls.test.ts`
    - Setup: dva podniky, dva uživatelé
    - Ověř, že uživatel A přes `listServices` nedostane službu uživatele B
    - Ověř, že `updateService` na cizí službu vrátí 403
    - _Requirements: 11.1, 11.4, 11.5, 11.6_

  - [x]* 13.2 Test cascade delete v `tests/integration/services-cascade.test.ts`
    - Setup: služba + N rezervací odkazujících na ni
    - Zavolat `deleteService`
    - Ověř, že po operaci `services` ani `reservations` daného `service_id` v DB nejsou
    - _Requirements: 3.4, 3.6_

  - [x]* 13.3 Test revalidačního volání v `tests/integration/revalidation.test.ts`
    - Mock `revalidatePath`
    - Ověř, že `createService`, `updateService`, `deleteService`, `saveOpeningHours`, `updateSetting` volají `revalidatePath('/' + slug)`
    - Ověř, že selhání `revalidatePath` neblokuje DB operaci
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 14. Final checkpoint — všechny testy běží
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Úkoly s `*` jsou volitelné a lze je přeskočit pro rychlejší MVP.
- `Slot_Calculator` je čistá funkce — žádný DB přístup uvnitř, vše dostává jako parametr.
- Property-based testy (2.4–2.10) odpovídají 1:1 Property 1–7 z `design.md`.
- Cascade delete je řešena na úrovni schématu (`ON DELETE CASCADE`), aplikační kód jen otevře transakci a smaže službu.
- České chybové hlášky jsou součástí Zod schémat; klientské komponenty je pouze zobrazují.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "12.1"] },
    { "id": 1, "tasks": ["2.1", "4.1", "5.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "4.2", "5.7", "7.3", "9.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "5.2", "5.3", "5.4", "5.5", "5.6", "7.2", "10.1", "10.2"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "8.1", "8.2"] },
    { "id": 5, "tasks": ["13.1", "13.2", "13.3"] }
  ]
}
```
