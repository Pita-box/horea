# Requirements Document

## Introduction

Tato specifikace pokrývá **správu služeb, otevírací doby a parametrů dostupnosti** v dashboardu majitele podniku **po dokončení onboardingu**. Onboarding wizard (spec `auth-onboarding`) zakládá první službu a první otevírací dobu jako součást atomického commitu kroku 6 — tato feature řeší **veškerou následnou údržbu** těchto entit a navazující výpočet dostupných slotů pro veřejné rezervační rozhraní.

Feature pokrývá:

- CRUD služeb (název, trvání, cena, popis) s validací doménových mezí.
- CASCADE mazání rezervací při smazání služby + potvrzovací dialog.
- Správu otevírací doby per den v týdnu (Po–Ne), vč. dne označeného jako zavřeno.
- Přepínač `allow_parallel_slots` (paralelní rezervace ve stejném slotu).
- Přepínač `auto_approve_reservations` (automatické schvalování rezervací).
- Toleranci 15 minut pro službu končící po `closes_at`.
- Pravidlo, že **dotykové sloty nejsou konflikt** (10:00–11:00 a 11:00–12:00 jsou OK).
- Výpočet seznamu dostupných počátečních časů pro daný den + službu.
- Propagaci změn do veřejné stránky podniku přes ISR revalidaci.

Feature **nepokrývá**:

- CRUD rezervací (řeší `reservation-management`).
- Veřejné UI pro výběr slotu klientem (řeší `public-business-page`).
- Speciální dny / svátky jako samostatnou entitu (architecture v2).
- Numerickou kapacitu paralelních slotů (architecture v2).

Návaznost na platformové požadavky z `architecture/requirements.md`: R1 (multi-tenancy / RLS), R2 (výkon), R3 (provozní jednoduchost), R15 (auto-approve toggle), R16 (paralelní sloty toggle), R18 (česká lokalizace), R20 (logování).

## Glossary

- **Service**: Služba nabízená podnikem, charakterizovaná názvem, trváním v minutách, cenou v Kč a volitelným popisem. Patří právě jednomu podniku (`business_id`).
- **Service_Manager**: Komponenta zodpovědná za CRUD operace nad službami a za vynucení validačních pravidel pro služby.
- **Opening_Hours**: Otevírací doba podniku per den v týdnu (Po–Ne); každý den je buď zavřený, nebo má dvojici `opens_at` < `closes_at`.
- **Opening_Hours_Manager**: Komponenta zodpovědná za správu otevírací doby a vynucení invariantu, že alespoň jeden den v týdnu je otevřený.
- **Availability_Settings**: Dvě boolean nastavení podniku — `allow_parallel_slots` a `auto_approve_reservations`.
- **Availability_Settings_Manager**: Komponenta zodpovědná za změnu těchto dvou přepínačů.
- **Slot**: Časový interval rezervace `[start, end)`, kde `end - start = service.duration_minutes`. Slot je polootevřený interval — okamžik `end` do slotu nepatří.
- **Slot_Grid**: Per-podniková mřížka možných počátečních časů slotů, krokovaná po 15 minutách začínajíc v `opens_at` daného dne.
- **Closes_At_Tolerance**: Tolerance 15 minut, o kterou smí slot přesáhnout `closes_at` (slot končící v 17:15 je povolen, když `closes_at = 17:00`; slot končící v 17:16 už ne).
- **Slot_Calculator**: Komponenta vracející seznam dostupných počátečních časů pro daný den a službu s ohledem na otevírací dobu, toleranci, mřížku a existující rezervace.
- **Conflict**: Slot S1 a S2 jsou v konfliktu právě tehdy, když jejich polootevřené intervaly mají neprázdný průnik. Sloty 10:00–11:00 a 11:00–12:00 nejsou v konfliktu (sdílejí pouze hraniční bod 11:00).
- **Active_Reservation**: Rezervace ve stavu `pending` nebo `approved`. Rezervace ve stavu `rejected` nebo `cancelled` se pro detekci konfliktů ignorují.
- **Cascade_Delete**: Operace, která při smazání služby smaže i všechny rezervace odkazující na tuto službu (`ON DELETE CASCADE`).
- **Public_Page_Revalidator**: Komponenta, která po změně služeb nebo otevírací doby provede revalidaci veřejné stránky podniku (Next.js ISR `revalidatePath`).
- **Day_Of_Week**: Hodnota 1–7 odpovídající dnům Pondělí–Neděle (ISO 8601).

