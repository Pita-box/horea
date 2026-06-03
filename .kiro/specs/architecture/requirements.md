# Requirements Document

> Požadavky na architekturu platformy Horea

> Tento dokument odvozuje **architektonické a platformové požadavky** z dokumentu `design.md`.
> Funkční požadavky jednotlivých feature jsou rozpracovány v samostatných spec dokumentech (viz `design.md`, sekce *Planned Spec Structure*).

## Introduction

Horea je SaaS rezervační platforma pro malé české podniky (kadeřníci, nehtová studia, bistra, masážní salóny, spa, beauty). Cílem těchto požadavků je definovat **měřitelné a ověřitelné podmínky**, které musí platforma jako celek splňovat — nezávisle na konkrétní funkcionalitě. Konkrétní user stories pro jednotlivé funkce (registrace, rezervace, platby, atd.) jsou rozpracovány v samostatných spec dokumentech.

Požadavky jsou odvozeny z designových rozhodnutí v `design.md` a slouží jako:

- Akceptační kritéria pro architektonický základ MVP.
- Vodítka pro feature spec dokumenty — každý feature spec musí být v souladu s těmito požadavky.
- Reference při budoucích architektonických rozhodnutích a migracích.

## Requirements

### Requirement 1: Multi-tenancy a izolace dat

**User Story:** Jako provozovatel platformy potřebuji, aby data každého podniku byla bezpečně izolována od ostatních podniků, aby žádný podnikatel neměl přístup k datům cizího podniku.

#### Acceptance Criteria

1. WHEN podnikatel přistoupí k jakémukoliv tenant-scoped záznamu (rezervace, klient, služba, otevírací doba) THEN platforma SHALL vrátit pouze záznamy s `business_id` rovným ID jeho podniku.
2. WHEN neautentizovaný uživatel přistoupí k veřejné stránce podniku THEN platforma SHALL vrátit pouze data podniků se stavem `is_published = true`.
3. WHERE Supabase Postgres ukládá tenant-scoped data, THE platforma SHALL mít zapnuté Row Level Security (RLS) policies na všech tenant-scoped tabulkách.
4. WHEN klientský kód komunikuje se Supabase, THE platforma SHALL používat výhradně anonymní (anon) nebo uživatelský JWT klíč — NIKDY service role key.
5. WHEN server vkládá rezervaci jménem anonymního klienta, THE platforma SHALL provést validaci business logiky (kapacita slotu, otevírací doba) před zápisem do DB.
6. IF dojde k pokusu o cross-tenant přístup (např. manipulace s `business_id` v requestu) THEN platforma SHALL vrátit chybu autorizace a transakce SHALL být odmítnuta.

### Requirement 2: Měřítko a výkon MVP

**User Story:** Jako provozovatel platformy potřebuji, aby systém pohodlně zvládl cílové MVP měřítko, abychom mohli růst bez okamžité potřeby přepisu architektury.

#### Acceptance Criteria

1. THE platforma SHALL podporovat minimálně **200 platících podniků současně**.
2. THE platforma SHALL zpracovat minimálně **40 000 rezervací měsíčně** (průměr ~1 333/den, ~56/hod) bez degradace UX.
3. WHEN klient navštíví veřejnou stránku podniku THEN platforma SHALL doručit první obsah (TTFB) do **2 sekund** při běžném zatížení.
4. WHEN podnikatel otevře dashboard rezervací THEN platforma SHALL zobrazit seznam rezervací do **3 sekund**.
5. WHILE platforma běží na Vercel + Supabase free tier, THE platforma SHALL zůstat **v mezích kvót obou služeb** (concurrent connections, function invocations, storage, bandwidth).
6. WHEN dojde k peak zatížení (např. Q&A novinová zmínka), THE platforma SHALL primárně chránit dostupnost veřejných stránek (čtení) před plnou funkčností dashboardu (zápis).

### Requirement 3: Provozní jednoduchost (solo developer)

**User Story:** Jako solo vývojář s omezenou kapacitou potřebuji, aby provoz platformy nevyžadoval každodenní zásahy, abych se mohl soustředit na rozvoj produktu.

#### Acceptance Criteria

