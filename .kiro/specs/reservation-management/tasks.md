# Implementation Plan: Správa rezervací (dashboard majitele)

## Overview

Postup implementace feature `reservation-management` po vrstvách. Nejprve databázové základy (migrace dvou sloupců + RLS pro majitele), pak **sdílené refaktorizace dotýkající se `public-business-page`** (extrakce atomického zápisu a konsolidace e-mailové vrstvy), následně e-mailové šablony a přístupová brána, potom čtecí vrstva (seznam + detail), stavové mutace, úprava / mazání / ruční tvorba, evidence klientů, CSV export a nakonec propojení a E2E.

Implementace je v **TypeScriptu** (Next.js App Router, Supabase, Resend, `fast-check`) v souladu s designem a sourozeneckým specem `public-business-page`. Sdílený `Slot_Calculator` se importuje ze specu `services-and-availability` — tato feature ho jen volá, neopakuje.

> **Upozornění k úkolům 2.1–2.4:** Refaktorizace se **dotýká kódu `public-business-page`** (`ReservationCreator`, `EmailNotifier`). Jde o vědomou extrakci sdílené logiky do `lib/`. Refaktorizace **MUSÍ zachovat stávající chování veřejné cesty** a projít beze změny stávajícími property testy `public-business-page` (Property 2 — atomicita vytvoření, Property 4 — e-mail best-effort). Změny jsou chirurgické (Surgical Changes / Simplicity First z `CLAUDE.md`).

Konvence: české popisy, anglické názvy souborů, příkazů a identifikátorů. Každý úkol je atomický (cca 30–60 min), referencuje konkrétní acceptance criteria (`_Requirements:_`) a — jde-li o property test — konkrétní property z designu (`_Properties:_`).

## Tasks

- [ ] 1. Databázové základy — migrace a RLS
  - [ ] 1.1 Migrace: sloupce `status_reason` a `attendance`
    - Nová migrace v `supabase/migrations/` přidávající do `reservations` sloupec `status_reason text NULL` (limit ≤ 500 znaků se vynucuje aplikačně) a enum typ `attendance_status` s hodnotami `('attended', 'no_show')` + sloupec `attendance attendance_status NULL DEFAULT NULL`
    - Aditivní migrace — stávající rezervace dostanou `status_reason = NULL` a `attendance = NULL`
    - Smoke ověření: migrace proběhne čistě, existující řádky mají `attendance = NULL`
    - _Requirements: 7.3, 8.3, 11.1, 11.2_

  - [ ] 1.2 Migrace: RLS policies pro dashboard majitele
    - Nová migrace s `authenticated` policies na `reservations` (`SELECT`, `UPDATE`, `DELETE`, `INSERT`) a `clients` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) filtrovanými na `business_id` rovný podniku přihlášeného majitele — třetí, databázová vrstva izolace (defense-in-depth nad aplikačním guardem)
    - _Requirements: 1.4, 1.5_

  - [ ]* 1.3 Integrační test: RLS izolace
    - `tests/integration/dashboard-rls.spec.ts` proti lokálnímu Supabase — uživatel A nevidí ani neupraví rezervace/klienty uživatele B; pokus o cizí `business_id` → autorizační chyba
    - _Requirements: 1.4, 1.5_

