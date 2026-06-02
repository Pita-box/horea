<!-- BEGIN:nextjs-agent-rules -->
# Next.js 15 (App Router)

This project uses stable Next.js 15 with the App Router and standard conventions. When unsure about an API or convention, consult the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codex Project Workflow

## Scope

- Product: Horea, a Czech SaaS reservation platform.
- Stack: Next.js 15 App Router, TypeScript, React 18, Tailwind v4, pnpm.
- Package manager: use `pnpm` only. Do not use `npm`, `npx`, `yarn`, or `bun` for project tasks.
- Locale: Czech UI, `Europe/Prague` display timezone, UTC storage for persisted timestamps.

## Source Files

- `AGENTS.md` is the primary Codex instruction file for this repository.
- `RULES/` contains Codex-facing steering converted from `.kiro/steering/`.
- `.codex/` contains Codex-native workflow configuration: command rules and custom subagents.
- `subagents/` documents the Kiro-style subagent map; runtime agent files live in `.codex/agents/`.
- `plans/` contains Codex working plans and indexes.
- `.kiro/` is the canonical Kiro workflow source: steering, specs, metadata, and task checkbox state.
- `CLAUDE.md` only points back to `AGENTS.md`; keep future durable instructions here unless another tool explicitly requires a different file.

## Planning Rules

- Before feature work, read `RULES/workflow.md`, `RULES/CLAUDE.md`, the matching entry in `plans/specs.md`, then the referenced `.kiro/specs/<feature>/` files in the order specified by `.config.kiro`.
- Treat `.kiro/specs/*/tasks.md` checkboxes as shared Kiro/Codex task state.
- After completing and verifying a task from `.kiro/specs/*/tasks.md`, mark the matching checkbox done unless the current user request explicitly forbids `.kiro` edits.
- Track planning notes in `plans/` only when they are helper notes; do not duplicate task status there.
- For multi-step coding tasks, state assumptions and a short plan with verification for each step before editing.
- If requirements conflict, stop and name the conflict. Do not silently choose a product behavior.

## Implementation Rules

- Make surgical changes. Every changed line should map to the user request.
- Apply `RULES/CLAUDE.md` for coding discipline.
- Apply `RULES/tech-conventions.md` for commands, dependencies, CI, and deployment instructions.
- Prefer existing project style and local helpers over new abstractions.
- Add no speculative flexibility, settings, layers, or dependencies.
- Write or update tests when behavior changes. For bug fixes, reproduce the bug first when feasible.
- Keep domain logic in `src/lib/` or feature-specific server modules; keep App Router pages thin.
- Keep service-role Supabase access isolated to server-only code paths. Never expose secrets to client components.
- Do not log PII, secrets, auth tokens, phone numbers, email addresses, full request bodies, or payment credentials.

## Design Rules

- Read `RULES/design-system.md` before visual UI work.
- Use tokens already present in `src/app/globals.css` when available; do not invent close color values.
- Keep UI Czech, mobile-first for client-facing booking flows, and restrained for dashboard/admin workflows.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Lint: `pnpm lint`
- Unit/integration tests: `pnpm test:run`
- Coverage: `pnpm test:coverage`
- E2E: `pnpm test:e2e`
- Build: `pnpm build`

## Verification

- Run the narrowest relevant checks first.
- For shared TypeScript, validation, date/time, logging, or domain logic changes: run `pnpm test:run` and `pnpm lint`.
- For App Router, layout, metadata, or route changes: run `pnpm lint`, `pnpm test:run`, and `pnpm build` when feasible.
- For visible user flows: run `pnpm test:e2e` or a focused Playwright test when feasible.
- Report any skipped check with the concrete reason.

## Codex Subagents

- Codex does not spawn subagents unless explicitly asked. When the user asks for parallel/subagent work, prefer project agents under `.codex/agents/`.
- Human-readable subagent index lives in `subagents/README.md`.
- Use `spec-explorer` for read-only requirements/design/task context.
- Use `kiro-requirements-auditor` for requirements-first validation.
- Use `kiro-design-auditor` for design-first and architecture validation.
- Use `kiro-task-planner` for task graph and next-slice selection.
- Use `code-reviewer` for correctness, security, behavior regression, and missing-test review.
- Use `test-verifier` for running or auditing verification commands and summarizing failures.

## Codex Rules

- Project command policy lives in `.codex/rules/default.rules`.
- Project steering rules live in `RULES/`.
- Command rules are guardrails for commands that run outside the sandbox; they do not replace `AGENTS.md` or `RULES/`.