1. THE platforma SHALL používat výhradně managed služby pro infrastrukturu MVP (Vercel, Supabase, Resend, Cloudflare, GoPay, Google).
2. THE platforma SHALL NOT vyžadovat manuální správu serverů, OS aktualizací ani SSL certifikátů.
3. WHEN dojde k běžné chybě (např. failed API call) THEN platforma SHALL automaticky zkusit operaci znovu (retry s exponenciálním backoffem) bez manuálního zásahu.
4. THE platforma SHALL umožnit deploy nové verze přes `git push` (Vercel automatic deploy).
5. THE platforma SHALL poskytovat agregovaný error log dosažitelný z jednoho místa (Vercel dashboard a/nebo zvolené error tracking řešení).
6. WHEN se objeví chyba blokující transakci (např. selhání platby, selhání backupu) THEN platforma SHALL upozornit administrátora emailem.

### Requirement 4: Náklady MVP

**User Story:** Jako provozovatel platformy s omezeným rozpočtem potřebuji, aby provoz MVP byl prakticky bezplatný, aby projekt mohl být ekonomicky životaschopný od začátku.

#### Acceptance Criteria

1. WHILE počet platících podniků je menší než 200, THE platforma SHALL běžet na free tier všech infrastruktur (Vercel, Supabase, Resend, Cloudflare).
2. THE platforma SHALL NOT používat žádnou službu, která vyžaduje placený plán pro funkčnost MVP (mimo doménu, GoPay obchodní účet a případné předlaunch náklady).
3. WHEN platforma narazí na limit free tieru (storage, function invocations) THEN platforma SHALL administrátora upozornit dříve, než dojde k výpadku.

### Requirement 5: Migrace na vlastní VPS (zadní vrátka)

**User Story:** Jako provozovatel platformy potřebuji možnost v budoucnu přejít z managed služeb na vlastní VPS bez přepisu aplikace, abych měl strategickou kontrolu nad infrastrukturou a náklady.

#### Acceptance Criteria

1. THE platforma SHALL NOT používat žádnou Vercel-specific funkci, která nemá ekvivalent v běžném Node.js prostředí (mimo Cron a Image Optimization, které mají standardní náhrady).
2. THE platforma SHALL NOT používat žádnou Supabase-specific funkci, která nemá ekvivalent v self-hosted Supabase stacku nebo v alternativních open-source řešeních.
3. THE platforma SHALL ukládat veškerý perzistentní stav v Postgres nebo S3-kompatibilním Storage — NIKDY v in-memory paměti procesu.
4. THE platforma SHALL umožnit Next.js standalone build (Docker-deployable image).
5. THE platforma SHALL spravovat secrets výhradně přes environment variables (žádný cloud-vendor specifický secret manager).
6. WHERE platforma využívá specifické integrace (Auth, Storage), THE codebase SHALL používat klientské abstrakce (např. Supabase JS SDK), které jsou kompatibilní se self-hosted variantou.

### Requirement 6: API-friendly návrh (mobilní budoucnost)

**User Story:** Jako produktový vlastník chci, aby budoucí mobilní aplikace (Android/iOS) mohla využít existující backend bez zásadní refaktorizace, aby vývoj mobilní platformy byl ekonomicky proveditelný.

#### Acceptance Criteria

1. THE platforma SHALL oddělit business logiku od HTML / UI vrstvy (logika v server actions / API routes / služebních modulech, ne v React komponentech).
2. THE datový model SHALL být konzistentně dostupný přes server-side endpoints (Next.js API routes nebo server actions) v JSON formátu.
3. WHERE Next.js API routes vrací data klientovi, THE odpovědi SHALL být v dobře definovaném JSON schématu vhodném pro konzumaci mobilním klientem v budoucnu.
4. THE autentizace SHALL používat tokeny (JWT z Supabase Auth) přenášené v hlavičkách nebo cookies — slučitelně s mobilními klienty.

### Requirement 7: Stavový automat předplatného a lifecycle dat

**User Story:** Jako provozovatel platformy potřebuji jasný a deterministický lifecycle účtu od registrace po smazání, aby data byla zpracována správně, GDPR požadavky byly splněny a nedošlo k překvapivým ztrátám dat.

#### Acceptance Criteria

