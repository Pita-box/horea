# Requirements Document

> Funkce: telegram-operator-notifications

## Introduction

Funkce **telegram-operator-notifications** zavádí do platformy Horea integraci s Telegramem
zaměřenou výhradně na **provozovatele platformy (operátora)**, nikoli na vlastníky podniků
(zákazníky SaaS). Cílem je dát operátorovi dva kanály:

1. **PUSH notifikace** — operátor dostane do svého Telegram chatu zprávu při dvou provozně
   významných událostech:
   - dokončení onboardingu (vznik nového podniku / nová registrace),
   - potvrzení platby a aktivace předplatného.
2. **ON-DEMAND dotazy** — operátor napíše botovi příkaz a bot odpoví:
   - `/trzby` — celkové tržby z předplatných za aktuální kalendářní měsíc,
   - `/odhad` — odhad tržeb na příští kalendářní měsíc,
   - `/stav` — technický stav (zdraví) klíčových služeb systému,
   - `/start` a `/help` — uvítání a nápověda k dostupným příkazům.

V projektu zatím **žádná Telegram integrace neexistuje** (žádný `TELEGRAM_BOT_TOKEN`, žádný
kód). Tato funkce ji zavádí jako první. Notifikace událostí se **navazují na existující body**
v kódu, nezavádějí nový tok:

- Nový podnik vzniká v onboardingu přes RPC `commit_onboarding` (`src/lib/onboarding/commit.ts`),
  volaný z `src/app/onboarding/6/actions.ts` (po úspěchu redirect na `/dashboard`).
- Aktivace předplatného / potvrzená platba probíhá v `processGopayWebhook`
  (`src/lib/webhooks/handler.ts`) ve větvi `applyPaid` s výsledkem `paid_applied`; HTTP vstup
  je `src/app/api/webhooks/gopay/route.ts`. Billing cron (`/api/cron/billing`) jen iniciuje
  strhnutí — skutečný výsledek „zaplaceno" potvrzuje až webhook.
- Ceny tarifů drží `src/lib/checkout/pricing.ts` (`planPriceCzk`: start 199 Kč, pokrocily 299 Kč,
  max 599 Kč). Tržby a odhad se počítají nad tabulkami `payments` a `subscriptions` ve stejném
  duchu jako existující `src/lib/admin/stats.ts` (`sumPaidRevenueCzk`).
- Zdraví služeb (Supabase, Resend, SMTP2GO, GoPay, Cloudflare R2, Google) má vzor v návrhu
  funkce `admin-system-tools` (`runHealthChecks`, `aggregateStatus`).

**Vazba na `admin-system-tools` (jen poznámka, zde se neimplementuje):** jakmile tato integrace
vznikne, admin „Správa systému" na ni naváže — doplní Telegram health probe (read-only `getMe`/
`getChat`, bez odeslání zprávy) a akci „Odeslat testovací zprávu" (force-send) stejným vzorem
jako test e-mailu. Tato funkce má proto poskytnout znovupoužitelný **odesílací helper** a
**read-only health-probe podklad**, aby na ně `admin-system-tools` mohl navázat; samotné admin UI
je mimo rozsah této funkce.

### Rozsah a hranice (Scope and Boundaries)

**V rozsahu (In Scope):**
- Server-side odesílací helper pro Telegram (`sendMessage`) a read-only health-probe podklad
  (`getMe`) jako znovupoužitelné moduly.
- PUSH notifikace operátorovi při dokončení onboardingu a při potvrzené platbě / aktivaci
  předplatného, navázané na existující body v kódu.
- Inbound Telegram webhook endpoint, který přijímá a ověřuje updaty, reaguje pouze na chat
  operátora a obsluhuje příkazy `/trzby`, `/odhad`, `/stav`, `/start`, `/help`.
- Čistá, testovatelná logika výpočtu měsíčních tržeb a odhadu tržeb příštího měsíce.
- Sestavení odpovědi o technickém stavu služeb z health-probe podkladu.
- České texty zpráv a formátování částek v CZK pro časové pásmo Europe/Prague.
- Konfigurovatelnost (feature je neaktivní bez nastavených env) a fail-safe chování notifikací.

