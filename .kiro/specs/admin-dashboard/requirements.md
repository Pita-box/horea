# Requirements Document

> Požadavky na feature **admin-dashboard** — administrátorský SaaS dashboard provozovatele platformy Mojerezervace, dostupný na cestě `/admin`.
>
> Tento dokument navazuje na `architecture/requirements.md` a `architecture/design.md`. Soulad s architektonickými požadavky **R1** (multi-tenancy / RLS admin override), **R7** (stavový automat předplatného a lifecycle dat), **R9** (GDPR), **R12** (platby přes GoPay / ruční párování), **R17** (admin role a privilegovaný přístup), **R18** (čeština) a **R20** (observability / logování) je závazný.
>
> Jde o **poslední feature specifikaci** platformy. Tabulka audit logu je **nová** a je definována zde (Requirement 9).

## Introduction

Tato feature pokrývá administrátorský dashboard provozovatele platformy — jediné místo, odkud jediný admin (`users.is_admin = true`) spravuje celý SaaS. Dashboard je dostupný na samostatné cestě `/admin` chráněné middleware kontrolou role a pokrývá: řízení přístupu, přehledové statistiky, správu uživatelů a podniků, ruční úpravy předplatného, vynucené mazání podniků (GDPR / zneužití), CRUD správu kupónů, ruční párování bankovních plateb a auditní stopu citlivých akcí.

Návrh drží princip **Simplicity First** z `CLAUDE.md` — žádné spekulativní vrstvy, žádné komplexní BI nástroje, minimum kódu na vyřešení problému. Statistiky v MVP jsou jednoduchá čísla a grafy, ne analytická platforma.

**Vztah k `subscription-payments`:** Spec `subscription-payments` vědomě odložil do tohoto dokumentu dvě věci — (1) **CRUD správu kupónů** (tam je pouze *aplikace* existujícího kupónu při checkoutu) a (2) **UI pro ruční párování plateb** (tam je definován pouze datový záznam platby a *efekt* spárování na předplatné). Tento dokument tedy definuje **párovací UI a jeho spouštěč**; samotný efekt spárování (prodloužení předplatného, přechod stavu) zůstává definován v `subscription-payments` (R5.5, R5.6) a tato feature jej pouze spouští.

**Otevřený bod k diskuzi — e-mail uživateli (support):** Položka „e-mail uživateli od admina" je dle principu Simplicity First zúžena na **jedinou minimální schopnost: opětovné odeslání poslední faktury** (Requirement 11). Odesílání libovolných zpráv či notifikací z dashboardu **není** v rozsahu MVP. Pokud i tato minimální schopnost není pro MVP potřeba, lze Requirement 11 vypustit — viz dotaz v závěru.

**Co NENÍ v rozsahu této feature:**

- **Aplikace kupónu** při checkoutu — řeší `subscription-payments`. Zde je pouze CRUD / správa kupónů.
- **Logika stavového automatu předplatného** — řeší `subscription-payments`. Admin pouze spouští / přepisuje (override) stav.
- **Správa rezervací podniku** — řeší `reservation-management`. Zde je pouze čtení agregovaného počtu rezervací.
- **Statistiky jednotlivých podniků** (per-business reporty) — plánováno jako `business-statistics` (v2).
- **Odesílání libovolných e-mailů / notifikací uživateli** — viz otevřený bod výše.

## Glossary