1. THE platforma SHALL implementovat stavy předplatného: `free`, `active`, `grace_period`, `expired`, `deleted_data` (viz `design.md`, sekce *Payments*).
2. WHEN nový uživatel se zaregistruje THEN subscription SHALL přejít do stavu `free`.
3. WHEN první platba uspěje THEN subscription SHALL přejít do stavu `active` a `business.is_published` SHALL přejít na `true`.
4. WHEN auto-charge selže THEN subscription SHALL přejít do stavu `grace_period` a platforma SHALL odeslat klientovi email s QR kódem a fakturou pro manuální platbu. V `grace_period` zůstává `business.is_published = true`.
5. WHEN podnik zůstane v stavu `grace_period` po dobu přesahující 30 dní bez platby THEN subscription SHALL přejít do stavu `expired` a `business.is_published` SHALL přejít na `false`.
6. WHILE podnik je ve stavu `expired` a od prvního selhání platby (`first_failed_charge_at`) uplynulo méně než 90 dní, THE platforma SHALL umožnit reaktivaci předplatného úspěšnou platbou a přechod zpět do stavu `active`.
7. WHEN od prvního selhání platby (`first_failed_charge_at`) uplyne 90 dní (3 měsíce) bez úspěšné platby THEN subscription SHALL přejít do stavu `deleted_data` a platforma SHALL smazat všechna tenant data podniku (profil, služby, otvírací doby, rezervace, klienti) — zachová pouze záznam v `users` (email, password hash) a historii `subscriptions` + `payments` pro účetní účely.
8. BEFORE dojde k mazání dat, THE platforma SHALL odeslat warning email uživateli alespoň jednou s předstihem (přesný timing TBD v `subscription-payments`).
9. WHEN podnik ve stavu `deleted_data` znovu zaplatí předplatné THEN subscription SHALL přejít do stavu `active` a podnik začíná s prázdným profilem.
10. WHEN platforma neúmyslně přejde do nedefinovaného stavu THEN log SHALL obsahovat dostatek informací k diagnóze.

> **Poznámka k načasování:** Jednotnou kotvou všech lhůt (`grace_period`, reaktivace v `expired`, mazání dat) je `first_failed_charge_at` — časové razítko prvního selhání platby (nebo `current_period_end` při vypnuté automatické obnově). Přesná sémantika kotvy a časové limity (0–30 dní `grace_period`, 30–90 dní `expired` s možností reaktivace, 90+ dní `deleted_data`) jsou závazně definovány ve specu `subscription-payments`.

### Requirement 8: Zálohování a obnovitelnost dat

**User Story:** Jako podnikatel potřebuji, aby moje rezervační data byla bezpečně zálohována a v případě výpadku platformy obnovitelná, abych neztratil obchodní záznamy.

#### Acceptance Criteria

1. THE platforma SHALL provádět **denní backup** rezervací každého aktivního i grace podniku do dedikovaného Google Sheetu na osobním Drive provozovatele přes OAuth refresh token.
2. THE platforma SHALL vystavit každému podnikateli **on-demand export** (CSV) jeho rezervací z dashboardu — kdykoliv, bez ohledu na stav denního backup jobu.
3. WHEN backup job narazí na Google API rate limit nebo chybu THEN platforma SHALL zapsat data do **CSV fallback souboru** v dedikované Drive složce, aby data nebyla ztracena.
4. WHEN backup job zpracovává podniky, THE job SHALL respektovat Google Sheets API kvóty (throttle, batch writes).
5. THE platforma SHALL trackovat `last_backup_at` per podnik a zálohovat pouze změny od posledního backupu (incremental).
6. IF backup job selže pro konkrétní podnik THEN administrátor SHALL být upozorněn a job SHALL pokračovat v ostatních podnicích bez přerušení.

### Requirement 9: GDPR — role a procesní povinnosti

**User Story:** Jako provozovatel platformy musím splňovat GDPR jako data processor pro všechny podnikatele-správce, aby platforma byla legálně provozovatelná v EU.

#### Acceptance Criteria

1. THE platforma SHALL při registraci podnikatele vyžadovat akceptaci DPA (Data Processing Agreement) jako součást onboardingu.
2. THE platforma SHALL ukládat verzi akceptované DPA a timestamp akceptace v účtu uživatele.
3. THE platforma SHALL umožnit podnikateli (správci) **smazat libovolnou rezervaci nebo klienta** ze svého dashboardu.
4. WHERE platforma využívá subzpracovatele (Supabase, Vercel, Resend, GoPay, Google, Cloudflare), THE seznam SHALL být součástí DPA a aktualizován při změně.
5. THE platforma SHALL šifrovat data v klidu (Supabase encryption at-rest) a v přenosu (HTTPS / TLS přes Cloudflare a Vercel).
6. WHEN dojde k bezpečnostnímu incidentu, THE provozovatel SHALL mít k dispozici technické prostředky k identifikaci dotčených uživatelů (audit log, error log) v souladu s povinností notifikace správce.
7. WHERE Supabase je nasazen, THE region SHALL být v EU (např. `eu-central` nebo `eu-west`).

