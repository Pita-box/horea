# Implementation Plan: Auth & Onboarding

## Overview

Implementační plán pro feature `auth-onboarding` — autentizační vrstva (registrace, ověření emailu, přihlášení, reset hesla, odhlášení, DPA verzování) a šestikrokový onboarding wizard zakončený atomickým commitem profilu podniku ve stavu `free`.

**Implementační jazyk:** TypeScript (Next.js App Router) — odvozeno z `architecture/tasks.md`.

**Foundation prerekvizity** (musí být hotové z `architecture/tasks.md` před zahájením této spec):

- Next.js scaffold + tooling (úkoly 1, 2): TypeScript, ESLint, Prettier, Vitest + `@fast-check/vitest`, Playwright.
- Supabase projekt + CLI + Auth (e-mail/heslo) + e-mail confirm ON (úkol 3).
- `users` tabulka se sloupci `dpa_version_accepted`, `dpa_accepted_at` (úkol 7.1).
- `businesses`, `services`, `opening_hours`, `subscriptions` DDL + RLS + helpery `auth.user_business_id()`, `auth.is_admin()` (úkoly 7.2, 7.3, 7.5, 8.1, 8.2).
- Supabase klienti (`src/lib/supabase/server.ts`, `client.ts`, `middleware.ts`) + middleware skeleton v `src/middleware.ts` (úkoly 9.1, 9.2).
- Resend SDK wrapper a base e-mailová šablona `src/lib/email/templates/base.ts → wrapEmail()` (úkol 10.2).
- Logger `src/lib/log.ts` + `x-request-id` middleware (úkol 11).
- Český root layout (`<html lang="cs">`), error/404 stránky (úkoly 6.1, 6.4, 6.5).

**Princip** dle `CLAUDE.md`: simplicity first, surgical scope, žádné spekulativní vrstvy.

## Tasks

