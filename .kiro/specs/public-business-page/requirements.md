# Requirements Document

## Introduction

Tato specifikace pokrývá **veřejnou stránku podniku** dostupnou na URL `https://www.mojerezervace.cz/{slug}` — tedy rozhraní, kterým koncoví zákazníci (klienti) bez registrace prohlížejí profil podniku a vytvářejí rezervace. Stránka je první (a často jediný) kontakt klienta s platformou; její dostupnost, rychlost a srozumitelnost přímo určují konverzi rezervací.

Feature pokrývá:

- Vykreslení veřejné stránky `/{slug}` s logem, názvem, typem, popisem, kontakty, otevírací dobou, seznamem služeb a rezervačním formulářem (ISR cache).
- Tři stavy stránky: **publikovaný profil**, **nepublikovaný profil** (hláška „Tento podnik zatím nepublikoval svůj profil"), **404** (slug nenalezen nebo rezervovaný).
- Rezervační formulář v pěti krocích (služba → datum → čas → kontakt → potvrzení), který používá `Slot_Calculator` ze specu `services-and-availability` jako sdílený zdroj pravdy o dostupných slotech.
- Server-side vytvoření rezervace s plnou revalidací business pravidel (publikovanost, existence služby, otevírací doba, dostupnost slotu) v okamžiku zápisu — ochrana proti race condition mezi výběrem slotu klientem a odesláním formuláře.
- Odeslání dvou e-mailů po vytvoření rezervace: potvrzení klientovi a notifikace majiteli.
- SEO: meta tagy, Open Graph, structured data (LocalBusiness JSON-LD), sitemap.xml entry pro každý publikovaný podnik.
- Mobilní použitelnost — primární zařízení klienta je telefon.
- Anti-abuse pouze přes Cloudflare edge rate limit definovaný v `architecture/tasks.md` (úkol 5.4: max 10 requestů na IP za minutu na `/api/reservations`).

Feature **nepokrývá**:

- Dashboard rezervací (spec `reservation-management`).
- Editaci služeb a otevírací doby (spec `services-and-availability`).
- Autentizaci a onboarding (spec `auth-onboarding`).
- Stavový automat předplatného a změny stavu (spec `subscription-payments`) — tato feature pouze **čte** `subscription.status`, aby rozhodla o publikování profilu.
- Custom design / theming a multi-jazyk (roadmap v2/v3).

**Vědomé zpřísnění oproti `architecture/requirements.md` R19.2:** R19.2 vyžaduje, že klient vyplní **alespoň jeden** kontaktní údaj (telefon nebo e-mail). MVP této feature vyžaduje **oba** kontaktní údaje současně (telefon i e-mail), aby bylo možné spolehlivě posílat potvrzovací e-mail a aby měl podnik k dispozici telefon pro případnou změnu termínu. Toto zpřísnění splňuje R19.2 (silnější podmínka implikuje slabší).

Návaznost na platformové požadavky z `architecture/requirements.md`: R1 (multi-tenancy / RLS), R2 (výkon — TTFB ≤ 2 s pro veřejnou stránku), R10 (bezpečnost vrstvená — Cloudflare WAF, edge rate limit, server-side validace, HTML sanitizace), R11 (slug-based routing, Reserved_Slug, hláška u nepublikovaných), R13 (e-maily přes Resend), R15 (auto-approve), R16 (paralelní sloty), R18 (čeština jako jediný jazyk MVP), R19 (klient bez registrace).

Návaznost na feature specifikace: `services-and-availability` poskytuje sdílený `Slot_Calculator` (čistá funkce), který tato feature volá v krocích 2 a 4 rezervačního flow.

## Glossary

- **Public_Page**: Veřejná stránka podniku dostupná na URL `https://www.mojerezervace.cz/{slug}`. Vykresluje se serverově s ISR (Incremental Static Regeneration) cache.
- **Public_Page_Renderer**: Komponenta zodpovědná za načtení dat podniku, rozhodnutí o stavu stránky (publikováno / nepublikováno / 404) a vykreslení odpovídajícího HTML.
- **Slug**: URL-bezpečný identifikátor podniku v cestě `/{slug}` (definováno v `auth-onboarding`).
- **Reserved_Slug**: Systémem rezervovaný řetězec, který nesmí být použit jako slug podniku (viz `auth-onboarding`).
- **Published_Business**: Podnik, jehož profil je veřejně viditelný — splňuje obě podmínky současně: `business.is_published = true` a `subscription.status IN ('active', 'grace_period')`.
- **Unpublished_Business**: Podnik, jehož záznam v DB existuje, ale nesplňuje podmínky `Published_Business` (např. `is_published = false`, `subscription.status IN ('free', 'expired', 'deleted_data')`).
- **Reservation_Form**: Pětikrokový formulář pro vytvoření rezervace (služba → datum → čas → kontakt → potvrzení).
- **Reservation_Submission_Handler**: Server-side komponenta zpracovávající POST z `Reservation_Form`. Provádí finální validaci a zápis rezervace do DB.
- **Available_Slot_List**: Seznam dostupných počátečních časů pro daný podnik, datum a službu, vrácený voláním `Slot_Calculator` ze specu `services-and-availability`.
- **Reservation_Conflict**: Stav, kdy slot vybraný klientem v kroku 3 již není v okamžiku odeslání formuláře (krok 5) dostupný — nový překryv s aktivní rezervací při `allow_parallel_slots = false`.
- **Client_Contact**: Kontaktní údaje klienta vyplněné v rezervačním formuláři: jméno, telefon, e-mail, volitelná poznámka. Žádný odkaz na `users` tabulku — kontaktní údaje jsou denormalizované přímo v `reservations`.
- **Reservation_Confirmation_Email**: Transakční e-mail odeslaný klientovi po úspěšném vytvoření rezervace, s detaily rezervace, jejím statusem a popisem dalších kroků.
- **Reservation_Notification_Email**: Transakční e-mail odeslaný majiteli podniku po úspěšném vytvoření nové rezervace.
- **Email_Dispatcher**: Komponenta odpovědná za sestavení a odeslání transakčních e-mailů přes Resend (sdílená infrastruktura podle architektury).
- **SEO_Metadata_Renderer**: Komponenta vkládající do HTML hlavičky veřejné stránky meta tagy, Open Graph tagy a JSON-LD structured data (`LocalBusiness` schema.org).
- **Sitemap_Generator**: Komponenta generující `/sitemap.xml` se seznamem všech `Published_Business` URL.
- **Edge_Rate_Limit**: Cloudflare edge rate limit pravidlo definované v `architecture/tasks.md` úkol 5.4 (max 10 requestů na IP za minutu na `/api/reservations`). Tato feature žádný další aplikační rate limit neimplementuje.
- **Czech_Locale**: Čeština jako jediný jazyk MVP veřejné stránky (R18). Časové pásmo Europe/Prague pro zobrazení časů, měna Kč.

## Requirements

### Requirement 1: Vykreslení publikovaného profilu

**User Story:** Jako klient chci vidět profil podniku na URL `/{slug}` se všemi informacemi potřebnými k rozhodnutí o rezervaci, abych mohl zvolit službu a termín.

#### Acceptance Criteria

1. WHEN klient otevře URL `/{slug}` a podnik s daným slugem je `Published_Business`, THE Public_Page_Renderer SHALL vrátit HTML stránku obsahující logo podniku (pokud je nahráno), název, typ podniku, popis, kontaktní údaje (telefon, e-mail, adresa — pouze ta pole, která jsou vyplněna), otevírací dobu pro všech sedm dní v týdnu, seznam služeb a Reservation_Form. THE vykreslení stránky SHALL probíhat pouze v reakci na příchozí HTTP request klienta — Public_Page_Renderer SHALL NEpředrenderovávat stránky proaktivně mimo standardní ISR cyklus Next.js.
2. WHERE pole `business.logo_url` není vyplněno, THE Public_Page_Renderer SHALL zobrazit zástupný vizuál bez pokusu o načtení obrázku a bez chybové hlášky.
3. WHERE pole `business.phone`, `business.email` nebo `business.address` není vyplněno, THE Public_Page_Renderer SHALL dané pole na stránce nezobrazit (žádný prázdný řádek, žádný placeholder).
4. THE Public_Page_Renderer SHALL pro každou službu v seznamu zobrazit název, trvání v minutách a cenu v Kč.
5. THE Public_Page_Renderer SHALL pro otevírací dobu zobrazit všech sedm dní v týdnu (Po–Ne) v pořadí Po, Út, St, Čt, Pá, So, Ne, přičemž zavřené dny SHALL označit textem „zavřeno".
6. THE Public_Page_Renderer SHALL používat ISR (Incremental Static Regeneration) pro veřejnou stránku tak, aby revalidace iniciovaná specem `services-and-availability` (přes `Public_Page_Revalidator`) měla efekt na další request.
7. THE Public_Page_Renderer SHALL aplikovat HTML sanitizaci na uživatelem zadaná pole (`business.description`, `service.description`) před vložením do HTML; výstup SHALL neutralizovat skripty, inline event handlery a `javascript:` URL.

### Requirement 2: Stav nepublikovaného profilu

**User Story:** Jako klient, který klikl na URL podniku, jenž nemá platné předplatné, chci vidět srozumitelnou hlášku místo prázdné stránky nebo profilu se zastaralými informacemi, abych věděl, že podnik není dostupný.

#### Acceptance Criteria

1. WHEN klient otevře URL `/{slug}` a podnik s daným slugem existuje, ale je `Unpublished_Business`, THE Public_Page_Renderer SHALL vrátit HTML stránku se zprávou v češtině „Tento podnik zatím nepublikoval svůj profil" a HTTP statusem 200.
2. THE Public_Page_Renderer SHALL při vykreslení Unpublished_Business stránky nezobrazit žádné údaje podniku kromě názvu (název je veřejná informace nutná k orientaci uživatele) — žádný popis, žádné kontakty, žádnou otevírací dobu, žádné služby, žádný rezervační formulář.
3. THE Public_Page_Renderer SHALL při vykreslení Unpublished_Business stránky vložit do HTML hlavičky `<meta name="robots" content="noindex">`, aby stránka nebyla indexována vyhledávači.

### Requirement 3: 404 pro neexistující a rezervovaný slug

**User Story:** Jako klient, který otevřel chybnou URL, chci vidět 404 stránku, abych poznal, že podnik s tímto slugem neexistuje.

#### Acceptance Criteria

1. IF klient otevře URL `/{slug}` a v `businesses` neexistuje záznam s daným slugem, THEN THE Public_Page_Renderer SHALL vrátit HTTP status 404 s českou stránkou „Stránka nebyla nalezena".
2. IF klient otevře URL `/{slug}` a hodnota slugu odpovídá hodnotě v `Reserved_Slug` množině (po normalizaci podle `auth-onboarding`), THEN THE Public_Page_Renderer SHALL vrátit HTTP status 404 (a ne profil), aby kolize se systémovými routami nebyly maskovány nahrazením routou businessu.
3. THE Public_Page_Renderer SHALL při vykreslení 404 stránky vložit do HTML hlavičky `<meta name="robots" content="noindex">`.

### Requirement 4: Rezervační formulář — krok výběr služby

**User Story:** Jako klient chci v prvním kroku vybrat službu, abych věděl, jaké je trvání a cena, a abych v dalších krocích viděl odpovídající dostupnost.

#### Acceptance Criteria

1. THE Reservation_Form SHALL v prvním kroku zobrazit seznam všech služeb daného podniku v pořadí podle data vytvoření vzestupně, každou s názvem, trváním v minutách a cenou v Kč.
2. THE Reservation_Form SHALL umožnit klientovi vybrat právě jednu službu jako podmínku přechodu do druhého kroku.
3. WHERE služba má cenu 0 Kč (např. úvodní konzultace zdarma), THE Reservation_Form SHALL takovou službu zobrazit a umožnit její rezervaci stejným způsobem jako placené služby.
4. IF podnik nemá žádnou službu, THEN THE Public_Page_Renderer SHALL Reservation_Form nezobrazit a místo něj zobrazit hlášku „Tento podnik zatím nemá žádné rezervovatelné služby". Tato situace by za normálních okolností neměla nastat (onboarding zakládá první službu), ale slouží jako defenzivní hláška pro případ smazání všech služeb majitelem.
5. IF Reservation_Form je vykreslen v kontextu, kdy seznam služeb je prázdný (defenzivní vrstva nad kritériem 4.4), THEN THE Reservation_Form SHALL první krok nezpřístupnit a zobrazit shodnou hlášku „Tento podnik zatím nemá žádné rezervovatelné služby" namísto prázdného seznamu.

### Requirement 5: Rezervační formulář — krok výběr data

**User Story:** Jako klient chci ve druhém kroku zvolit datum, abych v dalším kroku viděl konkrétní dostupné časy.

#### Acceptance Criteria

1. WHEN klient přejde do druhého kroku Reservation_Form, THE Reservation_Form SHALL zobrazit kalendář umožňující vybrat datum počínaje aktuálním dnem v časové zóně Europe/Prague.
2. THE Reservation_Form SHALL data v minulosti (tj. datum starší než aktuální den v časové zóně Europe/Prague) v kalendáři **vůbec nezobrazovat jako volitelná** — minulé dny SHALL být vizuálně skryty nebo trvale zneaktivněny tak, že klient na ně nemůže kliknout ani je nemůže odeslat jako vstup.
3. WHEN klient vybere datum, THE Reservation_Form SHALL provést serverové volání, které pomocí `Slot_Calculator` ze specu `services-and-availability` vrátí Available_Slot_List pro daný podnik, vybraný den a vybranou službu.
4. WHEN serverové volání vrátí prázdný Available_Slot_List, THE Reservation_Form SHALL zobrazit českou hlášku „V tento den nejsou dostupné žádné termíny" a klientovi neumožnit přechod do třetího kroku.
5. IF serverové volání pro načtení Available_Slot_List selže (chyba sítě nebo serveru), THEN THE Reservation_Form SHALL zobrazit českou hlášku „Nepodařilo se načíst termíny, zkuste to prosím znovu" a klientovi neumožnit přechod do třetího kroku.

### Requirement 6: Rezervační formulář — krok výběr času

**User Story:** Jako klient chci ve třetím kroku vybrat konkrétní čas z dostupné nabídky, abych si rezervoval termín, který mi vyhovuje.

#### Acceptance Criteria

1. WHEN klient přejde do třetího kroku Reservation_Form, THE Reservation_Form SHALL zobrazit Available_Slot_List jako seznam vybíratelných počátečních časů ve vzestupném pořadí v lokálním čase podniku (Europe/Prague).
2. THE Reservation_Form SHALL umožnit klientovi vybrat právě jeden čas jako podmínku přechodu do čtvrtého kroku.
3. THE Reservation_Form SHALL u každého času zobrazit pouze počáteční čas v lokálním formátu (např. „09:30"); celkový rozsah slotu (`start`–`end`) zobrazení v třetím kroku není povinné a v MVP se nezobrazuje.

### Requirement 7: Rezervační formulář — krok kontakt

**User Story:** Jako klient chci ve čtvrtém kroku vyplnit svoje kontaktní údaje, aby mě podnik mohl kontaktovat ohledně rezervace, a aby ji bylo možné zpětně dohledat.

#### Acceptance Criteria

1. THE Reservation_Form SHALL ve čtvrtém kroku vyžadovat tato pole: jméno klienta (povinné), telefon klienta (povinné), e-mail klienta (povinné), poznámka (volitelná).
2. IF jméno klienta je prázdný řetězec po odstranění whitespace, THEN THE Reservation_Form SHALL klientovi neumožnit přechod do pátého kroku a zobrazit českou hlášku „Jméno je povinné".
3. IF jméno klienta přesahuje 100 znaků, THEN THE Reservation_Form SHALL klientovi neumožnit přechod do pátého kroku a zobrazit českou hlášku „Jméno smí mít nejvýše 100 znaků".
4. IF telefon klienta neodpovídá formátu mezinárodního nebo českého telefonního čísla (povolené znaky: číslice, mezery, pomlčky, závorky a volitelné úvodní `+`; po odstranění oddělovačů musí mít 9 až 15 číslic), THEN THE Reservation_Form SHALL klientovi neumožnit přechod do pátého kroku a zobrazit českou hlášku „Zadejte platné telefonní číslo".
5. IF e-mail klienta neodpovídá běžnému formátu e-mailové adresy (`local@domain.tld`), THEN THE Reservation_Form SHALL klientovi neumožnit přechod do pátého kroku a zobrazit českou hlášku „Zadejte platnou e-mailovou adresu".
6. IF poznámka přesahuje 500 znaků, THEN THE Reservation_Form SHALL klientovi neumožnit přechod do pátého kroku a zobrazit českou hlášku „Poznámka smí mít nejvýše 500 znaků".
7. THE Reservation_Submission_Handler SHALL všechna pravidla z kritérií 7.2 až 7.6 znovu validovat serverově **vždy** při zpracování každého odeslání formuláře, nezávisle na tom, jaký byl výsledek klientské validace; klientská validace SHALL být pouze UX vrstvou.

### Requirement 8: Rezervační formulář — krok potvrzení

**User Story:** Jako klient chci v pátém kroku vidět souhrn rezervace před odesláním, abych si mohl ověřit, že je vše správně.

#### Acceptance Criteria

1. THE Reservation_Form SHALL v pátém kroku zobrazit souhrn rezervace v češtině obsahující: název služby, trvání, cenu, datum a počáteční čas slotu, jméno klienta, telefon, e-mail, poznámku (pokud je vyplněna).
2. THE Reservation_Form SHALL umožnit klientovi vrátit se z pátého kroku do kteréhokoli z předchozích kroků a upravit hodnoty, aniž by ztratil již vyplněná data ostatních kroků.
3. THE Reservation_Form SHALL v pátém kroku zobrazit tlačítko „Odeslat rezervaci", jehož kliknutí spouští odeslání formuláře přes Reservation_Submission_Handler.
4. WHEN klient klikne na tlačítko „Odeslat rezervaci", THE Reservation_Form SHALL tlačítko **synchronně znepřístupnit ještě před zahájením zpracování** (v rámci stejné události kliku, předtím, než dojde k odeslání requestu na server), aby případné rychlé následné kliky nemohly způsobit duplicitní odeslání.
5. WHILE Reservation_Submission_Handler zpracovává odeslání, THE Reservation_Form SHALL tlačítko „Odeslat rezervaci" držet znepřístupněné až do dokončení zpracování (úspěch nebo chyba).

### Requirement 9: Server-side validace a vytvoření rezervace

**User Story:** Jako provozovatel platformy potřebuji, aby server v okamžiku zápisu rezervace ověřil všechny invarianty, abych zabránil rezervacím na neexistující služby, mimo otevírací dobu nebo na obsazený slot.

#### Acceptance Criteria

1. WHEN Reservation_Submission_Handler obdrží odeslání formuláře, THE Reservation_Submission_Handler SHALL serverově ověřit, že podnik s daným `business_id` existuje a je `Published_Business` v okamžiku zpracování; pokud podmínka neplatí, THE handler SHALL operaci odmítnout s českou hláškou „Tento podnik aktuálně nepřijímá rezervace".
2. WHEN Reservation_Submission_Handler obdrží odeslání formuláře, THE Reservation_Submission_Handler SHALL serverově ověřit, že služba s daným `service_id` patří k podniku z kritéria 9.1 a stále existuje; pokud podmínka neplatí, THE handler SHALL operaci odmítnout s českou hláškou „Vybraná služba již není dostupná".
3. WHEN Reservation_Submission_Handler obdrží odeslání formuláře, THE Reservation_Submission_Handler SHALL serverově ověřit, že vybraný počáteční čas leží v Available_Slot_List vrácené `Slot_Calculator` v okamžiku zpracování (re-check); ověření SHALL používat stejný algoritmus jako při kroku 5 formuláře (sdílený `Slot_Calculator`).
4. IF vybraný počáteční čas není v Available_Slot_List v okamžiku zpracování (tj. nastalo Reservation_Conflict — slot byl mezitím obsazen jiným klientem), THEN THE Reservation_Submission_Handler SHALL operaci odmítnout s českou hláškou „Tento termín byl právě obsazen, vyberte prosím jiný" a vrátit aktualizovaný Available_Slot_List, který Reservation_Form použije k obnovení nabídky termínů.
5. WHEN všechny validace 9.1 až 9.3 projdou, THE Reservation_Submission_Handler SHALL v jedné DB transakci vytvořit nový záznam v `reservations` s denormalizovanými kontaktními údaji (jméno, telefon, e-mail, poznámka), `business_id`, `service_id`, `starts_at` (UTC), `ends_at` (UTC, dopočtené jako `starts_at + service.duration_minutes`) a se statusem podle kritéria 9.6.
6. WHEN Reservation_Submission_Handler vytváří rezervaci, THE handler SHALL nastavit `status = 'approved'` právě tehdy, když `business.auto_approve_reservations = true`; jinak SHALL nastavit `status = 'pending'`.
7. THE Reservation_Submission_Handler SHALL pro atomicitu kontroly slotu a vložení rezervace v rámci transakce použít zámek na úrovni podniku (např. Postgres advisory lock klíčovaný `business_id`), aby dvě souběžná odeslání pro stejný slot stejného podniku nemohla obě uspět při `allow_parallel_slots = false`.
8. IF Reservation_Submission_Handler vrací chybu klientovi, THEN THE handler SHALL vrátit českou hlášku odpovídající příčině a HTTP status 400 (validační chyba), 404 (podnik / služba neexistuje) nebo 409 (Reservation_Conflict); stack trace ani interní detaily SHALL nebýt v odpovědi obsaženy.
9. WHEN Reservation_Submission_Handler úspěšně vytvoří rezervaci, THE handler SHALL klientovi vrátit potvrzení s jejím statusem (`pending` nebo `approved`) a Reservation_Form SHALL zobrazit českou děkovnou hlášku odpovídající statusu.

### Requirement 10: E-mail klientovi po vytvoření rezervace

**User Story:** Jako klient chci po odeslání rezervace dostat potvrzovací e-mail, abych měl písemný záznam o termínu a věděl, co se bude dít dál.

#### Acceptance Criteria

1. WHEN Reservation_Submission_Handler úspěšně vytvoří rezervaci, THE Email_Dispatcher SHALL odeslat Reservation_Confirmation_Email na e-mail uvedený klientem v rezervačním formuláři.
2. THE Reservation_Confirmation_Email SHALL být v češtině a obsahovat: název podniku, název služby, trvání, cenu, datum a počáteční čas slotu v lokálním čase Europe/Prague, status rezervace (`pending` nebo `approved`) a popis dalších kroků odpovídající danému statusu (u `pending` — „čeká na schválení podnikem", u `approved` — „rezervace je potvrzena").
3. IF odeslání Reservation_Confirmation_Email selže, THEN THE platforma SHALL chybu zalogovat a operaci vytvoření rezervace SHALL zachovat — selhání e-mailu nesmí způsobit rollback rezervace (R14.2 z architektury).
4. THE Email_Dispatcher SHALL odesílat e-maily přes Resend (definováno v R13.1 architektury) — tato feature žádný vlastní mailing systém nezavádí.

### Requirement 11: E-mail majiteli podniku po vytvoření rezervace

**User Story:** Jako majitel podniku chci být e-mailem upozorněn na novou rezervaci, abych ji viděl mimo dashboard a mohl rychle reagovat.

#### Acceptance Criteria

1. WHEN Reservation_Submission_Handler úspěšně vytvoří rezervaci, THE Email_Dispatcher SHALL odeslat Reservation_Notification_Email na kontaktní e-mail majitele podniku (`users.email` propojený přes `businesses.owner_user_id`).
2. THE Reservation_Notification_Email SHALL být v češtině a obsahovat: název služby, trvání, cenu, datum a počáteční čas slotu v lokálním čase Europe/Prague, status rezervace, kontaktní údaje klienta (jméno, telefon, e-mail) a poznámku, pokud je vyplněna.
3. IF odeslání Reservation_Notification_Email selže, THEN THE platforma SHALL chybu zalogovat a operaci vytvoření rezervace SHALL zachovat (R14.2).

### Requirement 12: SEO — meta tagy, Open Graph, structured data

**User Story:** Jako majitel publikovaného podniku chci, aby moji veřejnou stránku našli klienti přes vyhledávač a aby měla pěkný náhled při sdílení, abych získal nové rezervace přes organické kanály.

#### Acceptance Criteria

1. WHEN Public_Page_Renderer vykresluje stránku `Published_Business`, THE SEO_Metadata_Renderer SHALL vložit do HTML hlavičky `<title>` ve tvaru „{název podniku} — rezervace online" a `<meta name="description">` obsahující prvních 155 znaků popisu podniku (nebo prázdný řetězec, pokud popis není vyplněn).
2. WHEN Public_Page_Renderer vykresluje stránku `Published_Business`, THE SEO_Metadata_Renderer SHALL vložit Open Graph tagy `og:title`, `og:description`, `og:url` (kanonické URL stránky), `og:type` s hodnotou `website` a — pokud je `business.logo_url` vyplněno — `og:image` s URL loga.
3. WHEN Public_Page_Renderer vykresluje stránku `Published_Business`, THE SEO_Metadata_Renderer SHALL vložit JSON-LD structured data typu `LocalBusiness` (schema.org) obsahující: `name`, `url` (kanonické URL stránky), `image` (pokud je `business.logo_url` vyplněno), `address` (pokud je `business.address` vyplněna), `telephone` (pokud je `business.phone` vyplněn), `email` (pokud je `business.email` vyplněn) a `openingHoursSpecification` odvozené z otevírací doby podniku.
4. THE SEO_Metadata_Renderer SHALL pro stránky `Unpublished_Business` (Requirement 2) a 404 (Requirement 3) JSON-LD structured data nevkládat a vložit `<meta name="robots" content="noindex">`.

### Requirement 13: Sitemap.xml

**User Story:** Jako provozovatel platformy chci, aby vyhledávače snadno objevily všechny publikované veřejné stránky, aby měly šanci se objevit ve vyhledávání.

#### Acceptance Criteria

1. THE Sitemap_Generator SHALL vystavit endpoint `/sitemap.xml` vracející validní XML sitemap podle protokolu sitemaps.org.
2. THE Sitemap_Generator SHALL do sitemap zahrnout právě URL všech `Published_Business` ve tvaru `https://www.mojerezervace.cz/{slug}`.
3. THE Sitemap_Generator SHALL z sitemap vyloučit URL `Unpublished_Business` a vyloučit i jakékoli systémové cesty platformy (`/admin`, `/dashboard`, `/api`, `/login` atd.).
4. THE Sitemap_Generator SHALL pro každý záznam vyplnit `<lastmod>` na hodnotu `business.updated_at` převedenou do formátu ISO 8601.

### Requirement 14: Mobilní použitelnost

**User Story:** Jako klient na mobilním telefonu chci stránku a rezervační formulář používat bez zoomování a bez horizontálního skrolování, abych si mohl zarezervovat termín během cesty nebo přestávky.

#### Acceptance Criteria

1. THE Public_Page SHALL být responzivní pro šířky viewportu od 320 px do 1920 px včetně, bez vodorovného skrolování ve výchozí orientaci.
2. THE Public_Page SHALL mít v HTML hlavičce `<meta name="viewport" content="width=device-width, initial-scale=1">`.
3. THE Reservation_Form SHALL na šířkách viewportu menších než 768 px zobrazovat každý krok formuláře jako samostatnou obrazovku přes plnou šířku (žádný horizontální layout vícesloupcový).
4. THE Reservation_Form SHALL mít všechna interaktivní cílová místa (tlačítka, vybíratelné sloty, pole formuláře) s minimální velikostí dotykového cíle 44 × 44 px.

### Requirement 15: Výkon a ISR cache

**User Story:** Jako provozovatel platformy potřebuji, aby veřejná stránka byla rychlá i pro 200 podniků a běžný organický provoz na free tieru, aby konverze rezervací nebyla blokována latencí.

#### Acceptance Criteria

1. THE Public_Page SHALL být doručena s Time To First Byte (TTFB) do 2 sekund při běžném zatížení (R2.3 architektury).
2. THE Public_Page_Renderer SHALL používat ISR cache; první request po revalidaci může být pomalejší, ale následující requesty SHALL být obslouženy z cache.
3. THE Public_Page_Renderer SHALL při vykreslení používat výhradně anonymní (anon) Supabase JWT klíč — NIKDY service role key (R1.4 architektury).
4. THE Reservation_Submission_Handler SHALL při zápisu rezervace používat server-side klíč pouze v server kontextu — tento klíč SHALL nebýt nikdy odeslán klientovi (R10.7 architektury).
5. IF Reservation_Submission_Handler nemá k dispozici platný server kontext (např. neočekávané volání z klientského prostředí, výpadek server-side runtime), THEN THE handler SHALL odeslání rezervace **kompletně zablokovat** s českou hláškou „Rezervaci se nepodařilo odeslat, zkuste to prosím znovu" — handler SHALL NEpřepínat na žádnou alternativní (anon) autentizaci pro zápis.

### Requirement 16: Anti-abuse — Cloudflare edge rate limit

**User Story:** Jako provozovatel platformy chci jednoduchou ochranu proti spamu rezervací bez nutnosti vlastní aplikační logiky, abych se v MVP soustředil na produkt.

#### Acceptance Criteria

1. THE platforma SHALL spoléhat na Cloudflare edge rate limit definovaný v `architecture/tasks.md` úkol 5.4 (cílová hodnota přibližně 10 requestů na IP za minutu na `/api/reservations`; drobná odchylka v rozsahu zhruba 8 až 15 requestů za minutu je přijatelná, pokud Cloudflare konfigurace poskytuje srovnatelnou anti-abuse ochranu) jako jediný anti-abuse mechanismus rezervačního endpointu v MVP.
2. THE Reservation_Submission_Handler SHALL nezavádět žádný další aplikační rate limit (per business, per phone, per e-mail) — anti-abuse je v MVP vědomě delegován na Cloudflare.

### Requirement 17: Lokalizace a časové pásmo

**User Story:** Jako český klient chci celou veřejnou stránku v češtině s českými časy a měnou, aby byla srozumitelná.

#### Acceptance Criteria

1. THE Public_Page_Renderer SHALL veškeré viditelné texty (popisky, hlášky, tlačítka, e-mailové šablony patřící do této feature) zobrazovat v češtině.
2. THE Public_Page_Renderer SHALL časy zobrazovat v lokálním čase Europe/Prague v 24hodinovém formátu (např. „09:30").
3. THE Public_Page_Renderer SHALL ceny zobrazovat v Kč.
4. THE Reservation_Submission_Handler SHALL hodnoty `starts_at` a `ends_at` ukládat v UTC v DB (R18.3 architektury); konverze do/z Europe/Prague SHALL probíhat na hraně mezi DB a UI vrstvou.

### Requirement 18: Logování

**User Story:** Jako provozovatel platformy chci v logu stopy klíčových operací rezervačního flow, abych mohl diagnostikovat problémy.

#### Acceptance Criteria

1. WHEN Reservation_Submission_Handler úspěšně vytvoří rezervaci, THE handler SHALL zalogovat operaci s `business_id`, `service_id`, `reservation_id` a typem operace (`reservation_created`).
2. WHEN Reservation_Submission_Handler odmítne rezervaci kvůli Reservation_Conflict (Requirement 9.4), THE handler SHALL zalogovat událost s `business_id`, `service_id` a důvodem (`slot_unavailable`).
3. WHEN Reservation_Submission_Handler odmítne rezervaci kvůli nepublikovanému podniku nebo neexistující službě (Requirement 9.1, 9.2), THE handler SHALL zalogovat událost s důvodem.
4. THE platforma SHALL logy NEnaplnovat citlivými údaji klienta (telefon, e-mail, poznámka) — log SHALL obsahovat pouze identifikátory entit a kategorii události (R20.2 architektury).
5. IF zalogování selže, THEN THE operace SHALL přesto pokračovat a její výsledek SHALL zůstat zachován.
