# Requirements Document

> Požadavky na feature **subscription-payments** — předplatné podniků platformě Horea.
>
> Tento dokument navazuje na `architecture/requirements.md` a `architecture/design.md`. Soulad s architektonickými požadavky **R3** (provozní jednoduchost), **R4** (náklady MVP), **R7** (stavový automat předplatného a lifecycle dat), **R9** (GDPR), **R10** (bezpečnost / HMAC webhooky), **R12** (platby přes GoPay), **R13** (email notifikace) a **R18** (čeština) je závazný.

## Introduction

Tato feature pokrývá kompletní platební a předplatitelský životní cyklus podniku na platformě Horea: výběr tarifu a první platbu, založení opakované (recurring) platby přes GoPay, měsíční automatické strhávání, zpracování platebních webhooků, fallback na ruční platbu QR kódem a převodem, generování faktur, stavový automat předplatného (`free` → `active` → `grace_period` → `expired` → `deleted_data`) včetně přesných časových limitů a mazání dat, změny tarifu, aplikaci kupónů při checkoutu, zrušení automatické obnovy a denní cron úlohy, které celý cyklus pohánějí.

Architektura (`architecture/design.md`, sekce *Payments*) i požadavek **R7.8** explicitně odkládají **přesné časové limity a načasování varovných emailů** do tohoto specu. Tento dokument je tedy závazným zdrojem pravdy pro tyto hodnoty.

**Provozní předpoklad:** Recurring platby přes GoPay vyžadují schválený obchodní (merchant) účet GoPay. Schválení účtu je provozní předpoklad, který musí být vyřešen před spuštěním placeného režimu, a nespadá do softwarového rozsahu této feature.

**Co NENÍ v rozsahu této feature:**

- **Administrace kupónů (CRUD)** — vytváření, editace a mazání kupónů řeší spec `admin-dashboard`. Zde je pouze *aplikace* existujícího kupónu při checkoutu.
- **UI pro ruční párování plateb** — obrazovka, kde administrátor páruje příchozí platbu, je součástí specu `admin-dashboard`. Zde je definován pouze datový záznam platby a *efekt* spárování na předplatné.
- **Platby koncových klientů za rezervace** (zálohy, depozity) — nejsou součástí MVP.
- **Záloha do Google Sheets** — řeší architektonický požadavek R8 a samostatný spec.

## Glossary

- **Platforma**: Softwarový systém Horea (Next.js aplikace na Vercelu) jako celek, pokud není uveden konkrétnější subsystém.
- **Checkout**: Subsystém Platformy, který zpracovává výběr tarifu, aplikaci kupónu a iniciaci první platby.
- **Billing_Engine**: Subsystém Platformy odpovědný za zakládání recurring schedule v GoPay a iniciaci měsíčních strhávání.
- **Webhook_Handler**: Endpoint Platformy `/api/webhooks/gopay`, který přijímá a zpracovává platební notifikace od GoPay.
- **Stavovy_Automat**: Logika Platformy řídící přechody mezi stavy `subscription.status`.
- **Faktura_Generator**: Subsystém Platformy generující PDF faktury a přidělující jim pořadová čísla.
- **QR_Generator**: Subsystém Platformy generující platební QR kód ve formátu SPAYD.
- **Billing_Cron**: Denní plánovaná úloha `/api/cron/billing` strhávající splatná předplatná a odesílající QR při selhání.
- **Cleanup_Cron**: Denní plánovaná úloha `/api/cron/cleanup` mazající tenant data podniků po vypršení lhůty.
- **Warning_Cron**: Denní plánovaná úloha odesílající varovné emaily před přechody stavu předplatného.
- **GoPay**: Externí platební brána zajišťující recurring platby a webhooky.
- **Subscription (předplatné)**: Záznam v tabulce `subscriptions` patřící jednomu podniku; nese `plan`, `status`, `current_period_start`, `current_period_end`, `gopay_schedule_id`, příznak automatické obnovy a kotvu lhůty mazání.
- **Payment (platba)**: Záznam v tabulce `payments` reprezentující jeden platební pokus; nese `amount_czk`, `variable_symbol`, `gopay_payment_id`, `status`, `method`, `invoice_url`.
- **Tarif (plan)**: Jeden ze tří placených plánů — `start` (199 Kč/měsíc), `pokrocily` (299 Kč/měsíc), `max` (599 Kč/měsíc).
- **Variabilni_Symbol**: Číselný identifikátor platebního pokusu (1–10 číslic) sloužící k jednoznačnému ručnímu spárování příchozí platby.
- **SPAYD**: Český standard Short Payment Descriptor pro QR platby (verze 1.0).
- **Jeden_Mesic**: Délka jednoho předplatitelského období definovaná jako přesně 30 dní (2 592 000 sekund). Použita všude tam, kde se období předplatného prodlužuje „o jeden měsíc".
- **Prvni_Selhani**: Časové razítko (`first_failed_charge_at`) prvního neúspěšného automatického strhnutí v aktuální neplacené epizodě; slouží jako kotva pro výpočet lhůt grace, reaktivace a mazání.
- **Auto_Obnova**: Příznak předplatného (`auto_renew`) určující, zda Platforma na konci období iniciuje automatické strhnutí.
- **Grace_Period**: Stav předplatného, kdy poslední platba selhala, profil zůstává publikovaný a čeká se na ruční doplacení.

