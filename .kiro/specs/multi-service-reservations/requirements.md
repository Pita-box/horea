# Requirements Document

## Introduction

Tato specifikace pokrývá **kombinovanou rezervaci více služeb v rámci jedné návštěvy** (scénář A). Doposud platí v projektu Horea striktní pravidlo **jedna služba na rezervaci**: tabulka `reservations` má jediný sloupec `service_id`, atomické RPC `create_reservation` (migrace 0015) i ruční zakládání berou jednu službu a počítají časový interval z délky této jedné služby. Tato feature rozšiřuje rezervaci tak, aby klient mohl vybrat **více služeb najednou** a vznikla z nich **jedna rezervace** zabírající **jeden souvislý časový blok** rovný **součtu délek** vybraných služeb, s **celkovou cenou** rovnou **součtu cen** vybraných služeb.

Feature **pokrývá**:

- Rozšíření kroku 1 veřejného rezervačního formuláře z výběru jedné služby (single-select) na výběr více služeb (multi-select) se zachováním pořadí výběru.
- Výpočet kombinované délky a kombinované ceny rezervace a jejich zobrazení v průběžném souhrnu i v kroku 5 (potvrzení).
- Výpočet dostupných slotů (`Slot_Calculator`, `loadAvailableSlots`, `Available_Slots_Service`) pro **kombinovanou délku** namísto délky jedné služby.
- Atomické vytvoření kombinované rezervace (rozšíření `create_reservation` a `create_manual_reservation`) zachovávající advisory lock per `business_id` a overlap re-check pod zámkem.
- Perzistenci množiny služeb rezervace (`Reservation_Service_Set`) a její uspořádání.
- Chování volitelného výběru zaměstnance při více službách.
- Úpravu (`Reservation_Editor`) a rušení/odmítání/mazání kombinované rezervace.
- Zpětnou kompatibilitu existujících jednoslužbových rezervací.
- Zobrazení kombinované rezervace na veřejné stránce, v souhrnu, v detailu rezervace v dashboardu, v transakčních e-mailech a v CSV exportu.

Feature **nepokrývá**:

- Více samostatných termínů v rámci jedné objednávky (scénář B — košík nezávislých rezervací). Tato feature řeší výhradně **jeden souvislý blok**.
- Změnu algoritmu výpočtu slotů jako takového (spec `services-and-availability`); mění se pouze vstupní délka předaná `Slot_Calculator`.
- Mezery / pauzy mezi službami uvnitř bloku (blok je souvislý součet délek bez prodlev).
- Per-službu různé časy začátku nebo různé zaměstnance v rámci jednoho bloku nad rámec rozhodnutí v této specifikaci.
- CRUD služeb, otevírací dobu a stavový automat předplatného (jiné specy).

Návaznost na existující specy: `public-business-page` definuje `Reservation_Form`, `Reservation_Submission_Handler`, vzor advisory locku per `business_id` a `Reservation_Conflict`; `services-and-availability` poskytuje čistou funkci `Slot_Calculator`; `reservation-management` definuje `Reservation_Editor`, `Manual_Reservation_Creator`, `CSV_Exporter`, `Email_Dispatcher` a docházku. Platformové požadavky z `architecture/requirements.md`: **R1** (multi-tenancy / RLS na `business_id`), **R13** (transakční e-maily best-effort), **R18** (čeština, Kč, Europe/Prague v UI, UTC v DB).

## Rozhodnutí k otevřeným otázkám (k revizi)

Tato feature obsahuje produktová rozhodnutí, která vyplynula z otevřených otázek v zadání. Jsou zapracována přímo do požadavků níže; tato sekce je shrnuje pro revizi a případnou úpravu:

- **D1 — Celková délka a cena:** Kombinovaná délka = součet `duration_minutes` vybraných služeb; kombinovaná cena = součet `price_czk` vybraných služeb (požadavky 2, 3).
- **D2 — Pořadí služeb:** Služby se v bloku řadí v pořadí, v jakém je klient vybral, a toto pořadí se persistuje (požadavek 4).
- **D3 — Počet služeb:** Minimálně 1, nejvýše `MAX_SERVICES_PER_RESERVATION = 10` služeb na rezervaci (požadavek 5).
- **D4 — Zaměstnanec:** Jeden zaměstnanec na celou návštěvu (jeden `employee_id` pro celou rezervaci); volitelně lze vybrat pouze zaměstnance, který umí **všechny** vybrané služby (průnik `service_employees`) (požadavek 8).
- **D5 — Úprava:** `Reservation_Editor` umožní změnit množinu služeb; délka, cena, `ends_at` a dostupnost slotu se přepočítají (požadavek 9).
- **D6 — Rušení/odmítání/mazání:** Akce platí pro **celou** rezervaci; částečné zrušení jednotlivé služby není podporováno (požadavek 10).
- **D7 — Zpětná kompatibilita:** Existující rezervace s jediným `service_id` se chovají jako kombinovaná rezervace s právě jednou službou; zobrazení, úprava i export zůstávají funkční (požadavek 11).
- **D8 — CSV export:** Služby se exportují v jednom sloupci spojené oddělovačem ` + ` (mezera-plus-mezera) v uloženém pořadí; přidávají se sloupce kombinované délky a kombinované ceny (požadavek 14). Oddělovač ` + ` se uvnitř buňky používá záměrně místo `; `, protože český MS Excel používá středník `;` jako oddělovač sloupců (kvůli desetinné čárce u čísel) — spojení služeb pomocí `; ` by Excel chybně rozdělil do více sloupců a rozbil tabulku.

## Glossary

- **Multi_Service_Reservation**: Rezervace, která obsahuje jednu nebo více služeb v jednom souvislém časovém bloku jedné návštěvy. Po zavedení této feature je každá rezervace Multi_Service_Reservation (jednoslužbová rezervace je její mezní případ s právě jednou službou).
- **Reservation_Service_Set**: Persistovaná uspořádaná množina služeb připojených k jedné rezervaci, včetně pořadí (`position`) a snapshotu délky a ceny každé služby v okamžiku vytvoření rezervace.
- **Selected_Service_List**: Uspořádaný seznam služeb vybraných klientem v kroku 1 `Reservation_Form`, v pořadí výběru.
- **Combined_Duration**: Celková délka rezervace v minutách, rovná součtu `duration_minutes` všech služeb v Reservation_Service_Set.
- **Combined_Price**: Celková cena rezervace v Kč, rovná součtu `price_czk` všech služeb v Reservation_Service_Set.
- **MAX_SERVICES_PER_RESERVATION**: Konstanta určující nejvyšší povolený počet služeb v jedné rezervaci. Hodnota = 10.
- **MIN_SERVICES_PER_RESERVATION**: Konstanta určující nejnižší povolený počet služeb v jedné rezervaci. Hodnota = 1.
- **Reservation_Form**: Pětikrokový veřejný rezervační formulář (služba → datum → čas → kontakt → potvrzení) ze specu `public-business-page`.
- **Service_Selection_Step**: Krok 1 `Reservation_Form`, ve kterém klient vybírá služby.
- **Reservation_Summary**: Průběžný souhrn a krok 5 `Reservation_Form`, který zobrazuje vybrané služby, Combined_Duration a Combined_Price před odesláním.
- **Slot_Calculator**: Čistá funkce ze specu `services-and-availability` počítající Available_Slot_List z otevírací doby, délky a aktivních rezervací.
- **Available_Slot_List**: Seznam dostupných počátečních časů vrácený `Slot_Calculator` pro daný podnik, datum a délku rezervace.
- **Reservation_Submission_Handler**: Server-side komponenta (`ReservationCreator`, `create_reservation`) provádějící finální validaci a atomický zápis rezervace z veřejné stránky.
- **Manual_Reservation_Creator**: Server-side komponenta (`create_manual_reservation`) vytvářející rezervaci jménem majitele se `status = 'approved'` a bez potvrzovacího e-mailu klientovi.
- **Reservation_Editor**: Server-side komponenta upravující existující rezervaci (čas, množina služeb) s revalidací dostupnosti slotu.
- **Advisory_Lock**: Postgres `pg_advisory_xact_lock(hashtext(business_id))` serializující souběžné zápisy do `reservations` v rámci jednoho podniku.
- **Reservation_Conflict**: Stav, kdy slot vybraný klientem již není v okamžiku odeslání dostupný (překryv s aktivní rezervací při `allow_parallel_slots = false`).
- **Assigned_Employee**: Volitelně vybraný zaměstnanec přiřazený k celé rezervaci přes `reservations.employee_id`.
- **Service_Employees**: M:N vazba `service_employees(service_id, employee_id)` určující, kteří zaměstnanci umí danou službu. Služba bez řádku v Service_Employees = umí ji všichni zaměstnanci.
- **CSV_Exporter**: Server-side komponenta vracející CSV soubor s vyfiltrovaným seznamem rezervací.
- **Email_Dispatcher**: Sdílená komponenta odesílající transakční e-maily přes Resend, best-effort, po commitu transakce.
- **Reservation_Confirmation_Email**: Transakční e-mail klientovi potvrzující vytvořenou rezervaci.
- **Reservation_Notification_Email**: Transakční e-mail majiteli o nové rezervaci.
- **Czech_Locale**: Čeština jako jediný jazyk MVP, časové pásmo Europe/Prague v UI, UTC v DB, měna Kč (R18 architektury).