- [ ] 2. Sdílené refaktorizace (dotýkají se `public-business-page` — zachovat chování)
  - [ ] 2.1 Extrakce `lib/reservations/atomicSlotWrite`
    - Vyjmout z `src/server/ReservationCreator.ts` atomický blok (advisory lock `pg_advisory_xact_lock(hashtext(business_id))` → re-fetch aktivních rezervací → `Slot_Calculator` → verifikace slotu → zápis → commit) do `src/lib/reservations/atomicSlotWrite.ts`
    - Funkce přijímá write-callback (insert nové vs. update existující) a **volitelný `excludeReservationId`** — při zadání filtruje re-fetch aktivních rezervací o `id != excludeReservationId` (vyloučení sebe sama při úpravě)
    - Přepojit `ReservationCreator` na sdílenou funkci (insert, bez `excludeReservationId`) — chirurgicky, beze změny chování
    - _Requirements: 9.3, 12.3_

  - [ ]* 2.2 Ověření stávajících property testů `ReservationCreator`
    - Spustit beze změny stávající property testy `public-business-page` nad refaktorovaným `ReservationCreator`em; chování veřejné cesty zůstává identické
    - _Properties: public-business-page – Property 2 (Reservation creation atomicity)_
    - _Requirements: 9.3_

  - [ ] 2.3 Konsolidace `Email_Dispatcher` do `lib/email`
    - Přesunout logiku `src/server/EmailNotifier.ts` (Resend klient, best-effort dispatch po commitu, logování bez PII — `reservation_id` + Resend error code, bez adresy příjemce) do sdíleného `src/lib/email/dispatcher.ts` (`Email_Dispatcher`)
    - Stávající dvě šablony `public-business-page` přepojit na sdílený dispatcher beze změny chování
    - _Requirements: 18.6, 18.7_

  - [ ]* 2.4 Ověření stávajících e-mailových testů `public-business-page`
    - Spustit beze změny stávající testy e-mailové best-effort vrstvy nad konsolidovaným `Email_Dispatcher`em
    - _Properties: public-business-page – Property 4 (Email best-effort)_
    - _Requirements: 18.6, 18.7_