- **Platforma**: Softwarový systém Mojerezervace (Next.js aplikace na Vercelu) jako celek, pokud není uveden konkrétnější subsystém.
- **Administrator**: Jediný uživatel s `users.is_admin = true` — vlastník/provozovatel platformy. Aktér, nikoli subsystém.
- **Admin_Dashboard**: Subsystém Platformy dostupný na cestách pod `/admin`, který poskytuje administrátorovi přehledy, správu a akce nad daty napříč podniky.
- **Access_Guard**: Middleware Platformy chránící cesty pod `/admin`, který ověřuje autentizaci a roli `is_admin` před zobrazením jakéhokoli obsahu admin dashboardu.
- **Audit_Log**: Subsystém a dedikovaná tabulka Platformy uchovávající auditní záznamy o citlivých administrátorských akcích. Nová entita zaváděná touto feature.
- **Audit_Log_Zaznam**: Jeden záznam v Audit_Log nesoucí: identifikátor administrátora (actor), typ akce, typ a identifikátor cílového objektu (target), časové razítko, a volitelně stav před akcí a po akci (before/after).
- **Subscription (předplatné)**: Záznam v tabulce `subscriptions` patřící jednomu podniku; nese `plan`, `status` (`free`/`active`/`grace_period`/`expired`/`deleted_data`), `current_period_start`, `current_period_end`, `gopay_schedule_id`, `auto_renew`.
- **Payment (platba)**: Záznam v tabulce `payments` reprezentující jeden platební pokus; nese `amount_czk`, `variable_symbol`, `gopay_payment_id`, `status` (`pending`/`paid`/`failed`), `method` (`auto_charge`/`qr_manual`/`admin_manual`), `invoice_url`.
- **Business (podnik)**: Záznam v tabulce `businesses`; nese mj. `slug`, `name`, `is_published`, vlastnícího uživatele.
- **Kupon**: Záznam v tabulce `coupons` spravovaný administrátorem; nese `code`, `type` (`percent`/`fixed`/`free_trial_days`/`comp`), `value`, `valid_until`, `max_uses` a počet dosavadních použití.
- **Comp_Ucet**: Trvale aktivní předplatné udělené administrátorem bez plateb a bez recurring schedule.
- **Free_Trial**: Dočasně aktivní předplatné udělené administrátorem bez okamžité platby, s definovaným koncem zkušebního období.
- **Cekajici_Platba**: Payment se stavem `pending` a metodou `qr_manual` čekající na ruční spárování příchozí bankovní platby podle variabilního symbolu.
- **Variabilni_Symbol**: Číselný identifikátor platebního pokusu (1–10 číslic) sloužící k jednoznačnému ručnímu spárování příchozí platby (definováno v `subscription-payments`).
- **Churn**: Metrika definovaná jako počet předplatných, která ve zvoleném časovém období přešla ze stavu `active` nebo `grace_period` do stavu `expired` nebo `deleted_data`.
- **RLS admin override**: Pravidlo Row Level Security (dle `architecture` R1, R17), které přihlášenému administrátorovi povoluje čtení tenant-scoped dat všech podniků.

## Requirements

### Requirement 1: Řízení přístupu administrátora

**User Story:** Jako provozovatel platformy potřebuji, aby byl admin dashboard přístupný výhradně mně, aby se k citlivým datům a akcím nedostal žádný neoprávněný uživatel.

#### Acceptance Criteria

1. WHILE uživatel s `users.is_admin = true` je přihlášen, THE Access_Guard SHALL povolit přístup k cestám pod `/admin`.
2. IF neautentizovaný uživatel požádá o cestu pod `/admin`, THEN THE Access_Guard SHALL přesměrovat požadavek na přihlašovací stránku a nezobrazit žádný obsah Admin_Dashboard.
3. IF přihlášený uživatel s `users.is_admin = false` požádá o cestu pod `/admin`, THEN THE Access_Guard SHALL odepřít přístup s HTTP stavem 403 a nezobrazit žádný obsah Admin_Dashboard.
4. WHILE Administrator přistupuje k tenant-scoped datům napříč podniky prostřednictvím cest pod `/admin`, THE Platforma SHALL umožnit čtení dat všech podniků prostřednictvím RLS admin override.
5. WHEN Admin_Dashboard provádí zápis napříč podniky (úprava předplatného, mazání podniku, párování platby), THE Platforma SHALL provést zápis v serverovém kontextu se service role klíčem, nikoli z klientského kódu.

### Requirement 2: Přehled a statistiky

**User Story:** Jako administrátor chci na jednom místě vidět klíčové provozní metriky, abych měl přehled o růstu a stavu platformy bez nutnosti dotazovat se do databáze ručně.

