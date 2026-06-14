# Build Journal

Chronologický žurnál stavění (nejnovější nahoře). Per-task checkbox stav je kanonicky v `.kiro/specs/<spec>/tasks.md`; zde jsou jen nové funkce a bug/fix znalost. Bez PII a tajemství.

## 2026-06-12 — veřejná stránka / rezervační formulář UI + nepovinné ceny

### Nové funkce
- `components/reservation/StepIndicator.tsx` — vodorovný indikátor 5 kroků (Služba/Datum/Čas/Údaje/Souhrn). Aktivní krok zvýrazněný (action-violet), už navštívené kroky **klikatelné** (návrat na konkrétní vyplněný krok), budoucí ztlumené/neklikatelné.

### Změny
- `ReservationFormController.tsx` — nahrazen textový „Krok N z 5" `StepIndicator`em. Přidán stav `maxStep` (nejvyšší dosažený krok) → indikátor odemyká návrat. Navigace sjednocena: `goToStep` (dopředu, posune `maxStep`) vs. `goBackToStep` (zpět/indikátor). Změna služby resetuje `maxStep`=1, změna data na ≤2 (zneplatní navazující kroky).
- `Step1ServicePicker.tsx` — nová struktura položky: **Název**, popis + „(N min)", **cena jen když > 0**, vizuální cue **„Vybrat"** (vybraná → „Vybráno"). Celá položka je klikatelná (cue není samostatné tlačítko). Border položek zachován.
- `Step5Summary.tsx` — řádek „Cena" jen když cena > 0.
- `types.ts` (`ReservationService`) + `[slug]/page.tsx` — přidán `description` do tvaru služby pro formulář.
- `lib/services/schema.ts` — **cena je nepovinná**: prázdná hodnota = 0 (na veřejné stránce se nuly nezobrazují). Validace 0–100 000 zachována.
- `services/ServiceForm.tsx` — pole Cena označeno „(nepovinné)" + placeholder.
- `services/ServicesList.tsx` — v tabulce cena „—" když 0.
- `PublicProfileRenderer.tsx` — fallback výpis služeb: cena jen když > 0.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 427 passed / 49 skipped (+ test nepovinné ceny), `pnpm build` OK. Pod Node 20. Aktualizovány 2 snapshoty (reservation form layout + skrytí ceny 0).

## 2026-06-12 — storage / smazání podniku = smazání celé R2 složky

### Kontext
- Klíče médií už byly per-podnik pod jedním prefixem (`{businessId}/logo.webp`, `{businessId}/cover.webp`, `{businessId}/employee-{id}.webp`) → 1 podnik = 1 „složka" (R2 je plochý, prefix = složka). Chybělo jen hromadné smazání celého prefixu při smazání podniku.

### Nové funkce
- `lib/storage/r2.ts` — `r2DeleteByPrefix(prefix)`: listuje objekty přes S3 ListObjectsV2 (s paginací přes continuation-token) a maže je po jednom (počty na podnik malé → bez batch DeleteObjects/Content-MD5). + helper `decodeXmlEntities`.

### Změny
- `lib/admin/force-delete.ts` — po úspěšném `admin_force_delete_business` RPC se best-effort smaže celá složka `{businessId}/` z R2 (logo, cover i fotky zaměstnanců jedním krokem). Selhání úklidu R2 neshodí už provedené (a auditované) smazání — jen `serverLog.warn`.
- Pozn.: automatický přechod do `deleted_data` (cron) jen mění status, tenant data nemaže → R2 purge je navázán na reálné smazání (admin force-delete).

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 426 passed / 49 skipped, `pnpm build` OK. Pod Node 20.
- Aktualizovány 2 snapshoty (`PublicProfileRenderer`, `ReservationFormController`) kvůli dřívějším UI změnám (barva textu Notice, wrapper animace kroku).

## 2026-06-12 — ui / Notice: čitelnost chybové hlášky (bílý text na bílém)

### Bug & fix
- **Symptom:** Chybová hláška (`Notice variant="error"`) měla bílý text na bílém pozadí (`bg-canvas-white`) → text neviditelný. Projevovalo se napříč webem, kde se Notice používá (login, registrace, reset hesla, formuláře v dashboardu).
- **Root cause:** Barva textu byla nastavená globálně v base třídě komponenty na `text-[white]`, nezávisle na variantě. Pro `neutral` (tmavé pozadí `--color-dark`) to fungovalo, ale pro `error` (bílé pozadí) byl bílý text nečitelný.
- **Fix:** `components/ui/notice.tsx` — barva textu přesunuta z base do jednotlivých variant: `neutral` → `text-[white]` (na tmavém), `error` → `text-[var(--color-neon-pink)]` (na bílém). Ikona i text dědí `currentColor`. Oprava se projeví všude, kde se Notice používá.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20. Čistě UI.

## 2026-06-12 — nastavení účtu / změna e-mailu, hesla + předplatné

### Nové funkce
- `dashboard/account/page.tsx` — nová stránka „Nastavení účtu" (ikona účtu v topbaru na ni nově míří): přihlašovací údaje + stav předplatného (`SubscriptionStatusCard`) + výběr/správa tarifu (`SubscriptionManager`, znovupoužito ze `/dashboard/subscription`). Pokud podnik ještě není (nedokončený onboarding), sekce předplatného se skryje s noticí.
- `dashboard/account/actions.ts` — `getAccountEmail`, `updateEmailAction` (validace přes `validateEmail`; `supabase.auth.updateUser({ email })` → potvrzovací odkaz na novou adresu), `updatePasswordAction` (validace `validatePassword` + shoda; `updateUser({ password })`).
- `dashboard/account/AccountCredentialsForm.tsx` — dva formuláře (e-mail / heslo) s inline chybami a success toasty; po změně hesla se formulář vyčistí.

### Změny
- `DashboardHeader.tsx` — nový prop `accountHref`; ikona účtu (`IconUser`) míří na nastavení účtu (dřív stejně jako ozubené kolo na nastavení podniku).
- `DashboardChrome.tsx` — předává `accountHref` (owner → `/dashboard/account`, admin → `/admin`) + titulek „Nastavení účtu" v `TITLE_BY_PATH`.

### Poznámky
- `/dashboard/account` není reservation-management cesta → free uživatel má přístup (může měnit heslo i vybírat tarif). Změna hesla neodhlašuje ostatní relace (na rozdíl od reset-password flow) — vědomé zjednodušení pro self-service v přihlášeném stavu.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-12 — otevírací doba / toggle místo checkboxu

### Změny
- `opening-hours/OpeningHoursForm.tsx` — zapnutí/vypnutí dne přepsáno z `Checkbox` (zaškrtnuto = zavřeno, matoucí invertovaná logika) na `Switch` toggle jako jinde na webu. Toggle = „Otevřeno" (zapnuto → den otevřený, časová pole aktivní); pod názvem dne se mění popisek „Otevřeno"/„Zavřeno". Doplněn success toast „Otevírací doba uložena." po uložení.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20. Čistě UI.

## 2026-06-12 — UI / toast oznámení po akcích („uloženo")

### Nové funkce
- `src/components/ui/toast.tsx` — globální `ToastProvider` + hook `useToast()` + viewport (fixní vpravo dole). Toasty: varianty `success` (electric-green check) / `error` (neon-pink alert), auto-zmizení po ~3,2 s, manuální zavření, enter/leave animace (`animate-toast-in/out`), `aria-live="polite"`. Exportováno z `components/ui/index.ts`.
- `src/app/globals.css` — keyframes `toast-in`/`toast-out` + utility (respektují `prefers-reduced-motion`).
- `DashboardChrome.tsx` — obaleno `<ToastProvider>` → toasty dostupné na všech stránkách dashboardu.

### Napojeno (úspěšná potvrzení)
- `EmployeesManager` — přidání/úprava/smazání zaměstnance, nahrání fotky, přepínače týmu.
- `ServiceEmployeesManager` — uložení přiřazení zaměstnanců ke službě.
- `ProfileInfoForm`, `SocialLinksForm` — uložení (success už nejde do inline Notice, jen toast; chyby zůstávají inline).
- `ProfileImagesForm` — nahrání/smazání loga i úvodní fotky, uložení pozice coveru.
- `ServiceForm` (přidání/úprava) + `DeleteServiceDialog` (smazání služby).

### Úklid (ladící artefakty blokující/špinící build)
- `DashboardChrome.tsx` — odstraněn povinný prop `petr` + testovací blok („Ahoj z Chrome komponenty"), který rozbíjel `pnpm build` (layout ho nepředával → TS error).
- `services/ServicesList.tsx` — odstraněn omylem zapsaný text „ahoj".

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20. Čistě UI.

## 2026-06-12 — UI animace / přechod kroků rezervace + mazání zaměstnance

### Nové funkce
- `src/app/globals.css` — přidány znovupoužitelné keyframe animace `step-enter` (fade + posun zdola) a `row-leave` (fade + posun doprava + kolaps výšky) + utility `.animate-step-enter`, `.animate-row-leave`. Respektují `prefers-reduced-motion` (efekt se vypne).
- `components/reservation/ReservationFormController.tsx` — obsah kroku obalen do `<div key={step} className="animate-step-enter">` → každá změna kroku re-mountuje obsah a přehraje enter animaci. Uživatel jasně vidí, že se obsah změnil (řeší dojem „nic se neděje / něco se načítá").
- `dashboard/settings/EmployeesManager.tsx` — mazání zaměstnance: nový stav `removingId`, `handleDelete` nejdřív přehraje `.animate-row-leave` na řádku (240 ms) a teprve pak provede `deleteEmployeeAction` + `router.refresh`. Při chybě se řádek vrátí zpět (`removingId=null`) a zobrazí hláška. Delete tlačítko disabled během mazání.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20. Čistě UI.

## 2026-06-12 — přiřazení zaměstnanců ke službám / škálovatelné UI (20–30 lidí)

### Změny
- `dashboard/employees/ServiceEmployeesManager.tsx` — přepsáno pro velké týmy. Místo zdi chip-tlačítek (každý zaměstnanec u každé služby) jsou nově **sbalovací řádky** per služba: tělo (editor) se vykreslí až po rozbalení (méně DOM při mnoha službách). V editoru **vyhledávání** zaměstnanců podle jména (diakritiku-tolerantní `normalize`), rychlé akce **Vybrat vše / Zrušit výběr** (jeden batch zápis), **scrollovatelný** checkbox seznam (`max-h-64`). Souhrn řádku: „Všichni zaměstnanci" / „X z Y — náhled jmen (+N)".
- Ukládání optimistické s **revertem při chybě** (drží lokální `selected`); odstraněn `router.refresh` per klik (zbytečný re-render/flicker — lokální stav je zdroj pravdy, server action `setServiceEmployeesAction` perzistuje). Per-služba pending stav (`pendingServiceId`) blokuje tlačítka během zápisu.
- Beze změny serveru/DB — `setServiceEmployeesAction` (replace množiny) a `getServiceAssignments` stejné.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20. Čistě UI.

## 2026-06-12 — carousel zaměstnanců / scroll indikátory + navigace

### Nové funkce
- `components/reservation/ReservationFormController.tsx` (`EmployeeCarousel`) — přidány navigační šipky (`IconChevronLeft/Right`) a vizuální indikace scrollu. Komponenta měří `scrollLeft`/`scrollWidth`/`clientWidth` (ref + scroll/resize listener), drží stav `canScrollLeft`/`canScrollRight`. Šipky se zobrazí jen při přetečení, na okrajích jsou disabled. Posun přes `scrollBy({ behavior: 'smooth' })` o ~80 % viditelné šířky. Okrajové fade-gradienty (do `--color-canvas-white`) naznačují pokračování obsahu; nativní scrollbar skryt. Klient tak ví, že má scrollovat pro více zaměstnanců.
- Fix poskakování obsahu: hlavička „Zaměstnanec (nepovinné)" má pevnou výšku `h-8` a šipky jsou `absolute` vpravo → objevení/skrytí šipek už nemění výšku ani neposouvá obsah.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20. Čistě UI, bez migrace/testů.

## 2026-06-08 — zaměstnanci / zpřístupnění přepínačů a přiřazení od 1 zaměstnance

### Změny
- `EmployeesManager.tsx` — přepínače „Zobrazit tým na profilu" a „Výběr zaměstnance při rezervaci" se nově zobrazí už od **1 zaměstnance** (dřív ≥2), aby šlo výběr v rezervaci vůbec zapnout. Carousel ve veřejném formuláři se pak zobrazí, když je přepínač ON a u zvolené služby jsou dostupní zaměstnanci.
- `reservations/[id]/page.tsx` — přiřazení zaměstnance k rezervaci dostupné také od 1 zaměstnance.

### Pozn.
- Carousel se ve veřejné rezervaci zobrazí jen při zapnutém přepínači „Výběr zaměstnance při rezervaci" (`businesses.allow_employee_selection`). Veřejná stránka je ISR (revalidate 60 s) — po zapnutí se revaliduje on-demand.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — zaměstnanci v2 / stránka, per-služba přiřazení, carousel, email

### Nové funkce
- Migrace `0048_service_employees.sql` (APLIKOVÁNO) — M:N `service_employees(service_id, employee_id)` + index + RLS (veřejné čtení jen pro publikované podniky přes navázanou službu). Prázdné pro službu = všichni zaměstnanci (řeší aplikace).
- `dashboard/employees/page.tsx` — nová stránka „Zaměstnanci" (nav položka + `IconUsersGroup` v `DashboardChrome`, titulek). Sdružuje správu týmu (`EmployeesManager`) + per-služba přiřazení.
- `dashboard/employees/ServiceEmployeesManager.tsx` — pro každou službu chip-toggle zaměstnanců (bez výběru = všichni), okamžité uložení.
- `employee-actions.ts` — `getServiceAssignments`, `setServiceEmployeesAction` (replace množiny pro službu; ověření vlastnictví služby i zaměstnanců).

### Změny
- `settings/page.tsx` — karta „Zaměstnanci" odsud **odebrána** (přesunuta na dedikovanou stránku, „na jednom místě").
- `components/reservation/ReservationFormController.tsx` + `Step1ServicePicker.tsx` — výběr zaměstnance **přepracován** na carousel (1 řádek, foto/iniciály) **pod výpisem služeb v kroku 1**, filtrovaný dle vybrané služby (`serviceEmployees` mapa). Výběr volitelný (klik na vybraného zruší). Po změně služby se výběr resetuje. (#4) Tím je i splněno, že po odeslání (krok 5) se výběr už nezobrazuje. (#1)
- `src/app/[slug]/page.tsx` — staví `serviceEmployees` mapu (přiřazení, nebo všichni) pro `allow_employee_selection`; tým na profil nadále jen při `show_team_public`.
- E-mail majiteli (`reservation-notification.ts` + `EmailNotifier` + `ReservationCreator`) — přidán řádek „Preferovaný zaměstnanec" jen když klient vybral; jinak se neuvádí. (#2)

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 426 passed / 49 skipped, `pnpm build` OK. Migrace 0048 push. Pod Node 20.

## 2026-06-08 — zaměstnanci / přiřazení rezervaci (#3) + výběr klientem (#5)

### Nové funkce
- `src/server/ReservationEmployeeAssigner.ts` — `assignReservationEmployee(reservationId, employeeId|null)`: owner-scoped (RLS čtení rezervace ověří vlastnictví), validace zaměstnance na shodný `business_id`, update přes service-role.
- `dashboard/reservations/[id]/AssignEmployee.tsx` — select „Zaměstnanec" v detailu rezervace (Nepřiřazeno + seznam), okamžité uložení + refresh. Zobrazí se jen při ≥2 zaměstnancích.

### Změny
- `dashboard/reservations/[id]/page.tsx` — načítá `employee_id` + zaměstnance podniku (service-role), zobrazuje řádek „Zaměstnanec" a komponentu `AssignEmployee` (≥2 zaměstnanci). (#3)
- `src/server/ReservationCreator.ts` — `CreateReservationInput.employeeId?`; po úspěšném insertu **post-commit** přiřadí zaměstnance (validace na business_id, best-effort — nešahá na atomické `create_reservation` RPC). (#5)
- `components/reservation/ReservationFormController.tsx` — props `employees` + `allowEmployeeSelection`; selektor „Zaměstnanec (nepovinné)" nad kroky, zobrazen jen když je výběr povolen a ≥2 zaměstnanci; volba se předá do `createReservation`. (#5)
- `src/app/[slug]/page.tsx` — načítá `allow_employee_selection`; odděleně `employees` pro „Náš tým" (jen při `show_team_public`) a `selectableEmployees` pro výběr (jen při `allow_employee_selection`), aby zapnutý výběr nezveřejnil tým. Předává do rendereru i controlleru.

### Poznámky
- `reservations.employee_id` + přepínače už byly v migraci 0047 → žádná nová migrace.
- Per-employee dostupnost/sloty se neřeší — zaměstnanec je atribut rezervace (dle zadání). Slot logika beze změny.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 426 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — zaměstnanci / správa + foto + tým na profilu (#2, #4)

### Nové funkce
- Migrace `0047_employees.sql` (APLIKOVÁNO) — tabulka `employees(id, business_id, name, role, photo_url, sort_order, created_at)` + index + RLS (veřejné čtení jen pro publikované podniky přes `is_business_published`; zápis = service-role). Sloupce `businesses.show_team_public`, `businesses.allow_employee_selection`; `reservations.employee_id` (FK on delete set null) + index.
- `employee-actions.ts` — server actions: `getEmployees` (list + team settings), `createEmployeeAction`, `updateEmployeeAction`, `deleteEmployeeAction` (+ smaže foto z R2), `uploadEmployeePhotoAction` (sharp WebP → R2 `{business_id}/employee-{id}.webp`), `setTeamSettingAction`. Vše přes service-role po ověření vlastnictví.
- `EmployeesManager.tsx` (`'use client'`) — karta „Zaměstnanci" v `/dashboard/settings`: seznam (foto/iniciály, jméno, pozice), přidat, inline editace, smazat, upload fota. Přepínače „Zobrazit tým na profilu" + „Výběr zaměstnance při rezervaci" se zobrazí jen při ≥2 zaměstnancích (dle zadání).

### Změny
- `settings/page.tsx` — přidána karta „Zaměstnanci".
- `src/app/[slug]/page.tsx` — při `show_team_public` načte zaměstnance (anon RLS, jen publikované) a předá do rendereru → sekce „Náš tým" pod kartou Rezervace (renderer ji už uměl).

### Poznámky / rozhodnutí
- Zaměstnanci **nejsou plan-gated** — dle zadání gated na počet (≥2) pro přepínače. (Lze později navázat na plan matici.)
- `allow_employee_selection` sloupec + přepínač hotové; **vlastní výběr zaměstnance v rezervaci (#5) a přiřazení při schvalování (#3) zatím nepostaveno** — navazuje příště.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 426 passed / 49 skipped, `pnpm build` OK. Migrace 0047 dry-run + push. Pod Node 20.

## 2026-06-08 — dashboard / úprava „O nás" + kontaktních údajů po onboardingu (#1)

### Nové funkce
- `profile-actions.ts` — `getProfileInfo` + `updateProfileInfoAction` (sdílí `validateProfile` z onboardingu → name/description≤400/telefon 9 číslic/email/adresa). Update přes service-role + revalidace veřejné stránky.
- `ProfileInfoForm.tsx` — karta „O nás a kontakt" v `/dashboard/settings`: název, O nás (textarea + počítadlo 400), telefon (9místná maska), e-mail, adresa (nepovinná) + per-field chyby.

### Změny
- `settings/page.tsx` — karta „O nás a kontakt" nahoře (nad obrázky).
- `getOwnerBusiness` select rozšířen o `description,phone,contact_email,address`.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — veřejný profil / status otevřeno/zavřeno (dle otevírací doby)

### Nové funkce
- `src/lib/business/open-status.ts` — `isBusinessOpenNow(hours, now?)`: čistá funkce, vyhodnocuje v TZ Europe/Prague (přes `Intl` `hourCycle: h23`), otevřeno = aktuální čas v `[opens, closes)` daného dne. + unit testy (zima/léto/hranice/víkend).

### Změny
- `src/components/PublicProfileRenderer.tsx` — nový prop `isOpenNow?: boolean`. Když je definovaný: **tečka u názvu** (otevřeno = electric-green, zavřeno = šedá) a **štítek v kartě Otevírací doba** („Máme otevřeno" zeleně / „Máme zavřeno" šedě s tečkou). Když `undefined` (testy), status se nezobrazí → deterministické snapshoty.
- `src/app/[slug]/page.tsx` — počítá `isBusinessOpenNow(openingHours)` a předává do rendereru. (Status je svázán s ISR `revalidate=60`, tj. max ~60 s staleness — akceptováno.)
- Aktualizovány snapshoty `PublicProfileRenderer.test.tsx`.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 426 passed / 49 skipped (+5 open-status), `pnpm build` OK. Pod Node 20.

## 2026-06-08 — onboarding / „O nás" popis: max 400 znaků

### Změny
- `src/lib/onboarding/data.ts` — `validateProfile` odmítne popis delší než 400 znaků („Popis může mít nejvýše 400 znaků.") — serverový zdroj pravdy.
- `src/app/onboarding/3/ProfileForm.tsx` — textarea „Krátký popis" má `maxLength={400}` + živý počítadlo `X/400` pod polem.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — média / přechod na Cloudflare R2 + WebP pipeline + cover pozice/X/iniciály

### Rozhodnutí o úložišti
- Po analýze (Supabase 1 GB / Cloudinary 25 GB bandwidth = málo; Google Drive nevhodný pro servírování — service account nemá kvótu, jen OAuth, křehké public URL) zvoleno **Cloudflare R2**: 10 GB free, **nulový egress poplatek**, reálné CDN, S3 API. Bez Cloudinary, bez Drive.

### Nové funkce
- `src/lib/storage/r2.ts` — R2 S3 klient přes `aws4fetch` (`r2PutObject`, `r2DeleteObject`, `r2PublicUrl`, `r2PublicHost`). Klíče server-only.
- `src/lib/media/process-image.ts` — `processImageToWebp(input, kind)` přes `sharp`: EXIF rotate + resize (avatar ≤512, cover ≤1600) + WebP q82. Vrací ArrayBuffer.
- Migrace `0046_business_cover_position.sql` (APLIKOVÁNO) — `businesses.cover_position smallint 0–100 default 50` (object-position Y).
- Závislosti: `sharp@0.35.1`, `aws4fetch@1.0.20`.

### Změny
- `profile-actions.ts` — upload/remove přepsáno ze Supabase Storage na **R2 + sharp**. Pevný klíč `{business_id}/{logo|cover}.webp` → PUT přepíše původní (žádné sirotky); X/remove smaže objekt z R2 i sloupec v DB. Cache-busting `?v=`. Přidáno `updateCoverPositionAction`, `getProfileImages` vrací `coverPosition` + `businessName`.
- `ProfileImagesForm.tsx` — placeholder avataru = **iniciály podniku**; tlačítko **X** na náhledech (úplné smazání z R2+DB); **drag pozice coveru** (pointer drag svisle → `object-position` Y, ukládá `updateCoverPositionAction`).
- `PublicProfileRenderer.tsx` — cover se **vyrenderuje jen když je nahraný** (žádný gradient fallback) + aplikuje `object-position: center {coverPosition}%`; avatar překrývá cover jen když cover existuje, jinak normální odsazení.
- `src/app/[slug]/page.tsx` — načítá `cover_position`, předává `coverPosition`.
- `next.config.ts` — `next/image` remotePatterns rozšířeny o R2 public host (`R2_PUBLIC_BASE_URL`).
- Aktualizovány snapshoty `PublicProfileRenderer.test.tsx`.

### Ověřeno
- **R2 end-to-end smoke test** (jednorázový skript, smazán): PUT 200, GET public 200 `image/webp`, DELETE 204 → credentials, bucket, public servírování i mazání fungují.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Migrace 0046 dry-run + push. Pod Node 20.

### Poznámky
- Supabase Storage bucket `business-media` (migrace 0044) je nyní **nepoužívaný** (upload jede na R2). Ponechán, neškodí; lze později dropnout.
- `.env.example` obsahuje R2 klíče (placeholdery) — doporučení: ať jsou čistě fiktivní, ne částečné reálné prefixy.

## 2026-06-08 — veřejný profil / hlavička à la profil + sociální sítě

### Nové funkce
- Migrace `0045_business_social_links.sql` (APLIKOVÁNO na remote) — sloupce `businesses.facebook_url`, `instagram_url`, `youtube_url`, `google_url`.
- `src/app/(dashboard)/dashboard/settings/SocialLinksForm.tsx` (`'use client'`) — karta „Sociální sítě": 4 URL pole (Facebook/Instagram/YouTube/Google místo) s ikonami, validace na straně serveru.
- `profile-actions.ts` — `getSocialLinks`, `updateSocialLinksAction` (normalizace URL: prázdné → null, jinak vyžaduje http/https; service-role update + revalidace).

### Změny
- `src/components/PublicProfileRenderer.tsx` — přepracovaná hlavička dle inspirace (profilová): cover → avatar překrývá cover (`-mt-16`), vpravo řada kulatých ikon (telefon, e-mail, sociální sítě — jen vyplněné, externí s `target=_blank`/`rel`). Pod avatarem `H1` název, pod ním dekorativní text druhu podniku (tlumená barva), pod tím „O nás" popis. Levý sloupec už nemá samostatnou „O nás" kartu (popis je v hlavičce); pravý sloupec: Otevírací doba + Kontakt (adresa). Nové props `facebookUrl/instagramUrl/youtubeUrl/googleUrl`.
- `src/app/(dashboard)/dashboard/settings/page.tsx` — přidána karta „Sociální sítě".
- `src/app/[slug]/page.tsx` — `loadPublishedProfile` čte social sloupce a předává do rendereru.
- Aktualizovány snapshoty `PublicProfileRenderer.test.tsx` (3).

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Migrace 0045 dry-run + push. Pod Node 20.

## 2026-06-08 — veřejný profil / nahrávání avataru + cover obrázku (feature A)

### Nové funkce
- Migrace `0044_business_media.sql` (APLIKOVÁNO na remote) — sloupec `businesses.cover_url` + public Storage bucket `business-media` (limit 5 MB, povolené `image/jpeg|png|webp`). Avatar = stávající `logo_url`, cover = nový sloupec.
- `src/app/(dashboard)/dashboard/settings/profile-actions.ts` — server actions: `getProfileImages`, `uploadProfileImageAction(kind, formData)`, `removeProfileImageAction(kind)`. Upload běží přes service-role (ověří vlastnictví podniku přes `owner_user_id`), validace typu/velikosti (5 MB, jpg/png/webp), stabilní cesta `{business_id}/{logo|cover}` s `upsert` + cache-busting `?v=`. Po změně `revalidatePublicPage`.
- `src/app/(dashboard)/dashboard/settings/ProfileImagesForm.tsx` (`'use client'`) — sekce „Vzhled profilu": náhled + nahrát/změnit/odebrat pro logo (avatar) i cover. Okamžitý upload při výběru souboru.

### Změny
- `src/app/(dashboard)/dashboard/settings/page.tsx` — přidána karta „Vzhled profilu" (`ProfileImagesForm`) nad nastavení dostupnosti.
- `src/app/[slug]/page.tsx` — `loadPublishedProfile` čte `cover_url` a předává `coverUrl` do rendereru (hero cover na veřejném profilu).
- `next.config.ts` už Supabase Storage host povoluje (`/storage/v1/object/public/**`) — beze změny.

### Poznámky / rozhodnutí
- Write RLS na `storage.objects` není potřeba — zápis jen service-role; čtení veřejné (public bucket). Limity vynucené i na úrovni bucketu.
- Dashboard náhledy používají `next/image unoptimized` (vyhnutí se optimalizaci u cache-busted URL); veřejný profil používá optimalizovaný `next/image` (host povolen).
- Zbývá feature B (zaměstnanci) — dle volby uživatele stavíme A první.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Migrace 0044 dry-run + push. Pod Node 20.

## 2026-06-08 — veřejný profil / redesign dle reference (hero + 2 sloupce + footer)

### Změny
- `src/components/PublicProfileRenderer.tsx` — přepsáno dle `.kiro/docs/verejny-profil/code.html` (bez headeru z podkladu, použit náš `PublicFooter`):
  - **Hero**: cover obrázek (prop `coverUrl`; bez něj brand gradient) + překrývající kulatý avatar (`logoUrl`, fallback iniciála) + název podniku (na heru desktop, pod herem mobil).
  - **Dvousloupcový layout** s opraveným spacingem `gap-[var(--section-gap)]` (chyba v podkladu = nulový gap mezi sloupci). Levý (lg:col-span-2): badge typu, „O nás", „Rezervace" (rezervační formulář, fallback výpis služeb), „Náš tým". Pravý: „Otevírací doba", „Kontakt" (s Tabler ikonami telefon/mail/poloha).
  - Sekce **„Náš tým"** přes nový volitelný prop `employees` (default prázdné → skryto; připraveno na feature zaměstnanců).
  - Nové props: `coverUrl?`, `employees?` + typ `PublicProfileEmployee`. Bezpečnostní auto-escape uživatelských polí (R1.7) zachován.
- Aktualizovány snapshoty `PublicProfileRenderer.test.tsx` (3) — chování (prázdné služby → hláška, žádný formulář) beze změny.

### Poznámky / další slices (zatím NEpostaveno — vyžaduje infra rozhodnutí)
- **Avatar/cover upload**: chybí sloupec `businesses.cover_url`, Storage bucket + RLS a upload UI v dashboard nastavení. (Avatar = stávající `logo_url`.)
- **Zaměstnanci**: chybí tabulka `employees`, feature klíč `employees` v plan matici + gating, dashboard CRUD. Renderer je už připraven (`employees` prop).

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — subscription / admin override nepublikoval profil (is_published nesynchronizován)

### Bug & fix
- **Symptom:** Po změně účtu z `free` na `active` s tarifem přes admin override zůstal veřejný profil nezveřejněný („Tento podnik zatím nepublikoval svůj profil.").
- **Root cause:** RPC `admin_override_subscription` (migrace 0036) nastavovala jen `plan`/`status`/`current_period_end`, ale NE `businesses.is_published`. Veřejný profil je viditelný jen přes `is_business_published(id)` = `is_published = true AND status IN ('active','grace_period')`. Override tedy aktivoval předplatné, ale profil zůstal skrytý. (Běžná platební cesta `activateSubscription` i granty free_trial/comp `is_published` nastavují správně — chyběl jen override.)
- **Fix:** Migrace `0043_admin_override_sync_publish.sql` (APLIKOVÁNO na remote) — `admin_override_subscription` nově synchronizuje `is_published` se cílovým stavem (`active`/`grace_period` → publikováno, jinak skryto). Signatura, návratové sloupce i audit beze změny → TS wrapper i testy beze změny.
- **Pozn.:** Migrace nepřepisuje existující řádky (zachování invariantu admin „suspend" = active + is_published=false). Pro už aktivovaný testovací podnik je potřeba override v `/admin` zopakovat → profil se publikuje. Expirace (billing cron `expireSubscription`) profil skrývá automaticky jako dosud.

### Ověřeno
- `supabase db push --linked` (dry-run + push) OK. Bez změny TS (lint/test/build neovlivněny). Pod Node 20.

## 2026-06-08 — dashboard / ikony na metrických kartách

### Změny
- `src/app/(dashboard)/dashboard/page.tsx` — `MetricCard` rozšířen o volitelný prop `icon`; ikona se vykreslí jako kruhový badge vpravo nahoře (dle screenshotu), pozadí `color-mix(canvas-white 55%)`, ikona rich-violet. Owner přehled: Stav → `IconLayoutDashboard`, Služby → `IconBriefcase`, Rezervace → `IconCalendarEvent` (shodné s nav ikonami v sidebaru), Platnost → `IconHourglassEmpty`. Admin karty bez ikon beze změny.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — subscription/plans / sdílená status karta, předvýběr tarifu, lock redirect na /plans

### Nové funkce
- `src/components/subscription/SubscriptionStatusCard.tsx` — sdílená karta stavu předplatného (Stav / Tarif / Začátek / Konec období). Použita na `/dashboard/subscription` i `/dashboard/plans`. Exportuje i typ `SubscriptionStatus`.

### Změny
- `src/lib/auth/free-user-guard.ts` — lock redirect free účtu z reservation-management cest nově míří na `/dashboard/plans` (dřív `/dashboard/subscription`) se `search='locked=reservations'`.
- `src/app/(dashboard)/dashboard/plans/page.tsx` — čte `?locked` (zobrazí Notice „Odemkněte tuto funkci…"), nahoře sdílená status karta (načítá i `current_period_start/end`). Aktuální tarif: CTA zakázané, text „Obnoví se {datum}" (z `current_period_end`). Ostatní tarify: odkaz `/dashboard/subscription?plan=<plan>` (Upgradovat/Zvolit).
- `src/app/(dashboard)/dashboard/subscription/page.tsx` — používá sdílenou status kartu; čte `?plan` (validace na známý tarif) → předává `initialPlan` do `SubscriptionManager`. Odstraněn `locked` (přesunuto na /plans) i duplicitní inline karta/labely.
- `src/app/(dashboard)/dashboard/subscription/SubscriptionManager.tsx` — nový prop `initialPlan`: `CheckoutSection` (free) jím předvybere radio; `ManageSection` (active/grace) jím předvybere cílový tarif (jen pokud ≠ aktuální). Aktuální tarif je z výběru změny vyloučen jako dosud.
- `src/__tests__/middleware/free-user-guard.test.ts` — očekávaný lock redirect aktualizován na `/dashboard/plans`.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` zkompiloval + prošel type-checkem (BUILD_ID vygenerován). Pozn.: build byl pomalý (~16 min) kvůli souběžně běžícímu druhému dev serveru na stejném `.next` — environmentální, ne chyba kódu. Pod Node 20.

## 2026-06-08 — auth/gating / free účet: Rezervace+Klienti → /dashboard/subscription s notice

### Změny
- `src/lib/auth/free-user-guard.ts` — free účet na `/dashboard/reservations` a `/dashboard/clients` se nově přesměruje na `/dashboard/subscription` (dřív `/dashboard`) s `search: 'locked=reservations'`. `FreeUserGuardDecision.redirect` rozšířeno o `/dashboard/subscription` a volitelný `search`. (expired/deleted_data dál → /error.)
- `src/middleware.ts` — `redirectWithSessionState` přijímá volitelný `search`; předává `decision.search`.
- `src/app/(dashboard)/dashboard/subscription/page.tsx` — čte `searchParams.locked`; při zamčení zobrazí `Notice`: „Odemkněte tuto funkci volbou správného balíčku.".
- `src/__tests__/middleware/free-user-guard.test.ts` — očekávaný redirect free účtu aktualizován na `/dashboard/subscription` + `search`.

### Poznámky / kontext
- Symptom „stránka Rezervace nefunguje" = právě tento (existující) free-user guard, který free účty z reservation-management cest odváděl na přehled. Nešlo o regresi z UI přestavby. Nově je redirect informativní (na předplatné + notice).
- Aktualizován snapshot `PublicProfileRenderer.test.tsx` (Notice nově s ikonou — z dřívější úpravy).

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — ui / Notice: ikona na začátku

### Změny
- `src/components/ui/notice.tsx` — na začátek přidána ikona dle varianty (`neutral` → `IconInfoCircle`, `error` → `IconAlertTriangle`), barva dědí z textu (neon-pink). Layout `flex items-start gap-2`, ikona `shrink-0`, text v `<span>`.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / fixní app-shell (scroll uvnitř panelu, footer v panelu)

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — přechod na fixní layout: root `h-screen overflow-hidden` (žádný scroll stránky), header/sidebar stálé. Obsahový light-violet panel má `h-full overflow-y-auto` → Y scrollbar je jen uvnitř panelu a zaoblený panel není nikdy zakrytý/odscrollovaný. Footer přesunut **dovnitř** panelu (pod obsah, přes `flex-1` obsahová část ho tlačí dospodu). Vnitřní padding obsahu `var(--section-gap)`.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / nové barvy chromu (milky-gray) + light-violet panel obsahu

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — root, desktop sidebar i mobilní drawer mají pozadí `var(--color-milky-gray)` (#eff3f4). Obsah (`<main>`) je nově zaoblený panel s pozadím `var(--color-light-violet)` (#dedfef), vnitřní padding `var(--section-gap)` (= rozteč karet, 30px); kolem panelu gutter `p-4 md:p-6` (prosvítá milky-gray). Footer zůstává mimo panel na milky-gray.
- `src/components/dashboard/DashboardHeader.tsx` — header pozadí na `var(--color-milky-gray)`.
- Bílé sub-karty stránek i pastelové metrické karty teď sedí na light-violet panelu (vzor dle reference Finly).

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / barevné metrické karty (owner přehled)

### Změny
- `src/app/(dashboard)/dashboard/page.tsx` — `MetricCard` rozšířen o volitelný prop `bg` (barva pozadí přes inline `style`, aby spolehlivě přebila bílé pozadí `Card`). Owner přehled: 4 karty dostaly pastelové pozadí + odkaz:
  - Stav → `--color-sunset-pink` → `/dashboard/subscription`
  - Služby → `--color-lush-green` → `/dashboard/services`
  - Rezervace → `--color-slate-violet` (#d3c8ff) → `/dashboard/reservations`
  - Platnost → `--color-air-blue` → `/dashboard/subscription`
- Hover: barevné karty `brightness-[0.97]`, neutrální karty zachovaly border-hover. Admin přehledové karty (bez `bg`/`href`) beze změny — bílé.
- Text na pastelech ponechán tmavý (slate-text label, rich-violet hodnota) — čitelný.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / obsah bez rámečku (plné bílé pozadí)

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — odstraněn zaoblený rámeček (radius/border/gutter) kolem obsahu. Celý obsahový sloupec pod headerem (`<main>` + footer) má teď jen plné bílé pozadí (`bg-canvas-white`), bez okrajů a zaoblení. Header zůstává na cloud-mist (oddělen spodním borderem), sidebar beze změny.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / footer uvnitř bílé plochy obsahu

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — bílá zaoblená plocha nově obaluje obsah i footer (footer přesunut dovnitř, pod `<main>`). Plovoucí karta → souvislý bílý blok (obsah + footer) s gutterem; header zůstává nad ním na cloud-mist. Footer (border-t) tak sedí na bílém pozadí.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (EXIT=0; sporadický „Failed to collect page data" je přechodný flake dynamických stránek volajících DB při build collection — opakovaný build prošel). Pod Node 20.

## 2026-06-08 — dashboard / titulek sekce zpět do obsahu (h1 mimo header)

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — route-odvozený titulek se nově vykresluje jako `<h1>` na začátku bílé obsahové plochy (nad `children`), ne v headeru. Jediný zdroj (resolver `TITLE_BY_PATH`), žádné per-stránkové duplicity.
- `src/components/dashboard/DashboardHeader.tsx` — odebrán prop `title` i `<h1>`; vlevo zůstává jen mobilní hamburger, vpravo akce (vyhledávání, nastavení, účet).

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (EXIT=0; jeden build-worker hiccup byl přechodný, opakovaný build prošel). Pod Node 20.

## 2026-06-08 — dashboard / redesign shellu (bílá plocha obsahu + nový header)

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — obsah (`children`) nově sedí v bílé ploše se zaoblenými rohy (`rounded-[var(--radius-cards)]` + `border-input-border` + `bg-canvas-white`) na cloud-mist sloupci; landmark `<main>` přesunut do shellu. Přidán resolver titulku sekce z cesty (`TITLE_BY_PATH`, nejdelší prefix; `/dashboard` a `/admin` jen přesně) předávaný do headeru. Aside a footer beze změny.
- `src/components/dashboard/DashboardHeader.tsx` — nový layout: vlevo titulek sekce (`<h1>`, + mobilní hamburger), vpravo akce: rozbalovací vyhledávání, ikona nastavení, ikona účtu. Header sticky na cloud-mist.
- `src/components/dashboard/DashboardSearch.tsx` — vyhledávání je teď sbalené do ikony; po kliknutí/fokusu se s `transition-[width]` rozvine do inputu (slide animace) a vyfokusuje. Klik mimo/Escape při prázdném dotazu zase sbalí. Panel výsledků kotven vpravo. Odstraněn artefaktový `hledej` class.

### Změny napříč stránkami (titulek jen v headeru)
- Z obsahu všech dashboard i admin stránek odstraněn duplicitní velký nadpis + eyebrow (Badge/`<p>`); akční prvky zachovány a přesunuty do horní lišty obsahu: owner (`dashboard`, `reservations`(+přepínač pohledu/Export/Klienti), `clients`, `services`, `opening-hours`, `settings`, `subscription`(Porovnat tarify), `plans`, `faq`, detaily rezervace/klienta) i admin (`admin`, `businesses`(+detail s názvem podniku jako `<h2>`), `payments`, `coupons`, `audit`, `plans`). Stránky už nenesou vlastní `<main>` ani pozadí/odsazení (dává shell).
- `dashboard/page.tsx` — `DashboardShell` zjednodušen (bez `title`/`eyebrow`), ponechán řádek „Přihlášený účet" + „Zobrazit profil".
- Odebrány nepoužité importy `Badge` v dotčených stránkách.

### Ověřeno
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / pravý okraj sidebaru (border-r input-border)

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — desktop `<aside>` i mobilní drawer `<aside>` dostaly `border-r border-[var(--color-input-border)]` (oddělení sidebaru od obsahu).

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / hover pozadí sidebar položek (violet tint)

### Změny
- `src/components/dashboard/DashboardSidebar.tsx` — hover pozadí položek sidebaru změněno z `var(--color-soft-gray-fill)` na `color-mix(in srgb, var(--color-action-violet) 14%, white)` (jemný violet tint). Platí pro nav položky, „Předplatné", „Nápověda" i „Odhlásit se". Aktivní stav (bílá karta + action-violet text) beze změny.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard + admin / jednotné pozadí stránek (cloud-mist)

### Změny
- Sjednoceno pozadí všech stránek dashboard prostředí na `var(--color-cloud-mist)` (shoda se shellem `DashboardChrome`). Dříve měly podstránky `<main>` pozadí `var(--color-soft-gray-fill)`, které překrývalo cloud-mist ze shellu → nejednotnost.
- Owner podstránky: `dashboard/{subscription,services,opening-hours,settings,clients,reservations,reservations/[id],clients/[id]}/page.tsx` — `bg-[var(--color-soft-gray-fill)]` → `bg-[var(--color-cloud-mist)]` na `<main>`.
- Admin podstránky (sdílí stejný shell): `admin/{page,businesses,businesses/[id] (2×),payments,audit,coupons}/page.tsx` — totéž.
- `dashboard/{page,faq,plans}` a `admin/plans` už pozadí nenastavovaly (dědí ze shellu) — beze změny.
- Hover stavy `hover:bg-[var(--color-soft-gray-fill)]` (řádky tabulek, tlačítka) ponechány — jsou záměrné, ne pozadí stránky.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — entitlements / admin matice funkcí per tarif (DB + gating + admin UI)

### Nové funkce
- Migrace `0042_plan_features.sql` (APLIKOVÁNO na remote) — tabulka `plan_features(plan, feature_key, enabled, updated_at)`, PK (plan, feature_key). **Bez seedu** — chybějící řádek = povoleno (default „vše zapnuto"). RLS zapnuto bez politik (deny-all; service_role obchází). Přístup jen server-side.
- `src/lib/plans/feature-matrix.ts` — `loadPlanFeatureMatrix(supabase)` (DB → matice, fail-open na default), `planHasFeature(matrix, plan, key)`, `defaultPlanFeatureMatrix()`.
- `src/lib/admin/plan-feature-manager.ts` — `setPlanFeature(...)`: upsert buňky + auditní záznam `plan_feature_update` (before/after) přes `write_audit_log`.
- `src/app/admin/plans/` — admin stránka „Tarify a funkce" (matice funkce × tarif s `Switch` toggly, optimistická aktualizace + rollback), server action `setPlanFeatureAction` (admin check defense-in-depth + service-role upsert). `force-dynamic`.

### Změny
- `src/lib/plans/features.ts` — odstraněna statická `PLAN_FEATURE_MATRIX`/`planHasFeature` (přesunuto do feature-matrix, DB-backed); ponechán katalog + `BUSINESS_FEATURE_KEYS`.
- `src/app/(dashboard)/dashboard/plans/page.tsx` — owner Tarify čte matici z DB (`loadPlanFeatureMatrix`).
- `src/app/(dashboard)/search-actions.ts` — gating klientského vyhledávání nově přes matici (`planHasFeature(..., 'client_search')`); `src/lib/search/capabilities.ts` **smazáno** (nahrazeno maticí). Free/bez tarifu zatím neomezeno.
- `src/lib/admin/audit-logger.ts` — `AuditActionType` +`plan_feature_update`, `AuditTargetType` +`plan_feature`. `src/app/admin/audit/page.tsx` — doplněné labely.
- `src/components/dashboard/DashboardChrome.tsx` — admin nav +„Tarify a funkce" (`/admin/plans`).

### Poznámky
- Výchozí stav: vše povolené pro všechny tarify (test mode) — admin teď může jednotlivé funkce vypínat per tarif; projeví se v owner Tarify stránce i v gatingu (client_search).
- Audit toggle: upsert + samostatný `write_audit_log` (ne v jedné transakci) — config toggle je nízkorizikový; selhání auditu akci neshodí.
- `audit_log.action_type` je `text` (bez enumu) → nový typ akce bez DB změny.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Migrace 0042 přes dry-run + push. Pod Node 20.

## 2026-06-08 — dashboard / entitlements katalog + stránka Tarify

### Nové funkce
- `src/lib/plans/features.ts` — katalog funkcí podniku (`BUSINESS_FEATURES`, 11 položek: veřejný profil, online rezervace, správa/auto-schvalování rezervací, paralelní termíny, služby, otevírací doba, klienti, vyhledávání klientů, e-mailové notifikace, faktury) + `PLAN_FEATURE_MATRIX` (zatím VŠE povoleno pro všechny tarify, test mode) + `planHasFeature(plan, key)`. Připraveno na budoucí admin-editovatelnou matici (DB).
- `src/app/(dashboard)/dashboard/plans/page.tsx` — stránka „Tarify a funkce": 3 karty (Start/Pokročilý/Max) s cenou (`planPriceCzk`), zvýraznění aktivního tarifu (violet border + štítek „Váš aktuální tarif"), CTA stavy (aktivní → zašedlé „Aktivní"; vyšší → „Upgradovat tarif"; nižší/bez tarifu → „Zvolit tento tarif") mířící na `/dashboard/subscription`; pod kartami porovnávací tabulka funkcí (zelené fajfky, zatím vše u všech tarifů).

### Změny
- `src/lib/search/static-index.ts` — přidán search záznam „Tarify a funkce" → `/dashboard/plans`.
- `src/app/(dashboard)/dashboard/subscription/page.tsx` — odkaz „Zpět na dashboard" v hlavičce změněn na „Porovnat tarify" → `/dashboard/plans`.

### Poznámky / rozhodnutí
- Gating zatím neaktivní (vše zelené pro všechny tarify) — dle zadání (test mode). Admin editace matice = budoucí slice (DB `plan_features` + admin UI), viz feature-backlog „Entitlements".
- CTA na kartách vedou na `/dashboard/subscription`, kde žije reálný checkout/změna tarifu (`SubscriptionManager`) — neduplikuji platební logiku.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK (`/dashboard/plans`). Pod Node 20.

## 2026-06-08 — dashboard / širší search + FAQ stránka

### Nové funkce
- `src/app/(dashboard)/dashboard/faq/page.tsx` — dashboard nápověda (FAQ) přes `FaqAccordion` s 6 dotazy mířenými na provoz podniku (schvalování, publikace, otevírací doba/služby, platby, hledání klienta, kontakt). Karta v dashboard content stylu.

### Změny
- `src/components/dashboard/DashboardSearch.tsx` + `DashboardHeader.tsx` — search bar rozšířen: kontejner `flex-1` v levé skupině headeru, input `w-full` do max šířky `calc(var(--spacing)*150)` (≈600px), responzivně se zmenší. Dropdown panel `w-full` (místo pevných 320px). 
- `src/lib/search/static-index.ts` — FAQ výsledky nově míří na `/dashboard/faq` (dřív `/kontakt`/`/predplatne`) + přidán záznam „Zobrazit všechny časté dotazy".

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (`/dashboard/faq`). Pod Node 20.

## 2026-06-08 — dashboard / vyhledávání v headeru (rozšiřitelné, plan-gated)

### Nové funkce
- `src/lib/search/types.ts` — sdílené typy (`SearchResult`, `SearchGroup` settings/clients/faq, `ClientSearchResponse`, group labels, min. délka dotazu). Zdrojová architektura připravená na další skupiny.
- `src/lib/search/capabilities.ts` — `planAllowsClientSearch(plan)` gating hook. `CLIENT_SEARCH_RESTRICT_TO_PLANS = null` = bez omezení (zatím); nastavením množiny tarifů se feature uzamkne na vybrané balíčky (budoucí upscale).
- `src/lib/search/static-index.ts` — statický index (položky nastavení + FAQ) + `searchStaticIndex(query)` s normalizací bez diakritiky. Rozšiřitelné přidáním záznamu.
- `src/app/(dashboard)/search-actions.ts` — server action `searchClientsAction(query)`: tenant-scoped (business_id + RLS) hledání klientů dle jména/e-mailu/telefonu (ILIKE, limit 6), gated přes `planAllowsClientSearch`; sanitizace dotazu proti rozbití PostgREST `or`/`ilike`.
- `src/components/dashboard/DashboardSearch.tsx` (`'use client'`) — combobox v headeru: statické zdroje lokálně + klienti přes debounced (300 ms) server action; výsledky seskupené (Nastavení/Klienti/Nápověda); zamčený stav klientů → hláška o vyšším tarifu; zavření klik mimo/Escape; min. dotaz 2 znaky.

### Změny
- `src/components/dashboard/DashboardHeader.tsx` — statický search input nahrazen `DashboardSearch` (prop `showSearch`).
- `src/components/dashboard/DashboardChrome.tsx` — předává `showSearch={variant === 'owner'}` (admin search = budoucí slice).

### Poznámky / rozhodnutí
- Gating je teď OTEVŘENÝ všem (i free) — záměrně, aby šlo testovat; struktura připravena zúžit na placené/vybrané tarify jediným configem.
- Admin varianta zatím search nemá (jiné zdroje — podniky/platby — doplníme později).
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — dashboard / znovupoužitelné komponenty shellu (sidebar/header/footer, role-driven)

### Nové funkce
- `src/components/dashboard/DashboardSidebar.tsx` — sidebar (brand + nav s aktivním stavem + akce: Předplatné[owner]/Nápověda/Odhlásit). Položky přes prop `items: DashboardNavItem[]`, `showUpgrade`, `onNavigate`.
- `src/components/dashboard/DashboardHeader.tsx` — topbar: mobilní hamburger + logo, search bar (zatím vizuální), ikona nastavení a uživatele; `settingsHref` dle role.
- `src/components/dashboard/DashboardFooter.tsx` — vystředěné textové odkazy (VOP, Ochrana údajů, Nápověda) + copyright.

### Změny
- `src/components/dashboard/DashboardChrome.tsx` — přepsán na kompozici Sidebar+Header+Footer; `variant: 'owner' | 'admin'` určuje nav položky (`NAV_BY_VARIANT`) a `settingsHref`. Stejný layout, dynamický obsah. Obsah obalen `<div>` (ne `<main>`) — stránky si nesou vlastní `<main>` (žádné vnořené landmarky).
- `src/app/(dashboard)/layout.tsx` — zjišťuje `is_admin` a předává `variant` (admin/owner).
- `src/app/admin/layout.tsx` (nové) — admin oblast `/admin/*` nově používá stejný shell (`variant="admin"`), takže má sidebar/header/footer jako owner dashboard, jen s admin navigací (Přehled, Podniky, Platby, Kupóny, Audit).
- `src/app/(dashboard)/dashboard/page.tsx` — `DashboardShell` obal vrácen na `<main>` (landmark) uvnitř shell `<div>`.

### Poznámky
- Admin nav cílí na existující routy `/admin`, `/admin/businesses`, `/admin/payments`, `/admin/coupons`, `/admin/audit`.
- Search v headeru je zatím prezentační (napojení později).
- Podstránky (owner i admin) mají stále vlastní `<main>`/hlavičky — vizuálně se renderují v novém sloupci; sladění jejich vzhledu je další slice.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK (owner + admin oblasti). Pod Node 20.

## 2026-06-08 — dashboard / nový shell (sidebar + topbar) dle reference

### Nové funkce
- `src/components/dashboard/DashboardChrome.tsx` (`'use client'`) — shell dashboardu dle `.kiro/docs/Dashboard/user/code.html`: fixed levý **sidebar** (w-64, cloud-mist) s logem, navigací (Přehled, Rezervace, Služby, Klienti, Otevírací doba, Nastavení — Tabler ikony, aktivní = bílá karta + action-violet), footer (Předplatné, Nápověda → /kontakt, Odhlásit se = logout form). **Topbar** (sticky h-16, bílá) s mobilním hamburgerem, settings odkazem a avatarem; na mobilu sidebar jako drawer s overlayem. Obsah v pravém sloupci (`lg:ml-64`).

### Změny
- `src/app/(dashboard)/layout.tsx` — `DashboardNav` nahrazen `DashboardChrome`em obalujícím `{children}`. DpaModal zachován.
- `src/components/dashboard/DashboardNav.tsx` — **smazáno** (nahrazeno shellem).
- `src/app/(dashboard)/dashboard/page.tsx` — `DashboardShell` zbaven vlastního logout/settings headeru (chrome je nese) a `min-h-screen`/soft-gray pozadí; header jen eyebrow + title + e-mail + „Zobrazit profil". Reálná data (KPI, profil/stav karty) beze změny. Odebrán nepoužitý `Button` import a `showSettings` prop.

### Poznámky / rozhodnutí
- Fake analytics z reference (grafy tržeb/výdajů, donut, Service Performance, Booking Sources, Team Productivity) ZÁMĚRNĚ nestavěny — nemáme data; reference brána jako vzhledový vzor.
- Ostatní dashboard podstránky zatím renderují svůj původní `<main>` uvnitř nového sloupce (funkční, vlastní hlavičky) — migrace je další slice.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — onboarding krok 3 / validace telefonu (přesně 9 číslic)

### Změny
- `src/lib/onboarding/data.ts` — `validateProfile`: telefon musí odpovídat `^\d{9}$`, jinak chyba „Telefon musí mít přesně 9 číslic." (server, zdroj pravdy).
- `src/app/onboarding/3/ProfileForm.tsx` — pole Telefon je nově controlled: `onChange` odstraňuje nečíselné znaky a ořezává na 9 znaků (`replace(/\D/g,'').slice(0,9)`), `inputMode="numeric"`, `maxLength=9`, placeholder „123456789". Na blur validace: prázdné → „Zadejte telefon.", nevyhovuje 9 číslicím → „Telefon musí mít přesně 9 číslic.". Existující draft se při načtení taky ořeže na číslice.

### Poznámky
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — onboarding krok 6 / souhrn „Souhrn údajů" dle reference

### Změny
- `src/app/onboarding/6/page.tsx` — success větev přepsána: nad kartou centrovaný nadpis „Vše je připraveno" + popis; jedna karta „Souhrn údajů" (`IconFileText`) s řádky label↔hodnota: Typ podniku, Název podniku, **Webová adresa** (`horea.cz/{slug}` preview, slug action-violet), Kontakt (e-mail + telefon), **Adresa** (nebo „Neuvedeno"), **Služby** (výpis VŠECH služeb + cena), Otevírací doba (seskupené dny). Pod řádky info box (`IconInfoCircle`, aqua tint) a `CommitForm` (Zpět / Dokončit). Helper `groupHours` seskupuje po sobě jdoucí otevřené dny se shodnými časy.
- `src/app/onboarding/6/CommitForm.tsx` — tlačítko „Vytvořit podnik" → „Dokončit a vytvořit profil".
- Měna v souhrnu zobrazena bez desetinných míst (`maximumFractionDigits: 0`).

### Poznámky / rozhodnutí
- Per-sekční „Upravit" odkazy odstraněny (reference je read-only souhrn; editace probíhá po dokončení v administraci). Navigace zpět přes „Zpět" / progress zůstává.
- Missing-steps větev (nekompletní draft) beze změny.
- `pnpm lint` čistý, `pnpm build` OK (`/onboarding/6`). Pod Node 20.

## 2026-06-08 — onboarding krok 5 / stylizovaný výběr času (TimePicker)

### Nové funkce
- `src/app/onboarding/5/TimePicker.tsx` — vlastní stylizovaný výběr času (24h `HH:MM`). Trigger vypadá jako input s hodnotou + ikonou `IconClock`; kliknutí kamkoliv (pole i ikona) otevře dropdown se dvěma scrollovacími sloupci (Hodina 00–23, Minuta po 5). Zavírá se kliknutím mimo / Escapem. Vybraná hodnota zvýrazněna action-violet. Skrytý `<input type="hidden" name=…>` zachovává odesílání přes FormData. ARIA (`haspopup`/`expanded`/`dialog`), disabled stav.
- `src/components/ui/switch.tsx` — toggle switch nad nativním checkboxem (pill track + posuvný knob, zapnuto = action-violet); zachovává name/value/checked/FormData chování.

### Změny
- `src/app/onboarding/5/HoursForm.tsx` — nativní `<input type="time">` (otevřeno od/do) nahrazeno `TimePicker`em; checkbox dne (otevřeno/zavřeno) nahrazen `Switch`em (dle reference). Odebrán nepoužitý import `Input`/`Checkbox`. Datový model (`opensAt`/`closesAt` jako `HH:MM`, `openDay`) i `submitHoursAction`/`validateHours` beze změny.

### Poznámky
- Zobrazení 24h (CZ), ne AM/PM z reference. Minuty po 5 (12 voleb); hodnoty mimo krok se jen nezvýrazní, ale fungují.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK (`/onboarding/5`). Pod Node 20.

## 2026-06-08 — onboarding krok 3 / profil: leading ikony + placeholdery

### Změny
- `src/app/onboarding/3/ProfileForm.tsx` — dle reference: pole Telefon/Email/Adresa dostala leading ikony (`IconPhone`/`IconMail`/`IconMapPin`, absolutně vlevo, `pl-11` na inputu). Doplněny placeholdery: název „Např. Horea Studio", popis „Napište něco o svém podniku, čím se zabýváte…", email „email@podnik.cz", adresa „Ulice, č.p., Město, PSČ". Telefon ponechán s funkční 9místnou maskou (placeholder „123456789").

### Poznámky
- Funkční logika beze změny (controlled telefon 9 číslic + validace, required blur validace, submit). Jen UI vrstva.
- `pnpm lint` čistý, `pnpm build` OK (`/onboarding/3`). Pod Node 20.

## 2026-06-08 — auth / přihlášený uživatel: redirect i z verify-email a error

### Změny
- `src/app/verify-email/page.tsx` — výchozí větev (bez parametrů, „účet nepotvrzen") nově volá `redirectIfAuthenticated()` → přihlášený (=potvrzený) uživatel jde na `/dashboard`. Token/code/error větve (verifikace odkazu) beze změny — v nich uživatel při renderu ještě není přihlášen, takže flow „Účet aktivovaný" zůstává funkční.
- `src/lib/auth/app-user-guard.ts` (nové) — `resolveAppUserGuardState(supabase, userId)` vytaženo z middleware (sdílený zdroj). Vrací guard state nebo `null` (fail-closed).
- `src/middleware.ts` — `getAppUserGuardState` přepsán na tenký wrapper nad `resolveAppUserGuardState(createMiddlewareAdminClient(), …)`; odebrán lokální typ `AppUserGuardState` i nepoužitý import `SubscriptionStatus`.
- `src/app/error/page.tsx` — přihlášený uživatel se **zdravým** guard state (`resolveAppUserGuardState !== null`) je přesměrován na `/dashboard`. Při null (stav nelze ověřit) zůstává na `/error` → **žádná redirect smyčka** (právě kvůli tomu sem middleware fail-closed posílá).

### Poznámky
- Loop-safe řešení `/error`: redirect jen když je stav zdravý, takže `/dashboard` (chráněný middlewarem) nebounce zpět na `/error`.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped (žádná regrese), `pnpm build` OK. Pod Node 20.

## 2026-06-08 — auth / přihlášený uživatel: redirect z login/register na dashboard

### Nové funkce
- `src/lib/auth/redirect-if-authenticated.ts` — server guard `redirectIfAuthenticated(to='/dashboard')`: pokud `supabase.auth.getUser()` vrátí usera, `redirect(to)`. Nepřihlášený projde.

### Změny
- `src/app/login/page.tsx` + `src/app/register/page.tsx` — na začátku volají `await redirectIfAuthenticated()` → přihlášený uživatel je přesměrován na `/dashboard` (a tamní middleware free-user-guard ho případně pošle do onboardingu). Stránky tím přešly na dynamické (čtou cookies).

### Poznámky / rozhodnutí
- `/error` ZÁMĚRNĚ bez guardu: middleware tam posílá přihlášeného uživatele právě při selhání ověření jeho stavu (`getAppUserGuardState` = null). Redirect `/error` → `/dashboard` by v tom případě vytvořil nekonečnou smyčku (`/dashboard` → guard znovu selže → `/error` → …). Ponecháno přístupné.
- Řešeno na úrovni stránek (ne middleware matcheru) — přidání login/register do matcheru by kolidovalo s větví „bez usera → redirect /login" (smyčka pro nepřihlášené).
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Pod Node 20.

## 2026-06-08 — onboarding krok 2 / preview slugu (dashed box)

### Změny
- `src/app/onboarding/2/SlugForm.tsx` — preview URL přestylován dle reference: dashed box (border-dashed input-border, jemné lavender pozadí) s `IconWorld`, „horea.cz/" tlumeně + slug **violet bold** (`previewSlug = checkResult.slug || 'vas-nazev'`), vpravo label „PREVIEW". Dřív prostý řádek textu `checkResult.previewUrl`.

### Poznámky
- `previewUrl` ve `state`/`actions` ponecháno (stále se počítá), jen se v UI nepoužívá — odstranění by byl širší churn napříč state/actions bez přínosu.
- `pnpm lint` čistý, `pnpm build` OK (`/onboarding/2`). Pod Node 20.

## 2026-06-08 — onboarding / rozložení tlačítek (Zpět vlevo + šipka, Pokračovat vpravo)

### Změny
- `src/app/onboarding/StepBackLink.tsx` — přestylováno z bordered tlačítka na plain odkaz s `IconArrowLeft` (slate text, hover action-violet). Platí pro kroky 2–6.
- Kroky 2–6 (`SlugForm`, `ProfileForm`, `ServicesForm`, `HoursForm`, `CommitForm`) — tlačítkový řádek změněn na `flex flex-col-reverse … sm:flex-row sm:justify-between`, DOM pořadí [StepBackLink, Button]: na desktopu Zpět vlevo / Pokračovat vpravo; na mobilu primární tlačítko nahoře (flex-col-reverse), Zpět pod ním.
- Krok 1 (`TypeForm`) — Pokračovat zarovnán vpravo (`flex sm:justify-end`). Bez „Zpět" (první krok nemá předchozí).

### Poznámky
- Krok 1 záměrně bez „Zpět" — reference ho sice zobrazuje, ale první krok nemá kam vést. Lze doplnit „Zpět" mířící mimo onboarding (např. `/` nebo odhlášení), pokud bude vyžadováno.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK (všech 6 kroků). Pod Node 20.

## 2026-06-08 — onboarding / full-screen gradient + náš auth header/footer

### Nové funkce
- `src/components/auth/AuthHeader.tsx` — sdílená auth hlavička (logo → `/`, support `IconHeadset` → `/kontakt`), transparentní. Vyčleněna z `AuthShell` pro znovupoužití.

### Změny
- `src/components/auth/AuthShell.tsx` — používá nově `AuthHeader` (inline header markup nahrazen komponentou, beze změny vzhledu).
- `src/components/landing/PublicFooter.tsx` — přidán volitelný prop `transparent` (default false). Při `true` je patička bez cloud-mist pozadí (prosvítá pod ní gradient). Marketing patička beze změny.
- `src/app/onboarding/layout.tsx` — přepsáno: full-screen **fixed gradient** pozadí (`-z-10`, action-violet tint → cloud-mist → sunset-pink tint), nad ním `AuthHeader` (transparentní) + obsah (`max-w-[760px]`, `OnboardingProgress` + krok) + `PublicFooter transparent`. Gradient platí pro všechny kroky (je ve sdíleném layoutu) a header ani patička ho nezakrývají.
- `src/app/onboarding/OnboardingProgress.tsx` — odstraněno duplicitní logo (brand teď nese `AuthHeader`); ponechán nadpis „Onboarding" + „Krok X/6" + progress bary.

### Poznámky
- Výběr typu podniku (`TypeForm`) i ostatní kroky obsahově beze změny (dle požadavku).
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped (žádná regrese), `pnpm build` OK (všech 6 kroků). Pod Node 20.

## 2026-06-08 — auth / Login: „Zůstat přihlášen" zprovozněno (session vs persistentní cookies)

### Nové funkce
- `src/lib/supabase/remember-me.ts` — sdílený helper: cookie `horea-remember` ('1' persistentní / '0' session), `isRememberEnabled` (default true při chybějící cookie) a `applyRememberMeToCookieOptions` (při OFF odstraní `maxAge`/`expires` → session cookie).

### Změny
- `src/app/login/actions.ts` — `loginAction` čte `rememberMe` z formuláře a PŘED `signInWithPassword` nastaví cookie `horea-remember` (httpOnly, secure v prod, sameSite lax). Při ON persistentní (maxAge ~400 dní), při OFF session cookie.
- `src/lib/supabase/server.ts` + `src/lib/supabase/middleware.ts` — `setAll` čte `horea-remember` a přes `applyRememberMeToCookieOptions` upraví persistenci Supabase auth cookies. Middleware to aplikuje i při refreshi session, takže OFF zůstává session-only napříč requesty.

### Poznámky / rozhodnutí
- Dřív byl checkbox „Zůstat přihlášen" jen placeholder (`loginAction` ho nečetl). Teď reálně rozlišuje: OFF = odhlášení po zavření prohlížeče, ON = trvalé přihlášení (Supabase default).
- Default (cookie chybí) = persistentní → zachováno dosavadní chování pro existující relace.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped (žádná regrese), `pnpm build` OK. Pod Node 20.

## 2026-06-08 — auth / registrace: createUser místo signUp (vypnutí Supabase vestavěného e-mailu)

### Bug & fix
- **Symptom:** Po registraci dorazil potvrzovací e-mail od **Supabase Auth**, ne náš z Resendu — uživatel tak nedostal náš token/odkaz pro stránku „Aktivovaný účet".
- **Root cause:** `registerAction` volal `supabase.auth.signUp()`, který při zapnutém „Confirm email" a vypnutém custom SMTP spustí **vestavěné** odesílání Supabase. Náš Resend e-mail (`generateLink` + `sendVerificationEmail`) se posílal navíc, ale byl v test módu (`onboarding@resend.dev`), takže na cizí adresu nedorazil.
- **Fix:** `src/app/register/actions.ts` — `signUp` nahrazeno `adminClient.auth.admin.createUser({ email, password, email_confirm: false })`. Admin createUser **neposílá** žádný e-mail → odpadá duplicita i závislost na dashboard SMTP. Potvrzovací odkaz nadále posílá jen `sendVerificationEmail` (Resend). Odebrán nepoužitý import `createClient` a signUp-specifická detekce duplicit přes prázdné `identities` (duplicitu teď hlásí `createError`, status 422 → `isDuplicateEmailError`). Předběžná kontrola existence v `public.users` zachována.
- `RESEND_FROM_EMAIL` v `.env.local` opraven z dev fallbacku na `Horea <noreply@horea.cz>` (ověřená doména).

### Změny v testech
- `src/app/register/__tests__/actions.test.ts` — mock `signUp` nahrazen `auth.admin.createUser` na admin klientu; user fixture bez `identities`.

### Ověřeno
- `pnpm test:run` 421 passed / 49 skipped (žádná regrese), `pnpm lint` čistý, `pnpm build` OK (`/register` static). Pod Node 20.
- Pozn.: Supabase „Confirm email" zůstává ZAPNUTO (uživatel je `email_confirm: false` = nepotvrzený, potvrdí přes náš magiclink). Custom SMTP v Supabase může zůstat vypnutý — Supabase už žádný auth e-mail neposílá.

## 2026-06-08 — auth / Registrace: chyba souhlasů jen zčervenáním řádku

### Změny
- `src/app/register/RegisterForm.tsx` — u checkboxů ToS a DPA odstraněn per-field podtext (`FieldError` „Potvrďte prosím souhlas…"). Při chybě (nezaškrtnuto) se nově jen zčervená text řádku (`--color-neon-pink`); po zaškrtnutí se text čistě CSS vrátí na slate (`has-[:checked]:text-[var(--color-slate-text)]`) — sladěno s pink pozadím checkboxu, které také mizí po zaškrtnutí. Souhrnná chybová hláška zůstává v `Notice` nahoře ve formuláři. `FieldError` dál používán u email/heslo.

### Poznámky
- Server validace (`registerAction`) i `state.fieldErrors` beze změny — jen prezentace. Odkazy v řádku (VOP/DPA) zůstávají action-violet i v chybovém stavu.
- `pnpm lint` čistý, `pnpm build` OK (`/register` static). Pod Node 20.

## 2026-06-08 — auth / Aktivovaný účet (verify-email success) dle reference

### Změny
- `src/app/verify-email/VerifyEmailLinkScreen.tsx` — přepsáno na `AuthShell` + centrovanou kartu (`max-w-md lg:max-w-xl`, shodně s verify-email default stavem). Tři stavy:
  - **success** („Aktivovaný účet" dle `.kiro/docs/Auth/aktivovany-ucet/code.html`): lush-green kruhová bublina s violet `IconCircleCheck` + dekorativní tečky (aqua-blue, sunset-pink), nadpis „Váš účet byl úspěšně potvrzen!", popis, primární tlačítko „Přejít k přihlášení" → `/login`.
  - **expired**: action-violet bublina (`IconMailExclamation`), „Odkaz vypršel" + `ResendVerificationForm`.
  - **pending**: „Potvrzujeme účet" (ověřování odkazu).
- Odstraněn starý layout (`Logo` + `Card`, max-w-[520px]).

### Poznámky / rozhodnutí
- **Změna chování:** success stav už nepoužívá `OnboardingCountdown` (auto-redirect do onboardingu po 8 s) — dle reference je teď manuální tlačítko „Přejít k přihlášení" → `/login`. `verifyOtp`/`exchangeCodeForSession` uživatele sice přihlásí (session), ale `/login` není v middleware matcheru → žádná smyčka. `OnboardingCountdown.tsx` je nyní nepoužitý (ponechán pro případný revert).
- `verify-email/actions.ts` beze změny (stále počítá `onboardingPath`, jen se v UI nevyužívá).
- `pnpm lint` čistý, `pnpm build` OK (`/verify-email` dynamická). Pod Node 20.

## 2026-06-08 — auth / sjednocení šířky formulářů pod lg (max-w-md)

### Změny
- `src/app/verify-email/page.tsx` — kontejner centrální karty `max-w-xl` → `max-w-md lg:max-w-xl`.
- `src/app/forgot-password/page.tsx` — kontejner `max-w-[480px]` → `max-w-md lg:max-w-[480px]`.

### Poznámky
- Cíl: pod `lg` (<1024px) mají všechny auth formuláře (Login, Registrace, Verify-email, Zapomenuté heslo) shodnou šířku `max-w-md` (448px) jako Login/Registrace. Nad `lg` si verify/forgot drží původní (širší) šířku.
- `pnpm build` OK. Pod Node 20.

## 2026-06-08 — auth / Zapomenuté heslo: centrovaný layout dle reference

### Změny
- `src/app/forgot-password/page.tsx` — přepsáno na `AuthShell` + centrovanou kartu (`max-w-[480px]`) dle `.kiro/docs/Auth/zapomenute-heslo/code.html`: ikonová bublina (`IconLock`, action-violet — sjednoceno s verify-email stylem), nadpis „Zapomenuté heslo" (display 38px), popis (max-w-320), `ForgotPasswordForm`, odkaz „Zpět na přihlášení" s `IconArrowLeft`, a pod kartou bezpečnostní badge „Zabezpečené šifrování dat 256-bit" (`IconShieldCheck`, cloud-mist pill). Odstraněn starý `Logo`/`Card` markup (hlavičku dává AuthShell).
- `src/app/forgot-password/ForgotPasswordForm.tsx` — formulář `w-full text-left` (roztažení v centrované kartě), tlačítko „Poslat odkaz" → „Odeslat odkaz" (dle reference). Logika beze změny.

### Poznámky / rozhodnutí
- Referenční bublina byla světle levandulová (token `primary-fixed` #e5deff) — místo ní zachována action-violet bublina kvůli konzistenci s verify-email (auth pages standard). Lze přepnout, pokud bude vyžadováno.
- E-mailové pole ponecháno na sdílené `Input` komponentě (bez leading mail ikony z reference) kvůli konzistenci s ostatními auth formuláři.
- `pnpm lint` čistý, `pnpm build` OK (`/forgot-password` prerendered static). Pod Node 20.

## 2026-06-08 — auth / Registrace: live password checker (odlišení od Login)

### Nové funkce
- `src/app/register/RegisterForm.tsx` — pod polem Heslo přibyl živý checker tří pravidel (řízený `value`/`onChange` stav `password`): „Alespoň 8 znaků", „Alespoň jedno velké písmeno", „Alespoň jedna číslice". Stavy: výchozí (prázdné pole) šedý + `IconCircle`; nesplněno červené (`--color-neon-pink`) + `IconCircleX`; splněno zelené + `IconCircleCheck`. Login formulář beze změny (odlišení registrace vs přihlášení).

### Změny
- `src/lib/auth/password.ts` — vytaženy jednotlivé predikáty `passwordChecks` (`minLength`/`hasUppercase`/`hasDigit`) + `PASSWORD_MIN_LENGTH`; `validatePassword` je teď používá (stejné chování i pořadí důvodů). Jeden zdroj pravdy sdílený serverovou validací i UI checkerem.

### Poznámky / rozhodnutí
- Zelená pro „splněno": `--color-electric-green` (#a2ea13) je na bílém pozadí jako text nečitelná (analogie pravidla pink→neon-pink). Použito tmavší token-derived `color-mix(in srgb, electric-green 60%, slate-text)` pro text i ikonu.
- Validace na serveru (`validatePassword`) zůstává zdrojem pravdy; checker je jen UX nápověda.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped (validation.test beze změny prošel), `pnpm build` OK (`/register` 3.02 kB). Pod Node 20.

## 2026-06-08 — auth / Login: layout sjednocen s Registrací (AuthShell + 2 sloupce)

### Změny
- `src/app/login/page.tsx` — přepsáno na `AuthShell` + dvousloupcový layout shodný s registrací: vlevo brandový panel s placeholder fotkou + gradient (badge „VÍTEJTE ZPĚT", headline, podtext o přihlášení), vpravo formulářová karta (nadpis „Přihlášení", podtitulek, flash notice `password_updated`, `LoginForm`, odkazy „Registrovat se" + „Zapomenuté heslo"). Obsah formuláře (`LoginForm`) i flash logika beze změny.
- Odstraněn samostatný `Logo`/`Card` markup (hlavičku s logem dává AuthShell, karta je teď stejný div jako u registrace).

### Poznámky
- Stejný responzivní vzorec jako registrace: levý panel `hidden lg:block`, formulář `max-w-md` mobil → `lg:max-w-none` plná šířka sloupce.
- `pnpm lint` čistý, `pnpm build` OK (`/login` dynamická route kvůli searchParams). Pod Node 20.

## 2026-06-08 — ui / Checkbox: barva zaškrtnutého stavu na slate-text

### Změny
- `src/components/ui/checkbox.tsx` — checkbox sjednocen na `--color-slate-text`: rámeček v základním (nezaškrtnutém) stavu `--color-cloud-mist` → `--color-slate-text`, zaškrtnutý stav (border + výplň) a focus outline z `--color-action-violet` → `--color-slate-text`. Výchozí nezaškrtnuté pozadí bílé; ve **varovném stavu** (invalid + nezaškrtnuto, např. nezaškrtnutý souhlas po submitu) pozadí `#ffaae642` (sunset-pink ~26 % alpha) přes peer variantu vázanou na `aria-invalid=true` a `:not(:checked)` — jakmile uživatel zaškrtne, pink čistě CSS zmizí. Bílá „fajfka" a disabled beze změny. Platí globálně pro všechny checkboxy (jediná implementace v appce).

### Poznámky
- `type="radio"` výběr tarifu v `SubscriptionManager.tsx` (`accent-[var(--color-action-violet)]`) je radio, ne checkbox → ponecháno.
- `pnpm build` OK, `pnpm test:run` 421 passed / 49 skipped (žádná regrese). Pod Node 20.

## 2026-06-08 — auth / AuthShell: sjednocení šířky header / main / footer

### Změny
- `src/components/auth/AuthShell.tsx` — header i obalový wrapper main contentu sjednoceny na šířku footeru: `max-w-[1200px]` + horizontální padding `px-[16px] md:px-10` (dřív header `max-w-7xl` = 1280px, main bez max-width). Vertikální centrování obsahu zachováno.
- `src/app/register/page.tsx` — obsahový grid registrace už neomezuje `max-w-5xl`/`mx-auto`, vyplní celou šířku 1200px wrapperu z AuthShellu (zarovnání levé/pravé hrany s headerem i footerem). Pravý formulářový sloupec navíc roztažen na plnou šířku sloupce (`max-w-md`/`mx-auto` → `w-full`), aby nevznikalo prázdné místo napravo.

### Poznámky
- `verify-email` (sdílí AuthShell) má vlastní `mx-auto max-w-xl` centrovanou kartu — uvnitř 1200px wrapperu se dál centruje, beze změny vzhledu.
- `pnpm lint` čistý, `pnpm build` OK (`/register` static, `/verify-email` dynamická). Pod Node 20.

## 2026-06-08 — auth / Registrace: placeholder foto v levém panelu

### Změny
- `src/app/register/page.tsx` — levý brandový panel dostal fotku na pozadí (Pexels placeholder, `object-cover`, `loading="lazy"`) + tmavý gradient zdola pro čitelnost; overlay text (badge „NOVINKA", headline, podtext) přebarven na bílou. Použito prosté `<img>` (placeholder doména `images.pexels.com` není v `next/image` remotePatterns → vědomě bez optimalizace, s `eslint-disable` pro `no-img-element`).

### Poznámky
- Pro produkční obrázek (vlastní asset) zvážit přesun do `next/image` + doplnit remotePattern / lokální import.
- `pnpm lint` čistý, `pnpm build` OK (`/register` 2.15 kB prerendered static). Pod Node 20.

## 2026-06-08 — marketing / VOP: sjednocení identity provozovatele na OSVČ

### Změny
- `src/app/(marketing)/vseobecne-podminky/page.tsx` — v identifikačním bloku Poskytovatele opraveno „zapsaná v obchodním rejstříku vedeném Městským soudem v Praze" (s.r.o. formulace) → „zapsaný v živnostenském rejstříku vedeném Úřadem městské části Praha 11" (OSVČ). Sjednoceno se stránkou Kontakt a se zněním DPA 7.1 („konkrétní fyzická osoba podnikající"). Provozovatel = Petr Mai, podnikající pod obchodní značkou Horea, IČO 17384605.

### Poznámky
- Jméno provozovatele je napříč stránkami konzistentní (Kontakt i VOP = „Petr Mai").
- `GOPAY s.r.o.` ponecháno (skutečný název třetí strany — platební brána, ne náš subjekt).
- Zbylé „s.r.o."/„obchodní rejstřík" výskyty jsou jen ve zdrojových `.kiro/docs/` markdownech (reference, nerenderuje se); v renderovaném `src/app` už žádná naše s.r.o. formulace není.
- `pnpm lint` čistý, `pnpm build` OK (`/vseobecne-podminky` prerendered static). Pod Node 20.

## 2026-06-08 — marketing / VOP sekce 7 (DPA): finální znění čl. 28 GDPR

### Změny
- `src/app/(marketing)/vseobecne-podminky/page.tsx` — sekce 7 (DPA) nahrazena finálním zněním dodaným uživatelem. Rozšířeno ze 5 na 6 podsekcí: 7.1 Postavení smluvních stran, 7.2 Předmět/rozsah/účel/doba zpracování (vč. kategorií údajů a vyloučení čl. 9 citlivých údajů), 7.3 Povinnosti Poskytovatele jako Zpracovatele (čl. 28 odst. 3 — pokyny, mlčenlivost, čl. 32 zabezpečení, součinnost při právech subjektů i čl. 32–36, hlášení incidentů, trvalý výmaz), 7.4 Subdodavatelé (všeobecné povolení + 10denní notifikace + právo námitky), 7.5 Audity a inspekce (30denní oznámení, náklady nese Partner), 7.6 Prohlášení o nakládání s daty + provozní telemetrie (agregované/anonymizované metriky: MRR, rezervace, booking sources, support …).

### Poznámky
- Křížový odkaz ověřen: 7.2 odkazuje na čl. 4.2 (Ochranná lhůta 90 dní) — v dokumentu 4.2 = lhůta, 4.3 = trvalý výmaz, takže odkaz sedí.
- České uvozovky psány jako curly „…“ (ESLint `react/no-unescaped-entities`); en-dash „–“ zachován.
- `pnpm lint` čistý, `pnpm build` OK (`/vseobecne-podminky` prerendered static, 34/34). Pod Node 20.

## 2026-06-08 — auth / DPA souhlas: odkaz na VOP §7 místo inline placeholder textu

### Změny
- `src/app/register/RegisterForm.tsx` — odstraněn dlouhý scrollovací `DPA_TEXT` box pod formulářem i prop `dpaText`. Dvě checkboxy zachovány (ToS + DPA), nově každý odkazuje na reálné znění: ToS → `/vseobecne-podminky`, DPA → `/vseobecne-podminky#sekce-7` (oba `target="_blank"`). Mašinérie souhlasu (`dpaAccepted`/`tosAccepted` validace, `recordAcceptance`) beze změny.
- `src/app/register/page.tsx` — odstraněn import `DPA_TEXT` a předávání propu.
- `src/components/DpaModal.tsx` (re-acceptance dialog) — placeholder text nahrazen krátkou zprávou + odkazem na `/vseobecne-podminky#sekce-7`. Verzování / blokující flow / accept+logout beze změny.
- `src/lib/dpa/text.ts` — **smazáno** (MVP placeholder `DPA_TEXT`, po výše uvedených změnách bez importérů; reálné DPA žije jako sekce 7 VOP).

### Poznámky / rozhodnutí
- Důvod: DPA i Zásady ochrany os. údajů jsou hotové jako samostatné stránky; inline placeholder DPA text v registraci byl duplicitní a neudržovaný (rozdílné znění vs VOP §7). Jeden zdroj pravdy = VOP §7.
- ZACHOVÁNA celá spec'd mechanika verzovaného souhlasu (audit `dpa_version_accepted`/`dpa_accepted_at`, re-acceptance modal, `CURRENT_DPA_VERSION`) — rušila se jen prezentace textu, ne logika. Backend (`registerAction`, `manager.recordAcceptance`) beze změny → existující testy (`register/__tests__/actions.test.ts` posílá `dpaAccepted='on'`) prochází.
- `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped (žádná regrese), `pnpm build` OK (`/register` 2.15 kB prerendered static). Pod Node 20.

## 2026-06-07 — auth / sdílený AuthShell + obrazovka „Registrace" (/register)

### Nové funkce
- `src/components/auth/AuthShell.tsx` — sdílený shell pro VŠECHNY auth stránky (standard dle pokynu uživatele): jednotná hlavička (logo → `/` vlevo, support `IconHeadset` → `/kontakt` vpravo v kruhovém tlačítku), dekorativní blurred blobs na pozadí (sunset-pink nahoře vlevo `h-64 w-64` opacity 30, lush-green dole vpravo `h-72 w-[77svw] right-0` opacity 25, oba `blur-3xl`) a naše `PublicFooter`. Obsah (`children`) si řídí vlastní šířku. Server component.
- `src/app/register/page.tsx` — stránka „Registrace" přepsána na `AuthShell` + dvousloupcový layout (`max-w-5xl`, na desktopu 2 sloupce): vlevo brandový air-blue panel (badge „NOVINKA", headline „Tvořte s lehkostí.", podtext) — bez externího obrázku z předlohy; vpravo formulářová karta (nadpis „Vytvořit účet", `RegisterForm`, odkaz „Už máte účet? Přihlaste se" → `/login`).

### Změny
- `src/app/verify-email/page.tsx` — refaktorováno na použití `AuthShell` (hlavička/blobs/footer vytaženy z této stránky do sdíleného shellu; vizuál beze změny).

### Poznámky / rozhodnutí
- `RegisterForm.tsx` ponechán funkčně beze změny (reálná pole Email, Heslo, ToS + DPA checkbox + DPA text box). Pole „Jméno" a „Heslo znovu" z předlohy NEpřidána — backend (`registerAction`) je nepodporuje; přidání by byla nevyžádaná funkční změna.
- Předlohové placeholder logo/header/footer i externí googleusercontent obrázek z reference záměrně ignorovány — použity naše komponenty (per standard auth stránek).
- `pnpm lint` čistý, `pnpm build` OK (`/register` 2.15 kB prerendered static, `/verify-email` dynamická route), `pnpm test:run` 421 passed / 49 skipped (žádná regrese). Pod Node 20.

## 2026-06-07 — auth / redesign obrazovky „Neaktivovaný účet" (/verify-email default)

### Změny
- `src/app/verify-email/page.tsx` — výchozí stav (účet po registraci nepotvrzen) přepsán na nový design dle `.kiro/docs/Auth/neaktivovany-ucet`: centrální karta s ikonou (`IconMailExclamation`), nadpis „Váš účet zatím nebyl potvrzen.", popis, resend formulář; pod ní 2 pomocné karty (Potřebujete pomoct? / Kontaktujte podporu → `/kontakt`); jemné dekorativní pozadí (blur blobs). Placeholder header/logo i footer z předlohy ignorovány — použita **naše `PublicFooter`**. Ostatní stavy (`code`/`token_hash`/`error` → `VerifyEmailLinkScreen`) beze změny.
- `src/app/verify-email/ResendVerificationForm.tsx` — CTA přestylováno na plné primární tlačítko „Znovu odeslat potvrzovací e-mail" + `IconSend` (min-h 48px), success/error `Notice` pod tlačítkem. E-mailové pole zachováno (resend action ho funkčně potřebuje — předloha ho neměla).

### Poznámky
- `VerificationLayout` (jen pro tuto větev) odstraněn; nepoužité importy (Card, Logo, ReactNode) pryč.
- Reálná funkčnost zachována (`resendVerificationAction`); jen UI vrstva.
- `pnpm lint` čistý, `pnpm build` OK (`/verify-email` dynamická route), `pnpm test:run` 421 passed / 49 skipped, HTTP 200. Pod Node 20.20.2.

## 2026-06-07 — marketing / stránka Předplatné (/predplatne)

### Nové funkce
- `src/app/(marketing)/predplatne/page.tsx` — stránka „Předplatné" se stejným UI jako VOP/GDPR (sticky TOC karta + obsahová karta, `LegalToc`). 5 sekcí: jak předplatné funguje, tokenizace/bezpečnost, změna cen, neúspěšná platba, zrušení. Obsah z `.kiro/docs/landing-page/Opakované platby/opakovane-platby.md`. Prerendered static.
- Footer odkaz přejmenován „Opakované platby" → „Předplatné", href → `/predplatne`.

### Poznámky
- Zdrojový text uváděl „Platforma Horea" (tokenizace) — normalizováno na „Horea" kvůli konzistenci s OSVČ identitou (IČO 17384605) použitou na GDPR/kontakt stránkách. Nesoulad „s.r.o. vs OSVČ" ve VOP hlavičce stále k sjednocení.
- `pnpm lint` čistý, `pnpm build` OK (`/predplatne` prerendered static), HTTP 200, footer odkaz ověřen. Pod Node 20.20.2.

## 2026-06-07 — marketing / stránka Zásady ochrany osobních údajů (/ochrana-osobnich-udaju)

### Nové funkce
- `src/app/(marketing)/ochrana-osobnich-udaju/page.tsx` — GDPR stránka se stejným UI jako VOP (sticky TOC karta vlevo + obsahová karta vpravo, `LegalToc` scroll-spy). 5 sekcí: Základní informace, Rozsah a účel zpracování (role Správce/Zpracovatel + cookies), Práva subjektů údajů, Zabezpečení a příjemci, Závěrečná ustanovení. Obsah z `.kiro/docs/landing-page/zasady-ochrany-osobnich-udaju.md` (Horea, IČO 17384605, info@horea.cz, ÚOOÚ, 90denní lhůta provázaná s VOP). Prerendered static.
- Footer odkaz „Zásady ochrany osobních údajů" → `/ochrana-osobnich-udaju`.
- `src/lib/email/templates/base.ts` — GDPR odkaz v patičce e-mailů přesměrován z dosud neexistujícího `/gdpr` na `/ochrana-osobnich-udaju`.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (`/ochrana-osobnich-udaju` prerendered static), HTTP 200, footer odkaz ověřen. `base.test` (text GDPR odkazu) stále prochází. Pod Node 20.20.2.

## 2026-06-07 — email / retry outbox (delay/retry při quota/transient chybách)

### Nové funkce
- Migrace `0041_email_outbox.sql` (APLIKOVÁNO na remote) — tabulka `email_outbox` (category/provider/to/subject/html/text/status[pending|sent|dead]/attempts/max_attempts/next_attempt_at/last_error_code/ref_id), index na splatné `pending` řádky + na `created_at`, RLS deny-all (jen service_role).
- `src/lib/email/outbox.ts` — transactional outbox: `sendBestEffort` (inline odeslání → při PŘECHODNÉ chybě enqueue, při permanentní `dead`), `drainEmailOutbox` (cron worker, exponenciální backoff 2m/10m/1h/6h/24h, max 6 pokusů, retry na STEJNÉM poskytovateli), `purgeOldOutbox` (PII hygiena, maže sent/dead >7 dní). Klasifikace chyb: 429/5xx/síť = retryable, 4xx = permanent.
- `src/lib/email/errors.ts` — `describeResendError` + `isRetryableStatus` vytaženo zvlášť (prevence cyklu outbox↔dispatcher); dispatcher `describeResendError` re-exportuje (zpětná kompatibilita).
- Cron `/api/cron/email-retry` (chráněn `CRON_SECRET`, dávka 50, + purge) → přidán do `vercel.json` (`*/15 * * * *`).

### Změny (zapojení do outboxu — vše best-effort kromě auth)
- `dispatchTransactionalEmail` (notifikace rezervací) → `sendBestEffort` (category `reservation_notification`). Veřejné API i logy (logLabel=emailType) zachovány.
- `invoice-resender` → `sendBestEffort` (category `invoice`); při inline selhání vrací `send_failed`, ale e-mail je ve frontě.
- `admin-notify` + `charge` admin notifikace → `sendBestEffort` (category `admin`).

### Poznámky / rozhodnutí
- Try-inline-then-enqueue (ne enqueue-always) — nulová režie u úspěchu, fronta jen při selhání.
- Auth e-maily (verify/reset) ZÁMĚRNĚ mimo outbox (uživatel čeká teď; tam pomáhá upgrade Resendu).
- Retry na stejném poskytovateli (zachování izolace limitů); cross-provider fallback lze doplnit.
- Testy: existující 415 prošly beze změny (charge/invoice/admin testy mockují provider client, který outbox interně volá); +6 nových unit testů outboxu (klasifikace, enqueue, drain). `pnpm lint` čistý, `pnpm test:run` 421 passed / 49 skipped, `pnpm build` OK. Migrace přes dry-run + push. Pod Node 20.20.2.

## 2026-06-07 — email / split odesílatelů (Resend pro auth, SMTP2GO pro notifikace rezervací)

### Nové funkce / změny
- `src/lib/email/smtp-client.ts` — `sendViaSmtp2go` přes SMTP2GO HTTP API v3 (`fetch`, bez nové závislosti); `isSmtp2goConfigured()` dle `SMTP2GO_API_KEY`. Default odesílatel `SMTP2GO_FROM_EMAIL`.
- `src/lib/email/dispatcher.ts` — `dispatchTransactionalEmail` (jedinou cestou jdou notifikace rezervací) přepnut: pokud je SMTP2GO nakonfigurováno → posílá přes SMTP2GO, jinak fallback na Resend. Best-effort kontrakt zachován (nikdy nevyhazuje, loguje provider + error kód bez PII).
- Resend zůstává pro auth (verify/reset), faktury, kontaktní formulář, admin/cron notifikace.
- `.env.example` — přidáno `SMTP2GO_API_KEY`, `SMTP2GO_FROM_EMAIL`. `docs/auth-email-delivery.md` — nová sekce o rozdělení odesílatelů.

### Poznámky
- Účel: izolace denního limitu Resendu (free 100/den) — bulk notifikace rezervací ho nesdílí s kritickým loginem/registrací.
- Testy nerozbity: všechny mockují celý `dispatchTransactionalEmail` / `EmailNotifier`, takže změna vnitřku dispatcheru je transparentní. Manuálně nutno: ověřit doménu v SMTP2GO (SPF/DKIM) + nastavit env.
- `pnpm lint` čistý, `pnpm test:run` 415 passed / 49 skipped (žádná regrese), `pnpm build` OK. Pod Node 20.20.2.

## 2026-06-07 — kontakt / formulář napojen na reálné odesílání (Resend)

### Nové funkce
- `src/app/api/contact/route.ts` — POST endpoint pro kontaktní formulář. Server-side validace (povinná pole, e-mail regex, délkové limity name≤120/email≤200/subject≤200/message≤5000), odeslání přes `sendEmail` (Resend) na `CONTACT_INBOX_EMAIL` (default `podpora@horea.cz`) s `replyTo` = e-mail odesílatele. Chyby vrací české hlášky (`getResendErrorMessage`); PII se NEloguje (jen `describeResendError` kód).
- `src/lib/email/templates/contact-message.ts` — šablona „Kontaktní formulář: …" přes `wrapEmail`, vlastní `escapeHtml` pro všechna uživatelská pole, HTML + text varianta.
- `CONTACT_INBOX_EMAIL` přidán do `.env.example`.

### Změny
- `src/components/landing/ContactForm.tsx` — místo `mailto` teď `fetch('POST /api/contact')` se stavem idle/sending/success/error, disable polí při odesílání, success/error `Notice`, vyčištění polí po úspěchu, `maxLength` na polích.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (`/api/contact` dynamická route, `/kontakt` prerendered), `pnpm test:run` 415 passed / 49 skipped (žádná regrese). Endpoint ověřen: prázdný vstup → 400, neplatný e-mail → 400 (české hlášky). Odesílací větev nespouštěna (neposílat reálný e-mail). Pozn.: Resend v test režimu doručí jen na e-mail vlastníka účtu, dokud není ověřená doména + `RESEND_FROM_EMAIL`. Pod Node 20.20.2.

## 2026-06-07 — marketing / stránka Kontaktní údaje (/kontakt)

### Nové funkce
- `src/app/(marketing)/kontakt/page.tsx` — stránka „Jak vám můžeme pomoci?" dle reference `.kiro/docs/landing-page/Kontaktní údaje`. Hero + bento grid (lg:12 cols): vlevo (5) kontaktní karta (e-mail/telefon/adresa s Tabler ikonami v kruzích) + formulář; vpravo (7) FAQ karta. Prerendered static. Footer odkaz „Kontaktní údaje" → `/kontakt`.
- `src/components/landing/ContactForm.tsx` (`'use client'`) — kontaktní formulář (jméno/e-mail/předmět/zpráva). Bez backendu: po odeslání sestaví `mailto:info@horea.cz` s předvyplněným předmětem a tělem a otevře e-mailového klienta.
- `FaqAccordion` zobecněn na `items?: FaqItem[]` (default = homepage položky), znovupoužit na /kontakt s podpůrnými FAQ. Homepage beze změny.

### Poznámky / rozhodnutí
- **Konflikt s VOP vyřešen:** referenční FAQ slibovalo „14denní garanci vrácení peněz", což odporuje no-refund politice VOP (čl. 3.5). FAQ „Nabízíte vrácení peněz?" přeformulováno na soulad: za zaplacené období refundace ne, lze zrušit do dalšího měsíce, slouží zkušební období.
- Kontakt: info@horea.cz, +420 704 344 177 (Po–Pá 9–17), adresa „Tatarkova 24, 149 00 Praha" (z reference) — **pozor, nekonzistence placeholderů**: footer uvádí Náměstí Svobody 123 Brno, VOP Tatarkovu 24 Praha. Sjednotit reálnými údaji.
- Formulář zatím přes mailto; reálné odesílání přes API route + Resend lze doplnit.
- `pnpm lint` čistý, `pnpm build` OK (`/kontakt` prerendered static), HTTP 200, footer odkaz ověřen. Pod Node 20.20.2.

## 2026-06-07 — marketing / VOP: nový slug /vseobecne-podminky + TOC layout

### Změny
- Slug zkrácen `/vseobecne-obchodni-podminky` → `/vseobecne-podminky` (stránka přesunuta, stará složka smazána, footer href aktualizován).
- Nový dvousloupcový layout dle screenshotu: sticky postranní „Obsah" (TOC) vlevo + obsah v bílé kartě (`rounded-cards`, border cloud-mist) vpravo na cloud-mist pozadí. Provozovatel blok ve `soft-gray-fill` boxu. H1 v Action Violet.
- `src/components/landing/LegalToc.tsx` (`'use client'`) — číslovaný TOC se scroll-spy přes IntersectionObserver (`rootMargin -120px/-70%`), aktivní položka zvýrazněna (violet text + levý violet border). Sekce mají `id="sekce-1..8"` + `scroll-mt-28` pro kotvy pod sticky headerem.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (`/vseobecne-podminky` prerendered static), HTTP 200, TOC + footer odkaz ověřeny. Pod Node 20.20.2.

## 2026-06-07 — marketing / Všeobecné obchodní podmínky (přejmenování + finální obsah B2B)

### Změny
- Stránka `/obchodni-podminky` přejmenována a přesunuta na `/vseobecne-obchodni-podminky` (`src/app/(marketing)/vseobecne-obchodni-podminky/page.tsx`); stará složka smazána. Odkaz v patičce: label „Všeobecné podmínky" → `/vseobecne-obchodni-podminky`.
- Obsah nahrazen finální B2B verzí dodanou uživatelem: provozovatel Horea (Tatarkova 24, Praha Háje, IČO 99999999, Městský soud v Praze, info@horea.cz), 8 sekcí vč. B2B doložky (vyloučení ochrany spotřebitele), GoPay/QR platby, no-refund politika, ochranná lhůta 90 dní + trvalý výmaz dat, omezení odpovědnosti / ušlý zisk, duševní vlastnictví, DPA (sekce 7 — role správce/zpracovatel, telemetrie/MRR statistiky), závěrečná ustanovení (právo ČR, jurisdikce u soudu poskytovatele). Účinnost 9. 6. 2026.

### Poznámky
- České uvozovky psány rovnou jako curly „…" kvůli ESLint `react/no-unescaped-entities`; `&` v textu jako `&amp;`.
- Prerender chyba „Cannot read properties of undefined (reading 'call')" na `/` po přesunu = stale `.next` cache; vyřešeno `rm -rf .next` + rebuild.
- `pnpm lint` čistý, `pnpm build` OK (`/vseobecne-obchodni-podminky` prerendered static), HTTP 200, footer odkaz ověřen. Pod Node 20.20.2.

## 2026-06-07 — marketing / stránka Obchodní podmínky

### Nové funkce
- `src/app/(marketing)/obchodni-podminky/page.tsx` — veřejná stránka Obchodní podmínky (route `/obchodni-podminky`, server component, prerendered static). 14 sekcí na míru Horey: úvod, pojmy, registrace/účet, předplatné a tarify (199/299/599), platby (GoPay, opakované, faktury), práva/povinnosti, rezervace koncových zákazníků, dostupnost, GDPR, ukončení, odpovědnost, změny podmínek, závěrečná ustanovení (právo ČR, ČOI). Layout `max-w-3xl`, nadpisy PolySans/rich-violet, dědí header+patičku z `(marketing)` layoutu.
- Patička (`PublicFooter`) — „Obchodní podmínky" nově odkazuje na `/obchodni-podminky` (nav refaktorován na {label, href}).

### Poznámky
- **Právní upozornění:** dokument je odborně sestavená ŠABLONA, ne právní poradenství. Obsahuje placeholdery `[DOPLNIT]` pro identifikaci provozovatele (firma, sídlo, IČO, DIČ, rejstřík) — nutno doplnit + nechat zkontrolovat právníkem před zveřejněním.
- České uvozovky v JSX textu: ASCII closing `"` shazoval ESLint `react/no-unescaped-entities`; vyřešeno převodem `„…"` → `„…"` (curly U+201C) regexem nad celým souborem.
- `pnpm lint` čistý, `pnpm build` OK (`/obchodni-podminky` prerendered static), HTTP 200, header+patička+obsah ověřeny. Pod Node 20.20.2.

## 2026-06-07 — landing / FeatureTabs aktivní stav (barevné pozadí dle ikony)

### Změny (`src/components/landing/FeatureTabs.tsx`)
- Aktivní tab má teď **pozadí = barva své ikonky** (dřív bílé + stín). Ikona i text aktivního tabu **bílé**; výjimka kvůli čitelnosti: u světlých pozadí `--color-aqua-blue` a `--color-electric-green` je popředí `--color-rich-violet`.
- Mapování: globe/bar-chart → action-violet (bílé fg), calendar → neon-pink (bílé fg), users → aqua-blue (rich-violet fg), badge → electric-green (rich-violet fg).
- Každý tab má v datech literální třídy `activeBgClass` + `activeFgClass` (kvůli Tailwind JIT — dynamicky skládané `bg-[var(...)]` by se nevygenerovaly). Neaktivní tab beze změny (průhledný, hover cloud-mist, ikona v accent barvě, text rich-violet).

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (29/29); v CSS potvrzena pozadí action-violet/neon-pink/aqua-blue/electric-green. Pod Node 20.20.2.

## 2026-06-07 — landing / růžová na bílém → neon-pink (čitelnost)

### Změny
- Pravidlo: růžová jako **popředí** (text/ikona/rámeček) na bílém/skoro-bílém → `var(--color-neon-pink)` (#f843c2), ne světlý `--color-sunset-pink` (#ffaae6, na bílém nečitelný). Dekorativní výplně/pozadí (FAQ fill, gradienty, tinted kruhy/panely) zůstávají sunset-pink.
- `src/app/(marketing)/page.tsx` — karta ceníku **Max**: label, check ikony, tlačítko (rámeček+text) a hover rámeček ze sunset-pink → neon-pink; hover fill tlačítka neon-pink s bílým textem. Ikony oborů **Nehtová studia** a **Beauty** → neon-pink (kruh zůstává sunset tint).
- `src/components/landing/FeatureTabs.tsx` — tab i panel ikona **„Správa rezervací"** → neon-pink (panel tint pozadí beze změny).
- Pravidlo zapsáno do steering: `.kiro/steering/design-system.md` (Do's/Don'ts) + mirror `RULES/design-system.md`.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (29/29). Pod Node 20.20.2.

## 2026-06-07 — global / výchozí body text (18px / 500 / #353241)

### Změny
- `src/app/globals.css` — `body` dostal globální výchozí styl běžného textu: `font-size: 18px`, `font-weight: 500`, `color: var(--color-slate-text)` (#353241, barva už tam byla). Aplikuje se na celou app.
- **Výjimka:** tlumené dekorativní doplňkové texty s barvou `color-mix(in srgb, var(--color-slate-text) 70%, white)` si drží vlastní barvu/velikost/váhu (mají vlastní Tailwind utility, které přebijí výchozí). Headingy/badge/tlačítka/captiony mají taky vlastní explicitní utility.
- Pravidlo zapsáno do steering: `.kiro/steering/design-system.md` (nová sekce „Výchozí body text") + krátký mirror v `RULES/design-system.md`, aby se chyba neopakovala.

### Poznámky
- Globální dopad (celá app). Generované CSS ověřeno: `body{…font-size:18px;font-weight:500}`. Texty bez explicitní utility teď dědí 18px/500; muted texty zůstávají vizuálně beze změny barvy a velikosti (váha 500 se na ně může propsat jen pokud nemají vlastní `font-*`, ale jejich barva/velikost zůstává).
- `pnpm lint` čistý, `pnpm build` OK (29/29), `pnpm test:run` 415 passed / 49 skipped (žádná regrese; jsdom CSS neaplikuje, snapshoty markup-based). Pod Node 20.20.2.

## 2026-06-07 — landing / FAQ accordion (sjednocení stavů + animace)

### Změny (`src/components/landing/FaqAccordion.tsx`)
- **Hover i otevřený (active) stav** tlačítka FAQ položky → `bg-[var(--color-sunset-pink)]` (dřív hover = cloud-mist, otevřený bez pozadí → nekonzistentní zpětná vazba, kvůli které „první tab vypadal jinak").
- **Sjednocené stavy** všech položek: zavřená → hover sunset-pink; otevřená → trvale sunset-pink na hlavičce. Ikona plus/minus přebarvena na `--color-rich-violet` (z muted slate) pro konzistenci.
- **Animace rozbalení/sbalení** přes grid-rows trik: panel je vždy v DOM, wrapper `grid` přepíná `grid-rows-[0fr]` ↔ `grid-rows-[1fr]` s `transition-all duration-300 ease-out`; vnitřní `overflow-hidden` clipuje obsah. Plynulé bez znalosti výšky obsahu. Odpověď přesunuta dovnitř clip wrapperu (dřív podmíněně mountovaná → bez animace).
- **Mezera otázka↔odpověď:** odpověď dostala `pt-4`, protože růžová hlavička (pink bg na otevřeném tlačítku) jinak text odpovědi „lepila" hned pod sebe bez mezery.

### Poznámky
- Generované CSS ověřeno: `grid-template-rows:0fr` i `1fr` přítomné, sunset-pink pravidla taky.
- `pnpm lint` čistý, `pnpm build` OK (29/29), `pnpm test:run` 415 passed / 49 skipped (žádná regrese; FaqAccordion nemá testy). Pod Node 20.20.2.

## 2026-06-07 — icons / přechod na Tabler icons

### Nové funkce / změny
- Přidán balíček `@tabler/icons-react@3.44.0` (pinnuto přes `pnpm add -E`).
- `src/components/landing/Icon.tsx` přepsán jako tenká fasáda nad Tabler — zachované API (`name: IconName`, `className`, `title`), takže volání v `page.tsx`, `FeatureTabs`, `FaqAccordion` zůstala beze změny. Mapování 26 názvů → Tabler komponenty (timer→IconClock, grid→IconLayoutGrid, web→IconBrowser, badge→IconId, edit-calendar→IconCalendarEvent, contact-page→IconAddressBook, manage-accounts→IconUserCog, restaurant→IconToolsKitchen2, hand→IconHandStop, check-circle→IconCircleCheck, …). Původní ručně kreslené inline SVG glyphy odstraněny.
- `src/components/landing/PublicHeader.tsx` — hamburger/zavírací ikona nahrazena `IconMenu2` / `IconX` (size 24, stroke 2).
- `next.config.ts` — přidáno `experimental.optimizePackageImports: ['@tabler/icons-react']` (tree-shaking + rychlejší dev kompilace; jinak barrel import tahá tisíce modulů).

### Poznámky
- Fasáda zachována záměrně (surgical, nízký dopad) — call sites se nemění, jen vnitřek. Tabler ikony jsou čistě prezentační (bez hooků), takže fungují i v RSC (`page.tsx` je server component).
- Rozsah: migrovány ikony landing/marketing systému (Icon fasáda) + hamburger. Ad-hoc inline SVG jinde v appce (např. šipky kalendáře „←/→" v dashboardu) zatím nemigrovány — lze na vyžádání.
- Build warning „A Node.js API is used (process.version) … Edge Runtime" je PŘEDEXISTUJÍCÍ (supabase-js v Edge middleware), nesouvisí s ikonami.
- Ověřeno: `pnpm lint` čistý, `pnpm build` OK (29/29 prerendered), `pnpm test:run` 415 passed / 49 skipped (žádná regrese). Tabler ikony renderují (`tabler-icon`, `tabler-icon-menu-2`). Pod Node 20.20.2.

## 2026-06-07 — branding / oficiální logo Horea

### Nové funkce
- `public/logo.svg` — oficiální logo projektu (wordmark „Horea" `#21164c` + tečka `#645cfd`), optimalizovaný SVG, viewBox 809.02×281.17 (poměr ≈ 2.877). Zdroj pravdy pro celou app.
- `src/components/Logo.tsx` — sdílená komponenta loga přes `next/image` (`unoptimized`, protože jde o důvěryhodný first-party vektor a Next optimalizér SVG bez `dangerouslyAllowSVG` neprochází). Props `width`/`height`/`className`/`priority`, výchozí rozměr 104×36 se zachovaným poměrem.

### Změny
- Textový wordmark „Horea" nahrazen logem všude, kde sloužil jako brand mark: `PublicHeader` (h-8, priority), `PublicFooter` (h-9), všech 5 auth stránek (`login`, `register`, `forgot-password`, `reset-password`, `verify-email/page` + `verify-email/VerifyEmailLinkScreen`, h-7) a `onboarding/OnboardingProgress` (h-6). Logo je vždy v odkazu na `/` s `<span className="sr-only">Horea</span>` pro přístupnost (+ `alt="Horea"`).
- Dashboard nav záměrně beze změny — žádné brand logo neměl a přidávat ho je nevyžádaná designová změna. Favicon ponechán (wordmark se na čtvercový icon nehodí).

### Bug & fix (vedlejší, odhalený při ověření)
- **Symptom:** Snapshot test `tests/components/reservations-views.spec.tsx` (CalendarView) spadl po půlnoci — diff jen v datu `anchor=2026-06-06` → `2026-06-07`.
- **Root cause:** Odkaz „Dnes" v `CalendarView` počítá aktuální datum přes `todayPragueDate()`, takže snapshot závisel na dni běhu (flaky o půlnoci). Nesouvisí s logo změnou.
- **Fix:** V `describe('CalendarView …')` přidán `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2024-07-15T10:00:00.000Z'))` (a `afterAll` restore), snapshot přegenerován na pevné `anchor=2024-07-15`. Nyní deterministický.

### Ověřeno
- `pnpm lint` čistý, `pnpm build` OK (29/29 prerendered), `pnpm test:run` 415 passed / 49 skipped (žádná regrese). `/logo.svg` servírováno (200, image/svg+xml), logo renderuje v headeru i patičce. Pod Node 20.20.2.

## 2026-06-06 — marketing / plovoucí public header (scoped přes (marketing) route group)

### Nové funkce
- `src/components/landing/PublicHeader.tsx` (`'use client'`) — plovoucí „pill" header pro veřejné marketingové stránky Horea. Sticky, zaoblený (rounded-full) bar s logem, navigací (kotvy `/#…`) a odkazem na přihlášení. Scroll listener (`window.scrollY > 24`) přepíná `scrolled` stav: po odscrollování se bar zkompaktní (`py-3 shadow-sm` → `py-2 shadow-md`) a zprava se vysune primární CTA „Vytvořit účet" (na desktopu přes `md:max-w-0 md:opacity-0` → `md:max-w-[220px] md:opacity-100`). Na mobilu je CTA viditelné vždy, navigace skrytá. Touch ≥44px, tokeny design systému (Action Violet, Cloud Mist, radius-buttons).
- `src/components/landing/PublicFooter.tsx` — patička vyčleněná z homepage do sdílené komponenty (stejný obsah, beze změny markupu).
- `src/app/(marketing)/layout.tsx` — layout veřejných marketingových stránek: wrapping `div` (min-h-screen, cloud-mist bg) + `PublicHeader` + `{children}` + `PublicFooter`. Header/patička se tím aplikují jen na stránky ve skupině `(marketing)`.

### Změny
- `src/app/page.tsx` přesunut do `src/app/(marketing)/page.tsx` (route `/` beze změny). Z homepage odstraněn inline `<header>` a `<footer>` (teď v layoutu) i nepoužitý `NAV_LINKS`; vrací už jen `<main>` se sekcemi.

### Poznámky
- **Scoping:** header dostávají jen stránky ve skupině `(marketing)` (zatím homepage; připraveno pro Obchodní podmínky, Kontakt, Blog). Auth stránky (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/error`), veřejná stránka podniku (`/[slug]`) a dashboard (`(dashboard)`) leží MIMO skupinu → header nedědí. Ověřeno: `/` obsahuje pill header (`max-w-[960px]`, `rounded-full`), `/login` ne (0 výskytů).
- Nav kotvy jako `/#vyhody` (absolutní na homepage), aby fungovaly i z budoucích marketingových podstránek.
- `pnpm lint` čistý, `pnpm build` OK (`/` stále prerendered static, 3.74 kB), `pnpm test:run` 415 passed / 49 skipped (žádná regrese). Pod Node 20.20.2.

## 2026-06-06 — landing-page / ceník (sjednocení s reálnými cenami)

### Bug & fix
- **Symptom:** Ceník na landing page (`src/app/page.tsx`) zobrazoval marketingové ceny Start=Zdarma, Pokročilý=490 Kč, Max=990 Kč, které neodpovídaly reálnému ceníku produktu. FAQ navíc tvrdilo „tarif Start je zcela zdarma".
- **Root cause:** Landing copy převzata z UI předlohy s vymyšlenými cenami, nesladěná se zdrojem pravdy.
- **Fix:** Ceny sladěny se `src/lib/checkout/pricing.ts` (`PLAN_PRICE_CZK`, ověřeno `pricing.test.ts`): Start **199 Kč/měsíc**, Pokročilý **299 Kč/měsíc**, Max **599 Kč/měsíc**. Labely Start/Pokročilý/Max už odpovídaly enumu `SubscriptionPlan`. FAQ odpověď o zkušebním období přeformulována tak, aby netvrdila, že Start je zdarma (všechny tři tarify jsou placené).
- **Pozn.:** Sladěny jen ceny a názvy (zdroj pravdy). Marketingové feature bullets (počty uživatelů, „Vlastní doména", „SMS upozornění", „API přístup") ponechány beze změny — mapování na reálné limity tarifů je produktové rozhodnutí mimo rozsah. `pnpm lint` čistý, `pnpm build` OK, `/` prerendered.

## 2026-06-06 — global / spacing scale collision (app-wide oprava rozestupů)

### Bug & fix
- **Symptom:** Číselné Tailwind utility s čísly {4,8,12,16,20,24,32,40,48,60,100} se v CELÉ appce renderovaly špatně (collapsed). Např. `h-24 w-24` avatar (`PublicProfileRenderer`, párováno s `height={96}`) = 24px místo 96px; `max-h-48`/`max-h-44` scroll oblasti (DPA text) = 48/44px místo 192/176px; `gap-4`/`py-8`/`px-4` = 4/8/4px místo 16/32/16px. Na landing page se to projevilo nejviditelněji (header 21px). Předtím řešeno jen scoped na landing.
- **Root cause:** `@theme` v `src/app/globals.css` definoval `--spacing-4: 4px` … `--spacing-100: 100px`. Tailwind v4 registruje `--spacing-*` z `@theme` do spacing scale a přebíjí číselné utility: `h-20` → `var(--spacing-20)` = 20px místo standardního `calc(var(--spacing)*20)` = 80px. Číslo v utilitě je v Tailwindu KROK (×0.25rem), ne px — tokeny ale mapovaly název=px, takže každá bare utilita s kolidujícím číslem dostala špatnou (drobnou) hodnotu. Aplikace byla psána se standardní Tailwind sémantikou → tiché rozbití po celé appce.
- **Fix:** Přesun bloku `--spacing-4 … --spacing-100` z `@theme` do `:root` v `src/app/globals.css`. Tím přestaly být Tailwind theme tokeny (zmizely ze spacing scale), ale zůstaly jako čisté CSS proměnné → `var(--spacing-N)` reference (všechny v arbitrary formě `gap-[var(--spacing-16)]`) fungují dál na stejných px, zatímco bare utility (`h-20`, `gap-4`, `h-24` …) se vrátily ke standardnímu `calc(var(--spacing)*N)`. **Nula změn referencí** (desítky `var(--spacing-N)` napříč onboarding/dashboard/components beze změny).
- **Nefungovalo / zamítnuto:** Rename na `--stack-N` namespace + update ~6 referencí — ukázalo se, že referencí jsou desítky, ne 6; přesun do `:root` je čistší ekvivalent s nulovou změnou referencí.
- **Ověřeno:** Generované CSS `.h-20{height:calc(var(--spacing)*20)}` (=80px), `.h-24`=96px, `.gap-4`=16px, `.py-8`=32px; `--spacing:.25rem` i `--spacing-16:16px` koexistují. `pnpm lint` čistý, `pnpm build` OK, `pnpm test:run` 415 passed / 49 skipped (žádná regrese). Pod Node 20.20.2.
- **Pozn.:** Vizuální dopad je app-wide — rozestupy/velikosti se zvětšily z collapsed na standardní (správné) hodnoty. Unit testy vizuál nezachytí → doporučena ruční vizuální kontrola klíčových obrazovek (dashboard, onboarding, veřejný profil, modaly). Scoped arbitrary-px konverze na landing (`h-[80px]` apod.) ponechány — renderují identické px jako standardní utility, revert by byl zbytečný churn.

## 2026-06-06 — landing-page / header (oprava zborceného headeru)

### Bug & fix
- **Symptom:** Header landing page se vykresloval jen ~21px vysoký (místo 80px), UI zborcené. Stejně rozbité i ostatní rozestupy v landing sekcích.
- **Root cause:** Kolize spacing scale v Tailwind v4. `@theme` v `src/app/globals.css` definuje `--spacing-4: 4px` … `--spacing-100: 100px` (čísla {4,8,12,16,20,24,32,40,48,60,100}). Tailwind v4 tyto explicitní hodnoty použije pro číselné utility se stejným číslem → `h-20` = `var(--spacing-20)` = **20px** (správně 80px), `p-4`=4px, `gap-4`=4px, `h-16`=16px, `py-12`=12px atd. Nekolidující čísla (3,5,6,10,11) fungují přes `calc(var(--spacing)*N)`.
- **Fix:** Scoped náhrada kolidujících číselných utilit v landing souborech na arbitrary px (`h-20`→`h-[80px]`, `p-4`→`p-[16px]`, …; konverze N→N*4 px) v `src/app/page.tsx`, `src/components/landing/FeatureTabs.tsx`, `src/components/landing/FaqAccordion.tsx`. Header nyní `h-[80px]`. Ručně dorovnány i `-top-4`→`-top-[16px]` a `md:-translate-y-4`→`md:-translate-y-[16px]` u zvýrazněné karty ceníku (badge „Nejoblíbenější").
- **Nefungovalo / zamítnuto:** Globální odstranění `--spacing-N` tokenů z `@theme` — nebezpečné, několik souborů (`admin/businesses/[id]/BusinessActions.tsx`, `app/components/page.tsx`, `register/RegisterForm.tsx`, `dashboard/clients/[id]/DeleteClientDialog.tsx`) používá `var(--spacing-12/16/48)` přímo. Ponecháno jako možný budoucí globální refactor (rename tokenů do nekolidujícího namespace) s app-wide vizuální revizí.
- **Ověřeno:** `pnpm lint` čistý, `pnpm build` OK, `pnpm test:run` 415 passed / 49 skipped (baseline, žádná regrese). Pod Node 20.20.2.

## 2026-06-06 — landing-page / homepage (veřejná úvodní stránka)

### Nové funkce
- Úvodní landing page (`src/app/page.tsx`) — nahradila výchozí Next starter. Server component se sekcemi: sticky nav, hero, „Proč Horea?", interaktivní funkce, obory, statistiky, ceník (3 tarify), FAQ, finální CTA, footer. Copy 1:1 z `.kiro/docs/landing-page/homepage/code.html`. CTA → `/register`, přihlášení → `/login`, nav kotvy na sekce.
- `src/components/landing/Icon.tsx` — inline SVG ikony (24×24, currentColor, žádný externí Material Symbols font ani CDN). Pokrývá jen glyphy reálně použité v předloze.
- `src/components/landing/FeatureTabs.tsx` (`'use client'`) — 5 tabů s `useState`, ARIA tablist/tab/tabpanel.
- `src/components/landing/FaqAccordion.tsx` (`'use client'`) — rozbalovací FAQ přes `useState`, `aria-expanded`, plus/minus ikona.

### Poznámky
- Token mapping: Material názvy z code.html (`primary-container`, `on-surface`, …) přemapovány na projektové tokeny přes arbitrary `var()` formy (Action Violet, Rich Violet, Slate Text, Cloud Mist, Soft Gray Fill, akcenty). Ztlumený text přes `color-mix`. Fonty `--font-polysans`/`--font-plus-jakarta-sans` z root layoutu.
- Hero vizuál = gradientový placeholder blok s ikonou (žádný externí googleusercontent obrázek). Žádná nová dependency.
- `pnpm lint` čistý; `pnpm test:run` 415 passed / 49 skipped (baseline, žádná regrese); `pnpm build` OK, `/` prerendered jako statická stránka. Build běžel pod Node 20.20.2.

## 2026-06-06 — admin-dashboard (volitelný unit test 14.4 — CRUD kupónů)

### Hotové tasky
- 14.4 Unit test CRUD kupónů (`src/lib/admin/__tests__/coupon-manager.test.ts`) — ověřeno (lint / `test:run`)

### Nové funkce
- Žádné — pouze test nad existujícím `src/lib/admin/coupon-manager.ts`.

### Poznámky
- 19 unit testů přes Vitest pokrývajících CRUD persistenci kupónů (R7.1/7.4/7.5/7.6/7.7): persistence atributů při `createCoupon`/`updateCoupon` (správné RPC parametry vč. ISO konverze `valid_until`), `deactivateCoupon` (cesta `is_active=false`, `used_count` zachován), `deleteCoupon`, obsah seznamu `listCoupons` s `used_count` (řazení desc, normalizace textového `discount_value`), a mapování chyb na české hlášky (23505→`duplicate_code`, 22023→`invalid_percent`, prázdný výsledek→`not_found`, jinak→`mutation_failed`).
- Mock RPC (`vi.fn`) pro mutace + reuse `supabase-fake.ts` pro `listCoupons` — žádná reálná DB. Validaci unikátnosti/percent jako vlastnost vlastní PBT 14.3; 14.4 cílí jen na CRUD/seznam/mapování, neduplikováno.
- `pnpm lint` čistý; `pnpm test:run` 415 passed / 49 skipped (baseline 396 → +19, žádná regrese).

## 2026-06-06 — admin-dashboard (volitelné E2E testy 20.1 / 20.2)

### Hotové tasky
- 20.1 E2E CRUD kupónu (`e2e/coupon-crud.spec.ts`) — ověřeno (lint / `playwright --list`)
- 20.2 E2E ruční párování platby (`e2e/payment-match.spec.ts`) — ověřeno (lint / `playwright --list`)

### Nové funkce
- Helper `loginAsAdmin` + `hasAdminCreds` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` (`e2e/support/dashboard.ts`) — přihlášení seedovaného admina (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`); reuse `loginAsOwner` vzoru, po loginu redirect na `/dashboard`, odtud na cesty pod `/admin`.

### Poznámky
- Dva VOLITELNÉ, env-guarded E2E testy (Playwright) v `e2e/` (dle `testDir`). 20.1 projde celý CRUD životní cyklus kupónu na `/admin/coupons` vč. odmítnutí duplicitního kódu („Kupón s tímto kódem již existuje."); kód kupónu odvozen z `Date.now()` → unikátní mezi běhy, bez kolize se seedem. 20.2 vyhledá čekající platbu dle VS na `/admin/payments` a spáruje ji.
- **Env guard:** `test.skip(!hasAdminCreds, …)` — bez `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` se test čistě přeskočí. Navíc runtime `test.skip` při chybějícím prostředí/datech: nevykreslený nadpis stránky (účet není admin) i prázdný seznam čekajících plateb (20.2 potřebuje seedovanou `pending`/`qr_manual` platbu).
- Reálné selektory dle `src/app/admin/coupons/*` a `src/app/admin/payments/*` (placeholdery polí, texty tlačítek „Vytvořit kupón"/„Uložit změny"/„Deaktivovat"/„Smazat"/„Spárovat", success Notice hlášky). Žádná nová dependency.
- E2E neběží ve Vitestu (`e2e/` mimo `test:run`), jen v `pnpm test:e2e`. `pnpm lint` čistý; `pnpm test:run` 396 passed / 49 skipped beze změny (žádná regrese); `pnpm exec playwright test --list` = 7 testů, oba nové validní. Bez prostředí (běžící app + admin creds + seed) NEspuštěné.

## 2026-06-06 — admin-dashboard (volitelné integrační testy 19.1 / 19.2 / 19.3 / 19.4)

### Hotové tasky
- 19.1 Integrační test RLS admin override (`tests/integration/admin-rls-override.test.ts`) — ověřeno (lint/test)
- 19.2 Integrační test append-only auditu na úrovni DB (`tests/integration/audit-append-only-db.test.ts`) — ověřeno (lint/test)
- 19.3 Integrační test spárování platby → efekt prodloužení (`tests/integration/payment-match-effect.test.ts`) — ověřeno (lint/test)
- 19.4 Integrační test úplnosti vynuceného smazání (`tests/integration/force-delete-completeness-db.test.ts`) — ověřeno (lint/test)

### Nové funkce
- Žádné — pouze testy proti reálné DB nad existujícími migracemi 0031–0040 a TS wrappery (`matchPayment`, `forceDeleteBusiness`).

### Poznámky
- Čtyři VOLITELNÉ, env-guarded integrační testy nad migracemi 0031–0040 (audit_log, append-only granty, RLS admin override, `admin_match_payment`, `admin_force_delete_business`). Stejný vzor jako `dashboard-rls.test.ts` (seed přes service-role, cleanup mazáním podniků + auth uživatelů).
- **Env guard:** 19.1 přes `describe.skipIf(!hasRlsIntegrationEnv)` (potřebuje anon klíč pro bearer kontext admina/majitele); 19.2/19.3/19.4 přes `describe.skipIf(!hasIntegrationEnv)` (jen service-role). Bez lokálního Supabase se všechny přeskočí, neselžou.
- 19.2 záměrně neuklízí `audit_log` řádky — `DELETE` je zakázán (právě testovaná append-only vlastnost); FK `actor_user_id` má `on delete set null`, takže smazání actora osiří záznam bez chyby.
- 19.3 ověřuje posun `current_period_end` o Jeden_Mesic (2 592 000 s) z pevné báze; efekt vlastní `subscription-payments`, zde se jen spouští přes `matchPayment`.
- 19.4 seeduje bohatá tenant data (služba, otevírací doba, rezervace, klient) a ověří jejich smazání + zachování historie `subscriptions` (`deleted_data`) / `payments` přes `forceDeleteBusiness`.
- `pnpm lint` čistý; `pnpm test:run` 396 passed beze změny, skipped 36 → 49 (+13 testů ve 4 nových přeskočených souborech). Bez lokálního Supabase NEspuštěné.

## 2026-06-06 — reservation-management (volitelné E2E testy 13.2 / 13.3 / 13.4)

### Hotové tasky
- 13.2 E2E schválení rezervace (`e2e/approve-flow.spec.ts`) — ověřeno (lint / `playwright --list`)
- 13.3 E2E úprava rezervace (`e2e/edit-flow.spec.ts`) — ověřeno (lint / `playwright --list`)
- 13.4 E2E ruční tvorba rezervace (`e2e/manual-creation.spec.ts`) — ověřeno (lint / `playwright --list`)

### Nové funkce
- `e2e/support/dashboard.ts` — sdílený helper dashboard E2E (login majitele přes `/login`, `pragueDatePlusDays`, podmíněné čtení inboxu). Není `*.spec.ts`, Playwright ho nesbírá jako test.

### Poznámky
- Tři VOLITELNÉ, env-guarded Playwright testy. Umístěny v `e2e/` (ne `tests/e2e/` z tasks.md), protože `playwright.config.ts` má `testDir: './e2e'` a stávající testy (`reservation-happy-path`, `smoke`) tam žijí — `tests/e2e/` by Playwright vůbec nesbíral.
- **Env guard:** celá sada se přeskočí přes `test.skip(!hasOwnerCreds, …)` bez `E2E_OWNER_EMAIL` + `E2E_OWNER_PASSWORD`. Navíc runtime `test.skip`, když chybí seedovaná data (žádná `pending`/upravitelná rezervace, žádná služba, žádný dostupný slot). E-mailová část je podmíněná `E2E_RESEND_INBOX_URL` (Resend neexponuje čtení doručených zpráv → operátor nasměruje na vlastní inbox endpoint); bez něj se přeskočí.
- Robustní výběr dostupného slotu (13.3/13.4): záměrně se vyplní `02:00`, čímž se přes 409 vyvolá nabídka „Dostupné časy", a vybere se reálný slot z UI (žádné hádání dostupnosti).
- Reálné selektory dle stávajících stránek `src/app/(dashboard)/dashboard/reservations/*` (české labely „Schválit", „Schváleno", „Vytvořit rezervaci", „Upravit", `#create-*` / `#edit-*` pole). Žádná nová dependency.
- `pnpm lint` čistý; `pnpm test:run` 396 passed / 36 skipped (beze změny — Playwright testy nejsou součástí vitestu); `pnpm exec playwright test --list` vypisuje všechny 3 nové testy. E2E se bez prostředí NEspouští.

## 2026-06-06 — reservation-management (volitelné integrační testy 1.3 / 6.7 / 9.8 / 10.8 / 10.9 / 11.5)

### Hotové tasky
- 1.3 Integrační test RLS izolace dashboardu (`tests/integration/dashboard-rls.test.ts`) — ověřeno (lint/test)
- 6.7 Integrační test filtrů a stránkování (`tests/integration/reservation-filters.test.ts`) — ověřeno (lint/test)
- 9.8 Integrační test advisory lock race při úpravě (`tests/integration/edit-race.test.ts`) — ověřeno (lint/test)
- 10.8 Integrační test časování upsertu klienta (`tests/integration/client-upsert-timing.test.ts`) — ověřeno (lint/test)
- 10.9 Integrační test atomicity anonymizace (`tests/integration/anonymization-atomicity.test.ts`) — ověřeno (lint/test)
- 11.5 Integrační test rozsahu CSV exportu (`tests/integration/csv-scope.test.ts`) — ověřeno (lint/test)

### Poznámky
- Šest VOLITELNÝCH, env-guarded integračních testů proti lokálnímu Supabase. Vzor přesně dle stávajících `tests/integration/*` (`describe.skipIf(!hasIntegrationEnv())` / `!hasRlsIntegrationEnv()`, seed v `beforeAll`, kaskádový úklid v `afterAll`). Bez lokálního Supabase se čistě přeskočí — NEspouští se v defaultním `pnpm test:run`.
- **Přípona `.test.ts`** (ne `.spec.ts` z tasks.md): `vitest.config.ts` `include` matchuje pro `tests/**` OBĚ přípony, takže obě poběží; zvolena `.test.ts` kvůli konzistenci s existujícími integračními soubory.
- Reálné API: RLS policies (0007/0018), RPC `edit_reservation` a `anonymize_client` (0021/0023) volané přímo přes service-role/bearer klienta (server actions běží pod Next.js cookies kontextem, který v test runneru není), reálná funkce `upsertClientFromReservation` (přijímá Supabase klienta) a exportovaný helper `generateCsvLines` z `CsvExporter`.
- 10.8 selhání upsertu vyvoláno neexistujícím `business_id` (FK violation na `clients` → best-effort log, žádná výjimka, rezervace přetrvá). 9.8/11.5 staví na tom, že `reservations` nemá exclusion constraint (overlap žije jen v RPC), takže přímý seed mnoha řádků projde.
- `pnpm lint` čistý; `pnpm test:run` 396 passed / 36 skipped (+18 nových skipped v 6 nových souborech, baseline 396/18 — žádná regrese). Bez lokálního Supabase nejsou nové testy spuštěné.

### Hotové tasky
- 3.2 Property test úplnosti auditní stopy — Property 2 (`tests/properties/audit-trail-completeness.spec.ts`) — ověřeno (lint/test)
- 3.3 Property test append-only auditní stopy — Property 3 (`tests/properties/audit-append-only.spec.ts`) — ověřeno (lint/test)
- 11.2 Property test atomicity Free_Trial a Comp_Ucet — Property 6 (`tests/properties/grant-atomicity.spec.ts`) — ověřeno (lint/test)
- 12.2 Property test úplnosti vynuceného smazání — Property 7 (`tests/properties/force-delete-completeness.spec.ts`) — ověřeno (lint/test)

### Poznámky
- Čtyři volitelné PBT modelující skutečné DB chování (fast-check, otagované `Feature: admin-dashboard, Property N`), vzor dle `data-deletion-completeness.spec.ts` / `anonymization-completeness.spec.ts` — in-memory store + nezávislý deklarativní oracle, žádná reálná DB. 200/200/200/150 iterací.
- **Property 2** modeluje, že každá akční RPC volá `write_audit_log` (migrace 0035) jednou ve své transakci: úspěšná akce (cíl existuje, resp. `coupon_create`) → přesně 1 nový záznam s povinnými poli (actor/action_type/target_type/target_id/created_at); `not_found` → 0. Oracle počítá `expectedWrite` nezávisle na imperativním runneru.
- **Property 3** modeluje append-only granty z migrace 0034: `INSERT`/`SELECT` povoleno, `UPDATE`/`DELETE` vyhodí `permission denied` a nic nezmění. Oracle rekonstruuje koncový stav pouze z `INSERT` operací.
- **Property 6** modeluje jednu transakci `admin_grant_free_trial`/`admin_grant_comp` (migrace 0037) se snapshot/rollback: injektovaný bod selhání (update sub / update biz / write audit) → úplný rollback na původní stav; úspěch → cílové hodnoty (free_trial nastaví `current_period_end`, comp ne) + 1 audit.
- **Property 12.2** modeluje `admin_force_delete_business` (migrace 0038) znovupoužívající věrný model `delete_business_tenant_data` (0030) — samostatný od subscription-payments Property 8: cílí na force-delete kontrakt (smazání tenant dat + zachování historie `subscriptions`/`payments` + právě 1 audit `force_delete_business`).
- Žádná úprava `src/` ani `tasks.md` (PBT stav nastaven nástrojem). `pnpm lint` čistý, `pnpm test:run` 396 passed / 18 skipped (+4 nové, baseline 392/18 — žádná regrese).

## 2026-06-06 — admin-dashboard (property testy 2.3 / 14.3 / 5.3)

### Hotové tasky
- 2.3 Property test řízení přístupu — Property 1 (`tests/properties/admin-access-guard.spec.ts`) — ověřeno (lint/test)
- 14.3 Property test validace kupónu — Property 4 (`tests/properties/coupon-validation.spec.ts`) — ověřeno (lint/test)
- 5.3 Property test správnosti statistik — Property 5 (`tests/properties/admin-stats-correctness.spec.ts`) — ověřeno (lint/test)

### Poznámky
- Tři volitelné PBT (fast-check, ≥100 iterací, otagované `Feature: admin-dashboard, Property N`), 6 testů celkem, 200 iterací každý.
- **Property 1** testuje čisté `decideAdminGuard`/`isAdminPath`/`ADMIN_FORBIDDEN_MESSAGE` přímo (vše už exportováno) — žádný mock; ověřuje `allow ⟺ autentizovaný admin`, jinak `redirect-login`/`forbidden`, vzájemnou výlučnost a přesnou klasifikaci `/adminx` vs. `/admin/...`.
- **Property 4** testuje validaci přes veřejné `createCoupon` s řízeným mockem Supabase klienta — `isPercentValueValid` je interní a **nebyla exportována** (dle zadání preferovat existující exporty). Mock modeluje DB unique constraint deklarativně (množina existujících kódů → SQLSTATE 23505) a ověřuje `úspěch ⟺ percent∈[0,100] ∧ kód není duplicitní`, vč. že neplatný percent zamítne PŘED voláním RPC.
- **Property 5** testuje čisté `sumPaidRevenueCzk`/`partitionByStatus` (oba už exportované) s nezávislým oracle (akumulace ve smyčce vs. reduce; partition reportovaných stavů, `deleted_data`/`null`/neznámé se nezapočítají).
- Žádný nový export ani úprava `src/` nebyly potřeba. `tasks.md` neupravován dle zadání.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 392 passed / 18 skipped (+6 nových, baseline 386/18 — žádná regrese).

## 2026-06-06 — admin-dashboard (unit testy admin akcí)

### Hotové tasky
- 10.3 Unit test override a pozastavení (`src/lib/admin/__tests__/subscription-override.test.ts`) — ověřeno (lint/test)
- 11.3 Unit test cílových hodnot Free_Trial / Comp_Ucet (`src/lib/admin/__tests__/grants.test.ts`) — ověřeno (lint/test)
- 15.3 Unit test párování plateb (`src/lib/admin/__tests__/payment-matcher.test.ts`) — ověřeno (lint/test)
- 16.2 Unit test opětovného odeslání faktury (`src/lib/admin/__tests__/invoice-resender.test.ts`) — ověřeno (lint/test)

### Poznámky
- RPC-based akce (`overrideSubscription`/`suspendBusiness`, `grantFreeTrial`/`grantComp`, `matchPayment`) se testují přes fake `{ rpc }` — ověřeno předání actora a správných parametrů + mapování návratu (ok / `not_found` při prázdném výsledku / `*_failed` při chybě). Atomicita „akce + audit" žije v plpgsql, ne v TS, proto se zde netestuje (pokryto integračními tasky 19.x).
- 15.3 čtení (`listPendingPayments`/`searchPendingPaymentsByVariableSymbol`) používá sdílený `supabase-fake` (filtr `pending`+`qr_manual`, řazení dle data, normalizace `amount_czk` string→number, vyhledání dle VS); spárování přes `rpc`, edge-case selhání → `match_failed`.
- 16.2 mockuje `sendEmail`/`describeResendError`/`renderSubscriptionInvoiceEmail`/`createInvoiceSignedUrl`/`serverLog` + lokální chainable fake s `not(col,'is',null)`/`limit`/`order`/`maybeSingle`; ověřuje výběr NEJNOVĚJŠÍ paid faktury a odeslání vlastníkovi vs. absence faktury → `no_invoice` + česká hláška, neodešle.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 386 passed / 18 skipped (+29 nových, baseline 357/18 — žádná regrese). `tasks.md` neupravován dle zadání.

## 2026-06-06 — admin-dashboard (unit testy čtecí vrstvy a auditu)

### Hotové tasky
- 5.4 Unit test metrik přehledu (`src/lib/admin/__tests__/stats.test.ts`) — ověřeno (lint/test)
- 6.3 Unit test prohlížení auditu (`src/lib/admin/__tests__/audit-viewer.test.ts`) — ověřeno (lint/test)
- 7.3 Unit test seznamu a filtrů podniků (`src/lib/admin/__tests__/business-list.test.ts`) — ověřeno (lint/test)
- 8.3 Unit test detailu podniku (`src/lib/admin/__tests__/business-detail.test.ts`) — ověřeno (lint/test)
- 3.4 Unit test best-effort zachycení before/after (`src/lib/admin/__tests__/audit-logger.test.ts`) — ověřeno (lint/test)

### Nové funkce
- `src/lib/admin/__tests__/supabase-fake.ts` — sdílený fake Supabase klient pro unit testy čtecí vrstvy admin dashboardu. Chainable „thenable" builder, který **opravdu aplikuje** `eq`/`in`/`gte`/`lte` a `order` nad poskytnutými řádky (mapa tabulka→řádky), `maybeSingle()` vrací první řádek; volitelný `errorTable` simuluje chybu dotazu. Umožňuje smysluplně testovat chování závislé na období/filtrech bez reálné DB. Není test soubor (mimo glob `*.test.ts`).

### Poznámky
- Testy cílí na reálné exportované API (`computeAdminOverviewStats` + čisté `sumPaidRevenueCzk`/`partitionByStatus`; `listAuditLog`; `matchesBusinessFilters`/`applyBusinessFilters`/`listBusinesses`; `getBusinessDetail`; `captureSnapshot`). Žádné mocky logiky, žádná reálná DB.
- 5.4 ověřuje rozlišení časově závislých metrik (registrace/Churn/tržby přepočítané dle období) vs. aktuálně-stavových (aktivní předplatná, rozpad dle stavu) — dataset uvnitř i vně období.
- 3.4 ověřuje R9.4 edge-case: `captureSnapshot` při výjimce / odmítnutém Promise / `undefined` / `null` vrací `null` a nevyhodí (logováno přes `log.warn`, očekávaný výstup v testu).
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 357 passed / 18 skipped (+33 nových, baseline 324/18 beze změny — žádná regrese). `tasks.md` neupravován dle zadání.


## 2026-06-16 — admin-dashboard (napojení admin akcí do detailu podniku)

### Hotové tasky
- 17.1 Napojení akčních tlačítek do `/admin/businesses/[id]` (`src/app/admin/businesses/[id]/{page,actions,BusinessActions}.tsx`) — ověřeno (lint/test/build)

### Nové funkce
- Server actions detailu podniku (`src/app/admin/businesses/[id]/actions.ts`) — `overrideSubscriptionAction` (R5.1/5.2), `grantFreeTrialAction` (R5.3), `grantCompAction` (R5.4), `suspendBusinessAction` (R5.5), `forceDeleteBusinessAction` (R6.1, předává `confirmed:true`), `resendInvoiceAction` (R11.1). Každá: `requireAdmin()` PŘED mutací → lib fce se service-role klientem + actorem → `revalidatePath('/admin/businesses/[id]')`; chyba mapována na českou hlášku.
- `subscriptionId` se pro override/grants **resolvuje server-side** z `businessId` (`subscriptions.select('id').eq('business_id',…)`), aby read-only detail (`getBusinessDetail`) nemusel id protahovat a stránka zůstala tenká. Bez předplatného → česká hláška „Podnik nemá předplatné…".
- Client komponenta `BusinessActions` (`src/app/admin/businesses/[id]/BusinessActions.tsx`) — formuláře override (tarif/stav/konec období, předvyplněno z aktuálních hodnot) a free trial (datum), tlačítka comp / pozastavení / odeslání faktury a vynucené smazání. Vzor `useTransition` + `router.refresh()`, české hlášky z výsledku, touch ≥44px (`min-h-[44px]`), Action Violet / Card dle design systému.

### Poznámky
- **Potvrzovací dialog smazání (R6.1):** „Vynuceně smazat podnik" otevře modální dialog (role=dialog, aria-modal, Esc zavírá) s nevratným varováním; teprve potvrzení „Trvale smazat" zavolá `forceDeleteBusinessAction`, která lib funkci předá `confirmed:true`. Server-side guard v `forceDeleteBusiness` brání smazání bez potvrzení i mimo UI. Po úspěchu redirect na `/admin/businesses`.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK (`/admin/businesses/[id]` nyní 3.71 kB client bundle).

## 2026-06-16 — admin-dashboard (admin SSR stránky: audit, detail podniku, kupóny, platby)

### Hotové tasky
- 6.2 Stránka `/admin/audit` (`src/app/admin/audit/page.tsx`) — ověřeno (lint/test/build)
- 8.2 Stránka `/admin/businesses/[id]` (`src/app/admin/businesses/[id]/page.tsx`) — ověřeno (lint/test/build)
- 14.2 Stránka `/admin/coupons` + server actions (`src/app/admin/coupons/{page,coupons-manager,actions}.tsx`) — ověřeno (lint/test/build)
- 15.2 Stránka `/admin/payments` + server action (`src/app/admin/payments/{page,payments-matcher,actions}.tsx`) — ověřeno (lint/test/build)

### Nové funkce
- `src/lib/admin/require-admin.ts` — sdílený server-only helper `requireAdmin()` pro server actions. Ověří přihlášení (`createClient().auth.getUser()`) + roli `is_admin` (čteno service-role klientem nezávisle na RLS, vzor jako `login/actions`). Vrací `{ok:true, actorUserId, admin}` (service-role klient pro cross-tenant zápis + actor pro audit) nebo `{ok:false, message}` s českou hláškou. Každá citlivá akce ho volá PŘED mutací (R1.5).
- `/admin/audit` (6.2) — read-only SSR nad `listAuditLog`; filtry typ akce / časový rozsah / cílový objekt (typ + id) přes searchParams (GET form); řazeno desc; čeština přes label mapy `AuditActionType`/`AuditTargetType`, datum přes `toPragueDisplay`. Žádné mutace.
- `/admin/businesses/[id]` (8.2) — read-only SSR detail nad `getBusinessDetail`: profil + vlastník, stav/tarif/`current_period_end`, historie plateb, počet rezervací. Neexistující id → česká hláška „Podnik nebyl nalezen". Akční tlačítka záměrně NEjsou (task 17.1).
- `/admin/coupons` (14.2) — SSR seznam (`listCoupons` vč. `used_count`) + client komponenta `CouponsManager` (form create/edit, deaktivace, smazání) přes server actions `createCouponAction`/`updateCouponAction`/`deactivateCouponAction`/`deleteCouponAction`. Každá akce: `requireAdmin` → coupon-manager fce s actorem → `revalidatePath`. Výsledek mapuje českou hlášku (duplicitní kód, percent mimo 0–100, not_found).
- `/admin/payments` (15.2) — SSR seznam `listPendingPayments` nebo vyhledání dle VS (`searchParams ?vs=` → `searchPendingPaymentsByVariableSymbol`) + client `PaymentsMatcher` s akcí `matchPaymentAction` (`requireAdmin` → `matchPayment` → `revalidatePath`). Selhání → česká hláška „Platbu se nepodařilo spárovat…" (R8.4).

### Poznámky
- Server actions ověřují admina přes `requireAdmin()` (login + `is_admin`) PŘED každou akcí; bez oprávnění mutace neproběhne. Zápisy běží service-role klientem výhradně server-side; actor (admin user id) se předává do audit stopy. Stránky čtou cross-tenant přes `createAdminClient` (chráněno Access_Guard middlewarem).
- `*` testy (14.3/14.4/15.3 ad.) a task 17.1 (akční tlačítka detailu) mimo rozsah této dávky.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK (4 nové routy: `/admin/audit`, `/admin/businesses/[id]`, `/admin/coupons`, `/admin/payments`).

## 2026-06-16 — admin-dashboard (CouponManager CRUD)

### Hotové tasky
- 14.1 CouponManager CRUD + audit (`src/lib/admin/coupon-manager.ts`, migrace `0040`) — ověřeno (lint/test/build)

### Nové funkce
- Migrace `0040_admin_coupon_crud.sql` (NEAPLIKOVÁNO) — plpgsql SECURITY DEFINER RPC pro CRUD kupónů, každá mutace zapisuje audit ve STEJNÉ transakci přes `write_audit_log` (0035): `admin_create_coupon` (insert + `coupon_create`, before=null), `admin_update_coupon` (update + `coupon_update` before/after, prázdný řádek → not_found), `admin_deactivate_coupon` (`is_active=false` bez mazání + `coupon_deactivate`), `admin_delete_coupon` (hard delete + `coupon_delete`, after=null). Plus pomocná `coupon_snapshot(coupons)→jsonb` pro before/after. Unikátnost `code` (R7.2) vynucuje DB unique constraint z 0005 (SQLSTATE 23505); rozsah percent 0–100 (R7.3) má DB pojistku (errcode 22023) nad primární TS validací. revoke public + grant service_role. _R7.1–7.8, Property 4 + 2._
- `src/lib/admin/coupon-manager.ts` — TS wrapper. `listCoupons` (R7.4, čtení s `used_count`+`is_active`, řazeno desc, neauditováno); `createCoupon`/`updateCoupon`/`deactivateCoupon`/`deleteCoupon` nad RPC 0040. Validace percent 0–100 v TS PŘED RPC (`isPercentValueValid`). Výsledek `ok:true{coupon}` / `ok:false{error,message}` s českými hláškami `COUPON_MUTATION_MESSAGES` (`duplicate_code`/`invalid_percent`/`not_found`/`mutation_failed`); 23505→duplicate_code, 22023→invalid_percent. Reuse typu `CouponType` z `@/lib/coupons/validate`. Server-only, service-role.

### Poznámky
- Audit ve STEJNÉ transakci jako mutace (UVNITŘ akční RPC přes `perform write_audit_log`) — Supabase JS klient neumí držet transakci přes více volání; buď uspěje mutace i audit, nebo se obojí vrátí (Property 2). Při duplicitním kódu/percent mimo rozsah se transakce shodí → žádný kupón ani audit nevznikne.
- Validace percent je v TS (manageru) dle zadání tasku; DB pojistka (22023) je defense-in-depth pro přímé volání RPC.
- Migrace 0040 jen NAPSÁNA, NEAPLIKOVÁNA (dle zadání). Aplikovat s navazujícími tasky. Stránka 14.2 a `*` testy (14.3, 14.4) mimo rozsah této dávky.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK.

## 2026-06-16 — admin-dashboard (vynucené smazání podniku + ruční párování plateb)

### Hotové tasky
- 12.1 Vynucené smazání podniku + audit (`src/lib/admin/force-delete.ts`, migrace `0038`) — ověřeno (lint/test/build)
- 15.1 PaymentMatcher + audit (`src/lib/admin/payment-matcher.ts`, migrace `0039`) — ověřeno (lint/test/build)

### Nové funkce
- Migrace `0038_admin_force_delete_business.sql` (NEAPLIKOVÁNO) — plpgsql SECURITY DEFINER RPC `admin_force_delete_business(actor, business_id)`. ZNOVUPOUŽITÍ, ne duplikace: uvnitř své transakce volá existující `delete_business_tenant_data` (migrace 0030, vlastněná `subscription-payments`) ke smazání tenant dat + vyprázdnění profilu, pak `write_audit_log` (action `force_delete_business`, target `business`) ve STEJNÉ transakci. Historie `subscriptions`/`payments` zůstává zachována. Zachytí `before` (profil pod `for update`), `after` = `{tenant_data_deleted:true}`. Prázdná tabulka → TS `not_found`. revoke public + grant service_role. _R6.1–6.4, Property 7 + 2._
- Migrace `0039_admin_match_payment.sql` (NEAPLIKOVÁNO) — plpgsql SECURITY DEFINER RPC `admin_match_payment(actor, payment_id)`. Pod zámkem řádku platby: guard `status=pending` (jinak rollback → platba zůstává pending, R8.4), `status=paid`, pak SPUSTÍ tentýž efekt jako webhook — znovupoužije `apply_subscription_transition` (migrace 0027; status=active, is_published=true, kotva 'clear') + prodlouží `current_period_end` o Jeden_Mesic (2 592 000 s = zrcadlo `JEDEN_MESIC_SECONDS`/`extendPeriod`); báze `coalesce(current_period_end, now())`. Audit `payment_match`/`payment` ve STEJNÉ transakci. Faktura se ZÁMĚRNĚ negeneruje (není součástí efektu dle R8.3). _R8.3/8.4/8.5, Property 2._
- `src/lib/admin/force-delete.ts` — TS wrapper `forceDeleteBusiness(supabase, {actorUserId, businessId, confirmed})`. Server-side guard na `confirmed` (R6.1) → `not_confirmed`. Výsledek `ok:true{businessId,subscriptionId}` / `ok:false{error:'not_confirmed'|'not_found'|'force_delete_failed'}`. Server-only, service-role.
- `src/lib/admin/payment-matcher.ts` — TS funkce `listPendingPayments` (R8.1) a `searchPendingPaymentsByVariableSymbol` (R8.2) — čtení `pending`+`qr_manual` s VS, částkou, podnikem (join `businesses(name)`), datem, řazeno desc; `matchPayment(supabase, {actorUserId, paymentId})` nad RPC 0039, výsledek `ok:true{paymentId,subscriptionId,businessId,currentPeriodEnd}` / `ok:false{error:'not_found'|'match_failed'}`. Server-only, service-role.

### Poznámky
- Reuse efektů: mazání tenant dat NEDUPLIKOVÁNO — RPC 0038 volá `delete_business_tenant_data` (0030). Prodloužení období NEDUPLIKOVÁNO jako nová doménová logika — RPC 0039 znovupoužívá `apply_subscription_transition` (0027) pro přechod automatu a zrcadlí konstantu Jeden_Mesic pro prodloužení, stejně jako webhook (`applyPaid`).
- Audit ve STEJNÉ transakci jako akce (UVNITŘ akční RPC přes `perform write_audit_log`) — Supabase JS klient neumí držet transakci přes více volání; buď uspěje akce i audit, nebo se obojí vrátí (Property 2).
- Drobná odchylka od webhooku: pro NULL `current_period_end` (první ruční platba) použita báze `now()` přes `coalesce`, aby ruční párování fungovalo i bez existujícího období; webhook tento případ neřeší (extendPeriod by hodil NaN). Pro běžný obnovovací (non-null) případ je chování shodné.
- Migrace 0038/0039 jen NAPSÁNY, NEAPLIKOVÁNY (dle zadání; navazují 0038→0039). Aplikovat až s navazujícími tasky. `*` testy (12.2, 15.3), stránky (15.2) a UI napojení (17.1) mimo rozsah této dávky.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK.

## 2026-06-16 — admin-dashboard (admin akce nad předplatným: override, pozastavení, free trial/comp)

### Hotové tasky
- 10.1 Override předplatného + audit (`src/lib/admin/subscription-override.ts`, migrace `0036`) — ověřeno (lint/test/build)
- 10.2 Pozastavení podniku + audit (`src/lib/admin/subscription-override.ts`, migrace `0036`) — ověřeno (lint/test/build)
- 11.1 Udělení Free_Trial a Comp_Ucet (atomicky) + audit (`src/lib/admin/grants.ts`, migrace `0037`) — ověřeno (lint/test/build)

### Nové funkce
- Migrace `0036_admin_subscription_override.sql` (NEAPLIKOVÁNO) — dvě plpgsql SECURITY DEFINER RPC. `admin_override_subscription(actor, subscription_id, plan, status, current_period_end)`: přímý override (vědomě obchází stavový automat), zachytí before/after pod `for update` a ve STEJNÉ transakci volá `write_audit_log` (action `subscription_override`, target `subscription`). `admin_suspend_business(actor, business_id)`: `is_published=false` + audit `suspend_business`/`business` ve stejné transakci. Obě vrací prázdnou tabulku → TS `not_found`. revoke public + grant service_role. _R5.1/5.2/5.5/5.7, Property 2._
- Migrace `0037_admin_grants.sql` (NEAPLIKOVÁNO) — dvě plpgsql SECURITY DEFINER RPC, all-or-nothing v jedné transakci pod zámkem `subscriptions`. `admin_grant_free_trial(actor, subscription_id, trial_end)`: `status=active` + `current_period_end=trial_end` + `businesses.is_published=true` + audit `grant_free_trial`. `admin_grant_comp(actor, subscription_id)`: `status=active` + `is_published=true` (current_period_end ani auto_renew se NEmění — comp je trvalý účet, žádný recurring schedule se nezakládá) + audit `grant_comp`. Audit ve stejné transakci přes `write_audit_log`. _R5.3/5.4/5.6/5.7, Property 6 + 2._
- `src/lib/admin/subscription-override.ts` — TS wrappery `overrideSubscription(supabase, input)` a `suspendBusiness(supabase, {actorUserId, businessId})` nad RPC z migrace 0036. Discriminated výsledek `ok:true{...}` / `ok:false{error:'not_found'|'override_failed'|'suspend_failed'}`. Datumy přes `toIso` (null-safe). Server-only, service-role, actor předává volající z auth kontextu.
- `src/lib/admin/grants.ts` — TS wrappery `grantFreeTrial(supabase, input)` a `grantComp(supabase, input)` nad RPC z migrace 0037. Sdílený `mapGrantResult`; výsledek `ok:true{subscriptionId,businessId,status,currentPeriodEnd}` / `ok:false{error:'not_found'|'grant_failed'}`. Server-only, service-role.

### Poznámky
- Audit ve STEJNÉ transakci jako akce: zápis auditu žije UVNITŘ akční RPC (`perform write_audit_log(...)`), ne v TS — Supabase JS klient neumí držet transakci přes více volání. Tím buď uspěje akce i audit, nebo se obojí vrátí (Property 2 — právě jeden záznam na úspěšnou akci). Reuse existující funkce `write_audit_log` (migrace 0035) a `AuditActionType` z `audit-logger.ts` (bez TS změn).
- Comp záměrně mění jen `status` + `is_published` (dle akceptačního kritéria R5.4); `current_period_end`/`auto_renew` se nedotýká — surgical, žádné chování navíc.
- Migrace 0036/0037 jen NAPSÁNY, NEAPLIKOVÁNY (dle zadání). Aplikovat až s navazujícími tasky. `*` testy (10.3, 11.2, 11.3) a UI napojení (17.1) mimo rozsah této dávky.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK.

## 2026-06-16 — admin-dashboard (čtecí plochy vlny 2: audit viewer + seznam podniků + detail)

### Hotové tasky
- 6.1 AuditLogViewer (`src/lib/admin/audit-viewer.ts`) — ověřeno (lint/test/build)
- 7.2 Stránka seznamu podniků (`src/app/admin/businesses/page.tsx`) — ověřeno (lint/test/build)
- 8.1 Detail podniku — `getBusinessDetail` v `src/lib/admin/business-manager.ts` — ověřeno (lint/test/build)

### Nové funkce
- `src/lib/admin/audit-viewer.ts` — `listAuditLog(supabase, filters?)`: read-only čtení `audit_log` seřazené sestupně dle `created_at` (R10.1, využívá index `audit_log_created_at_idx`). Filtry v DB: `actionType` (R10.2), `targetType`/`targetId` (R10.4), `createdFrom`/`createdTo` rozsah včetně hranic (R10.3). Typy `AuditLogRecord`, `AuditLogFilters`; znovupoužívá `AuditActionType`/`AuditTargetType` z `audit-logger.ts`. Žádná zápisová/mazací operace — čistě čtecí vrstva (append-only navíc vynucen na DB úrovni). Server-only, service-role.
- `src/app/admin/businesses/page.tsx` — SSR seznam podniků na `app/admin/businesses` napojený na `listBusinesses`. GET formulář s filtry: vyhledávání `q`, stav `stav`, registrace `od`/`do` (datumové hranice mapovány na celý den `T00:00:00`/`T23:59:59`). Tabulka s názvem (Link na `/admin/businesses/[id]`), slugem, vlastníkem, stavem, tarifem, datem registrace. Prázdný stav → česká hláška přes `Notice` (R3.5). `export const dynamic = 'force-dynamic'`, `createAdminClient`, čeština, design tokeny. _Req 3.1–3.5._
- `src/lib/admin/business-manager.ts` — `getBusinessDetail(supabase, id)`: vrací profil podniku + vlastníka (e-mail, datum registrace), aktuální stav/tarif/`current_period_end`, historii plateb (částka, stav, metoda, VS, datum) seřazenou v paměti sestupně, a celkový počet rezervací (samostatný head count). Vrací `null` pro neexistující podnik. Nové typy `AdminBusinessDetail`, `AdminPaymentHistoryItem`, `PaymentStatus`, `PaymentMethod`. _Req 4.1–4.4._

### Poznámky
- TypeScript: `data` z `.select(embedded).maybeSingle()` má v PostgREST typové inferenci union s `GenericStringError`, proto je nutný cast přes `unknown` (`data as unknown as RawBusinessDetailRow`) — jinak `next build` selže na type erroru.
- `*` testy (6.3/7.3/8.3) dle zadání nepsány. Stránka detailu `/admin/businesses/[id]` (task 8.2) mimo rozsah této dávky — `getBusinessDetail` zatím bez UI konzumenta. Stránka `/admin/audit` (6.2) také mimo rozsah.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK (routy `/admin`, `/admin/businesses` dynamic).

## 2026-06-16 — admin-dashboard (čtecí část vlny 1: přehledová stránka + seznam podniků)

### Hotové tasky
- 5.2 Přehledová stránka `/admin` (`src/app/admin/page.tsx`) — ověřeno (lint/test/build)
- 7.1 Seznam podniků s filtry (`src/lib/admin/business-manager.ts`) — ověřeno (lint/test/build)

### Nové funkce
- `src/app/admin/page.tsx` — SSR přehledová stránka admin dashboardu na cestě `app/admin/*` (NE route group `(dashboard)`). Volba období přes `searchParams` (`?obdobi=` z množiny `7d`/`30d`/`90d`/`rok`/`vse`, default `30d`); `periodToRange` mapuje volbu na hranice (od–do), `to` vždy „teď". Čte cross-tenant data přes `createAdminClient` (service-role, server-side) a renderuje metriky z `computeAdminOverviewStats`: nové registrace, aktivní předplatná, churn, tržby (CZK) a rozpad podniků dle stavu (`free`/`active`/`grace_period`/`expired`). `export const dynamic = 'force-dynamic'`. Design: Action Violet aktivní volba období, Card 26px, čeština. _Req 2.1–2.6._
- `src/lib/admin/business-manager.ts` — `listBusinesses(supabase, filters)`: načte podniky s vloženými relacemi `users(email)` + `subscriptions(status, plan)`, normalizuje a filtruje v paměti přes čisté funkce `matchesBusinessFilters` / `applyBusinessFilters` (Simplicity First, ~200 podniků — žádné křehké PostgREST filtrování přes embedded resources). Filtry: stav předplatného (R3.2), rozsah data registrace včetně obou hranic (R3.3), fulltext nad e-mailem vlastníka/názvem/slugem (R3.4); prázdný výsledek → prázdný seznam (R3.5, hlášku zobrazuje až stránka). Řazení dle `created_at` sestupně. Server-only, service-role. _Req 3.1–3.5._

### Poznámky
- **Soubory už existovaly** (vytvořené v rámci vlny 1) a plně implementovaly tasky 5.2 i 7.1 — neduplikováno, pouze ověřeno (diagnostics čisté, lint/test/build green). `Card` podporuje `as="section"` (ověřeno v `components/ui/card.tsx`).
- Signatury `business-manager`: `listBusinesses(supabase: SupabaseClient, filters?: BusinessListFilters): Promise<AdminBusinessListItem[]>`; pomocné čisté funkce `matchesBusinessFilters(item, filters): boolean` a `applyBusinessFilters(items, filters): AdminBusinessListItem[]`. Typy `AdminBusinessListItem`, `BusinessListFilters`, `SubscriptionStatus`, `SubscriptionPlan`.
- `*` unit testy 5.3/5.4/7.3 dle zadání nepsány. Stránka `/admin/businesses` (task 7.2) mimo rozsah této dávky — `listBusinesses` zatím nemá UI konzumenta.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese), `pnpm build` OK (route `/admin` dynamic, build prošel bez nových chyb).

## 2026-06-16 — admin-dashboard (audit jádro vlny 1: append-only + AuditLogger)

### Hotové tasky
- 1.2 Append-only nad `audit_log` na úrovni DB — napsáno (NEAPLIKOVÁNO; aplikaci řeší orchestrátor)
- 3.1 AuditLogger (`lib/admin/audit-logger.ts` + RPC `write_audit_log`) — ověřeno (lint/test); migrace NEAPLIKOVÁNA

### Nové funkce
- `supabase/migrations/0034_audit_log_append_only.sql` — append-only vynucení nad `public.audit_log` ve dvou vrstvách: (1) `enable row level security` + jediná policy `audit_log_admin_select` (SELECT pro `current_user_is_admin()`) → žádná UPDATE/DELETE policy = zamítnuto pro authenticated; (2) `revoke all` z `public`/`anon`/`authenticated`/`service_role`, pak `grant select` authenticated a `grant insert, select` service_role. Klíčové: `service_role` OBCHÁZÍ RLS, proto se UPDATE/DELETE musí brát na úrovni grantů. INSERT/SELECT zůstávají funkční (ověřeno návrhově — service_role má `insert, select`). _Req 9.5, Property 3._
- `supabase/migrations/0035_write_audit_log.sql` — SECURITY DEFINER funkce `write_audit_log(actor, action_type, target_type, target_id, before jsonb, after jsonb) returns uuid`, dělá výhradně 1× INSERT, fail-fast na chybějící action_type/target_type. Běží jako vlastník → vkládá i po append-only REVOKE. `revoke all from public` + `grant execute to service_role`. Toto je primitiv „stejné transakce": akční RPC (10/11/12/15) ji volají uvnitř své transakce.
- `src/lib/admin/audit-logger.ts` — TS AuditLogger: typy `AuditActionType` (10 hodnot dle R9.1) a `AuditTargetType`; `AuditLogEntry`; `captureSnapshot(capture, ctx)` = best-effort zachycení before/after (R9.4 — výjimka/`undefined` → `null`, akce nepadne, log přes `@/lib/log` bez next/headers); `writeAuditLog(supabase, entry)` volá RPC `write_audit_log`, vrací `id`, při chybě zápisu propaguje výjimku (audit a akce padají společně). Server-only.

### Poznámky
- **„Stejná transakce" řešení (volba (a) dle zadání):** JS klient neudrží transakci přes víc volání (lekce z 0021/0027/0030), proto je kanonická cesta SQL funkce `write_audit_log` volaná UVNITŘ akčních RPC → záznam ve stejné transakci jako akce, atomicky (Property 2). TS `writeAuditLog` je tenký wrapper pro akce s jediným atomickým příkazem (samostatná RPC = vlastní atomická transakce).
- **Best-effort before/after:** odděleno od zápisu auditu — `captureSnapshot` selže měkce (→ `null`), `writeAuditLog` selže tvrdě (→ výjimka). Selhání zachycení kontextu tedy nezvrátí akci (R9.4), selhání zápisu auditu ano.
- Reuse: `current_user_is_admin()` (0007) v SELECT policy; vzor SECURITY DEFINER + revoke/grant z 0027/0030. Žádná duplikace; `audit_log` v `src/` nebyl dosud nikde referencován.
- **Migrace NEAPLIKOVÁNY** (dle zadání) — aplikovat 0034 a 0035 musí orchestrátor/operátor (navazují na 0033).
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese). `*` testy 3.2/3.3/3.4 dle zadání nepsány. SQL migrace neaplikovány → DB-level append-only a same-transaction chování zatím neověřeno za běhu (ověří integrační testy 19.2 / property 3.3 po aplikaci).

## 2026-06-16 — admin-dashboard (logická část vlny 0: Access_Guard, StatsAggregator, InvoiceResender)

### Hotové tasky
- 2.1 Access_Guard (`lib/admin/access-guard.ts` + rozšíření `middleware.ts`) — ověřeno (lint/test/build)
- 5.1 StatsAggregator (`lib/admin/stats.ts`) — ověřeno (lint/test/build)
- 16.1 InvoiceResender (`lib/admin/invoice-resender.ts`) — ověřeno (lint/test/build)

### Nové funkce
- `src/lib/admin/access-guard.ts` — čistá rozhodovací logika `decideAdminGuard({isAuthenticated, isAdmin})` → `allow` | `redirect-login` | `forbidden` (+ `isAdminPath`, `ADMIN_FORBIDDEN_MESSAGE`). Bez závislostí na Next/Supabase/HTTP → testovatelné izolovaně (Property 1). Tři výsledky se vzájemně vylučují (R1.1–R1.3).
- `src/middleware.ts` — chirurgicky rozšířen o `/admin/*`. Do `config.matcher` přidán `'/admin/:path*'`. Po výpočtu `guardState` (a `!guardState` checku) vložena **samostatná větev** `if (isAdminPath(pathname))` s early-return: admin → `nextWithSessionState`; autentizovaný ne-admin → `new NextResponse(message, {status:403})` přes `copySessionState`; neautentizovaný je odbaven už existujícím `!user` redirectem na `/login` výše. Větev se vrací dřív než dpa/`decideFreeUserGuard` logika → chování `/dashboard` a `/onboarding` beze změny.
- `src/lib/admin/stats.ts` — `computeAdminOverviewStats(supabase, period)`: nové registrace (`users.created_at` v období), aktivní předplatná (`status=active`), Churn, rozpad podniků dle stavu (partition), tržby (suma `amount_czk` `paid` v období). Čisté pomocné funkce `sumPaidRevenueCzk`, `partitionByStatus` (testovatelnost Property 5). Service-role, server-only.
- `src/lib/admin/invoice-resender.ts` — `resendLatestInvoice(supabase, businessId)`: ověří ≥1 `paid` platbu s `invoice_url`, vybere nejnovější, vytvoří podepsanou URL přes `createInvoiceSignedUrl` (pokud `invoice_url` není absolutní URL), odešle přes `sendEmail` + šablonu `renderSubscriptionInvoiceEmail`, best-effort logování přes `describeResendError`/`serverLog` (bez PII). Bez faktury → `no_invoice` + česká hláška. NEAUDITUJE se (mimo R9).

### Poznámky
- **Churn proxy:** bez dedikované tabulky přechodů se používá `updated_at` předplatných aktuálně ve stavu `expired`/`deleted_data` v období — nejbližší dostupný signál okamžiku přechodu (Simplicity First, zdokumentováno v kódu). Property 5 (5.3) Churn nepokrývá.
- Reuse: `renderSubscriptionInvoiceEmail` (dosud nepoužitá šablona), `createInvoiceSignedUrl`, `sendEmail`, `describeResendError`. Žádná duplikace.
- Ověřeno: `pnpm lint` čistý, `pnpm test:run` 324 passed / 18 skipped (beze změny, žádná regrese — testy `*` tasků 2.3/5.3/5.4/16.2 dle zadání nepsány), `pnpm build` OK (middleware 91 kB; žádná nová `/dashboard` chyba). Stránky `/admin/*` zatím neexistují (tasky vlny 1+).

## 2026-06-16 — admin-dashboard (migrace vlny 0: data + RLS ověření)

### Hotové tasky
- 1.1 Migrace tabulky `audit_log` — napsáno (NEAPLIKOVÁNO; aplikaci řeší orchestrátor)
- 1.3 Migrace sloupce `coupons.is_active` — napsáno (NEAPLIKOVÁNO)
- 2.2 Ověření / rozšíření RLS admin override — napsáno (NEAPLIKOVÁNO)

### Nové funkce
- `supabase/migrations/0031_create_audit_log.sql` — nová append-only tabulka `audit_log` (id, actor_user_id FK→users s `on delete set null`, action_type, target_type, target_id, before/after jsonb nullable, created_at). Indexy: `created_at desc` (R10.1) a `target_id` (R10.4). Append-only enforcement je ZÁMĚRNĚ vynecháno — patří do samostatného tasku 1.2.
- `supabase/migrations/0032_coupons_is_active.sql` — `coupons.is_active boolean not null default true` pro deaktivaci kupónu (R7.6) bez mazání záznamu.
- `supabase/migrations/0033_rls_admin_override.sql` — VERIFIKAČNÍ migrace. Admin override pro `businesses`/`subscriptions`/`payments` je již plně pokryt `tenant_isolation` policies (0007, `or current_user_is_admin()`); `users`/`coupons` policy `admin_full_access` (0009). Migrace nic neduplikuje — idempotentní `do $$` blok ověří pokrytí přes `pg_policies` a doplní `admin_read_override` SELECT policy jen kdyby chyběla (dnes no-op).

### Poznámky
- Styl migrací zkopírován z existujících (lowercase SQL, `public.` prefix, české komentáře, `-- Migrace NNNN:` hlavička, `_Requirements:` traceabilita). Sekvenční čísla 0031–0033 navazují na 0030.
- Migrace NEBYLY aplikovány (žádný `supabase db push`) — dle zadání řeší orchestrátor s dry-run + potvrzením. SQL tudíž neběželo, jen statická kontrola (žádné diagnostiky).
- `CREATE POLICY IF NOT EXISTS` Postgres nepodporuje → idempotence v 0033 řešena `do $$` blokem nad `pg_policies` + `execute format(...)`.

## 2026-06-15 — subscription-payments (volitelné PBT s mockovanou DB)

### Hotové tasky
- 7.4 Property test slevy kupónu (Property 7) — ověřeno (lint/test)
- 9.4 Property test idempotence webhooku (Property 2) — ověřeno (lint/test)
- 12.3 Property test úplnosti mazání dat (Property 8) — ověřeno (lint/test)
- Výsledek: 324 passed / 18 skipped (baseline 318 → +6 nových PBT, žádná regrese), lint čistý.

### Nové funkce
- `tests/properties/coupon-discount.spec.ts` (Property 7) — čistá funkce `computeChargedAmountCzk`: generátor varíruje tarif (199/299/599) a typ/velikost slevy vč. hranic 0 %/100 % a fixed ≥ cena; nezávislý oracle ověří částku vždy ≥ 0 a korektní výpočet (percent clamp, fixed floor, free_trial/comp → 0).
- `tests/properties/webhook-idempotence.spec.ts` (Property 2) — reálný `processGopayWebhook` nad in-memory Supabase modelem věrně zrcadlícím guarded flip (`update ... where status != cíl`). Transitions (`activateSubscription`/`transitionToGracePeriod`) a `generateAndStoreInvoice` mockované s počítadly volání; prodloužení období ověřeno observačně. 1× vs. 2× aplikace téže události → identický stav, efekty nejvýše jednou; neznámé `gopay_payment_id` → žádná změna.
- `tests/properties/data-deletion-completeness.spec.ts` (Property 8) — model kontraktu RPC `delete_business_tenant_data` (migrace 0030) nad in-memory storem (vzor `anonymization-completeness.spec.ts`). Generátor varíruje dataset cílového podniku (prázdný i bohatý); nezávislý oracle ověří smazání tenant dat, vyprázdněný profil (slug+type zachovány), zachování `users` + historie `subscriptions`/`payments`, status `deleted_data` a izolaci jiného podniku.

### Poznámky
- Umístění `tests/properties/*.spec.ts` dle konvence; mock Supabase ve stylu `_support/mutation-harness.ts` (builder s `eq`/`neq`/`select`/`maybeSingle`/thenable) a in-memory RPC modelu `anonymization-completeness.spec.ts`.
- Webhook test: idempotence stojí na guarded flipu — druhá aplikace narazí na `payment.status === cíl` a vrátí `noop` ještě před efekty, takže `extendPeriod`/faktura/přechod proběhnou nejvýše jednou. Model proto musí guarded flip zrcadlit přesně, jinak by se idempotence „rozbila" v modelu, ne v kódu.
- Iterace: coupon 200, webhook 150, deletion 150 (≥100). Žádná reálná DB.

## 2026-06-14 — subscription-payments (volitelné unit testy)

### Hotové tasky
- 7.2 Unit test validace kupónu (`validateCoupon`/`validateCouponByCode`) — ověřeno (lint/test)
- 8.2 Unit test mapování tarif → částka (`planPriceCzk`/`buildAutoChargePayment`) — ověřeno (lint/test)
- 9.2 Unit test HMAC ověření (`verifyHmac`) — ověřeno (lint/test)
- 10.3 Unit test billing (`chargeMonthly`) — ověřeno (lint/test)
- 12.5 Unit test warning predikátů (`warningKindFor`) — ověřeno (lint/test)
- 13.3 Unit test změny tarifu (`requestPlanChange`/`cancelPlanChange`/`applyPlanChange`) — ověřeno (lint/test)
- 14.2 Unit test auto-obnovy (`cancelAutoRenew`/`enableAutoRenew`) — ověřeno (lint/test)
- Výsledek: 318 passed / 18 skipped (baseline 261 → +57 nových unit testů, žádná regrese), lint čistý.

### Nové funkce
- `src/lib/coupons/__tests__/validate.test.ts` — neexistující/expirovaný/vyčerpaný kupón → správný `reason` + česká hláška; platný projde; fake Supabase pro `validateCouponByCode`.
- `src/lib/checkout/__tests__/pricing.test.ts` — ceník 199/299/599 Kč; `buildAutoChargePayment` → Payment `pending`/`auto_charge` se správnými poli.
- `src/lib/webhooks/__tests__/hmac.test.ts` — validní podpis → true; neplatný/jiná délka/jiné tajemství/pozměněný payload → false; prázdné tajemství vyhodí.
- `src/lib/billing/__tests__/charge.test.ts` — Payment `pending` vzniká PŘED charge; selhání iniciace (GoPay throw) → `payments.status=failed`, žádný zápis do `subscriptions` (status zůstává `active`) + admin notifikace. Mock Supabase/GoPay/sendEmail/serverLog/VS-source.
- `src/lib/warnings/__tests__/predicates.test.ts` — `warningKindFor` jen den 23 a den 83 od kotvy (vč. hranic jednodenního okna), jinak `null`; `null` kotva → `null`.
- `src/lib/subscription/__tests__/plan-change.test.ts` — pending bez změny `plan` (žádná prorace), aplikace na konci období, zrušení, not_active/not_found. Mock Supabase zachytává update payloady.
- `src/lib/subscription/__tests__/auto-renew.test.ts` — zrušení (`auto_renew=false`, bez změny `status`) i zapnutí (`auto_renew=true`), not_active/write_failed.

### Poznámky
- Umístění zvoleno `src/lib/**/__tests__/*.test.ts` vedle zdrojů (vzor `src/lib/reservations/__tests__/`), protože všechny testované moduly žijí v `src/lib/`.
- `chargeMonthly` se přímo nedotýká tabulky `subscriptions`; „status zůstává active" se proto v unit testu ověřuje absencí zápisu do `subscriptions` (status je řízen webhookem/cronem, ne touto funkcí).

## 2026-06-13 — subscription-payments (volitelné PBT nad čistými funkcemi)

### Hotové tasky
- 2.2 Property test stavového automatu (`computeState`) — ověřeno (lint/test)
- 2.5 Property test prodloužení období (`extendPeriod`) — ověřeno (lint/test)
- 3.2 Property test variabilního symbolu (`generateVariableSymbol`) — ověřeno (lint/test)
- 4.2 Property test SPAYD round-trip (`encodeSpayd`/`decodeSpayd`) — ověřeno (lint/test)
- 5.2 Property test číslování faktur (model RPC + `formatInvoiceNumber`) — ověřeno (lint/test)
- Výsledek: 261 passed / 18 skipped (baseline 250 → +11 nových property testů, žádná regrese), lint čistý.

### Nové funkce
- `tests/properties/subscription-state-machine.spec.ts` (Property 1) — generátor varíruje kotvu (vč. `null`) i `Δ` kolem hranic 30/90 dní (±1 s, přesná hodnota); ověřuje mapování `null⇒active`, `0≤Δ<30d⇒grace_period`, `30≤Δ<90d⇒expired`, `Δ≥90d⇒deleted_data` + determinismus. 300 iterací/property.
- `tests/properties/period-extension.spec.ts` (Property 6) — nový konec = vstup + 2 592 000 s pro libovolný čas, neměnnost vstupu, N-násobná aplikace. 200 iterací.
- `tests/properties/variable-symbol.spec.ts` (Property 3) — formát 1–10 číslic (hranice délky 1 a 10), injektivita, validace rozsahu. 200 iterací.
- `tests/properties/spayd-roundtrip.spec.ts` (Property 4) — round-trip IBAN (vč. `*`/`%`), částky (≤2 des. místa z haléřů), VS, měna CZK. 200 iterací.
- `tests/properties/invoice-numbering.spec.ts` (Property 5) — in-memory model kontraktu RPC `allocate_invoice_number` (jako `anonymization-completeness` modeluje RPC); prokládané přidělení přes roky → striktně rostoucí, unikátní, gap-free; reuse `formatInvoiceNumber`. 200 iterací.

### Pozn.
- Konvence dle existujících `tests/properties/*.spec.ts`: tag `Feature: subscription-payments, Property N` + `Validates: Requirements ...` v hlavičce; ≥100 iterací (zde 200–300). Testují reálné API z `src/lib/...`, žádné mocky doménových funkcí.
- `tasks.md` neupravován ručně (jen PBT status přes nástroj). Implementováno pouze 5 zadaných `*` PBT tasků.

## 2026-06-13 — subscription-payments (vlna 5: stránka předplatného / UI)

### Hotové tasky
- 16.1 Stránka `/dashboard/subscription` + server actions — ověřeno (lint/test/build)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý, `pnpm build` prošel celý — `/dashboard/subscription` jako ƒ dynamic (3.39 kB), žádná prerender chyba.

### Nové funkce
- `app/(dashboard)/dashboard/subscription/page.tsx` — server component. Auth (`getUser`, redirect `/login`), dohledání podniku majitele přes admin klient s explicitním filtrem `owner_user_id` (redirect `/onboarding/1` bez podniku), načtení předplatného (`plan,status,current_period_start/end,auto_renew,pending_plan_change`). Zobrazuje stav (CZ mapování `free/active/grace_period/expired/deleted_data`), tarif, období (`toPragueDisplay`, Europe/Prague). Styl reuse `Card`/`Badge`/`Notice`, vzor dle ostatních dashboard stránek.
- `app/(dashboard)/dashboard/subscription/SubscriptionManager.tsx` — client component. Větví podle stavu: `free` → výběr tarifu (radio start/pokrocily/max + ceny z `planPriceCzk`) + pole kupónu (validace) + „Pokračovat k platbě" (POST `/api/checkout`, redirect na GoPay nebo `router.refresh` u aktivace). `active` → přepínač auto-obnovy + žádost/zrušení změny tarifu (select cílového tarifu). `grace_period` → informativní notice + management bez akcí závislých na `active`. `expired/deleted_data` → informativní notice (middleware je na `/dashboard/*` stejně nepouští). Touch terče ≥44px, mobile-first.
- `app/(dashboard)/dashboard/subscription/actions.ts` — server actions (`'use server'`): `cancelAutoRenewAction`/`enableAutoRenewAction` (R11.1/11.4), `requestPlanChangeAction(targetPlan)`/`cancelPlanChangeAction` (R8.1/8.4), `validateCouponAction(code)` (R9.1/9.2). Každá přes `getSubscriptionContext()` ověří přihlášení + vlastnictví podniku (uživatelský klient pod RLS + explicitní `owner_user_id`, pak subscription dle `business_id`), teprve poté předá doménové funkci **service-role** klienta (`createAdminClient`). Chyby lib (`not_active`/`write_failed`) → CZ hlášky; `revalidatePath('/dashboard/subscription')` po úspěchu.

### Pozn.
- Ověření vlastnictví: business se čte pod uživatelským kontextem (RLS) s `.eq('owner_user_id', user.id)`; subscription dle nalezeného `business_id`. Žádný neautentizovaný ani cizí přístup. Service-role klient jen pro samotný doménový zápis (vzor dle `app/api/checkout/route.ts`).
- Reaktivace (`expired`/`deleted_data` → checkout, R6.6/6.9) NENÍ ve scope 16.1 (Req 1.1/8.1/8.4/9.1/11.1/11.4) a middleware tyto stavy na `/dashboard/*` fail-closed nepouští → UI pro ně jen informativní.
- Checkout/aplikace kupónu při platbě reuse existující POST `/api/checkout`; zde jen samostatná validace kupónu pro okamžitou zpětnou vazbu. Žádná nová dependency.
- Volitelné `*` testy (17.1, 17.2) neimplementovány dle zadání. `tasks.md` neupravován dle zadání.

## 2026-06-13 — subscription-payments (vlna 4: cron úlohy)

### Hotové tasky
- 12.1 Billing_Cron `/api/cron/billing/route.ts` — ověřeno (lint/test/build)
- 12.2 Cleanup_Cron `/api/cron/cleanup/route.ts` + migrace 0030 — ověřeno (lint/test/build)
- 12.4 Warning_Cron `/api/cron/warnings/route.ts` + `lib/warnings/predicates.ts` — ověřeno (lint/test/build)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý, `pnpm build` prošel celý (`/api/cron/billing`, `/api/cron/cleanup`, `/api/cron/warnings` jako ƒ dynamic; žádná `/dashboard` chyba).

### Nové funkce
- `cron/auth.ts` — `verifyCronAuthorization(request)`: ověří `Authorization: Bearer <CRON_SECRET>` proti env `CRON_SECRET` (R10.6). Konstantní-časové porovnání (`crypto.timingSafeEqual` + guard délky). Discriminated výsledek: `not_configured` (chybí env → route 500, fail-safe nic nespouštět) / `unauthorized` (chybí/nesedí → 401). Tajemství se neloguje.
- `cron/admin-notify.ts` — `notifyAdminCronFailure({job, stage, subscriptionId?, businessId?})`: best-effort admin notifikace per-business selhání (R10.6, continue-on-error). Čte `HOREA_ADMIN_EMAIL` (bez ní jen log). Jen neidentifikující ID, žádné PII; NIKDY nevyhodí výjimku.
- `warnings/predicates.ts` — čisté predikáty `warningKindFor(firstFailedChargeAt, now)`: vrací `grace_to_expired` (den 23 od kotvy, R6.10), `expired_to_deleted` (den 83, R6.11), jinak `null`. Jednodenní okno `[den N, den N+1)` → každé varování přesně jednou (1 běh cronu/den). Exporty `GRACE_TO_EXPIRED_WARNING_DAY=23`, `EXPIRED_TO_DELETED_WARNING_DAY=83` odvozené z `JEDEN_MESIC_SECONDS`.
- `app/api/cron/billing/route.ts` — GET/POST. Cron secret → načte `active`+`auto_renew=true`+dosažený `current_period_end` → `chargeMonthly` (reuse). Mapování výsledku: ok=iniciace OK (výsledek doručí webhook); `initiation_failed`=R2.5 ponech `active` (chargeMonthly už notifikoval); ostatní ok:false → `transitionToGracePeriod` (R10.2/R4.1), selhání přechodu → R10.3 log+admin; chybějící plan/schedule + neočekávané výjimky → continue-on-error. Vrací souhrn `{processed,charged,graced,kept,failed}`.
- `app/api/cron/cleanup/route.ts` — GET/POST. Cron secret → načte předplatná s kotvou ≥ 90 dní (`now − DELETED_DATA_SECONDS`) a `status != deleted_data` (idempotence) → pro každé volá RPC `delete_business_tenant_data` (migrace 0030). Continue-on-error. Souhrn `{processed,deleted,failed}`.
- `app/api/cron/warnings/route.ts` — GET/POST. Cron secret → načte `grace_period`/`expired` s kotvou + embedded `businesses(name, owner_user_id)` → předfiltr přes `warningKindFor` → batch dohledá e-maily majitelů z `public.users` (jeden `.in()` dotaz) → odešle přes `dispatchTransactionalEmail` + `renderSubscriptionWarningEmail` (reuse). Continue-on-error. Souhrn `{processed,due,sent,skipped,failed}`.

### Migrace (NAPSÁNA, NEAPLIKOVÁNA)
- `supabase/migrations/0030_delete_business_tenant_data.sql` — plpgsql SECURITY DEFINER `delete_business_tenant_data(p_business_id)`: v JEDNÉ transakci pod zámkem řádku `subscriptions` smaže rezervace/klienty/služby/otevírací doby, vyprázdní profil podniku (name='', description/logo_url NULL, unpublish, příznaky false) a nastaví `subscriptions.status='deleted_data'`. **Řádek `businesses` se NEMAŽE** — `subscriptions.business_id`/`payments.business_id` mají `on delete cascade`, smazání řádku by zničilo účetní historii (R6.8); proto zůstává jako prázdná schránka. Zachovává `users` + historii `subscriptions`/`payments`. `revoke from public` + `grant execute to service_role`.
- **APLIKOVAT:** `pnpm dlx supabase db push` (nebo `supabase migration up`) na cílovou DB. Čísla navazují (0029 → 0030). Bez aplikace cleanup cron vrátí per-business `delete_rpc_failed`.

### Pozn.
- `.env.example` rozšířen o `CRON_SECRET` (ochrana všech `/api/cron/*`; bez něj routy vrací 500, fail-safe). Nikdy se neloguje.
- **Cron secret** ověřen v každé route na začátku (`verifyCronAuthorization`) PŘED jakýmkoli DB/GoPay voláním. Vercel Cron je nakonfigurovaný ve `vercel.json` (task 12.7, hotovo).
- **Designová pozn. (billing grace):** declined charge běžně řeší webhook (Sekvence 3 → grace). Cron volá `transitionToGracePeriod` jen u synchronních ne-`initiation_failed` selhání iniciace; `initiation_failed` (GoPay down, R2.5) ponechává `active` pro retry — usmíření R2.5 vs R10.2/task textu „při selhání přechod do grace_period".
- **Cleanup profil:** `businesses` řádek nelze smazat kvůli FK historie → profilová pole se vyprázdní (R6.9 prázdný profil po reaktivaci). `slug`/`type` (NOT NULL) zůstávají.
- Volitelné `*` testy (12.3 property mazání dat, 12.5 unit warning predikátů, 12.6 integrační) neimplementovány dle zadání. `tasks.md` neupravován dle zadání.

## 2026-06-12 — subscription-payments (vlna 3: webhook handler + aplikace změny tarifu)

### Hotové tasky
- 9.3 Webhook handler `/api/webhooks/gopay` + `lib/webhooks/handler.ts` — ověřeno (lint/test/build)
- 13.2 Aplikace změny tarifu na konci období `lib/subscription/plan-change.ts` — ověřeno (lint/test/build)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý, `pnpm build` prošel celý (`/api/webhooks/gopay` jako ƒ dynamic; žádná `/dashboard` chyba).

### Nové funkce
- `webhooks/handler.ts` — `processGopayWebhook(supabase, {gopayPaymentId, state}, now?)`: idempotentní zpracování platebního webhooku (R3.3–R3.6). `mapGopayState`: `PAID`→`paid`, `CANCELED`/`CANCELLED`/`TIMEOUTED`→`failed`, ostatní→`null` (`ignored_state`). Dohledá Payment podle `gopay_payment_id` (neznámé → `unknown_payment`, route 200, R3.4). **Idempotence dvojí obranou (R3.5):** (1) kontrola `payment.status === target` PŘED aplikací → `noop` bez zápisu; (2) guarded flip `update status where id=? and neq status target` + `.maybeSingle()` — souběh serializuje zámek řádku, druhé doručení dostane prázdný výsledek → `noop`, takže doprovodné efekty běží jen jednou. Při `paid`: `activateSubscription` (status=active, vymaž kotvu, R3.6) → načtení `current_period_end`/`plan` → `extendPeriod` (+Jeden_Mesic, R1.5) → `generateAndStoreInvoice` (jen pokud `invoice_number === null`; selhání jen zaloguje, webhook zůstává úspěšný). Při `failed`: `transitionToGracePeriod` (kotva set_if_null, R4.1/4.3). Discriminated `WebhookResult` s `WebhookOutcome` kategoriemi.
- `app/api/webhooks/gopay/route.ts` — tenký POST adaptér. Načte tajemství `GOPAY_WEBHOOK_SECRET` z env (chybí → 500, zaloguje `webhook_secret_missing`). HMAC ověření surového těla přes `verifyHmac(rawBody, header 'x-gopay-signature', secret)` → neshoda 401 (R3.1/3.2), žádná změna. Normalizace payloadu (`id`|`gopay_payment_id` + `state`; malformed → 400). Doménová logika se service-role klientem (`createAdminClient()`). Neloguje PII/tajemství — jen kategorie/`state`.
- `subscription/plan-change.ts` — přidán `applyPlanChange(supabase, subscriptionId)` (R8.2): načte `pending_plan_change`; pokud je, nastaví `plan=cíl` + `pending_plan_change=NULL`, jinak `applied=false` beze změny. Bez prorace (R8.3) — charge čte aktuální `plan`. Idempotentní (druhé volání najde NULL). `ApplyPlanChangeResult` (`applied` rozlišuje, zda změna existovala). Volá se z billing cyklu při obnově období (task 12.1).

### Pozn.
- `.env.example` rozšířen o `GOPAY_WEBHOOK_SECRET` (HMAC tajemství webhooku; bez něj handler vrací 500). Nikdy se neloguje.
- **Idempotence faktury:** číslo se přiděluje jen jednou — guarded flip pustí na invoice gen jen jedno doručení, navíc se generuje jen při `invoice_number === null`. Selhání generování fakturu nezablokuje úspěch webhooku (vrací 200), aby GoPay re-delivery nezpůsobilo duplicitní alokaci čísla; admin řeší přes log `webhook_invoice_failed`.
- **Žádné nové migrace** — handler i `applyPlanChange` mění jen existující sloupce přes service-role klienta; transakční přechody automatu zajišťuje stávající RPC `apply_subscription_transition` (migrace 0027) reuse přes `transitions.ts`.
- **GoPay webhook payload** parsován jako JSON tělo s polem `id`/`gopay_payment_id` + `state` (dle design.md sekce *Webhook idempotence*); reálné GoPay se v této práci nevolá.
- Volitelné `*` testy (9.4 property idempotence, 9.5 integrační, 13.3 unit) neimplementovány dle zadání. `tasks.md` neupravován dle zadání.

## 2026-06-11 — subscription-payments (vlna 3: checkout + měsíční charge)

### Hotové tasky
- 8.3 Checkout server action `/api/checkout` + `lib/checkout/checkout.ts` — ověřeno (lint/test/build)
- 10.2 Měsíční charge `lib/billing/charge.ts` — ověřeno (lint/test/build)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý, `pnpm build` prošel celý (vč. `/api/checkout` jako ƒ dynamic).

### Nové funkce
- `payments/gopay/client.ts` — rozšířen o dvě metody (existující `getRecurrence` beze změny): `createPayment({amountCzk, variableSymbol, description, payerEmail?, returnUrl, notificationUrl, recurring})` → POST `/payments/payment` (s `recurrence: ON_DEMAND` při `recurring`), vrací `{paymentId, gatewayUrl}`; `chargeRecurrence({scheduleId, amountCzk, variableSymbol, description})` → POST `/payments/payment/{id}/create-recurrence`, vrací `{paymentId}`. Částka se převádí na haléře (×100). Reuse `getAccessToken`/`withTimeout`. Konstanta `RECURRENCE_DATE_TO='2099-12-31'`.
- `payments/variable-symbol-source.ts` — `nextVariableSymbol(supabase)`: server-only zdroj VS spojující RPC `next_payment_variable_symbol` (monotónní sekvence) s čistou `generateVariableSymbol`. Zaručeně unikátní VS (ne pravděpodobnostně). Reuse v checkout i charge.
- `checkout/checkout.ts` — `checkout(supabase, gopay, context, input)`: validace tarifu + kupónu; aktivační kupón (`free_trial_days`/`comp`) → přímá aktivace bez platby přes `applyActivationCoupon` + inkrement použití (R9.5/9.6); jinak Payment `pending`/`auto_charge` s VS PŘED GoPay → `createPayment(recurring:true)` → uložení `gopay_payment_id` → redirect URL (R1.1/1.2). Sleva přes `computeChargedAmountCzk`. Při selhání iniciace GoPay (R1.6) Payment označí `failed`, předplatné zůstává `free` (checkout se subscription stavu nedotýká), uživatel může zopakovat. Discriminated `CheckoutResult` (redirect/activated/chyba s českou hláškou).
- `app/api/checkout/route.ts` — tenký POST adaptér. **Autentizace:** `createClient()` (user kontext) + `auth.getUser()` → 401 bez přihlášení. **Autorizace:** dohledání `businesses` přes `owner_user_id = user.id` (+ RLS) → 403 bez podniku; dohledání `subscriptions` podniku → 409. Doménové zápisy předány `checkout` se **service-role** klientem (`createAdminClient()`) až po ověření vlastnictví. Return/notification URL z originu requestu (`origin` → `NEXT_PUBLIC_SITE_URL` → request origin). Vrací JSON (`{outcome:'redirect',redirectUrl}` / `{outcome:'activated'}` / `{error,message}`).
- `billing/charge.ts` — `chargeMonthly(supabase, gopay, context)`: VS → Payment `pending`/`auto_charge` PŘED GoPay (R2.4) → `chargeRecurrence` → uložení `gopay_payment_id`. Při selhání iniciace (R2.5): Payment `failed`, log, `notifyAdminChargeInitiationFailed` (best-effort e-mail na `HOREA_ADMIN_EMAIL`, bez PII), stav zůstává `active` (funkce se subscription nedotýká; výsledek doručí webhook). Discriminated `MonthlyChargeResult`.

### Nové migrace
- `0029_payment_variable_symbol_seq.sql` — `create sequence public.payment_variable_symbol_seq` (start 1, maxvalue 9999999999 = 10 číslic, no cycle) + RPC `public.next_payment_variable_symbol()` (security definer, `nextval`, grant jen `service_role`). Důvod: monotónní, souběhu-bezpečný zdroj VS → zaručená unikátnost napříč `payments` (design *Variabilní symbol*, Property 3). Nutná infra pro checkout/charge (vytvoření Payment vyžaduje unikátní VS).

### Pozn.
- `.env.example` rozšířen o `HOREA_ADMIN_EMAIL` (provozní notifikace; bez něj se notifikace přeskočí + zaloguje).
- **Autentizace checkoutu:** žádný neautentizovaný přístup — user kontext ověří přihlášení i vlastnictví podniku, teprve pak se použije service-role klient pro DB zápisy.
- Edge case: slevový kupón snižující částku na 0 Kč není zvlášť ošetřen (aktivace bez platby je vyhrazena `free_trial`/`comp`); akceptační kritéria R9.3/9.4 řeší jen floor 0. Mimo rozsah.
- **Reálné GoPay se v testech nevolá** (klient injektovatelný); skutečné platby/charge a webhook výsledek (paid/failed → prodloužení období / grace) jsou mimo tuto práci (tasky 9.3/12.1).
- Volitelné `*` testy (8.2, 10.3) neimplementovány dle zadání. `tasks.md` neupravován dle zadání.

## 2026-06-10 — subscription-payments (vlna 2: integrace — faktura PDF, recurring schedule, e-mailové šablony)

### Hotové tasky
- 5.3 PDF faktury + uložení do Storage (`src/lib/invoices/invoice-generator.ts`) — ověřeno (lint/test)
- 10.1 Založení GoPay recurring schedule (`src/lib/billing/schedule.ts`) — ověřeno (lint/test)
- 15.1 České e-mailové šablony (faktura, QR fallback, varování) — ověřeno (lint/test)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý

### Nové funkce
- `payments/gopay/client.ts` — tenký server-only GoPay wrapper: `loadGopayConfig()` (env GOPAY_GOID/CLIENT_ID/CLIENT_SECRET/API_BASE_URL, secrets se neloggují), `createGopayClient(config?, {fetch,timeoutMs})` s injektovatelným `fetch` (mockování) a 10s AbortController timeoutem. Metoda `getRecurrence(parentPaymentId)`: OAuth2 client_credentials token → GET `/payments/payment/{id}` → `{ scheduleId, active }` (recurrence_state REQUESTED/STARTED = aktivní). On-demand model: schedule je kotven na rodičovské platbě.
- `billing/schedule.ts` — `establishRecurringSchedule(supabase, gopay, {subscriptionId, parentPaymentId})`: ověří aktivní recurrence přes GoPay klienta a uloží `gopay_schedule_id` do `subscriptions` (R2.1). Discriminated výsledek (not_recurring/gopay_failed/write_failed/not_found).
- `invoices/invoice-generator.ts` — `generateAndStoreInvoice(supabase, input)`: přidělí číslo (`allocateInvoiceNumber`), vykreslí PDF (`pdf-lib`, čistá `buildInvoicePdf`), uploadne do privátního bucketu (`SUPABASE_INVOICES_BUCKET`, default `invoices`) na `YYYY/<číslo>.pdf`, zapíše `invoice_number` + `invoice_url` (= cesta objektu) k platbě (R7.1/7.5/7.6). `createInvoiceSignedUrl` (podepsaná URL, default 1h) pro e-mail/stažení. `toPdfSafe` transliteruje diakritiku na ASCII (Helvetica/WinAnsi nepokrývá č/ř/ž/ě/ů).
- E-mailové šablony v `src/lib/email/templates/` (konvence: 1 soubor/šablona, `render*Email` → `{subject,html,text}`, reuse `wrapEmail` z `base.ts`):
  - `subscription-invoice.ts` `renderSubscriptionInvoiceEmail` — faktura + odkaz na PDF (R7.7).
  - `subscription-qr-fallback.ts` `renderSubscriptionQrFallbackEmail` (async) — reuse `generateSpaydQrDataUrl` ze `spayd.ts`, QR jako `data:` URL + textové bankovní údaje (IBAN/částka/CZK/VS) jako fallback (R4.6).
  - `subscription-warning.ts` `renderSubscriptionWarningEmail` — `grace_to_expired` (den 23, R6.10) a `expired_to_deleted` (den 83, R6.11).

### Nové dependency
- `pdf-lib@1.17.1` (pinned, oficiální npm registry, čistý JS bez nativních závislostí) — generování PDF faktur.

### Pozn.
- `.env.example` rozšířen o `GOPAY_API_BASE_URL`, `HOREA_PLATFORM_IBAN`, `SUPABASE_INVOICES_BUCKET`.
- Nové moduly zatím nejsou napojené na route (wiring je v tascích 8.3/9.3/12.x/16.1) — GoPay/Storage se v testech reálně nevolá.
- `invoice_url` drží **cestu objektu** (ne expirovatelnou URL); odkaz se generuje on-demand podepsanou URL.
- `pnpm build` selhává v tomto prostředí na prerenderu `/dashboard*` (webpack runtime „Cannot read properties of undefined") i BEZ mých změn (ověřeno stashem) — pre-existující, souvisí s Node v25 vs požadovaný 20.x. TS compile + type-check ve `next build` prošly. Mé moduly nejsou v build grafu žádné route.
- Volitelné `*` testy (5.4, 5.5, 10.3) neimplementovány dle zadání. tasks.md neupravován dle zadání.

## 2026-06-10 — subscription-payments (vlna 2: kupóny/aktivace, změna tarifu, auto-obnova)

### Hotové tasky
- 7.3 Aplikace slevy a aktivačních kupónů (`src/lib/coupons/apply.ts`) — ověřeno (lint/test)
- 13.1 Žádost o změnu tarifu a její zrušení (`src/lib/subscription/plan-change.ts`) — ověřeno (lint/test)
- 14.1 Přepínání `auto_renew` (`src/lib/subscription/auto-renew.ts`) — ověřeno (lint/test)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý

### Nové funkce
- `coupons/apply.ts` — odděluje čistý výpočet účtované částky od DB efektů aktivace. `computeChargedAmountCzk(plan, coupon)`: percent (clamp 0–100, round na celé Kč), fixed (floor 0 Kč), free_trial/comp → 0; výsledek vždy ≥ 0 (Property 7). `couponEffectKind` (discount vs activation), `freeTrialPeriodEnd(now, days)` (čistá, now + dny). `applyActivationCoupon`: free_trial nastaví `current_period_end` (pořadí období→aktivace = neškodný mezistav) a aktivuje přes `activateSubscription`; comp jen aktivuje (bez období, bez recurring schedule). Slevové kupóny → throw (fail-fast).
- `subscription/plan-change.ts` — `requestPlanChange` (set `pending_plan_change` bez změny `plan`, bez prorace, R8.1/8.3), `cancelPlanChange` (set NULL, idempotentní, R8.4). Jediný řádek `subscriptions`, filtr `status='active'`, bez RPC.
- `subscription/auto-renew.ts` — `cancelAutoRenew` (`auto_renew=false`, status zůstává `active`, profil publikovaný — is_published se nemění), `enableAutoRenew` (`auto_renew=true`), oba filtr `status='active'`. `expireCanceledSubscription` = tenký wrapper nad `expireForCanceledAutoRenew` z transitions (konec období bez obnovy → `expired` + kotva = current_period_end, R11.3).

### Pozn.
- Žádné nové migrace nebylo třeba — existující sloupce (0024) a RPC `apply_subscription_transition` (0027) pokryly všechny tři tasky.
- free_trial aktivace dle zadání nastavuje pouze `current_period_end` (ne `current_period_start`); dvě zápisy (období + aktivace) v pořadí, které ponechá nanejvýš neaktivní předplatné s přednastaveným obdobím při selhání.
- Volitelné `*` testy (7.4, 13.3, 14.2) neimplementovány dle zadání.

## 2026-06-10 — subscription-payments (vlna 1: DB-touching — přechody, číslování faktur, kupóny)

### Hotové tasky
- 2.3 Aplikace přechodů stavového automatu (`src/lib/subscription/transitions.ts` + migrace `0027`) — ověřeno (lint/test)
- 5.1 Atomické přidělení čísla faktury (`src/lib/invoices/invoice-number.ts` + migrace `0028`) — ověřeno (lint/test)
- 7.1 Validace kupónu (`src/lib/coupons/validate.ts`) — ověřeno (lint/test)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý

### Nové funkce
- `transitions.ts` — tenký server-only orchestrátor přechodů: `activateSubscription` (clear kotvy), `transitionToGracePeriod` (set_if_null, nepřepíše existující kotvu — R4.3), `expireForCanceledAutoRenew` (set kotvy = current_period_end — R11.3), `materializeAnchoredState` (leave, status z `computeState`). Publikovanost odvozena `isPublishedForStatus` (active/grace→true, expired/deleted→false). Atomicita v RPC, ne v TS.
- migrace `0027_apply_subscription_transition.sql` — plpgsql SECURITY DEFINER funkce: pod zámkem řádku `subscriptions` (`SELECT … FOR UPDATE`) perzistuje v jedné transakci `status` + kotvu `first_failed_charge_at` (akce set_if_null/set/clear/leave) + `businesses.is_published`. Zámek dashboardu odvozen ze `status` (free-user-guard), ne samostatný sloupec. revoke public / grant service_role.
- `invoice-number.ts` — `formatInvoiceNumber(year, seq)` → `YYYY-NNNN` (pad 4) + `allocateInvoiceNumber(supabase, year)` volající RPC; validace roku 2000–9999, mapování chyb na `invalid_year`/`allocation_failed`.
- migrace `0028_allocate_invoice_number.sql` — plpgsql SECURITY DEFINER `allocate_invoice_number(p_year int) returns int`: upsert řádku roku (`on conflict do nothing`), zámek řádku (`FOR UPDATE`), inkrement `last_number` o 1. Striktně rostoucí, unikátní, gap-free v rámci roku (Property 5). revoke public / grant service_role.
- `validate.ts` — oddělená čistá `validateCoupon(coupon, now)` (not_found/expired/exhausted, české hlášky `COUPON_ERROR_MESSAGES`) od DB I/O (`loadCouponByCode`, `validateCouponByCode`); `incrementCouponUsage` s optimistickým zámkem (`eq('used_count', …)`) + fallback na DB check constraint `coupons_used_count_within_max` (errcode 23514 → exhausted).

### Pozn.
- Všechny tři produkční soubory i obě migrace (`0027`, `0028`) existovaly z dřívějšího běhu v korektní a se specem/DB schématem konzistentní podobě; tato iterace je ověřila (návaznost čísel na 0026, enum `subscription_status`/`coupon_type`, sloupce `coupons`, constraint `coupons_used_count_within_max`, `subscriptions.updated_at`) — beze změn kódu.
- Migrace `0027` a `0028` **NEBYLY aplikovány** (jen napsány) — aplikovat v pořadí po 0026.
- Volitelné `*` testy (5.2, 7.2) neimplementovány dle zadání.

## 2026-06-10 — subscription-payments (vlna 1: čisté funkce — období, pricing, HMAC)

### Hotové tasky
- 2.4 `extendPeriod` (`src/lib/subscription/period.ts`) — ověřeno (lint/test)
- 8.1 Pricing tarif→částka + `buildAutoChargePayment` (`src/lib/checkout/pricing.ts`) — ověřeno (lint/test)
- 9.1 `verifyHmac` (`src/lib/webhooks/hmac.ts`) — ověřeno (lint/test)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý

### Nové funkce
- `period.ts` — čistá `extendPeriod(Date|string): Date` posunující konec období přesně o Jeden_Mesic; reuse `JEDEN_MESIC_SECONDS` ze `state-machine.ts` (bez duplicitní konstanty). Nemění vstup (Property 6).
- `pricing.ts` — `planPriceCzk` (jediný zdroj pravdy ceníku: `start`→199, `pokrocily`→299, `max`→599 CZK) + `buildAutoChargePayment` sestavující payload Payment řádku (`pending`/`auto_charge`, částka dle tarifu, variabilní symbol) k vložení; BEZ DB insertu (ten je v 8.3).
- `hmac.ts` — `verifyHmac(payload, signature, secret): boolean` přes HMAC-SHA256 a `crypto.timingSafeEqual` (konstantní čas, rozdílná délka → false); tajemství parametrem (čte volající z env), neloguje se, server-only.

### Pozn.
- Všechny tři produkční soubory existovaly z dřívějšího běhu v korektní podobě; tato iterace je ověřila proti specu (design: Checkout, Webhook idempotence/HMAC, Stavový automat) a baseline testů — beze změn kódu. Volitelné `*` testy (2.5, 8.2, 9.2) neimplementovány dle zadání.

## 2026-06-10 — subscription-payments (vlna 0: čisté doménové funkce + cron config)

### Hotové tasky
- 2.1 `computeState(first_failed_charge_at, now)` (`src/lib/subscription/state-machine.ts`) — ověřeno (lint/test)
- 3.1 `generateVariableSymbol(sequence)` (`src/lib/payments/variable-symbol.ts`) — ověřeno (lint/test)
- 4.1 `encodeSpayd` + QR (`src/lib/payments/spayd.ts`) — ověřeno (lint/test)
- 12.7 Vercel Cron config (`vercel.json`) — ověřeno (lint/test)
- Výsledek: 250 passed / 18 skipped (beze změny baseline, žádná regrese), lint čistý

### Nové funkce
- `state-machine.ts` — čistá funkce `computeState` mapující kotvu `first_failed_charge_at` a `now` na stav (`active`/`grace_period`/`expired`/`deleted_data`); konstanty `JEDEN_MESIC_SECONDS = 2 592 000`, hranice 30 d a 90 d v sekundách. Determinismus pro anchored timeouty (Property 1).
- `variable-symbol.ts` — `generateVariableSymbol(sequence)`: monotónní sekvence → dekadický VS 1–10 číslic (injektivní, unikátnost zaručená ne pravděpodobnostní); validace rozsahu (Property 3).
- `spayd.ts` — čistá `encodeSpayd`/`decodeSpayd` (SPAYD 1.0, pole `ACC`/`AM`/`CC=CZK`/`X-VS`, escapování `*` a `%`, částka na 2 des. místa) oddělená od `generateSpaydQrDataUrl` (QR PNG data URL). Round-trip bezpečné (Property 4).
- `vercel.json` — denní cron triggery: `/api/cron/billing` (03:00), `/api/cron/warnings` (03:30), `/api/cron/cleanup` (04:00).

### Pozn.
- Dependency `qrcode@1.5.4` (+ `@types/qrcode@1.5.5`) už byla v `package.json` z dřívějška — nepřidávána. `vercel.json` se neúčastní `next build` (deploy config), build proto nebyl spouštěn.
- Produkční soubory existovaly z dřívějšího běhu vlny 0 v korektní podobě; tato iterace je ověřila proti specu (design: stavový automat, variabilní symbol, SPAYD, cron) — beze změn kódu.

## 2026-06-10 — subscription-payments (vlna 0: migrace datové vrstvy)

### Hotové tasky
- 1.1 Migrace `subscriptions` — sloupce životního cyklu (`0024_subscriptions_lifecycle_columns.sql`) — napsáno, NEAPLIKOVÁNO
- 1.2 Migrace `invoice_counter` (`0025_init_invoice_counter.sql`) — napsáno, NEAPLIKOVÁNO
- 1.3 Migrace `payments` — `invoice_number` + unique (`0026_payments_invoice_number.sql`) — napsáno, NEAPLIKOVÁNO

### Nové funkce
- `0024_subscriptions_lifecycle_columns.sql` — aditivně přidává do `public.subscriptions`: `auto_renew boolean not null default true`, `first_failed_charge_at timestamptz` (nullable, kotva stavového automatu), `pending_plan_change public.subscription_plan` (nullable, existující enum). Důvod: řízení auto-obnovy, anchored timeouty stavového automatu, odložená změna tarifu.
- `0025_init_invoice_counter.sql` — nová tabulka `public.invoice_counter` (`year integer primary key`, `last_number integer not null default 0`, check `>= 0`). Důvod: atomické per-rok číslování faktur pod `SELECT ... FOR UPDATE` (gap-free, monotónní).
- `0026_payments_invoice_number.sql` — přidává `public.payments.invoice_number text` (nullable) + unique constraint `payments_invoice_number_unique`. `variable_symbol` už unique z 0005 (neduplikováno). Pozn.: unique nad nullable sloupcem v Postgresu povoluje více NULL → pending/failed platby bez čísla nekolidují.

### Pozn. k aplikaci migrací
- Migrace byly POUZE napsány, NEBYLY aplikovány (žádné `supabase db push`). Aplikaci řeší orchestrátor s dry-run a potvrzením proti sdílené DB. SQL nebylo lokálně spuštěno.

## 2026-06-09 — reservation-management (volitelné PBT klienti/CSV/logy)

### Hotové tasky
- 10.5 PBT Property 4 — Client upsert determinism (`tests/properties/client-upsert-determinism.spec.ts`) — ověřeno (lint/test), ≥100 iterací
- 10.6 PBT Property 5 — Anonymization completeness (`tests/properties/anonymization-completeness.spec.ts`) — ověřeno, ≥100 iterací
- 11.2 PBT Property 6 — CSV escaping round-trip (`tests/properties/csv-escaping.spec.ts`) — ověřeno, ≥100 iterací
- 11.3 PBT Property 8 — Sensitive data not in logs (rozšířen `tests/properties/sensitive-data-logs.spec.ts`) — ověřeno, ≥100 iterací
- Výsledek: 250 passed / 18 skipped (předtím 241/18, +9 testů, žádná regrese), lint čistý

### Nové funkce
- `client-upsert-determinism.spec.ts` — PBT nad čistými funkcemi `matchClient`/`computeClientPatch`/`normalizePhone`: invariance normalizace telefonu (oddělovače + úvodní `+`), striktní pořadí telefon→e-mail→insert, case-insensitive e-mail, doplnění chybějícího kontaktu bez přepisu vyplněného.
- `anonymization-completeness.spec.ts` — PBT nad in-memory modelem věrně zrcadlícím RPC `anonymize_client` (migrace 0023): matchující rezervace ztratí PII, sloty zůstanou, nematchující beze změny, klient smazán, atomicky i při 0 matchujících. Oracle počítá očekávané matche nezávisle na modelu RPC (ne tautologie).
- `csv-escaping.spec.ts` — PBT round-trip nad exportovaným `encodeCsvField`; v testu malý RFC 4180 field parser (inverze) + cílený generátor „nebezpečných" znaků (čárka/uvozovka/`\n`/`\r`) i obecných řetězců.
- `sensitive-data-logs.spec.ts` rozšířen: původní blok public-business-page Property 6 ponechán beze změny; přidán describe blok `Feature: reservation-management, Property 8` pokrývající 10 mutací (approve/reject/cancel/edit/delete/manual-create/attendance/upsert/anonymize/CSV export) — pro každou se ověří, že žádný log neobsahuje client_name/phone/email/note jako podřetězec.

### Pozn. k PBT na hranici TypeScriptu
- Anonymizace a CSV běží přes RPC/DB; testy mockují Supabase + logger a verifikují TS orchestraci a kontrakt operace. Property 8 vynucuje, aby každá mutace zalogovala alespoň jednu událost (upsert se proto budí na chybové cestě) a injektuje výrazně odlišitelnou PII pro spolehlivý záchyt případného úniku.

## 2026-06-08 — reservation-management (volitelné PBT mutací)

### Hotové tasky
- 7.5 PBT Property 1 — Status transition validity (`tests/properties/status-transition-validity.spec.ts`) — ověřeno (lint/test), ≥100 iterací
- 9.4 PBT Property 2 — Edit atomicity (`tests/properties/edit-atomicity.spec.ts`) — ověřeno, ≥100 iterací
- 9.5 PBT Property 3 — Manual creation status (`tests/properties/manual-creation-status.spec.ts`) — ověřeno, ≥100 iterací
- 9.6 PBT Property 7 — Email best-effort (rozšířen `tests/properties/email-best-effort.spec.ts`) — ověřeno, ≥100 iterací
- Výsledek: 241 passed / 18 skipped (předtím 234/18, +7 testů, žádná regrese), lint čistý

### Nové funkce
- Sdílený mutační harness `tests/properties/_support/mutation-harness.ts` — fake `@/lib/supabase/server` klient se stavovou rezervací (věrně simuluje podmíněný status-guard UPDATE), fake admin klienty pro `Reservation_Editor` a `Manual_Reservation_Creator`, `fast-check` arbitrary pro stavy/docházku. Drží styl `reservation-harness.ts`.
- `email-best-effort.spec.ts` rozšířen: původní blok public-business-page Property 4 ponechán beze změny, přidán druhý describe blok `Feature: reservation-management, Property 7` pokrývající mutace approve/reject/cancel/edit (DB změna přetrvá pro `dispatchTransactionalEmail` → `{ ok: true | false }`).

### Pozn. k PBT na hranici TypeScriptu
- Property 1/2/3 testují ROZHODOVACÍ logiku akcí nad mock DB (ne reálnou DB atomicitu — tu kryjí integrační testy `*`). Property 2 modeluje exkluzi `excludeReservationId` přes mock `loadAvailableSlots` a ověřuje, že editor exkluzi vždy zapojí (vlastní slot nikdy nekoliduje sám se sebou). Property 3 ověřuje routování na approved-only RPC `create_manual_reservation` bez jakéhokoli `auto_approve` parametru (status nemůže na auto-approve záviset).

## 2026-06-07 — reservation-management (volitelné unit/příkladové/snapshot testy)

### Hotové tasky
- 6.5 Snapshot testy `Table_View` / `Calendar_View` (`tests/components/reservations-views.spec.tsx`) — ověřeno (lint/test)
- 6.6 Příkladové testy `Reservation_Detail_View` (`tests/components/reservation-detail.spec.tsx`) — ověřeno
- 7.6 Příkladový test časové brány docházky (`tests/unit/attendance-gate.spec.ts`) — ověřeno
- 9.7 Příkladový test `Reservation_Deleter` (`tests/unit/reservation-deleter.spec.ts`) — ověřeno
- 10.7 Příkladový test prázdného stavu `Client_Detail_View` (`tests/components/client-detail-empty.spec.tsx`) — ověřeno
- 11.4 Příkladový test CSV hlavičky a kódování (`tests/unit/csv-format.spec.ts`) — ověřeno
- Výsledek: 234 passed / 18 skipped (integrační testy bez lokálního Supabase), lint čistý

### Nové funkce
- Žádné nové runtime funkce — pouze testy. Drobná úprava: `vitest.config.ts` rozšířen `include` z `tests/properties/**/*.spec.{ts,tsx}` na `tests/**/*.spec.{ts,tsx}`, aby běžely nové `.spec` testy v `tests/components/` a `tests/unit/` (konvence názvů souborů z tasks.md).

### Pozn. k pokrytí
- `Reservations_Table_View` ani `Reservations_Calendar_View` v aktuální implementaci nezobrazují `Attendance_Status` (R11.7 zmiňuje oba pohledy); mapování docházky → čeština je čistá utilita pokrytá `labels.test.ts`. Snapshot testy 6.5 proto ověřují mapování stavů, zvýraznění a filtry. Možný budoucí doplněk: dosypat sloupec docházky do pohledů.

## 2026-06-06 — reservation-management (dokončení specu)

### Hotové tasky
- 10.2 `Clients_Roster`, 10.3 `Client_Detail_View`, 10.4 `Client_Anonymizer` — ověřeno (lint/test/build)
- 11.1 `CSV_Exporter` — ověřeno
- 13.1 Propojení akcí a navigace — ověřeno
- Checkpointy 8, 12, 14 + rodičovské tasky 6, 7, 9, 10, 11, 13 označeny `[x]`
- Stav: všechny povinné tasky hotové; zbývají jen volitelné `*` testy (PBT Property 1–8, snapshot/example/integration, E2E)

### Nové funkce
- `CSV_Exporter` (`src/server/CsvExporter.ts`) — export rezervací do CSV se shodnými filtry jako seznam, všechny řádky bez stránkování, UTF-8 BOM, RFC 4180 escaping, ISO 8601 Europe/Prague s offsetem, log bez PII.
- `toPragueIso` (`src/lib/datetime.ts`) — helper UTC → ISO 8601 v Europe/Prague s offsetem (pro strojově čitelný CSV export).
- CSV export route handler (`src/app/(dashboard)/dashboard/reservations/export/route.ts`) — GET vrací CSV jako download; tlačítko „Exportovat do CSV" nese aktuální filtry z URL.
- `ReservationActions` + `AttendanceActions` (`src/app/(dashboard)/dashboard/reservations/[id]/`) — napojení detailu na server actions (schválit/odmítnout/zrušit/upravit/smazat + docházka, dialogy s důvodem ≤500, při 409 zobrazení dostupných slotů).
- `CreateReservationDialog` (`src/app/(dashboard)/dashboard/reservations/CreateReservationDialog.tsx`) — ruční tvorba rezervace přes `createManualReservation`.
- `Client_Anonymizer` (`src/server/ClientAnonymizer.ts`) + migrace `0023_anonymize_client_function.sql` — GDPR anonymizace v jedné DB transakci.
- Navigace dashboardu mezi `/dashboard/reservations` a `/dashboard/clients`.

### Mimo spec (UI požadavky uživatele)
- Dashboard karta „Rezervace"клikatelná → `/dashboard/reservations` (`src/app/(dashboard)/dashboard/page.tsx`, přidán optional `href` na `MetricCard`, jen business dashboard).
- Tlačítko „Zobrazit profil" (open in new tab na `/{slug}`) před „Nastavení" v hlavičce dashboardu.

### Bug & fix (toto sezení)
- **Symptom:** Veřejná stránka podniku 500. **Root cause:** migrace 0013–0015 nebyly aplikované na remote DB. **Fix:** aplikovány migrace 0013 (RLS Published_Business + `get_public_business_state`/`is_business_published` SECURITY DEFINER), 0014 (deny anon reservations), 0015 (`create_reservation` atomic fn).
- **Symptom:** „Nepodařilo se načíst termíny" na veřejné stránce. **Root cause:** anon role nemohla číst `reservations` (permission denied). **Fix:** `get_active_reservation_intervals` SECURITY DEFINER fn (migrace 0016); `loadAvailableSlots` čte sloty přes ni.
- **Symptom:** `PGRST203` — „Could not choose the best candidate function" pro `get_active_reservation_intervals`. **Root cause:** migrace 0019 přidala přes `create or replace` druhý overload (3-arg + 4-arg současně). **Fix:** migrace 0020 dropuje 3-arg variantu, zůstává jen 4-arg s `p_exclude_reservation_id`.
- **Symptom:** Majitel (editor/ruční tvorba) nemohl načíst sloty u nepublikovaného podniku. **Root cause:** `loadAvailableSlots` filtroval na publikované. **Fix:** přidán `requirePublished?: boolean` (default true); editor/manual předávají `false` a čtou přes admin klienta; `atomicSlotWrite` to propaguje; migrace 0022 odstranila publish gate z `create_manual_reservation`.

### Pozn. k DB migracím
- Aplikováno na remote Supabase v tomto sezení: 0013–0023 (0021 `edit_reservation`+`create_manual_reservation`, 0022 fix publish gate, 0023 anonymize_client). Migrace = sdílená DB uživatele → před `db push` vždy dry-run a potvrzení.

### Active_Subscription_Gate (4.1) — schválený kompromis
- Gate platí jen pro `/dashboard/reservations*` a `/dashboard/clients*` (vyžaduje `{active, grace_period}`); `/dashboard` overview zůstává dostupný `free`; `grace_period` opraven (už ne → /error); interim redirect na `/dashboard` (reálná subscription-status stránka je až ve specu subscription-payments). `src/lib/auth/free-user-guard.ts` + testy.

## 2026-06-06 — reservation-management (volitelné testy, část 2)

### Hotové tasky (volitelné `*`)
- Unit/příkladové/snapshot: 6.5, 6.6, 7.6, 9.7, 10.7, 11.4 — ověřeno
- PBT mutace: 7.5 (Property 1), 9.4 (Property 2), 9.5 (Property 3), 9.6 (Property 7) — ověřeno, ≥100 iterací
- PBT klienti/CSV/logy: 10.5 (Property 4), 10.6 (Property 5), 11.2 (Property 6), 11.3 (Property 8) — ověřeno
- Stav suite: **250 passed / 18 skipped, 0 failures, lint čistý**

### Změny infrastruktury
- `vitest.config.ts`: `include` rozšířen na `tests/**/*.spec.{ts,tsx}` (dřív jen `tests/properties/**`), aby běžely nové `.spec` testy v `tests/components/` a `tests/unit/`.
- Nový sdílený harness `tests/properties/_support/mutation-harness.ts` (fake Supabase/admin pro mutace).
- `tests/properties/sensitive-data-logs.spec.ts` rozšířen o blok `Feature: reservation-management, Property 8` (10 mutací) — existující public-business-page blok zachován.

### Odloženo (rozhodnutí uživatele)
- Integrační testy 1.3, 6.7, 9.8, 10.8, 10.9, 11.5 a E2E 13.2–13.4 NEnapsány — v tomto prostředí by se jen přeskočily (chybí lokální Supabase/Docker + Playwright/Resend test inbox). Zůstávají `[ ]*` v tasks.md k doplnění před release. Subagent dispatch se 2× zrušil; nepokračováno na žádost uživatele.

## 2026-06-06 — subscription-payments (vlna 0: datová vrstva)

### Hotové tasky
- 1.1, 1.2, 1.3 — migrace napsány a APLIKOVÁNY na remote Supabase (dry-run + potvrzení)

### Nové migrace (aplikované)
- `0024_subscriptions_lifecycle_columns.sql` — `subscriptions` + `auto_renew bool default true`, `first_failed_charge_at timestamptz null` (kotva stavového automatu), `pending_plan_change subscription_plan null`.
- `0025_init_invoice_counter.sql` — nová tabulka `invoice_counter (year pk, last_number, check ≥0)` pro gap-free číslování faktur per rok (zámek řádku `FOR UPDATE`).
- `0026_payments_invoice_number.sql` — `payments.invoice_number text null` + unique constraint (nullable → více NULL OK pro pending/failed); `variable_symbol` už unique z 0005.

## 2026-06-06 — subscription-payments (vlna 1)

### Hotové tasky
- 2.4 `extendPeriod`, 8.1 pricing (`planPriceCzk`/`buildAutoChargePayment`), 9.1 HMAC (`verifyHmac` timingSafeEqual) — čisté funkce, ověřeno
- 2.3 transitions, 5.1 invoice-number, 7.1 coupon validate — ověřeno + migrace APLIKOVÁNY

### Nové soubory
- `src/lib/subscription/period.ts`, `src/lib/checkout/pricing.ts`, `src/lib/webhooks/hmac.ts`
- `src/lib/subscription/transitions.ts` (RPC wrapper: activate/grace/expire/materialize)
- `src/lib/invoices/invoice-number.ts` (`allocateInvoiceNumber`, formát `YYYY-NNNN`)
- `src/lib/coupons/validate.ts` (validace + optimistický zámek na `used_count`, české hlášky)

### Nové migrace (aplikované 0027–0028)
- `0027_apply_subscription_transition.sql` — plpgsql SECURITY DEFINER, `SELECT FOR UPDATE` na subscriptions; atomicky status + kotva (set_if_null/set/clear/leave) + businesses.is_published; grant jen service_role.
- `0028_allocate_invoice_number.sql` — `allocate_invoice_number(p_year)` upsert+`FOR UPDATE`+inkrement → gap-free per rok; grant jen service_role.

### Stav
- Suite: 250 passed / 18 skipped, lint čistý. Vlna 0+1 produkční tasky hotové. Volitelné `*` testy (2.2/2.5/3.2/4.2/5.2/7.2/8.2/9.2) zatím nenapsány.

## 2026-06-06 — subscription-payments (vlna 2 + checkpoint jádra)

### Hotové tasky
- 7.3 coupon apply, 13.1 plan-change, 14.1 auto-renew (subscription doména)
- 5.3 invoice PDF+storage, 10.1 GoPay recurring schedule, 15.1 e-mailové šablony
- Rodičovské 2, 3, 4, 5, 15 + checkpoint 6 — hotové (povinné děti done; zbývají `*` testy)

### Nové soubory
- `src/lib/coupons/apply.ts` (`computeChargedAmountCzk` floor 0, free_trial/comp aktivace)
- `src/lib/subscription/{plan-change,auto-renew}.ts`
- `src/lib/payments/gopay/client.ts` (tenký server-only GoPay wrapper, injektovatelný fetch, OAuth2 client_credentials)
- `src/lib/billing/schedule.ts` (`establishRecurringSchedule`)
- `src/lib/invoices/invoice-generator.ts` (`generateAndStoreInvoice`, pdf-lib, ASCII transliterace pro Helvetica)
- `src/lib/email/templates/{subscription-invoice,subscription-qr-fallback,subscription-warning}.ts`

### Dependency / config
- `pdf-lib@1.17.1` (pinned, oficiální). `.env.example`: `GOPAY_API_BASE_URL`, `HOREA_PLATFORM_IBAN`, `SUPABASE_INVOICES_BUCKET`.

### Bug / pozn. (pre-existující, NE regrese)
- **Symptom:** `pnpm build` selhává na prerenderu `/dashboard*` (webpack runtime „Cannot read properties of undefined").
- **Root cause:** pre-existující, ověřeno git stashem (chyba i bez změn vlny 2); souvisí s Node v25.9.0 vs engines 20.x.
- **Stav:** nové moduly nejsou importovány žádnou route (wiring až v 8.3/9.3/12.x/16.1), takže prerender neovlivňují. K dořešení: spustit build pod Node 20.

### Stav
- Suite: 250 passed / 18 skipped, lint čistý.

## 2026-06-06 — subscription-payments (vlna 3 + checkpoint platebního jádra)

### Hotové tasky
- 8.3 checkout (`/api/checkout` + `lib/checkout/checkout.ts`), 10.2 měsíční charge (`lib/billing/charge.ts`)
- 9.3 webhook handler (`/api/webhooks/gopay` + `lib/webhooks/handler.ts`), 13.2 `applyPlanChange`
- Rodičovské 8, 9, 10, 13 + checkpoint 11

### Nové soubory
- `src/lib/checkout/checkout.ts`, `src/app/api/checkout/route.ts`
- `src/lib/billing/charge.ts`, `src/lib/payments/variable-symbol-source.ts`
- `src/lib/webhooks/handler.ts`, `src/app/api/webhooks/gopay/route.ts`
- GoPay klient rozšířen o `createPayment`/`chargeRecurrence`

### Nová migrace (aplikovaná 0029)
- `0029_payment_variable_symbol_seq.sql` — sekvence + RPC `next_payment_variable_symbol()` (monotónní VS, zaručená unikátnost; grant jen service_role).

### Klíčová rozhodnutí
- **Webhook idempotence:** pre-check cílového stavu + guarded flip (`update ... where status != target`) → doprovodné efekty (aktivace, extendPeriod, faktura) přesně jednou i při souběhu; neznámé `gopay_payment_id` → 200 bez změny; faktura jen pokud `invoice_number IS NULL`.
- **Checkout auth:** ověření přihlášení + vlastnictví podniku PŘED service-role zápisy; free_trial/comp → přímá aktivace bez platby.
- `.env.example`: `HOREA_ADMIN_EMAIL`, `GOPAY_WEBHOOK_SECRET`.

### Stav
- Suite: 250 passed / 18 skipped, lint čistý, `pnpm build` plně zelený (žádná /dashboard chyba v tomto běhu).

## 2026-06-06 — subscription-payments (vlna 4: cron úlohy)

### Hotové tasky
- 12.1 Billing_Cron, 12.2 Cleanup_Cron, 12.4 Warning_Cron + rodičovský 12

### Nové soubory
- `src/lib/cron/auth.ts` (`verifyCronAuthorization` — Bearer CRON_SECRET, timingSafeEqual)
- `src/lib/cron/admin-notify.ts` (`notifyAdminCronFailure` — best-effort, bez PII)
- `src/lib/warnings/predicates.ts` (`warningKindFor` — den 23/83 od kotvy)
- `src/app/api/cron/{billing,cleanup,warnings}/route.ts` (GET/POST, cron secret guard, continue-on-error)

### Nová migrace (aplikovaná 0030)
- `0030_delete_business_tenant_data.sql` — atomická RPC: smaže tenant data (reservations/clients/services/opening_hours), vyprázdní profil businesses, nastaví `deleted_data`; ZACHOVÁ řádek businesses (FK cascade by zničil historii), users, subscriptions/payments historii. grant jen service_role.

### Klíčová rozhodnutí
- Billing cron: `initiation_failed` (GoPay down, R2.5) → ponechat `active` pro retry; ostatní synchronní selhání → `transitionToGracePeriod`; declined řeší webhook.
- Cleanup idempotence přes filtr `status != deleted_data`.
- `.env.example`: `CRON_SECRET`.

### Stav
- Suite: 250 passed / 18 skipped, lint čistý, `pnpm build` zelený.

## 2026-06-06 — subscription-payments (vlna 5 + finální checkpoint)

### Hotové tasky
- 16.1 stránka `/dashboard/subscription` + server actions + napojení checkout/plan-change/auto-renew/kupón
- Rodičovské 7, 12, 14, 16 + finální checkpoint 18
- **Všechny povinné tasky specu hotové.** Zbývají jen volitelné `*` testy.

### Nové soubory
- `src/app/(dashboard)/dashboard/subscription/{page.tsx,SubscriptionManager.tsx,actions.ts}`
- Server actions: `cancelAutoRenewAction`/`enableAutoRenewAction`/`requestPlanChangeAction`/`cancelPlanChangeAction`/`validateCouponAction` — každá ověří přihlášení + vlastnictví podniku před service-role zápisem.

### Stav
- Suite: 250 passed / 18 skipped, lint čistý, `pnpm build` plně zelený (vč. prerenderu).
- DB migrace 0024–0030 aplikované na remote Supabase.

### Odloženo (volitelné `*` testy subscription-payments)
- PBT: 2.2 (Property 1), 2.5 (Property 6), 3.2 (Property 3), 4.2 (Property 4), 5.2 (Property 5), 7.4 (Property 7), 9.4 (Property 2), 12.3 (Property 8)
- Unit: 8.2, 9.2, 10.3, 12.5, 13.3, 14.2, 7.2
- Integrační (lokální Supabase/GoPay sandbox): 5.4, 5.5, 9.5, 12.6, 17.1
- E2E (Playwright + GoPay sandbox): 17.2

## 2026-06-06 — subscription-payments (volitelné PBT + unit testy)

### Hotové volitelné `*` tasky
- PBT (čisté/model): 2.2 (Property 1), 2.5 (Property 6), 3.2 (Property 3), 4.2 (Property 4), 5.2 (Property 5)
- Unit: 7.2, 8.2, 9.2, 10.3, 12.5, 13.3, 14.2
- PBT (mock DB): 7.4 (Property 7), 9.4 (Property 2), 12.3 (Property 8)

### Klíčové testovací vzory
- Webhook idempotence: in-memory Supabase model zrcadlí guarded flip (`update ... where status != target`); efekty (activate/grace/invoice) mockované s počítadly → 1× vs 2× aplikace = identický stav, efekty ≤ 1×.
- Mazání dat / číslování faktur / anonymizace: model RPC + nezávislý deklarativní oracle (ne tautologie).
- Sleva kupónu: nezávislý oracle, hranice 0/100 %, fixed floor 0.

### Stav
- Suite: **324 passed / 18 skipped**, lint čistý.
- Zbývají jen testy vyžadující prostředí: integrační 5.4, 5.5, 9.5, 12.6, 17.1 (lokální Supabase/GoPay sandbox) a E2E 17.2 (Playwright + GoPay) — odloženo.

## 2026-06-06 — admin-dashboard (vlna 0)

### Hotové tasky
- 1.1 audit_log, 1.3 coupons.is_active, 2.2 RLS admin override (verifikační) — migrace APLIKOVÁNY (0031–0033)
- 2.1 Access_Guard (+ middleware /admin/*), 5.1 StatsAggregator, 16.1 InvoiceResender

### Nové migrace (aplikované)
- `0031_create_audit_log.sql` — append-only audit (REVOKE řeší task 1.2); indexy created_at desc + target_id.
- `0032_coupons_is_active.sql` — `coupons.is_active bool default true`.
- `0033_rls_admin_override.sql` — verifikační (admin override už pokryt 0007/0009; idempotentní bezpečnostní síť, no-op).

### Nové soubory
- `src/lib/admin/{access-guard,stats,invoice-resender}.ts`; `src/middleware.ts` rozšířen o `/admin/:path*` (early-return větev, /dashboard beze změny).

### Pozn.
- **Churn** ve StatsAggregator je proxy přes `updated_at` předplatných ve stavu expired/deleted_data (chybí dedikovaná tabulka přechodů; Simplicity First, zdokumentováno).

### Stav
- Suite: 324 passed / 18 skipped, lint čistý, build OK.

## 2026-06-06 — admin-dashboard (vlna 2: admin write akce)

### Hotové tasky
- 10.1 override, 10.2 pozastavení, 11.1 free trial/comp granty (+ rodičovské 10, 11)
- 12.1 vynucené smazání, 15.1 párování plateb

### Nové soubory
- `src/lib/admin/{subscription-override,grants,force-delete,payment-matcher}.ts` (TS wrappery)

### Nové migrace (aplikované 0036–0039) — všechny plpgsql SECURITY DEFINER, audit ve STEJNÉ transakci přes `write_audit_log`, grant jen service_role
- `0036` `admin_override_subscription` (přímý override, obchází automat) + `admin_suspend_business` (is_published=false)
- `0037` `admin_grant_free_trial` + `admin_grant_comp` (all-or-nothing, Property 6)
- `0038` `admin_force_delete_business` — REUSE `delete_business_tenant_data` (0030) uvnitř transakce + audit
- `0039` `admin_match_payment` — nastaví paid, REUSE `apply_subscription_transition` (0027) + prodloužení o Jeden_Mesic (zrcadlo extendPeriod); ne-pending → rollback (zůstává pending)

### Klíčová rozhodnutí
- Audit atomicita: `perform write_audit_log(...)` uvnitř akčních RPC (JS klient neumí multi-call transakci) → Property 2.
- Reuse, ne duplikace: force-delete volá 0030; payment-match volá 0027 + Jeden_Mesic konstanta. Faktura se při ručním párování negeneruje (není součást efektu dle R8.3).
- payment-match báze prodloužení: `coalesce(current_period_end, now())` (ošetří první ruční platbu bez období).

### Stav
- Suite: 324 passed / 18 skipped, lint čistý, build OK. Migrace 0031–0039 aplikované.

## 2026-06-06 — admin-dashboard (vlna 2 dokončení + stránky + wiring + finální checkpoint)

### Hotové tasky
- 14.1 CouponManager CRUD (+ migrace 0040, RPC create/update/deactivate/delete s auditem)
- Stránky: 6.2 /admin/audit, 8.2 /admin/businesses/[id], 14.2 /admin/coupons, 15.2 /admin/payments
- 17.1 napojení admin akcí do detailu (override/free-trial/comp/pozastavení/vynucené smazání s potvrzením/resend faktury)
- Rodičovské 6, 8, 14, 15, 16 + checkpointy 9, 13, 18
- **Všechny povinné tasky admin-dashboard hotové.** Zbývají jen volitelné `*` testy.

### Nové soubory
- `src/lib/admin/coupon-manager.ts`, `require-admin.ts`
- `src/app/admin/audit/page.tsx`, `src/app/admin/businesses/[id]/{page.tsx,BusinessActions.tsx,actions.ts}`
- `src/app/admin/coupons/{page.tsx,coupons-manager.tsx,actions.ts}`, `src/app/admin/payments/{page.tsx,payments-matcher.tsx,actions.ts}`

### Nová migrace (aplikovaná 0040)
- `0040_admin_coupon_crud.sql` — RPC `admin_create/update/deactivate/delete_coupon` + `coupon_snapshot`; audit ve stejné transakci; unikátnost code (23505) + percent 0–100 (22023) → české hlášky v TS.

### Klíčová rozhodnutí
- `requireAdmin()` helper ve všech admin server actions: ověří přihlášení + `users.is_admin` (service-role, nezávisle na middleware) před mutací.
- Vynucené smazání: potvrzovací modal + server-side guard `confirmed`.

### Stav
- Suite: 324 passed / 18 skipped, lint čistý, build OK. Migrace 0031–0040 aplikované na remote Supabase.
- Zbývající volitelné `*` testy admin-dashboard: PBT 2.3/3.2/3.3/5.3/11.2/12.2/14.3; unit 3.4/5.4/6.3/7.3/8.3/10.3/11.3/15.3/16.2; integrační 19.1–19.4 (lokální Supabase); E2E 20.1–20.2 (Playwright).

## 2026-06-06 — Node 20 produkční build (oprava pre-existující build chyby)

### Bug & fix
- **Symptom:** `pnpm build` občas selhával na prerenderu `/dashboard*` (webpack runtime „Cannot read properties of undefined").
- **Root cause:** běh pod Node v25.9.0 (výchozí node na stroji); `engines` i `.nvmrc` přitom vyžadují 20.x.
- **Fix / co fungovalo:** `brew install node@20` (keg-only) → build s `PATH="/opt/homebrew/opt/node@20/bin:$PATH" pnpm build` pod **Node v20.20.2 plně zelený** (všechny routy vč. prerenderu, 0 chyb).
- **Setup:** `.nvmrc`=20 a `engines.node`="20.x" už byly správně (Vercel a version-manager je respektují). Na tomto stroji není nvm/fnm/volta — node@20 je keg-only, takže lokální build pod 20 vyžaduje buď `PATH` prefix (`/opt/homebrew/opt/node@20/bin`), `brew link node@20`, nebo doinstalovat fnm/nvm.
- **Nefungovalo / pozn.:** výchozí `/opt/homebrew/bin/node` = v25; `/usr/local/bin/node` = v22 (taky ne 20). Vercel build použije Node dle `engines`/`.nvmrc` automaticky — produkce není ohrožena.

## 2026-06-06 — admin-dashboard (volitelné runnable PBT/unit testy)

### Hotové volitelné `*` tasky
- Unit (čtecí + audit): 3.4, 5.4, 6.3, 7.3, 8.3
- Unit (akce): 10.3, 11.3, 15.3, 16.2
- PBT: 2.3 (Property 1), 5.3 (Property 5), 14.3 (Property 4), 3.2 (Property 2), 3.3 (Property 3), 11.2 (Property 6), 12.2 (Property 7)

### Nové soubory
- `src/lib/admin/__tests__/supabase-fake.ts` (sdílený chainable fake, reálně aplikuje eq/in/gte/lte/order) + `{stats,audit-viewer,business-list,business-detail,audit-logger,subscription-override,grants,payment-matcher,invoice-resender}.test.ts`
- `tests/properties/{admin-access-guard,coupon-validation,admin-stats-correctness,audit-trail-completeness,audit-append-only,grant-atomicity,force-delete-completeness}.spec.ts`

### Stav
- Suite: **396 passed / 18 skipped**, lint čistý, build OK (Node 20).
- Zbývá jen env-závislé: admin-dashboard integrační 19.1–19.4 + E2E 20.1–20.2 (lokální Supabase/Playwright); reservation-management integrační 1.3/6.7/9.8/10.8/10.9/11.5 + E2E 13.2–13.4.

## 2026-06-06 — odložené integrační + E2E testy (reservation-management + admin-dashboard) + 14.4

### Hotové volitelné `*` tasky
- reservation-management integrační: 1.3, 6.7, 9.8, 10.8, 10.9, 11.5 (env-guarded `tests/integration/*.test.ts`) → **reservation-management 100%**
- reservation-management E2E: 13.2, 13.3, 13.4 (Playwright `e2e/*.spec.ts`, env-guarded)
- admin-dashboard integrační: 19.1–19.4 (env-guarded)
- admin-dashboard E2E: 20.1, 20.2 (Playwright) + helper `loginAsAdmin`
- admin-dashboard 14.4 unit CRUD kupónů → **admin-dashboard 100%**

### Stav
- Suite: **415 passed / 49 skipped** (skipped = env-guarded integrace bez lokálního Supabase), lint čistý, `pnpm exec playwright test --list` = 7 E2E testů validních.
- Integrační běží přes `signInAsUser`/service-role proti reálným RPC/RLS; E2E přes `pnpm test:e2e` s `E2E_OWNER_*`/`E2E_ADMIN_*` (+ volitelný `E2E_RESEND_INBOX_URL`). Bez prostředí se čistě přeskočí.

### Souhrn projektu
- **reservation-management, subscription-payments (povinné + runnable testy), admin-dashboard = kompletní.** Zbývají jen subscription-payments integrační/E2E (5.4, 5.5, 9.5, 12.6, 17.1, 17.2) — nezadáno v tomto kole.

## 2026-06-06 — posun runtime na Node 22 LTS (z EOL Node 20)

### Změny
- `.nvmrc`: `20` → `22`
- `package.json` engines: `20.x` → `^22.12.0 || ^24.0.0` (sudé LTS; vyloučeny liché Current 23/25 i ESM-broken 22.0–22.11)
- `.github/workflows/ci.yml`: `actions/setup-node` node-version `20` → `22`
- `README.md`: prerekvizita Node 22 (22.12+)

### Důvod
- Node 20 „Iron" je po EOL (~2026-04-30). Lichá „Current" verze (21/23/25) se nedoporučují pro produkci (krátká podpora ~6 měs.). Sudé LTS (22/24) dostávají bezpečnostní záplaty ~30 měsíců. „Nejnovější" (v25) ≠ nejbezpečnější.

### Bug & fix (nález při ověření)
- **Symptom:** `pnpm test:run` pod Node **22.11.0** padá `ERR_REQUIRE_ESM` (vitest 4 / vite 8 dělají `require()` na ESM vite).
- **Root cause:** synchronní `require(ESM)` byl unflagged v Node 20.19+ a 22.12+, ale CHYBÍ v 22.0–22.11.
- **Fix:** engines `^22.12.0` vynucuje 22.12+ (lokální 22.11 je zastaralá; `.nvmrc=22` ve správci verzí/Vercelu stáhne nejnovější 22.x).
- **Ověřeno:** `pnpm test:run` pod node@20 v20.20.2 → **415 passed / 49 skipped**; `pnpm build` zelený pod Node 20 i 22.

### Pozn.
- `engine-strict` není zapnutý (žádný `.npmrc`), takže pnpm pod nevyhovujícím Node jen varuje, neblokuje. Produkce/CI běží dle `.nvmrc`/`engines`.
