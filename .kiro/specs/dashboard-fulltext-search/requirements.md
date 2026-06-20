# Requirements Document

## Introduction

Tento dokument popisuje požadavky na velký refine vyhledávací funkce v hlavičce dashboardu majitele
podniku (platforma Horea). Cílem je rozšířit stávající vyhledávání tak, aby umělo najít libovolný
smysluplný text napříč stránkami dashboardu — především nadpisy sekcí a jejich popisy — a aby po
výběru nalezeného výrazu uživatele přesměrovalo na správnou stránku a odscrollovalo přímo na danou
sekci.

Refine staví na stávající architektuře (rozbalovací pole + výsledkový panel se seskupenými výsledky,
statický index Nastavení/FAQ, dynamické vyhledávání klientů přes serverovou akci) a zachovává její
schopnosti: porovnávání bez ohledu na diakritiku a velikost písmen, seskupené výsledky, debounce
živého vyhledávání klientů a omezení dostupnosti vyhledávání klientů podle tarifu.

Záměrem je, aby se index obsahu nemusel ručně udržovat jako úzký kurátorský seznam, ale aby pokrýval
sekce stránek dashboardu majitele, a aby každá sekce měla stabilní kotvu, na kterou lze odscrollovat.

## Glossary

- **Vyhledávání**: Celková funkce vyhledávání dostupná v hlavičce dashboardu majitele podniku.
- **Vyhledávací_Panel**: UI komponenta vyhledávání — rozbalovací vstupní pole a výsledkový panel.
- **Majitel**: Přihlášený majitel podniku; dashboard je vykreslen v režimu owner.
- **Index_Obsahu**: Strukturovaný index sekcí stránek dashboardu majitele. Každý záznam (Záznam_Sekce) obsahuje text nadpisu sekce, text popisu sekce (pokud existuje), cestu cílové stránky a Kotvu_Sekce.
- **Záznam_Sekce**: Jedna položka Index_Obsahu odpovídající jedné sekci konkrétní stránky dashboardu.
- **Kotva_Sekce**: Stabilní identifikátor (anchor id) přiřazený sekci stránky, na který lze odscrollovat.
- **Statický_Index**: Stávající index položek Nastavení a FAQ.
- **Klientský_Zdroj**: Serverová akce, která vyhledává klienty podniku přihlášeného Majitele (tenant-scoped, řízeno tarifem).
- **Normalizace**: Převod textu na tvar bez diakritiky a malými písmeny pro porovnávání.
- **Výsledek**: Jedna položka zobrazená ve Vyhledávacím_Panelu.
- **Skupina**: Kategorie Výsledků — `nastavení`, `sekce`, `klienti`, `faq`.
- **Minimální_Délka_Dotazu**: Počet znaků (2), od kterého se vyhledávání spouští.

## Requirements

### Requirement 1: Indexace obsahu napříč dashboardem

**User Story:** Jako majitel podniku chci, aby vyhledávání našlo libovolný smysluplný text (nadpisy a popisy sekcí) napříč stránkami dashboardu, abych rychle našel požadované místo bez ručního proklikávání.

#### Acceptance Criteria

1. THE Index_Obsahu SHALL pro každou sekci každé stránky dashboardu Majitele obsahovat Záznam_Sekce s textem nadpisu sekce, textem popisu sekce (pokud existuje), cestou cílové stránky a Kotvou_Sekce.
2. WHEN Majitel zadá dotaz o délce alespoň Minimální_Délka_Dotazu, THE Vyhledávání SHALL prohledat texty nadpisů a popisů všech Záznam_Sekce v Index_Obsahu.
3. WHERE Záznam_Sekce neobsahuje text popisu, THE Vyhledávání SHALL prohledat pouze text nadpisu daného Záznam_Sekce.
4. THE Vyhledávání SHALL prohledávat Statický_Index (Nastavení a FAQ) souběžně s Index_Obsahu.

### Requirement 2: Porovnávání bez ohledu na diakritiku a velikost písmen

**User Story:** Jako majitel chci najít výraz i bez psaní diakritiky a bez ohledu na velikost písmen, abych nemusel zadávat přesný tvar.

#### Acceptance Criteria

1. WHEN Majitel zadá dotaz, THE Vyhledávání SHALL porovnat dotaz s indexovaným textem po Normalizaci obou stran.
2. THE Normalizace SHALL odstranit diakritiku a převést text na malá písmena.
3. WHEN je text již normalizovaný, THE Normalizace SHALL vrátit shodný výsledek jako při jediném průchodu (opakovaná Normalizace vždy produkuje identický výsledek bez ohledu na implementaci).
4. IF Normalizace selže nebo není dostupná, THEN THE Vyhledávání SHALL pokračovat v porovnání s nenormalizovaným textem.

