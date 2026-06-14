# Requirements Document

> Specifikace pokrývá kompletní cestu podnikatele od první návštěvy landing page po dokončený (ale ještě nepublikovaný) profil podniku — registrace, ověření emailu, přihlášení, reset hesla, akceptace DPA a onboarding wizard.

## Introduction

Tato spec popisuje **autentizační vrstvu a první onboarding** SaaS platformy Horea pro registrované uživatele typu *majitel podniku*. Výstupem úspěšného průchodu je **uživatelský účet ve stavu `free`** se založeným profilem podniku, alespoň jednou službou a otevírací dobou — tedy plně připravený k publikaci po zaplacení předplatného.

Spec **NEPOKRÝVÁ** klientskou stranu (rezervační formulář, viz `R19` v `architecture/requirements.md`), placení předplatného (`subscription-payments`), veřejnou stránku podniku (`public-business-page`), správu služeb a otevírací doby po onboardingu (`services-and-availability`), správu rezervací (`reservation-management`) ani admin dashboard (`admin-dashboard`).

Routing kontrakt platformy: `/` je veřejná landing page, ne dashboard. Všichni přihlášení uživatelé vstupují přes `/login` a po přihlášení přes `/dashboard`; konkrétní dashboard se serverově vykreslí podle typu účtu (`users.is_admin`). Veřejný profil podniku žije na `/{slug}` (např. `/barber-abc`) a implementuje ho spec `public-business-page`. Auth/onboarding routy proto nesmí zabrat systémové cesty ani slug prostor vyhrazený veřejným profilům; systémové cesty a citlivé názvy jsou blokované přes `RESERVED_SLUGS`.

Spec je v souladu s platformovými požadavky `R9` (GDPR / DPA), `R10` (bezpečnost autentizace), `R11` (slug routing), `R18` (česká lokalizace), `R19` (klient bez registrace) a `R21` (typologie podniků).

## Glossary

- **Podnikatel**: Registrovaný uživatel typu majitel podniku (tabulka `users`, `is_admin = false`). Cílový aktér celého toku.
- **Admin**: Registrovaný interní uživatel s `users.is_admin = true`; po přihlášení vidí admin variantu `/dashboard`, ne samostatnou veřejně známou admin login cestu.
- **Klient**: Koncový zákazník rezervující termín — **bez registrace**, není v rozsahu této specu (viz `R19`).
- **Auth_Service**: Komponenta zajišťující registraci, přihlášení, ověření emailu a reset hesla. V MVP implementována nad Supabase Auth (viz `architecture/design.md`).
- **Onboarding_Wizard**: Komponenta provádějící podnikatele šestikrokovým průvodcem (typ podniku → slug → profil → služba → otevírací doba → potvrzení) po prvním přihlášení.
- **Slug_Validator**: Komponenta ověřující formát, kolize se systémovými routami a obsazenost slugu v reálném čase (viz `R11`).
- **DPA_Manager**: Komponenta evidující verzi akceptovaného Data Processing Agreement a vynucující re-akceptaci při změně verze (viz `R9`).
- **Session_Manager**: Komponenta spravující životní cyklus přihlašovací relace (přihlášení, remember-me, odhlášení).
- **Free_User_Guard**: Komponenta omezující přístup k dashboardu uživatelům ve stavu `free` (po onboardingu, před zaplacením předplatného).
- **DPA**: Data Processing Agreement — smlouva mezi platformou a podnikatelem (správcem dat) podle GDPR. Verzována řetězcem (např. `2025-01-15`).
- **Slug**: URL-bezpečný identifikátor podniku použitý ve veřejné URL `https://www.horea.cz/{slug}` (viz `R11`).
- **Free uživatel**: Stav předplatného `free` — registrovaný podnikatel bez platného placeného předplatného. Profil podniku existuje, ale `is_published = false`.
- **Reserved_Slug**: Systémem rezervovaný řetězec, který nelze použít jako slug podniku (např. `admin`, `api`, `login`, `register`, `dashboard`, `app`, `www`, `mail`).
- **Typ podniku**: Jedna z hodnot `kadernik`, `nehtove_studio`, `bistro`, `masazni_salon`, `spa`, `beauty`, `ostatni` (viz `R21`).