**Mimo rozsah (Out of Scope):**
- Jakékoli notifikace nebo příkazy směřující na vlastníky podniků / koncové zákazníky.
- Admin UI „Správa systému" (Telegram health probe a tlačítko testovací zprávy) — to dodá
  samostatná funkce `admin-system-tools`, která naváže na helper a probe z této funkce.
- Naplánovaný denní souhrn (scheduled digest) — primární je inbound dotaz; denní souhrn může být
  budoucí rozšíření, tato funkce ho nezavádí.
- Změna doménové logiky onboardingu, platebního webhooku nebo billing cronu nad rámec přidání
  notifikace jako vedlejšího efektu.
- Interaktivní konverzace, tlačítka/inline klávesnice, víceúčelové dialogy nad rámec uvedených
  příkazů.
- Perzistence historie zpráv nebo audit Telegram komunikace.

## Glossary

- **Operator**: Provozovatel platformy Horea (správce systému), jediný oprávněný příjemce
  notifikací a odesílatel příkazů.
- **Telegram_Notifier**: Server-only modul, který odesílá zprávy do Telegramu přes Telegram Bot
  API metodou `sendMessage`.
- **Telegram_Webhook**: Server-side HTTP endpoint, který přijímá příchozí updaty (zprávy) od
  Telegramu a obsluhuje příkazy operátora.
- **Telegram_Health_Probe**: Read-only ověření dostupnosti Telegram Bot API (metoda `getMe`),
  které neodesílá žádnou zprávu.
- **Operator_Chat_Id**: Identifikátor cílového Telegram chatu operátora z `TELEGRAM_OPERATOR_CHAT_ID`.
- **Bot_Token**: Tajný token Telegram bota z `TELEGRAM_BOT_TOKEN`; výhradně server-side.
- **Webhook_Secret**: Sdílené tajemství z `TELEGRAM_WEBHOOK_SECRET` pro ověření pravosti příchozích
  updatů přes hlavičku `X-Telegram-Bot-Api-Secret-Token`.
- **Feature_Enabled**: Stav, kdy jsou `Bot_Token` i `Operator_Chat_Id` nastavené; jen tehdy je
  funkce aktivní.
- **Business_Created_Event**: Událost dokončení onboardingu a vzniku nového podniku.
- **Payment_Confirmed_Event**: Událost potvrzené platby a aktivace předplatného (výsledek
  `paid_applied` ve `processGopayWebhook`).
- **Command**: Textový příkaz od operátora (`/trzby`, `/odhad`, `/stav`, `/start`, `/help`).
- **Revenue_Calculator**: Čistá logika výpočtu součtu úspěšných plateb (`payments.status = paid`)
  za zadané kalendářní období.
- **Estimate_Calculator**: Čistá logika výpočtu odhadu tržeb příštího měsíce z aktivních
  předplatných a cen tarifů.
- **Health_Reporter**: Logika, která z health-probe výsledků klíčových služeb sestaví agregovaný
  technický stav pro odpověď na `/stav`.
- **Monitored_Service**: Jedna ze sledovaných služeb — Resend, SMTP2GO, API/Supabase, GoPay,
  Cloudflare R2, Google.
- **Secret_Value**: Jakékoli tajemství (Bot_Token, Webhook_Secret, API klíče, tokeny, hesla).
- **Personal_Data**: Osobní/citlivé údaje (e-maily, telefony, jména osob, platební údaje, tokeny).
- **CZK_Amount**: Peněžní částka v korunách českých formátovaná pro Europe/Prague.

## Requirements

### Requirement 1: Konfigurovatelnost a fail-safe aktivace

**User Story:** Jako Operator chci, aby funkce byla aktivní jen při nastavené konfiguraci, aby
chybějící konfigurace nikdy neshodila registraci, platbu ani jiný tok.

#### Acceptance Criteria

