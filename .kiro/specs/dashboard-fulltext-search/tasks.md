# Implementation Plan: Fulltextové vyhledávání v dashboardu (dashboard-fulltext-search)

## Overview

Plán rozšiřuje stávající vyhledávání v hlavičce dashboardu majitele o tři schopnosti: lokální
Index obsahu (skupina `sekce`), navigaci s odscrollováním na kotvu sekce a klávesovou navigaci s
přístupností. Postup je inkrementální a staví na sobě: nejdřív čisté funkce v `src/lib/search/`
spolu s jejich property testy (P1–P10), pak klientská scroll komponenta, pak přidání kotev (`id`)
na stránky dashboardu, následně zapojení do `DashboardSearch` a `DashboardChrome` a nakonec
integrační/příkladové testy (časování, scroll v JSDOM, konzistence registru s `id`, viditelnost dle
role, gating serverové akce).

Implementační jazyk: **TypeScript** (návrh používá konkrétní TS). Správce balíčků: **pnpm**.
Změny jsou surgical — rozšiřují existující kód, nepřepisují ho.

Ověřovací příkazy: `pnpm test:run`, `pnpm lint`, `pnpm build`.

## Tasks

- [x] 1. Sdílené typy a Index obsahu (lokální zdroje)
  - [x] 1.1 Rozšířit `src/lib/search/types.ts`
    - Přidat `'sections'` do `SearchGroup`
    - Doplnit `SEARCH_GROUP_LABELS` o `sections: 'Sekce'`
    - `SearchResult`, `ClientSearchResponse` a `SEARCH_MIN_QUERY_LENGTH` ponechat beze změny
    - _Requirements: 3.1_

  - [x] 1.2 Vytvořit `src/lib/search/content-index.ts`
    - Definovat typy `SectionRecord` (`anchor`, `title`, volitelné `description`) a `ContentIndex`
    - Naplnit deklarativní registr `CONTENT_INDEX` klíčovaný cestou stránky pro: settings,
      services, reservations, clients, opening-hours, subscription, plans, analytics, employees,
      faq, account
    - Implementovat čistou funkci `searchContentIndex(query)`, která lokálně porovnává
      normalizovaný dotaz proti nadpisu a popisu (popis volitelný) a vrací výsledky skupiny
      `sections` s `href` ve tvaru `${path}#${anchor}` (limit aplikuje až agregace)
    - _Requirements: 1.1, 1.2, 1.3, 4.1, 5.1, 5.2, 5.3, 13.1_

  - [ ]* 1.3 Property test pro shodu v Index_Obsahu
    - **Property 3: Vyhledávání v Index_Obsahu je necitlivé na diakritiku a velikost písmen**
    - **Validates: Requirements 1.2, 1.3, 2.1**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 3: ...`

  - [ ]* 1.4 Property test pro href výsledku sekce
    - **Property 6: Výsledek sekce odkazuje na cestu doplněnou o kotvu**
    - **Validates: Requirements 4.1**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 6: ...`

  - [ ]* 1.5 Property test pro jednoznačnost kotev
    - **Property 7: Kotvy jsou jednoznačné v rámci jedné stránky**
    - **Validates: Requirements 5.1**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 7: ...`

- [x] 2. Agregace, normalizace a navigační helpery
  - [x] 2.1 Vytvořit `src/lib/search/search-aggregate.ts`
    - Definovat `ClientsState`, `AggregateInput`, `RenderGroup` a konstantu `SECTION_RESULT_LIMIT = 6`
    - Implementovat `aggregateResults` (pořadí `settings → sections → clients → faq`, ořez `sections`
      na limit, skrytí prázdných skupin, zachování `locked` skupiny `clients`)
    - Implementovat `flattenResults(groups)` (plochý seznam viditelných výsledků pro klávesovou navigaci)
    - Implementovat helpery `safeNormalize` (idempotentní výstup + fallback na raw text při selhání),
      `shouldSearch(query)` a `resolveActivation(list, index)`
    - _Requirements: 1.4, 2.4, 3.1, 3.2, 8.1, 8.2, 11.1, 11.3, 11.4, 11.5, 13.2_

  - [ ]* 2.2 Property test pro normalizaci
    - **Property 1: Normalizace je bez diakritiky, malými písmeny a idempotentní**
    - **Validates: Requirements 2.2, 2.3**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 1: ...`

  - [ ]* 2.3 Property test pro bezpečnou normalizaci
    - **Property 2: Bezpečná normalizace má fallback na nenormalizovaný text**
    - **Validates: Requirements 2.4**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 2: ...`

  - [ ]* 2.4 Property test pro pořadí a skrývání skupin
    - **Property 4: Agregace zachovává pořadí skupin a skrývá prázdné skupiny**
    - **Validates: Requirements 1.4, 3.1, 3.2**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 4: ...`

  - [ ]* 2.5 Property test pro limit skupiny `sekce`
    - **Property 5: Skupina `sekce` je omezena na nejvýše 6 výsledků**
    - **Validates: Requirements 13.2**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 5: ...`

  - [ ]* 2.6 Property test pro minimální délku dotazu
    - **Property 8: Vyhledávání se spouští právě od minimální délky dotazu**
    - **Validates: Requirements 8.1, 8.2**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 8: ...`

  - [ ]* 2.7 Property test pro rozsah klávesové navigace
    - **Property 9: Klávesová navigace zůstává v rozsahu viditelných výsledků**
    - **Validates: Requirements 11.1**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 9: ...`

  - [ ]* 2.8 Property test pro aktivaci klávesou Enter
    - **Property 10: Aktivace klávesou Enter je ekvivalentní kliknutí**
    - **Validates: Requirements 11.3, 11.4, 11.5**
    - `{ numRuns: 100 }`, tag `// Feature: dashboard-fulltext-search, Property 10: ...`

