# Requirements Document

## Introduction

Funkce **admin-system-tools** přidává administrátorskou stránku „Správa systému / servisů" (cesta `/admin/system`) pro provozní kontrolu a údržbu platformy Horea. Stránka soustředí na jedno místo: kontrolu funkčnosti klíčových služeb (health checks), zobrazení provozní konfigurace, cílenou revalidaci cache, přehled o stavu cronů s možností ručního otestování a informaci o umístění logů. Přístup ke stránce a všem jejím akcím je vyhrazen výhradně administrátorovi.

Stránka je dále rozšířena o provozní přehledy a údržbové akce navázané na skutečnou infrastrukturu (Next.js 15 na Vercelu, Supabase, Resend, SMTP2GO, GoPay, Cloudflare R2, Google Drive/Sheets): informace o nasazení (build/deploy), stav e-mailové fronty (outbox), stav konfigurace záloh, retence/prune záznamů běhů cronů, čerstvost GoPay webhooků, ruční opětovné spuštění health checků, odeslání testovacího e-mailu, agregované DB/Storage metriky a zobrazení rozvrhu cronů. Všechna tato rozšíření zůstávají výhradně admin-only, běží server-side, nikdy nezveřejní `Secret_Value` a jejich destruktivní/mutující varianty vyžadují explicitní potvrzení.

Funkce vědomě rozlišuje, co je v serverless prostředí (Next.js 15 App Router na Vercelu) **reálně proveditelné** aplikací (HTTP/SDK pingy na služby, cílená revalidace `revalidatePath`/`revalidateTag`, čtení/prune záznamů v Postgres přes Supabase, ruční volání cron endpointů) od toho, co je pouze **informativní** (aplikační logy jdou do `console` → Vercel logs; aplikace nemá perzistentní filesystem a logy nemaže).

Funkce klade zásadní důraz na bezpečnost: žádná kontrola ani výpis nikdy nezveřejní tajné hodnoty (klíče, tokeny, hesla, connection stringy). Zobrazuje pouze stav, latenci, názvy konfiguračních klíčů a příznak „nastaveno / nenastaveno".

### Rozsah a hranice (záměrně mimo rozsah)

- **Mazání aplikačních logů** není proveditelné — aplikace neukládá logy do souborů, píše je do `console` (Vercel logs / log drains). Tato funkce proto u logů poskytuje pouze informativní odkaz a stav, ne destruktivní akci.
- **Prune/retence auditních záznamů `audit_log`** je v rozporu s existujícím návrhem: tabulka `audit_log` je na úrovni DB **append-only a immutable** (feature `admin-dashboard`, migrace 0034). Tato funkce proto auditní záznamy **nemaže**; viz Requirement 9, kde je tato hranice popsána. Pokud bude v budoucnu potřeba retence auditu, musí to být samostatné rozhodnutí měnící append-only návrh — tato funkce ho nemění.
- Funkce **nezavádí** vlastní perzistentní ukládání aplikačních logů ani nové externí závislosti pro monitoring.
- **Automatizovaná záloha (Google Drive/Sheets) NENÍ implementována.** V repozitáři existuje pouze konfigurace přístupu (`src/lib/google/config.ts`); mezi registrovanými crony (`vercel.json`) žádná zálohovací úloha není. Tato funkce proto u záloh poskytuje pouze příznak „nakonfigurováno / nenakonfigurováno" a neposkytuje ruční spuštění neexistující zálohovací úlohy; viz Requirement 18. Případné ruční spuštění zálohy je podmíněný (budoucí) požadavek platný pouze tam, kde zálohovací úloha v kódu existuje. **Pojmenovaný konflikt:** požadavek nesmí předstírat, že zálohovací job existuje.
- **Dedikovaný záznam „poslední přijatý GoPay webhook" NEEXISTUJE.** Route handler `/api/webhooks/gopay` zpracuje webhook a aktualizuje data plateb/předplatných, ale neukládá samostatný záznam o přijetí. Tabulka `payments` navíc nemá sloupec `updated_at` (jen `created_at`); sloupec `updated_at` má pouze tabulka `subscriptions`. Tato funkce proto čerstvost webhooků odvozuje z času poslední platebně řízené změny dat (proxy nad `subscriptions.updated_at`, případně nejnovější `payments.created_at`), nebo z volitelného lehkého záznamu o přijetí zapsaného v route handleru; viz Requirement 20. **Pojmenovaný konflikt:** požadavek nesmí předstírat existenci dedikovaného úložiště přijetí webhooku a musí proxy hodnotu označit jako proxy.
- **Čas nasazení nemusí být dostupný.** Vercel injektuje proměnné jako `VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF` a identifikátor nasazení, ale negarantuje proměnnou s časem nasazení. Tato funkce proto u nedostupných údajů o nasazení (typicky v lokálním vývoji, kde proměnné chybí) zobrazí „nedostupné" a nepředstírá hodnotu; viz Requirement 16.
- **Velikost úložišť je podmíněný údaj.** Spolehlivé zjištění velikosti úložišť (Cloudflare R2, bucket faktur) může vyžadovat nákladné nebo nedostupné operace. Tato funkce zobrazí velikost úložiště pouze tam, kde je levně zjistitelná; jinak položku označí jako „nedostupné" a nezavádí kvůli ní drahé volání; viz Requirement 23.
- **Prune běhů cronů (`cron_runs`) je jediné legitimní „vyčištění logů".** Na rozdíl od append-only `Audit_Log` je tabulka `cron_runs` provozní telemetrie (zaváděná touto funkcí), která roste a není auditní stopa. Tato funkce proto poskytuje retenční akci pro `cron_runs` (smazání starých běhů) jako jedinou destruktivní „úklidovou" akci nad záznamy; viz Requirement 19. Hranice vůči `Audit_Log` zůstává beze změny (Requirement 9).
- **Testovací e-mail reálně odesílá.** Akce odeslání testovacího e-mailu skutečně odešle zprávu přes e-mailového poskytovatele na konfigurovanou administrátorskou adresu (`HOREA_ADMIN_EMAIL`). Je proto destruktivní/nákladná v tom smyslu, že vyvolá vnější efekt: vyžaduje explicitní potvrzení, je chráněna proti opakovanému spuštění (cooldown) a cílí výhradně na konfigurovanou adresu, nikdy na adresu zadanou klientem; viz Requirement 22.