## Requirements

### Requirement 1: Výběr více služeb v rezervačním formuláři

**User Story:** Jako klient chci při rezervaci vybrat více služeb najednou, abych je absolvoval během jediné návštěvy v jednom termínu.

#### Acceptance Criteria

1. THE Service_Selection_Step SHALL umožnit klientovi vybrat více služeb daného podniku do Selected_Service_List.
2. WHEN klient zvolí dosud nevybranou službu, THE Service_Selection_Step SHALL přidat tuto službu na konec Selected_Service_List.
3. WHEN klient zvolí již vybranou službu, THE Service_Selection_Step SHALL odebrat tuto službu ze Selected_Service_List.
4. THE Service_Selection_Step SHALL zobrazit u každé služby její název, délku v minutách a cenu v Kč, přičemž služby s cenou 0 Kč SHALL zobrazit bez ceny.
5. WHILE Selected_Service_List obsahuje méně než MIN_SERVICES_PER_RESERVATION služeb, THE Service_Selection_Step SHALL ponechat přechod do kroku 2 nedostupný.
6. IF Selected_Service_List po přidání služby přesáhne MAX_SERVICES_PER_RESERVATION, THEN THE Service_Selection_Step SHALL přidání odmítnout a zobrazit českou hlášku „Najednou lze vybrat nejvýše 10 služeb".
7. IF podnik nemá žádnou rezervovatelnou službu, THEN THE Service_Selection_Step SHALL místo výběru zobrazit českou hlášku „Tento podnik zatím nemá žádné rezervovatelné služby".

### Requirement 2: Výpočet kombinované délky

**User Story:** Jako klient chci, aby rezervace zabrala jeden časový blok odpovídající všem vybraným službám, aby na ně byl vyhrazen dostatečný čas.

#### Acceptance Criteria

1. THE platforma SHALL stanovit Combined_Duration jako součet `duration_minutes` všech služeb v Reservation_Service_Set.
2. WHEN je rezervace zapsána, THE Reservation_Submission_Handler SHALL nastavit `ends_at` rovno `starts_at` plus Combined_Duration.
3. WHEN se změní Selected_Service_List, THE Reservation_Form SHALL přepočítat Combined_Duration podle aktuálního obsahu Selected_Service_List.

### Requirement 3: Výpočet kombinované ceny

**User Story:** Jako klient chci vidět celkovou cenu za všechny vybrané služby, abych věděl, kolik za návštěvu zaplatím.