### Requirement 3: Seskupené zobrazení výsledků

**User Story:** Jako majitel chci výsledky přehledně rozdělené do skupin, abych poznal, odkud výsledek pochází.

#### Acceptance Criteria

1. THE Vyhledávací_Panel SHALL zobrazovat Výsledky seskupené do Skupin v pořadí: `nastavení`, `sekce`, `klienti`, `faq`.
2. WHERE Skupina neobsahuje žádný Výsledek ani informaci o uzamčení, THE Vyhledávací_Panel SHALL danou Skupinu skrýt (bez ohledu na stav tarifu).
3. THE Vyhledávací_Panel SHALL u každého Výsledku zobrazit nadpis a, pokud existuje, doplňkový popis.
4. WHERE Výsledek nemá nadpis, ale má popis, THE Vyhledávací_Panel SHALL zobrazit samotný popis.

### Requirement 4: Navigace a odscrollování na sekci

**User Story:** Jako majitel chci po výběru nalezeného výrazu být přesměrován na správnou stránku a odscrollován přímo na konkrétní sekci, abych nemusel sekci hledat ručně.

#### Acceptance Criteria

1. WHEN Majitel vybere Výsledek ze Skupiny `sekce`, THE Vyhledávání SHALL navigovat na cestu cílové stránky doplněnou o Kotvu_Sekce daného Výsledku.
2. WHEN cílová stránka je vykreslena, THE Vyhledávání SHALL odscrollovat sekci odpovídající Kotvě_Sekce do viditelné oblasti (viewport) do 1 sekundy od vykreslení obsahu cílové stránky.
3. WHEN Majitel vybere Výsledek a vybraná sekce se nachází na aktuálně zobrazené stránce, THE Vyhledávání SHALL odscrollovat na sekci bez znovunačtení stránky.
4. WHEN je sekce odscrollována do viewportu, THE Vyhledávání SHALL nastavit na sekci fokus nebo její vizuální zvýraznění pro orientaci uživatele.
5. IF Kotva_Sekce na cílové stránce neexistuje, THEN THE Vyhledávání SHALL zobrazit cílovou stránku bez odscrollování a bez chybové hlášky.

### Requirement 5: Stabilní kotvy sekcí a konzistence s indexem

**User Story:** Jako majitel chci, aby odkazy na sekce fungovaly spolehlivě a opakovaně, aby výsledek vyhledávání vždy vedl na správné místo.

#### Acceptance Criteria

1. THE Kotva_Sekce SHALL být jednoznačná v rámci jedné stránky dashboardu.
2. WHEN je sekce vykreslena na stránce dashboardu, THE cílová stránka SHALL vykreslit element s identifikátorem rovným Kotvě_Sekce odpovídajícího Záznam_Sekce.
3. THE Index_Obsahu SHALL pro každý Záznam_Sekce odkazovat na Kotvu_Sekce, která odpovídá identifikátoru vykreslenému na cílové stránce.

### Requirement 6: Debounced dynamické vyhledávání klientů

**User Story:** Jako majitel chci, aby se klienti vyhledávali živě během psaní bez zbytečného zatížení serveru, abych dostal aktuální výsledky plynule.

#### Acceptance Criteria

1. WHEN Majitel změní dotaz, THE Klientský_Zdroj SHALL být dotázán nejdříve 300 ms po poslední změně dotazu.
2. WHEN přijde novější dotaz dříve, než se dokončí předchozí dotaz na Klientský_Zdroj, THE Vyhledávání SHALL nechat probíhající dotaz doběhnout a zahodit jeho výsledek, pokud neodpovídá aktuálnímu dotazu.
3. WHEN Klientský_Zdroj vrátí výsledky, THE Vyhledávací_Panel SHALL je zobrazit ve Skupině `klienti`.

### Requirement 7: Omezení vyhledávání klientů podle tarifu a tenant izolace

**User Story:** Jako provozovatel platformy chci, aby vyhledávání klientů respektovalo tarif a izolaci podniků, aby data zůstala chráněná a funkce odpovídala předplatnému.

#### Acceptance Criteria

