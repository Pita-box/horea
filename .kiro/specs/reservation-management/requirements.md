# Requirements Document

## Introduction

Tato specifikace pokrývá **dashboard majitele podniku pro správu rezervací** — vše, co podnikatel dělá s rezervacemi vytvořenými klienty přes veřejnou stránku (`public-business-page`) i s rezervacemi, které si zadá sám. Konkrétně: prohlížení a filtrování seznamu rezervací (tabulka + kalendář), detail rezervace, schvalování, odmítání, rušení, úpravy a mazání, sledování docházky (dorazil / nedorazil), ruční zakládání rezervací (telefonní objednávky), odvozenou evidenci klientů per podnik, CSV export a transakční e-maily klientům v češtině.

Feature pokrývá:

- Routu `/dashboard/reservations` se dvěma pohledy (tabulka, kalendář), filtry (status, časový rozsah, služba) a výchozím řazením budoucích rezervací podle data vzestupně, se zvýrazněním rezervací čekajících na schválení.
- Akce nad rezervací: **schválit** (`pending` → `approved`), **odmítnout** (`pending` → `rejected`, volitelný důvod), **zrušit** (`approved` → `cancelled`, volitelný důvod), **upravit** (čas / služba s revalidací dostupnosti slotu), **smazat** (nevratný hard delete).
- **Sledování docházky** přes samostatné pole `attendance` (`null` / `attended` / `no_show`), nezávislé na Reservation_Status, dostupné po čase konání rezervace.
- Detail rezervace se jménem, telefonem a e-mailem klienta, službou, datem a časem, statusem a poznámkou.
- Ruční založení rezervace majitelem (telefonní objednávky) — stejná validace jako veřejná cesta, ale bez potvrzovacího e-mailu klientovi.
- Routu `/dashboard/clients` s evidencí klientů odvozenou z rezervací: seznam unikátních klientů per `business_id`, detail s historií rezervací, server-side upsert klienta po každé nové rezervaci a smazání klienta s **anonymizací** jeho rezervací (zachování slotů pro historii obsazenosti).
- GDPR akce: nevratné smazání jednotlivé rezervace a smazání (anonymizace) klienta.
- Sadu transakčních e-mailů v češtině přes Resend (schválení, odmítnutí, zrušení, úprava), best-effort.
- CSV export aktuálně vyfiltrovaného seznamu rezervací.

Feature **nepokrývá**:

- Klientské vytvoření rezervace přes veřejnou stránku (spec `public-business-page`).
- Algoritmus výpočtu slotů (spec `services-and-availability`, čistá funkce `Slot_Calculator`).
- CRUD služeb a otevírací doby (spec `services-and-availability`).
- Statistiky a reporting (v2), synchronizaci s externími kalendáři (v2), denní zálohu do Google Sheets (architektura / cron).
- Stavový automat předplatného a fakturaci (spec `subscription-payments`).

Návaznost na platformové požadavky z `architecture/requirements.md`: **R1** (multi-tenancy / RLS na úrovni `business_id`), **R8** (on-demand CSV export rezervací z dashboardu), **R9** (GDPR — mazání rezervací a klientů), **R13** (transakční e-maily přes Resend, best-effort), **R15** (nastavení auto-approve podniku — relevantní pro defaultní status ručně tvořené rezervace), **R18** (čeština jako jediný jazyk MVP, Kč, Europe/Prague v UI, UTC v DB), **R19** (klient bez registrace, denormalizované kontaktní údaje v `reservations`, upsert per `business_id`), **R20** (strukturované logy bez citlivých údajů).

Návaznost na feature specifikace: `services-and-availability` poskytuje sdílený `Slot_Calculator`; `public-business-page` definuje vzor advisory locku per `business_id` a server-side validační vrstvy — úprava a ruční tvorba rezervace v této feature procházejí **identickou** validační logikou (publikovanost se nevyžaduje, advisory lock + re-check slotu + atomický zápis ano).

## Glossary