## Requirements

### Requirement 1: Výběr tarifu a první platba

**User Story:** Jako registrovaný free uživatel chci vybrat placený tarif a zaplatit první platbu, aby se můj podnik publikoval a předplatné se aktivovalo.

#### Acceptance Criteria

1. WHEN free uživatel zvolí tarif z množiny {`start` (199 Kč), `pokrocily` (299 Kč), `max` (599 Kč)} a potvrdí checkout, THE Checkout SHALL vytvořit záznam Payment se stavem `pending`, metodou `auto_charge` a částkou odpovídající zvolenému tarifu v CZK.
2. WHEN Checkout iniciuje první platbu, THE Checkout SHALL přesměrovat uživatele na platební bránu GoPay pro zaplacení částky odpovídající zvolenému tarifu.
3. WHEN první platba je GoPay potvrzena jako úspěšná, THE Stavovy_Automat SHALL nastavit `subscription.status` na `active`.
4. WHEN první platba je GoPay potvrzena jako úspěšná, THE Platforma SHALL nastavit `business.is_published` na `true`.
5. WHEN první platba je GoPay potvrzena jako úspěšná, THE Platforma SHALL nastavit `subscription.current_period_end` na hodnotu `current_period_start` zvětšenou o Jeden_Mesic.
6. IF první platba je GoPay potvrzena jako neúspěšná nebo zrušená, THEN THE Stavovy_Automat SHALL ponechat `subscription.status` ve stavu `free` a `business.is_published` na `false`, a THE Checkout SHALL umožnit uživateli zopakovat platbu.

### Requirement 2: Založení recurring schedule a měsíční automatické strhávání

**User Story:** Jako podnikatel chci, aby se mé předplatné strhávalo automaticky každý měsíc, abych nemusel platit ručně.

#### Acceptance Criteria

1. WHEN první platba je úspěšná, THE Billing_Engine SHALL založit v GoPay opakovaný (recurring) platební schedule a uložit jeho identifikátor do `subscription.gopay_schedule_id`.
2. WHILE `subscription.status` je `active` a `subscription.auto_renew` je `true`, THE Billing_Engine SHALL iniciovat automatické strhnutí částky odpovídající aktuálnímu tarifu v den dosažení `subscription.current_period_end`.
3. WHEN automatické strhnutí je úspěšné, THE Platforma SHALL prodloužit `subscription.current_period_end` o Jeden_Mesic a vytvořit Payment se stavem `paid` a metodou `auto_charge`.
4. WHEN automatické strhnutí je iniciováno, THE Billing_Engine SHALL vytvořit Payment se stavem `pending` a metodou `auto_charge` před voláním GoPay.
5. IF Billing_Engine se nepodaří iniciovat automatické strhnutí přes GoPay WHILE `subscription.status` je `active` a `subscription.auto_renew` je `true`, THEN THE Billing_Engine SHALL zalogovat chybu, upozornit administrátora emailem a ponechat `subscription.status` na `active` pro opakování v následujícím běhu Billing_Cron.

### Requirement 3: Zpracování GoPay webhooků

**User Story:** Jako provozovatel platformy potřebuji, aby zpracování platebních webhooků bylo bezpečné a spolehlivé, aby nedošlo k podvržení ani k duplicitní změně stavu.

#### Acceptance Criteria