- [ ] 3. E-mailové šablony této feature
  - [ ] 3.1 Čtyři české šablony v `lib/email/templates`
    - `Reservation_Approved_Email`, `Reservation_Rejected_Email`, `Reservation_Cancelled_Email`, `Reservation_Modified_Email` v `src/lib/email/templates/`
    - Proměnné dle designu, časy v Europe/Prague (24h), patička s odkazem na veřejný profil + disclaimer „E-mail byl odeslán automaticky platformou mojerezervace.cz"; u rejected/cancelled odlišený blok důvodu, pokud byl zadán; u modified hodnoty po úpravě; u cancelled původní datum a čas
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 3.2 Snapshot testy čtyř šablon
    - `tests/components/email-templates.spec.tsx` — snapshoty schválení, odmítnutí (s/bez důvodu), zrušení (s/bez důvodu), úprava; ověření povinných vět, patičky a odkazu na profil
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [ ] 4. Active_Subscription_Gate middleware
  - [ ] 4.1 Middleware pro `/dashboard/*`
    - `src/middleware.ts` (nebo rozšíření stávajícího) běžící před renderem `/dashboard/*`: nepřihlášený → redirect na `/login`; přihlášený s `subscription.status` mimo `{active, grace_period}` → redirect na stránku se stavem předplatného; jinak průchod
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 4.2 Integrační test brány předplatného
    - `tests/integration/subscription-gate.spec.ts` — status mimo množinu → redirect; nepřihlášený → `/login`; aktivní → přístup
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 5. Checkpoint — základy a sdílené komponenty
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Seznam a detail rezervací (čtecí vrstva)
  - [ ] 6.1 `Reservations_List` + `Reservations_Filter_Bar` + `Reservations_Table_View` + stránkování
    - `src/app/dashboard/reservations/page.tsx` (server component, čtení pod uživatelským JWT majitele) + `src/components/reservations/TableView.tsx` a `FilterBar.tsx`
    - Výchozí stav bez filtru: `starts_at >= now()` vzestupně; tabulka zobrazí datum a čas (Europe/Prague), službu, jméno a telefon klienta, status; zvýraznění `pending`; klik na řádek → detail; česká chybová hláška při selhání otevření detailu
    - Filtry: status (více hodnot), časový rozsah (od–do inkluzivně, přepíše „pouze budoucí"), služba (více hodnot), kombinace konjunktivní; stránkování max 100 řádků/request + přechod na další stránku
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 6.2 `Reservations_Calendar_View`
    - `src/components/reservations/CalendarView.tsx` — denní a týdenní režim (po–ne); rezervace jako blok `starts_at`–`ends_at` (Europe/Prague) s názvem služby a jménem klienta; klik na blok → detail; navigace předchozí/další + „Dnes"/„Tento týden"; všechny statusy, `rejected`/`cancelled` vizuálně odlišené; přepnutí pohledu zachová filtry statusu a služby
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 6.3 Prezentační utilita českého mapování
    - `src/lib/reservations/labels.ts` — mapování Reservation_Status → čeština (`pending` → „Čeká na schválení" atd.) a Attendance_Status → čeština (`null` → „—", `attended` → „Dorazil", `no_show` → „Nedorazil")
    - _Requirements: 2.3, 11.7_

  - [ ] 6.4 `Reservation_Detail_View`
    - `src/app/dashboard/reservations/[id]/page.tsx` — služba, čas (Europe/Prague), status a docházka v češtině, kontakt klienta, poznámka; akce dle statusu (`pending`: Schválit/Odmítnout/Upravit/Smazat; `approved`: Zrušit/Upravit/Smazat; `rejected`/`cancelled`: Smazat); akce docházky pouze když `now() > starts_at`; neexistující/cizí `id` → „Rezervace nebyla nalezena"
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 6.5 Snapshot testy `Table_View` / `Calendar_View`
    - `tests/components/reservations-views.spec.tsx` — české mapování statusů a docházky, zvýraznění `pending`, odlišení `rejected`/`cancelled` v kalendáři, zachování filtrů při přepnutí pohledu
    - _Requirements: 2.3, 2.4, 4.5, 4.6, 11.7_

  - [ ]* 6.6 Příkladové testy `Reservation_Detail_View`
    - `tests/components/reservation-detail.spec.tsx` — mapování status → množina dostupných akcí (4 případy) a hláška „Rezervace nebyla nalezena"
    - _Requirements: 5.2, 5.4_

  - [ ]* 6.7 Integrační test filtrů a stránkování
    - `tests/integration/reservation-filters.spec.ts` — konjunktivní kombinace status × rozsah × služba vrací průnik; časový rozsah přepíše „pouze budoucí"; jeden request max 100 řádků
    - _Requirements: 2.1, 2.7, 3.3, 3.5_

- [ ] 7. Stavové přechody a docházka
  - [ ] 7.1 `Reservation_Approver`
    - `src/server/ReservationApprover.ts` — podmíněný `UPDATE ... WHERE id = ? AND status = 'pending'` → `approved`; při neovlivnění řádku česká hláška „Rezervaci nelze schválit, není ve stavu Čeká na schválení"; po commitu best-effort `Reservation_Approved_Email`; log bez PII
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 7.2 `Reservation_Rejecter`
    - `src/server/ReservationRejecter.ts` — validace důvodu ≤ 500 znaků (jinak „Důvod smí mít nejvýše 500 znaků"); podmíněný `UPDATE pending → rejected` + uložení `status_reason`; jinak „Rezervaci nelze odmítnout, není ve stavu Čeká na schválení"; po commitu `Reservation_Rejected_Email` s důvodem, byl-li zadán; log bez PII
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 7.3 `Reservation_Canceller`
    - `src/server/ReservationCanceller.ts` — validace důvodu ≤ 500 znaků; podmíněný `UPDATE approved → cancelled` + `status_reason`; jinak „Zrušit lze pouze schválenou rezervaci"; po commitu `Reservation_Cancelled_Email` s důvodem, byl-li zadán; log bez PII
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 7.4 `Attendance_Marker`
    - `src/server/AttendanceMarker.ts` — serverová časová brána `now() > starts_at` (jinak operaci nepovolit); nastavení `attended`/`no_show`/zpět `null`; **nemění `status` ani neodesílá e-mail**; log bez PII
    - _Requirements: 11.3, 11.4, 11.5, 11.6_

  - [ ]* 7.5 PBT: validita stavových přechodů
    - `tests/properties/status-transition-validity.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 1`
    - **Property 1: Status transition validity** — legální přechod změní `status` právě tehdy, je-li výchozí stav povoleným zdrojem; nelegální neprovede žádnou změnu; `Attendance_Marker` nikdy nemění `status`
    - _Properties: 1_
    - _Requirements: 6.1, 6.2, 7.3, 7.4, 8.3, 8.4, 11.6_

  - [ ]* 7.6 Příkladový test časové brány docházky
    - `tests/unit/attendance-gate.spec.ts` — `now() <= starts_at` → akce nedostupná; `now() > starts_at` → dostupná; přepínání `attended`/`no_show`/`null`
    - _Requirements: 11.3, 11.4, 11.5_

- [ ] 8. Checkpoint — čtení a stavové přechody
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Úprava, mazání a ruční tvorba rezervace
  - [ ] 9.1 `Reservation_Editor`
    - `src/server/ReservationEditor.ts` — guard statusu `{pending, approved}`; serverová validace polí shodná s klientským formulářem `public-business-page`; volání sdíleného `atomicSlotWrite` s `excludeReservationId` (vyloučení sebe sama); UPDATE `starts_at` + dopočtené `ends_at = starts_at + service.duration_minutes` v UTC; při nedostupném slotu / chybné službě rollback + 409 „Tento termín není dostupný" + aktualizovaný `Available_Slot_List`; po commitu best-effort `Reservation_Modified_Email`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ] 9.2 `Reservation_Deleter`
    - `src/server/ReservationDeleter.ts` — nevratný hard delete řádku v `reservations` z libovolného statusu; žádný e-mail; log s `business_id`, `user_id`, `reservation_id` bez PII
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ] 9.3 `Manual_Reservation_Creator`
    - `src/server/ManualReservationCreator.ts` — serverová validace (jméno + alespoň jeden kontakt povinný); sdílený `atomicSlotWrite` (insert varianta); `status = 'approved'` **nezávisle na** `business.auto_approve_reservations`; žádný potvrzovací e-mail klientovi; při nedostupném slotu rollback + 409 + aktualizovaný `Available_Slot_List`; `starts_at`/`ends_at` v UTC; po commitu spustí `Client_Upsertor` (viz 10.1)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ]* 9.4 PBT: atomicita úpravy (vyloučení sebe sama)
    - `tests/properties/edit-atomicity.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 2`
    - **Property 2: Edit atomicity** — úprava ponechávající čas / měnící jen službu neselže kvůli konfliktu se sebou; zápis nastane právě tehdy, je-li slot dostupný pod lockem; jinak žádná změna + rollback; mock DB se simulací race
    - _Properties: 2_
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_

  - [ ]* 9.5 PBT: status ruční tvorby
    - `tests/properties/manual-creation-status.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 3`
    - **Property 3: Manual creation status** — výsledný `status == 'approved'` pro libovolnou hodnotu `auto_approve_reservations`
    - _Properties: 3_
    - _Requirements: 12.4_

  - [ ]* 9.6 PBT: e-mail best-effort
    - `tests/properties/email-best-effort.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 7`
    - **Property 7: Email best-effort** — pro libovolný výsledek odeslání (úspěch i selhání) přetrvá DB změna mutace (schválení/odmítnutí/zrušení/úprava); selhání e-mailu nikdy nezpůsobí rollback
    - _Properties: 7_
    - _Requirements: 6.4, 7.6, 8.6, 9.6, 18.6, 18.7_

  - [ ]* 9.7 Příkladový test `Reservation_Deleter`
    - `tests/unit/reservation-deleter.spec.ts` — hard delete uspěje z každého ze 4 stavů; žádný e-mail
    - _Requirements: 10.3, 10.4_

  - [ ]* 9.8 Integrační test advisory lock race při úpravě
    - `tests/integration/edit-race.spec.ts` proti lokálnímu Supabase — dva souběžné requesty na úpravu vedoucí na stejný slot stejného podniku; lock serializuje, jeden uspěje, druhý 409
    - _Requirements: 9.3, 9.4_

