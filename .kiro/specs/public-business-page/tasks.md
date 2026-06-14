# Implementation Plan: Veřejná stránka podniku

## Overview

Postup implementace feature `public-business-page` po vrstvách: nejprve RLS a pomocné utility, pak vrstva veřejného renderu (`/[slug]`, SEO, sitemap), následně klientský pětikrokový formulář a server actions s atomickým zápisem rezervace, a nakonec property / integrační / E2E testy. Implementace se opírá o sdílený `Slot_Calculator` ze specu `services-and-availability` (této feature ji jen volá, neopakuje).

Každý úkol je atomický (cca 30–60 min), referencuje konkrétní acceptance criteria a — pokud jde o test — konkrétní property z designu. Konvence: české popisy, anglické názvy souborů, příkazů a identifikátorů.

## Tasks

- [x] 1. RLS policies a databázové základy
  - [x] 1.1 Migrace: anon read policy pro `businesses`, `services`, `opening_hours`
    - Přidat do nové migrace v `supabase/migrations/` policy povolující `SELECT` pro role `anon` na `businesses`, `services`, `opening_hours` filtrovanou přes `is_published = true` AND join na `subscriptions.status IN ('active', 'grace_period')`
    - Přidat doplňkovou „read minimum" policy na `businesses` (sloupce `id`, `slug`, `is_published`) pro detekci nepublikovaného profilu
    - _Requirements: 1.1, 2.1, 3.1, 13.2, 15.3_

  - [x] 1.2 Migrace: deny anon na `reservations` (read i insert)
    - Druhá migrace: explicitní `deny` policy pro role `anon` na `SELECT` i `INSERT` do `reservations`
    - Insert povolen pouze pod server-side klíčem (service role)
    - _Requirements: 9.5, 15.3, 15.4_

- [x] 2. Slug normalizace a routing utility
  - [x] 2.1 Helper `normalizeSlug` + check Reserved_Slug
    - V `src/lib/slug.ts` implementovat čistou funkci `normalizeSlug(input: string): string` (pouhý `toLowerCase()`)
    - Implementovat `isReservedSlug(slug: string): boolean` proti množině `RESERVED_SLUGS` ze specu `auth-onboarding`
    - _Requirements: 3.2_

- [x] 3. PublicProfileRenderer a /[slug] routa
  - [x] 3.1 Komponenta `PublicProfileRenderer`
    - Server component v `src/components/PublicProfileRenderer.tsx`
    - Vykreslení loga přes `next/image` s `priority`, název, typ, sanitizovaný popis, kontakty (jen vyplněná pole), tabulka otevírací doby pro 7 dní s „zavřeno" pro zavřené dny, seznam služeb (název / trvání / cena v Kč)
    - HTML sanitizace polí `business.description` a `service.description` před vložením do JSX
    - Defenzivní hláška „Tento podnik zatím nemá žádné rezervovatelné služby" pokud je seznam služeb prázdný
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 4.4, 4.5, 14.1, 14.2, 17.1, 17.2, 17.3_

  - [x] 3.2 Routa `app/[slug]/page.tsx` se stavovou dispatch logikou
    - Server component s `export const revalidate = 60` (ISR)
    - Anon Supabase klíč pro načtení businessu + subscription + services + opening_hours
    - Dispatch tří stavů: publikovaný (vykreslí `PublicProfileRenderer` + `ReservationFormController`), nepublikovaný (200 + jen název + hláška + noindex), 404 (`notFound()`)
    - Slug z URL projde `normalizeSlug`; reserved slug → 404
    - _Requirements: 1.1, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 15.2, 15.3_

  - [x]* 3.3 Property test: case-insensitivita slugu
    - **Property 1: Slug case-insensitivity**
    - **Validates: Requirements 3.1, 3.2**
    - `tests/properties/slug-case-insensitivity.spec.ts` s `fast-check`, generátor libovolné permutace casing nad slug stringem; ověřuje, že rendering rozhodnutí je identické pro všechny varianty

  - [x]* 3.4 Snapshot test `PublicProfileRenderer` (3 stavy)
    - `tests/components/PublicProfileRenderer.spec.tsx`
    - Snapshoty pro publikovaný profil (s logem / bez loga, různé kombinace kontaktů), nepublikovaný profil, 404
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

