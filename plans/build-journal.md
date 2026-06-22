# Build Journal

Chronologický žurnál stavění (nejnovější nahoře). Per-task checkbox stav je kanonicky v `.kiro/specs/<spec>/tasks.md`; zde jsou jen nové funkce a bug/fix znalost. Bez PII a tajemství.

## 2026-06-22 — admin: udělení tarifu nechávalo účet ve stavu Free

### Bug & fix
- **Symptom:** Po udělení tarifu (např. Start) podniku v admin detailu zůstal stav předplatného „Neplacené (Free)" (dashboard, /dashboard/subscription) — vznikl rozpor `plan=start` + `status=free`.
- **Root cause:** Override formulář (`src/app/admin/businesses/[id]/BusinessActions.tsx`) má oddělené selecty Tarif a Stav; `status` se předvyplní aktuální hodnotou (u nového účtu `free`). Admin změnil jen Tarif, Stav nechal `free`. `admin_override_subscription` zapíše libovolnou kombinaci (vědomě obchází stavový automat), takže uložil `plan=start` + `status=free`.
- **Fix:** Provázání výběru tarifu se stavem v override formuláři — zvolení placeného tarifu na účtu ve stavu `free` přepne stav na `active`; zrušení tarifu (`''`) nastaví `free`. Jiný než `free` stav (grace/expired) se nepřepisuje (admin může ručně). Server/RPC se nemění (override zůstává plně flexibilní).
- **Pozn.:** Už uložený nekonzistentní řádek (lokální test salon) se neopraví sám — stačí v override formuláři tarif znovu zvolit a uložit (nově se rovnou nastaví `active`).

### Ověřeno
- `pnpm lint` 0, `pnpm build` OK, diagnostika čistá.

## 2026-06-22 — public-business-page: owner náhled — termíny + vrácený Notice

### Bug & fix
- **Symptom:** Majitel v náhledu nepublikovaného profilu při výběru data viděl „V tento den nejsou dostupné žádné termíny" i u podniku s vyplněnou otevírací dobou (po–pá 9–17).
- **Root cause:** `getAvailableSlots` (`src/server/AvailableSlotsService.ts`) vracel prázdné sloty pro každý `!state.published` podnik (běží pod anon klientem, RLS pustí jen publikované).
- **Fix:** Owner-aware větev — když je `state.published === false` a `viewerOwnsBusiness(state.id)`, počítá termíny přes `createAdminClient` s `loadAvailableSlotsDetailed(..., { requirePublished: false })` (čte rezervace přímo, obchází RLS; shodně s owner operacemi Editor/Manual). Cizí/nepřihlášený dostane dál prázdno.

### Nové funkce / změny
- `src/lib/business/ownership.ts` — vytažen sdílený `viewerOwnsBusiness(businessId)` (session přes cookies + ověření `owner_user_id` admin klientem). Použit v `[slug]/page.tsx` (owner náhled) i v `AvailableSlotsService` (termíny). Lokální duplikát v page.tsx odstraněn.
- `ReservationFormController` — vrácen horní `Notice` (variant warning) v `preview` režimu (informace, že rezervaci lze proklikat, ale dokončení je až po aktivaci tarifu). Blok dokončení na kroku 5 zůstává.

### Ověřeno
- `pnpm lint` 0, `pnpm build` OK, diagnostika čistá.

## 2026-06-22 — public-business-page: doladění locked teaseru + owner náhledu

### Změny
- `LockedBusinessProfile`: `IconLock` přesunut úplně dolů (pod telefon), pod ikonou popisek „Podnik zatím neodemknul svůj profil." (už není nad primárním tlačítkem). Do spodní navigace přidáno vlevo Horea `Logo` (proklik → `/`); vpravo zůstávají ikony Domů + Účet.
- `ReservationFormController`: odstraněn trvalý horní „preview" Notice — majitel může formulář v klidu proklikat; dokončení rezervace je blokované až na konci (krok 5 zobrazí error Notice s hláškou, odeslání se neprovede).

### Ověřeno
- `pnpm lint` 0, `pnpm build` OK, diagnostika čistá.

## 2026-06-22 — public-business-page: UI pro nepublikovaný profil (zamčený teaser + owner náhled)

### Nové funkce
- `src/app/[slug]/page.tsx` — větev „nepublikováno" už není holý text. Nově dva stavy:
  - **Nepřihlášený / cizí návštěvník** → zamčený teaser `LockedBusinessProfile`.
  - **Přihlášený MAJITEL nepublikovaného podniku** (free účet) → plný profil v náhledu + plovoucí banner `OwnerUpgradeBanner` (vpravo dole, proklik na `/dashboard/plans`) + rezervační formulář v `preview` režimu (dokončení rezervace zakázáno).
- `LockedBusinessProfile` (`src/components/business/LockedBusinessProfile.tsx`) — cover (fallback `media.horea.cz/.../reserved.webp`), logo nebo iniciála, název, ztlumený `horea.cz/{slug}`, štítky (typ podniku + Nyní otevřeno/Zavřeno), centrovaná `IconLock` (action-violet na light-violet), primární tlačítko „Odemknout profil" → `/login`, jednořádková dnešní otevírací doba, telefon (tel:), spodní navigace jen Domů + Účet.
- `ReservationFormController` — nový prop `preview`: formulář lze proklikat, ale dokončení rezervace je blokované (hláška + warning Notice).
- `open-status.ts` — přidány `getPragueWeekday` a `getTodaysHours` (dnešní otevírací doba v Europe/Prague).
- `next.config.ts` — `media.horea.cz` přidán do `images.remotePatterns` (fallback cover přes `next/image`).

### Architektura / rozhodnutí
- Teaser data nepublikovaného podniku (typ, telefon, otevírací doba, cover/logo) se čtou **server-side přes `createAdminClient`** (service role, nikdy ne klient) — žádná DB migrace. Owner se detekuje přes session (`createClient`/cookies) jen ve větvi „nepublikováno" (ta je noindex → dynamický render je v pořádku; publikovaná cesta zůstává ISR). Loader profilu refaktorován na `loadProfileWith(client, id)` (anon pro publikované, admin pro owner náhled).
- **Produktové rozhodnutí:** teaser nepublikovaného podniku (název, typ, logo, cover, telefon, otevírací doba) je nově veřejně viditelný nepřihlášeným (dle zadání UI).

### Ověřeno
- `pnpm lint` 0, `pnpm build` OK, `pnpm test:run` (slug metadata + open-status) 10/10, diagnostika čistá.

## 2026-06-22 — auth: responzivní hero obrázek na login/register

### Nové funkce
- Login a register brandový panel (`src/app/login/page.tsx`, `src/app/register/page.tsx`) nově servíruje hero obrázek responzivně přes `srcSet`/`sizes`. Panel je desktop-only (`hidden lg:block`), renderuje se ~448–536 px, zdroj je přes `object-cover` ořezán na portrét 4/5.
- Z původního landscape zdroje (1198×800, 73 KB) vyrobeny předem oříznuté portrét 4/5 varianty a nahrány na R2 (`media.horea.cz`, bucket `horea-media`, prefix `de64ab9c-…`): `-640.webp` (640×800, 38,5 KB), `-480.webp` (480×600, 25 KB), `-360.webp` (360×450, 17 KB). Předořez odstranil ~47 % zbytečných šířkových bajtů → i největší varianta je menší než původní.
- `sizes="(min-width:1024px) min(536px, calc(50vw - 64px)), 1px"` (pod lg → 1px, minimalizuje preload skrytého obrázku). Doplněn `width/height` (aspect ratio, anti-CLS) a `decoding="async"`.

### Ověřeno
- Varianty živé na `media.horea.cz` (HTTP 200, image/webp). `pnpm lint` exit 0, get_diagnostics bez chyb.

### Pozn. / omezení
- Zdroj má výšku 800 px → vazebný rozměr po ořezu je výška; stačí na 1× desktop, ale ne na plné 2× retina. Pro ostrost na retina by bylo potřeba vyexportovat vyšší originál (cca 1350 px na výšku) a přegenerovat varianty.
- Změna se projeví až po deployi (ruční rsync dle `deploy.md`); původní `…-klientu.webp` na R2 ponechán (zpětná kompatibilita do deploye).

## 2026-06-22 — deploy: horea.cz živé na VPS — cutover dat + app + zálohy (fáze 2/3/5 dokončeno)

### Nové funkce
- **horea.cz živé** na OVH VPS: Cloudflare → nginx (`horea.conf`, Origin cert, `horea.cz`+`www`) → `horea-web` kontejner (`127.0.0.1:3200`) → self-hosted Supabase. Restart `unless-stopped`. nginx mapa `$connection_upgrade` sdílena s maietek.
- **Cutover dat** z hostovaného Supabase (`ysrnlzlhskifsjnbzmxs`, PG 17.6) do self-hosted (PG 17.6) — přes IPv6 direct connection jako `postgres` superuser, dumpy throwaway `supabase/postgres:17` kontejnerem s `--network host`:
  - public schéma (DDL vč. GRANTů pro anon/authenticated/service_role + ownership) → restore (20 tabulek).
  - data load v jedné session s `session_replication_role=replica` (obejde FK pořadí + triggery): `auth.users`+`auth.identities` (column-inserts), `storage.buckets`+`storage.objects`, public data.
  - Ověřeno: VŠECHNY počty tabulek shodné hosted↔self (5 uživatelů, 2 podniky, 4 rezervace…), sekvence shodné.
- **Storage migrace**: 2 objekty bucketu `business-media` (logo+cover, jpeg) staženy z hostovaného public URL a nahrány přes self-hosted Storage API (service_role). Bucket `invoices` na hostovaném neexistoval → žádné PDF k přenosu.
- **Denní zálohy DB**: `/opt/apps/horea/backup-db.sh` (`pg_dump` self-hosted → gzip do `/opt/backups/horea`, rotace 7), ubuntu cron `0 3 * * *` (maietek 02:00 zachován). Test: 71 KB, `gunzip -t` OK.

### Ověřeno (end-to-end přes Cloudflare)
- `horea.cz` homepage → 200 (0,15 s). Publikovaný profil `/u-lipy` → 200, renderuje reálná data (služby, otevírací doba) ze self-hosted DB. Nepublikovaný `/salon` → korektní „neexistuje" (RLS funguje). Logo `https://supabase.horea.cz/storage/v1/object/public/business-media/.../logo` → 200 (12292 B). `www` redirect 200. Všech 11 Supabase kontejnerů + `horea-web` healthy, RAM 2,6/7,8 GB. `maietek` netknut.

### Pozn. / bezpečnost
- Manuální cutover dumpy (plaintext PII) po ověření smazány; hostované Supabase ponecháno jako původní záloha, než uživatel vše ověří.
- ZBÝVÁ po uživatelově ověření: vypnout/archivovat hostovaný Supabase projekt; registrace Telegram webhooku na `https://horea.cz/api/telegram/webhook` (setWebhook + secret token) — viz fáze telegram-operator-notifications.

## 2026-06-22 — deploy: Horea app container postaven (fáze 3)

### Nové funkce
- `Dockerfile` (repo root) — multi-stage Next.js 15 standalone image: `node:22-alpine`, pnpm@8.15.0 přes corepack, `libc6-compat` pro sharp; stage deps→builder→runner, běh jako non-root `nextjs`, `server.js` na portu 3000. NEXT_PUBLIC_* (SUPABASE_URL, ANON_KEY, R2_PUBLIC_BASE_URL) jako build args (zapékají se do klienta).
- `next.config.ts` — přidáno `output: 'standalone'` (štíhlý image, samostatný server).
- `.dockerignore` — vylučuje node_modules/.next/.git/testy/.env/plans/.kiro atd. z build kontextu.
- `docker-compose.yml` (repo root) — služba `web` (`horea-web:latest`), `env_file: .env`, port `127.0.0.1:3200:3000`, `restart: unless-stopped`. Na VPS běží z `/opt/apps/horea/app/` (zdroják rsyncnut, `.env` mimo git).
- Produkční `.env` na VPS (`/opt/apps/horea/app/.env`, chmod 600): app tajemství z lokálního prostředí, Supabase proměnné přepsané na self-hosted (`NEXT_PUBLIC_SUPABASE_URL=https://supabase.horea.cz`, anon/service self-hosted klíče, DB heslo). `VPS_PASS` odstraněn. 25 proměnných.

### Ověřeno
- `docker compose build` na VPS → exit 0, image `horea-web:latest` postaven (Next.js build prošel se standalone výstupem, middleware + všechny route zkompilovány).

### Blokováno na uživateli (cutover) — nutné PŘED spuštěním horea.cz
- Self-hosted DB je prázdná (jen Supabase systémové schéma). horea.cz DNS už míří na VPS → web je do cutoveru fakticky down. Před `docker compose up` + nginx pro `horea.cz` je nutná migrace: schéma 0001–0053 + data + `auth.users` + storage faktury z hostovaného Supabase. Čeká na výslovný pokyn k cutover.

## 2026-06-22 — deploy: Self-hosted Supabase na OVH VPS (fáze 1)

### Nové funkce
- Self-hosted Supabase stack běží na OVH VPS (`141.227.135.23`, Ubuntu 24.04) v `/opt/apps/supabase` jako Docker Compose (oficiální self-hosting template, služby: db postgres 17, auth/GoTrue v2.189.0, rest, realtime, storage, imgproxy, meta, kong, pooler/supavisor, studio, edge-functions). Vzor serveru = Docker + Cloudflare (jako sousední `maietek-prod`), NE PM2/certbot ze skillu.
- Tajemství vygenerována oficiálním `utils/generate-keys.sh --update-env` (JWT_SECRET + legacy symetrické ANON_KEY/SERVICE_ROLE_KEY — přesně to, co Horea používá přes `@supabase/ssr` a `createAdminClient`; dále POSTGRES_PASSWORD, DASHBOARD_PASSWORD, SECRET_KEY_BASE, VAULT_ENC_KEY ad.). Tajemství jen na VPS v `.env`, nikdy ne v repu/chatu.
- URL nakonfigurovány na cílové domény: `SITE_URL=https://horea.cz`, `API_EXTERNAL_URL`/`SUPABASE_PUBLIC_URL=https://supabase.horea.cz`, `ADDITIONAL_REDIRECT_URLS=https://horea.cz/**`. Signup: email signup zapnut, autoconfirm vypnut (Horea posílá vlastní auth e-maily přes `admin.generateLink` + Resend, GoTrue SMTP se nepoužívá).
- Bezpečnost: všechny publikované porty (kong 8000/8443, db 5432/pooler 6543) navázány na `127.0.0.1` (úprava port řádků v `docker-compose.yml`, backup `docker-compose.yml.bak`); ověřeno `ss -tlnp` (žádný 0.0.0.0). UFW dál jen 22/80/443. Restart policy `unless-stopped` u všech služeb (přežijí reboot).

### Ověřeno
- Všechny kontejnery `Healthy` (`docker compose up -d --wait`, exit 0). REST `GET /rest/v1/` s anon klíčem → 200; `GET /auth/v1/health` → GoTrue v2.189.0; `/auth/v1/settings` → 200. RAM 2,4 GB použito / 5,3 GB volných (pohodlně vedle maietek). `maietek-prod` netknut.

## 2026-06-22 — deploy: supabase.horea.cz živé přes Cloudflare (fáze 4a)

### Nové funkce
- Cloudflare Origin cert (`horea.cz` + `*.horea.cz`, platnost do 2041) nasazen na VPS: `/etc/ssl/cloudflare/horea-origin.pem` (644) + `horea-origin.key` (600, root). Ověřena shoda modulů cert↔key.
- nginx site `supabase-horea.conf` (`/etc/nginx/sites-available`, symlink v sites-enabled): `supabase.horea.cz` → `127.0.0.1:8000` (kong), 80→443 redirect, websocket upgrade pro realtime, `client_max_body_size 50m`. Mapa `$connection_upgrade` se znovu nedefinuje (sdílí se s `maietek.conf`, jinak duplicate map). DNS: A `horea.cz` a `supabase.horea.cz` → `141.227.135.23`, CNAME `www`→`horea.cz`. Cloudflare SSL/TLS = Full (strict).

### Ověřeno
- `nginx -t` OK, reload OK. Plný řetězec Cloudflare → nginx → kong → Supabase: `GET /auth/v1/settings` a `GET /rest/v1/` s anon klíčem přes veřejnou DNS → 200. Externí `/auth/v1/health` bez klíče → 401 + `cf-ray …-PRG` (Full strict TLS na origin funguje). `maietek` nedotčen.

### Blokováno na uživateli (cutover)
- Migrace dat z hostovaného Supabase (schéma 0001–0053 + data + auth.users + storage faktury) — až s výslovným pokynem k cutover.


## 2026-06-21 — admin-system-tools: Informační tooltipy ke kartám stránky `/admin/system`

### Nové funkce
- InfoTooltipy v hlavičkách všech karet stránky `/admin/system` (feature parita s user dashboardem). `SectionHeading` v `src/app/admin/system/page.tsx` nově přijímá volitelný `info?: string` a renderuje `<InfoTooltip>` vpravo nahoře vedle titulku; doplněn `info` u sekcí Stav služeb (fallback), Informace o nasazení, Stav e-mailové fronty, Stav záloh, Čerstvost GoPay webhooku, Provozní metriky, Konfigurace, Logy a auditní stopa, Monitor cron úloh. Tooltip ručně přidán i do hlaviček klientských panelů: `HealthRecheckButton.tsx` (Stav služeb), `RevalidatePanel.tsx`, `CronTriggerPanel.tsx`, `PruneCronRunsPanel.tsx`, `TestEmailPanel.tsx`. Sdílená komponenta `@/components/ui/info-tooltip`. Ověřeno `pnpm exec eslint` (exit 0) a get_diagnostics (bez chyb); `pnpm exec tsc --noEmit` bez nových chyb v upravených souborech (pre-existující chyby jen v test souborech).

## 2026-06-21 — admin-dashboard: Informační tooltipy ke kartám stránek podniků

### Nové funkce
- InfoTooltipy v hlavičkách karet admin stránek podniků (`src/app/admin/businesses/page.tsx`, `src/app/admin/businesses/[id]/page.tsx`, `src/app/admin/businesses/[id]/BusinessActions.tsx`) — vpravo nahoře u každé karty, lidsky vysvětlují obsah sekce. Pokrývá: filtry seznamu, seznam podniků, profil, předplatné, rezervace, historii plateb a administrátorské akce. Ověřeno `pnpm exec eslint` (exit 0) a get_diagnostics (bez chyb).

## 2026-06-21 — admin-system-tools: Task 31 — Závěrečný checkpoint (kompletní funkce)

### Hotové tasky
- 31 Závěrečný checkpoint — ověřeno celou sadou:
  - `pnpm test:run`: 155 test files passed | 23 skipped; 740 testů passed | 57 skipped (exit 0).
  - `pnpm lint`: bez errors (exit 0).
  - `pnpm build`: produkční build prošel, route `/admin/system` přítomna (exit 0).
- Žádné opravy nebyly potřeba — admin-system soubory (page/accessibility/server action/I/O/cron/config guard/dashboard-header testy) prošly bez zásahu.

## 2026-06-21 — admin-system-tools: Task 30.1 — Test rovnosti CRON_SCHEDULE_MAP s vercel.json