## Requirements

### Requirement 1: CRUD služeb

**User Story:** Jako majitel podniku chci spravovat seznam svých služeb v dashboardu, abych mohl reflektovat změny svého obchodního provozu.

#### Acceptance Criteria

1. WHEN majitel podniku otevře sekci „Služby" v dashboardu, THE Service_Manager SHALL vrátit seznam všech služeb daného podniku seřazený podle data vytvoření vzestupně.
2. WHEN majitel podniku potvrdí formulář pro vytvoření nové služby s validními daty, THE Service_Manager SHALL vytvořit nový záznam služby vázaný na `business_id` přihlášeného majitele, zobrazit jej v seznamu a vrátit úspěšný výsledek operace.
3. WHEN majitel podniku potvrdí formulář pro úpravu existující služby s validními daty, THE Service_Manager SHALL aktualizovat odpovídající záznam a vrátit úspěšný výsledek operace.
4. WHEN majitel podniku potvrdí smazání služby, THE Service_Manager SHALL záznam služby z databáze úplně odstranit (hard delete) a vrátit úspěšný výsledek operace.
5. IF majitel podniku se pokusí přistoupit ke službě s `business_id` jiného podniku, THEN THE Service_Manager SHALL operaci odmítnout a vrátit chybu autorizace.

### Requirement 2: Validace polí služby

**User Story:** Jako majitel podniku chci, aby systém odmítl nesmyslné hodnoty u služby, aby moje veřejná nabídka zůstala konzistentní a abych nedostával rezervace na špatně zadané služby.

#### Acceptance Criteria

1. IF název služby je prázdný řetězec po odstranění whitespace, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Název služby je povinný".
2. IF název služby přesahuje 100 znaků, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Název služby smí mít nejvýše 100 znaků".
3. IF trvání služby není kladné celé číslo (tj. je nulové, záporné, desetinné nebo není číslo), THEN THE Service_Manager SHALL operaci odmítnout s chybou „Trvání musí být kladné celé číslo minut".
4. IF trvání služby není násobkem 5, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Trvání musí být násobek 5 minut"; kontrola násobku 5 SHALL probíhat až po kontrole kladného celého čísla, aby nulové trvání (násobek 5) bylo odmítnuto kontrolou z kritéria 3.
5. IF trvání služby je menší než 5 minut nebo větší než 480 minut, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Trvání musí být v rozsahu 5 až 480 minut".
6. IF cena služby je záporná, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Cena nesmí být záporná".
7. IF cena služby přesahuje 100 000 Kč, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Cena smí být nejvýše 100 000 Kč".
8. IF popis služby přesahuje 500 znaků, THEN THE Service_Manager SHALL operaci odmítnout s chybou „Popis smí mít nejvýše 500 znaků".
9. WHERE popis služby není vyplněn, THE Service_Manager SHALL službu uložit s prázdným / NULL popisem bez chyby; validace popisu SHALL být nezávislá na ostatních polích.
10. THE Service_Manager SHALL provádět všechny validace serverově nezávisle na klientské validaci.

### Requirement 3: Cascade smazání služby

**User Story:** Jako majitel podniku chci být varován, že smazání služby smaže i všechny související rezervace, aby mě nepřekvapila ztráta historických nebo budoucích rezervací.

#### Acceptance Criteria

1. WHEN majitel podniku iniciuje mazání služby v dashboardu, THE Service_Manager SHALL zobrazit potvrzovací dialog s výslovným upozorněním, že smazání služby smaže i všechny rezervace na tuto službu.
2. WHEN potvrzovací dialog je zobrazen, THE dialog SHALL uvádět počet rezervací, které budou smazány společně se službou.
3. WHEN majitel podniku zruší potvrzovací dialog, THE Service_Manager SHALL službu ponechat beze změny.
4. WHEN majitel podniku potvrdí mazání v dialogu, THE Service_Manager SHALL provést Cascade_Delete služby — v rámci jedné DB transakce úplně odstranit (hard delete) záznam služby a všechny rezervace odkazující na tuto službu, takže žádný záznam služby ani jejích rezervací po operaci v DB nezůstane.
5. IF Cascade_Delete selže v jakékoliv fázi, THEN THE Service_Manager SHALL transakci rollbackovat a zobrazit chybu majiteli.
6. WHEN Cascade_Delete proběhne úspěšně, THE Service_Manager SHALL zalogovat operaci s počtem smazaných rezervací a `business_id`.