#### Acceptance Criteria

1. THE platforma SHALL stanovit Combined_Price jako součet `price_czk` všech služeb v Reservation_Service_Set.
2. WHEN se změní Selected_Service_List, THE Reservation_Form SHALL přepočítat Combined_Price podle aktuálního obsahu Selected_Service_List.
3. WHERE Combined_Price je rovna 0 Kč, THE Reservation_Summary SHALL Combined_Price nezobrazit.

### Requirement 4: Pořadí služeb v rezervaci

**User Story:** Jako klient chci, aby pořadí vybraných služeb zůstalo zachované, aby návštěva probíhala v očekávaném sledu.

#### Acceptance Criteria

1. THE platforma SHALL uchovat pořadí služeb v Reservation_Service_Set shodné s pořadím výběru v Selected_Service_List.
2. WHEN je rezervace zapsána, THE Reservation_Submission_Handler SHALL uložit každé službě v Reservation_Service_Set její pozici (`position`) odpovídající pořadí výběru.
3. THE Reservation_Summary SHALL zobrazit služby v uloženém pořadí.

### Requirement 5: Omezení počtu služeb na rezervaci

**User Story:** Jako provozovatel chci omezit počet služeb v jedné rezervaci, aby kombinovaný blok nebyl nesmyslně dlouhý.

#### Acceptance Criteria

1. THE Reservation_Submission_Handler SHALL přijmout rezervaci pouze tehdy, když počet služeb v Reservation_Service_Set je v rozsahu od MIN_SERVICES_PER_RESERVATION do MAX_SERVICES_PER_RESERVATION včetně.
2. IF počet služeb v zaslané rezervaci je menší než MIN_SERVICES_PER_RESERVATION, THEN THE Reservation_Submission_Handler SHALL operaci odmítnout chybou validace a vrátit českou hlášku „Vyberte alespoň jednu službu".
3. IF počet služeb v zaslané rezervaci je větší než MAX_SERVICES_PER_RESERVATION, THEN THE Reservation_Submission_Handler SHALL operaci odmítnout chybou validace a vrátit českou hlášku „Najednou lze vybrat nejvýše 10 služeb".
4. THE Manual_Reservation_Creator SHALL uplatnit shodné rozsahové omezení počtu služeb jako Reservation_Submission_Handler.

### Requirement 6: Výpočet dostupných slotů pro kombinovanou délku

**User Story:** Jako klient chci v kroku 3 vidět jen termíny, do kterých se vejde celý kombinovaný blok, aby rezervace nekolidovala s jinými.

#### Acceptance Criteria

1. WHEN Reservation_Form žádá o dostupné termíny pro Selected_Service_List a datum, THE platforma SHALL předat `Slot_Calculator` délku rovnou Combined_Duration namísto délky jedné služby.
2. THE platforma SHALL zařadit počáteční čas do Available_Slot_List pouze tehdy, když se interval `[start, start + Combined_Duration)` vejde do otevírací doby daného dne.
3. WHILE `allow_parallel_slots = false`, THE platforma SHALL z Available_Slot_List vyloučit počáteční časy, jejichž interval `[start, start + Combined_Duration)` se překrývá s intervalem aktivní rezervace (`status` v `{pending, approved}`).
4. IF Selected_Service_List je prázdný, THEN THE platforma SHALL vrátit prázdný Available_Slot_List.

### Requirement 7: Atomické vytvoření kombinované rezervace

**User Story:** Jako klient chci, aby se kombinovaná rezervace vytvořila atomicky a nedošlo k dvojí rezervaci stejného bloku, aby byl termín spolehlivě můj.

#### Acceptance Criteria

