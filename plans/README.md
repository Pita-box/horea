# Codex Plans

This directory is the Codex helper layer for Kiro planning. It is not a second task tracker.

`.kiro/` remains the canonical workflow source for Kiro and Codex: steering, spec metadata, requirements, design, task order, dependency graph, and task checkbox state.

## Workflow

1. Pick the smallest active scope from `.kiro/specs/<spec>/tasks.md`.
2. Read `RULES/workflow.md` and relevant steering in `RULES/`.
3. Read `.kiro/specs/<spec>/.config.kiro` to determine `workflowType`.
4. Read the source spec files in the required order:
   - `requirements-first`: `requirements.md` -> `design.md` -> `tasks.md`
   - `design-first`: `design.md` -> `requirements.md` -> `tasks.md`
5. Read the task dependency graph when present.
6. State assumptions and verification before editing code.
7. Implement one coherent task slice.
8. Verify with the narrowest relevant checks.
9. Mark the matching `.kiro/specs/<spec>/tasks.md` checkbox done only after verified completion, unless the current user request forbids `.kiro` edits.

## Source Map

| Codex plan | Kiro source | Purpose |
| --- | --- | --- |
| `plans/specs.md` | `.kiro/specs/*/.config.kiro` and `architecture/design.md` | Spec workflow map and switching checklist |
| `plans/architecture.md` | `.kiro/specs/architecture/` | Foundation, platform setup, schemas, baseline tooling |
| `plans/feature-backlog.md` | `.kiro/specs/*/` | Feature order, dependencies, next slices |
| `RULES/` | `.kiro/steering/*` | Codex-facing steering rules |
| `AGENTS.md` | `RULES/` plus Codex workflow | Durable repo instruction entrypoint |
| `.codex/rules/default.rules` | `.kiro/steering/tech-conventions.md` | Command guardrails for Codex |
| `.codex/agents/*.toml` | Kiro-style specialist workflow | Codex-native subagents |
| `subagents/README.md` | `.codex/agents/*.toml` | Human-readable subagent index |

## Recommended Build Order

1. `architecture` foundation.
2. `auth-onboarding`.
3. `services-and-availability`.
4. `public-business-page`.
5. `reservation-management`.
6. `subscription-payments`.
7. `admin-dashboard`.

Reason: this matches the logical dependency note in `.kiro/specs/architecture/design.md`.

## Verification Matrix

| Work type | Minimum checks |
| --- | --- |
| Pure utility/domain logic | `pnpm test:run`, `pnpm lint` |
| App Router pages, layouts, metadata | `pnpm lint`, `pnpm test:run`, `pnpm build` |
| Visible flows | Focused Playwright test or `pnpm test:e2e` |
| Database/RLS changes | Unit tests where possible plus local Supabase verification when available |
| Docs or planning only | No runtime check required; verify links/paths and diff |

## Subagent Prompts

Use these only when parallel work is worth the token cost.

```text
Spawn `spec-explorer` for auth-onboarding. Wait for it, then summarize requirements, risks, and next implementation slice.
```

```text
Spawn `kiro-task-planner` for services-and-availability. Wait for it, then identify the next unblocked task from `.kiro/specs/services-and-availability/tasks.md`.
```

```text
Spawn `code-reviewer` and `test-verifier` for this branch. Wait for both, then merge findings by severity.
```