### Requirement 4: Správa otevírací doby

**User Story:** Jako majitel podniku chci nastavit otevírací dobu pro každý den v týdnu, aby klienti viděli, kdy si u mě mohou rezervovat termín.

#### Acceptance Criteria

1. WHEN majitel podniku otevře sekci „Otevírací doba" v dashboardu, THE Opening_Hours_Manager SHALL vrátit nastavení pro všech sedm dní v týdnu (Po–Ne) — pro každý den buď dvojici `opens_at` a `closes_at`, nebo příznak „zavřeno".
2. WHEN majitel podniku uloží změnu otevírací doby pro konkrétní den s validními daty, THE Opening_Hours_Manager SHALL záznam pro daný `Day_Of_Week` aktualizovat.
3. WHEN majitel podniku označí konkrétní den jako zavřený, THE Opening_Hours_Manager SHALL pro daný `Day_Of_Week` uložit stav „zavřeno" bez hodnot `opens_at` a `closes_at`.
4. IF v uložené konfiguraci `opens_at` pro daný den je rovno nebo větší než `closes_at`, THEN THE Opening_Hours_Manager SHALL operaci odmítnout s chybou „Čas otevření musí předcházet času zavření".
5. IF uložená konfigurace by měla za následek, že žádný ze sedmi dní v týdnu není otevřený, THEN THE Opening_Hours_Manager SHALL operaci odmítnout s chybou „Alespoň jeden den v týdnu musí být otevřený".
6. THE Opening_Hours_Manager SHALL ukládat hodnoty `opens_at` a `closes_at` v lokálním čase podniku (Europe/Prague) jako typ `time` bez data.

### Requirement 5: Přepínač paralelních slotů

**User Story:** Jako majitel podniku s více pracovními místy chci povolit paralelní rezervace ve stejném časovém slotu, abych plně využil svou kapacitu.

#### Acceptance Criteria

1. WHEN majitel podniku otevře nastavení dostupnosti, THE Availability_Settings_Manager SHALL vrátit aktuální hodnotu `allow_parallel_slots`.
2. THE výchozí hodnota `allow_parallel_slots` SHALL být `false`.
3. WHEN majitel podniku přepne hodnotu `allow_parallel_slots`, THE Availability_Settings_Manager SHALL nové nastavení uložit a od toho okamžiku jej aplikovat na výpočet dostupných slotů.
4. WHERE `allow_parallel_slots = true` a UI majitele zobrazuje přepínač, THE UI SHALL zobrazovat textové vysvětlení důsledku v češtině — že při zapnuté volbě nebudou kontrolovány konflikty mezi rezervacemi a podnik je sám zodpovědný za fyzickou kapacitu.
5. WHEN majitel podniku přepíná hodnotu `allow_parallel_slots` z `false` na `true`, THE UI SHALL textové vysvětlení zobrazit ještě před potvrzením přepnutí.
6. IF text vysvětlení paralelních slotů není dostupný (chyba načítání lokalizace) a `allow_parallel_slots = false`, THEN THE UI SHALL přepínač skrýt a operaci přepnutí na `true` nezpřístupnit.
7. IF text vysvětlení paralelních slotů není dostupný a `allow_parallel_slots = true` je již uloženo, THEN THE UI SHALL přepínač zobrazit i bez vysvětlení (aby majitel mohl funkci kdykoli vypnout).

### Requirement 6: Přepínač auto-approve

**User Story:** Jako majitel podniku chci nastavit, zda budu rezervace schvalovat ručně nebo zda se mají schvalovat automaticky, aby systém odpovídal mému provoznímu stylu.

#### Acceptance Criteria