- [ ] 10. Evidence klientů
  - [ ] 10.1 `Client_Upsertor` (sdílený, po commitu)
    - `src/server/ClientUpsertor.ts` — po commitu rezervace best-effort párování proti `clients` v rámci `business_id`: normalizovaný telefon → e-mail (case-insensitive) → INSERT; při nálezu aktualizovat `name` a doplnit chybějící kontakt bez přepisu vyplněného; selhání jen zalogovat (žádný rollback rezervace)
    - Přepojit i veřejnou cestu — `ReservationCreator` v `public-business-page` volá tento sdílený upsertor po commitu
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ] 10.2 `Clients_Roster`
    - `src/app/dashboard/clients/page.tsx` — seznam klientů podniku (jméno, telefon, e-mail, počet rezervací, datum poslední rezervace přes párovací pravidlo); výhradně `business_id` majitele; stránkování max 100
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 10.3 `Client_Detail_View`
    - `src/app/dashboard/clients/[id]/page.tsx` — kontakt klienta + chronologická historie rezervací (přes párovací pravidlo telefon NEBO e-mail); každý řádek: datum a čas (Europe/Prague), služba, status a docházka v češtině; klik → `Reservation_Detail_View`; prázdný stav „Klient zatím nemá žádné rezervace"; akce „Smazat klienta (GDPR)" s potvrzovacím dialogem
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 16.1_

  - [ ] 10.4 `Client_Anonymizer`
    - `src/server/ClientAnonymizer.ts` — jediná DB transakce: (a) identifikace rezervací podle shody telefonu NEBO e-mailu, (b) `client_name = "Smazaný klient"`, `client_phone = client_email = NULL`, (c) hard delete řádku klienta; zachovat `service_id`, `starts_at`, `ends_at`, `status`, `attendance`; povolit i při 0 odpovídajících rezervacích; log s počtem anonymizovaných rezervací bez PII
    - _Requirements: 16.2, 16.3, 16.4, 16.5_

  - [ ]* 10.5 PBT: determinismus upsertu klienta
    - `tests/properties/client-upsert-determinism.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 4`
    - **Property 4: Client upsert determinism** — striktní pořadí telefon → e-mail → insert; aktualizace doplní chybějící kontakt bez přepisu vyplněného; výhradně v rámci `business_id`; generátor variant normalizace telefonu a casingu e-mailu
    - _Properties: 4_
    - _Requirements: 15.2, 15.3, 15.4, 15.6_

  - [ ]* 10.6 PBT: úplnost anonymizace
    - `tests/properties/anonymization-completeness.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 5`
    - **Property 5: Anonymization completeness** — po anonymizaci žádná rezervace nenese původní PII, sloty matchujících rezervací nezměněny, nematchující beze změny, řádek klienta smazán; atomicky i při 0 rezervacích
    - _Properties: 5_
    - _Requirements: 16.2, 16.3, 16.4_

  - [ ]* 10.7 Příkladový test prázdného stavu `Client_Detail_View`
    - `tests/components/client-detail-empty.spec.tsx` — hláška „Klient zatím nemá žádné rezervace"
    - _Requirements: 14.5_

  - [ ]* 10.8 Integrační test časování upsertu
    - `tests/integration/client-upsert-timing.spec.ts` — upsert proběhne po commitu rezervace; vyvolané selhání upsertu nezruší rezervaci
    - _Requirements: 15.1, 15.5_

  - [ ]* 10.9 Integrační test atomicity anonymizace
    - `tests/integration/anonymization-atomicity.spec.ts` — klient + anonymizace rezervací v jedné transakci; zachování slotů; povolení při 0 rezervacích
    - _Requirements: 16.2, 16.3, 16.4_