## Requirements

### Requirement 1: Registrace podnikatele

**User Story:** Jako podnikatel chci si vytvořit účet pomocí emailu a hesla, aby moje obchodní data byla chráněná a měl jsem přístup k vlastnímu dashboardu.

#### Acceptance Criteria

1. WHEN podnikatel odešle registrační formulář s emailem, heslem, akceptací Terms of Service a akceptací DPA, THE Auth_Service SHALL ověřit formát emailu na serveru, ověřit sílu hesla a založit nový účet ve stavu „neověřený email".
2. IF email nemá platný formát (chybí znak `@` nebo doménová část), THEN THE Auth_Service SHALL odmítnout registraci s českou chybovou hláškou identifikující neplatný formát emailu.
3. IF heslo má méně než 8 znaků, neobsahuje alespoň jedno velké písmeno nebo neobsahuje alespoň jednu číslici, THEN THE Auth_Service SHALL odmítnout registraci s českou chybovou hláškou specifikující nesplněné kritérium.
4. IF email je již registrován v tabulce `users`, THEN THE Auth_Service SHALL odmítnout registraci s českou chybovou hláškou „Účet s tímto emailem již existuje".
5. IF podnikatel neoznačí pole akceptace Terms of Service nebo pole akceptace DPA, THEN THE Auth_Service SHALL odmítnout registraci s českou chybovou hláškou identifikující chybějící souhlas.
6. WHEN registrace uspěje, THE DPA_Manager SHALL uložit verzi akceptovaného DPA a timestamp akceptace v záznamu uživatele.
7. WHEN registrace uspěje, THE Auth_Service SHALL odeslat ověřovací email s odkazem na verifikační endpoint v české jazykové variantě.
8. WHEN registrace uspěje, THE Auth_Service SHALL přesměrovat podnikatele na stránku „Ověřte si email", která vysvětluje další krok.

### Requirement 2: Ověření emailu

**User Story:** Jako podnikatel chci ověřit svou emailovou adresu kliknutím na odkaz, aby platforma věděla, že email patří mně, a abych mohl pokračovat na onboarding.

#### Acceptance Criteria

1. WHEN podnikatel klikne na ověřovací odkaz v emailu a token je platný, THE Auth_Service SHALL označit email jako ověřený, vytvořit přihlašovací relaci a přesměrovat podnikatele na první krok onboarding wizardu.
2. IF ověřovací token vypršel nebo neexistuje, THEN THE Auth_Service SHALL zobrazit českou chybovou hlášku a nabídnout opětovné odeslání ověřovacího emailu.
3. WHEN podnikatel požádá o opětovné odeslání ověřovacího emailu, THE Auth_Service SHALL odeslat nový email s novým tokenem v české jazykové variantě.
4. IF neověřený podnikatel se pokusí přihlásit, THEN THE Auth_Service SHALL přihlášení odmítnout, ponechat podnikatele na přihlašovací stránce a zobrazit českou hlášku vyzývající k ověření emailu spolu s tlačítkem pro opětovné odeslání ověřovacího odkazu.

### Requirement 3: Přihlášení podnikatele

**User Story:** Jako podnikatel chci se přihlásit pomocí emailu a hesla, abych získal přístup ke svému dashboardu nebo onboardingu.

#### Acceptance Criteria