#### Acceptance Criteria

1. WHEN Administrator otevře přehledovou stránku, THE Admin_Dashboard SHALL zobrazit počet nově registrovaných uživatelů ve zvoleném časovém období.
2. WHEN Administrator otevře přehledovou stránku, THE Admin_Dashboard SHALL zobrazit počet předplatných se stavem `active`.
3. WHEN Administrator otevře přehledovou stránku, THE Admin_Dashboard SHALL zobrazit hodnotu Churn za zvolené časové období.
4. WHEN Administrator otevře přehledovou stránku, THE Admin_Dashboard SHALL zobrazit počet podniků agregovaný podle stavu předplatného pro stavy `free`, `active`, `grace_period` a `expired`.
5. WHEN Administrator otevře přehledovou stránku, THE Admin_Dashboard SHALL zobrazit součet `amount_czk` všech plateb se stavem `paid` za zvolené časové období.
6. WHEN Administrator zvolí časové období, THE Admin_Dashboard SHALL přepočítat metriky závislé na čase (nové registrace, Churn, součet plateb) pro zvolené období.

### Requirement 3: Seznam uživatelů a podniků s filtry

**User Story:** Jako administrátor chci procházet a filtrovat seznam uživatelů a podniků, abych rychle našel konkrétní účet při řešení podpory.

#### Acceptance Criteria

1. WHEN Administrator otevře seznam podniků, THE Admin_Dashboard SHALL zobrazit všechny podniky s názvem, slugem, stavem předplatného a tarifem.
2. WHERE Administrator zvolí filtr podle stavu předplatného, THE Admin_Dashboard SHALL zobrazit pouze podniky s odpovídajícím `subscription.status`.
3. WHERE Administrator zvolí filtr podle data registrace, THE Admin_Dashboard SHALL zobrazit pouze podniky registrované ve zvoleném časovém rozsahu.
4. WHEN Administrator zadá vyhledávací výraz, THE Admin_Dashboard SHALL zobrazit podniky, jejichž e-mail vlastnícího uživatele, název podniku nebo slug obsahuje zadaný výraz.
5. IF žádný podnik neodpovídá aktivně zvoleným filtrům nebo vyhledávacímu výrazu, THEN THE Admin_Dashboard SHALL zobrazit prázdný seznam s informační hláškou v češtině.

### Requirement 4: Detail uživatele a podniku

**User Story:** Jako administrátor chci u konkrétního účtu vidět profil, stav předplatného, historii plateb a počet rezervací, abych mohl řešit dotazy podpory s úplným kontextem.

#### Acceptance Criteria

1. WHEN Administrator otevře detail podniku, THE Admin_Dashboard SHALL zobrazit profil podniku a údaje vlastnícího uživatele (e-mail, datum registrace).
2. WHEN Administrator otevře detail podniku, THE Admin_Dashboard SHALL zobrazit aktuální stav předplatného, tarif a `current_period_end`.
3. WHEN Administrator otevře detail podniku, THE Admin_Dashboard SHALL zobrazit historii plateb podniku obsahující u každé platby částku, stav, metodu, variabilní symbol a datum.
4. WHEN Administrator otevře detail podniku, THE Admin_Dashboard SHALL zobrazit celkový počet rezervací podniku.

### Requirement 5: Ruční úprava předplatného administrátorem

**User Story:** Jako administrátor chci ručně nastavit tarif, stav a expiraci předplatného a udělit free trial nebo comp účet, abych mohl řešit výjimky a podporu.

#### Acceptance Criteria

