# Horea

Rezervační SaaS pro malé české podniky. Foundation workflow a feature specifikace žijí v `.kiro/specs/`; `.kiro` je zdroj pravdy pro Kiro i Codex práci.

## Prerekvizity

- Node.js 20 LTS (`.nvmrc` je nastavené na `20`)
- pnpm 8.15.0 (`corepack enable`)
- Supabase CLI (`pnpm exec supabase --version` po instalaci dependencies)
- GitHub účet a repozitář
- Vercel CLI volitelně pro ruční preview deploye

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Potom doplň hodnoty v `.env.local`. Skutečné klíče nikdy nepatří do gitu.

Povinné proměnné pro lokální foundation práci:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `GOPAY_GOID`
- `GOPAY_CLIENT_ID`
- `GOPAY_CLIENT_SECRET`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_DRIVE_BACKUP_FOLDER_ID`
- `LOG_LEVEL`

Google backup používá osobní Google Drive přes OAuth refresh token. Backup složka musí být vytvořená přes stejný OAuth client, aby scope `drive.file` měl k cíli přístup. Service account se nepoužívá, protože osobní Google Drive nepodporuje Shared Drives a service account nelze spolehlivě přidat jako běžný účet.

## Local Dev

```bash
pnpm dev
```

Aplikace běží na `http://localhost:3000`.

## Databáze

Supabase migrace jsou v `supabase/migrations/`.

```bash
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db push
```

Uživatelé aplikace jsou uložené v `public.users` jako 1:1 profilové rozšíření `auth.users`. Sloupec `public.users.id` odkazuje na `auth.users.id`; hashe hesel záměrně nejsou v `public.users`, protože přihlašovací údaje spravuje Supabase Auth.

## Testy

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test:run
pnpm test:e2e
```

E2E testy se spouští ručně; nejsou součástí MVP CI.

## CI A Deploy

GitHub Actions workflow je v `.github/workflows/ci.yml` a běží na `pull_request` a `push` do `main`.

CI spouští:

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test:run`

Pokud je projekt propojený s Vercelem, push do `main` spouští automatický Vercel build přes `pnpm build`.

## Foundation A Feature Specs

Foundation úkoly jsou v `.kiro/specs/architecture/tasks.md`. Navazující oblasti mají vlastní složky v `.kiro/specs/`, vždy s vlastními `requirements.md`, `design.md` a `tasks.md`.

Před prací na jakékoli oblasti si agent musí přečíst její `.config.kiro` a zdrojové dokumenty podle workflow typu.