1. WHEN podnikatel odešle přihlašovací formulář s platným emailem a heslem, THE Auth_Service SHALL ověřit přihlašovací údaje a vytvořit přihlašovací relaci uloženou v HTTP-only secure cookie.
2. IF kombinace emailu a hesla neodpovídá žádnému ověřenému účtu, THEN THE Auth_Service SHALL přihlášení odmítnout s českou chybovou hláškou „Nesprávný email nebo heslo" bez prozrazení, který z údajů je chybný.
3. WHEN podnikatel zaškrtne pole „Zůstat přihlášen" a přihlášení uspěje, THE Session_Manager SHALL vytvořit dlouhodobou relaci v souladu s konfigurací Supabase Auth pro remember-me.
4. WHEN přihlášení uspěje a `users.is_admin = true`, THE Auth_Service SHALL přesměrovat uživatele na `/dashboard`, kde se zobrazí admin varianta dashboardu podle role účtu.
5. WHEN podnikatel (`users.is_admin = false`) přihlášení uspěje a nemá založený podnik, THE Auth_Service SHALL přesměrovat podnikatele na první nedokončený krok onboarding wizardu.
6. WHEN podnikatel (`users.is_admin = false`) přihlášení uspěje a má založený podnik, THE Auth_Service SHALL přesměrovat podnikatele na user dashboard `/dashboard`.
7. THE Auth_Service SHALL aplikovat rate limit na neúspěšné pokusy o přihlášení per IP a per email v souladu s `R10`.
8. THE Auth_Service SHALL zobrazit veškeré chybové hlášky autentizačního toku v češtině v souladu s `R18`.

### Requirement 4: Odhlášení

**User Story:** Jako podnikatel chci se odhlásit, aby moje relace byla bezpečně ukončena, zejména na sdíleném zařízení.

#### Acceptance Criteria

1. WHEN podnikatel iniciuje odhlášení, THE Session_Manager SHALL zneplatnit aktuální Supabase Auth relaci a smazat session cookie z prohlížeče.
2. WHEN odhlášení uspěje, THE Session_Manager SHALL přesměrovat podnikatele na landing page.
3. WHEN neautentizovaný podnikatel přistoupí k chráněné cestě dashboardu nebo onboarding wizardu, THE Session_Manager SHALL přesměrovat podnikatele na přihlašovací stránku.

### Requirement 5: Reset hesla

**User Story:** Jako podnikatel chci si obnovit zapomenuté heslo přes odkaz v emailu, abych se mohl vrátit ke svému účtu, aniž bych ztratil data.

#### Acceptance Criteria

1. WHEN podnikatel odešle formulář „Zapomenuté heslo" s emailem, THE Auth_Service SHALL odeslat email s odkazem pro reset hesla v české jazykové variantě, pokud email odpovídá existujícímu účtu.
2. IF zadaný email neodpovídá žádnému účtu, THEN THE Auth_Service SHALL zobrazit stejnou potvrzovací hlášku jako při úspěšném odeslání bez prozrazení existence účtu.
3. WHEN podnikatel klikne na odkaz pro reset hesla a token je platný, THE Auth_Service SHALL zobrazit formulář pro nastavení nového hesla.
4. IF token pro reset hesla vypršel nebo neexistuje, THEN THE Auth_Service SHALL zobrazit českou chybovou hlášku a odkaz na formulář „Zapomenuté heslo".
5. WHEN podnikatel odešle nové heslo splňující kritéria z požadavku 1, THE Auth_Service SHALL aktualizovat heslo, zneplatnit všechny existující relace daného účtu a přesměrovat podnikatele na přihlašovací stránku s informací o úspěšné změně hesla.
6. IF nové heslo nesplňuje kritéria z požadavku 1, THEN THE Auth_Service SHALL formulář odmítnout s českou chybovou hláškou specifikující nesplněné kritérium.
7. THE Auth_Service SHALL aplikovat rate limit na požadavky o reset hesla per IP a per email v souladu s `R10`.

### Requirement 6: DPA verzování a re-akceptace

