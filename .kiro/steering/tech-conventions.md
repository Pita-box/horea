# Technické konvence projektu

> Závazné technické konvence pro projekt Mojerezervace. Platí pro veškerou práci s kódem, příkazy a nástroji — stejně jako CLAUDE.md a design-system.md.

## Správce balíčků — pnpm (povinné)

Projekt používá **výhradně `pnpm`**, nikdy `npm` ani `yarn`. Důvod: efektivní správa úložiště (sdílený content-addressable store, symlinky místo duplicit), přísnější resoluce dependencí a rychlejší instalace.

### Pravidla

- **NIKDY** nepoužívej `npm` ani `npx`. Vždy `pnpm` ekvivalent.
- Commituj `pnpm-lock.yaml`, nikdy `package-lock.json` ani `yarn.lock`.
- Pin verzi pnpm přes pole `packageManager` v `package.json` (např. `"packageManager": "pnpm@9.x"`).
- Preferuj přesné / pinnuté verze dependencí (viz CLAUDE.md, žádné volné rozsahy u kritických balíčků).

### Mapování příkazů npm → pnpm

| Místo (npm/npx) | Použij (pnpm) |
|---|---|
| `npm install` | `pnpm install` |
| `npm install <pkg>` | `pnpm add <pkg>` |
| `npm install -D <pkg>` | `pnpm add -D <pkg>` |
| `npm run <script>` | `pnpm <script>` (např. `pnpm dev`, `pnpm lint`, `pnpm test:run`) |
| `npx <bin>` (lokální) | `pnpm exec <bin>` (např. `pnpm exec playwright test`) |
| `npx <pkg>` (jednorázově) | `pnpm dlx <pkg>` (např. `pnpm dlx supabase db push`) |
| `npm create <starter>` / `npx create-*` | `pnpm create <starter>` (např. `pnpm create next-app .`) |
| `npm init playwright` | `pnpm create playwright` |

### CI a deploy

- GitHub Actions: použij `pnpm/action-setup` + `actions/setup-node` s `cache: 'pnpm'`; instaluj přes `pnpm install --frozen-lockfile`.
- Vercel: nastav Install Command na `pnpm install` (Vercel pnpm detekuje automaticky podle `pnpm-lock.yaml`); build běží přes `pnpm build`.
- README a `.env.example` instrukce piš s `pnpm` příkazy.
