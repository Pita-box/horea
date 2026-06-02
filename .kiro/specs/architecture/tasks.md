# Implementation Plan: Architektura platformy (foundation)

## Overview

Tento dokument popisuje **foundation tasks** — práci, která musí být hotová **dříve, než se začne implementovat jakákoli feature spec** (`auth-onboarding`, `public-business-page`, `reservation-management`, `subscription-payments`, `admin-dashboard`, `services-and-availability`).

Foundation pokrývá:

- Inicializaci Next.js + TypeScript repozitáře.
- Provisioning externích služeb (Supabase, Vercel, Cloudflare, Resend, GoPay, Google).
- Základní DB schéma + RLS policies (DDL only, žádná business logika).
- Auth wiring (Supabase klient, middleware).
- Logging baseline, CI, dokumentaci.

**Co tasks NEPOKRÝVAJÍ:** UI komponenty, formuláře, business logiku rezervací, integrační kód platební brány, e-mailové šablony, dashboard, public stránky podniků. Tyto patří do feature specs.

**Implementační jazyk:** TypeScript (Next.js App Router) — odvozeno z `design.md`, sekce *Tech Stack* a *ADR-1*.

**Vlastní pravidla** (z `CLAUDE.md`):

- Simplicity first. Žádná spekulativní vrstva, žádná konfigurace navíc.
- Surgical scope. Foundation = jen to, co každá feature spec předpokládá.
- Každý task je proveditelný v ~30–60 minutách s AI asistencí.

## Tasks

- [x] 1. Inicializace Next.js + TypeScript projektu
  - [x] 1.1 Vytvořit Next.js projekt s App Routerem a TypeScriptem
    - Spustit `pnpm create next-app .` s volbami: TypeScript, App Router, ESLint, src/ directory, Tailwind dle preference (default zapnutý), import alias `@/*`
    - Ověřit `pnpm dev` běží na `http://localhost:3000`
    - _Requirements: 5.4, 6.1, 18.4_

  - [x] 1.2 Vytvořit `.gitignore` a inicializovat git repozitář
    - Ověřit, že `.gitignore` z `create-next-app` obsahuje `.env*.local`, `node_modules`, `.next`, `out`, `coverage`
    - `.gitignore` **NESMÍ** ignorovat `pnpm-lock.yaml` (lockfile se commituje); pokud `create-next-app` vygeneroval `package-lock.json`, odstranit ho
    - `git init`, první commit `chore: initial Next.js scaffold`
    - _Requirements: 10.7_

  - [x] 1.3 Nastavit Node.js verzi přes `.nvmrc` a `engines` v `package.json`
    - Vytvořit `.nvmrc` s LTS verzí (např. `20`)
    - Přidat `"engines": { "node": ">=20.0.0" }` do `package.json`
    - Přidat pole `"packageManager": "pnpm@9.x"` do `package.json` (pin verze pnpm)
    - Commituj `pnpm-lock.yaml`, NIKDY `package-lock.json`
    - _Requirements: 3.4, 5.4_

