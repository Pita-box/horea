# Technical Conventions

Canonical source: `.kiro/steering/tech-conventions.md`.

Read that source before changing dependencies, scripts, CI, deploy setup, README setup commands, or package tooling. If this file and `.kiro/steering/tech-conventions.md` conflict, follow `.kiro/steering/tech-conventions.md`.

## Package Manager

Use `pnpm` only.

- Never use `npm`, `npx`, `yarn`, or `bun` for project work.
- Commit `pnpm-lock.yaml`.
- Do not commit `package-lock.json` or `yarn.lock`.
- Keep `packageManager` pinned in `package.json`.
- Prefer exact or pinned versions for critical dependencies.

## Command Mapping

| Do not use | Use |
| --- | --- |
| `npm install` | `pnpm install` |
| `npm install <pkg>` | `pnpm add <pkg>` |
| `npm install -D <pkg>` | `pnpm add -D <pkg>` |
| `npm run <script>` | `pnpm <script>` |
| `npx <bin>` | `pnpm exec <bin>` |
| `npx <pkg>` | `pnpm dlx <pkg>` |
| `npm create <starter>` | `pnpm create <starter>` |

## Project Commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Lint: `pnpm lint`
- Unit/integration tests: `pnpm test:run`
- Coverage: `pnpm test:coverage`
- E2E: `pnpm test:e2e`
- Build: `pnpm build`

## CI And Deploy

- GitHub Actions should use `pnpm/action-setup` and `actions/setup-node` with `cache: 'pnpm'`.
- CI install command: `pnpm install --frozen-lockfile`.
- Vercel install command: `pnpm install`.
- Vercel build command: `pnpm build`.
- README and `.env.example` instructions must use `pnpm` commands.