### Requirement 10: Bezpečnost — vrstvená ochrana

**User Story:** Jako provozovatel platformy potřebuji, aby platforma odolala běžným útokům (DDoS, SQL injection, XSS, brute-force) bez nutnosti pokročilé bezpečnostní expertízy.

#### Acceptance Criteria

1. THE platforma SHALL umístit Cloudflare před Vercel (DNS na Cloudflare, origin Vercel).
2. THE Cloudflare SHALL aplikovat WAF s OWASP základními pravidly a DDoS ochranu.
3. THE platforma SHALL aplikovat rate limiting na rezervační endpoint (per-IP) jako anti-spam ochranu.
4. THE platforma SHALL provádět server-side validaci všech vstupů (typový + business-logic check) — klientská validace je pouze UX.
5. THE platforma SHALL používat Supabase Auth pro autentizaci (email + heslo, session v HTTP-only secure cookies).
6. THE platforma SHALL ověřovat webhook signatury od GoPay (a všech dalších externích služeb posílajících webhooky).
7. THE platforma SHALL NOT exponovat service role key Supabase v klientském kódu.
8. THE platforma SHALL aplikovat rate limit na pokusy o přihlášení a reset hesla.
9. WHERE uživatelský vstup je zobrazován ostatním (popis podniku, poznámka k rezervaci), THE platforma SHALL aplikovat HTML sanitizaci.

### Requirement 11: Slug-based routing a unikátnost

**User Story:** Jako podnikatel potřebuji vlastní URL pro svou veřejnou stránku, aby ji mohl jednoduše sdílet se svými klienty.

#### Acceptance Criteria

1. THE platforma SHALL přidělit každému podniku unikátní `slug`.
2. THE veřejná stránka podniku SHALL být dostupná na URL `https://www.horea.cz/{slug}`.
3. WHEN podnikatel registruje slug THEN platforma SHALL ověřit unikátnost a odmítnout již obsazené slugy (first-come, first-served).
4. THE slug SHALL splňovat URL-bezpečné požadavky (malá písmena, číslice, pomlčky; bez diakritiky a mezer).
5. WHERE slug koliduje se systémovými routami (např. `/admin`, `/login`, `/api`), THE platforma SHALL slug odmítnout.
6. WHEN podnik je ve stavu `free`, `expired` nebo `deleted` THEN veřejná stránka `/{slug}` SHALL zobrazit hlášku „Tento podnik zatím nepublikoval svůj profil" (a nikoliv obsah profilu).

### Requirement 12: Platby přes GoPay

**User Story:** Jako podnikatel potřebuji jednoduché měsíční předplatné s podporou českých platebních metod, abych nemusel řešit zahraniční platební bránu.

#### Acceptance Criteria

1. THE platforma SHALL integrovat GoPay pro recurring měsíční platby předplatného.
2. WHEN auto-charge karty selže THEN platforma SHALL vygenerovat **QR platbu** (SPAYD standard) a fakturu, a odeslat oboje emailem.
3. THE platforma SHALL ke každému platebnímu pokusu generovat unikátní **variabilní symbol** pro párování ručních plateb.
4. THE platforma SHALL umožnit administrátorovi **manuální spárování platby** v dashboardu (MVP — bez integrace bankovního API).
5. WHEN platba (auto nebo manuální) je úspěšná THEN platforma SHALL prodloužit `subscription.current_period_end` o jeden měsíc a odeslat fakturu emailem.
6. THE platforma SHALL evidovat všechny platební pokusy (úspěšné i neúspěšné) v tabulce `payments` pro účetní auditovatelnost.

### Requirement 13: Email notifikace

**User Story:** Jako podnikatel a klient potřebuji být emailem informován o klíčových událostech (nová rezervace, schválení, odmítnutí, platba), abych byl součástí komunikační smyčky.

#### Acceptance Criteria