1. WHEN majitel podniku otevře nastavení dostupnosti, THE Availability_Settings_Manager SHALL vrátit aktuální hodnotu `auto_approve_reservations`.
2. THE výchozí hodnota `auto_approve_reservations` SHALL být `false`.
3. WHEN majitel podniku přepne hodnotu `auto_approve_reservations`, THE Availability_Settings_Manager SHALL nové nastavení uložit a od toho okamžiku jej aplikovat na nově vznikající rezervace.
4. THE změna `auto_approve_reservations` SHALL ovlivnit pouze rezervace vznikající po změně — existující rezervace ve stavu `pending` zůstávají v `pending` až do ručního rozhodnutí a existující rezervace ve stavu `approved` zůstávají v `approved`.

### Requirement 7: Pravidlo tolerance přesahu přes closes_at

**User Story:** Jako majitel podniku chci, aby klienti mohli rezervovat slot, který končí krátce po oficiální zavírací době, aby jim 15 minut nadčasu neuteklo zbytečně.

#### Acceptance Criteria

1. WHERE služba má trvání `D` minut a daný den má `closes_at` definovaný, THE Slot_Calculator SHALL považovat slot začínající v čase `t` za **uvnitř otevírací doby** právě tehdy, když `t >= opens_at` a `t + D <= closes_at + 15 minut`.
2. WHEN služba o trvání 60 minut je posuzována pro den s `closes_at = 17:00`, THE Slot_Calculator SHALL akceptovat počáteční čas 16:15 (slot 16:15–17:15, přesah 15 min) a odmítnout počáteční čas 16:16 (slot 16:16–17:16, přesah 16 min).
3. THE tolerance Closes_At_Tolerance SHALL být konstantní napříč všemi typy podniků a všemi službami.

### Requirement 8: Dotykové sloty nejsou konflikt

**User Story:** Jako klient chci si zarezervovat slot začínající přesně tam, kde končí předchozí slot, aby kapacita podniku nebyla zbytečně omezená.

#### Acceptance Criteria

1. WHEN slot S1 končí v čase `t` a slot S2 začíná v čase `t`, THE Slot_Calculator SHALL považovat dvojici (S1, S2) za **bez konfliktu**.
2. WHEN slot S1 a slot S2 mají neprázdný průnik svých polootevřených intervalů `[start, end)`, THE Slot_Calculator SHALL považovat dvojici (S1, S2) za **v konfliktu**.

### Requirement 9: Výpočet dostupných slotů

**User Story:** Jako klient chci vidět seznam volných počátečních časů pro vybranou službu na konkrétní den, abych si mohl rezervovat termín bez tipování.

#### Acceptance Criteria

1. WHEN je vyžádán seznam dostupných slotů pro daný `business_id`, datum a `service_id`, THE Slot_Calculator SHALL vrátit seznam počátečních časů `t`, pro které platí všechny následující podmínky.
2. THE počáteční čas `t` SHALL ležet na Slot_Grid daného podniku — to znamená, že `t` je zarovnán na 15minutový krok počítaný od `opens_at` daného dne.
3. THE počáteční čas `t` SHALL splňovat pravidlo otevírací doby z Requirementu 7 (`t >= opens_at` a `t + D <= closes_at + 15 minut`).
4. WHILE `allow_parallel_slots = false`, THE Slot_Calculator SHALL z výsledku vyloučit každý čas `t`, pro který existuje Active_Reservation se slotem v konfliktu (dle Requirementu 8) se slotem `[t, t + D)`. Toto pravidlo SHALL platit obecně pro celý výpočet dostupnosti, nikoli pouze v okamžiku vytváření rezervace.
5. WHILE `allow_parallel_slots = true`, THE Slot_Calculator SHALL vrátit všechny časy `t` splňující podmínky 2 a 3 bez ohledu na existující rezervace; podmínky 2 (mřížka) a 3 (otevírací doba s tolerancí) SHALL být vynucovány vždy, nezávisle na hodnotě `allow_parallel_slots`.
6. IF zvolené datum spadá na den, který je v Opening_Hours označen jako zavřený, THEN THE Slot_Calculator SHALL vrátit prázdný seznam.
7. IF konfigurace daného dne má `opens_at >= closes_at` (defenzivní kontrola pro případ poškozených dat), THEN THE Slot_Calculator SHALL vrátit prázdný seznam a chybu zalogovat.
8. THE Slot_Calculator SHALL vracet časy v lokálním čase podniku (Europe/Prague) ve vzestupném pořadí.

### Requirement 10: Propagace změn na veřejnou stránku