- [x] 2. Vývojový tooling — linting, formatting, testing
  - [x] 2.1 Konfigurace ESLint (rozšíření výchozí Next.js konfigurace)
    - Ověřit, že `eslint.config.mjs` (nebo `.eslintrc.json`) je vygenerovaný z `create-next-app`
    - Přidat pravidlo zakazující `console.log` (povolit `console.warn`, `console.error`)
    - Přidat `pnpm lint` script (pokud chybí)
    - _Requirements: 3.5, 20.1_

  - [x] 2.2 Přidat Prettier a integrovat s ESLint
    - Nainstalovat `prettier`, `eslint-config-prettier`
    - Vytvořit `.prettierrc` (single quote, semicolons, trailing comma `all`, print width 100)
    - Přidat `.prettierignore` (`node_modules`, `.next`, `coverage`, `*.md` dle volby)
    - Přidat `pnpm format` script (`prettier --write .`) a `pnpm format:check`
    - _Requirements: 3.5_

  - [x] 2.3 Nastavit Vitest pro unit testy
    - Nainstalovat `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `jsdom`
    - Vytvořit `vitest.config.ts` s `environment: 'jsdom'` a path alias `@/*`
    - Přidat scripty `test`, `test:run`, `test:coverage`
    - Vytvořit smoke test `src/__tests__/smoke.test.ts` s `expect(1 + 1).toBe(2)` pro ověření setupu
    - _Requirements: 3.5_

  - [x] 2.4 Nastavit fast-check pro property-based testing infrastrukturu
    - Nainstalovat `fast-check` a `@fast-check/vitest`
    - Vytvořit `src/__tests__/pbt-smoke.test.ts` s minimálním property testem (např. `fc.assert(fc.property(fc.integer(), n => n + 0 === n))`) pro ověření, že fast-check funguje
    - **Žádné konkrétní property testy** — ty patří do feature specs (viz `design.md` *Testing Strategy*)
    - _Requirements: 3.5_

  - [x] 2.5 Nastavit Playwright pro E2E testy
    - Spustit `pnpm exec playwright install` a `pnpm create playwright`
    - Konfigurovat `playwright.config.ts` s `baseURL: http://localhost:3000`, projekt pro Chromium (MVP), trace `on-first-retry`
    - Vytvořit `e2e/smoke.spec.ts` ověřující, že root URL vrací HTTP 200
    - Přidat `pnpm test:e2e` script (`playwright test`)
    - _Requirements: 3.5_

- [x] 3. Provisioning Supabase projektu
  - [x] 3.1 Vytvořit Supabase projekt v EU regionu
    - Manuálně v Supabase dashboardu: nový projekt v regionu `eu-central-1` nebo `eu-west-1`
    - Uložit `Project URL`, `anon public key`, `service_role key`, `Database password`, `JWT secret`
    - **Citlivé klíče** patří pouze do `.env.local` a Vercel env, nikdy do gitu
    - _Requirements: 9.7, 10.7_

  - [x] 3.2 Nainstalovat Supabase JS SDK a CLI
    - Nainstalovat `@supabase/supabase-js`, `@supabase/ssr`
    - Nainstalovat `supabase` CLI jako devDependency
    - Spustit `pnpm dlx supabase init` (vytvoří `supabase/` adresář pro migrace)
    - Spustit `pnpm dlx supabase link --project-ref <ref>` pro propojení s remote projektem
    - _Requirements: 5.6, 6.4_

  - [x] 3.3 Konfigurace Supabase Auth — e-mail/heslo
    - V Supabase dashboardu: Authentication → Providers → povolit Email (zakázat magic link, OAuth pro MVP)
    - Nastavit Site URL na `https://www.horea.cz` (a `http://localhost:3000` jako Additional Redirect URL pro dev)
    - Nastavit Confirm email = ON (vyžadovat e-mail verifikaci)
    - Vlastní e-mailové šablony zatím **NEpřepisovat** — patří do `auth-onboarding` specu
    - _Requirements: 10.5, 10.8_

- [ ] 4. Provisioning Vercel projektu
  - [~] 4.1 Vytvořit Vercel projekt a propojit s git repozitářem
    - Push lokální repo na GitHub (privátní repo)
    - V Vercel dashboardu: import projektu z GitHubu, výběr Next.js framework presetu
    - Install Command nastavit na `pnpm install` (Vercel pnpm detekuje automaticky podle `pnpm-lock.yaml`), build běží přes `pnpm build`
    - Ověřit, že první deploy proběhne úspěšně (preview URL)
    - _Requirements: 3.4_

  - [~] 4.2 Nastavit produkční environment variables ve Vercelu
    - Přidat env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GOPAY_GOID`, `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `LOG_LEVEL`
    - Hodnoty pro produkci, preview i development scope dle vhodnosti (development scope smí používat sandbox/test účty)
    - **Service role key** smí mít pouze server-side scope, nikdy `NEXT_PUBLIC_*` prefix
    - _Requirements: 5.5, 10.7_

  - [~] 4.3 Konfigurace custom domény Horea.cz na Vercelu
    - Ve Vercel projektu: Settings → Domains → přidat `Horea.cz` a `www.horea.cz`
    - Vercel zobrazí DNS instrukce (A/CNAME) — zatím NEnastavovat na DNS, počkat na úkol 5.x (DNS přejde přes Cloudflare)
    - _Requirements: 11.2, 9.5_

- [ ] 5. Provisioning Cloudflare — DNS, WAF, edge rate limit
  - [~] 5.1 Přidat doménu Horea.cz do Cloudflare a změnit nameservery u registrátora
    - V Cloudflare dashboardu: Add site, vybrat Free plan
    - U registrátora domény změnit nameservery na hodnoty z Cloudflare
    - Počkat na propagaci a aktivaci v Cloudflare (zelený stav)
    - _Requirements: 10.1, 9.5_

  - [~] 5.2 Nastavit DNS záznamy směřující na Vercel
    - Přidat A / CNAME záznamy dle instrukcí z Vercelu (úkol 4.3)
    - Nastavit Proxy status na **proxied** (oranžový mrak), aby provoz šel přes Cloudflare
    - Ověřit, že `https://www.horea.cz` vrací response z Vercelu
    - _Requirements: 10.1, 9.5_

  - [~] 5.3 Aktivovat základní Cloudflare WAF
    - V Cloudflare dashboardu: Security → WAF → zapnout Cloudflare Managed Ruleset (OWASP základní)
    - Nastavit Security Level: Medium
    - Nastavit Bot Fight Mode: ON (free tier)
    - _Requirements: 10.2_

  - [~] 5.4 Nastavit edge rate limit pro `/api/reservations` a `/api/auth/*`
    - V Cloudflare dashboardu: Security → Rate Limiting → vytvořit pravidla:
      - `/api/reservations` — max 10 requestů / IP / minutu (anti-spam rezervací)
      - `/api/auth/*` — max 20 requestů / IP / minutu (anti-brute-force)
    - Akce: Block (HTTP 429)
    - _Requirements: 10.3, 10.8_

  - [~] 5.5 Vynutit HTTPS a HSTS na úrovni Cloudflare
    - SSL/TLS: nastavit režim Full (Strict)
    - Edge Certificates: zapnout Always Use HTTPS, Automatic HTTPS Rewrites, HSTS (max-age 6 měsíců, includeSubDomains)
    - _Requirements: 10.1, 9.5_

- [x] 6. Základní layout, locale, error pages
  - [x] 6.1 Konfigurace root layoutu pro českou lokalizaci
    - V `src/app/layout.tsx`: nastavit `<html lang="cs">`
    - Nastavit `metadata.title` a `metadata.description` v češtině (placeholder hodnoty pro MVP)
    - _Requirements: 18.1, 18.4_

  - [x] 6.2 Konfigurace timezone helperu pro Europe/Prague
    - Vytvořit `src/lib/datetime.ts` se dvěma utility funkcemi: `toPragueDisplay(utcDate)` a `fromPragueInput(localDate)`
    - V DB ukládáme UTC, v UI zobrazujeme Europe/Prague — viz `design.md` *Reservation Logic*
    - Použít nativní `Intl.DateTimeFormat` s `timeZone: 'Europe/Prague'`, žádná dependency navíc
    - _Requirements: 18.3_

  - [x] 6.3 Scaffoldovat design tokens jako globální stylový baseline
    - V `src/app/globals.css` nastavit design tokens z `.kiro/steering/design-system.md`, sekce *Quick Start* (`.kiro/steering/design-system.md` je **source of truth** — tokeny kopírovat 1:1, neimprovizovat hodnoty)
    - **Pokud `create-next-app` v úkolu 1.1 nastavil Tailwind v4** → použít blok `@theme { ... }` z *Quick Start › Tailwind v4*. **Pokud Tailwind není** → použít blok `:root { ... }` z *Quick Start › CSS Custom Properties*
    - Barevné tokeny (`--color-*`): Canvas White, Cloud Mist, Slate Text, Rich Violet, Action Violet, Air Blue, Lush Green, Sunset Pink, Neon Pink, Aqua Blue, Electric Green, Soft Gray Fill
    - Typografické tokeny: font families (`--font-polysans` → fallback Montserrat, `--font-plus-jakarta-sans` → fallback Inter), type scale (`--text-caption` … `--text-heading-sm` + odpovídající `--leading-*`), váhy (`--font-weight-regular/medium/semibold/bold`), výchozí letter-spacing `-0.02em` na `body`
    - Spacing scale (4px base, `--spacing-4` … `--spacing-100`), border radii (cards 26px `--radius-cards`, buttons 12px `--radius-buttons`, badges 200px `--radius-badges`), surfaces (`--surface-*`)
    - Tímto vzniká vizuální **design baseline**, na kterém staví všechny feature UI; konkrétní feature komponenty zůstávají ve feature specs
    - _Requirements: 18.1_

  - [x] 6.4 Implementovat root error boundary
    - Vytvořit `src/app/error.tsx` (client component) s českou hláškou „Něco se pokazilo. Zkuste to prosím znovu."
    - Zobrazit request ID (z hlavičky `x-request-id`, vytvořeno v úkolu 11.x), pokud je dostupné
    - **Žádný stack trace** uživateli — viz `design.md` *Error Handling*
    - _Requirements: 14.4, 20.2_

  - [x] 6.5 Implementovat 404 stránku
    - Vytvořit `src/app/not-found.tsx` s českou hláškou „Stránka nenalezena" a odkazem na hlavní stránku
    - _Requirements: 18.1_

  - [x] 6.6 Nastavit web fonty přes `next/font`
    - V `src/app/layout.tsx` načíst fonty přes `next/font/google`: Plus Jakarta Sans (body/UI) a Montserrat jako **substituci za PolySans** (PolySans je proprietární, viz `.kiro/steering/design-system.md` — používáme dokumentovaný substitut Montserrat); Inter ponechán jako fallback v `--font-plus-jakarta-sans` stacku
    - Zahrnout subset `latin-ext` kvůli českým diakritickým znakům (ě, š, č, ř, ž, ů…)
    - Načítané váhy dle design-system.md: Plus Jakarta Sans 400/500/600/700, Montserrat 600/700
    - Přemapovat CSS proměnné fontů na tokeny: nastavit `variable: '--font-plus-jakarta-sans'` a `variable: '--font-polysans'` tak, aby odpovídaly tokenům z úkolu 6.3, a aplikovat třídy fontů na `<body>`
    - _Requirements: 18.1_

  - [x] 6.7 Vytvořit minimální sadu sdílených UI primitiv
    - Vytvořit `src/components/ui/` se **třemi** primitivy, které využije každá feature, postavenými výhradně na tokenech z úkolu 6.3 (per `.kiro/steering/design-system.md`):
      - `Button` (varianty `primary` / `ghost` / `outline` — Action Violet filled, transparent + Cloud Mist border, transparent + Slate Text border; radius 12px `--radius-buttons`)
      - `Card` (Canvas White, radius 26px `--radius-cards`, bez stínu)
      - `Badge` (transparent, Neon Pink text, radius 200px `--radius-badges`)
      - **Pouze tyto tři primitivy** s dokumentovanými variantami/radii/barvami — feature-specifické komponenty (formuláře, kalendář, dashboard widgety) zůstávají ve feature specs (Simplicity First)
    - _Requirements: 18.1_

- [x] 7. Supabase schema baseline — DDL pro všechny entity
  - [x] 7.1 Vytvořit migraci `0001_init_users.sql`
    - Tabulka `users` (id UUID, email UNIQUE, password_hash, is_admin BOOL DEFAULT FALSE, dpa_version_accepted, dpa_accepted_at, created_at, updated_at)
    - Pozn.: pokud používáme Supabase Auth, `users` je rozšíření `auth.users` přes 1:1 FK na `auth.users.id` (nebo separátní `public.user_profiles` — zvolit jednu cestu a zdokumentovat v `README.md`)
    - **Pouze DDL, žádné triggery ani business logika**
    - _Requirements: 9.1, 9.2, 17.1_

  - [x] 7.2 Vytvořit migraci `0002_init_businesses.sql`
    - Tabulka `businesses` (id, owner_user_id FK→users, slug UNIQUE, name, type ENUM, description, logo_url, is_published BOOL DEFAULT FALSE, auto_approve_reservations BOOL DEFAULT FALSE, allow_parallel_slots BOOL DEFAULT FALSE, last_backup_at, created_at, updated_at)
    - ENUM `business_type`: `kadernik`, `nehtove_studio`, `bistro`, `masazni_salon`, `spa`, `beauty`, `ostatni`
    - Index na `slug`
    - _Requirements: 11.1, 11.4, 15.2, 16.2, 21.1_

  - [x] 7.3 Vytvořit migraci `0003_init_services_and_hours.sql`
    - Tabulka `services` (id, business_id FK→businesses, name, duration_minutes INT, price_czk DECIMAL, description, created_at, updated_at)
    - Tabulka `opening_hours` (id, business_id FK→businesses, day_of_week INT 0-6, opens_at TIME, closes_at TIME)
    - Index na `business_id` v obou tabulkách
    - _Requirements: 1.1_

  - [x] 7.4 Vytvořit migraci `0004_init_reservations_clients.sql`
    - Tabulka `reservations` (id, business_id FK→businesses, service_id FK→services, client_name, client_phone, client_email, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, status ENUM, note, created_at, updated_at)
    - ENUM `reservation_status`: `pending`, `approved`, `rejected`, `cancelled`
    - Tabulka `clients` (id, business_id FK→businesses, name, phone, email, created_at, updated_at)
    - Index na `(business_id, starts_at)` v `reservations`
    - _Requirements: 1.1, 19.3, 19.4_

  - [x] 7.5 Vytvořit migraci `0005_init_subscriptions_payments_coupons.sql`
    - Tabulka `subscriptions` (id, business_id FK→businesses UNIQUE, plan ENUM, status ENUM, current_period_start, current_period_end, gopay_schedule_id, created_at, updated_at)
    - ENUM `subscription_plan`: `start`, `pokrocily`, `max`
    - ENUM `subscription_status`: `free`, `active`, `grace_period`, `expired`, `deleted_data`
    - Tabulka `payments` (id, business_id FK, subscription_id FK, amount_czk DECIMAL, currency CHAR(3) DEFAULT 'CZK', variable_symbol UNIQUE, gopay_payment_id, status ENUM, method ENUM, invoice_url, created_at)
    - Tabulka `coupons` (id, code UNIQUE, type ENUM, discount_value, valid_until, max_uses, used_count, created_at)
    - _Requirements: 7.1, 12.6_

  - [x] 7.6 Spustit migrace na Supabase remote a ověřit schéma
    - `pnpm dlx supabase db push` (nebo `supabase migration up`)
    - V Supabase dashboardu (Table Editor) ověřit, že všechny tabulky existují
    - _Requirements: 1.3_

- [ ] 8. RLS policies baseline
  - [~] 8.1 Vytvořit migraci `0006_enable_rls.sql`
    - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` na všech tenant-scoped tabulkách: `businesses`, `services`, `opening_hours`, `reservations`, `clients`, `subscriptions`, `payments`
    - Tabulky `users` a `coupons` — RLS také ENABLE, policies dle úkolů níže
    - _Requirements: 1.3_

  - [~] 8.2 Vytvořit migraci `0007_rls_tenant_policies.sql`
    - Helper funkce `auth.user_business_id()` vracející `business_id` z aktuální session JWT (přes `auth.uid()` → `businesses.owner_user_id`)
    - Helper funkce `auth.is_admin()` vracející BOOL z `users.is_admin` aktuální session
    - Pro každou tenant-scoped tabulku: policy `tenant_isolation` SELECT/INSERT/UPDATE/DELETE povolující operace, kde `business_id = auth.user_business_id() OR auth.is_admin()`
    - _Requirements: 1.1, 1.6, 17.2_

  - [~] 8.3 Vytvořit migraci `0008_rls_public_read.sql`
    - Policy `public_read_published` na `businesses` — SELECT povoleno pro `anon` role, kde `is_published = true`
    - Policy `public_read_published_services` na `services` — SELECT povoleno pro `anon`, kde EXISTS (SELECT 1 FROM businesses WHERE id = services.business_id AND is_published = true)
    - Stejně pro `opening_hours`
    - **Žádné policy pro INSERT rezervace anonymem zde** — rezervace se vkládají server-side přes service role v API endpointu (`design.md` *Multi-tenancy přes RLS*)
    - _Requirements: 1.2, 11.6_

  - [~] 8.4 Vytvořit migraci `0009_rls_admin_override.sql`
    - Policy `admin_full_access` na `users`, `coupons` — všechny operace povolené, pokud `auth.is_admin() = true`
    - _Requirements: 17.2, 17.4_

  - [~] 8.5 Spustit RLS migrace a manuálně ověřit izolaci
    - `pnpm dlx supabase db push`
    - Ze Supabase SQL editoru manuálně otestovat: jako anonymní role SELECT z `businesses` vrací jen `is_published=true`
    - _Requirements: 1.1, 1.2_

- [ ] 9. Auth wiring — Supabase klienti a middleware
  - [~] 9.1 Vytvořit Supabase klienty pro server, browser a middleware
    - `src/lib/supabase/server.ts` — `createServerClient` z `@supabase/ssr` pro Server Components / Route Handlers (čte cookies přes `next/headers`)
    - `src/lib/supabase/client.ts` — `createBrowserClient` pro Client Components
    - `src/lib/supabase/middleware.ts` — helper pro Edge middleware (refresh session)
    - **Service role klient** — `src/lib/supabase/admin.ts` — používán pouze v cron jobech / admin operacích, NIKDY v klientském kódu
    - _Requirements: 1.4, 5.6, 6.4, 10.7_

  - [~] 9.2 Implementovat Next.js middleware pro chráněné cesty
    - Vytvořit `src/middleware.ts` matchující `/dashboard/:path*` a `/admin/:path*`
    - V matched cestě: refresh session přes `supabase.auth.getUser()`
    - Pokud neautentizovaný: redirect na `/login` (samotná `/login` stránka patří do `auth-onboarding`)
    - Pokud cesta začíná `/admin` a uživatel není admin (`users.is_admin = false`): redirect na `/dashboard` s flash message
    - _Requirements: 1.4, 17.3_

- [ ] 10. Resend setup
  - [~] 10.1 Založit Resend účet a verifikovat doménu
    - Manuálně: založit Resend účet, přidat doménu `Horea.cz`
    - V Cloudflare DNS přidat SPF, DKIM, DMARC záznamy dle Resend instrukcí
    - Počkat na verifikaci a uložit `RESEND_API_KEY` do Vercel env (úkol 4.2 už refer na klíč; zde se hodnota doplní)
    - _Requirements: 13.1, 13.7_

  - [~] 10.2 Vytvořit Resend SDK wrapper a base e-mailovou šablonu
    - Nainstalovat `resend`, `react-email` (volitelně pro JSX šablony — pro MVP stačí prostý HTML/text)
    - `src/lib/email/client.ts` — singleton `Resend` instance s API klíčem z env
    - `src/lib/email/templates/base.ts` — funkce `wrapEmail({subject, body})` vracející HTML s českou paticí (název platformy, kontakt na podporu, GDPR link placeholder)
    - **Žádné konkrétní e-mailové šablony** — patří do feature specs (rezervace, fakturace…)
    - _Requirements: 13.1, 14.2_

- [ ] 11. Logging baseline + request ID middleware
  - [x] 11.1 Implementovat strukturovaný logger utility
    - Vytvořit `src/lib/log.ts` — funkce `log.info(msg, ctx)`, `log.warn(msg, ctx)`, `log.error(msg, ctx)`
    - Výstup JSON na `stdout` (Vercel automaticky scrapuje), formát: `{ timestamp, level, msg, requestId?, userId?, ...ctx }`
    - Filtr citlivých klíčů (`password`, `token`, `authorization`, `cookie`) — nahradit hodnotu `[REDACTED]`
    - Žádná externí dependency (žádný pino/winston) — viz `CLAUDE.md` *Simplicity First*
    - _Requirements: 20.1, 20.2_

  - [~] 11.2 Rozšířit middleware o generování request ID
    - V `src/middleware.ts` (z úkolu 9.2): vygenerovat `crypto.randomUUID()` na každý request, propsat do request hlavičky `x-request-id` a do response hlavičky stejně
    - Logger v server contextu čte `x-request-id` z `next/headers` a přibalí do každého logu
    - _Requirements: 20.2_

- [ ] 12. GoPay setup (sandbox credentials, žádný integration kód)
  - [~] 12.1 Založit GoPay sandbox účet a získat credentials
    - Manuálně: registrace GoPay sandbox merchant účtu
    - Uložit `GOPAY_GOID`, `GOPAY_CLIENT_ID`, `GOPAY_CLIENT_SECRET` do Vercel env (development scope) a `.env.local`
    - Produkční merchant approval pro recurring (viz `design.md` *Open Questions* bod 2) — provozní úkol mimo kód
    - **Žádný integrace kód zde** — patří do `subscription-payments` specu
    - _Requirements: 12.1_

- [ ] 13. Google Cloud setup (service account, žádný integration kód)
  - [~] 13.1 Vytvořit Google Cloud projekt a service account
    - Manuálně: GCP console → nový projekt `Horea`
    - Povolit API: Google Drive API, Google Sheets API
    - Vytvořit service account `Horea-backup@...`, vygenerovat JSON klíč
    - Uložit obsah JSON jako jeden řádek (escapovaný) do env var `GOOGLE_SERVICE_ACCOUNT_JSON` ve Vercelu a `.env.local`
    - **Žádný integrace kód zde** — patří do `subscription-payments` / dedikovaného backup specu
    - _Requirements: 8.1, 8.4_

- [~] 14. Checkpoint — ověřit foundation lokálně i v preview
  - Ověřit `pnpm lint`, `pnpm format:check`, `pnpm test:run`, `pnpm test:e2e` projdou
  - Ověřit, že Vercel preview deploy se zelenou (úspěšný build)
  - Ověřit, že `https://www.horea.cz` vrací výchozí Next.js stránku přes Cloudflare → Vercel
  - Ověřit, že Supabase migrace jsou aplikované a anonymní SELECT z `businesses` respektuje RLS
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. CI baseline — GitHub Actions
  - [~] 15.1 Vytvořit workflow `.github/workflows/ci.yml`
    - Trigger: `pull_request` a `push` do `main`
    - Joby: `setup` (checkout, `pnpm/action-setup` + `actions/setup-node` Node 20 s `cache: 'pnpm'`, instalace přes `pnpm install --frozen-lockfile`), `typecheck` (`tsc --noEmit`), `lint` (`pnpm lint`), `test` (`pnpm test:run`)
    - **Žádné E2E v CI** v MVP (pomalé, vyžaduje další setup) — manuální spouštění
    - _Requirements: 3.4_

  - [ ]* 15.2 Přidat coverage upload jako artefakt (nepovinné)
    - V `test` jobu spustit `pnpm test:coverage`, uložit `coverage/` jako artifact
    - _Requirements: 3.4_

- [ ] 16. Dokumentace — README a .env.example
  - [~] 16.1 Vytvořit `.env.example` s placeholder hodnotami všech env vars
    - Vyjmenovat všechny env vars z úkolu 4.2, popsat účel jedním řádkem
    - **Žádné reálné hodnoty** — `.env.example` jde do gitu, `.env.local` ne
    - _Requirements: 5.5, 10.7_

  - [~] 16.2 Vytvořit `README.md` s instrukcemi pro setup
    - Sekce: Prerekvizity (Node 20, pnpm — např. přes `corepack enable`, Supabase CLI, GitHub, Vercel CLI volitelně), Setup (clone, `pnpm install`, `cp .env.example .env.local` + doplnit hodnoty), Local dev (`pnpm dev`), Database migrace (`pnpm dlx supabase db push`), Testy (`pnpm test:run`, `pnpm test:e2e`), CI a deploy (push do main → Vercel automatic), Foundation vs feature specs (odkaz na `.kiro/specs/`)
    - _Requirements: 3.4_

- [~] 17. Závěrečný checkpoint
  - Projít všechny předchozí úkoly checklistem: tooling OK, externí služby provisioned, schéma + RLS aplikované, auth wiring + middleware funkční, logging baseline OK, CI zelená
  - Ověřit, že feature specs (`auth-onboarding`, `public-business-page`, atd.) mají vše potřebné k zahájení implementace
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks označené `*` jsou nepovinné a mohou být přeskočeny pro rychlejší MVP foundation.
- Každý task referencuje konkrétní požadavky (R1–R21) z `requirements.md` pro traceability.
- **Žádné feature-level tasks** zde nejsou — implementace registračního formuláře, dashboardu, public stránky, GoPay/Google integrace patří do navazujících feature specs (`auth-onboarding`, `subscription-payments`, atd.).
- **Design system je součástí foundation.** Úkoly 6.3 (design tokens), 6.6 (web fonty) a 6.7 (minimální sdílená UI primitiva — Button, Card, Badge) scaffoldují vizuální baseline dle `.kiro/steering/design-system.md` (sekce *Quick Start*), aby všechny feature UI od začátku stavěly na stejných tokenech. Feature-specifické komponenty (formuláře, kalendář, dashboard widgety) zůstávají ve feature specs.
- **Property-based tests:** zde pouze infrastruktura (úkol 2.4). Konkrétní property testy (slot konflikt, variabilní symbol, stavový automat) patří do feature specs, kde jsou definované korespondující correctness properties.
- Manuální úkoly (provisioning Supabase/Vercel/Cloudflare/GoPay/Google) jsou součástí foundation, protože každá feature spec předpokládá, že tyto služby jsou dostupné. Bez nich nelze implementovat ani testovat.
- Pořadí úkolů respektuje závislosti: repo init → tooling → external services → kód využívající tyto služby (auth, logging) → CI → docs.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.5", "3.1", "12.1", "13.1"] },
    { "id": 3, "tasks": ["2.4", "3.2", "3.3", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "7.1"] },
    { "id": 5, "tasks": ["5.1", "7.2"] },
    { "id": 6, "tasks": ["5.2", "7.3"] },
    { "id": 7, "tasks": ["5.3", "5.4", "5.5", "7.4"] },
    { "id": 8, "tasks": ["7.5"] },
    { "id": 9, "tasks": ["7.6"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 12, "tasks": ["8.5", "10.1"] },
    { "id": 13, "tasks": ["6.1", "6.2", "6.3", "6.5", "9.1", "10.2", "11.1"] },
    { "id": 14, "tasks": ["6.4", "6.6", "9.2"] },
    { "id": 15, "tasks": ["6.7", "11.2"] },
    { "id": 16, "tasks": ["15.1", "15.2", "16.1", "16.2"] }
  ]
}
```