1. WHEN Webhook_Handler přijme webhook od GoPay, THE Webhook_Handler SHALL ověřit HMAC podpis webhooku proti sdílenému tajemství.
2. IF HMAC podpis webhooku neodpovídá očekávané hodnotě, THEN THE Webhook_Handler SHALL požadavek odmítnout s HTTP stavem 401 a nezměnit žádný záznam Payment ani Subscription.
3. WHEN Webhook_Handler zpracuje validní webhook, THE Webhook_Handler SHALL dohledat Payment podle `gopay_payment_id` a aktualizovat jeho `status` podle stavu hlášeného GoPay.
4. IF validní webhook odkazuje na `gopay_payment_id`, ke kterému neexistuje žádný Payment, THEN THE Webhook_Handler SHALL webhook ignorovat, vrátit úspěšnou odpověď a nezměnit žádný záznam.
5. WHEN Webhook_Handler přijme webhook s `gopay_payment_id`, pro který je odpovídající Payment již ve stavu odpovídajícím hlášenému stavu, THE Webhook_Handler SHALL vrátit úspěšnou odpověď bez vytvoření duplicitního záznamu a bez opakované změny stavu Subscription.
6. WHEN Webhook_Handler nastaví Payment do stavu `paid`, THE Webhook_Handler SHALL vyvolat odpovídající přechod Stavoveho_Automatu pro dané předplatné.

### Requirement 4: Selhání automatického strhnutí a přechod do grace_period

**User Story:** Jako podnikatel chci při selhání automatické platby dostat QR kód a fakturu pro ruční zaplacení a zůstat publikovaný, aby můj provoz nebyl okamžitě přerušen.

#### Acceptance Criteria

1. WHEN automatické strhnutí selže WHILE `subscription.status` je `active`, THE Stavovy_Automat SHALL nastavit `subscription.status` na `grace_period`.
2. WHEN předplatné přejde do stavu `grace_period`, THE Platforma SHALL ponechat `business.is_published` na `true`.
3. WHEN předplatné přejde do stavu `grace_period`, THE Stavovy_Automat SHALL uložit do `subscription` časové razítko Prvni_Selhani, pokud pro aktuální neplacenou epizodu dosud není nastaveno.
4. WHEN předplatné přejde do stavu `grace_period`, THE QR_Generator SHALL vygenerovat QR platbu ve formátu SPAYD 1.0 obsahující IBAN účtu provozovatele, částku v CZK odpovídající tarifu, měnu `CZK` a Variabilni_Symbol daného platebního pokusu.
5. WHEN předplatné přejde do stavu `grace_period`, THE Faktura_Generator SHALL vygenerovat fakturu za dané období.
6. WHEN předplatné přejde do stavu `grace_period`, THE Platforma SHALL odeslat podnikateli email obsahující QR kód, fakturu a bankovní údaje pro ruční platbu převodem.
7. FOR ALL vygenerovaných SPAYD řetězců SHALL platit, že jejich dekódování konformní SPAYD čtečkou vrátí stejný IBAN, částku, měnu a Variabilni_Symbol, jaké byly do řetězce vloženy.

### Requirement 5: Ruční platba převodem a její spárování

**User Story:** Jako podnikatel chci zaplatit předplatné převodem podle QR kódu a variabilního symbolu, aby moje platba mohla být jednoznačně spárována a předplatné obnoveno.

#### Acceptance Criteria

1. THE Platforma SHALL přidělit každému platebnímu pokusu Variabilni_Symbol tvořený 1 až 10 číslicemi.
2. THE Platforma SHALL zajistit, že každý Variabilni_Symbol je unikátní napříč všemi záznamy v tabulce `payments`.
3. WHEN je generována ruční platba převodem, THE Platforma SHALL vytvořit Payment se stavem `pending` a metodou `qr_manual`.
4. WHEN je administrátorem spárována příchozí platba s Payment, THE Platforma SHALL nastavit `payment.status` na `paid`.
5. WHEN Payment přejde do stavu `paid` v důsledku spárování, THE Platforma SHALL prodloužit `subscription.current_period_end` o Jeden_Mesic.
6. WHEN Payment přejde do stavu `paid` v důsledku spárování WHILE `subscription.status` je `grace_period` nebo `expired`, THE Stavovy_Automat SHALL nastavit `subscription.status` na `active`, nastavit `business.is_published` na `true` a vymazat časové razítko Prvni_Selhani.

### Requirement 6: Stavový automat předplatného a lifecycle dat