1. WHEN Administrator nastaví tarif a stav předplatného podniku, THE Admin_Dashboard SHALL aktualizovat `subscription.plan` a `subscription.status` na zvolené hodnoty.
2. WHEN Administrator nastaví datum expirace předplatného, THE Admin_Dashboard SHALL nastavit `subscription.current_period_end` na zvolené datum.
3. WHEN Administrator udělí Free_Trial, THE Admin_Dashboard SHALL nastavit `subscription.status` na `active`, `business.is_published` na `true` a `subscription.current_period_end` na konec zkušebního období bez stržení platby.
4. WHEN Administrator udělí Comp_Ucet, THE Admin_Dashboard SHALL nastavit `subscription.status` na `active` a `business.is_published` na `true` bez stržení platby a bez založení recurring schedule.
5. WHEN Administrator pozastaví podnik, THE Admin_Dashboard SHALL nastavit `business.is_published` na `false`.
6. IF kterákoli dílčí změna při udělení Free_Trial nebo Comp_Ucet selže, THEN THE Admin_Dashboard SHALL vrátit zpět všechny dílčí změny a ponechat předplatné v původním stavu.
7. WHEN Administrator dokončí úpravu předplatného, udělení Free_Trial nebo Comp_Ucet, nebo pozastavení podniku, THE Audit_Log SHALL zaznamenat akci dle Requirement 9.

### Requirement 6: Vynucené smazání podniku (GDPR / zneužití)

**User Story:** Jako administrátor potřebuji nevratně smazat podnik při zneužití nebo při žádosti o výmaz dle GDPR, abych splnil právní povinnosti a chránil platformu.

#### Acceptance Criteria

1. WHEN Administrator iniciuje vynucené smazání podniku, THE Admin_Dashboard SHALL vyžadovat explicitní potvrzení akce před jejím provedením.
2. WHEN Administrator potvrdí vynucené smazání podniku, THE Admin_Dashboard SHALL smazat veškerá tenant data podniku (profil, služby, otvírací doby, rezervace, klienty).
3. WHEN je podnik vynuceně smazán, THE Platforma SHALL zachovat historii `subscriptions` a `payments` podniku pro účetní účely.
4. WHEN je vynucené smazání dokončeno, THE Audit_Log SHALL zaznamenat akci dle Requirement 9.

### Requirement 7: Správa kupónů (CRUD)

**User Story:** Jako administrátor chci vytvářet a spravovat kupóny, abych mohl nabízet slevy, zkušební období a comp účty.

#### Acceptance Criteria

1. WHEN Administrator vytvoří Kupon, THE Admin_Dashboard SHALL uložit Kupon s atributy `code`, `type` (z množiny {`percent`, `fixed`, `free_trial_days`, `comp`}), `value`, `valid_until` a `max_uses`.
2. IF Administrator vytvoří Kupon s kódem `code`, který již existuje, THEN THE Admin_Dashboard SHALL vytvoření odmítnout a zobrazit chybovou hlášku v češtině.
3. IF Administrator vytvoří Kupon typu `percent` s hodnotou `value` mimo rozsah 0 až 100, THEN THE Admin_Dashboard SHALL vytvoření odmítnout a zobrazit chybovou hlášku v češtině.
4. WHEN Administrator otevře seznam kupónů, THE Admin_Dashboard SHALL zobrazit všechny kupóny včetně aktuálního počtu použití každého kupónu.
5. WHEN Administrator upraví Kupon, THE Admin_Dashboard SHALL uložit změněné atributy Kuponu.
6. WHEN Administrator deaktivuje Kupon, THE Admin_Dashboard SHALL označit Kupon jako neaktivní tak, aby jej nebylo možné nadále uplatnit při checkoutu.
7. WHEN Administrator smaže Kupon, THE Admin_Dashboard SHALL odstranit Kupon ze seznamu dostupných kupónů.
8. WHEN Administrator vytvoří, upraví, deaktivuje nebo smaže Kupon, THE Audit_Log SHALL zaznamenat akci dle Requirement 9.

### Requirement 8: Ruční párování plateb

**User Story:** Jako administrátor chci spárovat příchozí bankovní platbu s čekající platbou podle variabilního symbolu, aby se předplatné podniku obnovilo.

#### Acceptance Criteria