1. THE platforma SHALL používat Resend pro odesílání transakčních emailů.
2. WHEN klient odešle rezervaci THEN platforma SHALL odeslat potvrzovací email klientovi a notifikační email podniku.
3. WHEN podnikatel schválí nebo odmítne rezervaci THEN platforma SHALL odeslat klientovi odpovídající email.
4. WHEN platba uspěje THEN platforma SHALL odeslat fakturu emailem.
5. WHEN auto-charge selže THEN platforma SHALL odeslat email s QR kódem, fakturou a bankovními údaji pro manuální platbu.
6. WHEN se blíží mazání dat (po 3 měsících expired) THEN platforma SHALL odeslat warning email.
7. THE platforma SHALL mít nakonfigurovaný SPF, DKIM a DMARC pro doménu Horea.cz, aby emaily nebyly označovány jako spam.
8. IF odeslání emailu selže THEN platforma SHALL operaci zopakovat (retry) a v případě trvalého selhání zalogovat chybu.

### Requirement 14: Dostupnost a degradace

**User Story:** Jako podnikatel a klient očekávám, že platforma bude dostupná v běžných obchodních hodinách, a v případě dílčího výpadku externí služby alespoň částečně funkční.

#### Acceptance Criteria

1. THE platforma SHALL cílit na měsíční dostupnost veřejných stránek a rezervačního formuláře alespoň **99 %** (provozní cíl, ne smluvní SLA pro klienty MVP).
2. WHEN Resend (email služba) je nedostupná THEN platforma SHALL **stále přijímat rezervace** (rezervace se zapíše do DB, email se zařadí do retry fronty nebo se uloží jako pending notifikace).
3. WHEN Google API je nedostupné THEN platforma SHALL pokračovat v core operacích (rezervace, dashboard) a backup job SHALL provést retry později.
4. WHEN Supabase je nedostupný THEN platforma SHALL zobrazit srozumitelnou chybovou stránku (ne stack trace) a nezveřejní citlivé informace.
5. WHEN GoPay je nedostupný v okamžiku checkoutu THEN platforma SHALL umožnit uživateli zopakovat operaci později a nepoškodí stav předplatného.

### Requirement 15: Schvalování rezervací — flexibilita per podnik

**User Story:** Jako podnikatel potřebuji rozhodnout, zda chci rezervace schvalovat ručně nebo automaticky, aby se systém přizpůsobil mému provoznímu stylu.

#### Acceptance Criteria

1. THE platforma SHALL umožnit podnikateli nastavit `auto_approve_reservations: bool` v profilu podniku.
2. THE výchozí hodnota `auto_approve_reservations` SHALL být `false` (manuální schválení).
3. WHEN klient vytvoří rezervaci a `auto_approve_reservations = false` THEN status rezervace SHALL být `pending`.
4. WHEN klient vytvoří rezervaci a `auto_approve_reservations = true` THEN status rezervace SHALL být `approved`.
5. THE platforma SHALL umožnit podnikateli kdykoliv změnit nastavení `auto_approve_reservations` v dashboardu.

### Requirement 16: Slot kapacita — paralelní rezervace

**User Story:** Jako podnikatel s více pracovníky / křesly potřebuji, aby systém umožnil více rezervací ve stejném slotu, aby plně využil moji kapacitu.

#### Acceptance Criteria

1. THE platforma SHALL umožnit podnikateli nastavit `allow_parallel_slots: bool`.
2. THE výchozí hodnota `allow_parallel_slots` SHALL být `false` (1 rezervace na slot).
3. WHEN klient vytvoří rezervaci a slot je obsazen a `allow_parallel_slots = false` THEN platforma SHALL rezervaci odmítnout s informací o obsazenosti.
4. WHEN klient vytvoří rezervaci a `allow_parallel_slots = true` THEN platforma SHALL rezervaci povolit nezávisle na ostatních rezervacích ve stejném slotu (v MVP bez numerické kapacity — viz `design.md` *Open Questions*, bod 4).

### Requirement 17: Admin role a privilegovaný přístup

**User Story:** Jako provozovatel platformy potřebuji administrátorský přístup k veškerým datům a nastavením, abych mohl řešit zákaznickou podporu, párování plateb a provozní problémy.

#### Acceptance Criteria