- **Reservations_Dashboard**: Souhrnný název pro stránky `/dashboard/reservations` a `/dashboard/clients` v rozhraní přihlášeného majitele podniku.
- **Active_Subscription_Gate**: Pravidlo povolující přístup do Reservations_Dashboard pouze tehdy, když `subscription.status` patří do množiny `{active, grace_period}`.
- **Reservations_List**: Stránka `/dashboard/reservations` se dvěma pohledy (Reservations_Table_View, Reservations_Calendar_View) a sdílenou filtrační vrstvou (Reservations_Filter_Bar).
- **Reservations_Table_View**: Tabulkový pohled na rezervace řazený podle `starts_at`.
- **Reservations_Calendar_View**: Kalendářní pohled (denní a týdenní) zobrazující rezervace v časové ose podle `starts_at` a `ends_at`.
- **Reservations_Filter_Bar**: Filtrační lišta nad oběma pohledy — filtr podle statusu, časového rozsahu a služby.
- **Reservation_Detail_View**: Stránka nebo modal `/dashboard/reservations/[id]` zobrazující jednu rezervaci se všemi poli, statusem, docházkou a akcemi.
- **Reservation_Status**: Stav rezervace s hodnotami `pending`, `approved`, `rejected`, `cancelled`. Smazaná rezervace v databázi neexistuje (hard delete).
- **Attendance_Status**: Samostatné pole `attendance` s hodnotami `null` (nevyhodnoceno), `attended` (dorazil), `no_show` (nedorazil). Attendance_Status NENÍ součástí Reservation_Status.
- **Reservation_Approver**: Server-side komponenta měnící status z `pending` na `approved` a iniciující Reservation_Approved_Email.
- **Reservation_Rejecter**: Server-side komponenta měnící status z `pending` na `rejected`, ukládající volitelný důvod a iniciující Reservation_Rejected_Email.
- **Reservation_Canceller**: Server-side komponenta měnící status z `approved` na `cancelled`, ukládající volitelný důvod a iniciující Reservation_Cancelled_Email.
- **Reservation_Editor**: Server-side komponenta zpracovávající úpravu rezervace (čas, služba), validující shodnou logikou jako klientská rezervace přes Slot_Calculator a Advisory_Lock per `business_id`.
- **Reservation_Deleter**: Server-side komponenta provádějící nevratný hard delete řádku v `reservations`.
- **Attendance_Marker**: Server-side komponenta nastavující Attendance_Status rezervace po čase jejího konání.
- **Manual_Reservation_Creator**: Server-side komponenta vytvářející rezervaci jménem majitele s defaultním `status = 'approved'` a bez potvrzovacího e-mailu klientovi.
- **Clients_Roster**: Stránka `/dashboard/clients` s evidencí klientů jednoho podniku odvozenou z rezervací.
- **Client_Detail_View**: Detail jednoho klienta s historií všech jeho rezervací v rámci daného podniku.
- **Client_Upsertor**: Server-side komponenta párující po každé nové rezervaci kontakt klienta proti tabulce `clients` per `business_id` a buď aktualizující existující řádek, nebo vkládající nový.
- **Client_Anonymizer**: Server-side komponenta, která při smazání klienta anonymizuje jeho rezervace (nahradí kontaktní údaje hodnotou „Smazaný klient" / `null`) a smaže řádek klienta — zachovává sloty pro historii obsazenosti (GDPR výmaz, R9.3).
- **CSV_Exporter**: Server-side komponenta vracející CSV soubor s aktuálně vyfiltrovaným seznamem rezervací (sdílí parametry s Reservations_Filter_Bar).
- **Email_Dispatcher**: Sdílená komponenta odesílající transakční e-maily přes Resend (R13 architektury), best-effort, až po commitu DB transakce.
- **Reservation_Approved_Email**: Transakční e-mail klientovi po schválení rezervace.
- **Reservation_Rejected_Email**: Transakční e-mail klientovi po odmítnutí rezervace, s volitelným důvodem.
- **Reservation_Cancelled_Email**: Transakční e-mail klientovi po zrušení rezervace, s volitelným důvodem.
- **Reservation_Modified_Email**: Transakční e-mail klientovi po úpravě rezervace.
- **Slot_Calculator**: Čistá funkce ze specu `services-and-availability` pro výpočet Available_Slot_List. Tato feature ji volá při úpravě a ruční tvorbě rezervace.
- **Available_Slot_List**: Seznam dostupných počátečních časů vrácený Slot_Calculator pro daný `business_id`, datum a službu.
- **Advisory_Lock**: Postgres `pg_advisory_xact_lock(hashtext(business_id))` serializující souběžné zápisy do `reservations` v rámci jednoho podniku (vzor zaveden v `public-business-page`).
- **Denormalized_Client_Contact**: Sloupce `client_name`, `client_phone`, `client_email`, `client_note` přímo v řádku `reservations`.
- **Czech_Locale**: Čeština jako jediný jazyk MVP, časové pásmo Europe/Prague v UI, UTC v DB, měna Kč (R18 architektury).

## Requirements

### Requirement 1: Přístup do dashboardu rezervací

**User Story:** Jako majitel podniku s aktivním předplatným chci mít přístup do dashboardu rezervací, abych mohl spravovat své rezervace a klientelu.

#### Acceptance Criteria

1. WHEN přihlášený majitel s `subscription.status` v množině `{active, grace_period}` otevře `/dashboard/reservations` nebo `/dashboard/clients`, THE Reservations_Dashboard SHALL stránku zobrazit.
2. IF přihlášený majitel s `subscription.status` v množině `{free, expired, deleted_data}` otevře `/dashboard/reservations` nebo `/dashboard/clients`, THEN THE Active_Subscription_Gate SHALL přesměrovat uživatele na stránku se stavem předplatného a Reservations_Dashboard SHALL zůstat nedostupný.
3. IF nepřihlášený uživatel otevře `/dashboard/reservations` nebo `/dashboard/clients`, THEN THE platforma SHALL přesměrovat uživatele na přihlašovací stránku.
4. WHEN Reservations_Dashboard načítá nebo zapisuje data, THE platforma SHALL omezit všechny dotazy na záznamy s `business_id` rovným podniku přihlášeného majitele (R1.1 architektury).
5. IF dojde k pokusu o čtení nebo zápis záznamu s `business_id` odlišným od podniku přihlášeného majitele, THEN THE platforma SHALL operaci odmítnout chybou autorizace (R1.6 architektury).

### Requirement 2: Seznam rezervací — výchozí zobrazení a tabulkový pohled

**User Story:** Jako majitel chci na `/dashboard/reservations` vidět budoucí rezervace seřazené chronologicky, abych měl přehled, co se v podniku bude dít.

#### Acceptance Criteria

1. WHEN majitel otevře `/dashboard/reservations` bez explicitního filtru, THE Reservations_List SHALL ve výchozím stavu zobrazit rezervace s `starts_at >= now()` seřazené podle `starts_at` vzestupně (nejbližší termín první).
2. THE Reservations_Table_View SHALL pro každou rezervaci zobrazit minimálně: datum a počáteční čas v Europe/Prague, název služby, jméno klienta, telefon klienta a Reservation_Status.
3. THE Reservations_Table_View SHALL zobrazit Reservation_Status v češtině podle mapování `pending` → „Čeká na schválení", `approved` → „Schváleno", `rejected` → „Odmítnuto", `cancelled` → „Zrušeno".
4. THE Reservations_Table_View SHALL rezervace se statusem `pending` vizuálně zvýraznit oproti ostatním statusům, aby majitel okamžitě viděl, co čeká na rozhodnutí.
5. WHEN majitel klikne na řádek rezervace nebo na jeho akční tlačítko, THE Reservations_Table_View SHALL otevřít Reservation_Detail_View dané rezervace.
6. IF otevření Reservation_Detail_View selže (síťová chyba nebo rezervace byla mezitím smazána), THEN THE Reservations_List SHALL zobrazit českou chybovou hlášku a ponechat majitele v seznamu.
7. THE Reservations_Table_View SHALL stránkovat výsledek tak, aby jeden request načetl nejvýše 100 řádků, a SHALL poskytnout v UI přechod na další stránku.

### Requirement 3: Seznam rezervací — filtry

**User Story:** Jako majitel chci filtrovat rezervace podle statusu, časového rozsahu a služby, abych rychle našel konkrétní záznamy.

#### Acceptance Criteria

1. THE Reservations_Filter_Bar SHALL nabízet filtr podle Reservation_Status umožňující výběr jedné nebo více hodnot z množiny `{pending, approved, rejected, cancelled}`.
2. THE Reservations_Filter_Bar SHALL nabízet filtr časového rozsahu se dvěma poli: počáteční datum (inkluzivně) a koncové datum (inkluzivně), interpretovaná v Europe/Prague.
3. WHEN majitel zvolí časový rozsah, THE Reservations_List SHALL zobrazit rezervace, jejichž `starts_at` leží uvnitř zvoleného rozsahu, a tato volba SHALL přepsat výchozí pravidlo „pouze budoucí" z požadavku 2.1.
4. THE Reservations_Filter_Bar SHALL nabízet filtr podle služby umožňující výběr jedné nebo více služeb daného podniku.
5. THE Reservations_Filter_Bar SHALL kombinovat aktivní filtry konjunktivně (logické AND) — rezervace SHALL splňovat všechna nastavená kritéria současně.
6. WHEN majitel změní hodnotu kteréhokoli filtru, THE Reservations_List SHALL aktualizovat zobrazený výsledek podle nové sady kritérií.

### Requirement 4: Seznam rezervací — kalendářní pohled

**User Story:** Jako majitel chci přepnout do denního nebo týdenního kalendáře, abych viděl rozložení rezervací v čase.

#### Acceptance Criteria

1. THE Reservations_Calendar_View SHALL nabízet dva režimy: denní (jeden den) a týdenní (sedm dní jednoho kalendářního týdne, pondělí až neděle).
2. THE Reservations_Calendar_View SHALL každou rezervaci vykreslit jako blok ohraničený `starts_at` a `ends_at` v Europe/Prague, s popiskem obsahujícím minimálně název služby a jméno klienta.
3. WHEN majitel klikne na blok rezervace, THE Reservations_Calendar_View SHALL otevřít Reservation_Detail_View dané rezervace.
4. THE Reservations_Calendar_View SHALL umožnit navigaci na předchozí a následující den nebo týden a poskytnout zkratku „Dnes" / „Tento týden".
5. THE Reservations_Calendar_View SHALL zobrazit rezervace všech statusů a rezervace ve stavu `rejected` a `cancelled` SHALL vizuálně odlišit od aktivních (`pending`, `approved`), aby majitel poznal, že nejsou aktivní.
6. WHEN majitel přepne mezi Reservations_Table_View a Reservations_Calendar_View, THE Reservations_List SHALL zachovat aktivní hodnoty filtrů statusu a služby z Reservations_Filter_Bar.

### Requirement 5: Detail rezervace

**User Story:** Jako majitel chci po otevření rezervace vidět všechny její údaje, abych mohl rozhodnout o akci.

#### Acceptance Criteria

1. WHEN majitel otevře Reservation_Detail_View pro existující rezervaci svého podniku, THE Reservation_Detail_View SHALL zobrazit: název služby, datum a čas v Europe/Prague (`starts_at` až `ends_at`), Reservation_Status v češtině, Attendance_Status v češtině, jméno klienta, telefon klienta, e-mail klienta a poznámku, pokud je vyplněna.
2. THE Reservation_Detail_View SHALL zpřístupnit akce odpovídající aktuálnímu Reservation_Status: pro `pending` — Schválit, Odmítnout, Upravit, Smazat; pro `approved` — Zrušit, Upravit, Smazat; pro `rejected` a `cancelled` — Smazat.
3. WHERE `starts_at` rezervace již nastal, THE Reservation_Detail_View SHALL zpřístupnit akce pro nastavení Attendance_Status (Dorazil, Nedorazil) podle požadavku 11.
4. IF majitel otevře Reservation_Detail_View s `id`, které neexistuje nebo nepatří jeho podniku, THEN THE platforma SHALL vrátit stav „nenalezeno" s českou hláškou „Rezervace nebyla nalezena".

### Requirement 6: Schválení rezervace

**User Story:** Jako majitel chci schválit čekající rezervaci jedním krokem, aby klient dostal e-mailem potvrzení.

#### Acceptance Criteria

1. WHEN majitel zvolí akci „Schválit" pro rezervaci se statusem `pending`, THE Reservation_Approver SHALL nastavit `status = 'approved'`.
2. IF rezervace v okamžiku zpracování nemá status `pending`, THEN THE Reservation_Approver SHALL operaci odmítnout, ponechat status beze změny a vrátit českou hlášku „Rezervaci nelze schválit, není ve stavu Čeká na schválení".
3. WHEN Reservation_Approver úspěšně nastaví status na `approved`, THE Email_Dispatcher SHALL odeslat Reservation_Approved_Email klientovi.
4. IF odeslání Reservation_Approved_Email selže, THEN THE platforma SHALL chybu zalogovat a změna statusu SHALL zůstat zachována (R13 architektury, best-effort).

### Requirement 7: Odmítnutí rezervace

**User Story:** Jako majitel chci odmítnout čekající rezervaci s volitelným důvodem, aby klient pochopil, proč termín nedostal.

#### Acceptance Criteria

1. WHEN majitel zvolí akci „Odmítnout" pro rezervaci se statusem `pending`, THE Reservations_Dashboard SHALL nabídnout pole pro volitelný textový důvod odmítnutí.
2. IF zadaný důvod přesahuje 500 znaků, THEN THE Reservations_Dashboard SHALL operaci neumožnit a zobrazit českou hlášku „Důvod smí mít nejvýše 500 znaků".
3. WHEN majitel potvrdí odmítnutí rezervace se statusem `pending`, THE Reservation_Rejecter SHALL nastavit `status = 'rejected'` a uložit zadaný důvod.
4. IF rezervace v okamžiku zpracování nemá status `pending`, THEN THE Reservation_Rejecter SHALL operaci odmítnout a vrátit českou hlášku „Rezervaci nelze odmítnout, není ve stavu Čeká na schválení".
5. WHEN Reservation_Rejecter úspěšně nastaví status na `rejected`, THE Email_Dispatcher SHALL odeslat Reservation_Rejected_Email klientovi obsahující text důvodu, pokud byl zadán.
6. IF odeslání Reservation_Rejected_Email selže, THEN THE platforma SHALL chybu zalogovat a změna statusu SHALL zůstat zachována.

### Requirement 8: Zrušení schválené rezervace

**User Story:** Jako majitel chci zrušit již schválenou rezervaci s volitelným důvodem, aby zůstala v systému jako záznam, ale dál neblokovala kapacitu.

#### Acceptance Criteria

1. WHEN majitel zvolí akci „Zrušit" pro rezervaci se statusem `approved`, THE Reservations_Dashboard SHALL zobrazit potvrzovací dialog s polem pro volitelný textový důvod zrušení.
2. IF zadaný důvod přesahuje 500 znaků, THEN THE Reservations_Dashboard SHALL operaci neumožnit a zobrazit českou hlášku „Důvod smí mít nejvýše 500 znaků".
3. WHEN majitel potvrdí zrušení rezervace se statusem `approved`, THE Reservation_Canceller SHALL nastavit `status = 'cancelled'` a uložit zadaný důvod.
4. IF rezervace v okamžiku zpracování nemá status `approved`, THEN THE Reservation_Canceller SHALL operaci odmítnout a vrátit českou hlášku „Zrušit lze pouze schválenou rezervaci".
5. WHEN Reservation_Canceller úspěšně nastaví status na `cancelled`, THE Email_Dispatcher SHALL odeslat Reservation_Cancelled_Email klientovi obsahující text důvodu, pokud byl zadán.
6. IF odeslání Reservation_Cancelled_Email selže, THEN THE platforma SHALL chybu zalogovat a změna statusu SHALL zůstat zachována.
7. WHEN je rezervace ve stavu `cancelled`, THE Slot_Calculator SHALL ji ignorovat při výpočtu konfliktů (potvrzení souladu s definicí aktivní rezervace v `services-and-availability`).

### Requirement 9: Úprava rezervace

**User Story:** Jako majitel chci u existující rezervace změnit čas nebo službu s ověřením dostupnosti, abych nemusel rušit a zakládat novou.

#### Acceptance Criteria

1. WHEN majitel otevře editaci rezervace, THE Reservation_Editor SHALL umožnit změnu počátečního času (`starts_at`) a služby (`service_id`).
2. WHEN majitel uloží úpravu, THE Reservation_Editor SHALL serverově validovat vstupní pole stejnými pravidly jako klientský rezervační formulář v `public-business-page`.
3. WHEN majitel uloží úpravu měnící `starts_at` nebo `service_id`, THE Reservation_Editor SHALL v jediné DB transakci s Advisory_Lock klíčovaným `business_id` provést v uvedeném pořadí: (a) ověřit existenci a příslušnost služby k podniku, (b) re-fetch aktivních rezervací (`status` v `{pending, approved}`) téhož podniku pro daný den s vyloučením upravované rezervace, (c) zavolat Slot_Calculator a získat Available_Slot_List, (d) ověřit, že nový počáteční čas leží v Available_Slot_List, (e) uložit UPDATE s novým `starts_at` a dopočteným `ends_at = starts_at + service.duration_minutes`.
4. IF v kroku 9.3 (d) nový čas neleží v Available_Slot_List, NEBO IF v kterémkoli kroku 9.3 (a) až (e) validace selže (služba neexistuje nebo nepatří podniku), THEN THE Reservation_Editor SHALL operaci odmítnout, transakci rollbacknout a vrátit českou hlášku „Tento termín není dostupný" spolu s aktualizovaným Available_Slot_List pro UI.
5. THE Reservation_Editor SHALL umožnit úpravu rezervace ve stavech `pending` a `approved`.
6. WHEN Reservation_Editor úspěšně uloží úpravu, THE Email_Dispatcher SHALL odeslat Reservation_Modified_Email klientovi s hodnotami rezervace po úpravě; selhání e-mailu SHALL být zalogováno bez rollbacku úpravy.
7. THE Reservation_Editor SHALL ukládat `starts_at` a `ends_at` v UTC (R18.3 architektury).

### Requirement 10: Smazání rezervace (GDPR hard delete)

**User Story:** Jako majitel chci jednotlivou rezervaci nevratně smazat, abych na žádost klienta nebo pro pořádek odstranil její data.

#### Acceptance Criteria

1. WHEN majitel zvolí akci „Smazat" v Reservation_Detail_View, THE Reservations_Dashboard SHALL zobrazit potvrzovací dialog s českým upozorněním, že akce je nevratná.
2. WHEN majitel potvrdí smazání, THE Reservation_Deleter SHALL provést hard delete řádku v `reservations`.
3. THE Reservation_Deleter SHALL operaci povolit pro libovolný Reservation_Status — žádný stav nepodmiňuje, zda lze rezervaci smazat.
4. THE Reservation_Deleter SHALL po smazání NEodeslat klientovi žádný e-mail.
5. THE Reservation_Deleter SHALL operaci zalogovat do strukturovaného logu s `business_id`, `user_id` a `reservation_id`, bez kontaktních údajů klienta (R20 architektury).

### Requirement 11: Sledování docházky

**User Story:** Jako majitel chci po termínu označit, zda klient dorazil, abych měl přehled o no-show klientech, aniž bych měnil status rezervace.

#### Acceptance Criteria

1. THE platforma SHALL udržovat u každé rezervace samostatné pole Attendance_Status s hodnotami `null`, `attended` a `no_show`, oddělené od Reservation_Status.
2. THE Attendance_Status SHALL mít výchozí hodnotu `null` při vytvoření rezervace.
3. WHERE aktuální čas je pozdější než `starts_at` rezervace, THE Reservation_Detail_View SHALL zpřístupnit akce pro nastavení Attendance_Status na `attended` (Dorazil) nebo `no_show` (Nedorazil).
4. IF aktuální čas je dřívější nebo roven `starts_at` rezervace, THEN THE Reservations_Dashboard SHALL akce pro nastavení Attendance_Status nezpřístupnit.
5. WHEN majitel zvolí akci docházky, THE Attendance_Marker SHALL nastavit Attendance_Status na zvolenou hodnotu (`attended` nebo `no_show`) a SHALL umožnit přepnutí mezi oběma hodnotami i zpět na `null`.
6. THE Attendance_Marker SHALL Reservation_Status zachovat beze změny — nastavení docházky NESMÍ změnit `status` ani odeslat klientovi e-mail.
7. THE Reservations_Table_View a Reservations_Calendar_View SHALL zobrazit Attendance_Status v češtině podle mapování `null` → „—", `attended` → „Dorazil", `no_show` → „Nedorazil".

### Requirement 12: Ruční vytvoření rezervace majitelem

**User Story:** Jako majitel chci v dashboardu ručně založit rezervaci z telefonní objednávky, aby byla vidět ostatním klientům jako obsazený slot.

#### Acceptance Criteria

1. THE Reservations_Dashboard SHALL nabídnout akci „Vytvořit rezervaci", která otevře formulář s poli: služba, datum, počáteční čas, jméno klienta, telefon klienta, e-mail klienta a poznámka.
2. WHEN majitel odešle formulář, THE Manual_Reservation_Creator SHALL serverově validovat všechna pole stejnými pravidly jako klientský rezervační formulář v `public-business-page` (jméno a alespoň jeden kontakt — telefon nebo e-mail — povinné dle R19.2).
3. WHEN majitel odešle formulář, THE Manual_Reservation_Creator SHALL v jediné DB transakci s Advisory_Lock klíčovaným `business_id` provést v uvedeném pořadí: (a) ověřit existenci a příslušnost služby k podniku, (b) re-fetch aktivních rezervací téhož podniku pro daný den, (c) zavolat Slot_Calculator a získat Available_Slot_List, (d) ověřit, že vybraný počáteční čas leží v Available_Slot_List, (e) INSERT nové rezervace se `status = 'approved'` a `ends_at = starts_at + service.duration_minutes`.
4. THE Manual_Reservation_Creator SHALL nastavit `status = 'approved'` nezávisle na hodnotě `business.auto_approve_reservations` — majitel zakládá rezervaci, kterou sám potvrzuje.
5. THE Manual_Reservation_Creator SHALL NEodeslat klientovi žádný potvrzovací e-mail — ruční tvorba nemá klientský potvrzovací krok.
6. IF v kroku 12.3 (d) vybraný čas neleží v Available_Slot_List, THEN THE Manual_Reservation_Creator SHALL operaci odmítnout, transakci rollbacknout a vrátit českou hlášku „Tento termín není dostupný" spolu s aktualizovaným Available_Slot_List.
7. THE Manual_Reservation_Creator SHALL ukládat `starts_at` a `ends_at` v UTC.

### Requirement 13: Evidence klientů — seznam

**User Story:** Jako majitel chci vidět seznam svých klientů odvozený z rezervací, abych poznal stálé zákazníky.

#### Acceptance Criteria

1. WHEN majitel otevře `/dashboard/clients`, THE Clients_Roster SHALL zobrazit seznam klientů daného podniku (řádky tabulky `clients` s `business_id` rovným podniku majitele).
2. THE Clients_Roster SHALL pro každého klienta zobrazit: jméno, telefon, e-mail, počet rezervací klienta v daném podniku a datum poslední rezervace.
3. THE Clients_Roster SHALL evidovat klienty výhradně v rámci jednoho `business_id` — žádné sdílení klientských dat napříč podniky (R19.4 architektury).
4. THE Clients_Roster SHALL stránkovat výsledek tak, aby jeden request načetl nejvýše 100 řádků.

### Requirement 14: Evidence klientů — detail a historie

**User Story:** Jako majitel chci v detailu klienta vidět jeho rezervační historii v mém podniku, abych mohl reagovat na opakující se zákazníky.

#### Acceptance Criteria

1. WHEN majitel otevře Client_Detail_View, THE Client_Detail_View SHALL zobrazit kontaktní údaje klienta (jméno, telefon, e-mail) a chronologický seznam jeho rezervací v daném podniku.
2. THE Client_Detail_View SHALL u každé rezervace v historii zobrazit datum a čas v Europe/Prague, název služby, Reservation_Status v češtině a Attendance_Status v češtině.
3. WHEN majitel klikne na rezervaci v historii klienta, THE Client_Detail_View SHALL otevřít Reservation_Detail_View dané rezervace.
4. THE Client_Detail_View SHALL do historie zahrnout rezervace daného podniku, jejichž `client_phone` se shoduje s telefonem klienta NEBO jejichž `client_email` se shoduje s e-mailem klienta, podle párovacího pravidla z požadavku 15.
5. IF klient nemá v daném podniku žádnou rezervaci, THEN THE Client_Detail_View SHALL místo seznamu zobrazit českou hlášku „Klient zatím nemá žádné rezervace".

### Requirement 15: Upsert klienta po vytvoření rezervace

**User Story:** Jako majitel chci, aby se klienti evidovali automaticky při každé nové rezervaci, abych nemusel vést kartotéku ručně.

#### Acceptance Criteria

1. WHEN je úspěšně vytvořena nová rezervace (z veřejné stránky NEBO z Manual_Reservation_Creator), THE Client_Upsertor SHALL po commitu transakce rezervace provést párování proti tabulce `clients` v rámci stejného `business_id`.
2. THE Client_Upsertor SHALL aplikovat párovací pravidlo v tomto pořadí: (a) WHERE `client_phone` rezervace je vyplněn, THE Client_Upsertor SHALL hledat existujícího klienta podle shody telefonu (po normalizaci — odstranění mezer, pomlček, závorek a volitelného úvodního `+`); (b) IF podle telefonu není nalezen žádný klient NEBO telefon není vyplněn, THEN THE Client_Upsertor SHALL hledat existujícího klienta podle shody e-mailu (case-insensitive); (c) IF není nalezen žádný klient ani podle telefonu, ani podle e-mailu, THEN THE Client_Upsertor SHALL vložit nový řádek do `clients`.
3. WHEN Client_Upsertor najde existujícího klienta, THE Client_Upsertor SHALL aktualizovat `name` na hodnotu `client_name` z rezervace a doplnit chybějící kontakt (`phone` nebo `email`) tam, kde byl dosud prázdný; již vyplněné kontakty SHALL Client_Upsertor NEPŘEPISOVAT a v případě, že rezervace nepřináší žádnou novou hodnotu, SHALL řádek ponechat beze změny.
4. WHEN Client_Upsertor vkládá nového klienta, THE Client_Upsertor SHALL zkopírovat `business_id`, `name`, `phone` a `email` z rezervace.
5. IF samotný upsert selže (DB chyba), THEN THE platforma SHALL chybu zalogovat a původní rezervace SHALL zůstat zachována — selhání upsertu NESMÍ způsobit rollback rezervace.
6. THE Client_Upsertor SHALL provádět operace v `clients` výhradně v rámci `business_id` rezervace (R1.1 architektury).

### Requirement 16: Smazání klienta s anonymizací rezervací (GDPR)

**User Story:** Jako majitel chci na žádost klienta smazat jeho osobní údaje, ale zachovat sloty v historii obsazenosti, abych dostál GDPR a zároveň neztratil obsazenost kapacity.

#### Acceptance Criteria

1. THE Client_Detail_View SHALL nabízet akci „Smazat klienta (GDPR)" s potvrzovacím dialogem v češtině uvádějícím, že akce je nevratná, smaže osobní údaje klienta a jeho rezervace zůstanou zachovány jako anonymizované sloty.
2. WHEN majitel potvrdí smazání klienta, THE Client_Anonymizer SHALL v jediné DB transakci provést: (a) identifikovat rezervace daného podniku, jejichž `client_phone` se shoduje s telefonem klienta NEBO `client_email` se shoduje s e-mailem klienta (párovací pravidlo z požadavku 15.2), (b) u každé takové rezervace nahradit `client_name` hodnotou „Smazaný klient" a `client_phone` i `client_email` hodnotou `null`, (c) hard delete řádku klienta v `clients`.
3. THE Client_Anonymizer SHALL zachovat `service_id`, `starts_at`, `ends_at`, `status` a `attendance` anonymizovaných rezervací beze změny — anonymizace se týká pouze kontaktních údajů, aby sloty dál figurovaly v historii obsazenosti.
4. THE Client_Anonymizer SHALL akci povolit i tehdy, když klient nemá žádnou odpovídající rezervaci (smaže se pouze řádek v `clients`).
5. THE Client_Anonymizer SHALL operaci zalogovat do strukturovaného logu s `business_id`, `user_id`, `client_id` a počtem anonymizovaných rezervací, bez jména, telefonu a e-mailu (R20.2 architektury).

### Requirement 17: CSV export aktuálně vyfiltrovaného seznamu

**User Story:** Jako majitel chci stáhnout CSV se seznamem rezervací odpovídajícím mým aktuálním filtrům, abych si data zpracoval ve vlastním nástroji.

#### Acceptance Criteria

1. THE Reservations_List SHALL nabídnout akci „Exportovat do CSV", která spustí CSV_Exporter se shodnou sadou filtračních parametrů jako aktuálně vykreslený seznam (Reservations_Filter_Bar — požadavek 3).
2. THE CSV_Exporter SHALL vrátit soubor v kódování UTF-8 s BOM, s oddělovačem čárka, a hodnoty obsahující čárku, uvozovky nebo nový řádek SHALL uzavřít do dvojitých uvozovek se zdvojením vnitřních uvozovek (RFC 4180).
3. THE CSV_Exporter SHALL jako první řádek vrátit hlavičku se sloupci minimálně: `id`, `starts_at`, `ends_at`, `service_name`, `client_name`, `client_phone`, `client_email`, `note`, `status`, `attendance`, `created_at`; výstup SHALL být v kódování UTF-8 s BOM (shodně s 17.2) a časová pole SHALL být v ISO 8601 v Europe/Prague s offsetem.
4. THE CSV_Exporter SHALL exportovat pouze řádky s `business_id` rovným podniku majitele (R1.1 architektury).
5. THE CSV_Exporter SHALL exportovat všechny vyfiltrované řádky bez ohledu na stránkování UI.
6. THE CSV_Exporter SHALL operaci zalogovat do strukturovaného logu s `business_id`, `user_id` a počtem exportovaných řádků (R20 architektury).

### Requirement 18: E-mailové notifikace — obsah a odesílání

**User Story:** Jako klient chci e-mail v češtině se srozumitelným obsahem, abych pochopil, co se s mou rezervací stalo.

#### Acceptance Criteria

1. THE Reservation_Approved_Email SHALL být v češtině a obsahovat minimálně: název podniku, název služby, datum a počáteční čas v Europe/Prague a větu „Vaše rezervace byla potvrzena".
2. THE Reservation_Rejected_Email SHALL být v češtině a obsahovat minimálně: název podniku, název služby, datum a počáteční čas v Europe/Prague, větu „Vaše rezervace byla bohužel odmítnuta" a — pokud byl důvod zadán — text důvodu odlišený od vlastního těla e-mailu.
3. THE Reservation_Cancelled_Email SHALL být v češtině a obsahovat minimálně: název podniku, název služby, původní datum a počáteční čas v Europe/Prague, větu „Vaše rezervace byla zrušena podnikem" a — pokud byl důvod zadán — text důvodu odlišený od vlastního těla e-mailu.
4. THE Reservation_Modified_Email SHALL být v češtině a obsahovat minimálně: název podniku, název služby po úpravě, datum a počáteční čas po úpravě v Europe/Prague a větu „Vaše rezervace byla upravena".
5. THE čtyři e-maily (Reservation_Approved_Email, Reservation_Rejected_Email, Reservation_Cancelled_Email, Reservation_Modified_Email) SHALL mít v patičce odkaz na veřejný profil podniku a generický disclaimer „E-mail byl odeslán automaticky platformou mojerezervace.cz".
6. THE Email_Dispatcher SHALL e-maily odesílat přes Resend (R13.1 architektury) až po commitu DB transakce, která odeslání vyvolala — žádný e-mail SHALL nebýt odeslán pro operaci, která se rollbackla.
7. IF odeslání kteréhokoli ze čtyř e-mailů selže, THEN THE platforma SHALL chybu zalogovat se základním kontextem (`reservation_id`, typ e-mailu, error code z Resend) a původní DB operaci SHALL zachovat — selhání e-mailu NESMÍ způsobit rollback (R14.2 architektury).

### Requirement 19: Lokalizace, časové pásmo a měna

**User Story:** Jako český majitel chci celý dashboard v češtině s českými časy a Kč, aby byl srozumitelný (R18 architektury).

#### Acceptance Criteria

1. THE Reservations_Dashboard SHALL veškeré viditelné texty (popisky, hlášky, tlačítka, sloupce, statusy, e-mailové šablony této feature) zobrazovat v češtině.
2. THE Reservations_Dashboard SHALL časy zobrazovat v Europe/Prague ve 24hodinovém formátu (například „09:30").
3. THE Reservations_Dashboard SHALL ceny zobrazovat v Kč.
4. THE platforma SHALL ukládat `starts_at` a `ends_at` v UTC a konverzi do a z Europe/Prague provádět na hraně mezi DB a UI vrstvou (R18.3 architektury).

### Requirement 20: Logování bez citlivých údajů

**User Story:** Jako provozovatel platformy chci strukturované stopy klíčových akcí dashboardu bez osobních údajů klientů, abych dodržel zásadu minimalizace dat (R20 architektury).

#### Acceptance Criteria

1. WHEN je v Reservations_Dashboard úspěšně provedena akce (schválení, odmítnutí, zrušení, úprava, smazání rezervace, ruční tvorba, nastavení docházky, smazání klienta, CSV export), THE platforma SHALL operaci zalogovat s minimálně `business_id`, `user_id`, `action_type` a (kde relevantní) `reservation_id` nebo `client_id`.
2. THE platforma SHALL do strukturovaného aplikačního logu NEzapisovat citlivé údaje klienta (jméno, telefon, e-mail, poznámku).
3. IF zalogování selže, THEN THE primární operace SHALL přesto pokračovat — neúspěšné logování NESMÍ blokovat akci ani ji rollbacknout.