1. WHEN klient odešle rezervaci v kroku 5, THE Reservation_Submission_Handler SHALL serverově ověřit, že každá služba v Reservation_Service_Set existuje a patří danému podniku.
2. WHEN Reservation_Submission_Handler zapisuje rezervaci, THE Reservation_Submission_Handler SHALL v jediné DB transakci s Advisory_Lock klíčovaným `business_id` provést v uvedeném pořadí: (a) ověřit publikovanost podniku, (b) ověřit příslušnost všech služeb k podniku, (c) provést overlap re-check intervalu `[starts_at, starts_at + Combined_Duration)` proti aktivním rezervacím, (d) pokračovat ke kroku (e) pouze tehdy, když re-check nenašel žádnou kolizi, (e) vložit řádek rezervace a všechny řádky Reservation_Service_Set.
3. IF v kroku 7.2 (c) při `allow_parallel_slots = false` interval koliduje s aktivní rezervací, THEN THE Reservation_Submission_Handler SHALL transakci rollbacknout a vrátit Reservation_Conflict s českou hláškou „Tento termín byl právě obsazen, vyberte prosím jiný" spolu s aktualizovaným Available_Slot_List.
4. THE Reservation_Submission_Handler SHALL uložit `starts_at` a `ends_at` v UTC.
5. THE Reservation_Submission_Handler SHALL uložit u každé služby v Reservation_Service_Set snapshot její délky a ceny platné v okamžiku zápisu.
6. WHEN je zápis úspěšný, THE Reservation_Submission_Handler SHALL vrátit klientovi Reservation_Status (`pending` nebo `approved`) podle `business.auto_approve_reservations`.

### Requirement 8: Výběr zaměstnance při více službách

**User Story:** Jako klient chci u kombinované rezervace volitelně vybrat jednoho zaměstnance, aby mě obsloužila stejná osoba po celou návštěvu.

#### Acceptance Criteria

1. WHERE podnik má povolený výběr zaměstnance, THE Reservation_Form SHALL umožnit výběr nejvýše jednoho Assigned_Employee pro celou rezervaci.
2. WHERE Selected_Service_List obsahuje více služeb, THE Reservation_Form SHALL nabídnout k výběru pouze zaměstnance, kteří umí všechny služby v Selected_Service_List (průnik Service_Employees), přičemž služba bez řádku v Service_Employees se považuje za umět všemi zaměstnanci.
3. WHEN klient změní Selected_Service_List tak, že dříve vybraný Assigned_Employee už neumí všechny vybrané služby, THE Reservation_Form SHALL výběr tohoto zaměstnance zrušit.
4. THE Reservation_Form SHALL ponechat výběr Assigned_Employee nepovinný — rezervaci lze dokončit bez vybraného zaměstnance.
5. WHEN je rezervace s vybraným Assigned_Employee zapsána, THE Reservation_Submission_Handler SHALL uložit `employee_id` na úrovni celé rezervace.

### Requirement 9: Úprava kombinované rezervace

**User Story:** Jako majitel chci u existující rezervace změnit čas i množinu služeb s ověřením dostupnosti, abych nemusel rušit a zakládat novou.

#### Acceptance Criteria

1. WHEN majitel otevře editaci rezervace, THE Reservation_Editor SHALL umožnit změnu počátečního času (`starts_at`) a obsahu Reservation_Service_Set.
2. WHEN majitel uloží úpravu, THE Reservation_Editor SHALL přepočítat Combined_Duration, Combined_Price a `ends_at = starts_at + Combined_Duration` z aktuálního Reservation_Service_Set.
3. WHEN majitel uloží úpravu, THE Reservation_Editor SHALL v jediné DB transakci s Advisory_Lock klíčovaným `business_id` ověřit příslušnost všech služeb k podniku, provést overlap re-check intervalu `[starts_at, starts_at + Combined_Duration)` s vyloučením upravované rezervace a uložit nový Reservation_Service_Set i nové časy.
4. IF nový interval koliduje s aktivní rezervací NEBO některá služba nepatří podniku, THEN THE Reservation_Editor SHALL transakci rollbacknout a vrátit českou hlášku „Tento termín není dostupný" spolu s aktualizovaným Available_Slot_List.
5. WHEN Reservation_Editor provádí overlap re-check, THE Reservation_Editor SHALL vyloučit z kontroly původní interval upravované rezervace, aby překryv rezervace se sebou samou nebyl vyhodnocen jako kolize.
6. THE Reservation_Editor SHALL uplatnit shodné rozsahové omezení počtu služeb (MIN_SERVICES_PER_RESERVATION až MAX_SERVICES_PER_RESERVATION) jako Reservation_Submission_Handler.