- [ ] 11. CSV export
  - [ ] 11.1 `CSV_Exporter`
    - `src/server/CsvExporter.ts` — shodná sada filtrů jako vykreslený seznam; všechny vyfiltrované řádky bez ohledu na stránkování; jen `business_id` majitele; UTF-8 s BOM; RFC 4180 escaping (čárka/uvozovka/nový řádek → uvozovky se zdvojením vnitřních); hlavička `id, starts_at, ends_at, service_name, client_name, client_phone, client_email, note, status, attendance, created_at`; časová pole ISO 8601 Europe/Prague s offsetem; streaming po řádcích; log s počtem exportovaných řádků bez PII
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ]* 11.2 PBT: round-trip CSV escapingu
    - `tests/properties/csv-escaping.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 6`
    - **Property 6: CSV escaping round-trip** — `parseCSV(encodeField(value)) === value` pro libovolný řetězec (čárky, uvozovky, `\n`, `\r\n` a kombinace)
    - _Properties: 6_
    - _Requirements: 17.2_

  - [ ]* 11.3 PBT: citlivá data nejsou v lozích
    - `tests/properties/sensitive-data-logs.spec.ts`, `fast-check`, ≥ 100 iterací, tag `Feature: reservation-management, Property 8`
    - **Property 8: Sensitive data not in logs** — pro libovolnou mutaci (schválení, odmítnutí, zrušení, úprava, smazání, ruční tvorba, docházka, upsert, anonymizace, CSV export) žádná log zpráva neobsahuje `client_name`/`client_phone`/`client_email`/`client_note` jako podřetězec
    - _Properties: 8_
    - _Requirements: 10.5, 16.5, 17.6, 20.1, 20.2_

  - [ ]* 11.4 Příkladový test CSV hlavičky a kódování
    - `tests/unit/csv-format.spec.ts` — správné sloupce hlavičky, časová pole ISO 8601 Europe/Prague s offsetem, přítomný UTF-8 BOM
    - _Requirements: 17.2, 17.3_

  - [ ]* 11.5 Integrační test rozsahu CSV
    - `tests/integration/csv-scope.spec.ts` — export jen `business_id` majitele; všechny vyfiltrované řádky bez ohledu na stránkování UI
    - _Requirements: 17.4, 17.5_