1. WHERE jsou `TELEGRAM_BOT_TOKEN` i `TELEGRAM_OPERATOR_CHAT_ID` nastavené, THE Telegram_Notifier SHALL považovat stav Feature_Enabled za aktivní.
2. IF `TELEGRAM_BOT_TOKEN` nebo `TELEGRAM_OPERATOR_CHAT_ID` není nastavený, THEN THE Telegram_Notifier SHALL přeskočit odeslání, vrátit volajícímu výsledek „přeskočeno" a zaznamenat informativní log bez Secret_Value.
3. WHEN je vyžádáno odeslání notifikace ve stavu, kdy Feature_Enabled není aktivní, THE Telegram_Notifier SHALL vrátit volajícímu výsledek „přeskočeno" bez vyhození výjimky.
4. THE Telegram_Notifier SHALL číst `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID` a `TELEGRAM_WEBHOOK_SECRET` výhradně v server-only kódu.

### Requirement 2: Bezpečné odeslání zprávy operátorovi

**User Story:** Jako Operator chci dostávat zprávy bezpečně, aby žádné tajemství neuniklo do
klienta ani do logů.

#### Acceptance Criteria

1. WHEN Feature_Enabled je aktivní a volající požádá o odeslání zprávy, THE Telegram_Notifier SHALL odeslat zprávu na Operator_Chat_Id přes Telegram Bot API metodou `sendMessage`.
2. THE Telegram_Notifier SHALL vynechat Bot_Token, Webhook_Secret i obsah těla požadavku z veškerých logů.
3. IF Telegram Bot API vrátí chybu nebo je nedostupné, THEN THE Telegram_Notifier SHALL vrátit volajícímu výsledek „selhalo" bez ohledu na úspěch zápisu logu a zaznamenat kategorii chyby bez Secret_Value.
4. THE Telegram_Notifier SHALL sestavit text zprávy v českém jazyce.

### Requirement 3: PUSH notifikace — nový podnik

**User Story:** Jako Operator chci dostat zprávu při vzniku nového podniku, abych měl přehled o
nárůstu registrací.

#### Acceptance Criteria

1. WHEN nastane Business_Created_Event (dokončení onboardingu), THE Telegram_Notifier SHALL odeslat operátorovi notifikaci o novém podniku.
2. THE Telegram_Notifier SHALL do notifikace o novém podniku zahrnout pouze název podniku a okamžik vzniku ve formátu pro Europe/Prague.
3. THE Telegram_Notifier SHALL vynechat z notifikace o novém podniku Personal_Data nad rámec názvu podniku.

### Requirement 4: PUSH notifikace — potvrzená platba a aktivace předplatného

**User Story:** Jako Operator chci dostat zprávu při potvrzené platbě, abych věděl o příjmech a
aktivacích předplatného.

#### Acceptance Criteria

1. WHEN nastane Payment_Confirmed_Event (výsledek `paid_applied` ve `processGopayWebhook`), THE Telegram_Notifier SHALL odeslat operátorovi notifikaci o potvrzené platbě.
2. THE Telegram_Notifier SHALL do notifikace o platbě zahrnout název podniku, tarif a zaplacenou CZK_Amount.
3. THE Telegram_Notifier SHALL vynechat z notifikace o platbě platební údaje, tokeny a Secret_Value.

### Requirement 5: Fail-safe vedlejší efekt notifikací

**User Story:** Jako Operator chci, aby odeslání notifikace bylo best-effort, aby selhání
Telegramu nikdy nezablokovalo registraci ani zpracování platby.

#### Acceptance Criteria

1. IF odeslání notifikace selže během Business_Created_Event, THEN THE System SHALL dokončit registraci podniku beze změny jejího výsledku.
2. IF odeslání notifikace selže během Payment_Confirmed_Event, THEN THE System SHALL dokončit zpracování platby beze změny jejího výsledku.
3. THE Telegram_Notifier SHALL při odesílání notifikace zachytit veškeré chyby tak, že nevyhodí výjimku do volajícího toku.