**User Story:** Jako provozovatel platformy potřebuji deterministický stavový automat předplatného s přesnými časovými limity a mazáním dat, aby byl životní cyklus účtu předvídatelný a v souladu s GDPR a účetními požadavky.

#### Acceptance Criteria

1. THE Stavovy_Automat SHALL implementovat stavy `free`, `active`, `grace_period`, `expired` a `deleted_data`.
2. WHEN nový podnik je zaregistrován, THE Stavovy_Automat SHALL nastavit `subscription.status` na `free`.
3. WHEN první úspěšná platba je potvrzena WHILE `subscription.status` je `free`, THE Stavovy_Automat SHALL nastavit `subscription.status` na `active`.
4. WHEN od časového razítka Prvni_Selhani uplyne 30 dní bez úspěšné platby WHILE `subscription.status` je `grace_period`, THE Stavovy_Automat SHALL nastavit `subscription.status` na `expired`.
5. WHEN předplatné přejde do stavu `expired`, THE Platforma SHALL nastavit `business.is_published` na `false` a uzamknout přístup k dashboardu podniku.
6. WHILE `subscription.status` je `expired` a od časového razítka Prvni_Selhani uplynulo méně než 90 dní, THE Platforma SHALL umožnit reaktivaci předplatného úspěšnou platbou a přechod do stavu `active`.
7. WHEN od časového razítka Prvni_Selhani uplyne 90 dní bez úspěšné platby, THE Stavovy_Automat SHALL nastavit `subscription.status` na `deleted_data` a THE Cleanup_Cron SHALL smazat veškerá tenant data podniku (profil, služby, otvírací doby, rezervace, klienty).
8. WHEN předplatné přejde do stavu `deleted_data`, THE Platforma SHALL zachovat záznam uživatele v tabulce `users` (email a password hash) a kompletní historii tabulek `subscriptions` a `payments` pro účetní účely.
9. WHEN podnik ve stavu `deleted_data` zaplatí nové předplatné, THE Stavovy_Automat SHALL nastavit `subscription.status` na `active` a podnik SHALL začínat s prázdným profilem.
10. THE Warning_Cron SHALL odeslat podnikateli varovný email 7 dní před plánovaným přechodem z `grace_period` do `expired`.
11. THE Warning_Cron SHALL odeslat podnikateli varovný email 7 dní před plánovaným přechodem z `expired` do `deleted_data`.

### Requirement 7: Generování a doručení faktur

**User Story:** Jako podnikatel chci po každé úspěšné platbě obdržet fakturu, aby moje účetnictví bylo v pořádku.

#### Acceptance Criteria

1. WHEN Payment přejde do stavu `paid`, THE Faktura_Generator SHALL vygenerovat fakturu ve formátu PDF.
2. THE Faktura_Generator SHALL přidělit každé faktuře pořadové číslo, které je o 1 vyšší než dosud nejvyšší pořadové číslo faktury přidělené na platformě.
3. THE Faktura_Generator SHALL přidělovat pořadová čísla faktur v rámci databázové transakce se zámkem tak, aby ani při souběžném dokončení více plateb nedošlo k přidělení duplicitního čísla.
4. THE Faktura_Generator SHALL zajistit, že pořadová čísla faktur jsou unikátní napříč celou platformou.
5. WHEN je faktura vygenerována, THE Platforma SHALL uložit PDF faktury do Supabase Storage.
6. WHEN je faktura vygenerována, THE Platforma SHALL uložit odkaz na fakturu do `payment.invoice_url`.
7. WHEN je faktura vygenerována, THE Platforma SHALL odeslat fakturu podnikateli emailem.

### Requirement 8: Změna tarifu

**User Story:** Jako podnikatel chci změnit svůj tarif na vyšší nebo nižší, aby cena odpovídala mým potřebám.

#### Acceptance Criteria

1. WHEN podnikatel požádá o změnu tarifu WHILE `subscription.status` je `active`, THE Platforma SHALL zaznamenat požadovaný cílový tarif jako nevyřízenou změnu, aniž by změnila aktuální `subscription.plan`.
2. WHEN je dosažen `subscription.current_period_end` a současně existuje nevyřízená změna tarifu, THE Platforma SHALL nastavit `subscription.plan` na požadovaný cílový tarif a od následujícího období strhávat částku odpovídající novému tarifu.
3. THE Platforma SHALL NOT účtovat poměrnou (proratovanou) částku při změně tarifu v rámci probíhajícího období.
4. WHILE je nevyřízená změna tarifu evidována, THE Platforma SHALL umožnit podnikateli tuto změnu zrušit před dosažením `subscription.current_period_end`.