## Glossary

- **System_Tools_Page**: Administrátorská stránka „Správa systému / servisů" na cestě `/admin/system`, dostupná v admin prostředí (`DashboardChrome variant="admin"`).
- **Settings_Icon**: Ikona ozubeného kola (`IconSettings`) v hlavičce (topbar) dashboardu, která pro administrátora odkazuje na System_Tools_Page.
- **Access_Guard**: Existující middleware ochrana cest `/admin/*`, která autentizovaného ne-administrátora odbaví HTTP 403 a neautentizovaného přesměruje na přihlášení.
- **Admin_User**: Autentizovaný uživatel s administrátorskou rolí.
- **Non_Admin_User**: Autentizovaný uživatel bez administrátorské role.
- **Health_Checker**: Server-side komponenta, která paralelně spouští kontroly stavu jednotlivých externích služeb a agreguje výsledek.
- **Service_Probe**: Jednotlivá kontrola stavu jedné monitorované služby (Supabase, Resend, SMTP2GO, GoPay, Cloudflare R2, Google Drive/Sheets).
- **Service_Status**: Výsledný stav jedné služby z množiny `ok` (funkční), `degraded` (funkční se zhoršením, např. překročená měkká hranice latence), `down` (nefunkční / chyba / timeout).
- **Aggregate_Status**: Celkový agregovaný stav platformy odvozený ze stavů všech Service_Probe.
- **Probe_Timeout**: Maximální doba čekání na jednu Service_Probe, po jejímž překročení je výsledek vyhodnocen jako `down`.
- **Config_Inspector**: Server-side komponenta, která zjišťuje provozní konfiguraci (úroveň logování, příznaky „nastaveno / nenastaveno" pro očekávané proměnné prostředí) bez vyzrazení hodnot.
- **Cache_Revalidator**: Server-side akce, která provede cílenou revalidaci konkrétní cesty (`revalidatePath`) nebo tagu (`revalidateTag`).
- **Cron_Monitor**: Server-side komponenta, která zobrazuje stav (poslední běh, výsledek, čas) registrovaných Vercel cron jobů a uvádí zdroj dat.
- **Cron_Job**: Jeden z registrovaných Vercel cron endpointů: `/api/cron/cleanup`, `/api/cron/billing`, `/api/cron/warnings`, `/api/cron/email-retry`.
- **Cron_Trigger**: Server-side akce pro ruční spuštění/test jednoho Cron_Job s autorizací sdíleným tajemstvím (`CRON_SECRET`).
- **Cron_Run_Record**: Záznam o jednom proběhnutém běhu Cron_Job (job, čas, výsledek, případně metriky), který je zdrojem dat pro Cron_Monitor.
- **Log_Location_Info**: Informativní popis, kam směřují aplikační logy (Vercel logs / log drains) a jaká je aktuální úroveň logování.
- **Audit_Log**: Existující append-only tabulka `audit_log` se záznamy citlivých administrátorských akcí (feature `admin-dashboard`).
- **Secret_Value**: Jakákoli tajná hodnota — API klíč, token, heslo, OAuth secret, connection string, sdílené tajemství.
- **Personal_Data**: Jakýkoli osobní údaj (PII) — jméno, e-mailová adresa, telefonní číslo, předmět či obsah e-mailu nebo jiný identifikující údaj klienta či uživatele.
- **Build_Inspector**: Server-side komponenta, která z dostupných proměnných prostředí zjišťuje informace o aktuálním nasazení — identifikátor commitu (`VERCEL_GIT_COMMIT_SHA`), git ref/větev (`VERCEL_GIT_COMMIT_REF`), prostředí (`VERCEL_ENV`), identifikátor nasazení a verzi Node.js (`process.version`) — bez jakékoli Secret_Value.
- **Deploy_Environment**: Prostředí nasazení z množiny `production`, `preview`, `development`, odvozené z proměnné `VERCEL_ENV`.
- **Outbox_Monitor**: Server-side komponenta, která z tabulky `email_outbox` čte agregované počty e-mailů podle stavu, čas nejstaršího čekajícího řádku a počet záznamů připravených k opětovnému odeslání, bez jakéhokoli Personal_Data.
- **Email_Outbox**: Existující tabulka `email_outbox` (migrace 0041, `src/lib/email/outbox.ts`) pro přechodně neúspěšné e-maily; stav řádku je z množiny `pending` (čekající), `sent` (odeslaný), `dead` (trvale neúspěšný).
- **Backup_Status_Info**: Informativní přehled stavu záloh (Google Drive/Sheets): dostupnost služby (Service_Status z Health_Checker) a příznak „nakonfigurováno / nenakonfigurováno" odvozený z přítomnosti očekávaných `GOOGLE_*` proměnných prostředí, bez jakékoli Secret_Value.
- **Cron_Run_Pruner**: Server-side akce, která smaže záznamy Cron_Run_Record v tabulce `cron_runs` starší než zadaná hranice retence; nikdy se netýká append-only Audit_Log.
- **Webhook_Freshness_Monitor**: Server-side komponenta, která zjišťuje čas poslední platebně řízené aktivity (proxy nad `subscriptions.updated_at`, případně nejnovější `payments.created_at`, nebo volitelný lehký záznam o přijetí webhooku) a porovnává ho s Webhook_Freshness_Threshold, bez jakékoli Secret_Value a Personal_Data.
- **Webhook_Freshness_Threshold**: Časová hranice (48 hodin), po jejímž překročení je poslední platebně řízená aktivita označena jako zastaralá.
- **Health_Recheck_Action**: Server-side akce, která na vyžádání Admin_User znovu spustí Health_Checker a vrátí nový výsledek včetně času kontroly.
- **Last_Check_Time**: Čas dokončení poslední kontroly stavu provedené Health_Checker (`checkedAt`).
- **Test_Email_Action**: Server-side akce, která po potvrzení a v rámci omezení četnosti odešle testovací e-mail výhradně na Admin_Email_Address za účelem ověření doručitelnosti.
- **Test_Email_Cooldown**: Minimální doba (60 sekund) mezi dvěma po sobě jdoucími úspěšnými spuštěními Test_Email_Action, která brání opakovanému odesílání.
- **Admin_Email_Address**: Konfigurovaná administrátorská e-mailová adresa z proměnné prostředí `HOREA_ADMIN_EMAIL`, jediný povolený cíl Test_Email_Action.
- **DB_Metrics**: Agregované počty klíčových entit (podniky, rezervace, klienti) zjištěné server-side dotazy typu `count`, bez jakéhokoli Personal_Data.
- **Storage_Metrics**: Volitelné agregované údaje o velikosti úložišť (Cloudflare R2, bucket faktur), zobrazené pouze tam, kde jsou levně zjistitelné; jinak označené jako „nedostupné".
- **Metrics_Inspector**: Server-side komponenta, která přes service-role čtení zobrazuje agregované provozní metriky (DB_Metrics, případně Storage_Metrics) bez jakéhokoli Personal_Data.
- **Cron_Schedule_Map**: Deklarovaná mapa rozvrhů registrovaných Cron_Job odpovídající `vercel.json` (cron výrazy), sloužící jako zdroj očekávaného rozvrhu a příštího plánovaného běhu.
- **Cron_Schedule_Inspector**: Server-side komponenta, která vedle posledního běhu (Cron_Monitor) zobrazuje očekávaný rozvrh a příští plánovaný čas každého Cron_Job a upozorňuje na Schedule_Drift.
- **Schedule_Drift**: Nesoulad mezi množinou Cron_Job registrovaných v `vercel.json` (a jejich rozvrhy) a množinou Cron_Job monitorovaných funkcí (chybějící, přebývající nebo neodpovídající úloha).

## Requirements

### Requirement 1: Zobrazení ikony nastavení v hlavičce pro administrátora

**User Story:** Jako administrátor chci v hlavičce vidět ikonu nastavení odkazující na správu systému, abych měl provozní nástroje rychle po ruce.

#### Acceptance Criteria

1. WHILE je v admin prostředí přihlášen Admin_User, THE Settings_Icon SHALL být zobrazena v hlavičce dashboardu.
2. WHEN Admin_User aktivuje Settings_Icon, THE System_Tools_Page SHALL být otevřena na cestě `/admin/system`.
3. WHILE je zobrazena pro Admin_User, THE Settings_Icon SHALL nést přístupný název odkazu „Správa systému".
4. THE Settings_Icon SHALL zůstat funkčně i vizuálně oddělena od ikony účtu, která odkazuje na `/admin/account`.

### Requirement 2: Řízení přístupu k System_Tools_Page

**User Story:** Jako provozovatel platformy chci, aby správu systému viděl a používal jen administrátor, aby provozní nástroje nemohl zneužít nikdo jiný.

#### Acceptance Criteria

1. WHEN Admin_User otevře cestu `/admin/system`, THE System_Tools_Page SHALL zobrazit obsah správy systému.
2. IF Non_Admin_User požádá o cestu `/admin/system`, THEN THE Access_Guard SHALL vrátit HTTP 403 bez obsahu správy systému.
3. IF neautentizovaný požadavek směřuje na cestu `/admin/system`, THEN THE Access_Guard SHALL přesměrovat požadavek na přihlášení a neodeslat žádný obsah správy systému před ověřením autentizace.
4. IF Non_Admin_User požádá o kterýkoli serverový endpoint nebo akci funkce admin-system-tools, THEN THE System_Tools_Page SHALL akci odmítnout s HTTP 403 a neprovést žádnou změnu.

### Requirement 3: Health check jednotlivých služeb

**User Story:** Jako administrátor chci u každé klíčové služby vidět, zda funguje, abych poznal, kde je problém.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí kontrolu stavu, THE Health_Checker SHALL provést Service_Probe pro každou z těchto služeb: Supabase (databáze, Auth, Storage), Resend, SMTP2GO, GoPay, Cloudflare R2, Google Drive/Sheets.
2. WHEN Service_Probe doběhne úspěšně, THE Health_Checker SHALL přiřadit dané službě Service_Status `ok`.
3. IF Service_Probe skončí chybovou odpovědí nebo výjimkou, THEN THE Health_Checker SHALL přiřadit dané službě Service_Status `down`.
4. WHEN Service_Probe doběhne úspěšně, THE Health_Checker SHALL zaznamenat naměřenou latenci dané služby v milisekundách.
5. THE Health_Checker SHALL u každé služby zobrazit její název a aktuální Service_Status.

### Requirement 4: Časový limit a paralelní provedení health checků

**User Story:** Jako administrátor chci, aby se kontrola stavu načetla rychle i při výpadku některé služby, aby mě nezablokovala jedna nereagující závislost.

#### Acceptance Criteria

1. THE Health_Checker SHALL spouštět všechny Service_Probe paralelně.
2. IF Service_Probe nedoběhne do Probe_Timeout 5 sekund, THEN THE Health_Checker SHALL danou Service_Probe ukončit a přiřadit službě Service_Status `down` s důvodem „timeout".
3. WHEN uplyne 6 sekund od zahájení kontroly, THE Health_Checker SHALL ukončit všechny dosud neukončené Service_Probe a vrátit výsledek bez ohledu na jejich Probe_Timeout.
4. IF jedna Service_Probe selže, THEN THE Health_Checker SHALL přesto vrátit výsledky ostatních Service_Probe.

### Requirement 5: Agregovaný celkový stav

**User Story:** Jako administrátor chci jeden souhrnný indikátor stavu platformy, abych na první pohled poznal, zda je vše v pořádku.

#### Acceptance Criteria

1. WHEN všechny Service_Probe mají Service_Status `ok`, THE Health_Checker SHALL nastavit Aggregate_Status na `ok`.
2. WHEN alespoň jedna Service_Probe získá Service_Status `down`, THE Health_Checker SHALL okamžitě nastavit Aggregate_Status na `down`.
3. WHILE žádná Service_Probe nemá Service_Status `down` a alespoň jedna má Service_Status `degraded`, THE Health_Checker SHALL nastavit Aggregate_Status na `degraded`.
4. WHILE existuje vypočtený Aggregate_Status, THE System_Tools_Page SHALL vždy zobrazit jeho vizuálně odlišený indikátor pro stavy `ok`, `degraded` a `down`.

### Requirement 6: Ochrana tajemství v kontrolách a výpisech

**User Story:** Jako provozovatel chci mít jistotu, že provozní stránka nikdy nezobrazí tajné hodnoty, aby únikem ze stránky nešlo kompromitovat platformu.

#### Acceptance Criteria

1. THE Health_Checker SHALL ve výsledku health checku vyloučit jakoukoli Secret_Value.
2. THE Config_Inspector SHALL ve výstupu provozní konfigurace vyloučit jakoukoli Secret_Value.
3. WHERE je nutné odkázat na konfigurační položku, THE System_Tools_Page SHALL zobrazit vždy alespoň název konfiguračního klíče a nikdy jeho hodnotu.
4. IF Service_Probe selže, THEN THE Health_Checker SHALL ve zprávě o chybě uvést pouze typ chyby a stav, bez jakékoli Secret_Value.

### Requirement 7: Zobrazení provozní konfigurace

**User Story:** Jako administrátor chci vidět aktuální provozní konfiguraci platformy, abych ověřil, že je prostředí správně nastavené.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí provozní konfiguraci, THE Config_Inspector SHALL zobrazit aktuální úroveň logování (`LOG_LEVEL`).
2. THE Config_Inspector SHALL pro každou očekávanou proměnnou prostředí zobrazit příznak „nastaveno" nebo „nenastaveno" jako logickou hodnotu.
3. THE Config_Inspector SHALL zobrazit Log_Location_Info popisující, že aplikační logy směřují do výstupu konzole čteného Vercel logy.
4. IF očekávaná proměnná prostředí není nastavena, THEN THE Config_Inspector SHALL danou proměnnou označit jako „nenastaveno" a nezobrazit žádnou hodnotu.

### Requirement 8: Umístění logů (informativní)

**User Story:** Jako administrátor chci vědět, kde najdu logy a jak je teď nastavená jejich úroveň, abych mohl dohledat provozní události.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí sekci logů, THE System_Tools_Page SHALL zobrazit Log_Location_Info s pokynem, kde aplikační logy najít (Vercel logs / log drains).
2. THE System_Tools_Page SHALL v sekci logů zobrazit aktuální úroveň logování (`LOG_LEVEL`).
3. THE System_Tools_Page SHALL v sekci logů uvést, že aplikační logy nejsou ukládány do perzistentního souborového úložiště a aplikace je nemaže.

### Requirement 9: Auditní záznamy zůstávají neměnné (hranice „vyčistit logy")

**User Story:** Jako provozovatel chci, aby provozní stránka neporušila neměnnost auditní stopy, aby zůstala důvěryhodná pro pozdější kontrolu.

#### Acceptance Criteria

1. THE System_Tools_Page SHALL uvést, že tabulka Audit_Log je append-only a tato funkce auditní záznamy nemaže ani nemění.
2. THE System_Tools_Page SHALL neposkytovat žádnou akci, která maže nebo upravuje záznamy v Audit_Log.
3. WHERE Admin_User potřebuje prohlížet auditní záznamy, THE System_Tools_Page SHALL vždy odkázat na existující stránku auditu `/admin/audit`.

### Requirement 10: Cílená revalidace cache

**User Story:** Jako administrátor chci po změně dat cíleně revalidovat konkrétní cestu nebo tag, aby se uživatelům zobrazil aktuální obsah bez globálního výpadku cache.

#### Acceptance Criteria

1. WHEN Admin_User potvrdí revalidaci konkrétní cesty, THE Cache_Revalidator SHALL provést `revalidatePath` pro zadanou cestu.
2. WHEN Admin_User potvrdí revalidaci konkrétního tagu, THE Cache_Revalidator SHALL provést `revalidateTag` pro zadaný tag.
3. BEFORE provedení revalidace, THE System_Tools_Page SHALL vyžadovat od Admin_User explicitní potvrzení akce.
4. WHEN revalidace doběhne, THE System_Tools_Page SHALL zobrazit výsledek (úspěch nebo chybu) a název revalidované cesty nebo tagu.
5. THE Cache_Revalidator SHALL revalidovat pouze cesty a tagy z předem definovaného seznamu povolených cílů.
6. IF Admin_User zadá cíl revalidace mimo seznam povolených cílů, THEN THE Cache_Revalidator SHALL akci odmítnout a nezměnit žádnou cache.

### Requirement 11: Přehled stavu cronů

**User Story:** Jako administrátor chci vidět, kdy naposledy běžel každý cron a jak dopadl, abych poznal, že naplánované úlohy fungují.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí přehled cronů, THE Cron_Monitor SHALL zobrazit pro každý Cron_Job čas posledního běhu a jeho výsledek.
2. THE Cron_Monitor SHALL u zobrazeného stavu cronů uvést zdroj dat, ze kterého stav pochází (Cron_Run_Record).
3. IF pro Cron_Job neexistuje žádný Cron_Run_Record, THEN THE Cron_Monitor SHALL daný Cron_Job označit jako „bez zaznamenaného běhu" a nezobrazit žádné údaje o běhu (čas, výsledek).
4. WHEN Cron_Job doběhne (plánovaně nebo ručně), THE System SHALL vytvořit Cron_Run_Record s časem běhu a jeho výsledkem.

### Requirement 12: Ruční spuštění / test cronu

**User Story:** Jako administrátor chci moct cron ručně spustit a otestovat, abych ověřil jeho funkčnost mimo plánovaný čas.

#### Acceptance Criteria

1. WHEN Admin_User potvrdí ruční spuštění konkrétního Cron_Job, THE Cron_Trigger SHALL daný Cron_Job zavolat server-side s autorizací `Authorization: Bearer <CRON_SECRET>`.
2. BEFORE ručního spuštění Cron_Job, THE System_Tools_Page SHALL vyžadovat od Admin_User explicitní potvrzení akce.
3. WHEN ruční spuštění Cron_Job doběhne, THE System_Tools_Page SHALL zobrazit výsledek běhu (úspěch nebo chybu).
4. IF proměnná `CRON_SECRET` není nastavena, THEN THE Cron_Trigger SHALL ruční spuštění odmítnout a zobrazit stav „cron tajemství není nastaveno".
5. THE Cron_Trigger SHALL `CRON_SECRET` použít pouze server-side a nikdy ho nezobrazit ani neodeslat klientovi.

### Requirement 13: Chybové stavy a fallbacky

**User Story:** Jako administrátor chci, aby mi stránka i při selhání dílčí akce zůstala použitelná a srozumitelně mi řekla, co se nepovedlo.

#### Acceptance Criteria

1. IF načtení kontroly stavu selže jako celek, THEN THE System_Tools_Page SHALL zobrazit českou chybovou hlášku a umožnit opakování akce.
2. IF revalidace cache selže, THEN THE System_Tools_Page SHALL zobrazit českou chybovou hlášku a ponechat zbytek stránky funkční i v případě kritického selhání revalidace.
3. IF ruční spuštění Cron_Job selže, THEN THE System_Tools_Page SHALL zobrazit českou chybovou hlášku s výsledkem a ponechat zbytek stránky funkční.
4. IF zdroj dat pro Cron_Monitor je nedostupný, THEN THE Cron_Monitor SHALL zobrazit stav „stav cronů je momentálně nedostupný" namísto chyby celé stránky.

### Requirement 14: Přístupnost

**User Story:** Jako administrátor používající asistivní technologie chci stránku správy systému plně ovládat, abych mohl provádět provozní úkony bez bariér.

#### Acceptance Criteria

1. THE System_Tools_Page SHALL každý Service_Status a Aggregate_Status doplnit textovým označením stavu, nikoli pouze barvou.
2. THE System_Tools_Page SHALL umožnit ovládání všech interaktivních prvků (akce, potvrzení) klávesnicí.
3. WHEN se změní výsledek health checku, revalidace nebo spuštění cronu, THE System_Tools_Page SHALL tuto změnu oznámit asistivním technologiím prostřednictvím živé oblasti (ARIA live region).
4. THE Settings_Icon SHALL nést přístupný název čitelný asistivní technologií.

### Requirement 15: Potvrzení a server-side provedení citlivých akcí

**User Story:** Jako provozovatel chci, aby citlivé a destruktivní provozní akce běžely jen na serveru a po potvrzení, aby nešly spustit omylem ani z klienta.

#### Acceptance Criteria

1. THE System_Tools_Page SHALL provádět revalidaci cache, ruční spuštění cronu a další citlivé akce výhradně server-side.
2. BEFORE provedení revalidace cache nebo ručního spuštění cronu, THE System_Tools_Page SHALL vyžadovat explicitní potvrzení Admin_User.
3. WHEN je citlivá akce provedena, THE System_Tools_Page SHALL zobrazit její výsledek Admin_User.
4. THE System_Tools_Page SHALL při provádění citlivých akcí dodržet zákaz logování jakékoli Secret_Value.

### Requirement 16: Informace o nasazení (build/deploy)

**User Story:** Jako administrátor chci vidět, jaká verze aplikace je právě nasazená a v jakém prostředí běží, abych rychle ověřil, co je v provozu, a zorientoval se při řešení incidentů.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí informace o nasazení, THE Build_Inspector SHALL zobrazit identifikátor commitu z proměnné `VERCEL_GIT_COMMIT_SHA`.
2. WHEN Admin_User zobrazí informace o nasazení, THE Build_Inspector SHALL zobrazit git ref / větev nasazení z proměnné `VERCEL_GIT_COMMIT_REF`.
3. WHEN Admin_User zobrazí informace o nasazení, THE Build_Inspector SHALL zobrazit Deploy_Environment z proměnné `VERCEL_ENV` jako jednu z hodnot `production`, `preview` nebo `development`.
4. WHEN Admin_User zobrazí informace o nasazení, THE Build_Inspector SHALL zobrazit identifikátor nasazení (deploy id).
5. WHEN Admin_User zobrazí informace o nasazení, THE Build_Inspector SHALL zobrazit verzi Node.js z hodnoty `process.version`.
6. IF očekávaná proměnná prostředí pro některý údaj o nasazení není dostupná, THEN THE Build_Inspector SHALL daný údaj zobrazit jako „nedostupné" a nezobrazit žádnou náhradní hodnotu.
7. THE Build_Inspector SHALL ve výstupu informací o nasazení vyloučit jakoukoli Secret_Value.
8. THE Build_Inspector SHALL zobrazit Deploy_Environment textovým označením, nikoli pouze barvou.

### Requirement 17: Stav e-mailové fronty (outbox)

**User Story:** Jako administrátor chci vidět, kolik e-mailů čeká, bylo odesláno nebo trvale selhalo, abych poznal, zda se nehromadí nedoručené e-maily, aniž bych viděl jejich obsah.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí stav e-mailové fronty, THE Outbox_Monitor SHALL zobrazit agregovaný počet řádků Email_Outbox ve stavech `pending` (čekající), `sent` (odeslané) a `dead` (trvale neúspěšné).
2. WHEN existuje alespoň jeden řádek Email_Outbox ve stavu `pending`, THE Outbox_Monitor SHALL zobrazit čas vytvoření (`created_at`) nejstaršího čekajícího řádku.
3. WHEN Admin_User zobrazí stav e-mailové fronty, THE Outbox_Monitor SHALL zobrazit počet řádků Email_Outbox připravených k opětovnému odeslání, tedy řádků ve stavu `pending` s časem `next_attempt_at` v minulosti nebo rovným aktuálnímu času.
4. IF žádný řádek Email_Outbox nemá stav `pending`, THEN THE Outbox_Monitor SHALL zobrazit, že žádný čekající e-mail neexistuje, a nezobrazit žádný čas nejstaršího čekajícího řádku.
5. THE Outbox_Monitor SHALL ve výstupu stavu e-mailové fronty vyloučit jakékoli Personal_Data (cílové adresy, jména, předměty, obsah těla zprávy).
6. THE Outbox_Monitor SHALL u stavu e-mailové fronty uvést souvislost s Cron_Job `/api/cron/email-retry`, který frontu zpracovává.
7. IF zdroj dat e-mailové fronty je nedostupný, THEN THE Outbox_Monitor SHALL zobrazit stav „stav e-mailové fronty je momentálně nedostupný" namísto chyby celé stránky.

### Requirement 18: Stav záloh (informativní)

**User Story:** Jako administrátor chci vědět, zda je zálohování do Google Drive/Sheets nakonfigurováno a dostupné, abych měl jasno, jestli a kde se zálohy řeší.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí sekci záloh, THE Backup_Status_Info SHALL zobrazit příznak „nakonfigurováno" nebo „nenakonfigurováno" odvozený z přítomnosti proměnných `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` a `GOOGLE_DRIVE_BACKUP_FOLDER_ID`, bez zobrazení jejich hodnot.
2. WHEN Admin_User zobrazí sekci záloh, THE Backup_Status_Info SHALL zobrazit dostupnost Google Drive zjištěnou Health_Checker (Service_Status z Requirement 3).
3. THE Backup_Status_Info SHALL uvést, že automatizovaná zálohovací úloha není v této aplikaci implementována a nevyskytuje se mezi registrovanými cronovými úlohami, a že stránka proto nezobrazuje čas poslední zálohy.
4. THE System_Tools_Page SHALL v sekci záloh neposkytovat žádnou akci pro ruční spuštění zálohy, dokud zálohovací úloha v kódu neexistuje.
5. THE Backup_Status_Info SHALL ve výstupu stavu záloh vyloučit jakoukoli Secret_Value.
6. WHERE v kódu existuje implementovaná zálohovací úloha, THE System_Tools_Page SHALL teprve potom zobrazit čas posledního běhu zálohy a poskytnout její ruční spuštění stejným vzorem jako Cron_Trigger (server-side, s potvrzením, jen Admin_User) (podmíněný budoucí požadavek).

### Requirement 19: Retence záznamů běhů cronů (prune `cron_runs`)

**User Story:** Jako administrátor chci moct smazat staré záznamy o bězích cronů, aby provozní telemetrie nerostla bez omezení, aniž bych zasáhl do auditní stopy.

#### Acceptance Criteria

1. WHEN Admin_User potvrdí smazání záznamů běhů cronů starších než zadaný počet dní, THE Cron_Run_Pruner SHALL server-side smazat z tabulky `cron_runs` všechny Cron_Run_Record starší než zadaná hranice retence.
2. WHERE Admin_User nezadá počet dní, THE Cron_Run_Pruner SHALL použít výchozí hranici retence 90 dní.
3. BEFORE smazáním záznamů Cron_Run_Record, THE System_Tools_Page SHALL vyžadovat od Admin_User explicitní potvrzení akce.
4. WHEN smazání záznamů Cron_Run_Record doběhne, THE System_Tools_Page SHALL zobrazit počet smazaných záznamů.
5. THE Cron_Run_Pruner SHALL mazat výhradně záznamy v tabulce `cron_runs` a nikdy nemazat ani neměnit žádný záznam v append-only Audit_Log.
6. IF o akci Cron_Run_Pruner požádá Non_Admin_User, THEN THE System_Tools_Page SHALL akci odmítnout s HTTP 403 a nesmazat žádný záznam.

### Requirement 20: Čerstvost GoPay webhooku

**User Story:** Jako administrátor chci vidět, kdy naposledy dorazila platebně řízená aktivita z GoPay webhooků, abych poznal možný výpadek doručování plateb, aniž bych viděl tajemství nebo osobní údaje.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí čerstvost GoPay webhooku, THE Webhook_Freshness_Monitor SHALL zobrazit čas poslední platebně řízené aktivity odvozený z času poslední změny v tabulce `subscriptions` (`updated_at`), případně z nejnovějšího `payments.created_at`.
2. THE Webhook_Freshness_Monitor SHALL u zobrazeného času uvést, že jde o odvozenou (proxy) hodnotu, nikoli o dedikovaný záznam přijetí webhooku.
3. IF čas poslední platebně řízené aktivity je starší než Webhook_Freshness_Threshold 48 hodin, THEN THE Webhook_Freshness_Monitor SHALL zobrazit upozornění na zastaralost s textovým označením, nikoli pouze barvou.
4. IF neexistuje žádná zaznamenaná platebně řízená změna dat, THEN THE Webhook_Freshness_Monitor SHALL zobrazit stav „bez zaznamenané aktivity" a nezobrazit žádný čas.
5. THE Webhook_Freshness_Monitor SHALL ve svém výstupu vyloučit jakoukoli Secret_Value a jakékoli Personal_Data.
6. WHERE je v aplikaci zaveden lehký záznam času posledního přijatého GoPay webhooku, THE Webhook_Freshness_Monitor SHALL zobrazit tento čas přijetí místo proxy hodnoty.
7. IF zdroj dat pro čerstvost webhooku je nedostupný, THEN THE Webhook_Freshness_Monitor SHALL zobrazit stav „čerstvost webhooku je momentálně nedostupná" namísto chyby celé stránky.

### Requirement 21: Ruční opětovné spuštění health checků a čas kontroly

**User Story:** Jako administrátor chci moct kontrolu stavu spustit znovu na vyžádání a vidět čas poslední kontroly, abych si ověřil aktuální stav bez nutnosti znovu načítat stránku.

#### Acceptance Criteria

1. WHEN Admin_User aktivuje akci „Zkontrolovat znovu", THE Health_Recheck_Action SHALL server-side znovu spustit Health_Checker a vrátit nový výsledek.
2. THE System_Tools_Page SHALL vždy zobrazit Last_Check_Time (`checkedAt`) u výsledku health checku.
3. WHEN doběhne opětovné spuštění health checků, THE System_Tools_Page SHALL aktualizovaný Last_Check_Time (`checkedAt`) a nový výsledek oznámit asistivním technologiím prostřednictvím živé oblasti (ARIA live region).
4. IF o akci Health_Recheck_Action požádá Non_Admin_User, THEN THE System_Tools_Page SHALL akci odmítnout s HTTP 403 a neprovést žádnou kontrolu.

### Requirement 22: Odeslání testovacího e-mailu

**User Story:** Jako administrátor chci poslat testovací e-mail na administrátorskou adresu, abych end-to-end ověřil doručitelnost e-mailů z platformy.

#### Acceptance Criteria

1. WHEN Admin_User potvrdí odeslání testovacího e-mailu, THE Test_Email_Action SHALL server-side odeslat testovací e-mail výhradně na Admin_Email_Address (`HOREA_ADMIN_EMAIL`).
2. BEFORE odesláním testovacího e-mailu, THE System_Tools_Page SHALL vyžadovat od Admin_User explicitní potvrzení akce.
3. IF proměnná `HOREA_ADMIN_EMAIL` není nastavena, THEN THE Test_Email_Action SHALL odeslání odmítnout a zobrazit stav „administrátorská adresa není nastavena".
4. IF od posledního úspěšného odeslání neuplynul Test_Email_Cooldown, THEN THE Test_Email_Action SHALL další odeslání odmítnout a zobrazit zbývající dobu do dalšího pokusu.
5. THE Test_Email_Action SHALL odmítnout jakýkoli cíl odeslání zadaný klientem a odeslat výhradně na Admin_Email_Address.
6. WHEN odeslání testovacího e-mailu doběhne, THE System_Tools_Page SHALL zobrazit výsledek (úspěch nebo chybu) bez jakéhokoli Personal_Data nad rámec Admin_Email_Address.
7. IF o akci Test_Email_Action požádá Non_Admin_User, THEN THE System_Tools_Page SHALL akci odmítnout s HTTP 403 a neodeslat žádný e-mail.

### Requirement 23: Agregované metriky databáze a úložiště

**User Story:** Jako administrátor chci vidět počty klíčových entit a případně velikost úložišť, abych měl přehled o objemu provozních dat, aniž bych viděl osobní údaje.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí provozní metriky, THE Metrics_Inspector SHALL přes service-role čtení typu `count` zobrazit DB_Metrics: počet podniků, počet rezervací a počet klientů.
2. WHERE je velikost úložiště (Cloudflare R2, bucket faktur) levně zjistitelná, THE Metrics_Inspector SHALL zobrazit Storage_Metrics s touto velikostí.
3. IF velikost úložiště není levně zjistitelná, THEN THE Metrics_Inspector SHALL Storage_Metrics označit jako „nedostupné" a neprovést žádné nákladné volání pro její zjištění.
4. THE Metrics_Inspector SHALL ve výstupu DB_Metrics a Storage_Metrics vyloučit jakékoli Personal_Data a zobrazit pouze agregované počty.
5. IF zjištění DB_Metrics selže, THEN THE Metrics_Inspector SHALL zobrazit stav „metriky databáze jsou momentálně nedostupné" namísto chyby celé stránky.

### Requirement 24: Plánovaný rozvrh cronů a detekce driftu

**User Story:** Jako administrátor chci vedle posledního běhu vidět i plánovaný rozvrh cronů a příští plánovaný čas, abych poznal, kdy úloha poběží a zda monitorované úlohy odpovídají konfiguraci.

#### Acceptance Criteria

1. WHEN Admin_User zobrazí přehled cronů, THE Cron_Schedule_Inspector SHALL pro každý Cron_Job zobrazit očekávaný rozvrh (cron výraz) z Cron_Schedule_Map.
2. WHEN Admin_User zobrazí přehled cronů, THE Cron_Schedule_Inspector SHALL pro každý Cron_Job zobrazit příští plánovaný čas běhu odvozený z jeho rozvrhu.
3. THE Cron_Schedule_Map SHALL odpovídat rozvrhům deklarovaným v `vercel.json`: `/api/cron/billing` rozvrh `0 3 * * *`, `/api/cron/warnings` rozvrh `30 3 * * *`, `/api/cron/cleanup` rozvrh `0 4 * * *`, `/api/cron/email-retry` rozvrh `*/15 * * * *`.
4. IF množina Cron_Job registrovaných v `vercel.json` neodpovídá množině monitorovaných Cron_Job nebo deklarovaný rozvrh v Cron_Schedule_Map neodpovídá očekávané hodnotě pro daný Cron_Job, THEN THE Cron_Schedule_Inspector SHALL zobrazit Schedule_Drift s textovým označením chybějících, přebývajících nebo neodpovídajících úloh.