- [x] 4. SEO metadata, JSON-LD, sitemap, robots
  - [x] 4.1 `generateMetadata` per stav stránky
    - Doplnit `export async function generateMetadata` do `app/[slug]/page.tsx`
    - Publikovaný: `<title>` = „{název} — rezervace online", `<meta description>` (155 znaků popisu), Open Graph tagy, `<link rel="canonical">` na lowercase URL
    - Nepublikovaný / 404: pouze `<meta name="robots" content="noindex">`
    - _Requirements: 12.1, 12.2, 12.4, 2.3, 3.3_

  - [x] 4.2 Inline JSON-LD `LocalBusiness`
    - Komponenta `src/components/JsonLdLocalBusiness.tsx` vracející `<script type="application/ld+json">` se schema.org `LocalBusiness` (`name`, `url`, volitelně `image`, `address`, `telephone`, `email`, `openingHoursSpecification`)
    - Vykreslena pouze v publikovaném stavu
    - _Requirements: 12.3, 12.4_

  - [x] 4.3 `app/sitemap.ts` dynamic sitemap
    - Implementovat `SitemapBuilder` jako default export Next.js sitemap konvence
    - Anon read všech `Published_Business`; pro každý záznam URL `https://www.horea.cz/{slug}` + `lastmod = business.updated_at` v ISO 8601
    - `export const revalidate = 3600`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 4.4 `app/robots.ts`
    - Default export Next.js robots konvence: povolit indexaci kořene, odkaz na `/sitemap.xml`
    - _Requirements: 13.1_

  - [x]* 4.5 Property test: korektnost sitemap
    - **Property 7: Sitemap correctness**
    - **Validates: Requirements 13.2, 13.3**
    - `tests/properties/sitemap-correctness.spec.ts`, generátor datasetů `businesses × subscriptions`, ověřuje iff vazbu „URL v sitemap ⟺ business je Published_Business"

  - [x]* 4.6 Snapshot test `SeoMetadata` (3 stavy)
    - `tests/components/SeoMetadata.spec.ts`
    - Snapshoty výstupu `generateMetadata` pro publikovaný / nepublikovaný / 404 stav
    - _Requirements: 12.1, 12.2, 12.4_

- [x] 5. Checkpoint — veřejná vrstva
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Rezervační formulář — client component (5 kroků)
  - [x] 6.1 `ReservationFormController` skeleton
    - Client component v `src/components/reservation/ReservationFormController.tsx`
    - Lokální React state: aktuální krok (1–5), vybraná služba, datum, čas, kontaktní pole, slot list, stav odesílání (idle / pending / error / success)
    - Navigace mezi kroky vpřed/zpět zachovává hodnoty ostatních kroků
    - _Requirements: 8.2, 14.3, 14.4, 17.1_

  - [x] 6.2 Krok 1 — výběr služby
    - `src/components/reservation/Step1ServicePicker.tsx`
    - Seznam služeb v pořadí dle `created_at` vzestupně (název, trvání v min, cena v Kč), výběr právě jedné jako podmínka přechodu
    - Zobrazení i služby s cenou 0 Kč
    - Defenzivní hláška „Tento podnik zatím nemá žádné rezervovatelné služby" při prázdném seznamu
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.3 Krok 2 — výběr data + volání `AvailableSlotsService`
    - `src/components/reservation/Step2DatePicker.tsx`
    - Kalendář od dnešního dne v Europe/Prague, minulé dny vůbec nezobrazovat / zneaktivnit
    - Po výběru data volání `AvailableSlotsService` server action; české hlášky „V tento den nejsou dostupné žádné termíny" (prázdný list) a „Nepodařilo se načíst termíny, zkuste to prosím znovu" (chyba)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.4 Krok 3 — výběr času
    - `src/components/reservation/Step3TimePicker.tsx`
    - Seznam počátečních časů ze slot listu vzestupně v lokálním formátu „HH:MM" (Europe/Prague), výběr právě jednoho
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 6.5 Krok 4 — kontaktní formulář
    - `src/components/reservation/Step4ContactForm.tsx`
    - Pole jméno (povinné, ≤ 100 znaků), telefon (povinné, validace formátu), e-mail (povinné, validace formátu), poznámka (volitelná, ≤ 500 znaků)
    - Klientská validace s českými hláškami dle pravidel (jen UX vrstva — server validuje znovu)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 6.6 Krok 5 — souhrn a odeslání
    - `src/components/reservation/Step5Summary.tsx`
    - Souhrn všech polí v češtině, tlačítko „Odeslat rezervaci"
    - Při kliku **synchronně** v rámci stejné události znepřístupnit tlačítko ještě před začátkem requestu (R8.4); držet disabled až do dokončení (R8.5)
    - Volání `ReservationCreator` server action; zobrazení děkovné hlášky podle `status` nebo chybové hlášky podle response (404, 409 s aktualizovaným slot listem, 400)
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 9.4, 9.9_

  - [x]* 6.7 Snapshot test `ReservationFormController` per krok
    - `tests/components/ReservationFormController.spec.tsx`
    - Snapshoty pro každý z pěti kroků; ověření, že návrat na předchozí krok zachová data; ověření, že tlačítko v kroku 5 se synchronně znepřístupní
    - _Requirements: 4.1, 5.1, 6.1, 7.1, 8.1, 8.2, 8.4_