### Requirement 10: Rušení, odmítnutí a smazání kombinované rezervace

**User Story:** Jako majitel chci rušit, odmítat nebo mazat rezervaci jako celek, abych pracoval s jednou návštěvou jako s jedním záznamem.

#### Acceptance Criteria

1. WHEN majitel zruší, odmítne nebo smaže Multi_Service_Reservation, THE platforma SHALL aplikovat akci na celou rezervaci včetně všech služeb v Reservation_Service_Set.
2. THE platforma SHALL ponechat výběr jednotlivých služeb ke zrušení nedostupný — částečné zrušení jedné služby z kombinované rezervace SHALL platforma neumožnit.
3. WHEN je rezervace smazána (hard delete), THE platforma SHALL odstranit i všechny navázané řádky Reservation_Service_Set.

### Requirement 11: Zpětná kompatibilita jednoslužbových rezervací

**User Story:** Jako majitel chci, aby dříve vytvořené jednoslužbové rezervace zůstaly platné a čitelné, aby přechod na kombinované rezervace nenarušil historii.

#### Acceptance Criteria

1. THE platforma SHALL považovat existující rezervaci s jedinou službou za Multi_Service_Reservation s Reservation_Service_Set o velikosti jedna.
2. WHEN je zobrazena, upravena nebo exportována existující jednoslužbová rezervace, THE platforma SHALL ji zpracovat shodnými pravidly jako kombinovanou rezervaci.
3. THE platforma SHALL pro existující jednoslužbovou rezervaci stanovit Combined_Duration a Combined_Price z její jediné služby.

### Requirement 12: Zobrazení kombinované rezervace na veřejné stránce a v souhrnu

**User Story:** Jako klient chci v souhrnu před odesláním vidět všechny vybrané služby, celkovou délku a celkovou cenu, abych potvrdil správnost rezervace.

#### Acceptance Criteria

1. THE Reservation_Summary SHALL zobrazit všechny služby ze Selected_Service_List v uloženém pořadí, u každé název a délku v minutách.
2. THE Reservation_Summary SHALL zobrazit Combined_Duration jako celkovou délku rezervace.
3. WHERE Combined_Price je větší než 0 Kč, THE Reservation_Summary SHALL zobrazit Combined_Price jako celkovou cenu.
4. THE Reservation_Summary SHALL zobrazit jeden časový blok (datum, počáteční čas a koncový čas) v Europe/Prague.

### Requirement 13: Detail kombinované rezervace v dashboardu

**User Story:** Jako majitel chci v detailu rezervace vidět všechny její služby, celkovou délku a cenu, abych návštěvu připravil.

#### Acceptance Criteria

1. WHEN majitel otevře detail Multi_Service_Reservation, THE platforma SHALL zobrazit všechny služby v Reservation_Service_Set v uloženém pořadí.
2. THE platforma SHALL v detailu zobrazit Combined_Duration a Combined_Price.
3. THE platforma SHALL v detailu zobrazit jeden časový blok (`starts_at` až `ends_at`) v Europe/Prague.
4. WHERE je k rezervaci přiřazen Assigned_Employee, THE platforma SHALL v detailu zobrazit jeho jméno.

### Requirement 14: CSV export kombinovaných rezervací

**User Story:** Jako majitel chci v CSV exportu vidět všechny služby rezervace a její celkovou cenu i délku, abych měl úplná data ke zpracování.

#### Acceptance Criteria