- [ ] 12. Checkpoint — mutace, klienti a export
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Propojení dashboardu a E2E
  - [ ] 13.1 Propojení akcí a navigace
    - Napojit v `Reservations_List` akce „Vytvořit rezervaci" → `Manual_Reservation_Creator` a „Exportovat do CSV" → `CSV_Exporter` (se shodnými filtry); propojit akční tlačítka `Reservation_Detail_View` na server actions (schválit/odmítnout/zrušit/upravit/smazat/docházka); navigace dashboardu mezi `/dashboard/reservations` a `/dashboard/clients`
    - _Requirements: 2.5, 5.2, 12.1, 17.1_

  - [ ]* 13.2 E2E: schválení rezervace
    - `tests/e2e/approve-flow.spec.ts` (Playwright) — otevření seznamu → zvýrazněná `pending` → detail → Schválit → status „Schváleno" + e-mail v Resend test inboxu
    - _Requirements: 6.1, 6.3_

  - [ ]* 13.3 E2E: úprava rezervace
    - `tests/e2e/edit-flow.spec.ts` — detail → změna času na dostupný slot → uložení → `Reservation_Modified_Email` v inboxu
    - _Requirements: 9.1, 9.6_

  - [ ]* 13.4 E2E: ruční tvorba rezervace
    - `tests/e2e/manual-creation.spec.ts` — „Vytvořit rezervaci" → vyplnění → uložení → rezervace `approved` v seznamu, bez e-mailu klientovi
    - _Requirements: 12.1, 12.4, 12.5_

- [ ] 14. Finální checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Sub-tasky označené `*` jsou volitelné (property / příkladové / integrační / E2E testy); v MVP je lze vynechat pro rychlejší dodávku, ale property testy doporučujeme spouštět před release.
- Property testy jsou umístěny **co nejblíže implementaci** (catch errors early), každá property má vlastní sub-task, `fast-check`, ≥ 100 iterací a tag `Feature: reservation-management, Property N`.
- Úkoly 2.1–2.4 se **dotýkají `public-business-page`** — jsou chirurgické a **musí zachovat stávající chování i property testy** veřejné cesty (Property 2 a 4 z `public-business-page`).
- `Slot_Calculator` se importuje ze specu `services-and-availability` — neopakuje se. Atomicita insertu nové rezervace je chráněna property testy `public-business-page` přes sdílený `lib/reservations/atomicSlotWrite`.
- `Client_Upsertor` (10.1) je sdílený mezi veřejnou cestou a `Manual_Reservation_Creator` — proto je v grafu dříve než ruční tvorba (9.3).
- Každý úkol referencuje konkrétní acceptance criteria (`_Requirements:_`); property testy navíc property z designu (`_Properties:_`).
- Checkpointy (5, 8, 12, 14) jsou momentem pro spuštění celé testovací suite a diskusi nad otevřenými otázkami.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.3", "4.1", "6.3"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.4", "3.1", "4.2", "6.1", "6.2", "6.4", "10.1"] },
    { "id": 2, "tasks": ["3.2", "6.5", "6.6", "6.7", "7.1", "7.2", "7.3", "7.4", "9.1", "9.2", "9.3", "10.2", "10.3", "10.4"] },
    { "id": 3, "tasks": ["7.5", "7.6", "9.4", "9.5", "9.6", "9.7", "9.8", "10.5", "10.6", "10.7", "10.8", "10.9", "11.1"] },
    { "id": 4, "tasks": ["11.2", "11.3", "11.4", "11.5", "13.1"] },
    { "id": 5, "tasks": ["13.2", "13.3", "13.4"] }
  ]
}
```