- [ ] 1. Databázové schéma pro onboarding draft
  - [ ] 1.1 Vytvořit migraci `0010_init_onboarding_drafts.sql`
    - Tabulka `onboarding_drafts`: `user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `current_step SMALLINT NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 5)`, `type_data JSONB`, `slug_data JSONB`, `profile_data JSONB`, `services_data JSONB`, `hours_data JSONB`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
    - Trigger pro automatickou aktualizaci `updated_at` při UPDATE
    - Pouze DDL, žádná business logika
    - _Requirements: 14.1_

  - [ ] 1.2 Vytvořit migraci `0011_rls_onboarding_drafts.sql`
    - `ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY`
    - Policy `own_draft_only`: SELECT/INSERT/UPDATE/DELETE povoleno pouze pokud `user_id = auth.uid()`
    - Žádný admin override v této tabulce (interní rozpracovaný stav)
    - _Requirements: 14.1_

  - [ ] 1.3 Spustit migrace a manuálně ověřit RLS izolaci
    - `pnpm dlx supabase db push`
    - V Supabase SQL editoru: jako uživatel A vložit draft, jako uživatel B ověřit, že SELECT vrací 0 řádků
    - _Requirements: 14.1_

- [ ] 2. Slug normalization library + RESERVED_SLUGS konstanta
  - [ ] 2.1 Vytvořit `src/lib/slug/reserved.ts` s konstantou `RESERVED_SLUGS`
    - Export `const RESERVED_SLUGS: readonly string[]` obsahující: `admin`, `api`, `login`, `register`, `logout`, `dashboard`, `app`, `www`, `mail`, `verify-email`, `forgot-password`, `reset-password`, `onboarding`, `settings`, `billing`, `support`, `help`
    - Hodnoty jsou již v normalizovaném tvaru (lowercase, ASCII, bez whitespace)
    - _Requirements: 8.5_

  - [ ] 2.2 Implementovat `src/lib/slug/normalize.ts` — čistá normalizace + validace
    - Export typu `SlugResult = { kind: 'ok'; value: string } | { kind: 'invalid_format'; reason: 'charset' | 'length' | 'hyphens' | 'empty' } | { kind: 'reserved' }`
    - Funkce `normalizeSlug(input: string): SlugResult`:
      1. Trim whitespace
      2. Lowercase
      3. NFD normalize + odstranění combining marks (`\p{Mn}`)
      4. Regex `^[a-z0-9-]{3,50}$` check
      5. Hraniční pravidla: žádný leading/trailing hyphen, žádné zdvojené hyphens
      6. Reserved list check (přesná rovnost po normalizaci)
    - Funkce **nikdy nesmí vyhodit výjimku** (totalita)
    - _Requirements: 8.3, 8.4, 8.5_

  - [ ]* 2.3 Property test: totalita slug normalizace
    - **Property 1: Totalita**
    - **Validates: Requirements 8.3, 8.4**
    - V `src/lib/slug/__tests__/normalize.property.test.ts` použít `@fast-check/vitest`: `fc.string()` + `fc.unicodeString()` libovolné délky → `normalizeSlug(x)` vrací validní `SlugResult` (jeden ze čtyř variantů), nikdy neházel výjimku
    - _Requirements: 8.3, 8.4_

  - [ ]* 2.4 Property test: idempotence slug normalizace
    - **Property 2: Idempotence**
    - **Validates: Requirements 8.3**
    - Pro libovolný `x`, pokud `normalizeSlug(x).kind === 'ok'` s hodnotou `y`, pak `normalizeSlug(y).kind === 'ok'` a vrácená hodnota se rovná `y`
    - _Requirements: 8.3_

  - [ ]* 2.5 Property test: reserved slug detekce je case-insensitive
    - **Property 3: Reserved case-insensitive**
    - **Validates: Requirements 8.5**
    - Pro libovolný `s` z `RESERVED_SLUGS` a libovolnou permutaci velikosti písmen / přidání diakritiky (např. `Ádmīn`) → `normalizeSlug` vrací `{ kind: 'reserved' }` (ne `ok`, ne `invalid_format`)
    - _Requirements: 8.5_

  - [ ]* 2.6 Unit testy pro konkrétní edge cases
    - V `src/lib/slug/__tests__/normalize.test.ts`: prázdný string, jen whitespace, samé hyphens (`---`), samá diakritika (`ÁÉÍÓÚ`), 51 znaků, `--foo`, `foo--bar`, `-foo`, `foo-`, `Salón Růženka` → `salon-ruzenka` (pokud implementace mapuje mezeru na hyphen) nebo `invalid_format` (pokud ne — záleží na rozhodnutí v 2.2)
    - _Requirements: 8.3, 8.4_

- [ ] 3. DPA versioning konstanta + DPA_Manager utility
  - [ ] 3.1 Vytvořit `src/lib/dpa/version.ts` s konstantou `CURRENT_DPA_VERSION`
    - Export `const CURRENT_DPA_VERSION = '2025-01-15'` (datum vydání první verze)
    - Komentář v souboru: změna verze = úprava této konstanty + deploy → middleware automaticky vynutí re-akceptaci
    - _Requirements: 6.1, 6.4_

  - [ ] 3.2 Vytvořit `src/lib/dpa/text.ts` s aktuálním textem DPA v češtině
    - Export `const DPA_TEXT: string` — plný text smlouvy (placeholder pro MVP, finální právní text doplní právník)
    - Žádné Markdown rendering, prostý text / minimální HTML
    - _Requirements: 15.4_

  - [ ] 3.3 Implementovat `src/lib/dpa/manager.ts` — DPA_Manager utility
    - Funkce `recordAcceptance(userId: string)`: idempotentní upsert `users.dpa_version_accepted = CURRENT_DPA_VERSION`, `users.dpa_accepted_at = now()`. Pokud uživatel již má aktuální verzi, žádný zápis (no-op).
    - Funkce `needsReacceptance(userDpaVersion: string | null): boolean`: `true` pokud `userDpaVersion !== CURRENT_DPA_VERSION`
    - Závisí na Supabase server klientu z `src/lib/supabase/server.ts` (foundation 9.1)
    - _Requirements: 1.6, 6.1, 6.4_

  - [ ]* 3.4 Property test: idempotence DPA akceptace
    - **Property 5: Idempotence DPA akceptace**
    - **Validates: Requirements 6.4**
    - V `src/lib/dpa/__tests__/manager.property.test.ts`: pro libovolný timestamp `t0`, pokud uživatel má `dpa_version_accepted = CURRENT_DPA_VERSION` a `dpa_accepted_at = t0`, pak po volání `recordAcceptance(userId)` zůstává `dpa_version_accepted = CURRENT_DPA_VERSION` a `dpa_accepted_at = t0` (žádný posun)
    - DB volání mockovat (in-memory user store)
    - _Requirements: 6.4_

- [ ] 4. Auth_Service — registrace
  - [ ] 4.1 Implementovat server-side validaci hesla `src/lib/auth/password.ts`
    - Funkce `validatePassword(password: string): { ok: true } | { ok: false; reason: 'too_short' | 'no_uppercase' | 'no_digit' }`
    - Pravidla: min 8 znaků, alespoň 1 velké písmeno, alespoň 1 číslice
    - České hlášky pro každý důvod v `src/lib/auth/messages.ts`
    - _Requirements: 1.3, 5.6_

  - [ ] 4.2 Implementovat server-side validaci emailu `src/lib/auth/email.ts`
    - Funkce `validateEmail(email: string): boolean` — kontrola `@` a doménové části (jednoduchý regex, ne RFC 5322 implementace)
    - Česká hláška „Zadejte platný email"
    - _Requirements: 1.2_

  - [ ] 4.3 Vytvořit registrační stránku `src/app/register/page.tsx`
    - Server Component s formulářem: email, heslo, checkbox ToS, checkbox DPA s odkazem na text (z 3.2)
    - Client Component pro submit (server action z 4.4)
    - Veškerý text v češtině
    - _Requirements: 1.1, 1.5, 15.1_

  - [ ] 4.4 Implementovat server action `src/app/register/actions.ts → registerAction`
    - Vstup: email, heslo, tosAccepted, dpaAccepted
    - Validace pořadí: souhlasy (1.5), email formát (1.2), heslo strength (1.3)
    - Volání `supabase.auth.signUp({ email, password })` (foundation 9.1)
    - Při úspěchu volat `recordAcceptance(user.id)` z DPA_Manager (krok 3.3)
    - Při duplicitě emailu vrátit hlášku „Účet s tímto emailem již existuje" (1.4)
    - Při úspěchu redirect na `/verify-email`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [ ] 5. Auth_Service — verifikace emailu
  - [ ] 5.1 Vytvořit českou e-mailovou šablonu pro ověření emailu
    - V `src/lib/email/templates/verify-email.ts`: funkce `renderVerifyEmail({ verifyUrl })` vracející `{ subject, html, text }`
    - Použít `wrapEmail()` z foundation (10.2) pro patičku
    - Subject: `Ověřte svůj email — Horea`, body česky s tlačítkem/odkazem na `verifyUrl`
    - _Requirements: 1.7, 15.3_

  - [ ] 5.2 Nakonfigurovat Supabase Auth e-mailovou šablonu pro verifikaci
    - V Supabase dashboardu: Authentication → Email Templates → Confirm signup → vložit HTML z 5.1 (vyrenderované s `{{ .ConfirmationURL }}`)
    - Subject v češtině
    - Pozn.: Supabase Auth posílá e-mail interně, naše šablona slouží jako zdroj HTML/textu
    - _Requirements: 1.7, 15.3_

  - [ ] 5.3 Vytvořit stránku `src/app/verify-email/page.tsx`
    - Pokud URL obsahuje `?token_hash=...&type=email`: server-side volat `supabase.auth.verifyOtp({ token_hash, type: 'email' })`
    - Při úspěchu: SELECT z `onboarding_drafts` → redirect na `/onboarding/{current_step+1}` nebo `/onboarding/1`
    - Při neplatném/expirovaném tokenu: zobrazit českou hlášku + tlačítko „Zaslat znovu"
    - Pokud URL bez tokenu: info stránka „Ověřte si email" (instrukce pro uživatele)
    - _Requirements: 2.1, 2.2_

  - [ ] 5.4 Implementovat server action `src/app/verify-email/actions.ts → resendVerificationAction`
    - Vstup: email
    - Volání `supabase.auth.resend({ type: 'signup', email })`
    - Generická česká hláška o úspěchu (bez prozrazení existence účtu)
    - _Requirements: 2.3_

- [ ] 6. Auth_Service — přihlášení a Session_Manager
  - [ ] 6.1 Vytvořit přihlašovací stránku `src/app/login/page.tsx`
    - Formulář: email, heslo, checkbox „Zůstat přihlášen"
    - Odkaz na `/forgot-password` a `/register`
    - České texty
    - _Requirements: 3.1, 15.1_

  - [ ] 6.2 Implementovat server action `src/app/login/actions.ts → loginAction`
    - Vstup: email, heslo, rememberMe
    - Volání `supabase.auth.signInWithPassword({ email, password })`
    - Při neúspěchu: generická hláška „Nesprávný email nebo heslo" (3.2) — žádné rozlišení důvodu
    - Pokud uživatel není ověřený (Supabase vrátí `email_not_confirmed`): hláška „Ověřte si nejdřív email" + tlačítko pro resend (volá 5.4) — _Requirements: 2.4_
    - Při `rememberMe = true`: Supabase Auth defaultně používá long-lived session, žádné dodatečné nastavení (3.3)
    - Po úspěchu: SELECT `businesses WHERE owner_user_id = uid` → redirect na `/dashboard` (existuje business) nebo `/onboarding/{step}` (neexistuje)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 6.3 Implementovat `src/lib/auth/session.ts` — Session_Manager helpers
    - Funkce `logoutCurrent(supabase)`: volá `supabase.auth.signOut()` (zneplatní aktuální session + smaže cookie)
    - Funkce `logoutAllSessions(userId, adminClient)`: volá `supabase.auth.admin.signOut(userId, 'global')` přes service role klient (foundation `src/lib/supabase/admin.ts`)
    - _Requirements: 4.1, 5.5_

  - [ ] 6.4 Implementovat logout endpoint `src/app/logout/route.ts`
    - POST handler: `logoutCurrent` + redirect na `/` (landing page)
    - GET handler stejně (pro fallback bez JS)
    - _Requirements: 4.1, 4.2_

- [ ] 7. Auth_Service — reset hesla
  - [ ] 7.1 Vytvořit českou e-mailovou šablonu pro reset hesla
    - V `src/lib/email/templates/password-reset.ts`: funkce `renderPasswordResetEmail({ resetUrl })` vracející `{ subject, html, text }`
    - Použít `wrapEmail()` z foundation (10.2)
    - Subject: `Obnovení hesla — Horea`
    - _Requirements: 5.1, 15.3_

  - [ ] 7.2 Nakonfigurovat Supabase Auth e-mailovou šablonu pro reset
    - V Supabase dashboardu: Authentication → Email Templates → Reset password → vložit HTML z 7.1 s `{{ .ConfirmationURL }}`
    - _Requirements: 5.1, 15.3_

  - [ ] 7.3 Vytvořit stránku `src/app/forgot-password/page.tsx`
    - Formulář: email
    - České texty, odkaz zpět na `/login`
    - _Requirements: 5.1, 15.1_

  - [ ] 7.4 Implementovat server action `src/app/forgot-password/actions.ts → forgotPasswordAction`
    - Vstup: email
    - Volání `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })`
    - Vždy stejná generická česká hláška (5.2): „Pokud existuje účet s tímto emailem, byl odeslán odkaz pro obnovení hesla."
    - Pozn.: rate limit je na Cloudflare (foundation 5.4), žádný aplikační rate limit zde — _Requirements: 5.7_
    - _Requirements: 5.1, 5.2, 5.7_

  - [ ] 7.5 Vytvořit stránku `src/app/reset-password/page.tsx`
    - Při příchodu z e-mailu Supabase má v URL `code` parametr → `supabase.auth.exchangeCodeForSession(code)` v Server Componentu
    - Při úspěchu: zobrazit formulář s polem nové heslo (+ potvrzení)
    - Při neplatném/expirovaném code: česká hláška + odkaz na `/forgot-password`
    - _Requirements: 5.3, 5.4_

  - [ ] 7.6 Implementovat server action `src/app/reset-password/actions.ts → resetPasswordAction`
    - Vstup: nové heslo
    - Validace přes `validatePassword` z 4.1 (5.6)
    - Volání `supabase.auth.updateUser({ password })`
    - Po úspěchu: volat `logoutAllSessions(user.id, adminClient)` z 6.3 (5.5)
    - Redirect na `/login` s flash message „Heslo změněno, přihlaste se"
    - _Requirements: 5.5, 5.6_

- [ ] 8. Checkpoint — auth flow funkční
  - Manuálně otestovat: registrace → e-mail v Resend logu → klik na verify → onboarding/1 redirect → logout → login → dashboard/onboarding redirect dle stavu → forgot-password → reset → login s novým heslem
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 1.x, 2.x, 3.x, 4.x, 5.x_

- [ ] 9. Middleware rozšíření — DPA_Manager + Free_User_Guard
  - [ ] 9.1 Rozšířit `src/middleware.ts` o matcher pro `/onboarding/:path*`
    - Foundation matcher (`/dashboard/:path*`, `/admin/:path*`) doplnit o `/onboarding/:path*`
    - Pro neautentizované na chráněných cestách: redirect `/login` (4.3, již ve foundation 9.2)
    - _Requirements: 4.3_

  - [ ] 9.2 Implementovat DPA enforcement v middlewaru
    - Po načtení `auth.uid()`: SELECT `users.dpa_version_accepted` → porovnat s `CURRENT_DPA_VERSION` (3.1)
    - Pokud neshoda: nastavit response hlavičku `x-dpa-mismatch: true` (UI vrstva si jí přečte v Server Componentu a zobrazí modal)
    - Cesty `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/logout` z DPA enforce vyloučit
    - _Requirements: 6.1, 6.2_

  - [ ] 9.3 Implementovat Free_User_Guard logic v middlewaru
    - Pro autentizovaného na `/dashboard/*` nebo `/onboarding/*`:
      - SELECT `businesses` (s `subscriptions`) WHERE `owner_user_id = auth.uid()` LIMIT 1
      - Bez business + bez draftu → redirect `/onboarding/1`
      - Bez business + s draftem → redirect `/onboarding/{current_step + 1}` (max 6) — _Requirements: 14.1_
      - S business + na `/onboarding/*` → redirect `/dashboard` — _Requirements: 13.4_
      - S business + status `free` na `/dashboard/*` → pokračovat (UI vrstva zobrazí zámek) — _Requirements: 13.1, 13.2_
      - S business + status `active` → pokračovat
      - Při DB chybě nebo neočekávaném stavu: redirect na `/error` (fail-secure) — _Requirements: 13.3_
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 14.1, 14.2_

  - [ ]* 9.4 Unit testy pro Free_User_Guard rozhodovací logiku
    - V `src/__tests__/middleware/free-user-guard.test.ts`: extrahovat čistou rozhodovací funkci `decideRedirect(state)` mimo middleware (testovatelná bez request kontextu)
    - Pokrýt všechny řádky tabulky z design.md (Free_User_Guard sekce)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 14.1, 14.2_

- [ ] 10. DPA modal komponenta + akceptace flow
  - [ ] 10.1 Vytvořit DPA modal komponentu `src/components/DpaModal.tsx`
    - Client Component, blokující overlay s focus trap
    - Zobrazí `DPA_TEXT` z 3.2, tlačítka „Akceptuji" a „Odmítnout"
    - Akceptuji → server action z 10.2
    - Odmítnout / zavření modálu → server action `/logout` (4.1)
    - _Requirements: 6.2, 6.3, 15.4_

  - [ ] 10.2 Implementovat server action `src/app/(dashboard)/actions.ts → acceptDpaAction`
    - Volá `recordAcceptance(user.id)` z DPA_Manager (3.3) — idempotentní
    - Po úspěchu: refresh stránky (modal zmizí, protože middleware už nehlásí mismatch)
    - _Requirements: 6.4_

  - [ ] 10.3 Integrovat modal v dashboard / onboarding layoutech
    - V `src/app/(dashboard)/layout.tsx` a `src/app/onboarding/layout.tsx`: číst hlavičku `x-dpa-mismatch` (přes `next/headers`) → pokud `true`, vyrenderovat `<DpaModal />`
    - _Requirements: 6.2, 6.3_

- [ ] 11. Onboarding wizard — společná infrastruktura
  - [ ] 11.1 Vytvořit `src/lib/onboarding/draft.ts` — repository pro `onboarding_drafts`
    - Funkce `getDraft(userId)`: SELECT jednoho řádku, vrací `null` pokud neexistuje
    - Funkce `upsertStep(userId, step, dataKey, jsonData)`: UPSERT s aktualizací příslušného JSON sloupce a `current_step = max(current_step, step)`
    - Funkce `deleteDraft(userId)`: DELETE
    - Veškerý přístup pod uživatelovým JWT (RLS z 1.2 vynutí izolaci)
    - _Requirements: 14.1_

  - [ ] 11.2 Vytvořit společný layout `src/app/onboarding/layout.tsx`
    - Minimal layout (bez sidebaru), progress indicator 1/6 — 6/6, krokový nadpis
    - Integrace DPA modálu (z 10.3)
    - _Requirements: 7.1, 15.2_

  - [ ] 11.3 Implementovat redirect logiku `src/app/onboarding/[step]/page.tsx` skeleton
    - Server Component přijímající param `step ∈ {1..6}`
    - Pokud `step > current_step + 1` v draftu: redirect na `/onboarding/{current_step + 1}` (zabraňuje skoku přes nedokončené kroky)
    - Pokud `step !== 1..6`: 404
    - Skutečné UI delegovat na `step`-specific komponenty (krok 1–6 v dalších úkolech)
    - _Requirements: 14.1_

- [ ] 12. Onboarding wizard — krok 1: výběr typu podniku
  - [ ] 12.1 Implementovat UI pro krok 1 v `src/app/onboarding/1/page.tsx`
    - Radio výběr ze sedmi typů: `kadernik`, `nehtove_studio`, `bistro`, `masazni_salon`, `spa`, `beauty`, `ostatni` s českými popisky
    - Předvyplnit z `draft.type_data`, pokud existuje (R14.1)
    - Tlačítko „Pokračovat"
    - _Requirements: 7.1, 14.1, 15.2_

  - [ ] 12.2 Implementovat server action `src/app/onboarding/1/actions.ts → submitTypeAction`
    - Vstup: vybraný typ (string)
    - Validace: musí být v enumu sedmi hodnot, jinak česká hláška „Vyberte typ podniku" (7.2)
    - `upsertStep(userId, 1, 'type_data', { type })`
    - Redirect `/onboarding/2`
    - _Requirements: 7.2, 7.3_

- [ ] 13. Onboarding wizard — krok 2: slug
  - [ ] 13.1 Implementovat UI pro krok 2 v `src/app/onboarding/2/page.tsx`
    - Pole pro slug + živý náhled URL `https://www.horea.cz/{slug}`
    - Client Component s debounce 300 ms volajícím server action z 13.2
    - Předvyplnit z `draft.slug_data`
    - _Requirements: 8.1, 8.2, 14.1, 15.2_

  - [ ] 13.2 Implementovat server action `src/app/onboarding/2/actions.ts → checkSlugAction`
    - Vstup: raw slug
    - Volá `normalizeSlug(raw)` z 2.2
    - Pokud `kind === 'invalid_format'`: vrátit hlášku dle `reason` (8.3, 8.4)
    - Pokud `kind === 'reserved'`: hláška „Tento název je vyhrazený, zvolte jiný" (8.5)
    - Pokud `kind === 'ok'`: SELECT `businesses WHERE slug = $1 LIMIT 1` → `TAKEN` (8.6) nebo `OK` + náhled URL
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 13.3 Implementovat server action `submitSlugAction`
    - Vstup: raw slug
    - Re-validace přes `checkSlugAction` (defense in depth)
    - Při `OK`: `upsertStep(userId, 2, 'slug_data', { slug: normalized })` → redirect `/onboarding/3`
    - Jinak zůstat na kroku 2 s chybou (8.7)
    - _Requirements: 8.7, 8.8_

- [ ] 14. Onboarding wizard — krok 3: profil
  - [ ] 14.1 Implementovat UI pro krok 3 v `src/app/onboarding/3/page.tsx`
    - Pole: název (povinné), popis (povinné), telefon (povinné), email (povinné), adresa (volitelné)
    - Klientská validace na blur s českou hláškou (R9.2 — UX warning na prázdné povinné pole)
    - Předvyplnit z `draft.profile_data`
    - _Requirements: 9.1, 9.2, 14.1, 15.2_

  - [ ] 14.2 Implementovat server action `src/app/onboarding/3/actions.ts → submitProfileAction`
    - Validace: povinná pole nesmí být prázdná (9.3), email musí být validní formát přes `validateEmail` z 4.2 (9.4)
    - `upsertStep(userId, 3, 'profile_data', { name, description, phone, email, address? })` → redirect `/onboarding/4`
    - _Requirements: 9.3, 9.4, 9.5_

- [ ] 15. Onboarding wizard — krok 4: první služba
  - [ ] 15.1 Implementovat UI pro krok 4 v `src/app/onboarding/4/page.tsx`
    - Dynamický seznam služeb (min 1), každá má pole: název, doba trvání (min), cena (Kč)
    - Tlačítko „Přidat další službu"
    - Předvyplnit z `draft.services_data`
    - _Requirements: 10.1, 14.1, 15.2_

  - [ ] 15.2 Implementovat server action `src/app/onboarding/4/actions.ts → submitServicesAction`
    - Validace: alespoň jedna služba s vyplněným názvem + dobou + cenou (10.5), název neprázdný (10.2), doba kladné celé číslo (10.3), cena nezáporné desetinné číslo (10.4)
    - České hlášky pro každý druh chyby
    - `upsertStep(userId, 4, 'services_data', services)` → redirect `/onboarding/5`
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 16. Onboarding wizard — krok 5: otevírací doba
  - [ ] 16.1 Implementovat UI pro krok 5 v `src/app/onboarding/5/page.tsx`
    - Pro každý den (po–ne): toggle „otevřeno/zavřeno" + time inputy `opens_at` a `closes_at`
    - Předvyplnit z `draft.hours_data`
    - _Requirements: 11.1, 14.1, 15.2_

  - [ ] 16.2 Implementovat server action `src/app/onboarding/5/actions.ts → submitHoursAction`
    - Validace: pro každý otevřený den `closes_at > opens_at` s CZ hláškou identifikující den (11.2)
    - Aspoň jeden den nesmí být zavřený (11.3)
    - `upsertStep(userId, 5, 'hours_data', hours)` → redirect `/onboarding/6`
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

- [ ] 17. Onboarding wizard — krok 6: souhrn + atomický commit
  - [ ] 17.1 Implementovat UI pro krok 6 v `src/app/onboarding/6/page.tsx`
    - Readonly souhrn všech 5 předchozích kroků z draftu
    - Odkazy „Upravit" vedoucí na `/onboarding/{step}` (R12.2)
    - Tlačítko „Vytvořit podnik"
    - _Requirements: 12.1, 12.2_

  - [ ] 17.2 Implementovat atomic commit transaction `src/lib/onboarding/commit.ts → commitOnboarding(userId)`
    - Vytvořit Postgres funkci `commit_onboarding(uid UUID)` (migrace `0012_commit_onboarding_function.sql`) běžící v jedné transakci:
      1. SELECT draft → exception, pokud chybí
      2. Finální server-side validace (last-line defense)
      3. INSERT `businesses` (s `is_published = false`, `owner_user_id = uid`, `slug`, `type`, profil)
      4. INSERT do `services` (1 řádek per služba)
      5. INSERT do `opening_hours` (1 řádek per neuzavřený den)
      6. INSERT do `subscriptions` (`status = 'free'`)
      7. DELETE z `onboarding_drafts WHERE user_id = uid`
    - Postgres garantuje atomicitu — kterákoli `RAISE` rollbackne vše (R12.4)
    - TS wrapper `commitOnboarding(userId)` volá `supabase.rpc('commit_onboarding', { uid: userId })` a mapuje chyby:
      - Unique violation na `businesses.slug` → vrátit `{ error: 'slug_taken' }` (R12.5)
      - Ostatní chyby → `{ error: 'transaction_failed' }` (R12.4)
    - _Requirements: 12.3, 12.4, 12.5_

  - [ ] 17.3 Implementovat server action `src/app/onboarding/6/actions.ts → commitAction`
    - Volá `commitOnboarding(userId)` z 17.2
    - Při `slug_taken`: redirect `/onboarding/2` s českou hláškou „Slug se mezitím obsadil, zvolte jiný"
    - Při `transaction_failed`: zůstat na kroku 6 s hláškou + tlačítko „Zkusit znovu"
    - Při úspěchu: redirect `/dashboard`
    - _Requirements: 12.3, 12.4, 12.5, 12.6_

  - [ ]* 17.4 Property test: atomicita commitu kroku 6
    - **Property 4: Atomicita commitu**
    - **Validates: Requirements 12.3, 12.4**
    - V `src/lib/onboarding/__tests__/commit.property.test.ts`: pro libovolný validní draft a libovolnou pozici simulovaného selhání (1–5 z INSERT/DELETE kroků), platí, že po skončení transakce **buď** existují všechny 4 skupiny + draft je smazán, **nebo** žádná z nich + draft zůstává nedotčen
    - Použít in-memory mock DB s explicitní transakční sémantikou (begin/commit/rollback) — žádné volání reálného Postgres v této property
    - _Requirements: 12.3, 12.4_

- [ ] 18. Checkpoint — onboarding flow funkční
  - Manuálně otestovat všechny kroky 1–6, návrat zpět z kroku 6, restart relace uprostřed onboardingu (Free_User_Guard navrátí na poslední krok)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 7.x, 8.x, 9.x, 10.x, 11.x, 12.x, 14.x_

- [ ] 19. Integrační testy proti lokálnímu Supabase
  - [ ]* 19.1 Integrační test atomického commitu — happy path
    - V `tests/integration/commit-onboarding.test.ts`: setup test user + draft → volat `commitOnboarding` → ověřit, že existují všechny 4 skupiny + draft je smazán
    - Spustit proti `pnpm dlx supabase start` (lokální Docker), reset DB mezi testy
    - _Requirements: 12.3_

  - [ ]* 19.2 Integrační test atomického commitu — rollback při selhání
    - Vyvolat selhání simulací (např. zruší se NOT NULL constraint omylem v draftu) → ověřit kompletní rollback (žádný `businesses`, žádné `services`, draft zachován)
    - _Requirements: 12.4_

  - [ ]* 19.3 Integrační test slug uniqueness race
    - Dva paralelní volání `commitOnboarding` se stejným slugem → jeden uspěje, druhý dostane `slug_taken`
    - Použít `Promise.all` s identickým draftem
    - _Requirements: 12.5_

  - [ ]* 19.4 Integrační test RLS na `onboarding_drafts`
    - Vytvořit dva test users A, B → A vloží draft → B se přihlásí pod svým JWT a SELECT vrací 0 řádků
    - _Requirements: 14.1_

  - [ ]* 19.5 Integrační test DPA re-akceptace flow
    - Změnit `CURRENT_DPA_VERSION` v test scope → middleware vrací `x-dpa-mismatch: true` → volat `acceptDpaAction` → další request už hlavičku nevrací
    - _Requirements: 6.1, 6.2, 6.4_

- [ ] 20. E2E happy path test (Playwright)
  - [ ]* 20.1 Vytvořit `e2e/auth-onboarding-happy-path.spec.ts`
    - Sekvence: register → mock-přečíst verifikační odkaz z Resend test inboxu (nebo Supabase Auth API helper) → klik na verify → onboarding kroky 1 → 2 → 3 → 4 → 5 → 6 → potvrzení → redirect na `/dashboard` se zámkem `free`
    - Použít unique e-mail per test run (timestamp suffix), úklid testovacích dat po testu
    - _Requirements: 1.x, 2.x, 7.x, 8.x, 9.x, 10.x, 11.x, 12.x, 13.1, 13.2_

- [ ] 21. Závěrečný checkpoint
  - Všechny non-optional úkoly hotové, všechny `pnpm lint`, `pnpm test:run`, ručně Playwright happy path zelené
  - Ověřit, že všech 5 correctness properties má vlastní property test (i když optional)
  - Ověřit Czech kompletnost: všechny chybové hlášky, e-maily, UI texty
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Úkoly označené `*` jsou optional (testy) a mohou být přeskočeny pro rychlejší MVP, ale doporučujeme je psát s implementací.
- Každý task referencuje konkrétní acceptance criteria (např. `R8.3` = Requirement 8, kritérium 3) pro traceability.
- **5 correctness properties** z design.md je rozprostřeno do property testů 2.3, 2.4, 2.5, 3.4, 17.4 — každá property má vlastní task.
- **Atomický commit** v kroku 6 je implementován jako Postgres funkce (úkol 17.2) — Postgres garantuje atomicitu zdarma, žádný aplikační lock.
- **Slug uniqueness** je vynucena DB UNIQUE constraintem (foundation 7.2). Live check v kroku 2 je pouze UX vrstva.
- **DPA verzování** je code constant (3.1) — žádné DB úložiště verzí, změna verze = úprava + deploy.
- **Foundation z architecture/tasks.md** se NEduplikuje. Všude, kde se říká „použít foundation X.Y", existuje task v `architecture/tasks.md` který musí být hotový.
- **Žádné aplikační rate limity** — vše řeší Cloudflare edge (foundation 5.4).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4", "2.5", "2.6", "3.3", "5.1", "7.1", "11.1"] },
    { "id": 2, "tasks": ["1.3", "3.4", "4.3", "5.2", "6.1", "6.3", "7.2", "7.3", "10.1", "11.2"] },
    { "id": 3, "tasks": ["4.4", "5.3", "5.4", "6.2", "6.4", "7.4", "7.5", "11.3"] },
    { "id": 4, "tasks": ["7.6", "9.1", "10.2"] },
    { "id": 5, "tasks": ["9.2", "9.3", "10.3"] },
    { "id": 6, "tasks": ["9.4", "12.1", "13.1"] },
    { "id": 7, "tasks": ["12.2", "13.2", "14.1", "15.1", "16.1", "17.1"] },
    { "id": 8, "tasks": ["13.3", "14.2", "15.2", "16.2", "17.2"] },
    { "id": 9, "tasks": ["17.3"] },
    { "id": 10, "tasks": ["17.4", "19.1", "19.2", "19.3", "19.4", "19.5"] },
    { "id": 11, "tasks": ["20.1"] }
  ]
}
```