- [x] 7. Server actions a notifikace
  - [x] 7.1 `AvailableSlotsService` server action
    - `src/server/AvailableSlotsService.ts`
    - Anon read business + service + opening_hours[day_of_week] + aktivní rezervace pro daný den
    - Defenzivní ověření, že business je `Published_Business` a service patří k businessu (jinak prázdný list)
    - Volání `Slot_Calculator(config, day, service, reservations)` z `services-and-availability`; návrat jako seznam počátečních časů v Europe/Prague
    - _Requirements: 5.3, 9.1, 9.2_

  - [x] 7.2 `ReservationCreator` server action — atomický blok
    - `src/server/ReservationCreator.ts`
    - **Vstupní validace** všech polí znovu serverově (R7.2–R7.6); 400 s českou hláškou
    - **Kontextová validace**: ověření server kontextu (R15.5 — jinak zablokovat), business je `Published_Business`, service patří k businessu (jinak 404)
    - **Atomický blok v jedné DB transakci**: `BEGIN` → `pg_advisory_xact_lock(hashtext(business_id))` → re-fetch aktivních rezervací → recompute slotů přes `Slot_Calculator` → verify chosen slot ∈ list (jinak ROLLBACK + 409 + nový list) → INSERT do `reservations` s denormalizovanými poli (`client_name`, `client_phone`, `client_email`, `note`), `starts_at`/`ends_at` v UTC, `status = 'approved' iff business.auto_approve_reservations` jinak `'pending'` → COMMIT (lock se uvolní automaticky)
    - **Post-commit best-effort** dispatch obou e-mailů přes `EmailNotifier` (selhání nezpůsobí rollback)
    - **Logování** úspěchu / odmítnutí bez citlivých polí klienta
    - _Requirements: 7.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 15.4, 15.5, 16.2, 17.4, 18.1, 18.2, 18.3, 18.4_

  - [x] 7.3 `EmailNotifier` přes Resend (dvě šablony)
    - `src/server/EmailNotifier.ts` + šablony v `src/server/email-templates/` (`Reservation_Confirmation_Email`, `Reservation_Notification_Email`)
    - Obě šablony v češtině s proměnnými dle designu, časy v Europe/Prague, ceny v Kč
    - Best-effort: selhání pouze zaloguje (`reservation_id` + Resend error code, bez příjemce), nikdy neházet výjimku do volajícího
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 17.1, 17.2, 17.3_

  - [x]* 7.4 Property test: atomicita vytvoření rezervace
    - **Property 2: Reservation creation atomicity**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7**
    - `tests/properties/reservation-atomicity.spec.ts`; mock DB s podporou simulace race (mutace seznamu rezervací mezi verify a insert); ověřuje invariant „rezervace existuje ⟺ slot byl pod lockem dostupný"

  - [x]* 7.5 Property test: přiřazení statusu
    - **Property 3: Status assignment**
    - **Validates: Requirements 9.6**
    - `tests/properties/status-assignment.spec.ts`; iff vazba `status = 'approved' ⟺ business.auto_approve_reservations = true`

  - [x]* 7.6 Property test: e-mail best-effort
    - **Property 4: Email best-effort**
    - **Validates: Requirements 10.3, 11.3**
    - `tests/properties/email-best-effort.spec.ts`; mock Resend s libovolnou kombinací selhání obou e-mailů; ověření, že rezervace v DB existuje po commitu vždy

  - [x]* 7.7 Property test: totalita server-side validace
    - **Property 5: Server-side validation totality**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**
    - `tests/properties/validation-totality.spec.ts`; generátory validních a nevalidních kontaktních polí; ověření, že server odmítne přesně ty vstupy, které porušují pravidla

  - [x]* 7.8 Property test: citlivá data nejsou v lozích
    - **Property 6: Sensitive data not in logs**
    - **Validates: Requirements 18.4**
    - `tests/properties/sensitive-data-logs.spec.ts`; mock logger zachycující všechny zprávy; pro libovolný vstup (úspěch i odmítnutí) žádná zpráva neobsahuje hodnoty `client_phone`, `client_email`, `note`

