# Architecture Plan

Source specs:
- `.kiro/specs/architecture/requirements.md`
- `.kiro/specs/architecture/design.md`
- `.kiro/specs/architecture/tasks.md`

`.kiro/specs/architecture/tasks.md` is the shared Kiro/Codex task state. Re-verify in code before relying on any completed checkbox.

## Success Criteria

- Next.js 15 App Router foundation is stable.
- Tooling is repeatable with `pnpm`.
- Environment, deployment, database, auth, logging, and docs baselines exist before feature implementation depends on them.
- Foundation changes pass `pnpm lint`, `pnpm test:run`, and `pnpm build` when feasible.

## Current Foundation State

- Project uses `pnpm@8.15.0`, Next.js 15, TypeScript, Vitest, Playwright, ESLint, and Prettier.
- Root docs still include starter README content; architecture task 16 should replace it with project setup docs when reached.
- `src/app/globals.css`, `src/app/layout.tsx`, and `src/app/not-found.tsx` exist, but visual foundation should be checked against `RULES/design-system.md` before marking task 6 complete in Codex planning.

## Work Slices

1. Provision Supabase project and local setup notes.
   - Source: architecture tasks 3 and 7-9.
   - Verify: local env documented, migration path clear, RLS assumptions captured.

2. Provision Vercel and Cloudflare basics.
   - Source: architecture tasks 4 and 5.
   - Verify: required dashboard settings documented; no secrets committed.

3. Finish layout, locale, error pages, and minimal UI primitives.
   - Source: architecture task 6 and `RULES/design-system.md`.
   - Verify: `pnpm lint`, `pnpm test:run`, `pnpm build`.

4. Add Supabase schema baseline and RLS baseline.
   - Source: architecture tasks 7 and 8.
   - Verify: migrations apply locally; tenant isolation cases covered where practical.

5. Add auth wiring, Resend setup, request logging, GoPay and Google setup placeholders.
   - Source: architecture tasks 9-13.
   - Verify: server-only boundaries, no secret exposure, focused tests for utility code.

6. Add CI baseline and project README/env docs.
   - Source: architecture tasks 15 and 16.
   - Verify: `pnpm lint`, `pnpm test:run`, `pnpm build`, README command accuracy.

## Notes For Codex

- Mark `.kiro/specs/architecture/tasks.md` checkboxes only after verified completion, matching `RULES/workflow.md`.
- If extra progress notes are needed, add or update a short note here with date, task slice, verification, and remaining work. Do not duplicate checkbox state.
- Manual provisioning tasks may require user-owned credentials or dashboard access; document exact blockers instead of fabricating completion.