**User Story:** Jako podnikatel chci být upozorněn na změnu DPA a explicitně novou verzi přijmout, abych měl přehled o smluvních podmínkách zpracování dat.

#### Acceptance Criteria

1. THE DPA_Manager SHALL při každém požadavku autentizovaného podnikatele porovnat verzi DPA uloženou na účtu s aktuální verzí DPA platformy.
2. IF verze DPA na účtu podnikatele neodpovídá aktuální verzi platformy, THEN THE DPA_Manager SHALL zobrazit blokující modální dialog s textem nové verze DPA a tlačítkem pro akceptaci.
3. WHILE blokující modální dialog s novou verzí DPA je zobrazen, THE Free_User_Guard SHALL zamezit interakci s ostatním obsahem dashboardu i onboarding wizardu.
4. WHEN podnikatel akceptuje novou verzi DPA, THE DPA_Manager SHALL uložit novou verzi a timestamp akceptace v záznamu uživatele a modální dialog SHALL být uzavřen.
5. WHEN podnikatel modální dialog s novou verzí DPA odmítne nebo opustí, THE Session_Manager SHALL podnikatele odhlásit a přesměrovat na landing page.

### Requirement 7: Onboarding wizard — výběr typu podniku

**User Story:** Jako podnikatel chci vybrat typ svého podniku jako první krok onboardingu, aby platforma poskytla relevantní výchozí šablony a UI nuance.

#### Acceptance Criteria

1. WHEN ověřený podnikatel bez založeného podniku přistoupí k onboarding wizardu, THE Onboarding_Wizard SHALL zobrazit první krok s výběrem právě jednoho typu z množiny `kadernik`, `nehtove_studio`, `bistro`, `masazni_salon`, `spa`, `beauty`, `ostatni`.
2. IF podnikatel pokusí pokračovat na další krok bez vybraného typu podniku, THEN THE Onboarding_Wizard SHALL zobrazit českou chybovou hlášku a zůstat na prvním kroku.
3. WHEN podnikatel vybere typ podniku a potvrdí krok, THE Onboarding_Wizard SHALL uložit vybraný typ do rozpracovaného stavu wizardu a přejít na druhý krok (výběr slugu).

### Requirement 8: Onboarding wizard — výběr slugu

**User Story:** Jako podnikatel chci si zvolit vlastní slug pro veřejnou URL, abych měl jednoduchý a sdělitelný odkaz pro své klienty.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL ve druhém kroku zobrazit pole pro slug s živým náhledem výsledné URL `https://www.horea.cz/{slug}`.
2. WHEN podnikatel mění hodnotu pole slugu, THE Slug_Validator SHALL ověřit formát, kolizi s `Reserved_Slug` množinou a obsazenost v reálném čase a zobrazit výsledek validace.
3. IF slug obsahuje jiné znaky než malá písmena bez diakritiky, číslice nebo pomlčky, THEN THE Slug_Validator SHALL slug označit jako neplatný s českou chybovou hláškou specifikující povolenou znakovou sadu.
4. IF slug má méně než 3 znaky nebo více než 50 znaků, THEN THE Slug_Validator SHALL slug označit jako neplatný s českou chybovou hláškou specifikující povolený rozsah délky.
5. IF slug odpovídá hodnotě v `Reserved_Slug` množině, THEN THE Slug_Validator SHALL slug označit jako neplatný s českou chybovou hláškou „Tento název je vyhrazený, zvolte jiný".
6. IF slug je již použit jiným podnikem, THEN THE Slug_Validator SHALL slug označit jako obsazený s českou chybovou hláškou „Tento název je již obsazený".
7. IF podnikatel pokusí pokračovat na další krok s neplatným nebo obsazeným slugem, THEN THE Onboarding_Wizard SHALL zůstat na druhém kroku a zobrazit důvod odmítnutí.
8. WHEN podnikatel potvrdí druhý krok s platným a volným slugem, THE Onboarding_Wizard SHALL uložit slug do rozpracovaného stavu wizardu a přejít na třetí krok.