**User Story:** Jako majitel podniku chci, aby se změny mých služeb nebo otevírací doby okamžitě projevily na veřejné rezervační stránce, aby klienti neviděli zastaralé informace.

#### Acceptance Criteria

1. WHEN Service_Manager úspěšně vytvoří, upraví nebo smaže službu, THE Public_Page_Revalidator SHALL spustit ISR revalidaci veřejné stránky podniku.
2. WHEN Opening_Hours_Manager úspěšně uloží změnu otevírací doby, THE Public_Page_Revalidator SHALL spustit ISR revalidaci veřejné stránky podniku.
3. WHEN Availability_Settings_Manager úspěšně změní hodnotu `allow_parallel_slots` nebo `auto_approve_reservations`, THE Public_Page_Revalidator SHALL spustit ISR revalidaci veřejné stránky podniku.
4. IF revalidace selže, THEN THE Public_Page_Revalidator SHALL pokus o zalogování chyby provést, ale původní DB operace SHALL zůstat zachována bez ohledu na to, zda zalogování proběhne úspěšně (revalidace ani logování revalidace nesmí blokovat hlavní operaci).

### Requirement 11: Multi-tenancy izolace

**User Story:** Jako provozovatel platformy potřebuji jistotu, že majitel podniku vidí a mění pouze svá vlastní data služeb a otevírací doby, aby byla zachována izolace mezi nájemci.

#### Acceptance Criteria

1. WHEN majitel podniku načte, vytvoří, upraví nebo smaže službu, THE Service_Manager SHALL pracovat výhradně se záznamy, jejichž `business_id` se rovná podniku přihlášeného majitele.
2. WHEN majitel podniku načte, vytvoří, upraví nebo smaže nastavení otevírací doby, THE Opening_Hours_Manager SHALL pracovat výhradně se záznamy, jejichž `business_id` se rovná podniku přihlášeného majitele.
3. WHEN majitel podniku načte, upraví nebo přepne Availability_Settings, THE Availability_Settings_Manager SHALL pracovat výhradně se záznamem podniku přihlášeného majitele.
4. THE platforma SHALL vynucovat izolaci pomocí Postgres Row Level Security policies na tabulkách `services`, `opening_hours` a `businesses`.
5. THE Service_Manager, Opening_Hours_Manager a Availability_Settings_Manager SHALL navíc na aplikační vrstvě ověřit, že `business_id` cílového záznamu odpovídá podniku přihlášeného majitele, ještě před zápisem do DB; aplikační kontrola SHALL fungovat jako defenzivní vrstva nad RLS a SHALL být vynucována vždy nezávisle na konfiguračních příznacích.
6. IF aplikační kontrola izolace selže nebo není dostupná, THEN THE platforma SHALL operaci odmítnout — operace SHALL pokračovat pouze tehdy, pokud aplikační kontrola explicitně projde.

### Requirement 12: Lokalizace a logování

**User Story:** Jako český majitel podniku chci všechny chybové hlášky v češtině a jako provozovatel platformy chci mít stopy klíčových operací v logu.

#### Acceptance Criteria

1. THE Service_Manager, Opening_Hours_Manager a Availability_Settings_Manager SHALL vracet všechny validační a chybové hlášky v češtině.
2. WHEN Service_Manager provede vytvoření, úpravu, smazání nebo Cascade_Delete služby, THE Service_Manager SHALL zalogovat operaci s `business_id`, `service_id` a typem operace; pokud zalogování selže, THE operace SHALL přesto pokračovat a její výsledek SHALL zůstat zachován.
3. WHEN Opening_Hours_Manager uloží změnu otevírací doby, THE Opening_Hours_Manager SHALL zalogovat operaci s `business_id` a změněným `Day_Of_Week`; pokud zalogování selže, THE operace SHALL přesto pokračovat a její výsledek SHALL zůstat zachován.
4. WHEN Availability_Settings_Manager změní `allow_parallel_slots` nebo `auto_approve_reservations`, THE Availability_Settings_Manager SHALL zalogovat operaci s `business_id`, názvem nastavení a novou hodnotou; pokud zalogování selže, THE operace SHALL přesto pokračovat a její výsledek SHALL zůstat zachován.
5. THE logy SHALL NOT obsahovat citlivé údaje (hesla, tokeny, osobní údaje klientů rezervací).