1. WHEN Administrator otevře seznam čekajících plateb, THE Admin_Dashboard SHALL zobrazit všechny záznamy Cekajici_Platba včetně variabilního symbolu, částky, podniku a data vytvoření.
2. WHERE Administrator vyhledá čekající platbu podle variabilního symbolu, THE Admin_Dashboard SHALL zobrazit záznamy Cekajici_Platba s odpovídajícím Variabilni_Symbol.
3. WHEN Administrator spáruje příchozí platbu s vybranou Cekajici_Platba, THE Admin_Dashboard SHALL nastavit `payment.status` na `paid`, čímž spustí prodloužení předplatného definované ve specifikaci `subscription-payments` (R5.5, R5.6).
4. IF nastavení `payment.status` na `paid` při párování selže, THEN THE Admin_Dashboard SHALL párování neprovést, ponechat Payment ve stavu `pending` a zobrazit chybovou hlášku v češtině.
5. WHEN je platba spárována, THE Audit_Log SHALL zaznamenat akci dle Requirement 9.

### Requirement 9: Audit log citlivých akcí

**User Story:** Jako provozovatel platformy potřebuji, aby všechny citlivé administrátorské akce byly trvale zaznamenány, abych měl auditní stopu pro bezpečnost, GDPR a řešení sporů.

#### Acceptance Criteria

1. WHEN Administrator provede citlivou akci (úprava nebo override předplatného, udělení Free_Trial nebo Comp_Ucet, pozastavení podniku, vynucené smazání podniku, vytvoření, úprava, deaktivace nebo smazání Kuponu, spárování platby), THE Audit_Log SHALL vytvořit Audit_Log_Zaznam o této akci.
2. THE Audit_Log SHALL u každého Audit_Log_Zaznam uložit identifikátor administrátora (actor), typ akce, typ a identifikátor cílového objektu (target) a časové razítko vytvoření.
3. WHERE akce mění stav existujícího objektu, THE Audit_Log SHALL u příslušného Audit_Log_Zaznam uložit stav cílového objektu před akcí a po akci (before/after).
4. IF se stav před akcí nebo po akci nepodaří z technických důvodů zachytit, THEN THE Audit_Log SHALL přesto vytvořit Audit_Log_Zaznam bez hodnot before/after, místo aby selhala celá administrátorská akce.
5. THE Audit_Log SHALL uchovávat záznamy jako append-only tak, aby je z administrátorského rozhraní nebylo možné upravit ani smazat.

### Requirement 10: Prohlížení audit logu

**User Story:** Jako administrátor chci prohlížet a filtrovat audit log, abych dohledal, kdo provedl konkrétní akci a kdy.

#### Acceptance Criteria

1. WHEN Administrator otevře audit log, THE Admin_Dashboard SHALL zobrazit záznamy Audit_Log_Zaznam seřazené sestupně podle časového razítka.
2. WHERE Administrator zvolí filtr podle typu akce, THE Admin_Dashboard SHALL zobrazit pouze záznamy s odpovídajícím typem akce.
3. WHERE Administrator zvolí filtr podle časového rozsahu, THE Admin_Dashboard SHALL zobrazit pouze záznamy vytvořené ve zvoleném časovém rozsahu.
4. WHERE Administrator zvolí filtr podle cílového objektu, THE Admin_Dashboard SHALL zobrazit pouze záznamy vztažené k danému cílovému objektu.

### Requirement 11: Opětovné odeslání poslední faktury

**User Story:** Jako administrátor chci podnikateli znovu odeslat poslední fakturu, abych mu pomohl v situaci, kdy mu e-mail s fakturou nedorazil.

#### Acceptance Criteria

1. WHEN Administrator vyžádá opětovné odeslání poslední faktury podniku, THE Admin_Dashboard SHALL nejprve ověřit, že podnik má alespoň jeden Payment se stavem `paid` a vyplněným `invoice_url`, a teprve poté odeslat nejnovější takovou fakturu na e-mail vlastnícího uživatele.
2. IF podnik nemá žádnou vystavenou fakturu, THEN THE Admin_Dashboard SHALL akci neprovést a zobrazit informační hlášku v češtině.