### Requirement 6: Omezení duplicitních notifikací

**User Story:** Jako Operator chci dostat za jednu událost jednu notifikaci, abych nebyl zahlcen
opakovanými zprávami.

#### Acceptance Criteria

1. WHEN je tatáž platba potvrzena opakovaně jakýmkoli počtem doručení webhooku, THE Telegram_Notifier SHALL odeslat notifikaci o platbě nejvýše jednou pro danou platbu bez ohledu na výsledek zpracování webhooku.
2. WHEN proběhne Business_Created_Event pro jeden dokončený onboarding, THE Telegram_Notifier SHALL odeslat notifikaci o novém podniku nejvýše jednou pro daný podnik.

### Requirement 7: Příchozí webhook a ověření pravosti

**User Story:** Jako Operator chci, aby bot přijímal příkazy přes ověřený webhook, aby na něj
nemohl posílat cizí odesílatel.

#### Acceptance Criteria

1. WHEN Telegram doručí update na Telegram_Webhook s hlavičkou `X-Telegram-Bot-Api-Secret-Token` shodnou s Webhook_Secret, THE Telegram_Webhook SHALL update přijmout ke zpracování.
2. IF hlavička `X-Telegram-Bot-Api-Secret-Token` chybí nebo se neshoduje s Webhook_Secret, THEN THE Telegram_Webhook SHALL odmítnout update s HTTP 401 a neprovést žádnou business logiku ani příkaz; zápis logu a metrik je povolen.
3. IF `TELEGRAM_WEBHOOK_SECRET` není nastavený, THEN THE Telegram_Webhook SHALL odmítnout každý příchozí update a zaznamenat informativní log bez Secret_Value.
4. WHEN Telegram_Webhook přijme syntakticky neplatné tělo updatu, THE Telegram_Webhook SHALL odpovědět HTTP 200 bez provedení příkazu.

### Requirement 8: Autorizace odesílatele příkazů

**User Story:** Jako Operator chci, aby bot reagoval jen na můj chat, aby žádná data neunikla
neoprávněnému odesílateli.

#### Acceptance Criteria

1. WHEN ověřený update pochází z Operator_Chat_Id, THE Telegram_Webhook SHALL zpracovat obsažený příkaz.
2. IF ověřený update pochází z jiného chatu než Operator_Chat_Id, THEN THE Telegram_Webhook SHALL update ignorovat a neodeslat odpověď ani data tomuto odesílateli; nezávislé výstupní zprávy (např. event notifikace operátorovi) tím nejsou dotčeny.
3. THE Telegram_Webhook SHALL odesílat odpovědi na příkazy výhradně na Operator_Chat_Id.

### Requirement 9: Příkaz `/trzby` — aktuální měsíční tržby

**User Story:** Jako Operator chci zjistit tržby za aktuální měsíc, abych viděl reálné příjmy.

#### Acceptance Criteria

1. WHEN operátor odešle příkaz `/trzby`, THE Telegram_Webhook SHALL odpovědět součtem úspěšných plateb za aktuální kalendářní měsíc jako CZK_Amount.
2. THE Revenue_Calculator SHALL počítat tržby jako součet `amount_czk` plateb se stavem `paid` v zadaném kalendářním období.
3. WHERE za aktuální měsíc nejsou žádné úspěšné platby, THE Telegram_Webhook SHALL odpovědět částkou 0 Kč.

### Requirement 10: Příkaz `/odhad` — odhad tržeb příštího měsíce

**User Story:** Jako Operator chci odhad tržeb na příští měsíc, abych mohl plánovat.

#### Acceptance Criteria

1. WHEN operátor odešle příkaz `/odhad`, THE Telegram_Webhook SHALL odpovědět odhadem tržeb na příští kalendářní měsíc jako CZK_Amount.
2. THE Estimate_Calculator SHALL počítat odhad jako součet cen tarifů (`planPriceCzk`) aktivních předplatných s automatickou obnovou očekávaných k obnově v příštím kalendářním měsíci.
3. THE Estimate_Calculator SHALL pro každé započítané předplatné odvodit cenu z jeho tarifu přes jednotný ceník.
4. WHERE vypočítaný odhad přes Estimate_Calculator je 0, THE Telegram_Webhook SHALL odpovědět odhadem 0 Kč; jinak odpoví vypočítanou částkou bez další korekce.

