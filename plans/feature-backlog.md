# Feature Backlog

This is a Codex index over Kiro feature specs. Detailed requirements, design, tasks, dependency graphs, and task state remain in `.kiro/specs/<feature>/` and must be read before implementation.

## Features

| Order | Feature | Source | Depends on | Next slice |
| --- | --- | --- | --- | --- |
| 1 | `auth-onboarding` | `.kiro/specs/auth-onboarding/` | `architecture` schema/auth baseline | Core hotové (registrace, login, verify, onboarding wizard 1–6, DPA flow). Probíhá UI redesign auth/onboarding dle `.kiro/docs/Auth/*` + `.kiro/docs/Dashboard/*` (viz „Cross-cutting UI redesign" níže) |
| 2 | `services-and-availability` | `.kiro/specs/services-and-availability/` | `architecture`, `auth-onboarding` tenant context | `Slot_Calculator` tests and pure function |
| 3 | `public-business-page` | `.kiro/specs/public-business-page/` | `services-and-availability` slot logic, published business model | Public renderer and `/{slug}` routing utility |
| 4 | `reservation-management` | `.kiro/specs/reservation-management/` | `public-business-page`, `services-and-availability`, active subscription status | DONE 100% — all tasks incl. optional PBT/unit/integration/E2E complete |
| 5 | `subscription-payments` | `.kiro/specs/subscription-payments/` | `architecture` payment model, auth/business ownership | DONE — all required tasks complete (250 passed, build green, migrations 0024–0030 applied). Deferred: optional `*` PBT/unit/integration/E2E tests |
| 6 | `admin-dashboard` | `.kiro/specs/admin-dashboard/` | `subscription-payments`, admin role/RLS override | DONE 100% — all tasks incl. optional PBT/unit/integration/E2E complete (415 passed, build OK under Node 20, migrations 0031–0040 applied) |
| 7 | `multi-service-reservations` | `.kiro/specs/multi-service-reservations/` | `reservation-management` | DONE — kombinované rezervace (více služeb i více zaměstnanců na jednu rezervaci), migrace 0049–0051 nasazené na sdílenou DB |

## Cross-cutting UI redesign (probíhá, mimo per-feature tasky)

Vizuální sjednocení podle podkladů v `.kiro/docs/` (Adora style). Detailní chronologie v `plans/build-journal.md`. Nemění pořadí ani závislosti featur — jde o UI vrstvu nad hotovou funkčností.

- **Auth stránky** — sdílený `AuthShell` (hlavička logo→`/` + support→`/kontakt`, blobs, `PublicFooter`); Registrace (2-sloupcový layout + live password checker), Login (stejný layout, funkční „Zůstat přihlášen"), Zapomenuté heslo, Verify-email (Neaktivovaný účet / Aktivovaný účet). Šířka formulářů pod `lg` sjednocena na `max-w-md`.
- **Onboarding** — full-screen gradient + `AuthHeader`/`PublicFooter`; krok 2 slug preview, krok 3 profil (ikony, telefon přesně 9 číslic), krok 5 `TimePicker` + `Switch`, krok 6 souhrn „Souhrn údajů".
- **Dashboard** — nový shell `DashboardChrome` (znovupoužitelné `DashboardSidebar`/`DashboardHeader`/`DashboardFooter`, role-driven `variant` owner/admin) nahradil horní `DashboardNav`; sdílí ho i admin oblast (`/admin/*` přes `admin/layout.tsx`). **Vyhledávání v headeru** (`DashboardSearch`) — viz „Dashboard search" níže. Fake analytics z reference zatím nestavěny (chybí data). Podstránky (services/reservations/clients/…) čekají na migraci vzhledu.
- **Marketing** — `(marketing)` route group: homepage, `/kontakt`, `/vseobecne-podminky` (vč. DPA jako sekce 7), `/ochrana-osobnich-udaju`, `/predplatne`; sdílený `PublicHeader`/`PublicFooter`.

## Dashboard rezervace / analytika redesign (probíhá, navazuje na multi-service-reservations)

Detailní chronologie v `plans/build-journal.md`. Souhrn aktuálního stavu:

- **Sidebar** — sbalitelný icon-only rail (`DashboardChrome`/`DashboardSidebar`); na stránce rezervací se sbalí automaticky.
- **`/dashboard/reservations`** — pohled **„Tabulka" zrušen**, výchozí je **„Obsazenost"** (kalendář měsíce + graf obsazenosti + pill filtry vč. filtru dle služby přes `reservation_services`); druhý pohled **„Kalendář"** přepracován na layout s levým railem (mini-kalendář, karta nejbližší rezervace, filtry) a pravou **časovou mřížkou** (hodiny × dny, proměnná výška hodinového řádku, hover na bloku).
- **Detail rezervace** — přiřazení **více zaměstnanců** (search + checkbox, `reservation_employees`) a editace **více služeb** (search + multi-select); modal má max-výšku viewportu se scrollem.
- **Tabulky webu** — jednotné hover chování řádků (bílá → `--color-light-violet`), opt-out `data-no-row-hover` pro tabulky se sloupcem „Akce". `Notice` sjednocen na 3 varianty.
- **`/dashboard/employees`** — pravý sloupec „TOP zaměstnanci" (obsazenost/efektivita aktuálního měsíce).
- **`/dashboard/analytics`** (NOVÉ, poslední položka aside) — Analytika podniku: výběr období, 4 KPI s meziobdobním srovnáním, graf vývoje tržeb, heatmapa vytížení, koláč stavů, žebříčky služby/zaměstnanci/klienti, noví vs. vracející se. Info-tooltipy u karet. Čisté agregace v `src/lib/analytics/`.

## Dashboard search (rozšiřitelná feature, probíhá)

Vyhledávání v dashboard headeru. Zdrojová architektura — výsledky se skládají z více zdrojů, snadno rozšiřitelné. Detail v `plans/build-journal.md`.

- **Stav: funkční (owner).** Zdroje: položky **nastavení** + **FAQ** (statický index, `src/lib/search/static-index.ts`, lokální fulltext bez diakritiky) a **klienti** (jméno/e-mail/telefon, server action `searchClientsAction`, tenant-scoped přes `business_id`+RLS, debounce 300 ms). UI: `DashboardSearch` (combobox, seskupené výsledky, klik mimo/Escape). Šířka inputu až `calc(var(--spacing)*150)` (~600px), responzivní.
- **Plan-gating:** napojeno na DB matici funkcí (`src/lib/plans/feature-matrix.ts → planHasFeature(matrix, plan, 'client_search')`), kterou edituje admin v `/admin/plans`. `capabilities.ts` **smazáno**. Free/bez tarifu zatím neomezeno. Zamčený stav klientů ukáže hlášku „dostupné ve vyšším tarifu".
- **FAQ stránka:** `/dashboard/faq` (`FaqAccordion`) — FAQ výsledky search na ni míří.
- **Rozšíření do budoucna:** přidat skupiny (rezervace, faktury, …) jako další zdroje; admin varianta search (podniky/platby); klávesová navigace šipkami; fulltext přes DB pro velké objemy.

## Hotovo — Entitlements / balíčky (body 4–5)

Postaveno (viz `plans/build-journal.md`, migrace `0042_plan_features`). Výchozí stav: vše povolené pro všechny tarify (test mode); admin teď jednotlivé funkce zapíná/vypíná per tarif.

- **Dashboard stránka „Tarify a funkce"** (`/dashboard/plans`) — owner přehled 3 tarifů + porovnávací tabulka funkcí, čte matici z DB (`loadPlanFeatureMatrix`). Napojeno na search.
- **Admin správa matice funkcí → balíčky** (`/admin/plans`) — admin přepíná `Switch` toggly funkce × tarif (optimistická aktualizace + rollback), `setPlanFeatureAction` (admin check + service-role upsert + audit `plan_feature_update`).
  - DB: tabulka `plan_features(plan, feature_key, enabled, updated_at)`, migrace `0042` (aplikováno). Chybějící řádek = povoleno (fail-open default).
  - Runtime gating čte matici (`planHasFeature(matrix, plan, key)`); zatím využito pro `client_search`.
- **Hotovo — návaznost:** `search` plan-gating napojen na tuto matici (dříve `capabilities.ts`, smazáno).

### Zbývá / k zvážení (budoucí slice)

- Gating dalších funkcí (kromě `client_search`) — napojit `planHasFeature` na zbylých 10 funkcí tam, kde dává smysl je omezovat tarifem.
- Politika pro free/bez tarifu (teď neomezeno) — rozhodnout, zda free = nejnižší tarif nebo vlastní množina.

### Funkční divergence od původních specs (zaznamenat při příští aktualizaci spec dokumentů)

- **Registrace**: `supabase.auth.signUp` → `admin.createUser({ email_confirm: false })`, aby Supabase neposílal vlastní confirm e-mail (vlastní Resend odkaz s tokenem pro stránku „Aktivovaný účet").
- **DPA**: zrušen samostatný `DPA_TEXT` placeholder + jeho checkbox-text; DPA žije jako sekce 7 VOP, registrace na ni jen odkazuje (mechanika verzovaného souhlasu `dpa_version_accepted`/re-acceptance zachována).
- **E-maily**: rozděleni odesílatelé (Resend = auth/faktury/kontakt/admin, SMTP2GO = notifikace rezervací) + transactional outbox s retry (migrace `0041_email_outbox`).
- **„Zůstat přihlášen"**: cookie `horea-remember` řídí session vs. persistentní auth cookies (server + middleware).
- **Redirecty**: přihlášený uživatel je z `/login`, `/register`, `/verify-email` (default) a `/error` (jen při zdravém guard state) přesměrován na `/dashboard`.

## Implementation Rules

- Read `requirements.md`, then `design.md`, then `tasks.md` for the selected feature.
- If `.config.kiro` says `design-first`, read `design.md` before `requirements.md`.
- Identify cross-feature contracts before editing. Examples: `Slot_Calculator`, reservation creation, subscription status, audit logging.
- Keep each feature slice testable and reversible.
- Update this backlog only when order, dependency, or next-slice guidance changes. Do not track task completion here.

## Known Cross-Feature Contracts

- `auth-onboarding` owns slug validation, DPA acceptance, business bootstrap, and free-user state.
- `services-and-availability` owns service CRUD, opening hours, availability settings, and `Slot_Calculator`.
- `public-business-page` consumes slug/business/service/availability data and creates client reservations with server-side revalidation.
- `reservation-management` reuses reservation creation and slot validation for owner-created or edited reservations.
- `subscription-payments` owns subscription status transitions, plan changes, invoices, QR/manual payment logic, and billing cron behavior.
- `admin-dashboard` may override subscription/business state, but must audit sensitive actions and respect admin-only access.

## Verification Notes

- Property or table-driven tests are preferred for pure domain logic such as slot calculation, status machines, slug normalization, payment symbols, and date/time boundaries.
- Playwright tests should cover only key happy paths and user-visible regressions; avoid duplicating every unit case in E2E.
- Database/RLS work needs local Supabase verification when possible.