- [x] 3. Checkpoint — čisté funkce a property testy
  - Spustit `pnpm test:run`. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Klientská komponenta pro odscrollování na sekci
  - [x] 4.1 Vytvořit `src/components/dashboard/ScrollToHashOnLoad.tsx`
    - Klientský efekt: dle `location.hash` najít element, `scrollIntoView`, nastavit fokus a
      přechodné vizuální zvýraznění; respektovat `prefers-reduced-motion`; chybějící kotvu řešit tiše
    - Reagovat na změnu `usePathname()`/hash kvůli in-page scrollu bez reloadu
    - Volitelně přidat tenký helper `src/components/dashboard/Section.tsx` (`scroll-mt` kvůli sticky hlavičce)
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 Integrační testy `ScrollToHashOnLoad` (JSDOM)
    - `scrollIntoView` na správný element po navigaci (R4.2), in-page bez reloadu (R4.3),
      fokus/zvýraznění (R4.4), chybějící kotva bez chyby (R4.5), respekt `prefers-reduced-motion`
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 5. Kotvy sekcí (`id`) na stránkách dashboardu
  - [x] 5.1 Přidat `id` kotvy na stránky settings a opening-hours
    - Doplnit `id` rovné `anchor` z `CONTENT_INDEX` na existující nadpisy/karty sekcí (aditivní změna)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 Přidat `id` kotvy na stránky services, reservations a clients
    - Doplnit `id` dle `CONTENT_INDEX`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.3 Přidat `id` kotvy na stránky subscription, plans a analytics
    - Doplnit `id` dle `CONTENT_INDEX`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.4 Přidat `id` kotvy na stránky employees, faq a account
    - Doplnit `id` dle `CONTENT_INDEX`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 5.5 Integrační test konzistence registru ↔ vykreslených `id`
    - Pro reprezentativní stránky ověřit, že pro každý `anchor` v `CONTENT_INDEX[cesta]` existuje
      element s odpovídajícím `id`
    - _Requirements: 1.1, 5.2, 5.3_

- [x] 6. Zapojení do UI (DashboardSearch + DashboardChrome)
  - [x] 6.1 Upravit `src/components/dashboard/DashboardSearch.tsx`
    - Přidat lokální zdroj `searchContentIndex(trimmed)` (skupina `sekce`)
    - Nahradit ad-hoc seskupení voláním `aggregateResults(...)` a iterací přes `RenderGroup[]`
    - Doplnit klávesovou navigaci: `activeIndex` nad `flattenResults`, `ArrowUp`/`ArrowDown` se
      zvýrazněním a wrap-around, `Enter` aktivuje zvýrazněný výsledek, `aria-activedescendant`,
      `role="option"`, `aria-selected`
    - Výběr sekce naviguje na `cesta#anchor` a zavírá panel
    - _Requirements: 1.4, 3.1, 3.2, 3.3, 3.4, 4.1, 6.3, 7.2, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 13.1_

  - [x] 6.2 Zapojit `<ScrollToHashOnLoad />` do `DashboardChrome.tsx` (jen owner shell)
    - Vykreslit komponentu v owner variantě, aby scroll fungoval po navigaci na cílové stránky
    - _Requirements: 4.2, 4.3, 12.1, 12.2, 12.3_

  - [ ]* 6.3 Integrační testy `DashboardSearch` (render/interakce a ARIA)
    - Rozbalení + fokus (R10.1), klik mimo (R10.2), Escape (R10.3), výběr zavře panel (R10.4),
      ARIA combobox/listbox a stavy (R11.2), nadpis/popis a fallback na popis (R3.3, R3.4),
      `locked` hláška (R7.2), klientské výsledky ve skupině (R6.3)
    - _Requirements: 3.3, 3.4, 6.3, 7.2, 10.1, 10.2, 10.3, 10.4, 11.2_

  - [ ]* 6.4 Testy časování `DashboardSearch` (fake timers)
    - Debounce 300 ms a race-handling klientů (R6.1, R6.2), anti-flicker „Nic nenalezeno." 300 ms (R9.1)
    - _Requirements: 6.1, 6.2, 9.1_

- [ ] 7. Testy serverové akce a viditelnosti dle role
  - [ ]* 7.1 Integrační testy `searchClientsAction`
    - `locked` bez funkce `client_search` (R7.1), tenant izolace (R7.3), limit ≤ 6 (R7.4),
      `unauthorized` bez přihlášeného uživatele (R7.5)
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [ ]* 7.2 Testy viditelnosti vyhledávání dle role
    - Owner → vyhledávání přítomno (R12.1); admin/`showSearch=false` → nepřítomno (R12.2, R12.3)
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 8. Finální checkpoint
  - Spustit `pnpm test:run`, `pnpm lint` a `pnpm build`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasky označené `*` jsou volitelné (testy) a lze je přeskočit pro rychlejší MVP.
- Každý task odkazuje na konkrétní požadavky kvůli sledovatelnosti.
- Každá vlastnost P1–P10 má vlastní property test (fast-check, `{ numRuns: 100 }`, otagováno
  `// Feature: dashboard-fulltext-search, Property {n}: {text}`), sladěno s `src/__tests__/pbt-smoke.test.ts`.
- Property testy cílí na čisté funkce v `src/lib/search/`; časování, DOM scroll, ARIA render,
  konzistence `id` a serverový gating/izolace jsou ověřeny integračními/příkladovými testy.
- Checkpointy zajišťují inkrementální ověření.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "4.2", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 3, "tasks": ["5.5", "6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3", "6.4", "7.1", "7.2"] }
  ]
}
```