### Requirement 9: Onboarding wizard — základní profil

**User Story:** Jako podnikatel chci zadat název podniku, krátký popis a kontakty, aby moji klienti věděli, kdo jsem a jak mě kontaktovat.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL ve třetím kroku zobrazit pole pro název podniku (povinné), krátký popis (povinné), telefon (povinné), kontaktní email (povinné) a adresu (volitelné).
2. WHEN povinné pole se stane prázdným po předchozím vyplnění, THE Onboarding_Wizard SHALL u daného pole okamžitě zobrazit českou validační hlášku identifikující chybějící údaj.
3. IF povinné pole je prázdné v okamžiku odeslání kroku, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou identifikující prázdné pole.
4. IF kontaktní email nemá platný formát, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou identifikující neplatný formát emailu.
5. WHEN podnikatel potvrdí třetí krok se všemi platnými povinnými poli, THE Onboarding_Wizard SHALL uložit profilová data do rozpracovaného stavu wizardu a přejít na čtvrtý krok.

### Requirement 10: Onboarding wizard — první služba

**User Story:** Jako podnikatel chci nastavit alespoň jednu službu s názvem, dobou trvání a cenou, aby si u mě klienti mohli rezervovat termín.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL ve čtvrtém kroku zobrazit formulář pro alespoň jednu službu s povinnými poli název, doba trvání v minutách a cena v Kč.
2. IF název služby je prázdný, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou „Zadejte název služby".
3. IF doba trvání služby není kladné celé číslo minut, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou specifikující povolený formát.
4. IF cena služby je záporná nebo není platné desetinné číslo, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou specifikující povolený formát.
5. IF podnikatel potvrdí krok bez alespoň jedné služby s vyplněným názvem, dobou trvání i cenou, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou „Vyplňte alespoň jednu službu".
6. WHEN podnikatel potvrdí čtvrtý krok a všechny tři kontroly z bodů 2, 3 a 4 jsou splněny pro alespoň jednu službu, THE Onboarding_Wizard SHALL uložit služby do rozpracovaného stavu wizardu a přejít na pátý krok.

### Requirement 11: Onboarding wizard — otevírací doba

**User Story:** Jako podnikatel chci nastavit otevírací dobu pro každý den v týdnu nebo den označit jako zavřený, aby klienti mohli rezervovat pouze v době, kdy jsem otevřený.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL v pátém kroku zobrazit formulář pro každý den v týdnu (pondělí–neděle) s možností nastavit čas otevření, čas zavření, nebo den označit jako zavřený.
2. IF u otevřeného dne čas zavření není pozdější než čas otevření, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou identifikující dotčený den.
3. IF všechny dny jsou označené jako zavřené, THEN THE Onboarding_Wizard SHALL krok odmítnout s českou chybovou hláškou „Nastavte otevírací dobu alespoň pro jeden den".
4. IF jakákoliv validační kontrola pátého kroku selže, THEN THE Onboarding_Wizard SHALL zamezit přechodu na šestý krok dokud nejsou všechny chyby opraveny.
5. WHEN podnikatel potvrdí pátý krok s platnou otevírací dobou, THE Onboarding_Wizard SHALL uložit otevírací dobu do rozpracovaného stavu wizardu a přejít na šestý krok.

### Requirement 12: Onboarding wizard — potvrzení a vytvoření podniku

**User Story:** Jako podnikatel chci v posledním kroku zkontrolovat všechny zadané údaje, abych je mohl potvrdit nebo se vrátit a opravit, a abych měl založený profil podniku.

#### Acceptance Criteria