1. IF tarif Majitele nemá funkci `client_search`, THEN THE Klientský_Zdroj SHALL vrátit stav `locked`.
2. WHEN Klientský_Zdroj vrátí stav `locked`, THE Vyhledávací_Panel SHALL ve Skupině `klienti` zobrazit informaci o dostupnosti ve vyšším tarifu místo výsledků.
3. THE Klientský_Zdroj SHALL vyhledávat pouze klienty patřící podniku přihlášeného Majitele.
4. THE Klientský_Zdroj SHALL omezit počet vrácených klientů na nejvýše 6.
5. IF Majitel není přihlášen, THEN THE Klientský_Zdroj SHALL vrátit stav `unauthorized`.

### Requirement 8: Minimální délka dotazu

**User Story:** Jako majitel chci, aby se vyhledávání spouštělo až od smysluplné délky dotazu, abych nedostával výsledky po jednom znaku.

#### Acceptance Criteria

1. WHILE je délka dotazu menší než Minimální_Délka_Dotazu, THE Vyhledávací_Panel SHALL ponechat výsledkový panel skrytý a nedotazovat Klientský_Zdroj.
2. WHEN délka dotazu dosáhne Minimální_Délka_Dotazu, THE Vyhledávání SHALL spustit prohledání Index_Obsahu, Statického_Indexu a Klientského_Zdroje.

### Requirement 9: Stav bez výsledků

**User Story:** Jako majitel chci jasnou zpětnou vazbu, když nic nenajdu, abych věděl, že dotaz proběhl.

#### Acceptance Criteria

1. WHEN dotaz dosáhne Minimální_Délka_Dotazu a žádný zdroj nevrátí Výsledek a Skupina `klienti` není uzamčena, THE Vyhledávací_Panel SHALL zobrazit hlášku „Nic nenalezeno." po krátké prodlevě 300 ms od dokončení vyhledávání, aby se předešlo problikávání při rychlém psaní.

### Requirement 10: Otevírání a zavírání panelu

**User Story:** Jako majitel chci vyhledávání snadno otevřít i zavřít, aby mi nepřekáželo v práci.

#### Acceptance Criteria

1. WHEN Majitel klikne na ikonu vyhledávání, THE Vyhledávací_Panel SHALL rozbalit vstupní pole a nastavit na něj fokus.
2. WHEN Majitel klikne mimo Vyhledávací_Panel, THE Vyhledávací_Panel SHALL se zavřít.
3. WHEN Majitel stiskne klávesu Escape, THE Vyhledávací_Panel SHALL se zavřít.
4. WHEN Majitel vybere Výsledek, THE Vyhledávací_Panel SHALL se zavřít.

### Requirement 11: Přístupnost

**User Story:** Jako majitel používající klávesnici nebo čtečku obrazovky chci vyhledávání plně ovládat, abych měl rovnocenný přístup k funkci.

#### Acceptance Criteria

1. THE Vyhledávací_Panel SHALL umožnit procházení a výběr Výsledků pomocí klávesnice.
2. THE Vyhledávací_Panel SHALL exponovat ARIA role a stavy (combobox a listbox, aria-expanded) pro čtečky obrazovky.
3. WHEN Majitel potvrdí zvýrazněný Výsledek klávesou Enter, THE Vyhledávání SHALL provést stejnou navigaci jako při kliknutí na Výsledek.
4. IF Majitel stiskne klávesu Enter, když není zvýrazněn žádný Výsledek, THEN THE Vyhledávání SHALL navigaci neprovést.
5. THE Vyhledávací_Panel SHALL umožnit výběr Výsledku klávesnicí pouze poté, co je Výsledek nejprve zvýrazněn pomocí klávesové navigace.

### Requirement 12: Dostupnost vyhledávání podle role

**User Story:** Jako provozovatel platformy chci, aby se rozšířené vyhledávání zobrazovalo majitelům, aby odpovídalo jejich obsahu dashboardu.

#### Acceptance Criteria

1. WHERE je dashboard vykreslen v režimu majitele (owner), THE Vyhledávání SHALL být dostupné v hlavičce dashboardu.
2. WHERE je dashboard vykreslen v režimu administrátora, THE Vyhledávání SHALL zůstat skryté.
3. THE Vyhledávání SHALL striktně vynutit pravidla viditelnosti podle role bez výjimek.

### Requirement 13: Výkon vyhledávání

**User Story:** Jako majitel chci, aby vyhledávání reagovalo rychle během psaní, aby práce s ním byla plynulá.

#### Acceptance Criteria

1. WHEN je prohledáván Index_Obsahu, THE Vyhledávání SHALL provést porovnání lokálně v prohlížeči bez síťového požadavku.
2. THE Vyhledávání SHALL omezit počet Výsledků ze Skupiny `sekce` na nejvýše 6.