### Requirement 11: Příkaz `/stav` — technický stav systému

**User Story:** Jako Operator chci jedním příkazem ověřit zdraví služeb, abych měl jistotu, že
vše funguje.

#### Acceptance Criteria

1. WHEN operátor odešle příkaz `/stav`, THE Telegram_Webhook SHALL odpovědět stavem každé Monitored_Service a agregovaným celkovým stavem.
2. THE Health_Reporter SHALL zahrnout do odpovědi Resend, SMTP2GO, API/Supabase, GoPay, Cloudflare R2 a Google.
3. THE Health_Reporter SHALL odvodit agregovaný stav s precedencí „nedostupné" nad „zhoršené" nad „v pořádku".
4. WHEN každá Monitored_Service hlásí stav „v pořádku", THE Health_Reporter SHALL nastavit agregovaný stav na „v pořádku".
5. IF probe některé Monitored_Service selže, THEN THE Health_Reporter SHALL označit danou službu jako nedostupnou a pokračovat ve vyhodnocení ostatních služeb.
6. THE Health_Reporter SHALL vynechat z odpovědi Secret_Value každé Monitored_Service.

### Requirement 12: Příkazy `/start` a `/help`

**User Story:** Jako Operator chci nápovědu k příkazům, abych věděl, co bot umí.

#### Acceptance Criteria

1. WHEN operátor odešle příkaz `/start` nebo `/help`, THE Telegram_Webhook SHALL odpovědět českým seznamem dostupných příkazů s krátkým popisem.
2. IF operátor odešle text, který neodpovídá žádnému známému příkazu, THEN THE Telegram_Webhook SHALL odpovědět českou nápovědou s odkazem na `/help`.

### Requirement 13: Čistá testovatelná logika výpočtů

**User Story:** Jako Operator chci, aby finanční výpočty byly spolehlivé, aby čísla v odpovědích
seděla.

#### Acceptance Criteria

1. THE Revenue_Calculator SHALL být oddělen od I/O jako čistá funkce nad seznamem plateb.
2. THE Estimate_Calculator SHALL být oddělen od I/O jako čistá funkce nad seznamem aktivních předplatných a ceníkem.
3. WHERE je seznam vstupních plateb prázdný, THE Revenue_Calculator SHALL vrátit součet 0.
4. THE Estimate_Calculator SHALL vrátit nezápornou částku pro libovolný platný vstup.

### Requirement 14: České texty a formátování částek

**User Story:** Jako Operator chci české zprávy s korunovým formátem, aby byly okamžitě
srozumitelné.

#### Acceptance Criteria

1. THE Telegram_Notifier SHALL formátovat každou CZK_Amount v korunách českých pro časové pásmo Europe/Prague.
2. THE Telegram_Webhook SHALL formátovat každou CZK_Amount v odpovědích na příkazy v korunách českých pro časové pásmo Europe/Prague.
3. THE Telegram_Notifier SHALL sestavovat texty notifikací i odpovědí v českém jazyce.

### Requirement 15: Helper a health-probe podklad pro admin-system-tools

**User Story:** Jako Operator chci znovupoužitelný odesílací helper a read-only health probe, aby
na ně mohlo později navázat admin UI „Správa systému".

#### Acceptance Criteria

1. THE Telegram_Notifier SHALL poskytnout server-only funkci pro odeslání zprávy znovupoužitelnou jiným server-side kódem.
2. THE Telegram_Health_Probe SHALL ověřit dostupnost Telegram Bot API metodou `getMe` bez odeslání jakékoli zprávy.
3. THE Telegram_Health_Probe SHALL vrátit pouze stav a kategorii případné chyby bez Secret_Value.