1. THE CSV_Exporter SHALL pro každou rezervaci vyexportovat jeden řádek, ve kterém SHALL názvy všech služeb v Reservation_Service_Set spojit do jednoho pole oddělovačem ` + ` (mezera-plus-mezera) v uloženém pořadí (např. „Dámský střih + Mytí + Foukání").
2. THE CSV_Exporter SHALL doplnit sloupce pro Combined_Duration v minutách a Combined_Price v Kč.
3. WHEN filtr služby v Reservation_Filter_Bar odpovídá kterékoli službě v Reservation_Service_Set rezervace, THE CSV_Exporter SHALL tuto rezervaci do exportu zahrnout.
4. THE CSV_Exporter SHALL zahrnout rezervaci do exportu pouze tehdy, když má `business_id` rovné podniku majitele A ZÁROVEŇ splňuje všechny aktivní filtry Reservation_Filter_Bar.

### Requirement 15: Ruční vytvoření kombinované rezervace majitelem

**User Story:** Jako majitel chci ručně založit kombinovanou rezervaci z telefonní objednávky, aby zabrala správný časový blok jako obsazený slot.

#### Acceptance Criteria

1. THE Manual_Reservation_Creator SHALL umožnit výběr více služeb do Reservation_Service_Set se zachováním pořadí.
2. WHEN majitel odešle formulář, THE Manual_Reservation_Creator SHALL v jediné DB transakci s Advisory_Lock klíčovaným `business_id` ověřit příslušnost všech služeb k podniku, provést overlap re-check intervalu `[starts_at, starts_at + Combined_Duration)` a vložit rezervaci se `status = 'approved'` a `ends_at = starts_at + Combined_Duration`.
3. THE Manual_Reservation_Creator SHALL stanovit Combined_Duration a Combined_Price z vybraných služeb shodně s Reservation_Submission_Handler.
4. THE Manual_Reservation_Creator SHALL NEodeslat klientovi potvrzovací e-mail.
5. IF vybraný interval koliduje s aktivní rezervací, THEN THE Manual_Reservation_Creator SHALL transakci rollbacknout a vrátit českou hlášku „Tento termín není dostupný" spolu s aktualizovaným Available_Slot_List.

### Requirement 16: Transakční e-maily s více službami

**User Story:** Jako klient a majitel chci v potvrzovacích a notifikačních e-mailech vidět všechny služby rezervace, celkovou délku a cenu, abych měl úplnou informaci o termínu.

#### Acceptance Criteria

1. WHEN je úspěšně vytvořena Multi_Service_Reservation z veřejné stránky, THE Email_Dispatcher SHALL odeslat klientovi Reservation_Confirmation_Email obsahující všechny služby v uloženém pořadí, Combined_Duration a Combined_Price.
2. WHEN je úspěšně vytvořena Multi_Service_Reservation z veřejné stránky, THE Email_Dispatcher SHALL odeslat majiteli Reservation_Notification_Email obsahující všechny služby v uloženém pořadí, Combined_Duration a Combined_Price.
3. THE Email_Dispatcher SHALL zobrazit jeden časový blok (datum, počáteční a koncový čas) v Europe/Prague.
4. IF odeslání kteréhokoli e-mailu selže, THEN THE platforma SHALL chybu zalogovat a vytvořená rezervace SHALL zůstat zachována (best-effort, R13 architektury).
5. IF samotné logování selže, THEN THE platforma SHALL vytvořenou rezervaci ponechat zachovanou — selhání logování NESMÍ zablokovat ani zrušit rezervaci.

### Requirement 17: Lokalizace, měna a časové pásmo

**User Story:** Jako klient chci kombinovanou rezervaci vidět v češtině, v Kč a v místním čase, aby byla srozumitelná.

#### Acceptance Criteria

1. THE platforma SHALL zobrazovat veškerý text kombinované rezervace v češtině.
2. THE platforma SHALL zobrazovat Combined_Price v Kč.
3. THE platforma SHALL zobrazovat časy kombinované rezervace v Europe/Prague a ukládat `starts_at` a `ends_at` v UTC.