### Hotové tasky
- 30.1 `src/lib/system/__tests__/cron-schedule-map.test.ts` — ověřeno `pnpm test:run` (6 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/cron-schedule-map.test.ts` — ochrana proti driftu deklarace cron rozvrhů (R24.3). Načítá reálný `vercel.json` přes `readFileSync(join(process.cwd(),'vercel.json'),'utf8')` + `JSON.parse`, z `path` (`/api/cron/<job>`) odvozuje název jobu posledním segmentem. Ověřuje obousměrně: stejná množina jobů (žádný navíc/chybějící), shodné rozvrhy mapa↔vercel, plus explicitní `toEqual` na očekávané hodnoty (billing `0 3 * * *`, warnings `30 3 * * *`, cleanup `0 4 * * *`, email-retry `*/15 * * * *`). Mapa a `vercel.json` souhlasí — žádný drift.

### Hotové tasky
- 28.3 `src/app/admin/system/__tests__/accessibility.test.tsx` — ověřeno `pnpm test:run` (4 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/accessibility.test.tsx` — RTL testy přístupnosti panelů Správy systému (R14.1–R14.3, R21.3). Server actions z `./actions` mockované přes `vi.hoisted`/`vi.mock` jako spy s řízeným výsledkem. Pokrývá: (1) `HealthRecheckButton` — stavy služeb mají textový label (v pořádku/zhoršené/nedostupné, dotaz scopovaný do `getByRole('table')` kvůli kolizi s agregátem v aria-live), přítomnost `aria-live` regionu, klávesová ovladatelnost (`userEvent.tab()` + `keyboard('{Enter}')` na nativním `<button>`) a aktualizace aria-live regionu po re-checku (nový agregát z mocku, čekání přes `findByText`); (2) `TestEmailPanel` a (3) `RevalidatePanel` — `aria-live` region, akce za explicitním potvrzením (první klik akci nespustí), po potvrzení textový výsledek v aria-live regionu.
- Přidána dev dependency `@testing-library/user-event@14.5.2` (companion k `@testing-library/react`) — task explicitně vyžaduje `userEvent`; dříve v projektu nebyla.

## 2026-06-21 — admin-system-tools: Task 28.2 — Integrační testy renderu `/admin/system`

### Hotové tasky
- 28.2 `src/app/admin/system/__tests__/page.test.tsx` — ověřeno `pnpm test:run` (3 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/page.test.tsx` — integrační RTL testy `AdminSystemPage` (async RSC). Vzor renderu: `render(await AdminSystemPage())` (projekt nemá samostatný RSC test setup). Všechny gettery (`runHealthChecks`, `getDeployInfo`, `getOutboxStatus`, `getBackupStatus`, `getWebhookFreshness`, `getOperationalMetrics`, `getConfigReport`, `getCronStatuses`) + `requireAdmin` mockované přes `vi.hoisted`/`vi.mock`; klientské panely nahrazeny stuby. Čisté moduly `cron-schedule` a `datetime` NEmockované (deterministické, součást renderu rozvrhu/driftu). Pokrývá: šťastnou cestu (nasazení, outbox + `/api/cron/email-retry`, zálohy „není implementována", webhook proxy/čerstvé, metriky + storage „nedostupné", konfigurace nastaveno/nenastaveno + log info, odkaz `/admin/audit`, cron rozvrh + „žádný drift"), fallbacky (`null`/`db:null` → české hlášky o nedostupnosti, zbytek funkční) a health throw (fallback sekce stavu služeb, zbytek funkční).

## 2026-06-21 — admin-system-tools: Task 29.3 — Testy headeru/routingu (admin režim)

### Hotové tasky
- 29.3 `src/components/dashboard/__tests__/dashboard-header.admin.test.tsx` — ověřeno `pnpm test:run` (3 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/components/dashboard/__tests__/dashboard-header.admin.test.tsx` — RTL testy `DashboardHeader` v admin režimu (R1.1–R1.4, R14.4). Render s admin props (`showSettings`, `settingsHref="/admin/system"`, `settingsLabel="Správa systému"`, `accountHref="/admin/account"`). Dotazy přes `getByRole('link', { name })`: gear odkaz míří na `/admin/system` a má aria-label „Správa systému"; account ikona míří na `/admin/account` a je to oddělený odkaz s odlišným cílem (account má napevno aria-label „Nastavení účtu"). Třetí test: bez `showSettings` se gear nezobrazí, účet zůstává. Bez mocku `next/link` (pod jsdom se renderuje jako `<a href>`).

## 2026-06-21 — admin-system-tools: Task 26.10 — Integrační test server action `sendTestEmail`

### Hotové tasky
- 26.10 `src/app/admin/system/__tests__/send-test-email.test.ts` — ověřeno `pnpm test:run` (5 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/send-test-email.test.ts` — integrační test `sendTestEmail` (R22.1, R22.3, R22.4, R22.5, R22.6). `@/lib/admin/require-admin` mockován jako admin ok s builderem nad `system_settings` (`select().eq().maybeSingle()` vrací řízenou hodnotu `last_sent_at`; `upsert()` jako spy). `@/lib/email/client` (`sendEmail`) spy s řízeným návratem (úspěch / `{ error }`); `@/lib/log-server` no-op. `HOREA_ADMIN_EMAIL` přes `vi.stubEnv`, cooldown přes fake timers (`vi.setSystemTime`). Testy: úspěch (žádný předchozí záznam) → `to === HOREA_ADMIN_EMAIL`, `{ ok:true }`, upsert `last_sent_at` proběhl; chybějící env → `{ ok:false, reason:'no_admin_email' }` bez odeslání; aktivní cooldown → `reason:'cooldown'` + `retryAfterSeconds>0`, bez odeslání i zápisu; selhání odeslání → `reason:'send_failed'`, bez zápisu; výsledek bez PII (adresa jen z env, action bez argumentů).

## 2026-06-21 — admin-system-tools: Task 26.11 — Integrační test recheckHealth

### Hotové tasky
- 26.11 `src/app/admin/system/__tests__/recheck-health.test.ts` — ověřeno `pnpm test:run` (4 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/recheck-health.test.ts` — integrační test server action `recheckHealth` (R21.1, R21.2). Mockuje `@/lib/admin/require-admin` (admin/ne-admin) a `@/lib/system/health` (`runHealthChecks` → řízený `HealthReport`: 6 služeb + aggregate + pevný `checkedAt`); `@/lib/log-server` no-op. Ověřuje: admin → `runHealthChecks` znovu spuštěn a vrácen `{ ok:true, report }` s daným `checkedAt`; každý `services[]` prvek nese JEN klíče `service`/`label`/`status`/`latencyMs`/`errorKind` (žádná Secret_Value); opětovné volání spustí check znovu; ne-admin → `{ ok:false }` a `runHealthChecks` NEvolán (R21.4).
- **Pozn.:** `ServiceStatus`/`AggregateStatus` v `@/lib/system/status` má literály `'ok' | 'degraded' | 'down'` (ne `'operational'`) — řízený `HealthReport` v testu musí používat tyto hodnoty.

## 2026-06-21 — admin-system-tools: Task 26.6 — Integrační test server-side admin re-check + side-effect guards

### Hotové tasky
- 26.6 `src/app/admin/system/__tests__/admin-recheck.test.ts` — ověřeno `pnpm test:run` (6 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/admin-recheck.test.ts` — integrační test defense-in-depth re-checku (R2.4) pro všech 5 server actions stránky `/admin/system`. Ne-admin session simulována mockem `@/lib/admin/require-admin` (`requireAdmin` → `{ ok:false, message }`). Špehované side-effect kanály: `next/cache` (`revalidatePath`/`revalidateTag`), globální `fetch` (`vi.stubGlobal`), `@/lib/system/health` (`runHealthChecks`), `@/lib/email/client` (`sendEmail`), `@/lib/supabase/admin` (`createAdminClient` builder s `delete`/`upsert` spy); `@/lib/log-server` no-op. Pro každou action ověřeno odmítnutí (`ok:false`) A že odpovídající side-effect NEbyl volán. Šestý test čte zdroj `src/lib/admin/require-admin.ts` (přes `process.cwd()` join) a ověřuje přítomnost `import 'server-only'`.
- **Pozn.:** `import.meta.url` pod vitest/oxc runnerem není `file://` URL → `fileURLToPath` vyhodí „The URL must be of scheme file". Pro čtení zdroje v testu použij `join(process.cwd(), 'src/...')` místo `new URL(..., import.meta.url)`.

## 2026-06-21 — admin-system-tools: Task 24.5 — Test neměnnosti návratových hodnot cron rout

### Hotové tasky
- 24.5 `src/app/api/cron/__tests__/record-run-invariance.test.ts` — ověřeno `pnpm test:run` (5 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/api/cron/__tests__/record-run-invariance.test.ts` — testy invariantnosti kontraktu všech 4 cron rout (cleanup, billing, warnings, email-retry) po obalení `recordCronRun` (R11.4). `@/lib/cron/record-run` mockován jako transparentní průchod (jen zavolá předaný `run()` a vrátí výsledek, žádný DB zápis) + spy na `(job, trigger)`. `verifyCronAuthorization` → `{ ok:true }`; `createAdminClient` → chainable thenable query builder řešící každý dotaz jako prázdný úspěch (`{ data:[], error:null }`); doménové závislosti (`chargeMonthly`, `createGopayClient`, `transitionToGracePeriod`, `dispatchTransactionalEmail`, `notifyAdminCronFailure`, `drainEmailOutbox`, `purgeOldOutbox`) mockované na minimální úspěšný průchod; `serverLog` no-op. Každá routa ověřena na HTTP 200 + nezměněné JSON tělo metrik a volání `recordCronRun` se správným `job`/`trigger`; navíc `?trigger=manual` → `trigger='manual'`.

## 2026-06-21 — admin-system-tools: Task 26.8 — Integrační test triggerCron

### Hotové tasky
- 26.8 `src/app/admin/system/__tests__/trigger-cron.test.ts` — ověřeno `pnpm test:run` (4 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/trigger-cron.test.ts` — integrační testy server action `triggerCron(job)`. Mock `@/lib/admin/require-admin` (`requireAdmin` → admin ok) a `@/lib/log-server` (spy). `fetch` mockován přes `vi.stubGlobal`, `CRON_SECRET` přes `vi.stubEnv`. Pokrytí: s nastaveným secretem a `job='cleanup'` → `fetch` volán právě jednou na URL obsahující `/api/cron/cleanup` + `trigger=manual`, hlavička `Authorization: Bearer <secret>`, výsledek `{ ok:true, job:'cleanup', httpStatus:200, httpOk:true }` (R12.1, R12.3); HTTP 500 → `httpOk:false`; bez `CRON_SECRET` → `{ ok:false, message:'cron tajemství není nastaveno' }` a `fetch` NEvolán (R12.4); ověřeno, že hodnota secretu neunikne do výsledku ani do logu (R12.5, R15.4). Úklid `vi.unstubAllGlobals`/`vi.unstubAllEnvs`/`vi.clearAllMocks` v `afterEach`.

## 2026-06-21 — admin-system-tools: Task 26.9 — Integrační test pruneCronRuns

### Hotové tasky
- 26.9 `src/app/admin/system/__tests__/prune-cron-runs.test.ts` — ověřeno `pnpm test:run` (4 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/prune-cron-runs.test.ts` — integrační testy server action `pruneCronRuns(days?)`. Mock `@/lib/admin/require-admin` (`requireAdmin` → `{ ok:true, actorUserId:'a', admin }`), kde admin je chainovatelný builder zachycující `from(table)`, `delete().lt(col,val)` a `select(col)` přes `vi.hoisted`; řízený výsledek `{ data, error }`. `serverLog` jako spy. Pokrytí: bez parametru → cutoff = `computePruneCutoff(now, DEFAULT_CRON_RETENTION_DAYS)` (fake timers, přesné porovnání) a `deleted` = počet vrácených řádků (R19.1, R19.2, R19.4); `days=30` → cutoff dle 30 dní; prázdný výsledek → `deleted: 0`; `from` volán JEN s `cron_runs`, nikdy `audit_log` (R19.5). Úklid `vi.useRealTimers` + `vi.clearAllMocks` v `afterEach`.

## 2026-06-21 — admin-system-tools: Task 26.7 — Integrační test revalidace cache

### Hotové tasky
- 26.7 `src/app/admin/system/__tests__/revalidate.test.ts` — ověřeno `pnpm test:run` (3 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/app/admin/system/__tests__/revalidate.test.ts` — integrační testy server action `revalidateTarget`. Mock `@/lib/admin/require-admin` (`requireAdmin` → úspěšný admin `{ ok:true, actorUserId:'a', admin }`) a `next/cache` (`revalidatePath`/`revalidateTag` spy přes `vi.hoisted`). Pokrytí: povolená cesta z `ALLOWED_PATHS` → `revalidatePath` volán s tou cestou + `{ ok:true, target }` (R10.1, R10.2, R10.4); cíl mimo allowlist (`/nope`, neznámý tag) → `{ ok:false }` a `revalidatePath`/`revalidateTag` NEvolány (R10.6). Test povoleného tagu je podmíněný (`ALLOWED_TAGS` je nyní prázdné → přeskočen). Úklid `vi.clearAllMocks` v `afterEach`.

## 2026-06-21 — admin-system-tools: Task 23.4 — Unit testy getCronStatuses

### Hotové tasky
- 23.4 `src/lib/system/__tests__/cron-monitor.test.ts` — ověřeno `pnpm test:run` (7 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/cron-monitor.test.ts` — příkladové unit testy I/O funkce `getCronStatuses()`. Mock `@/lib/supabase/admin` (`createAdminClient().from('cron_runs').select().eq('job',name).order('started_at',{ascending:false}).limit(1)`) jako chainovatelný builder; per-job řízený `{ data, error }` v mapě podle jobu zachyceného z `.eq('job', …)`, argumenty zaznamenané přes `vi.hoisted`. Pokrytí: tvar dotazu (4× `cron_runs`, order desc, limit 1, R11.1); mapování posledního běhu na ne-PII `CronRunRecord` vč. neznámý status/trigger → `ok`/`scheduled` (R11.1, R11.2); job bez záznamu (`data: []`) → `lastRun: null` (R11.3); chyba kteréhokoli dotazu → celé `null` (fallback R13.4); rekurzivní kontrola, že serializovaný výsledek nese jen ne-PII klíče.

## 2026-06-21 — admin-system-tools: Task 23.2 — Unit testy recordCronRun

### Hotové tasky
- 23.2 `src/lib/cron/__tests__/record-run.test.ts` — ověřeno `pnpm test:run` (9 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/cron/__tests__/record-run.test.ts` — unit testy obalu `recordCronRun(job, trigger, run)`. Mock `@/lib/supabase/admin` (`createAdminClient().from().insert().select().single()` pro start, `update().eq()` pro finish) s konfigurovatelným chováním (`ok`/`error`/`throw`) a záznamem argumentů přes `vi.hoisted`; mock `@/lib/log-server` jako spy. Pokrytí: úspěch zapíše start (status `running`) i finish (finální status z výsledku + detail jen čísla) a vrátí výsledek handleru; best-effort — selhání insertu/update (vrácený `error` i vyhozená výjimka) job neshodí a zaloguje `serverLog.warn`; výjimka handleru → re-throw + finish status `error`; `sanitizeDetail` propustí jen konečná čísla (NaN/Infinity/string/PII se zahodí, prázdný detail → null) (R11.4, R15.4).

## 2026-06-21 — admin-system-tools: Task 19.2 — Příkladové testy getOperationalMetrics

### Hotové tasky
- 19.2 `src/lib/system/__tests__/metrics.test.ts` — ověřeno `pnpm test:run` (8 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/metrics.test.ts` — příkladové unit testy I/O funkce `getOperationalMetrics()`. Mock `@/lib/supabase/admin` (`createAdminClient().from(table).select(columns, options)`) vrací per-tabulku řízený `{ count, error }` a zaznamenává argumenty přes `vi.hoisted`. Pokrytí: úspěch → `db` s počty z mock countů (a `null` count → 0); ověření, že select je volán s `{ count: 'exact', head: true }` (head → žádná data řádků, R23.4) a výstup neobsahuje PII; storage vždy `{ available: false }` bez extra dotazu (R23.2, R23.3); selhání jednoho countu (`error`) → `db: null` a selhání `createAdminClient` (throw, chybějící env) → `db: null` (R23.5).

### Hotové tasky
- 17.2 `src/lib/system/__tests__/backup-status.test.ts` — ověřeno `pnpm test:run` (5 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/backup-status.test.ts` — příkladové unit testy I/O wrapperu `getBackupStatus(driveStatus)`. Mock `process.env` přes `vi.stubEnv` (úklid `vi.unstubAllEnvs` v `afterEach`). Pokrytí: všechny GOOGLE_* klíče nastavené → `configured=true`; chybí jeden klíč (smazán přes `vi.stubEnv(key, undefined)`) → `configured=false`; `driveStatus` se věrně převezme z parametru (ok/degraded/down); `info` je neprázdný string; hodnoty env proměnných se neobjeví v `JSON.stringify` výsledku (R18.1, R18.2, R18.3, R18.5).

## 2026-06-21 — admin-system-tools: Task 13.3 — Integrační test orchestrace health checku

### Hotové tasky
- 13.3 `src/lib/system/__tests__/health.orchestration.test.ts` — ověřeno `pnpm test:run` (4 testy passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/health.orchestration.test.ts` — integrační testy `runHealthChecks()` se třemi mock kanály (žádná reálná síť): `@/lib/supabase/admin` (`createAdminClient().from().select()`), `aws4fetch` (`AwsClient.fetch` pro R2) a routovaný globální `fetch` (resend/smtp2go/gopay/google podle hostitele v URL). Sdílené, per-test přenastavitelné chování probe (`delayMs` + `mode: ok|httpError|throw|hang`) drženo ve `vi.hoisted`, aby na něj dosáhly hoistnuté `vi.mock` factory. Determinismus přes **fake timers**: mock odpovědi se vyřeší přes `setTimeout(delayMs)`, čas posouván `vi.advanceTimersByTimeAsync` (latence uvnitř probe běží z `Date.now()`, které fake timers řídí). Pokrytí: (1) všech 6 služeb ve fixním pořadí + aggregate/checkedAt; (2) paralelismus — báze 1000 ms/probe, ověřeno že report NENÍ hotový v 999 ms ale je hotový v 1000 ms (sériově by trval 6000 ms); (3) tvrdý strop — všechny probe „visí", po posunu o 6 s se běh přesto vrátí a služby jsou `down`/`timeout`/`latencyMs=null`; (4) izolace selhání — `throw` u resend → resend `down`, ostatní `ok`, běh se nevyhodí.

### Pozn. k implementaci
- Tvrdý strop 6 s je v `health.ts` defenzivní backstop: každá probe je obalena `withTimeout` (5 s), takže `Promise.allSettled` se vždy vyřeší ≤ 5 s a větev `raced === 'capped'` je za normálního provozu nedosažitelná. Test proto ověřuje pozorovatelnou garanci (ohraničený návrat + `down`/`timeout`), nikoli interní větev stropu.

## 2026-06-21 — admin-system-tools: Task 16.2 — Unit testy getOutboxStatus

### Hotové tasky
- 16.2 `src/lib/system/__tests__/outbox-status.test.ts` — ověřeno `pnpm test:run` (6 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/outbox-status.test.ts` — příkladové unit testy pro `getOutboxStatus()`: mock `@/lib/supabase/admin` (`createAdminClient`) zachytává argumenty `from`/`select` a vrací řízená data. Ověřuje, že se čte jen z `email_outbox` a vybírá přesně `status, created_at, next_attempt_at` (žádné `to_email`/`subject`/`html_body`/`text_body`, R17.5); korektní agregaci counts/oldestPendingAt/readyToRetry z mock řádků (R17.1–R17.4, deterministický `now` přes `vi.setSystemTime`); ignorování neznámých stavů; fallback `null` při `{ error }` i při chybějících datech (R17.7).

## 2026-06-21 — admin-system-tools: Task 15.2 — Unit testy getDeployInfo

### Hotové tasky
- 15.2 `src/lib/system/__tests__/build-info.test.ts` — ověřeno `pnpm test:run` (6 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/build-info.test.ts` — příkladové unit testy pro `getDeployInfo()`: mapování VERCEL_* na pole, fallback `VERCEL_DEPLOY_ID`, `'nedostupné'` pro chybějící i neplatné `VERCEL_ENV`, ořez bílých znaků, ověření že hodnota tajného klíče (`SUPABASE_SERVICE_ROLE_KEY`) není v `JSON.stringify` výstupu (R16.6, R16.7). Mock `process.env` přes `vi.stubEnv`, úklid `vi.unstubAllEnvs`; `nodeVersion` se porovnává proti `process.version`.

### Bug & fix
- **Symptom:** Test fallbacku selhal — `expected 'nedostupné' to be 'dpl_fallback'`.
- **Root cause:** `getDeployInfo` používá `??`, takže prázdný řetězec u `VERCEL_DEPLOYMENT_ID` není „missing" a fallback se neaktivuje; test ho nastavoval na `''`.
- **Fix:** Test nastavuje primární proměnnou na `undefined` (`vi.stubEnv('VERCEL_DEPLOYMENT_ID', undefined)`), což odpovídá skutečnému scénáři „proměnná není nastavena". Kód beze změny.

## 2026-06-21 — admin-system-tools: Task 14.2 — Unit testy getConfigReport

### Hotové tasky
- 14.2 `src/lib/system/__tests__/config-report.test.ts` — ověřeno `pnpm test:run` (8 testů passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/config-report.test.ts` — příkladové unit testy pro `getConfigReport()`: odvození `logLevel` z `LOG_LEVEL` (i default `info`), příznaky set/unset (truthy/undefined/prázdná hodnota), záznam pro každý očekávaný klíč, absence jakékoli hodnoty proměnné v serializaci reportu a neprázdný `logLocationInfo`. Mock `process.env` přes `vi.stubEnv`, úklid `vi.unstubAllEnvs` v `afterEach`.

## 2026-06-21 — admin-system-tools: Task 28.1 — Stránka /admin/system

### Hotové tasky
- 28.1 `src/app/admin/system/page.tsx` — ověřeno `pnpm exec eslint` (exit 0), `pnpm exec tsc --noEmit` (žádné chyby v souboru) a `pnpm build` (route `ƒ /admin/system`, dynamicky renderovaná).

### Nové funkce
- `src/app/admin/system/page.tsx` — server komponenta (`export const dynamic = 'force-dynamic'`) skládající všechny provozní sekce Správy systému (R13, R14). Na začátku **nezávislý `requireAdmin()` re-check** (defense in depth, R2.4); při neúspěchu vykreslí `Notice variant="error"` a žádný nástroj nenačte. Sekce: stav služeb (`runHealthChecks` → `HealthRecheckButton`, s warning fallbackem když health hodí výjimku), informace o nasazení (`getDeployInfo`), stav e-mailové fronty (`getOutboxStatus`, odkaz na `/api/cron/email-retry`), stav záloh (`getBackupStatus` se stavem Google z health reportu: `services.find(s=>s.service==='google')?.status ?? 'down'`), čerstvost GoPay webhooku (`getWebhookFreshness`, explicitní „proxy" hláška, prahová hodnota z `WEBHOOK_FRESHNESS_THRESHOLD_HOURS`), provozní metriky (`getOperationalMetrics`), konfigurace (`getConfigReport` — jen přítomnost klíčů, nikdy hodnoty), logy & hranice auditu (odkaz `/admin/audit`, append-only/neperzistence text), revalidace cache (`RevalidatePanel`), cron monitor (`getCronStatuses` + rozvrh `CRON_SCHEDULE_MAP` + příští běh `computeNextRun` per-job v try/catch + drift `detectScheduleDrift` self-check), retence (`PruneCronRunsPanel`), ruční spuštění (`CronTriggerPanel`), test e-mail (`TestEmailPanel`). Každá I/O sekce má český fallback „… je momentálně nedostupné" (R13.4); všechny stavy textovým labelem (ne jen barvou, R14.1); žádné Secret_Value/PII na stránce.

## 2026-06-21 — admin-system-tools: Task 27.2 — Panel ručního spuštění cronu (CronTriggerPanel)

### Hotové tasky
- 27.2 `CronTriggerPanel` — ověřeno `pnpm exec eslint src/app/admin/system/CronTriggerPanel.tsx` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/admin/system/CronTriggerPanel.tsx` — `'use client'` komponenta (R12.2, R12.3, R14.2, R14.3, R15.2). Vypisuje 4 registrované joby z `CRON_SCHEDULE_MAP` (cleanup/billing/warnings/email-retry) s českým labelem a rozvrhem. Per-job **explicitní potvrzení** („Spustit" → „Potvrdit" / „Zrušit"), pak volá `triggerCron(job)`. Výsledek v `aria-live="polite"` regionu textovým labelem přes `Notice`: úspěšný HTTP běh → `neutral` (label + „úspěch (HTTP …)"), neúspěch/chyba → `error` (text z akce, vč. stavu „cron tajemství není nastaveno"). Nativní `<button>` → klávesová ovladatelnost; během potvrzení/běhu jsou ostatní spouštěče disabled. Reuse `Card`/`Notice`/`Button`. Žádné tajemství na klientu.

## 2026-06-21 — admin-system-tools: Task 27.3 — Panel retence cron_runs (PruneCronRunsPanel)

### Hotové tasky
- 27.3 `PruneCronRunsPanel` — ověřeno `pnpm exec eslint src/app/admin/system/PruneCronRunsPanel.tsx` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/admin/system/PruneCronRunsPanel.tsx` — `'use client'` komponenta (R19.2–R19.4, R14.2, R14.3, R15.2). **Destruktivní** akce s dvoufázovým explicitním potvrzením („Smazat staré běhy" → `Notice variant="warning"` „Opravdu smazat?" + „Opravdu smazat" / „Zrušit"). Volitelné pole retence (dní); prázdná hodnota → akce dostane `undefined` a server použije `DEFAULT_CRON_RETENTION_DAYS` (90). Volá `pruneCronRuns(days)`; výsledek (počet smazaných řádků nebo česká chyba) v `aria-live="polite"` regionu textovým labelem přes `Notice` (úspěch → `neutral`, chyba → `error`). Nativní `<input>`/`<button>` → klávesová ovladatelnost. Reuse `Card`/`Notice`/`Button`/`Input`.

## 2026-06-21 — admin-system-tools: Task 27.1 — Panel revalidace cache (RevalidatePanel)

### Hotové tasky
- 27.1 `RevalidatePanel` — ověřeno `pnpm exec eslint src/app/admin/system/RevalidatePanel.tsx` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/admin/system/RevalidatePanel.tsx` — `'use client'` komponenta (R10.3, R14.1–R14.3, R15.2). Cíl revalidace se vybírá **výhradně z allowlistu** přes nativní `<select>` (`ALLOWED_PATHS` jako `path`, `ALLOWED_TAGS` jako `tag`) — žádný volný text (R10.5). Dvoukrokové **explicitní potvrzení** („Revalidovat cache" → „Potvrdit revalidaci" / „Zrušit"), pak volá `revalidateTarget(target)`. Výsledek v `aria-live="polite"` regionu textovým labelem přes `Notice`: úspěch → `neutral` (vč. názvu cíle), chyba → `error` (text z akce). Když je allowlist prázdný, zobrazí `warning` hlášku místo výběru. Nativní `<select>`/`<button>` → klávesová ovladatelnost (R14.2). Reuse `Card`/`Notice`/`Button`.

## 2026-06-21 — admin-system-tools: Task 27.5 — Tlačítko re-checku health (HealthRecheckButton)

### Hotové tasky
- 27.5 `HealthRecheckButton` — ověřeno `pnpm exec eslint src/app/admin/system/HealthRecheckButton.tsx` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/admin/system/HealthRecheckButton.tsx` — `'use client'` komponenta (R21.1–R21.3, R14.2, R14.3). Bere `initialReport: HealthReport` ze server renderu a vykresluje agregovaný stav + tabulku služeb (stav i latence). Tlačítko „Zkontrolovat znovu" volá `recheckHealth()`; po úspěchu aktualizuje stavy služeb i `checkedAt`, při chybě zobrazí českou hlášku přes `Notice variant="error"`. Stavy textovým labelem (`v pořádku`/`zhoršené`/`nedostupné`, ne jen barva); agregace a `checkedAt` v `aria-live="polite"` regionu. `checkedAt` formátováno pevně v `Europe/Prague` (deterministicky SSR↔klient). Nativní `<button>` → klávesová ovladatelnost. Reuse `Card`/`Notice`/`Button`.

## 2026-06-21 — admin-system-tools: Task 27.4 — Panel testovacího e-mailu (TestEmailPanel)

### Hotové tasky
- 27.4 `TestEmailPanel` — ověřeno `pnpm exec eslint src/app/admin/system/TestEmailPanel.tsx` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/admin/system/TestEmailPanel.tsx` — `'use client'` komponenta (R22, R14, R15). Dvoukrokové **explicitní potvrzení** (tlačítko „Odeslat testovací e-mail" odhalí krok „Potvrdit odeslání" / „Zrušit"), pak volá `sendTestEmail()` **bez cíle od klienta** (R22.5). Výsledek v `aria-live="polite"` regionu textovým labelem přes `Notice`: úspěch → `neutral`, `cooldown` → `warning` (text vč. `retryAfterSeconds` z akce), ostatní (`not_authorized`/`no_admin_email`/`send_failed`) → `error`. Zobrazuje pouze text vrácený akcí — žádné PII nad rámec adresy. Nativní `<button>` prvky → klávesová ovladatelnost. Reuse `Card`/`Notice`/`Button`.

## 2026-06-21 — admin-system-tools: Tasky 26.2–26.5 — server actions (triggerCron, pruneCronRuns, recheckHealth, sendTestEmail)

### Hotové tasky
- 26.2 `triggerCron`, 26.3 `pruneCronRuns`, 26.4 `recheckHealth`, 26.5 `sendTestEmail` — ověřeno `pnpm exec eslint src/app/admin/system/actions.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru; přetrvávají jen nesouvisející chyby v test fixtures `charge.test.ts`, `reservation-emails.test.ts`, `tests/properties/*`).

### Nové funkce
- `src/app/admin/system/actions.ts` — rozšíření existujícího souboru (zachován `revalidateTarget`) o čtyři server actions. Všechny začínají `requireAdmin()` re-checkem (defense in depth R2.4); při `!ok` vrací `{ ok:false, message }` bez side-effectu.
  - `triggerCron(job)`: validace `job in CRON_SCHEDULE_MAP` (anti-SSRF), chybějící `CRON_SECRET` → `{ ok:false, message:'cron tajemství není nastaveno' }` bez fetch; jinak server-side `fetch` `/api/cron/<job>?trigger=manual` s `Authorization: Bearer <CRON_SECRET>`. Base URL přes `resolveCronBaseUrl()` (`NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost). Secret jen v hlavičce, nikdy do logu/výsledku.
  - `pruneCronRuns(days?)`: `days ?? DEFAULT_CRON_RETENTION_DAYS`; service-role `delete from cron_runs where started_at < computePruneCutoff(now, days)` + `.select('id')` → počet smazaných. Maže výhradně `cron_runs`.
  - `recheckHealth()`: reuse `runHealthChecks()`, vrací nový `HealthReport` vč. `checkedAt`.
  - `sendTestEmail()`: bez parametru cíle; chybějící `HOREA_ADMIN_EMAIL` → `no_admin_email`; cooldown ze `system_settings` klíče `test_email_last_sent_at` přes `computeCooldownState` (perzistence kvůli serverless caveatu) → při zákazu `reason:'cooldown'` + `retryAfterSeconds`; jinak `sendEmail` výhradně na env adresu, po úspěchu upsert `last_sent_at` (best-effort). Diskriminovaná unie s `reason`; výsledek/logy bez PII.

## 2026-06-21 — admin-system-tools: Task 24.2 — integrace recordCronRun do billing route

### Hotové tasky
- 24.2 Obalit `billing` route — ověřeno `pnpm exec eslint src/app/api/cron/billing/route.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru; existující chyby jsou jen v nesouvisejících test fixtures `charge.test.ts` / `reservation-emails.test.ts`).

### Nové funkce
- `src/app/api/cron/billing/route.ts` — po úspěšném `verifyCronAuthorization` obalena doménová logika `recordCronRun('billing', trigger, …)` (R11.4), shodným vzorem jako cleanup route (24.1). Trigger inline z query parametru: `?trigger=manual` → `'manual'`, jinak `'scheduled'`. Inner `run()` vrací `BillingRunResult = CronRunResult & { response: Response }`, route vrací `response` → návratová hodnota i HTTP status (200/500/401) beze změny. `detail` = číselné metriky `{ processed, charged, graced, kept, failed }`; query-error větev `status:'error'` bez detailu. Doménová logika (chargeMonthly / grace transition / continue-on-error) beze změny.

## 2026-06-21 — admin-system-tools: Task 24.3 — integrace recordCronRun do warnings route

### Hotové tasky
- 24.3 Obalit `warnings` route — ověřeno `pnpm exec eslint src/app/api/cron/warnings/route.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/api/cron/warnings/route.ts` — po úspěšném `verifyCronAuthorization` obalena doménová logika `recordCronRun('warnings', trigger, …)` (R11.4), shodným vzorem jako cleanup (task 24.1). Trigger inline z query parametru: `?trigger=manual` → `'manual'`, jinak `'scheduled'`. Inner `run()` vrací `WarningsRunResult = CronRunResult & { response: Response }`, route vrací `response` → návratová hodnota i HTTP status (200/500/401) beze změny. Do `detail` jdou číselné metriky `{ processed, due, sent, skipped, failed }`; obě query-error větve vrací `status:'error'` bez detailu. Doménová logika (predikát `warningKindFor`, dohledání e-mailů, per-business continue-on-error, odeslání) beze změny. Zápis běhu best-effort (řeší `recordCronRun`).

## 2026-06-21 — admin-system-tools: Task 24.1 — integrace recordCronRun do cleanup route

### Hotové tasky
- 24.1 Obalit `cleanup` route — ověřeno `pnpm exec eslint src/app/api/cron/cleanup/route.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `src/app/api/cron/cleanup/route.ts` — po úspěšném `verifyCronAuthorization` obalena doménová logika `recordCronRun('cleanup', trigger, …)` (R11.4). Trigger se odvozuje z query parametru: `?trigger=manual` → `'manual'`, jinak `'scheduled'` (konvence pro ruční spuštění z `Cron_Trigger`, task 26.2, přes tentýž endpoint). Doménová logika beze změny; inner `run()` vrací `CleanupRunResult = CronRunResult & { response: Response }`, route vrací `response` → návratová hodnota i HTTP status (200/500/401) zůstaly identické. Do `detail` jdou číselné metriky `{ processed, deleted, failed }`; query-error větev vrací `status:'error'` bez detailu. Zápis běhu je best-effort (řeší `recordCronRun`).

## 2026-06-21 — admin-system-tools: Task 23.1 — recordCronRun() helper

### Hotové tasky
- 23.1 `recordCronRun()` — ověřeno `pnpm exec eslint src/lib/cron/record-run.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `recordCronRun<T extends CronRunResult>(job, trigger, run)` + typy `CronJobName`/`CronTrigger`/`CronRunResult` (`src/lib/cron/record-run.ts`, `import 'server-only'`) — obalí běh cron jobu: přes service-role klienta (`createAdminClient`) vloží start řádek do `cron_runs` (`started_at=now`, přechodný `status='running'`, `trigger`), spustí `run()`, po doběhnutí UPDATE `finished_at` + finální `status` (`ok`/`error`) + `detail`. Detail prochází `sanitizeDetail()` — ponechá jen konečné číselné metriky (žádný Secret_Value/PII, žádné NaN/Infinity, R15.4). VŠECHNY zápisy do `cron_runs` jsou best-effort v `try/catch` (selhání jen `serverLog.warn`, nikdy neshodí job, R11.4). Při výjimce z `run()` zapíše `status='error'` (bez detailu) a chybu re-throw → chování routy se nemění. Start zápis přes `.select('id').single()`; když selže, finální UPDATE se přeskočí. Bez unit testů (task 23.2).

## 2026-06-21 — admin-system-tools: Task 18.1 — Webhook_Freshness_Monitor (getWebhookFreshness)

### Hotové tasky
- 18.1 `getWebhookFreshness()` — ověřeno `pnpm exec eslint src/lib/system/webhook-freshness.ts` (exit 0), `pnpm exec tsc --noEmit` (žádné chyby v souboru) a `pnpm test:run` PBT testu čisté funkce (3 passed).

### Nové funkce
- `getWebhookFreshness(): Promise<WebhookFreshness | null>` (`src/lib/system/webhook-freshness.ts`, doplněn `import 'server-only'`) — přes service-role klienta (`createAdminClient`) zjistí proxy čas `max(nejnovější subscriptions.updated_at, nejnovější payments.created_at)` (každý přes `order(desc).limit(1)`; `payments` má jen `created_at`), předá čisté `computeWebhookFreshness(proxy, new Date(), WEBHOOK_FRESHNESS_THRESHOLD_HOURS, true)`. Obě časová razítka chybí → proxy `null` (`hasActivity: false`). Chyba dotazu / nedostupný zdroj → `null` (UI: „čerstvost webhooku je momentálně nedostupná", konzistentní s `getOutboxStatus`). Čistá funkce zachována, `server-only` je ve vitestu stub. Bez unit testů (task 18.2). Ověřené sloupce: `subscriptions.updated_at` (migrace 0005), `payments.created_at` (migrace 0005, bez `updated_at`).

## 2026-06-21 — admin-system-tools: Task 23.3 — Cron_Monitor (getCronStatuses)

### Hotové tasky
- 23.3 `getCronStatuses()` — ověřeno `pnpm exec eslint src/lib/system/cron-monitor.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru).

### Nové funkce
- `getCronStatuses(): Promise<CronJobStatus[] | null>` + typy `CronRunRecord`/`CronJobStatus` (`src/lib/system/cron-monitor.ts`, `import 'server-only'`) — čte poslední běh každého ze 4 cron jobů (`cleanup`/`billing`/`warnings`/`email-retry`) z `cron_runs` přes service-role klienta (`createAdminClient`). Pro každý job `select` ne-PII sloupců (`id, job, started_at, finished_at, status, trigger, detail`) + `eq('job', name)` + `order('started_at', desc)` + `limit(1)`; chybí-li záznam → `lastRun: null` (R11.3). Při chybě/nedostupnosti zdroje vrací `null` (UI: „stav cronů je momentálně nedostupný", konzistentní s `getOutboxStatus`). `CronJobName` importován z `cron-schedule.ts`. Bez unit testů (ty jsou task 23.4).

## 2026-06-21 — admin-system-tools: Task 13.1 — Health_Checker (orchestrace + I/O)

### Hotové tasky
- 13.1 `runHealthChecks()` — ověřeno `pnpm exec eslint src/lib/system/health.ts` (exit 0) a `pnpm exec tsc --noEmit` (žádné chyby v souboru; zbylé chyby jsou jen v pre-existujících `tests/properties/*`).

### Nové funkce
- `runHealthChecks(): Promise<HealthReport>` + typy `ServiceName`/`ServiceProbeResult`/`HealthReport` (`src/lib/system/health.ts`, `import 'server-only'`) — I/O vrstva health checků. Reuse čistého `mapProbeStatus`/`aggregateStatus`/`ProbeOutcome` z `./status`. 6 read-only/non-mutating probe měřících latenci: Supabase (service-role HEAD `count` na `businesses`), Resend (GET `/domains`), SMTP2GO (POST `/v3/stats/email_summary` — jen stats, neodesílá), GoPay (OAuth `client_credentials` token, žádná platba), R2 (podepsaný `ListObjectsV2` `max-keys=1` přes `aws4fetch`), Google (refresh OAuth tokenu). `withTimeout` (Promise.race, 5 s → `{kind:'timeout'}` + `abort`), `Promise.allSettled` paralelně, tvrdý strop 6 s, `checkedAt` ISO UTC. `errorKind` je jen bezpečná kategorie (`http_error`/`network_error`/`timeout`/`unexpected`), NIKDY tajemství/původní zpráva. Měkká hranice latence `degraded` = 2000 ms.

## 2026-06-21 — admin-system-tools: Task 17.1 — I/O wrapper getBackupStatus

### Hotové tasky
- 17.1 `getBackupStatus()` — ověřeno `pnpm exec eslint src/lib/system/backup-status.ts` (exit 0), `pnpm exec tsc --noEmit` (žádné chyby v souboru) a `pnpm test:run src/lib/system/__tests__/backup-status.pbt.test.ts` (1 passed).

### Nové funkce
- `getBackupStatus(driveStatus: ServiceStatus): BackupStatus` (`src/lib/system/backup-status.ts`) — tenký I/O wrapper, který předá `process.env` a předaný Google `Service_Status` (volající ho získá z Health_Checker, wrapper health nevolá duplicitně) čisté funkci `buildBackupStatus`. Modul nově `import 'server-only'` (ve vitestu stub) — čistá funkce `buildBackupStatus`/`GOOGLE_BACKUP_ENV_KEYS` zůstala beze změny a property test prochází.

## 2026-06-21 — admin-system-tools: Task 16.1 — I/O wrapper getOutboxStatus

### Hotové tasky
- 16.1 `getOutboxStatus()` — ověřeno `pnpm exec eslint src/lib/system/outbox-status.ts` (exit 0), `pnpm exec tsc --noEmit` (žádné chyby v souboru) a `pnpm test:run src/lib/system/__tests__/outbox-status.pbt.test.ts` (1 passed).

### Nové funkce
- `getOutboxStatus()` (`src/lib/system/outbox-status.ts`) — I/O wrapper přes service-role klienta (`createAdminClient`), který z `email_outbox` čte POUZE ne-PII sloupce `status, created_at, next_attempt_at` (nikdy `to_email`/`subject`/`html_body`/`text_body`) a předá je čisté `summarizeOutbox`. Návratový typ `Promise<OutboxStatus | null>`, kde `null` = nedostupný zdroj (UI „stav e-mailové fronty je momentálně nedostupný", R17.7) — konzistentní s `metrics.ts` (`db: DbMetrics | null`). DB stavy `pending`/`sent`/`dead` mapují 1:1 na `OutboxRowMeta['status']`, neznámé stavy se bezpečně ignorují. Modul nově `import 'server-only'` (ve vitestu stub); čistá `summarizeOutbox` beze změny a property test prochází.

## 2026-06-21 — admin-system-tools: Task 15.1 — I/O wrapper getDeployInfo

### Hotové tasky
- 15.1 `getDeployInfo()` — ověřeno `pnpm exec eslint src/lib/system/build-info.ts` (exit 0) a `pnpm test:run src/lib/system/__tests__/build-info.pbt.test.ts` (1 passed).

### Nové funkce
- `getDeployInfo()` (`src/lib/system/build-info.ts`) — tenký I/O wrapper, který předá neutajené `VERCEL_*` proměnné (SHA, REF, ENV, DEPLOYMENT_ID s fallbackem DEPLOY_ID) a `process.version` čisté funkci `buildDeployInfo`. Modul nově `import 'server-only'` (ve vitestu stub) — čistá funkce `buildDeployInfo`/`UNAVAILABLE` zůstala beze změny a property test prochází.

## 2026-06-21 — admin-system-tools: Checkpoint (Task 12) — stabilizace property testů čistého jádra

### Hotové tasky
- 12 Checkpoint — ověřeno `pnpm test:run` (620 passed | 57 skipped, 0 failed) a `pnpm lint` (exit 0; jen neškodné varování o Node engine).

### Bug & fix
- **Symptom:** `pnpm test:run` občas selhal (seed-dependent flaky) ve `config-report.pbt.test.ts`, `email-cooldown.pbt.test.ts`, `cron-schedule.pbt.test.ts`, `outbox-status.pbt.test.ts`. U config-report: `AssertionError: expected true to be false` (tajná hodnota „nalezena" ve výstupu). U ostatních: `RangeError: Invalid time value` z `.toISOString()`.
- **Root cause:**
  1. `config-report.pbt.test.ts` používal sentinel prefix `SECRET_`, který je podřetězcem reálných názvů klíčů (např. `SECRET_A` ⊂ `R2_SECRET_ACCESS_KEY`). Kontrola „žádná hodnota ve výstupu" pak hlásila falešný pozitiv proti názvu klíče, ne proti hodnotě. Implementace `buildConfigReport` je korektní — hodnoty nikdy neemituje.
  2. `fc.date({min,max})` v fast-check 4 může generovat `Invalid Date` i v rozsahu; `email-cooldown`, `cron-schedule` a `outbox-status` to neošetřily, takže `now`/ISO konverze čas od času spadly mimo vstupní prostor funkcí.
- **Fix (jen testy, čisté jádro beze změny):**
  - `config-report.pbt.test.ts`: sentinel prefix změněn na malými písmeny `secretvalue_` (nikdy podřetězec VELKÝCH názvů klíčů); upraven i odpovídající `startsWith` filtr.
  - `email-cooldown.pbt.test.ts`, `cron-schedule.pbt.test.ts`, `outbox-status.pbt.test.ts`: do `fc.date(...)` doplněno `noInvalidDate: true` (`prune-cutoff` a `webhook-freshness` už invalid data filtrovaly přes `.filter(d => !Number.isNaN(d.getTime()))`).
- **Nefungovalo:** spoléhat jen na `min`/`max` u `fc.date` nestačí k vyloučení `Invalid Date`.

## 2026-06-21 — admin-system-tools: Property testy cron rozvrhu (Tasky 11.2 a 11.3)

### Hotové tasky
- 11.2 Property 13 — výpočet příštího běhu cronu — ověřeno `pnpm test:run src/lib/system/__tests__/cron-schedule.pbt.test.ts` (2 passed) a `pnpm exec eslint` (exit 0).
- 11.3 Property 14 — detekce driftu rozvrhu cronů — ověřeno týmž během.

### Nové funkce
- `src/lib/system/__tests__/cron-schedule.pbt.test.ts` — dvě fast-check property (`numRuns: 100`) nad `src/lib/system/cron-schedule.ts`:
  - Property 13 (R24.2) nad `computeNextRun(expr, now)`: generuje `now` a podporované výrazy `M H * * *` (M∈0..59, H∈0..23) a `*/N * * * *` (N∈1..59); ověřuje, že výsledek je ostře po `now`, vyhovuje výrazu (denní: UTC H/M sedí a delta < 24h; krokový: sek/ms == 0, minuta dělitelná N, delta ≤ N min) a je nejbližší budoucí.
  - Property 14 (R24.4) nad `detectScheduleDrift(configured, monitored)`: generuje dvojice map (job→expr) z malého prostoru klíčů/výrazů; ověřuje set-logiku `missing`/`extra`/`mismatched` (vč. hodnot mismatched) a ekvivalenci „žádný drift ⟺ shodné mapy".

## 2026-06-21 — admin-system-tools: Property test agregace outboxu (Task 6.2)

### Hotové tasky
- 6.2 Property test — agregace stavu e-mailové fronty — ověřeno `pnpm test:run src/lib/system/__tests__/outbox-status.pbt.test.ts` (1 passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/outbox-status.pbt.test.ts` — Property 8 (fast-check, `numRuns: 100`) nad `summarizeOutbox(rows, now)` z `src/lib/system/outbox-status.ts`: generuje pole `OutboxRowMeta` (status pending/sent/dead, `createdAt`/`nextAttemptAt` jako ISO řetězce z `fc.date().toISOString()`, `nextAttemptAt` vč. null) a `now`; ověřuje součet `counts` == počet vstupů, rozdělení podle stavu, `oldestPendingAt` = nejmenší `createdAt` mezi pending (jinak null), `readyToRetry` = počet pending s `nextAttemptAt <= now` a tvar výstupu bez PII (R17.1–17.5).

## 2026-06-21 — admin-system-tools: Property test stavu záloh (Task 7.2)

### Hotové tasky
- 7.2 Property test — stav záloh nakonfigurováno iff všechny GOOGLE_* klíče přítomné — ověřeno `pnpm test:run src/lib/system/__tests__/backup-status.pbt.test.ts` (1 passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/backup-status.pbt.test.ts` — property test (fast-check, `numRuns: 100`) nad čistou funkcí `buildBackupStatus(env, driveStatus)` z `src/lib/system/backup-status.ts`:
  - Property 9: generuje env mapy s náhodnou podmnožinou `GOOGLE_BACKUP_ENV_KEYS` (chybí/prázdná/tajná `SECRET_*` hodnota) + nadbytečné `EXTRA_*` klíče a libovolný `driveStatus` (ok/degraded/down); ověřuje `configured === true` ⟺ všechny klíče truthy, věrné převzetí `driveStatus` a absenci jakékoli env hodnoty v `JSON.stringify(result)` (R18.1, R18.5).

## 2026-06-21 — admin-system-tools: Property testy stavu služeb (Task 1.2 + 1.3)

### Hotové tasky
- 1.2 Property test — mapování výsledku probe na status — ověřeno `pnpm test:run src/lib/system/__tests__/status.pbt.test.ts` (2 passed) a `pnpm exec eslint` (exit 0).
- 1.3 Property test — precedence agregovaného stavu — tentýž běh (2 passed) a lint (exit 0).

### Nové funkce
- `src/lib/system/__tests__/status.pbt.test.ts` — dva property testy (fast-check, `numRuns: 100`) nad čistými funkcemi z `src/lib/system/status.ts`:
  - Property 1 pro `mapProbeStatus(outcome, thresholds)`: generuje `ProbeOutcome` (success/error/timeout) + práh latence; ověřuje success&≤práh→`ok`, success&>práh→`degraded`, error|timeout→`down`, a u timeoutu diskriminant `kind==='timeout'` (R3.2/3.3/4.2/5.3).
  - Property 2 pro `aggregateStatus(statuses)`: generuje pole `ServiceStatus`; ověřuje precedenci `down`>`degraded`>`ok` včetně prázdného pole → `ok` (R5.1/5.2/5.3).

## 2026-06-21 — admin-system-tools: Property test allowlist cílů revalidace (Task 3.2)

### Hotové tasky
- 3.2 Property test — vynucení allowlistu cílů revalidace — ověřeno `pnpm test:run src/lib/system/__tests__/cache-targets.pbt.test.ts` (1 passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/cache-targets.pbt.test.ts` — Property 5 (fast-check, `numRuns: 100`) pro `isAllowedTarget(target)`: generuje cíle `RevalidateTarget` v obou větvích (`path`/`tag`) s hodnotami z allowlistu i náhodnými řetězci a ověřuje ekvivalenci `isAllowedTarget(t) === (t.kind==='path' ? ALLOWED_PATHS.includes(t.value) : ALLOWED_TAGS.includes(t.value))` (R10.5, R10.6).

## 2026-06-21 — admin-system-tools: Property test build/deploy info (Task 5.2)

### Hotové tasky
- 5.2 Property test — build info placeholder a bez tajemství — ověřeno `pnpm test:run src/lib/system/__tests__/build-info.pbt.test.ts` (1 passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/build-info.pbt.test.ts` — Property 7 (fast-check, `numRuns: 100`) pro `buildDeployInfo(env, nodeVersion)`: generuje env mapy (s/bez `VERCEL_*`, neplatné/orámcované `VERCEL_ENV`, navíc tajné klíče jako `SUPABASE_SERVICE_ROLE_KEY` s rozeznatelnou sentinel hodnotou) a verzi Node. Ověřuje: chybějící/prázdná/whitespace proměnná → `'nedostupné'` (R16.1/16.2/16.4/16.6), `environment` jen `production`/`preview`/`development` jinak `'nedostupné'` (R16.3), `nodeVersion` = předaná hodnota (R16.5), a že `JSON.stringify(result)` neobsahuje žádnou tajnou hodnotu (R16.7).

## 2026-06-21 — admin-system-tools: Property test hranice retence cronů (Task 8.2)

### Hotové tasky
- 8.2 Property test — monotonie hranice retence a „older-than" — ověřeno `pnpm test:run src/lib/system/__tests__/prune-cutoff.pbt.test.ts` (3 passed) a `pnpm exec eslint` (exit 0).

### Nové funkce
- `src/lib/system/__tests__/prune-cutoff.pbt.test.ts` — Property 10 (fast-check, `numRuns: 100`) pro `computePruneCutoff(now, days)`: ověřuje `cutoff = now - days` (přesný rozdíl v ms = `days * 86 400 000`), monotonii v `days` (`days1<=days2 ⇒ cutoff(days2)<=cutoff(days1)`) a predikát „older-than" (kandidát na smazání ⟺ čas záznamu ostře starší než cutoff; hranice se nemaže). `days` generováno jako celé číslo, aby Date konstruktor netruncoval sub-ms a zůstala přesná rovnost.

## 2026-06-21 — admin-system-tools: Čisté funkce rozvrhu a driftu cronů (Task 11.1)

### Hotové tasky
- 11.1 Implementovat `CRON_SCHEDULE_MAP`, `computeNextRun`, `detectScheduleDrift` — ověřeno `pnpm exec eslint src/lib/system/cron-schedule.ts` (exit 0).

### Nové funkce
- `CRON_SCHEDULE_MAP`, `computeNextRun(cronExpr, now)`, `detectScheduleDrift(configured, monitored)` + typy `CronJobName`, `ScheduleDrift` (`src/lib/system/cron-schedule.ts`) — čisté funkce (bez I/O). `CRON_SCHEDULE_MAP` přesně dle `vercel.json`. `computeNextRun` je minimalistický parser POUZE pro `'M H * * *'` (nejbližší budoucí den H:M UTC) a `'*/N * * * *'` (nejbližší budoucí minuta dělitelná N, vynulované s/ms), vždy ostře po `now`; nepodporovaný výraz → `throw`. `detectScheduleDrift` počítá `missing`/`extra`/`mismatched` set-logikou. `CronJobName` definován lokálně (kanonický zdroj přijde v tasku 23 `record-run.ts`).

## 2026-06-21 — admin-system-tools: Čistá funkce informací o nasazení (Task 5.1)

### Hotové tasky
- 5.1 Implementovat `buildDeployInfo` + `UNAVAILABLE` — ověřeno `pnpm exec eslint src/lib/system/build-info.ts` (exit 0).

### Nové funkce
- `buildDeployInfo(env, nodeVersion)` + typy `DeployEnvironment`, `DeployInfo` a konstanta `UNAVAILABLE = 'nedostupné'` (`src/lib/system/build-info.ts`) — čistá funkce (bez I/O) sestavující info o nasazení z neutajených `VERCEL_*` proměnných; chybějící/prázdné → `'nedostupné'`, `environment` mapováno jen na `production`/`preview`/`development`. I/O wrapper `getDeployInfo` přijde v tasku 15.1.

## 2026-06-21 — telegram-operator-notifications: Finální checkpoint (Task 14)

### Hotové tasky
- 14. Finální checkpoint — ověřeno: `pnpm test:run` (603 passed | 57 skipped, 0 failed), `pnpm lint` (exit 0, jen neškodný engine warning), `pnpm build` (✓ Compiled successfully). Bez oprav — vše prošlo na první pokus.

### Ověřeno buildem
- Produkční Next.js build zkompiloval nový Route Handler `/api/telegram/webhook` (`src/app/api/telegram/webhook/route.ts`) i `import 'server-only'` moduly v `src/lib/telegram/` bez chyb. Route je v build outputu jako dynamická (ƒ) funkce.

## 2026-06-21 — telegram-operator-notifications: Integrační testy hooků (Task 11.3)

### Hotové tasky
- 11.3 Integrační testy hooků notifikací (mock Notifieru) — ověřeno (`pnpm test:run` 5/5 passed, eslint exit 0)

### Nové funkce
- **Integrační test webhook hooku** (`src/lib/webhooks/__tests__/handler.notifications.test.ts`) — pokrývá R4.1/R6.1/R5.2 pro `processGopayWebhook`: PAID → `notifyPaymentConfirmed` právě jednou s `{ businessName, plan, amountCzk }`; dvojí doručení → notify CELKEM jednou (druhé `noop`); selhání notifikace (mock vyhodí) → stále `{ ok: true, outcome: 'paid_applied' }`. Guarded flip je nasimulován **stavovým** mock Supabase klientem (`QueryBuilder` třída): `payments.update(status:'paid')` překlopí sdílený stav řádku jen pokud `status !== 'paid'` a vrátí `{id}`/`null`; při druhém doručení úvodní `select` vidí `status='paid'` → handler skončí na idempotentní `noop` větvi ještě před `applyPaid`. Builder je zároveň thenable (`then`) i `maybeSingle`, aby pokryl chainy `update().eq()` (subscriptions) i `...maybeSingle()` (payments/businesses). `notifyPaymentConfirmed`, `generateAndStoreInvoice`, `activateSubscription`, `serverLog` jsou mocky; `extendPeriod` zůstává reálná.
- **Integrační test onboarding hooku** (`src/app/onboarding/6/__tests__/actions.notifications.test.ts`) — pokrývá R3.1/R5.1 pro `commitAction`: po `commitOnboarding` ok je `notifyBusinessCreated` volán PŘED `redirect('/dashboard')` (ověřeno přes `mock.invocationCallOrder`); i když notifikace vyhodí, `redirect('/dashboard')` se přesto provede. Mockovány `@/lib/onboarding/commit`, `@/lib/supabase/server` (auth.getUser + `from().select().eq().single()` → název podniku), `next/navigation` (`redirect` vyhazuje `NEXT_REDIRECT`) a Notifier.

## 2026-06-21 — telegram-operator-notifications: Unit testy Route Handleru (Task 12.2)

### Hotové tasky
- 12.2 Unit testy Route Handleru `POST /api/telegram/webhook` — ověřeno (`pnpm test:run` 5/5 passed, eslint exit 0)

### Nové funkce
- **Unit testy Route Handleru** (`src/app/api/telegram/webhook/__tests__/route.test.ts`) — pokrývají R7.1–R7.4: nenastavený secret → 401 bez dispatch + log `telegram_webhook_secret_missing`; chybějící/neshodná hlavička → 401 bez dispatch; shodná hlavička + neplatné JSON tělo → 200 bez příkazu; shodná hlavička + validní JSON → 200 a `handleTelegramUpdate` volán právě jednou s naparsovaným updatem. `handleTelegramUpdate` je spy (přes `vi.importActual`, aby `isAuthorizedSecret` zůstala reálná), secret se řídí přes `vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', …)`, `serverLog` je spy (odpojí `next/headers`). Request se konstruuje jako standardní `Request` přetypovaný na `NextRequest`.

## 2026-06-21 — telegram-operator-notifications: Napojení notifikace platby (Task 11.2)

### Hotové tasky
- 11.2 Napojit `notifyPaymentConfirmed` v `src/lib/webhooks/handler.ts` — ověřeno (eslint exit 0, tsc bez chyb v souboru, `pnpm test:run src/lib/webhooks` 6/6 passed)

### Nové funkce
- **Integrace notifikace potvrzené platby ve `applyPaid`** (`src/lib/webhooks/handler.ts`) — TĚSNĚ PŘED `return { ok: true, outcome: 'paid_applied' }` se v `try/catch` (best-effort, R5.2) volá `notifyPaymentConfirmed({ businessName, plan: sub.plan, amountCzk: payment.amount_czk })` (R4.1). `businessName` je vytaženo do proměnné scope funkce (`let businessName = 'Podnik'`) a naplněno z již existujícího dotazu `businesses.select('name')` uvnitř bloku `payment.invoice_number === null` (na cestě paid_applied je `invoice_number` vždy `null`, protože fakturu přiděluje až tento flow). Žádný nový DB dotaz. Dedup je odvozen z guarded flip na `paid` — sem se dostaneme jen když flip skutečně překlopil status (R6.1); idempotentní `noop` větev notifikaci nevolá. Selhání notifikace neovlivní výsledek webhooku.

## 2026-06-21 — telegram-operator-notifications: Napojení notifikace nového podniku (Task 11.1)

### Hotové tasky
- 11.1 Napojit `notifyBusinessCreated` v `src/app/onboarding/6/actions.ts` — ověřeno (eslint exit 0, tsc bez chyb v souboru)

### Nové funkce
- **Integrace notifikace vzniku podniku v `commitAction`** (`src/app/onboarding/6/actions.ts`) — po `result.ok` a PŘED `redirect('/dashboard')` se v `try/catch` (best-effort, R5.1) dohledá název nového podniku přes `businesses.select('name').eq('owner_user_id', user.id).single()` (název není v `CommitOnboardingResult`, který nese jen `{ ok: true }`) a zavolá `notifyBusinessCreated({ businessName, createdAt: new Date() })` (R3.1). `redirect()` je až za `try/catch`, mimo něj — aby `try` nezachytil interní `NEXT_REDIRECT`. Dedup je odvozen z unikátnosti slugu: do větve se dostaneme jen po `{ ok: true }` (R6.2).

## 2026-06-21 — telegram-operator-notifications: Route Handler webhooku (Task 12.1)

### Hotové tasky
- 12.1 Vytvořit `src/app/api/telegram/webhook/route.ts` — ověřeno (eslint exit 0, tsc bez chyb v souboru)

### Nové funkce
- **`POST /api/telegram/webhook`** (`src/app/api/telegram/webhook/route.ts`) — tenký adaptér dle vzoru gopay route (R7.1–R7.4). Pořadí: (1) `resolveWebhookSecret(process.env)` → `null` ⇒ HTTP 401 + log `telegram_webhook_secret_missing` bez Secret_Value (R7.3); (2) `isAuthorizedSecret` nad hlavičkou `x-telegram-bot-api-secret-token` v konstantním čase → neshoda/chybí ⇒ HTTP 401 bez business logiky (R7.2); (3) `await request.json()` v `try/catch` → neplatné tělo ⇒ HTTP 200 bez příkazu (Telegram neretry-uje, R7.4); (4) `handleTelegramUpdate(update)` + HTTP 200. Token/secret/tělo se nelogují. Bez `runtime`/`dynamic` exportu (vzor gopay route je rovněž nemá).

## 2026-06-21 — telegram-operator-notifications: Property test Notifier (Task 8.2)

### Hotové tasky
- 8.2 Property test pro no-op a fail-safe notifikace (Property 2) — `src/lib/telegram/__tests__/notifications.property.test.ts` — ověřeno (vitest 3 testy green, eslint exit 0)

### Nové funkce
- **`notifications.property.test.ts`** (`src/lib/telegram/__tests__/notifications.property.test.ts`) — Property 2 (R1.2, R1.3, R5.1, R5.2, R5.3), fast-check `{ numRuns: 100 }`. Mockuje `../client` (`sendTelegramMessage`) na čtyři chování (`sent`, `failed/http_error`, `failed/network_error`, `throw`) a `@/lib/log-server` jako spy (odpojí `next/headers`). Invariant 1: `notifyBusinessCreated`/`notifyPaymentConfirmed` pro libovolný vstup (`businessName`, `createdAt` bez Invalid Date, `plan`, `amountCzk`) a libovolné chování odesílatele vždy doběhnou bez vyhození a vrátí `SendResult` se `status ∈ {sent, failed, skipped}`. Invariant 2: v samostatném bloku s prázdným env (`vi.stubEnv` token/chat = '') testuje reálné `sendTelegramMessage` přes `vi.importActual('../client')` → pro libovolný text vrací `skipped/feature_disabled` a nevyhodí.

## 2026-06-21 — telegram-operator-notifications: unit testy orchestrace (Task 9.2)

### Hotové tasky
- 9.2 Unit testy `handleTelegramUpdate` — `src/lib/telegram/__tests__/webhook.orchestration.test.ts` — ověřeno (vitest 9 testů green, eslint exit 0)

### Nové funkce
- **`webhook.orchestration.test.ts`** (`src/lib/telegram/__tests__/webhook.orchestration.test.ts`) — unit pokrytí orchestrace `handleTelegramUpdate` (R8.2, R8.3, R9.1, R9.3, R10.1, R11.1, R12.1, R12.2). Mockuje I/O sousedy přes `vi.mock`: `../config` (`getTelegramConfig` → `{ botToken:'t', operatorChatId:'42' }`), `../client` (`sendTelegramMessage` spy), `../revenue`/`../estimate` (kalkulátory), `../health` (jen `runServiceProbes`; `buildHealthReport`+typy reálné přes `vi.importActual`), `@/lib/supabase/admin` (`createAdminClient` → dummy) a `@/lib/log-server` (odpojí `next/headers`). Ověřuje: cizí chat → žádná odpověď; `/trzby`/`/odhad` volají správný kalkulátor a odešlou naformátovaný výsledek (`formatCzk`); `/stav` volá `runServiceProbes` a odešle reálnou health zprávu; `/help`+`/start` → `buildHelpMessage`; neznámý text → `buildUnknownCommandMessage`; reject kalkulátoru → „Údaje se teď nepodařilo načíst." bez vyhození; neplatný tvar updatu → `sendTelegramMessage` se nevolá. Úklid v `afterEach` (`restoreAllMocks`/`clearAllMocks`).

## 2026-06-21 — telegram-operator-notifications: Webhook orchestrace (Task 9.1)

### Hotové tasky
- 9.1 `handleTelegramUpdate(update)` doplněn do `src/lib/telegram/webhook.ts` — ověřeno (eslint exit 0, tsc bez chyb v souboru, property testy 3.7/3.8 green)

### Nové funkce
- **`handleTelegramUpdate(update: unknown)`** (`src/lib/telegram/webhook.ts`) — server-only orchestrace ověřeného Telegram updatu (R8.1–8.3, R9–R12). Bezpečně parsuje `update.message.chat.id`/`.text` (neplatný tvar → tiše skončí, R7.4); bez `getTelegramConfig()` tiše skončí (R1.2/1.3); cizí chat ignoruje bez odpovědi (R8.2). Dispatch: `/trzby`→`getCurrentMonthRevenueCzk`, `/odhad`→`getNextMonthEstimateCzk`, `/stav`→`runServiceProbes`+`buildHealthReport`, `/start`+`/help`→`buildHelpMessage`, jinak `buildUnknownCommandMessage`. Odpověď výhradně na Operator_Chat_Id přes `sendTelegramMessage` (R8.3). Service-role klient přes `createAdminClient()` z `@/lib/supabase/admin`. Selhání čtení DB (`try/catch` kolem kalkulátorů) → česká hláška „Údaje se teď nepodařilo načíst." bez Secret_Value, zaloguje se jen kategorie `telegram_command_db_error` s `command` (bez stack trace/tajemství) přes `serverLog.error`. Soubor nově začíná `import 'server-only'`; čisté predikáty `isAuthorizedSecret`/`isOperatorChat` beze změny (server-only je ve vitestu stub, property testy zůstávají green).

## 2026-06-21 — telegram-operator-notifications: unit testy Telegram_Client (Task 6.3)

### Hotové tasky
- 6.3 Unit testy `sendTelegramMessage` / `telegramGetMe` — `src/lib/telegram/__tests__/client.test.ts` — ověřeno (vitest 11 testů green, eslint exit 0)

### Nové funkce
- **`client.test.ts`** (`src/lib/telegram/__tests__/client.test.ts`) — unit pokrytí I/O klienta (R2.1–2.3, R15.2, R15.3). Konfiguraci nastavuje přes `vi.stubEnv('TELEGRAM_BOT_TOKEN' / 'TELEGRAM_OPERATOR_CHAT_ID')`, `@/lib/log-server` (`serverLog`) mockuje jako spy a `fetch` přes `vi.stubGlobal`; uklízí v `afterEach` (`unstubAllGlobals`/`unstubAllEnvs`/`restoreAllMocks`/`clearAllMocks`). Ověřuje: (1) `sendMessage` na `/bot<token>/sendMessage` POST s `chat_id` = Operator_Chat_Id a `parse_mode: HTML` → `sent`; (2) bez konfigurace → `skipped/feature_disabled` bez volání fetch; (3) HTTP 500 → `failed/http_error`; (4) `TypeError` → `failed/network_error`; (5) `getMe` GET → `ok` bez volání `/sendMessage`, 500 → `error/http_error`, `TypeError` → `error/network_error`; (6) bezpečnost — žádný argument napříč všemi `serverLog` voláními neobsahuje token ani text zprávy (skipped/http/network scénáře), loguje se jen `status`/`errorKind`.

## 2026-06-21 — telegram-operator-notifications: Notifier (Task 8.1)

### Hotové tasky
- 8.1 `src/lib/telegram/notifications.ts` — ověřeno (eslint exit 0, tsc bez chyb v souboru)

### Nové funkce
- **Notifier** (`src/lib/telegram/notifications.ts`) — best-effort PUSH notifikace operátorovi (R3, R4, R5). Funkce `notifyBusinessCreated` a `notifyPaymentConfirmed` sestaví český text přes Message_Builder (`buildBusinessCreatedMessage` / `buildPaymentConfirmedMessage`) a odešlou přes `sendTelegramMessage`. Celé tělo v `try/catch` — vrací `SendResult` pro log/test, ale NIKDY nevyhodí výjimku; při zachycené chybě vrací `{ status: 'failed', errorKind: 'unexpected' }` a zaloguje `telegram_notify_failed`. Vstupní typy `BusinessCreatedInput`/`PaymentConfirmedInput` se importují (a re-exportují) z `./messages`, neduplikují se.

## 2026-06-21 — telegram-operator-notifications: unit testy health probes (Task 7.4)

### Hotové tasky
- 7.4 Unit testy `runServiceProbes()` — `src/lib/telegram/__tests__/health.probes.test.ts` — ověřeno (vitest 5 testů green, eslint exit 0)

### Nové funkce
- **`health.probes.test.ts`** (`src/lib/telegram/__tests__/health.probes.test.ts`) — unit pokrytí I/O vrstvy probe (R11.1, R11.5, R11.6). Mockuje `fetch` přes `vi.stubGlobal` a env přes `vi.stubEnv`, uklízí v `afterEach`. Ověřuje: (1) kompletní konfigurace + dostupný fetch → všech 6 služeb `ok`; (2) reject jedné probe (Resend) neshodí ostatní (ta `down`, ostatní `ok`, výsledek má 6 služeb); (3) výsledek má jen pole `service`/`label`/`status` (žádné Secret_Value); (4) read-only — `fetch` volán jen metodou GET; (5) chybějící kritická env (`NEXT_PUBLIC_SUPABASE_URL`) → Supabase `down` bez volání fetch a bez prosáknutí env (R11.6).

## 2026-06-21 — telegram-operator-notifications: Telegram_Client (Task 6.2)

### Hotové tasky
- 6.2 Vytvořit `src/lib/telegram/client.ts` — odesílací helper a health probe — ověřeno (eslint exit 0, tsc bez chyb v souboru)

### Nové funkce
- **`sendTelegramMessage(text): Promise<SendResult>`** (`src/lib/telegram/client.ts`) — server-only odesílací helper (R2, R15.1). Bez konfigurace (`getTelegramConfig() === null`) → `{ status: 'skipped', reason: 'feature_disabled' }`. Jinak `fetch` POST na `https://api.telegram.org/bot<token>/sendMessage` s body `{ chat_id: operatorChatId, text: escapeHtml(text), parse_mode: 'HTML' }` a `AbortController` timeoutem (`REQUEST_TIMEOUT_MS = 5000`). HTTP ne-ok → `{ status: 'failed', errorKind: 'http_error' }`; throw z fetch (`TypeError`/`AbortError`) → `network_error`; jinak `unexpected`. Úspěch → `{ status: 'sent' }`. NIKDY nevyhodí.
- **`telegramGetMe(): Promise<GetMeResult>`** (`src/lib/telegram/client.ts`) — read-only health probe (R15.2, R15.3). Bez konfigurace → `skipped`; jinak GET na `/getMe` BEZ odeslání zprávy; ne-ok → `http_error`, síťová chyba → `network_error`, jiné → `unexpected`; úspěch → `ok`.
- **Typy `SendResult`, `GetMeResult`** + interní helpery `escapeHtml` (jen `& < >`), `logStatus` (best-effort, nikdy nevyhodí), `categorizeFetchError`. Bot_Token ani text se NIKDY nelogují — do `serverLog` jde jen `status`/`errorKind`.

## 2026-06-21 — telegram-operator-notifications: read-only health probe (Task 7.3)

### Hotové tasky
- 7.3 Doplnit `runServiceProbes()` do `src/lib/telegram/health.ts` — ověřeno (eslint + vitest health.property.test + tsc, exit 0)

### Nové funkce
- **`runServiceProbes(): Promise<ReadonlyArray<ServiceHealth>>`** (`src/lib/telegram/health.ts`) — server-only I/O wrapper (R11.2, R11.5, R11.6). Paralelně přes `Promise.allSettled` spustí read-only liveness probe šesti služeb (Supabase, Resend, SMTP2GO, GoPay, Cloudflare R2, Google). Každá probe: kontrola přítomnosti povinné konfigurace + síťová dostupnost endpointu přes `fetch` GET s `AbortController` timeoutem (`PROBE_TIMEOUT_MS = 3000`). Jakákoli HTTP odpověď → `ok`; síťová chyba/timeout → `down`. Chybějící kritická konfigurace (Supabase URL, Resend klíč, GoPay base+GOID, R2 base+account) → `down`; chybějící volitelná (SMTP2GO klíč, Google OAuth — fallback/zálohy) → `degraded`. Probe jsou read-only (žádný zápis/odeslání) a nepoužívají autorizační tajemství (kromě veřejné Supabase URL); výsledek obsahuje jen `service`/`label`/`status` — žádné Secret_Value. Rejected probe se mapuje na `down`. Soubor nově začíná `import 'server-only';`; čisté funkce/typy (`aggregateHealth`, `buildHealthReport`, `ServiceStatus`/`MonitoredService`/`ServiceHealth`/`HealthReport`) beze změny — property test importuje jen čisté funkce a dál prochází (`server-only` je ve vitest aliasován na stub).

## 2026-06-21 — telegram-operator-notifications: I/O wrapper odhadu (Task 7.2)

### Hotové tasky
- 7.2 Doplnit I/O wrapper do `src/lib/telegram/estimate.ts` — ověřeno (eslint + vitest estimate.property.test + tsc, exit 0)

### Nové funkce
- **`getNextMonthEstimateCzk(supabase, now: Date): Promise<number>`** (`src/lib/telegram/estimate.ts`) — server-only I/O wrapper (R10.1, R10.2). Spočítá hranice příštího kalendářního měsíce v Europe/Prague přes pomocnou `nextMonthBoundsIso` (znovupoužívá `fromPragueInput` z `@/lib/datetime`, polootevřený interval [start, end)), načte `subscriptions` se `status='active'`, `auto_renew=true`, `current_period_end` v období (`.gte`/`.lt`), mapuje na `EstimateSubscriptionRow[]` a předá čisté `estimateNextMonthRevenueCzk`. Soubor nově začíná `import 'server-only';`. Čistá funkce + typ `EstimateSubscriptionRow` beze změny — property test importuje jen čistou funkci a dál prochází.

## 2026-06-21 — telegram-operator-notifications: I/O wrapper tržeb (Task 7.1)

### Hotové tasky
- 7.1 Doplnit I/O wrapper do `src/lib/telegram/revenue.ts` — ověřeno (eslint exit 0, vitest revenue.property.test prošel, tsc bez chyb v souboru)

### Nové funkce
- **`getCurrentMonthRevenueCzk(supabase, now): Promise<number>`** (`src/lib/telegram/revenue.ts`) — server-only I/O wrapper pro `/trzby`. Spočítá hranice aktuálního kalendářního měsíce v Europe/Prague jako UTC `[start, nextStart)`, načte `payments` se `status='paid'` a `created_at >= start && < nextStart`, předá do čisté `calculateRevenueCzk`. Vzor dotazu dle `sumPaidRevenueCzk` (`admin/stats.ts`). Soubor nově začíná `import 'server-only';`. Čistá funkce `calculateRevenueCzk` a typ `RevenuePaymentRow` beze změny.
- **Pomocná `pragueCurrentMonthRange(now)`** (privátní) — hranice měsíce přes `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })` pro rok/měsíc + `fromPragueInput` (`@/lib/datetime`) pro korektní UTC převod přes DST. `amount_czk` z DB coercnuto `Number()` (sloupec může být number|string, stejně jako ve `stats.ts`).
- **Pozn.:** `server-only` je v testech aliasovaný na stub (`vitest.config.ts`), property test `revenue.property.test.ts` (importuje jen `calculateRevenueCzk`) dál prochází beze změny.

## 2026-06-21 — telegram-operator-notifications: I/O wrapper konfigurace (Task 6.1)

### Hotové tasky
- 6.1 Doplnit I/O wrapper do `src/lib/telegram/config.ts` — ověřeno (eslint + vitest config.property.test, exit 0)

### Nové funkce
- **`getTelegramConfig(): TelegramConfig | null`** (`src/lib/telegram/config.ts`) — jediné místo čtení tokenu/chatu z `process.env`, deleguje na čistou `resolveTelegramConfig`. Soubor nově začíná `import 'server-only';` (R1.4). Čisté funkce `resolveTelegramConfig`/`resolveWebhookSecret` beze změny.
- **Pozn.:** `server-only` je v testech aliasovaný na stub `src/test/server-only-stub.ts` (`vitest.config.ts`), takže import test nerozbije — property test `config.property.test.ts` dál prochází.

## 2026-06-21 — telegram-operator-notifications: property test obsahu notifikačních zpráv (Task 4.3)

### Hotové tasky
- 4.3 Property test pro obsah notifikačních zpráv — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 11 test** (`src/lib/telegram/__tests__/messages-notifications.property.test.ts`) — fast-check `{ numRuns: 100 }` pro notifikační buildery. Generátory: neprázdný `businessName` (`fc.string({ minLength: 1 })` + `trim().length > 0`), `createdAt` přes `fc.date()`, `plan` přes `fc.constantFrom('start','pokrocily','max')`, `amountCzk` přes `fc.nat()`. Ověřuje: (a) `buildBusinessCreatedMessage` obsahuje `businessName` a `formatPragueDateTime(createdAt)`; (b) `buildPaymentConfirmedMessage` obsahuje `businessName`, český label tarifu (Start/Pokročilý/Max) a `formatCzk(amountCzk)`. Tag `// Feature: telegram-operator-notifications, Property 11: Notifikační zprávy obsahují požadovaná pole`, Validates R3.2/R3.3/R4.2/R4.3.

## 2026-06-21 — telegram-operator-notifications: property test parsování příkazů (Task 3.5)

### Hotové tasky
- 3.5 Property test pro parsování příkazů — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 9 test** (`src/lib/telegram/__tests__/commands.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `parseCommand`. Pozitivní větev: pro každý známý příkaz (`/trzby`, `/odhad`, `/stav`, `/start`, `/help`) generuje variace velikosti písmen (vč. náhodného mixed-case přes `chain`), vedoucí/koncový whitespace a volitelný `@botname` suffix → `{ kind: 'command', command }`. Negativní větev: libovolný `fc.string()` (vč. `/`+string variant), s `fc.pre(!looksLikeKnownCommand)` pro vyloučení náhodné shody → `{ kind: 'unknown' }`. Tag `// Feature: telegram-operator-notifications, Property 9: Rozpoznání příkazů a odmítnutí neznámého textu`, Validates R12.2.
- **Pozn.:** fast-check v4 odstranil `fc.stringOf` — whitespace generátor řešen přes `fc.array(constantFrom(...)).map(join)`.

## 2026-06-21 — telegram-operator-notifications: property test autorizace secretu (Task 3.7)

### Hotové tasky
- 3.7 Property test pro autorizaci secretu — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 7 test** (`src/lib/telegram/__tests__/webhook-secret.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `isAuthorizedSecret`. Generátory: neprázdný secret (`fc.string({ minLength: 1 })`), náhodná hlavička (`fc.string()`) a `fc.boolean()` pro volbu shody. Ověřuje: (a) shoda neprázdného secretu a hlavičky → `true`; (b) neshoda → `false` (výsledek odvozen z `headerValue === configured`, aby náhodná kolize neselhala); (c) `configured === null` → vždy `false` při libovolné hlavičce; (d) `headerValue === null` → `false`. Tag `// Feature: telegram-operator-notifications, Property 7: Autorizace webhook secretu`, Validates R7.1/R7.2/R7.3.

## 2026-06-21 — telegram-operator-notifications: property test výpočtu tržeb (Task 2.2)

### Hotové tasky
- 2.2 Property test pro výpočet tržeb — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 3 test** (`src/lib/telegram/__tests__/revenue.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `calculateRevenueCzk`. Generátor `fc.array` plateb s celočíselným `amount_czk` (přesný součet bez chyb plovoucí čárky). Ověřuje: výsledek roven součtu `amount_czk`, aditivita vůči zřetězení dvou seznamů, prázdný seznam → 0. Tag `// Feature: telegram-operator-notifications, Property 3: Výpočet tržeb je součet částek`, Validates R9.2/R9.3/R13.1/R13.3.

## 2026-06-21 — telegram-operator-notifications: property test reportu zdraví (Task 3.3)

### Hotové tasky
- 3.3 Property test pro report zdraví — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 6 test** (`src/lib/telegram/__tests__/health.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `buildHealthReport`. Smart generátor mapuje šest sledovaných služeb (`supabase, resend, smtp2go, gopay, r2, google`) na náhodné stavy (`ok/degraded/down`), bez duplicit a neznámých služeb. Ověřuje: report obsahuje právě těchto šest služeb, agregát dodržuje precedenci `down > degraded > ok`, a žádný prvek nemá jiná pole než `service/label/status` (bez tajemství). Tag `// Feature: telegram-operator-notifications, Property 6: Report zdraví pokrývá všech šest služeb bez tajemství`, Validates R11.2/R11.5/R11.6.

## 2026-06-21 — telegram-operator-notifications: property test odhadu tržeb (Task 2.4)

### Hotové tasky
- 2.4 Property test pro odhad tržeb — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 4 test** (`src/lib/telegram/__tests__/estimate.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `estimateNextMonthRevenueCzk`. Generátor `fc.array` předplatných s `plan` přes `fc.constantFrom('start','pokrocily','max')`. Ověřuje: výsledek roven součtu `planPriceCzk(plan)`, vždy nezáporný; prázdný seznam → 0. Tag `// Feature: telegram-operator-notifications, Property 4: Odhad odpovídá ceníku a je nezáporný`, Validates R10.2/R10.3/R10.4/R13.2/R13.4.

## 2026-06-21 — telegram-operator-notifications: property test agregace zdraví (Task 3.2)

### Hotové tasky
- 3.2 Property test pro agregaci zdraví — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 5 test** (`src/lib/telegram/__tests__/health.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `aggregateHealth`. Generátor `fc.constantFrom('ok','degraded','down')` v poli (maxLength 50). Ověřuje invariant precedence `down > degraded > ok` a prázdný vstup → `ok`. Tag `// Feature: telegram-operator-notifications, Property 5: ...`, Validates R11.3/R11.4.

## 2026-06-21 — telegram-operator-notifications: property test resoluce konfigurace (Task 1.2)

### Hotové tasky
- 1.2 Property test pro resoluci konfigurace — ověřeno (vitest run + eslint, exit 0)

### Nové funkce
- **Property 1 test** (`src/lib/telegram/__tests__/config.property.test.ts`) — fast-check `{ numRuns: 100 }` pro `resolveTelegramConfig`. Generátor pokrývá nepřítomnost (`undefined`), prázdný string i neprázdné hodnoty (vč. whitespace) obou proměnných `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OPERATOR_CHAT_ID`. Ověřuje ekvivalenci: neprázdná konfigurace ⟺ oba truthy, jinak `null` (posouzení prázdnosti přes truthiness). Tag `// Feature: telegram-operator-notifications, Property 1: ...`, Validates R1.1/R1.2.

## 2026-06-21 — telegram-operator-notifications: čisté buildery zpráv (Task 4.1)

### Nové funkce
- **Message_Builder** (`src/lib/telegram/messages.ts`) — čisté buildery českých textů zpráv + formátování. `formatCzk(amountCzk)` (cs-CZ, bez desetin, sufix „ Kč", vzor `analytics.ts`) a `formatPragueDateTime(at)` (Intl.DateTimeFormat, timeZone `Europe/Prague`). Buildery `buildBusinessCreatedMessage`, `buildPaymentConfirmedMessage` (labely tarifů Start/Pokročilý/Max), `buildRevenueMessage`, `buildEstimateMessage`, `buildHealthMessage` (mapování stavu ok→„v pořádku"/degraded→„zhoršené"/down→„nedostupné"), `buildHelpMessage` (všechny příkazy), `buildUnknownCommandMessage` (odkaz na /help). Vstupní typy `BusinessCreatedInput` a `PaymentConfirmedInput` definovány a exportovány zde (kvůli pořadí vln a prevenci cyklické závislosti — `notifications.ts` je bude importovat). Bez I/O / `server-only` (property/unit testy jsou tasky 4.2–4.4). Ověřeno `pnpm exec eslint` (exit 0).

## 2026-06-21 — telegram-operator-notifications: čistá agregace zdraví (Task 3.1)

### Nové funkce
- **Health_Reporter** (`src/lib/telegram/health.ts`) — čisté funkce a typy pro technický stav služeb. Typy `ServiceStatus` (`ok`/`degraded`/`down`), `MonitoredService` (supabase/resend/smtp2go/gopay/r2/google), `ServiceHealth` (`service`/`label`/`status`) a `HealthReport` (`services` + `aggregate`, sladěno s `admin-system-tools`). Funkce `aggregateHealth(statuses)` s precedencí `down > degraded > ok` (prázdný vstup → `ok`) a `buildHealthReport(services)` vracející seznam služeb + agregovaný stav, bez Secret_Value. Bez I/O (`runServiceProbes` + `server-only` přijdou v tasku 7.3). Ověřeno `pnpm exec eslint` (exit 0).

## 2026-06-21 — telegram-operator-notifications: čistý výpočet tržeb (Task 2.1)

### Nové funkce
- **Revenue_Calculator** (`src/lib/telegram/revenue.ts`) — čistá funkce `calculateRevenueCzk(payments)` + typ `RevenuePaymentRow` (`amount_czk: number`). Součet `amount_czk` vstupních plateb; prázdný vstup → 0. Bez I/O (filtr `paid`/období a `server-only` wrapper `getCurrentMonthRevenueCzk` přijdou v tasku 7.1). Ověřeno `pnpm exec eslint` (exit 0).

## 2026-06-21 — telegram-operator-notifications: čisté parsování příkazů (Task 3.4)

### Nové funkce
- **Command_Parser** (`src/lib/telegram/commands.ts`) — čistá funkce `parseCommand(text)` + typy `Command` (`'trzby' | 'odhad' | 'stav' | 'start' | 'help'`) a `ParsedCommand` (`{ kind: 'command'; command } | { kind: 'unknown' }`). Rozpozná `/trzby`, `/odhad`, `/stav`, `/start`, `/help` s tolerancí velikosti písmen, okolního whitespace a volitelného `@botname` sufixu; cokoli jiného → `unknown`. Bez I/O / `server-only` (property test je task 3.5). Ověřeno `pnpm exec eslint` (exit 0).

## 2026-06-21 — telegram-operator-notifications: čistý odhad tržeb (Task 2.3)

### Nové funkce
- **Estimate_Calculator** (`src/lib/telegram/estimate.ts`) — čistá funkce `estimateNextMonthRevenueCzk(subscriptions)` + typ `EstimateSubscriptionRow`. Odhad tržeb příštího měsíce jako součet `planPriceCzk(plan)` přes vstupní předplatná z jednotného ceníku `src/lib/checkout/pricing.ts`; prázdný vstup → 0, výsledek vždy nezáporný. Bez I/O (wrapper + `server-only` přijdou v tasku 7.2). Ověřeno `pnpm exec eslint` (exit 0).

## 2026-06-20 — dashboard-fulltext-search: finální checkpoint (Task 8) + souhrn feature

### Nové funkce (souhrn dokončené feature)
- **Index obsahu** (`src/lib/search/content-index.ts`) — deklarativní registr `CONTENT_INDEX` klíčovaný cestou stránky (settings, services, reservations, clients, opening-hours, subscription, plans, analytics, employees, faq, account) s typy `SectionRecord`/`ContentIndex`. Čistá funkce `searchContentIndex(query)` lokálně porovnává normalizovaný dotaz proti nadpisu/popisu a vrací výsledky skupiny `sections` s `href` ve tvaru `cesta#anchor`.
- **Agregace + helpery** (`src/lib/search/search-aggregate.ts`) — `aggregateResults` (pořadí skupin settings → sections → clients → faq, ořez sekcí na `SECTION_RESULT_LIMIT = 6`, skrývání prázdných skupin, zachování `locked` u clients), `flattenResults` (plochý seznam pro klávesovou navigaci), `safeNormalize` (idempotentní, fallback na raw text), `shouldSearch` a `resolveActivation`. Sdílené typy v `src/lib/search/types.ts` rozšířeny o skupinu `sections` (`SEARCH_GROUP_LABELS.sections = 'Sekce'`).
- **Odscrollování na sekci** (`src/components/dashboard/ScrollToHashOnLoad.tsx`) — klientská komponenta reagující na `usePathname`/`hashchange`: najde element dle `location.hash`, `scrollIntoView` (respekt `prefers-reduced-motion`), nastaví fokus pro čtečky a přechodné zvýraznění; chybějící kotva tiše bez chyby. CSS třída `.search-target-highlight` v `globals.css`. Zapojeno v owner shellu (`DashboardChrome.tsx`).
- **Kotvy sekcí** — aditivní `id` (+ `scroll-mt`) odpovídající `CONTENT_INDEX` doplněny napříč stránkami dashboardu (settings, opening-hours, services, reservations, clients, subscription, plans, analytics, employees, faq, account).
- **DashboardSearch** (`src/components/dashboard/DashboardSearch.tsx`) — přidán lokální zdroj sekcí, seskupení přes `aggregateResults`, plná klávesová navigace (ArrowUp/Down s wrap-around, Enter = klik) a ARIA (`aria-activedescendant`, `role="option"`, `aria-selected`). Výběr sekce naviguje na `cesta#anchor` a zavírá panel.

### Verifikace (Task 8 finální checkpoint)
- `pnpm lint` čistý (exit 0).
- `pnpm test:run` → 541 passed / 57 skipped (104 test files passed / 23 skipped).
- `pnpm build` OK na první pokus (39/39 stránek, žádná prerender chyba na `/dashboard/reservations`). Benigní pre-existující CSS warning `.bg-[var(...)]` (nesouvisí s feature).
- `get_diagnostics` na klíčových souborech (DashboardSearch, DashboardChrome, ScrollToHashOnLoad, content-index, search-aggregate, types) bez nálezů.

## 2026-06-16 — dashboard-fulltext-search: integrace sekcí + klávesová navigace v DashboardSearch (Task 6.1)

### Nové funkce
- `DashboardSearch.tsx` rozšířen o lokální zdroj sekcí: `searchContentIndex(trimmed)` → skupina `sections` (R1, R13.1).
- Ad-hoc seskupení nahrazeno čistou `aggregateResults(...)` + iterací přes `RenderGroup[]`; stav klientů mapován do `ClientsState` (`locked` → hláška o vyšším tarifu, `results`/`idle`). Skrývání prázdných skupin a limit sekcí (≤6) řeší agregace (R3, R13.2).
- Klávesová navigace (R11): stav `activeIndex` nad `flattenResults(groups)`, ArrowDown/ArrowUp s wrap-around (preventDefault), Enter → `resolveActivation` → `router.push(href)` + zavření panelu; reset na -1 při změně výsledků.
- ARIA: `aria-activedescendant` na inputu, každá `<li>` má `role="option"`, stabilní `id` `${panelId}-opt-${flatIndex}` a `aria-selected`; aktivní položka zvýrazněna `bg-[var(--color-soft-gray-fill)]`. Plochý index se počítá průběžným počítadlem v pořadí render skupin (settings → sekce → klienti → faq), shodném s `flattenResults`.

### Verifikace
- `pnpm lint` čistý; `get_diagnostics` na `DashboardSearch.tsx` bez chyb.

## 2026-06-16 — dashboard-fulltext-search: id kotvy employees/faq/account (Task 5.4)

### Nové funkce
- Přidány `id` + `scroll-mt-20` na sekční wrappery, aby odpovídaly kotvám v `CONTENT_INDEX`:
  - `/dashboard/employees` (`page.tsx`): `id="zamestnanci"` na Card s `EmployeesManager`; `id="zamestnanci-u-sluzeb"` na Card s `ServiceEmployeesManager`.
  - `TopEmployees.tsx`: `id="top-zamestnanci"` na vnitřní `Card as="section"`.
  - `/dashboard/faq` (`page.tsx`): `id="caste-dotazy"` na Card s `FaqAccordion`.
  - `/dashboard/account` (`page.tsx`): `id="prihlasovaci-udaje"` na Card s `AccountCredentialsForm`.
- Surgical/aditivní — pouze `id` a `scroll-mt-20`, žádná změna chování.

### Verifikace
- `pnpm lint` čistý; `get_diagnostics` na editovaných souborech bez chyb.

## 2026-06-16 — dashboard-fulltext-search: odscrollování na sekci (Task 4.1)

### Nové funkce
- `ScrollToHashOnLoad` (`src/components/dashboard/ScrollToHashOnLoad.tsx`) — klientská komponenta (vrací `null`), která po vykreslení/změně cesty (`usePathname`) a na `hashchange` najde element dle `location.hash`, odscrolluje ho (`scrollIntoView`, behavior dle `prefers-reduced-motion`), nastaví fokus pro čtečky (dočasný `tabindex=-1`) a přidá přechodné zvýraznění. Chybějící kotva → tiše bez chyby (R4.2–R4.5). Montuje se v owner dashboard shellu v pozdějším tasku.
- CSS třída `.search-target-highlight` (`src/app/globals.css`) — subtilní outline v `--color-action-violet`, bez layout shiftu.

### Verifikace
- `pnpm lint` čistý; `get_diagnostics` na nové komponentě bez chyb.

## 2026-06-16 — Analytika TOP klienti: párování proti tabulce clients (oprava falešných „klientů")

### Bug & fix
- **Symptom:** V „TOP klienti" se objevilo jméno (např. „Anna"), které není skutečný klient (shoduje se jen se jménem zaměstnance / jde o rezervaci bez klientského záznamu).
- **Root cause:** Analytika odvozovala identitu klienta přímo z polí rezervace (`client_name`/telefon/e-mail), takže i rezervace bez odpovídajícího řádku v `clients` (jen jméno) vytvořila „klienta".
- **Fix:** `analytics/load.ts` nově páruje rezervaci proti tabulce `clients` přes `matchClient` (telefon/e-mail), shodně se stránkou Klienti. Bez shody → prázdný `clientKey`. Agregace `topClientsBySpend` a `computeClientMix` prázdné klíče přeskakují. „TOP klienti" tak zobrazuje jen skutečné klienty.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm exec vitest run analytics` → 9 passed.

## 2026-06-16 — TOP zaměstnanci: metrika = podíl na odvedené práci (ne obsazenost)

### Změna chování
- `getTopEmployees` počítá `sharePct` = čas rezervací zaměstnance ÷ součet času rezervací VŠECH zaměstnanců (dříve ÷ otevírací doba podniku). Lépe vystihuje „kdo odvedl jakou část reálné práce týmu". Odstraněn dotaz na `opening_hours` i výpočet otevírací doby. Pole `occupancyPct` přejmenováno na `sharePct`; `TopEmployees.tsx` aktualizován (podtitulek, info tooltip s příkladem 10/50 h → 20 %).

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK.

## 2026-06-16 — Sdílený DatePicker (rozbalovací kalendář) místo nativního `type="date"`

### Nové funkce
- Nová UI komponenta `src/components/ui/DatePicker.tsx` — rozbalovací výběr data (trigger + měsíční kalendář v panelu, ikona kalendáře, zavírání klik mimo/Escape). Funguje řízeně (`value`+`onChange`) i neřízeně (`defaultValue`+`name` pro GET formuláře), podporuje `min`/`max`, `allowClear`, „dnešek" zvýraznění. Sdílí mřížku přes `buildMonthGrid`/`addMonths`.
- Nahrazen nativní `<input type="date">` v: rezervace create dialog (`create-date`), edit modal (`edit-date`), `FilterBar` (Od/Do), admin kupóny (Platnost do), admin podnik detail (konec období, free-trial), admin audit a admin podniky (filtry od/do — neřízené přes `name`+`defaultValue`). Rezervační krok 2 (`DatePickerCalendar`) zůstává inline (dedikovaný krok).
- e2e `manual-creation` upraven: `#create-date` se otevře a vybere den přes `[data-date]` (s fallbackem „Další měsíc").

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run` → 541 passed / 57 skipped.

## 2026-06-16 — Sdílený TimePicker napříč projektem (místo nativního `type="time"`)

### Nové funkce
- Onboarding TimePicker (dropdown hodina/minuta, klik na celé pole rozbalí výběr) přesunut do sdílené UI: `src/app/onboarding/5/TimePicker.tsx` → `src/components/ui/TimePicker.tsx`.
- Nativní `<input type="time">` nahrazen `TimePicker`em v: `dashboard/reservations/CreateReservationDialog` (`create-time`), `dashboard/reservations/[id]/ReservationActions` (edit modal `edit-time`), `dashboard/opening-hours/OpeningHoursForm` (opens/closes). Onboarding krok 5 (`HoursForm`) ho používá dál (jen aktualizovaný import).
- e2e (`edit-flow`, `manual-creation`) aktualizovány: místo `#…-time.fill('02:00')` otevřou TimePicker a vyberou hodinu „02" (dialog `Čas rezervace`).

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run` → 541 passed / 57 skipped.

## 2026-06-16 — Nová stránka „Analytika podniku" (`/dashboard/analytics`)

### Nové funkce
- Nová položka v aside (poslední, owner): „Analytika" (`IconChartHistogram`) + titulek topbaru.
- `src/lib/analytics/analytics.ts` — čisté funkce: výběr období (`resolvePeriod`/`PERIOD_OPTIONS`: tento/minulý měsíc, 7/30 dní, rok) se srovnávacím předchozím obdobím; agregace `computeKpis` (tržby z uskutečněných, počet, prům. hodnota, no-show rate), `computeStatusBreakdown`, `computeHeatmap` (den×hodina), `computeRevenueSeries`, `topServicesByRevenue`, `employeePerformance`, `topClientsBySpend`, `computeClientMix` (noví vs. vracející se přes historické okno 12 měsíců), `relativeChange`, `formatCzk`/`formatPercent`. Definice: uskutečněná = `attendance='attended'`, propadlá = `no_show`, zrušená = `cancelled/rejected`.
- `analytics/load.ts` — server loader (admin client), dávkové čtení rezervací okna `[from-12m, to]` s embedy `reservation_services`/`reservation_employees`; identita klienta přes `normalizePhone`→e-mail→jméno; rozdělí na current/previous/historyBefore.
- Prezentační komponenty (SVG, design tokeny): `AnalyticsKpis` (PeriodTabs, KpiCard s delta vs. minulé období), `AnalyticsCharts` (StatusDonut conic-gradient, UtilizationHeatmap, RevenueTrendChart přes `buildSmoothPath`, RankingList, ClientMixCard).
- Layout: období nahoře → 4 KPI → široký graf tržeb → heatmapa + koláč → spodní mřížka služby/zaměstnanci/klienti.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK (route `/dashboard/analytics`); `pnpm test:run` → 541 passed / 57 skipped (vč. 9 nových unit testů agregací/období).

## 2026-06-16 — Kalendář: nový layout (levý rail + časová mřížka)

### Nové funkce
- `CalendarView.tsx` přepsán na dvousloupcový layout (`lg:grid-cols-[280px_1fr]`):
  - **Levý rail:** mini měsíční kalendář (`MiniMonth`, navigace na týden/měsíc, zvýraznění dnešku a aktivního období), karta nejbližší rezervace (`NextEventCard`, Action Violet) a filtry (`FilterBar` přesunut sem z page).
  - **Pravý sloup:** hlavička s navigací období + přepínačem Den/Týden a **časová mřížka** (osa hodin × sloupce dní). Bloky rezervací jsou absolutně pozicované dle `starts_at`–`ends_at` (Europe/Prague), rozsah hodin se dopočítá z rezervací (min. okno 8–18). Překryvy se dělí do „lanes" (greedy). Pastelové pozadí bloku z design systému (air-blue/lush-green/light-violet/sunset-pink) s rich-violet textem; `rejected`/`cancelled` ztlumené + přeškrtnuté.
- `page.tsx`: kalendářní větev předává `services` do `CalendarView` (filtry teď bydlí v railu), odstraněn samostatný `<FilterBar>` i jeho import.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run` → 532 passed / 57 skipped (snapshot `CalendarView` regenerován; do `reservations-views.spec` doplněn mock `next/navigation` kvůli `FilterBar`).

## 2026-06-16 — /dashboard/reservations: zrušen pohled „Tabulka", default = „Obsazenost"

### Nové funkce
- Pohled „Tabulka" odstraněn z přepínače; výchozí pohled stránky rezervací je nyní „Obsazenost" (přepínač = Obsazenost ↔ Kalendář). `parseCalendarParams` defaultuje na `occupancy` a staré odkazy `?view=table` na něj spadnou. `ReservationsShell` zbaven `tableHref` a tlačítka „Tabulka". Odstraněn loader `loadReservations` + `LoadResult` a nepoužité importy (`TableView`, `RESERVATIONS_PAGE_SIZE`). `TableView` zůstává (používá ho `OccupancyView` pro filtrovaný seznam pod grafem).

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run` → 532 passed / 57 skipped.

## 2026-06-16 — Úprava rezervace: multi-service edit (search + select)

### Nové funkce
- Editační dialog v `ReservationActions.tsx` přepnut z single-select `<select>` na vícenásobný výběr služeb se search ("Hledat službu") + zaškrtávacím seznamem (stejný vzor jako přiřazení zaměstnanců). Limit 10 služeb (shodně s `edit_reservation_multi`), guard na min. 1 (Uložit disabled při 0). Předvyplní se celá aktuální množina služeb rezervace.
- Detail (`[id]/page.tsx`): `ReservationServiceItem` nově nese `serviceId`; `ReservationActions` dostává `currentServiceIds` (uspořádaná množina, fallback na primary `service_id`). Backend beze změny — `editReservation` už přijímá `serviceIds[]` (RPC `edit_reservation_multi`).
- e2e `edit-flow.spec.ts` aktualizován: místo `#edit-service` selectu klikne na první nevybranou službu v zaškrtávacím seznamu.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run` → 532 passed / 57 skipped.

## 2026-06-16 — Zaměstnanci: pravý sloupec „TOP zaměstnanci" (obsazenost/efektivita)

### Nové funkce
- `getTopEmployees()` (`dashboard/settings/employee-actions.ts`) — žebříček zaměstnanců dle obsazenosti v aktuálním měsíci (Europe/Prague). Obsazenost % = součet délek aktivních rezervací (pending/approved) přiřazených zaměstnanci (z `reservation_employees`, fallback `employee_id`) / otevírací doba podniku za měsíc (cap 100). „Počet služeb" = řádky `reservation_services` napříč přiřazenými rezervacemi. Řazeno sestupně. Reuse `buildMonthGrid`/`openMinutesByWeekday`/`pragueWeekdayIndex` z `occupancy.ts`.
- `TopEmployees.tsx` — prezentační žebříček: pořadí, jméno, tlumený text „N služeb, celkem H:MM h", vpravo % obsazenost (Action Violet). Scroll-y (max-h), sticky na desktopu.
- Stránka `/dashboard/employees` restrukturalizována na grid 2/3 (správa týmu + zaměstnanci u služeb) + 1/3 (TOP). Bez DB změny.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK.

## 2026-06-16 — Rezervace detail: přiřazení zaměstnanců přes search + checkbox seznam

### Nové funkce
- `AssignEmployee.tsx` přepsán z chipů na vzor „Zaměstnanci u služeb" (`ServiceEmployeesManager`): vyhledávací pole „Hledat zaměstnance" (diakritiku-tolerantní filtr), scrollovatelný zaškrtávací seznam (checkbox + IconCheck), tlačítka „Vybrat vše" / „Zrušit výběr", souhrn „N z M — náhled jmen". Optimistický zápis celé množiny přes `setReservationEmployees` s revertem při chybě. Bez DB změny (staví na `reservation_employees`).

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm exec vitest run reservation-detail` → 7 passed.

## 2026-06-16 — Rezervace detail: přiřazení více zaměstnanců (M:N)

### Nové funkce
- Migrace `supabase/migrations/0051_reservation_employees.sql` — nová join tabulka `reservation_employees (reservation_id, employee_id)` (M:N), FK cascade, index na `employee_id`, RLS + owner-read policy (mirror `reservation_services_owner_read`), backfill ze stávajícího `reservations.employee_id`. `reservations.employee_id` zůstává jako denormalizovaný „primary" (první přiřazený) kvůli zpětné kompatibilitě. **Pozn.: vyžaduje push na sdílenou DB — viz níže.**
- Server action `setReservationEmployees(reservationId, employeeIds[])` (`src/server/ReservationEmployeeAssigner.ts`, nahradila `assignReservationEmployee`): owner-scoped (ověření vlastnictví rezervace pod uživatelským JWT), validace příslušnosti všech zaměstnanců k podniku, náhrada celé množiny (delete+insert) přes service-role, synchronizace `employee_id` = první vybraný / NULL.
- `AssignEmployee.tsx` přepnut ze single `<select>` na vícenásobný výběr přepínacími štítky (chips). Optimistický update s revertem při chybě.
- Detail rezervace (`[id]/page.tsx`) načítá množinu z `reservation_employees` (fallback na `employee_id`), zobrazuje „Zaměstnanci/Zaměstnanec" jako spojený seznam jmen.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm exec vitest run reservation-detail` → 7 passed.
- Migrace `0051` nasazena na sdílenou DB přes `pnpm dlx supabase db push` (Applying migration 0051_reservation_employees.sql → Finished). Funkce je živá.

## 2026-06-16 — Historie rezervací klienta: multi-service popis (66 znaků) + badge docházky

### Nové funkce
- Nový sdílený modul `src/lib/reservations/serviceLabel.ts` (čisté funkce `embeddedServiceName`, `combinedServiceLabel`, `reservationServiceLabel`, konstanta `SERVICE_LABEL_MAX_CHARS=66`) — jediný zdroj pravdy pro popis služeb ve výpisech. Spojuje názvy z `Reservation_Service_Set` v pořadí `position` oddělené `, ` s ořezem na 66 znaků (přebytek „ …"), fallback na primary `services(name)`.
- `dashboard/reservations/page.tsx` přepnut na tento sdílený helper (odstraněna lokální duplicita).
- `dashboard/clients/[id]/page.tsx` (Historie rezervací) nově načítá `reservation_services(position,services(name))` a zobrazuje stejný multi-service popis (66 znaků) jako tabulka rezervací. Docházka se zobrazuje jako barevný badge: „Dorazil" zelený (electric-green tint), „Nedorazil" červený (red tint); nevyhodnoceno (null) badge nemá.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm exec vitest run` na `client-detail-empty` + `reservations-views` → 5 passed.

## 2026-06-15 — dashboard/reservations: oprava filtru dle služby (multi-service)

### Bug & fix
- **Symptom:** Filtr „Služba" na stránce rezervací (zejm. pohled „Obsazenost") nevracel nic — vždy „Žádné rezervace neodpovídají zvoleným filtrům". Filtr „Stav" fungoval.
- **Root cause:** Loadery `loadReservations`, `loadCalendarReservations` a `loadOccupancyMonth` filtrovaly přes denormalizovaný sloupec `reservations.service_id` (`.in('service_id', …)`). U kombinovaných (multi-service) rezervací tento sloupec neodráží celou množinu služeb (resp. neodpovídá vybrané službě), takže průnik byl prázdný. Stejný problém byl už dříve vyřešen v `CsvExporter`u přes join tabulku.
- **Fix:** Nový sdílený helper `collectServiceFilterReservationIds(supabase, businessId, serviceIds)` v `page.tsx` — posbírá `reservation_id` z `reservation_services` (inner join na `reservations` kvůli izolaci na `business_id`) s `service_id IN (filtr)` a hlavní dotaz se omezí `.in('id', matchedIds)`. Aplikováno ve všech třech loaderech; chování filtru „Stav" a časových mezí beze změny.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK.

## 2026-06-15 — Dashboard sidebar: sbalitelný icon-only rail + levý filtr column na Obsazenosti

### Nové funkce
- `DashboardSidebar` má nový režim `collapsed` (+ `onToggleCollapse`): skryje textové popisky, vycentruje ikony a sníží padding (`px-2`/`px-0`). Popisky zůstávají dostupné přes `title` a `sr-only` text. Přepínač (chevron, `IconLayoutSidebarLeftCollapse`/`…Expand`) je jen na desktopu; mobilní drawer zůstává vždy rozbalený.
- `DashboardChrome` drží `collapsed` stav (useState, persistuje napříč navigací díky layoutu). Aside `w-16` ⇄ `w-64`, content column `lg:ml-16` ⇄ `lg:ml-64`. Na pohledu „Obsazenost" (`/dashboard/reservations?view=occupancy`, detekce přes `useSearchParams`) se sidebar sbalí automaticky (`useEffect`); ruční přepínač zůstává funkční.
- Pohled „Obsazenost" má nyní dvousloupcový layout `lg:grid-cols-[280px_1fr]` — `ReservationPillFilters` v levém sloupci, `OccupancyView` (kalendář + graf + seznam) vpravo. Sbalení sidebaru uvolní šířku pro tento filtr column.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK.

## 2026-06-15 — Obsazenost: pill filtry (stav/služba) bez checkboxů

### Nové funkce
- `ReservationPillFilters.tsx` — „fancy" filtr stav + služba jako přepínací pilulky (chips), bez checkboxů. Výběr přepíše URL `searchParams` přes `buildReservationsHref(..., { view:'occupancy', anchor })`, takže zachová pohled i měsíc a přepočítá graf i seznam (konjunktivní průnik řeší server). „Zrušit filtry" vyčistí stav/službu.
- `loadOccupancyMonth(anchor, filters)` nově aplikuje `statuses`/`serviceIds` na měsíční dotaz (časový rozsah dál řeší výběr v kalendáři). Pohled „Obsazenost" renderuje pill filtry nad kartami; měsíční prev/next odkazy filtry zachovávají.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run src/lib/reservations tests/components` → 35 passed.

## 2026-06-15 — Obsazenost: hover tooltip v grafu + tečky obsazenosti v kalendáři

### Nové funkce
- `occupancyDotColor(pct)` v `occupancy.ts` (čistá, testovaná): < 40 % zelená `#16a34a`, 40–79 % oranžová `#f59e0b`, ≥ 80 % červená `#e7000b`.
- `MonthCalendar` zobrazuje pod dnem barevnou tečku obsazenosti (jen dny s rezervacemi); na vybraném dni je tečka bílá kvůli kontrastu. Nový prop `occupancyByDate`; `OccupancyView` ho předává z `points`.
- `OccupancyChart` je nově klientská komponenta s hover tooltipem: svislé vodítko, zvýrazněný bod na křivce a karta s datem, obsazeností (%) a počtem rezervací daného dne (HTML overlay nad vnitřní plochou grafu).

### Verifikace
- `pnpm lint` čistý; `pnpm test:run src/lib/reservations tests/components src/components/reservation` → 55 passed (vč. nového testu `occupancyDotColor`); `pnpm build` OK (první běh spadl přechodně na nesouvisejícím `/dashboard/opening-hours` — opakovaný build zelený).

## 2026-06-15 — rezervační formulář: kalendář-picker místo `<input type=date>`

### Nové funkce
- `src/components/reservation/DatePickerCalendar.tsx` — měsíční kalendář pro výběr JEDNOHO data v kroku 2 (bez rozsahu). Klientský stav měsíce, minulé dny i dny mimo měsíc nedostupné (`disabled`), prev/next šipky (prev zakázán pro měsíce ≤ aktuální), den nese `data-date` (testy/e2e). Sdílí čistou logiku mřížky s pohledem „Obsazenost" (`buildMonthGrid`/`addMonths`).
- `Step2DatePicker` nahrazuje nativní `<input type="date">` tímto kalendářem; auto-advance po výběru data i hlášky (empty/too_long) zůstávají.
- Aktualizováno: unit test `ReservationFormController` (klik na den `data-date` místo psaní do inputu) a e2e `reservation-happy-path` (klik na `button[data-date]`, příp. „Další měsíc").

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run` → 531 passed / 57 skipped.

## 2026-06-15 — dashboard/reservations: pohled „Obsazenost" (kalendář + graf)

### Nové funkce
- Nový pohled **„Obsazenost"** (třetí přepínač vedle Tabulka/Kalendář, `?view=occupancy&anchor=YYYY-MM-DD`) na `/dashboard/reservations`.
- `src/lib/reservations/occupancy.ts` (čisté funkce): `buildMonthGrid` (6×7 Po-first mřížka + cs nadpis + prev/next kotvy), `addMonths`, `pragueWeekdayIndex`, `openMinutesByWeekday`, `computeDailyOccupancy` (denní obsazenost % = rezervovaný čas aktivních rezervací / otevírací doba, cap 100), `buildSmoothPath` (Catmull-Rom→bezier SVG křivka). Pokryto unit testy (10).
- Komponenty: `MonthCalendar.tsx` (výběr dne/rozsahu, přepínání měsíce přes URL `anchor`), `OccupancyChart.tsx` (SVG plynulý graf 0–100 %, zvýraznění výběru, bez nové závislosti), `OccupancyView.tsx` (drží výběr; vlevo kalendář + `TableView` filtrovaný dle výběru, vpravo graf + průměrná obsazenost).
- `page.tsx`: loader `loadOccupancyMonth(anchor)` (rezervace měsíce + otevírací doba → body grafu); `ReservationsShell` rozšířen o `occupancyHref` a třetí přepínač; `calendar.ts` `CalendarView`/`buildReservationsHref` rozšířeny o `occupancy`.
- Design: barvy/typografie z design systému (Action Violet), zelená ze screenshotů byla jen referenční. Filtr v tomto pohledu = výběr v kalendáři (status/služba `FilterBar` se zde neuplatňují).

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run src/lib/reservations tests/components` → 34 passed (vč. nových 10 occupancy testů).

## 2026-06-15 — dashboard/reservations: výpis více služeb v tabulce

### Nové funkce
- Seznam rezervací (`src/app/(dashboard)/dashboard/reservations/page.tsx`) zobrazuje u multi-service rezervací VŠECHNY služby spojené `, ` (dříve jen primary `services(name)`). Oba dotazy (tabulka i kalendář) nově embedují `reservation_services(position,services(name))`; popis se skládá v pořadí `position`. Délka je omezená na 66 znaků po celých názvech (`combinedServiceLabel`), přebytek → „ …". Fallback na denormalizovaný `services(name)` u starších jednoslužbových rezervací bez navázaných řádků. RLS `reservation_services_owner_read` čtení pod JWT majitele umožňuje.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK; `pnpm test:run tests/components/reservations-views.spec.tsx tests/components/reservation-detail.spec.tsx` → 11 passed.

## 2026-06-15 — Notice/Alert standardizace (3 varianty)

### Nové funkce
- `Notice` (`src/components/ui/notice.tsx`) sjednocen na tři in-page varianty (NEtýká se toastů):
  - `neutral` (general): `IconBulb`, rámeček i pozadí `--color-dark`, text bílý.
  - `warning`: `IconAlertCircle`, rámeček `--color-border-yellow`, pozadí `--color-bg-yellow`, text `--color-brown`.
  - `error`: `IconCancel`, rámeček `--color-red`, pozadí bílé, text `--color-red`.
  Barvy berou tokeny z `globals.css` (`--color-dark/-red/-border-yellow/-bg-yellow/-brown`). Názvy variant `neutral`/`error` zachovány (zpětně kompatibilní), přidán `warning`.
- Hláška „blok se do dne nevejde" v `Step2DatePicker` přepnuta z `error` na `warning` (je to korektivní upozornění, ne chyba).
- Pravidlo zdokumentováno v `.kiro/steering/design-system.md` i `RULES/design-system.md` (sekce „Notice / Alert") — pro nové hlášky používat komponentu, nevytvářet ad-hoc barevné boxy.

### Verifikace
- `pnpm lint` čistý; `pnpm test:run` → 521 passed / 57 skipped; `pnpm build` OK. Aktualizovány 2 snapshoty (PublicProfileRenderer empty-state — změna ikony neutral notice; ReservationFormController dříve).

## 2026-06-15 — multi-service-reservations / notice „blok se do dne nevejde"

### Nové funkce
- `loadAvailableSlotsDetailed` (`src/server/slots/loadAvailableSlots.ts`) — vedle seznamu termínů vrací `durationExceedsDay: boolean`. Je `true`, jen když je seznam prázdný kvůli DÉLCE kombinovaného bloku: po jednom běhu DB dotazů se čistě (bez další I/O) přepočítají sloty i pro nejkratší jednotlivou službu; vejde-li se kratší blok, ale kombinovaný ne, je limitem délka. `loadAvailableSlots` je teď tenký obal vracející jen `.slots` (5 volajících beze změny).
- `getAvailableSlots` (`AvailableSlotsService.ts`) vrací `durationExceedsDay` do klienta.
- Nový stav `SlotsState = 'too_long'` + specifická hláška v `Step2DatePicker`: „Vybrané služby (celkem X min) se do tohoto dne nevejdou. Odeberte prosím některé služby, nebo zvolte jiný termín." s tlačítkem „Upravit výběr služeb" (návrat na krok 1). Při jedné službě hláška jen vyzve ke změně termínu. `ReservationFormController` rozlišuje `too_long` vs `empty` podle `durationExceedsDay` a počítá Combined_Duration pro hlášku.

### Verifikace
- `pnpm lint` čistý; `pnpm test:run src/components/reservation src/lib/slots` → 32 passed; `pnpm build` OK.

## 2026-06-15 — multi-service-reservations / UX a oprava minulých slotů

### Nové funkce
- Auto-přechod po výběru data (`src/components/reservation/ReservationFormController.tsx`): jakmile `loadAvailableSlots` vrátí neprázdný seznam termínů, formulář klienta automaticky posune z kroku 2 (datum) na krok 3 (výběr času). Prázdný/chybový výsledek auto-skok nespustí — krok 2 zůstane s příslušnou hláškou. Návrat zpět na krok 2 nerefetchuje (klíč `serviceIds|date` sedí), takže klient může datum v klidu změnit bez zacyklení.
- Telefonní input v kroku 4 (`Step4ContactForm.tsx`) má `maxLength={13}` (odpovídá `+420` + 9 číslic).

### Bug & fix
- **Symptom:** Šlo vybrat a odeslat čas v minulosti pro dnešní den (např. ve 13:29 vybrat 09:00).
- **Root cause:** `loadAvailableSlots` generoval sloty z otevírací doby bez ohledu na aktuální čas; pro dnešek tak nabízel i minulé časy. Žádný filtr „now".
- **Fix:** `src/server/slots/loadAvailableSlots.ts` po `calculateSlots` odfiltruje pro dnešní den (Europe/Prague) počáteční časy < aktuální čas. Gate platí i serverově — pre-lock grid re-check v `atomicSlotWrite` čte tentýž seznam, takže minulý čas neprojde ani přímým odesláním (skončí jako nedostupný slot). Pro budoucí dny se nefiltruje nic.
- **Pozn.:** Aktualizován test `ReservationFormController.test.tsx` (krok 2→3 je nyní auto) a regenerován jeho snapshot (Step1ServicePicker měl mezitím změněnou hover barvu na `--color-cloud-mist`).

## 2026-06-15 — multi-service-reservations / oprava nasazení RPC (migrace 0050)

### Bug & fix
- **Symptom:** Odeslání multi-service rezervace z veřejné stránky končilo chybou „Rezervaci se nepodařilo odeslat, zkuste to prosím znovu" (server 500). Přímý probe přes service-role klienta vrátil `PGRST202 — Could not find the function public.create_reservation_multi … in the schema cache` pro všechny tři funkce (`create_reservation_multi`, `create_manual_reservation_multi`, `edit_reservation_multi`).
- **Root cause:** Migrace `0049` se na sdílenou DB dostala jen částečně (tabulka `reservation_services` + backfill, které jsou v souboru první), ale tři RPC funkce definované dál v témže souboru na remote DB nevznikly. `supabase migration list` navíc ukázal, že `0049` ani nebyla zaznamenaná v remote migrační historii (tabulka byla zřejmě vytvořena ručně mimo migrační systém). Mezera unikla testům, protože všechny DB integrační property testy pro tyto RPC se bez integračního prostředí přeskakují.
- **Fix:** Nová idempotentní migrace `supabase/migrations/0050_reservation_multi_functions.sql` — `create or replace` všech tří funkcí (1:1 z 0049) + `revoke/grant` + `notify pgrst, 'reload schema'`. Nasazeno přes `pnpm dlx supabase db push` (aplikovalo 0049 i 0050; vše v 0049 je idempotentní). Po nasazení probe vrací korektní rozlišovací příznaky (`not_published`/`invalid`) místo PGRST202 — funkce jsou volatelné přes REST.
- **Pozn.:** Tělo funkcí nikdy předtím neběželo proti reálnému Postgresu (0049 je nenasadila), takže `db push` byl zároveň jejich prvním ostrým spuštěním — proběhlo bez chyby.

## 2026-06-15 — multi-service-reservations / e2e editace + ruční vytvoření (task 8.2)

### Nové funkce
- `e2e/manual-creation.spec.ts` rozšířen na KOMBINOVANOU rezervaci (R15.1, R15.2): místo zaniklého `#create-service` `<select>` nově vybírá z uspořádaného toggle seznamu (`button[aria-pressed]` v dialogu), vybere až 2 služby (fallback na 1, je-li seedovaná jen jedna), ověří počet vybraných přepínačů (`aria-pressed="true"`), a po vytvoření otevře detail a ověří „Celková délka" + počet položek množiny služeb (`dd ul > li`). Zachováno původní pokrytí: stav „Schváleno" v seznamu (R12.4) a podmíněná absence potvrzovacího e-mailu (R12.5).
- `e2e/edit-flow.spec.ts` rozšířen o volitelnou změnu služby (R9.1) přes single-select `#edit-service` (vybere jinou než aktuální, je-li víc možností) → změna množiny služeb a tím přepočet Combined_Duration/`ends_at` (R9.2) → vynucená revalidace slotu časem `02:00` (R9.3) a uložení. Editační UI zůstává single-select; ukládá přes `*_multi` RPC se `serviceIds`.

### Verifikace
- `pnpm exec eslint e2e/manual-creation.spec.ts e2e/edit-flow.spec.ts` → 0 chyb; get_diagnostics bez nálezů.
- `pnpm exec playwright test e2e/manual-creation.spec.ts e2e/edit-flow.spec.ts` → 2 skipped (guard `hasOwnerCreds` bez seedovaných `E2E_OWNER_*` v sandboxu; specy se korektně sesbíraly, zkompilovaly a proběhly přes Playwright). Plný běh vyžaduje seedovaného majitele + dostupné Chromium/dev server.

## 2026-06-15 — multi-service-reservations / property test obsahu transakčního e-mailu (task 7.5)

### Nové funkce
- `src/lib/email/templates/__tests__/transactional-email-content.property.test.ts` — čistý property test Property 15 (R16.1, R16.2). Pro náhodný uspořádaný seznam 1..10 služeb (unikátní názvy z bezpečné abecedy) + Combined_Duration a Combined_Price ověřuje, že textová varianta `renderReservationConfirmationEmail` i `renderReservationNotificationEmail` obsahuje: všechny názvy služeb, zachované pořadí (indexOf vyrenderovaných řádků `- name (dur min)` striktně rostoucí), Combined_Duration a Combined_Price (jen je-li > 0 Kč; při 0 Kč skryta). Cena se porovnává přes shodný `Intl.NumberFormat('cs-CZ')` jako šablona (oddělovač tisíců). Asserce na TEXT variantě → bez interakce s HTML-escapováním. fast-check `numRuns: 200`.

### Verifikace
- `pnpm test:run src/lib/email/templates/__tests__/transactional-email-content.property.test.ts` → 1 passed. `pnpm lint` green.

## 2026-06-15 — multi-service-reservations / property test CSV filtru služby (task 7.6)

### Nové funkce
- `tests/properties/csv-service-filter.spec.ts` — čistý property test Property 14 (R14.2, R14.3, R14.4). Extrahuje predikát zahrnutí CSV exportu (`includedInExport`) zrcadlící logiku `CsvExporter`u (business scope přes `.eq('business_id')` + sběr `reservation_id` s neprázdným průnikem `Reservation_Service_Set` × filtr) a ověřuje ho proti nezávislému množinovému orákulu napříč náhodnými vstupy (fast-check, `numRuns: 200`). Pokrývá podpřípady: filtr neaktivní → zahrnuta iff business odpovídá; cizí podnik → vždy vyloučena; neprázdný průnik → zahrnuta; disjunktní průnik s aktivním filtrem → vyloučena. Čistý (bez DB) — doplňuje integrační `tests/integration/csv-scope.test.ts` (R17.4/R17.5).

### Verifikace
- `pnpm test:run tests/properties/csv-service-filter.spec.ts` → 5 passed. `pnpm lint` green.

## 2026-06-15 — multi-service-reservations / klientský controller multi-select (task 6.1)

### Nové funkce
- `ReservationFormController` (`src/components/reservation/ReservationFormController.tsx`) přepnut z jedné služby na uspořádanou množinu (R1.5, R2.3, R3.2, R6.1, R8.1, R8.3, R8.4): stav `selectedServiceId: string | null` → `selectedServiceIds: string[]` (pořadí výběru) řízený čistým reducerem `toggleService` + pojistka horního limitu `MAX_SERVICES_PER_RESERVATION`. `selectedServices` (uspořádané `ReservationService[]`) přes `useMemo`. Fetch slotů nově klíčován `serviceIds.join(',')|date` a předává `serviceIds` do `getAvailableSlots`; změna MNOŽINY služeb zneplatní sloty/čas a vrací `maxStep` na 1. Přechod z kroku 1 jen při `length ≥ 1`. Submit posílá `serviceIds: selectedServiceIds` do `createReservation`. `Step5Summary` dostává `services={selectedServices}`, `Step1ServicePicker` `selectedServiceIds`/`onToggle`.
- **Průnik zaměstnanců (R8.2, R8.3):** prop `serviceEmployees` (`Record<serviceId, {id,name,photoUrl}[]>`) se adaptuje na tvar helperu (`Record<serviceId, employeeId[]>`); nabídnutelní zaměstnanci = `employeesForSelection(mapping, selectedServiceIds)` namapovaní zpět na objekty pro carousel. Při změně výběru, kdy dříve zvolený zaměstnanec vypadne z průniku, se zruší přes `clearEmployeeIfOutsideSelection`.
- Pozn.: Combined_Duration/Combined_Price se na úrovni controlleru samostatně nepočítají — průběžný souhrn vlastní `Step1ServicePicker` (task 6.2) a souhrn `Step5Summary` (task 7.1), oba přes sdílené helpery `combinedDuration`/`combinedPrice`. Přidávat duplicitní memo na controlleru by bylo mrtvé `no-unused-vars` (build by spadl) — vynecháno záměrně.

### Migrace volajících
- `CreateReservationDialog` (`src/app/(dashboard)/dashboard/reservations/CreateReservationDialog.tsx`) převeden na multi-select (R15.1): single `<select>` → uspořádaný seznam přepínacích řádků (pořadové číslo u vybraných, „Vybráno/Vybrat", `toggleService`), stav `serviceId` → `serviceIds: string[]`, předává `serviceIds` do `createManualReservation`. Lehká klientská kontrola „vyberte alespoň jednu službu".
- `ReservationFormController.test.tsx` aktualizován na multi-select API (nadpis „Výběr služeb"); zastaralý snapshot smazán a regenerován.

### Verifikace
- `pnpm lint` green; `pnpm test:run` → 505 passed / 57 skipped (vč. 3 dříve červených `ReservationFormController` testů, nyní zelené); `pnpm build` green (CSS warning `bg-[var(...)]` je předchozí, nesouvisí).

## 2026-06-15 — multi-service-reservations / CSV export kombinovaných rezervací (task 7.4)

### Nové funkce
- `CsvExporter` (`src/server/CsvExporter.ts`) rozšířen na kombinované rezervace (R14.1–R14.4). SELECT nově čte `reservation_services(position, price_czk_snapshot, duration_minutes_snapshot, services(name))` místo single `services(name)`. Sloupec `service_name` = názvy všech služeb v `Reservation_Service_Set` spojené ` + ` v pořadí `position` (přes sdílený `joinServiceNames`, řazení dle position řeší helper — embed může přijít nesetříděný). Pro single-service rezervace (backfill position-0) přirozeně vrací jeden název.
- **Pořadí sloupců:** dva nové sloupce `combined_duration_minutes` a `combined_price_czk` (součty snapshotů přes `combinedDuration`/`combinedPrice`) umístěny hned ZA `service_name`, aby zůstaly všechny údaje o službách pohromadě. Nová hlavička: `id, starts_at, ends_at, service_name, combined_duration_minutes, combined_price_czk, client_name, …, created_at`.
- **Filtr služby = test neprázdného průniku (R14.3, R14.4):** místo `.in('service_id', …)` na denormalizovaném sloupci se při aktivním filtru nejdřív posbírají `reservation_id` z `reservation_services` (inner join na `reservations` kvůli izolaci na `business_id`), jejichž `service_id` je ve filtru; hlavní dotaz se pak omezí `.in('id', matchedIds)`. Bez aktivního filtru chování beze změny. Zachováno dávkové čtení/streaming a log bez PII.

### Verifikace
- `pnpm test:run tests/unit/csv-format.spec.ts tests/properties/csv-escaping.spec.ts` → 9 passed. `pnpm lint` green. Diagnostics dotčených souborů čisté.
- Pozn.: `pnpm test:run` (celá sada) hlásí 3 NESOUVISEJÍCÍ faily v `ReservationFormController.test.tsx` (`Step1ServicePicker` čte `services.map` z undefined) — klientská multi-select vrstva z jiného rozpracovaného tasku, mimo rozsah 7.4. CSV testy i lint zelené.

## 2026-06-15 — multi-service-reservations / detail rezervace v dashboardu (task 7.2)

### Nové funkce
- Detail rezervace `src/app/(dashboard)/dashboard/reservations/[id]/page.tsx` rozšířen na kombinovanou rezervaci (R13.1–R13.4): `loadReservation` nově načte `reservation_services(position, service_id, duration_minutes_snapshot, price_czk_snapshot, services(name))` přes uživatelský JWT (RLS `reservation_services_owner_read`), seřazené dle `position` (+ pojistné JS řazení). Zobrazení vypíše všechny služby v uloženém pořadí (číslo + název + délka), `Celková délka` a `Celková cena` ze snapshotů přes čisté helpery `combinedDuration`/`combinedPrice` (cena 0 Kč skrytá, konzistentně se souhrnem), jeden časový blok `starts_at`–`ends_at` v Europe/Prague (`toPragueDisplay`) a jméno přiřazeného zaměstnance. `DetailRowItem` value rozšířen na `ReactNode` kvůli seznamu služeb. Fallback na jednu službu při prázdné množině (defenzivní). Lokální `formatPriceCzk` (cs-CZ, max 2 desetinná) dle konvence `ServicesList`.
- `tests/components/reservation-detail.spec.tsx` rozšířen o render kombinovaného detailu (seznam služeb v pořadí, součty 90 min / 700 Kč, blok 10:00–11:30 CEST, zaměstnanec) a o skrytí ceny při 0 Kč; mock harness doplněn o `reservation_services`, `services`, admin `employees`.

### Bug & fix
- **Symptom:** build type-check: `ReservationActions.tsx` volal `editReservation({ serviceId })`, ale `EditReservationInput` má nově `serviceIds: string[]` (task 4.5).
- **Fix:** minimální wiring — `handleEdit` posílá `serviceIds: [editServiceId]` (single-select edit UI beze změny). 
- **Pozn.:** `pnpm build` type-check stále blokuje NESOUVISEJÍCÍ pending task — `src/app/(dashboard)/dashboard/reservations/CreateReservationDialog.tsx` volá `createManualReservation({ serviceId })`, zatímco `CreateManualReservationInput` má `serviceIds[]` (task 4.4). Mimo rozsah 7.2 (ruční vytvoření, klientská vrstva). Ověřeno pro 7.2: `pnpm lint` green, `pnpm test:run tests/components/reservation-detail.spec.tsx` (7 passed), diagnostics edited souborů čisté.


## 2026-06-15 — multi-service-reservations / integrační property test stability snapshotu (task 4.12)

### Nové funkce
- `tests/properties/snapshot-stability.spec.ts` — Property 10 (Stabilita snapshotu délky a ceny, R7.5): fast-check, 100 iterací, DB-backed integrační test proti reálnému Postgresu. Seed user→business (`is_published=true`, aktivní předplatné, `auto_approve_reservations=true`, `allow_parallel_slots=true` → overlap re-check vypnutý, žádný šum z kolizí)→služby. Per běh: vytvoří rezervaci přes RPC `create_reservation_multi` s vygenerovanou uspořádanou podmnožinou služeb a vlastním budoucím `starts_at` (dayOffset); načte write-time snapshoty z `reservation_services`; UPDATE podkladových `services.duration_minutes`/`price_czk` na jiné hodnoty (+5 / +111); re-read `reservation_services` a ověří, že `duration_minutes_snapshot`/`price_czk_snapshot` zůstaly NEZMĚNĚNÉ + sanity check, že update služeb opravdu zabral. Restore ceníku služeb + smazání rezervace v `finally` (cascade odstraní reservation_services). Tag `// Feature: multi-service-reservations, Property 10: ...`, anotace `_Requirements: 7.5_`. Skip přes `describe.skipIf(!hasIntegrationEnv)` shodně s ostatními DB integračními testy. Ověřeno: `pnpm lint` green, `pnpm test:run` na souboru (1 skipped — integrační Supabase env není v tomto prostředí nakonfigurované, projektová konvence).

## 2026-06-15 — multi-service-reservations / unit-edge testy server vrstvy + oprava mock harness (task 4.14)

### Nové funkce
- `tests/unit/reservation-server-edge.spec.ts` — unit/edge testy server vrstvy (task 4.14): `loadAvailableSlots(serviceIds=[]) → []` přes `vi.importActual` (R6.4, ověřeno i že se DB vůbec nedotáže — exploding klient); `validateServiceCount` hraniční hlášky `n=0`/`n=11` + přijetí `n=1`/`n=10` (R5.2, R5.3); `createReservation` rozsah → 400 s českými hláškami; status dle RPC `approved`/`pending` (R7.6); UTC `p_starts_at` (09:00 Praha v červnu = `2025-06-16T07:00:00.000Z`, R7.4); best-effort — odmítnuté oba e-maily + vyhazující `serverLog.info` nezruší rezervaci (R16.4, R16.5); `createManualReservation` vždy approved-only RPC bez potvrzovacího e-mailu klientovi (R15.4). 12 testů.

### Bug & fix
- **Symptom:** `pnpm test:run` padal v 6 mock property specs s `TypeError: Cannot read properties of undefined (reading 'length')` na `ReservationCreator.ts:204`, `ReservationEditor.ts:175`, `ManualReservationCreator.ts:149`.
- **Root cause:** Server vrstva přešla na multi-service signatury (`serviceId` → `serviceIds`, RPC `create_reservation`/`edit_reservation`/`create_manual_reservation` → `*_multi`, služby se čtou přes `.in(...).returns()` jako POLE), ale sdílený harness `tests/properties/_support/reservation-harness.ts` + `mutation-harness.ts` a mock specs stále posílaly starý jednoslužbový `serviceId`, takže `input.serviceIds` bylo `undefined`.
- **Fix:** Harness aktualizován pro multi-service — `buildInput` → `serviceIds: ['svc-1']`; fake `from('services')` podporuje `select().in().eq().returns()` vracející POLE řádků (`maybeSingle` zachováno pro businesses/users/reservations); RPC mocky přejmenovány na `*_multi`; `CreateReservationRpcRow`/`EditRpcRow`/`ManualRpcRow` rozšířeny o `invalid` (+ `rpcInvalid()` builder, `__rpcArgs` pro ověření UTC). Specs `status-assignment`, `reservation-atomicity`, `email-best-effort`, `sensitive-data-logs`, `edit-atomicity`, `manual-creation-status` přepsány na `serviceIds` a `*_multi` názvy RPC při zachování původního záměru property.
- **Pozn.:** `pnpm build` type-check zatím selhává jen v PENDING klientských taskech (`ReservationFormController.tsx` → task 6.1, `ReservationActions.tsx` → task 7.2), které stále volají server actions se starým `serviceId`. Mimo rozsah 4.14. Ověřeno: `pnpm test:run` (491 passed, 56 skipped, 0 failed) + `pnpm lint` green.

## 2026-06-15 — multi-service-reservations / integrační property test atomicity editace (task 4.11)

### Nové funkce
- `tests/properties/edit-atomicity-multi.spec.ts` — Property 9 (Atomicita editace s vyloučením sebe sama, RPC `edit_reservation_multi` z migrace `0049`): fast-check, 100 iterací, DB-backed integrační test. Nasadí upravovanou rezervaci přes `create_reservation_multi` (zatím bez kolizí), naseeduje generovanou sadu OSTATNÍCH rezervací přímo do `reservations` (i neaktivní rejected/cancelled) a zavolá `edit_reservation_multi` s novou množinou služeb + novým časem (volitelně `sameTime` = ponechání původního času → překryv se sebou samou). Očekávaný výsledek se v TS počítá DETERMINISTICKY jen nad OSTATNÍMI aktivními rezervacemi (vlastní interval se nezahrnuje) → přímý test vyloučení sebe sama (R9.5): (a) překryv s vlastním původním intervalem bez kolize s jinou aktivní ⇒ `updated=true`, `conflict=false`; (b) úspěch ⇒ nový interval bez překryvu s jinou aktivní rezervací; (c) `reservation_services` obsahuje přesně novou množinu (pozice 0..n-1, `service_id` v pořadí) bez zbytků + `ends_at = starts_at + Combined_Duration`; konflikt ⇒ `updated=false` a stará množina/čas beze změny (žádný částečný zápis). Tag `// Feature: multi-service-reservations, Property 9: ...`. Validates Requirements 9.3, 9.5. Skip přes `describe.skipIf(!hasIntegrationEnv)` shodně s ostatními DB integračními testy. Ověřeno: `pnpm lint` green, `pnpm test:run` na souboru (1 skipped — integrační Supabase env není v tomto prostředí ani CI nakonfigurované).

## 2026-06-15 — multi-service-reservations / integrační property test cascade delete (task 4.13)

### Nové funkce
- `tests/properties/reservation-services-cascade.spec.ts` — Property 12 (Hard delete kaskáduje na množinu služeb, FK `reservation_services.reservation_id` → `reservations(id) ON DELETE CASCADE` z migrace `0049`): fast-check, 100 iterací, DB-backed integrační test. Pro libovolnou rezervaci vytvořenou přes RPC `create_reservation_multi` s generovanou bezduplicitní sadou služeb ověřuje, že vznikne přesně `|service set|` řádků `reservation_services`, a po hard delete řádku rezervace (`admin.from('reservations').delete().eq('id', …)`) nezůstane pro dané `reservation_id` žádný řádek `reservation_services`. Každý běh používá vlastní budoucí slot (`dayOffset`) → bez vzájemných překryvů; úklid per iteraci. Tag `// Feature: multi-service-reservations, Property 12: ...`. Validates Requirements 10.3. Skip přes `describe.skipIf(!hasIntegrationEnv)` shodně s ostatními DB integračními testy. Ověřeno: `pnpm lint` green, `pnpm test:run` na souboru (1 skipped — integrační Supabase env není v tomto prostředí ani CI nakonfigurované).

## 2026-06-15 — multi-service-reservations / integrační property test atomicity vytvoření (task 4.10)

### Nové funkce
- `tests/properties/create-atomicity-multi.spec.ts` — Property 8 (Atomicita a vyloučení překryvu při vytvoření, RPC `create_reservation_multi` z migrace `0049`): fast-check, 100 iterací, DB-backed integrační test. Seeduje generovanou sadu existujících rezervací (i neaktivní rejected/cancelled, které blok neblokují) + kandidátní blok `[starts_at, starts_at + Combined_Duration)` při `allow_parallel_slots = false`. Deterministicky v TS spočítá očekávaný výsledek (konflikt ⇔ překryv s aktivní pending/approved rezervací, half-open `[)`) a ověří: úspěch ⇒ `conflict=false`, blok bez překryvu a přesně `|service set|` řádků `reservation_services`; konflikt ⇒ `conflict=true`, `reservation_id=null`, žádný nový řádek `reservations` ani `reservation_services` (žádný částečný zápis). Volá přímo RPC přes service-role klienta (advisory lock + overlap re-check žijí v DB). Tag `// Feature: multi-service-reservations, Property 8: ...`. Validates Requirements 6.3, 7.2, 7.3, 15.2, 15.5. Skip přes `describe.skipIf(!hasIntegrationEnv)` shodně s ostatními DB integračními testy. Ověřeno: `pnpm lint` green, `pnpm exec vitest run` na souboru (1 skipped — integrační Supabase env není v tomto prostředí ani CI nakonfigurované).

## 2026-06-12 — multi-service-reservations / property test ends_at (task 4.7)

### Nové funkce
- `src/lib/reservation/__tests__/endsAt.property.test.ts` — Property 3 (`ends_at = starts_at + Combined_Duration`): čistý TS property test (bez DB), fast-check, 200 iterací. Lokální čistý helper `endsAt(startsAt, services) = new Date(startsAt.getTime() + combinedDuration(services) * 60_000)` ověřuje, že pro libovolný `starts_at` a neprázdnou množinu služeb se `ends_at` rovná `starts_at` + `Combined_Duration` (min) a že rozdíl v minutách je přesně `Combined_Duration`. Používá `combinedDuration` z `combine.ts`. Tag `// Feature: multi-service-reservations, Property 3: ...`. Validates Requirements 2.2, 9.2, 15.2. Ověřeno: `pnpm test:run` (2 passed) + `pnpm lint` green.

## 2026-06-12 — multi-service-reservations / integrační property test backfillu (task 2.7)

### Nové funkce
- `tests/properties/backfill-single-service.spec.ts` — Property 16 (Backfill jednoslužbové rezervace, migrace `0049`): fast-check, 100 iterací, DB-backed integrační test. Pro libovolnou nasazenou jednoslužbovou rezervaci ověřuje, že (idempotentní) backfill vytvoří přesně jeden řádek `reservation_services` s `position = 0`, `service_id` = `reservations.service_id` a snapshotem délky/ceny. Varianta (a) ze zadání: rezervace se nasazují přímo do `reservations` a backfill se znovu spustí (replikace `INSERT ... SELECT reservations JOIN services ... ON CONFLICT DO NOTHING` přes JS klienta s `upsert ignoreDuplicates`, protože syrové SQL/SQL-exec RPC není přes Supabase JS klienta dostupné). Tag `// Feature: multi-service-reservations, Property 16: ...`. Validates Requirements 11.1. Skip přes `describe.skipIf(!hasIntegrationEnv)` shodně s ostatními DB integračními testy. Ověřeno: `pnpm lint` green, `pnpm test:run` (1 skipped — integrační Supabase env není v tomto prostředí ani CI nakonfigurované, takže assertiony se podle konvence projektu nespustí, ale neselžou).

## 2026-06-12 — multi-service-reservations / atomicSlotWrite serviceIds[] (task 4.2)

### Nové funkce
- `lib/reservations/atomicSlotWrite.ts` — `AtomicSlotWriteParams` přejmenován `serviceId: string` → `serviceIds: string[]`; hodnota se předává do `loadAvailableSlots` (nový tvar `{ businessId, serviceIds, dateISO, excludeReservationId?, requirePublished? }`). Orchestrace (pre-lock grid re-check → delegovaný RPC zápis) beze změny. Ověřeno: `pnpm lint` green, `pnpm test:run src/lib/slots` (16 passed). `tsc --noEmit` na atomicSlotWrite.ts bez chyb; zbývající type chyby jsou jen v dosud neaktualizovaných volajících (ReservationCreator 4.3, ManualReservationCreator 4.4, ReservationEditor 4.5, AvailableSlotsService) — očekávané do dokončení těch tasků.

## 2026-06-12 — multi-service-reservations / property test joinServiceNames (task 1.10)

### Nové funkce
- `lib/reservation/__tests__/combine.join.property.test.ts` — Property 13 (CSV spojuje názvy služeb oddělovačem " + "): fast-check, 200 iterací. Ověřuje, že spojený řetězec se rovná názvům seřazeným podle `position` (stabilní tie-break přes index) spojeným " + ", a že bez `position` se zachová pořadí vstupu. Samostatný soubor (nesdílí s combine.property.test.ts pro Properties 1 & 2). Tag `// Feature: multi-service-reservations, Property 13: ...`. Validates Requirements 14.1. Ověřeno: `pnpm test:run` (2 passed) + `pnpm lint` green.

## 2026-06-12 — multi-service-reservations / property test toggle reducer (task 1.7)

### Nové funkce
- `lib/reservation/__tests__/selection.property.test.ts` — Property 5 (Korektnost toggle výběru služeb): fast-check, 100 iterací. Ověřuje bez duplicit po libovolné sekvenci toggle, přidání nevybrané na konec (R1.1/R1.2), odebrání vybrané se zachováním pořadí (R1.2), čistotu (nemutuje vstup) a dvojí toggle. Tag `// Feature: multi-service-reservations, Property 5: ...`. Validates Requirements 1.1, 1.2, 1.3.

### Bug & fix (triage property testu)
- **Symptom:** invariant „dvojí toggle = identita" selhal, counterexample `[["b","a"],"b"]` (expected `["a","b"]` to equal `["b","a"]`).
- **Root cause:** test byl over-specified. Sémantika reduceru je append-on-add (R1.2): odebrání vybrané služby a její opětovné přidání ji vrátí na KONEC, ne na původní pozici. Pořadí-identita pod dvojím toggle není v acceptance criteria (1.1–1.3 ji nevyžadují). Implementace je správná.
- **Fix:** rozdělen na dvě korektní vlastnosti — (a) dvojí toggle zachová stejnou MNOŽINU výběru (`new Set` rovnost), (b) dvojí toggle dosud nevybrané služby je úplná identita (add-then-remove). Acceptance criteria ani implementace se neměnily.

### Ověřeno
- `pnpm test:run` cílově na `selection.property.test.ts` 6 passed; `pnpm lint` čistý. PBT status: passed.

## 2026-06-12 — multi-service-reservations / property test průnik zaměstnanců (task 1.9)

### Nové funkce
- `lib/reservation/__tests__/employees.property.test.ts` — Property 11 (Nabídka zaměstnanců je průnik přes vybrané služby): fast-check, 200 iterací. Dva `it` bloky: (1) `employeesForSelection` vrací množinový průnik přes omezující služby, služba bez řádku v mapování = „umí ji všichni" (do průniku nevnáší omezení), výsledek bez duplicit; (2) `clearEmployeeIfOutsideSelection` zachová vybraného zaměstnance uvnitř průniku a zruší (→ `null`) mimo něj nebo při prázdném výběru. Nezávislý referenční výpočet průniku v testu. Tag `// Feature: multi-service-reservations, Property 11: ...`. Validates Requirements 8.2, 8.3.

### Ověřeno
- `pnpm test:run` cílově na `employees.property.test.ts` 2 passed; `pnpm lint` čistý. PBT status: passed.

## 2026-06-12 — multi-service-reservations / property test combinedPrice (task 1.6)

### Nové funkce
- `lib/reservation/__tests__/combine.property.test.ts` — Property 2 (Combined_Price je součet cen): fast-check, 200 iterací; ověřuje rovnost `combinedPrice` se součtem `priceCzk` a invarianci vůči pořadí (komutativita). Tag `// Feature: multi-service-reservations, Property 2: ...`. Soubor je sdílený s task 1.5 (Property 1) — přidáno jako samostatný describe blok.

### Ověřeno
- `pnpm test:run` cílově na `combine.property.test.ts` 2 passed; `pnpm lint` čistý.

## 2026-06-12 — multi-service-reservations / Property test pro combinedDuration (task 1.5)

### Nové funkce
- `lib/reservation/__tests__/combine.property.test.ts` — property test (fast-check, 200 iterací) ověřující Property 1: `combinedDuration(services)` je rovna součtu `durationMinutes` všech služeb pro libovolnou neprázdnou množinu (velikost 1..10 → pokrývá i mezní jednoslužbový případ). Tag `// Feature: multi-service-reservations, Property 1: ...`, generátor služeb s volitelnou `position`.

### Ověřeno
- `pnpm lint` čistý; `pnpm test:run` cílově na `combine.property.test.ts` passed. PBT status: passed.

## 2026-06-12 — multi-service-reservations / průnik zaměstnanců přes vybrané služby (task 1.4)

### Nové funkce
- `lib/reservation/employees.ts` — čisté helpery výběru zaměstnance u kombinované rezervace: `employeesForSelection(mapping, selection)` vrací průnik `service_employees` přes vybrané služby (R8.2); služba bez řádku v mapování = „umí ji všichni" (do průniku nevnáší omezení), žádná omezující služba → celý vesmír zaměstnanců (sjednocení napříč mapováním, deduplikace, pořadí prvního výskytu). `clearEmployeeIfOutsideSelection(mapping, selection, selectedEmployeeId)` zruší dříve vybraného zaměstnance mimo aktuální průnik (R8.3). Exportuje typy `ServiceEmployeeMapping`, `ServiceId`, `EmployeeId`.

### Ověřeno
- `pnpm lint` čistý; `pnpm test:run` cílově na `employees.test.ts` 9 passed (edge: služba bez řádku, prázdný výběr → vesmír, disjunktní množiny → prázdno, deduplikace/pořadí, zrušení zaměstnance mimo průnik). Property test P11 je samostatný task 1.9.

## 2026-06-12 — multi-service-reservations / čisté helpery součtů a spojení názvů (task 1.2)

### Nové funkce
- `lib/reservation/combine.ts` — čisté helpery pro kombinovanou rezervaci: `combinedDuration(services)` (součet `durationMinutes`), `combinedPrice(services)` (součet `priceCzk`) a `joinServiceNames(services)` (spojení názvů oddělovačem ` + ` v pořadí `position`, stabilní řazení; bez `position` zachová pořadí vstupu). Exportuje typ `CombinableService = { name; durationMinutes; priceCzk; position? }`. Jediný zdroj pravdy pro průběžný výpočet ve formuláři, pre-lock check, e-maily a CSV.

### Ověřeno
- `pnpm lint` čistý; `pnpm test:run` cílově na `combine.test.ts` 11 passed (edge: prázdný seznam, n=1, nulová cena, zamíchané/chybějící `position`). Property testy P1/P2/P13 jsou samostatné tasky 1.5/1.6/1.10.

## 2026-06-12 — multi-service-reservations / sdílený modul limitů (task 1.1)

### Nové funkce
- `lib/reservation/limits.ts` — jediný zdroj pravdy o limitech počtu služeb na rezervaci: `MIN_SERVICES_PER_RESERVATION = 1`, `MAX_SERVICES_PER_RESERVATION = 10`, `validateServiceCount(n)` vracející `{ ok: true } | { ok: false; reason; message }` s českými hláškami „Vyberte alespoň jednu službu" / „Najednou lze vybrat nejvýše 10 služeb". Použije klient (krok 1), server (validace) i komentář SQL migrace 0049.

### Ověřeno
- `pnpm lint` čistý; `pnpm test:run` cílově na `limits.test.ts` 5 passed (edge: n=0, n=11, hraniční n=1/n=10).

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

## 2026-06-20 — Účet: „Změna tarifu" kartově (sdílená komponenta PlanCards)

### Nové funkce
- Nová sdílená komponenta `src/components/subscription/PlanCards.tsx` — mřížka karet tarifů (Start/Pokročilý/Max) s cenou, feature listem, zvýrazněným aktuálním tarifem („Váš aktuální tarif", jen když je předplatné aktivní/ne-free) a CTA „Upgradovat/Zvolit tarif" prokliknutím na `/dashboard/subscription?plan=…` (→ platba). Extrahováno 1:1 z `/dashboard/plans`.
- `/dashboard/plans` přepnut na `<PlanCards>` (odstraněn inline grid + nepoužité helpery `getCta`, `currency`, `renewalDate`, `PLAN_TAGLINES`, `planPriceCzk`, `Link`). Porovnávací tabulka zůstává.
- `/dashboard/account` sekce „Změna tarifu" (`id="zmena-tarifu"`) nově zobrazuje `<PlanCards>` místo select-based `SubscriptionManager`. Mirror layoutu `/dashboard/plans` (status karta + karty tarifů). Žádná změna platební logiky — CTA vede na stávající checkout/plan-change flow na `/dashboard/subscription`.

### Pozn.
- Na účtu tím zmizel select + správa automatické obnovy / čekající změny tarifu (ty zůstávají na dedikované stránce `/dashboard/subscription`, kam karty odkazují).
- DOPLNĚNO: `SubscriptionManager` dostal prop `showPlanChange` (default true). Na `/dashboard/account` se pod kartami vykresluje s `showPlanChange={false}` (jen pro active/grace) → zůstává „Automatická obnova" + případné „Zrušit změnu tarifu", select-based změna tarifu skrytá (řeší karty). `id="zmena-tarifu"` na sekci jen když `showPlanChange` (na účtu nese kotvu kartová sekce).

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK (39/39, jen pre-existující CSS warning).

## 2026-06-20 — Reset hesla: blokovaný submit v sandboxovaném rámci

### Bug & fix
- **Symptom:** Na `/reset-password?...&type=recovery` klik na „Změnit heslo" nic neudělal; konzole: „Blocked form submission to '' because the form's frame is sandboxed and the 'allow-forms' permission is not set."
- **Root cause:** Tlačítko bylo `type="submit"` ve `<form>`. V sandboxovaném rámci (preview iframe bez `allow-forms`) prohlížeč blokuje nativní odeslání formuláře (na prázdnou akci) — k němu dojde, když klik proběhne dřív než React hydratace stihne navázat `onSubmit` s `preventDefault`.
- **Fix:** `ResetPasswordForm.tsx` — tlačítko změněno na `type="button"` s `onClick={submit}`; submit čte data přes `formRef` a volá `resetPasswordAction`. `onSubmit` na formuláři zůstává (Enter v poli) a vždy `preventDefault`uje. Tím se primární akce nikdy nespoléhá na nativní submit, takže sandbox ji neblokuje.

### Verifikace
- `pnpm lint` čistý; get_diagnostics bez nálezů.

## 2026-06-20 — Reset hesla: verifikace v Route Handleru + odhlášení cizí session (záměna účtů)

### Bug & fix
- **Symptom:** Přihlášen účet A; v anonymním okně vyžádán reset pro účet B; B-čkový recovery odkaz vložen do okna s přihlášeným A → reset se přesto provedl a konzole hlásila chybu (blokovaný zápis cookies).
- **Root cause:** Recovery token se verifikoval (`verifyOtp`) přímo v Server Componentě `/reset-password`. Server Componenta neumí v Next 15 zapsat cookies (`setAll` je v try/catch spolknut), takže session vlastníka odkazu (B) se neuložila a `resetPasswordAction` pak pracoval nad zbylou session (A) → změna hesla špatnému účtu + console error ze zápisu cookies.
- **Fix:**
  - Nový Route Handler `src/app/auth/confirm/route.ts` (GET) — verifikuje OTP/recovery (umí zapsat session cookies) a **před verifikací odhlásí případnou existující session** (`signOut({ scope: 'local' })`), takže obnova proběhne čistě pro vlastníka odkazu; úspěch → redirect `/reset-password`, neúspěch → `/reset-password?error=invalid_link`.
  - `forgot-password/actions.ts`: recovery odkaz nově míří na `/auth/confirm` (místo `/reset-password`).
  - `reset-password/page.tsx`: už neprovádí `verifyOtp`; odkazy s tokenem (i starší) přesměruje na `/auth/confirm`; bez tokenu zobrazí formulář jen při existující session, jinak „Odkaz nefunguje".
  - Aktualizován test `forgot-password/__tests__/actions.test.ts` (redirectTo + URL na `/auth/confirm`).

### Verifikace
- `pnpm exec vitest run forgot-password` → 3 passed; `pnpm lint` čistý; `pnpm build` OK (nová route `/auth/confirm`).

## 2026-06-20 — Auth formuláře: odstranění nativního submitu (sandbox „allow-forms")

### Bug & fix
- **Symptom:** Na `/forgot-password` (a stejně i login/register) konzole hlásila „Blocked form submission to '' because the form's frame is sandboxed and the 'allow-forms' permission is not set." Ostatní hlášky v logu (Bitwarden SDK, SignalR, „allow-scripts", fido2, back/forward cache) jsou šum z rozšíření prohlížeče / sandboxovaného preview rámce, ne z appky.
- **Root cause:** Tlačítka byla `type="submit"`; v sandboxovaném rámci (preview iframe bez `allow-forms`) prohlížeč blokuje nativní odeslání formuláře (na prázdnou akci), které proběhne dřív, než React naváže `onSubmit`/`preventDefault`.
- **Fix:** Stejný vzor jako u reset-password — `ForgotPasswordForm`, `LoginForm`, `RegisterForm`: tlačítko `type="button"` + `onClick={submit}`, submit čte data přes `formRef`; `onSubmit` zůstává (Enter) a `preventDefault`uje. Primární akce už nikdy nespoléhá na nativní submit.

### Verifikace
- `pnpm exec vitest run` login/register/forgot/reset → 5 passed; `pnpm lint` čistý; diagnostics bez nálezů.

## 2026-06-20 — Pole hesla: přepínač zobrazit/skrýt (IconEye / IconEyeOff)

### Nové funkce
- Nová UI komponenta `src/components/ui/PasswordInput.tsx` — obal nad `Input` s přepínacím tlačítkem (IconEye/IconEyeOff) pro zobrazit/skrýt heslo. Stejné API jako `Input` (kromě `type`), `className` jde na vnější obal (margins), input má rezervu vpravo na ikonu; tlačítko `tabIndex={-1}`, `aria-label`/`aria-pressed`.
- Nasazeno ve všech polích hesla: `LoginForm` (heslo), `RegisterForm` (heslo, controlled), `ResetPasswordForm` (nové heslo + potvrzení), `AccountCredentialsForm` (nové heslo + potvrzení). Demo `app/components/page.tsx` ponecháno beze změny.

### Pozn.
- Auth flow předtím nefungoval jen kvůli rozšíření prohlížeče (Grammarly měnil DOM → rozbitá hydratace); v anonymním okně vše funguje. Žádná změna v appce kvůli tomu nebyla potřeba (kód ověřen render testem `ForgotPasswordForm.test.tsx`).

### Verifikace
- `pnpm lint` čistý; `pnpm exec vitest run` auth → 7 passed; `pnpm build` OK.

## 2026-06-20 — Admin: stránka Nastavení účtu (změna e-mailu/hesla) + skrytí Nápovědy

### Nové funkce
- Nová stránka `/admin/account` (`src/app/admin/account/page.tsx`) — administrátor si může změnit e-mail a heslo. Sdílí komponentu `AccountCredentialsForm` i serverové akce z `dashboard/account/actions.ts` (akce pracují nad přihlášeným uživatelem bez ohledu na roli, takže fungují i pro admina). Přístup chrání Access_Guard middleware (`/admin/*`).
- `DashboardChrome`: pro `variant="admin"` míří ikony „Nastavení" i „Účet" v topbaru na `/admin/account` (dříve na `/admin`); doplněn titulek topbaru pro `/admin/account` = „Nastavení účtu".
- `DashboardSidebar`: nový prop `showHelp` (default true); odkaz „Nápověda" se v admin aside skryl (`showHelp={variant === 'owner'}`), owner ho má dál.

### Verifikace
- `pnpm lint` čistý; `pnpm build` OK (nová route `/admin/account`).

## 2025-XX-XX — admin-system-tools

### Hotové tasky
- 2.2 Property test — config report bez hodnot a věrná přítomnost (Property 4) — ověřeno (test:run + eslint)

### Nové funkce
- Property test (`src/lib/system/__tests__/config-report.pbt.test.ts`) — ověřuje, že `buildConfigReport` nikdy neemituje hodnoty env proměnných, `isSet` koresponduje s truthy přítomností a `logLevel` se odvozuje z `LOG_LEVEL` (default `info`).


## 2026-… — admin-system-tools (DB migrace aplikovány)

### Nové funkce
- Aplikovány migrace `0052_create_cron_runs.sql` a `0053_create_system_settings.sql` proti sdílené Supabase DB přes `pnpm dlx supabase db push` (potvrzeno uživatelem). `migration list` potvrzuje sync (local i remote 0052/0053). Tím se zprovoznily runtime části `/admin/system`: cron monitor + záznam běhů (`cron_runs`), cooldown testovacího e-mailu a prune (`system_settings`).