### Requirement 9: Aplikace kupónu při checkoutu

**User Story:** Jako podnikatel chci při checkoutu uplatnit kupón, abych získal slevu, zkušební období nebo komp účet.

#### Acceptance Criteria

1. WHEN podnikatel zadá kód kupónu při checkoutu, THE Checkout SHALL ověřit, že kupón existuje, je v platnosti a má dostupný počet použití.
2. IF zadaný kód kupónu neexistuje, je po platnosti nebo nemá dostupný počet použití, THEN THE Checkout SHALL platbu nezahájit a zobrazit podnikateli chybovou hlášku.
3. WHERE je při checkoutu uplatněn platný kupón typu procentuální sleva, THE Checkout SHALL snížit účtovanou částku první platby o příslušné procento.
4. WHERE je při checkoutu uplatněn platný kupón typu fixní sleva, THE Checkout SHALL snížit účtovanou částku první platby o příslušnou částku v CZK, nejméně však na 0 Kč.
5. WHERE je při checkoutu uplatněn platný kupón typu free trial, THE Checkout SHALL nastavit `subscription.status` na `active`, nastavit `business.is_published` na `true` a nastavit `subscription.current_period_end` na počet dní zkušebního období bez okamžitého stržení platby.
6. WHERE je při checkoutu uplatněn platný kupón typu comp účet, THE Checkout SHALL nastavit `subscription.status` na `active` a `business.is_published` na `true` bez stržení platby a bez založení recurring schedule.

### Requirement 10: Denní cron úlohy

**User Story:** Jako provozovatel platformy potřebuji, aby denní cron úlohy automaticky poháněly účtování, varování a mazání dat, abych nemusel zasahovat ručně.

#### Acceptance Criteria

1. WHEN je spuštěn Billing_Cron, THE Billing_Cron SHALL pro každé předplatné se stavem `active`, příznakem `auto_renew` `true` a dosaženým `subscription.current_period_end` iniciovat automatické strhnutí přes GoPay.
2. WHEN je spuštěn Billing_Cron a automatické strhnutí předplatného selže, THE Billing_Cron SHALL spustit přechod do `grace_period` dle Requirement 4.
3. IF přechod do `grace_period` v Billing_Cron selže pro konkrétní podnik, THEN THE Billing_Cron SHALL chybu zalogovat a pokračovat ve zpracování ostatních podniků bez opakování přechodu.
4. WHEN je spuštěn Cleanup_Cron, THE Cleanup_Cron SHALL pro každý podnik, u kterého od časového razítka Prvni_Selhani uplynulo alespoň 90 dní bez úspěšné platby, nastavit `subscription.status` na `deleted_data` a smazat tenant data dle Requirement 6.
5. WHEN je spuštěn Warning_Cron, THE Warning_Cron SHALL odeslat varovné emaily dle Requirement 6, bodů 10 a 11.
6. IF zpracování konkrétního podniku v cron úloze selže, THEN THE cron úloha SHALL zalogovat chybu, upozornit administrátora emailem a pokračovat ve zpracování ostatních podniků.

### Requirement 11: Zrušení automatické obnovy

**User Story:** Jako podnikatel chci zrušit automatickou obnovu předplatného a zůstat aktivní do konce zaplaceného období, abych měl kontrolu nad tím, kdy přestanu platit.

#### Acceptance Criteria

1. WHEN podnikatel zruší automatickou obnovu WHILE `subscription.status` je `active`, THE Platforma SHALL nastavit `subscription.auto_renew` na `false` a ponechat `subscription.status` na `active`.
2. WHILE `subscription.auto_renew` je `false` a aktuální datum je před `subscription.current_period_end`, THE Platforma SHALL ponechat `business.is_published` na `true`.
3. WHEN je dosažen `subscription.current_period_end` WHILE `subscription.auto_renew` je `false`, THE Stavovy_Automat SHALL nastavit `subscription.status` na `expired`, nastavit `business.is_published` na `false`, uzamknout přístup k dashboardu a uložit do `subscription` časové razítko Prvni_Selhani odpovídající dosaženému `current_period_end`.
4. WHEN podnikatel znovu zapne automatickou obnovu WHILE `subscription.status` je `active`, THE Platforma SHALL nastavit `subscription.auto_renew` na `true`.