1. THE platforma SHALL podporovat právě jednu roli `admin` přes flag `users.is_admin = true`.
2. WHEN administrátor je přihlášen THEN RLS policies SHALL mu umožnit čtení všech tenant-scoped dat.
3. THE administrátorský dashboard SHALL být dostupný na samostatné cestě (např. `/admin`) s middleware kontrolou role.
4. THE administrátor SHALL mít možnost: prohlížet seznam uživatelů, nastavit override předplatného (komp účet, prodloužení), spravovat kupóny, ručně spárovat platbu, prohlížet statistiky.
5. WHERE administrátor provádí citlivou akci (změna předplatného, mazání businessu, kupóny) THE platforma SHALL akci zalogovat do audit logu (audit log spec definován v `admin-dashboard`).

### Requirement 18: Přijetí jazyka a lokalizace

**User Story:** Jako český podnikatel a klient potřebuji platformu kompletně v češtině, aby byla srozumitelná pro mě i pro koncové zákazníky.

#### Acceptance Criteria

1. THE platforma SHALL používat češtinu jako jediný jazyk MVP (UI, emaily, hlášky, faktury, public stránky).
2. THE platforma SHALL používat Kč jako jedinou měnu MVP.
3. THE platforma SHALL používat časové pásmo Europe/Prague pro zobrazení časů uživatelům, ukládat časy v UTC v DB.
4. WHERE budoucí verze plánuje multi-jazyk (v2: en, uk, ru, de, es, it, tr, vi), THE codebase SHALL být strukturován tak, aby zavedení i18n nebylo blokováno (oddělení textů od logiky).

### Requirement 19: Identifikace klienta bez registrace

**User Story:** Jako klient (koncový zákazník) chci vytvořit rezervaci bez nutnosti zakládat si účet, aby proces byl rychlý a bezbariérový.

#### Acceptance Criteria

1. THE platforma SHALL NOT vyžadovat klientskou registraci ani přihlášení pro vytvoření rezervace.
2. WHEN klient vyplní rezervační formulář THEN platforma SHALL vyžadovat jméno a alespoň jeden kontaktní údaj (telefon nebo email).
3. WHEN klient vytvoří rezervaci THEN platforma SHALL provést upsert do tabulky `clients` v rámci daného `business_id` na základě kontaktního údaje (přesná match logika v specu `reservation-management`, viz `design.md` *Open Questions*, bod 5).
4. THE klient SHALL existovat výhradně v scope jednoho podniku — žádné cross-tenant sdílení klientských dat.

### Requirement 20: Observability — minimální požadavky

**User Story:** Jako solo vývojář potřebuji vidět, co se v platformě děje, abych mohl rychle diagnostikovat problémy bez náročného setupu.

#### Acceptance Criteria

1. THE platforma SHALL produkovat strukturované server-side logy přístupné přes Vercel dashboard.
2. THE platforma SHALL logovat všechny výjimky s dostatečným kontextem (request ID, user ID, akce) — bez logování citlivých údajů (hesla, tokeny).
3. WHEN dojde k chybě v cron jobu (backup, billing, cleanup) THEN platforma SHALL chybu zalogovat a notifikovat administrátora emailem.
4. WHERE platforma se rozhodne integrovat error tracking (např. Sentry) — rozhodnutí je TBD (`design.md` *Open Questions*, bod 7) — THE integrace SHALL být oddělená od core business logiky (jednoduchá výměna).

### Requirement 21: Typologie podniků

**User Story:** Jako podnikatel chci při registraci vybrat typ svého podniku, aby platforma poskytla relevantní výchozí šablony a UI nuance, ale aby mě omezení typu nesvazovalo v provozu.

#### Acceptance Criteria

1. THE platforma SHALL podporovat tyto typy podniků: kadeřník, nehtové studio, bistro, masážní salón, spa, beauty, ostatní.
2. WHEN podnikatel registruje podnik THEN platforma SHALL vyžadovat výběr právě jednoho typu z podporované sady.
3. THE platforma SHALL používat typ podniku primárně pro UI nuance (ikona, terminologie) a pro výchozí šablony při onboardingu — NIKOLI jako tvrdé omezení rezervační logiky.
4. THE doménová logika rezervací (slot výpočet, detekce konfliktu, schvalování, kapacita) SHALL být napříč typy podniků jednotná, parametrizovaná pouze nastaveními podniku a per-služba parametry.
5. WHEN se v budoucnu přidá nový typ podniku THEN přidání SHALL vyžadovat pouze rozšíření enumerace + případnou šablonu — žádný zásah do rezervační logiky.