1. THE Onboarding_Wizard SHALL v šestém kroku zobrazit souhrn všech údajů z předchozích kroků (typ, slug, profil, služby, otevírací doba) a tlačítko pro potvrzení.
2. THE Onboarding_Wizard SHALL umožnit podnikateli z šestého kroku navigovat zpět na libovolný předchozí krok pro úpravu.
3. WHEN podnikatel potvrdí šestý krok, THE Onboarding_Wizard SHALL v jedné databázové transakci vytvořit záznam v tabulce `businesses` s `is_published = false`, záznamy v tabulkách `services` a `opening_hours` a navázané předplatné ve stavu `free`.
4. IF kterákoliv operace transakce z bodu 3 selže, THEN THE Onboarding_Wizard SHALL transakci kompletně rollbacknout tak, aby žádný z dotčených záznamů nezůstal vytvořen, a zobrazit podnikateli českou chybovou hlášku s možností opakovat akci.
5. IF mezi potvrzením šestého kroku a uložením do databáze se slug stane obsazeným jiným podnikem, THEN THE Onboarding_Wizard SHALL transakci odmítnout, vrátit podnikatele na druhý krok s českou chybovou hláškou o nově vzniklé kolizi a zachovat ostatní rozpracovaná data.
6. WHEN založení podniku uspěje, THE Onboarding_Wizard SHALL přesměrovat podnikatele na dashboard ve stavu `free`.

### Requirement 13: Stav `free` po onboardingu

**User Story:** Jako podnikatel po dokončeném onboardingu chci jasně vidět, že můj profil zatím není publikovaný a co mám udělat dál, abych mohl podnik zveřejnit.

#### Acceptance Criteria

1. WHILE předplatné podnikatele je ve stavu `free`, THE Free_User_Guard SHALL omezit dashboard tak, aby jediná dostupná akce byla CTA „Vyberte si plán" odkazující na placení předplatného.
2. WHILE předplatné podnikatele je ve stavu `free`, THE Free_User_Guard SHALL na dashboardu zobrazit informaci, že profil zatím není publikovaný.
3. IF Free_User_Guard nelze inicializovat nebo selže při vyhodnocení stavu předplatného, THEN THE Free_User_Guard SHALL zamezit veškerému přístupu k dashboardu a zobrazit českou chybovou stránku.
4. WHEN autentizovaný podnikatel se založeným podnikem ve stavu `free` přistoupí k cestě onboarding wizardu, THE Onboarding_Wizard SHALL podnikatele přesměrovat na dashboard.

### Requirement 14: Návrat k rozpracovanému onboardingu

**User Story:** Jako podnikatel chci se vrátit do onboarding wizardu na stejný krok, kde jsem skončil, abych nemusel zadávat údaje znovu, pokud onboarding přerušuji.

#### Acceptance Criteria

1. WHEN podnikatel opustí onboarding wizard před potvrzením šestého kroku a později se znovu přihlásí, THE Onboarding_Wizard SHALL podnikatele vrátit na první nedokončený krok s předvyplněnými daty z dříve potvrzených kroků.
2. WHILE onboarding wizard není dokončen, THE Free_User_Guard SHALL přesměrovat podnikatele na onboarding wizard z jakékoliv jiné chráněné cesty (dashboard i ostatní autentizované cesty kromě odhlášení).

### Requirement 15: Česká lokalizace

**User Story:** Jako český podnikatel chci, aby celý autentizační a onboarding tok byl v češtině, abych všemu rozuměl a neudělal chybu kvůli jazykové bariéře.

#### Acceptance Criteria

1. THE Auth_Service SHALL zobrazit veškerý UI text registrace, přihlášení, ověření emailu a resetu hesla v češtině v souladu s `R18`.
2. THE Onboarding_Wizard SHALL zobrazit veškerý UI text všech šesti kroků v češtině v souladu s `R18`.
3. THE Auth_Service SHALL odeslat ověřovací email a email pro reset hesla v české jazykové variantě v souladu s `R18`.
4. THE DPA_Manager SHALL zobrazit text DPA modálního dialogu v češtině v souladu s `R18`.