- [x] 8. Integrační a E2E testy
  - [x]* 8.1 Integration test: race condition na stejný slot
    - `tests/integration/race-condition.spec.ts` proti lokálnímu Supabase
    - Dva paralelní requesty na `ReservationCreator` se shodným `(business_id, service_id, starts_at)` → právě jeden vrátí 200, druhý 409
    - _Requirements: 9.7_

  - [x]* 8.2 Integration test: ISR revalidation po CRUD
    - `tests/integration/isr-revalidation.spec.ts`
    - Změna dat businessu/služby/otevírací doby → zavolání `Public_Page_Revalidator` ze `services-and-availability` → další request na `/[slug]` vrátí čerstvá data
    - _Requirements: 1.6, 15.2_

  - [x]* 8.3 Integration test: anon RLS nemůže číst `reservations`
    - `tests/integration/rls.spec.ts`
    - Anon klíč: `SELECT` na `reservations` vrací prázdno; `INSERT` do `reservations` selže; `SELECT` na `users` selže
    - Server-side klíč: může vše potřebné
    - _Requirements: 9.5, 15.3, 15.4_

  - [x]* 8.4 E2E happy path Playwright
    - `tests/e2e/happy-path.spec.ts`
    - Klient otevře `/{slug}` publikovaného profilu → výběr služby → výběr data → výběr času → vyplnění kontaktu → potvrzení → děkovná hláška + e-mail v Resend test inboxu
    - _Requirements: 1.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.9_

- [x] 9. Provozní dokumentace
  - [x] 9.1 Operational note: úprava Cloudflare WAF rate limit cesty
    - `docs/OPERATIONS.md` (nebo dodatek k existující operations dokumentaci)
    - Popis, že path-pattern Cloudflare rate limit pravidla z `architecture/tasks.md` úkol 5.4 musí cílit na cestu Next.js server action endpointů (POST se hlavičkou `Next-Action`) místo / vedle `/api/reservations`; konkrétní pattern a očekávaná hodnota (~10 req/IP/min)
    - _Requirements: 16.1, 16.2_

- [x] 10. Finální checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Sub-tasky označené `*` jsou volitelné (testy a integrace), v MVP je možné vynechat pro rychlejší dodávku — ale property testy doporučujeme spouštět minimálně před release.
- Každý úkol referencuje konkrétní acceptance criteria z `requirements.md`; property testy navíc referencují příslušnou Property z `design.md`.
- Sdílený `Slot_Calculator` se importuje ze specu `services-and-availability` — tato feature ho jen volá, neopakuje jeho logiku ani jeho property testy.
- Sanitizační utility (DOMPurify nebo ekvivalent) je sdílená infrastruktura mimo scope této feature.
- Atomicita rezervace stojí a padá s `pg_advisory_xact_lock(hashtext(business_id))` v rámci transakce — integrační test 8.1 ověřuje skutečné chování proti reálnému Postgresu (PBT 7.4 ověřuje pouze logiku nad mock DB).
- Checkpointy (5, 10) jsou momentem pro spuštění celé testovací suite a případnou diskusi nad otevřenými otázkami.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "4.4", "7.3", "9.1"] },
    { "id": 1, "tasks": ["3.1", "4.2", "4.3", "6.1", "7.1", "7.2", "8.3"] },
    { "id": 2, "tasks": ["3.2", "6.2", "6.3", "6.4", "6.5", "6.6", "3.4", "4.5", "7.4", "7.5", "7.6", "7.7", "7.8", "8.1"] },
    { "id": 3, "tasks": ["4.1", "3.3", "6.7", "8.2"] },
    { "id": 4, "tasks": ["4.6"] },
    { "id": 5, "tasks": ["8.4"] }
  ]
}
```
