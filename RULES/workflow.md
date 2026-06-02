# Kiro Workflow For Codex

Canonical source: `.kiro/`.

Codex must follow the same workflow as Kiro AI so switching tools does not change planning, task state, or implementation order.

## Source Of Truth

- Steering: `.kiro/steering/CLAUDE.md`, `.kiro/steering/tech-conventions.md`, `.kiro/steering/design-system.md`.
- Specs: `.kiro/specs/<spec>/requirements.md`, `.kiro/specs/<spec>/design.md`, `.kiro/specs/<spec>/tasks.md`.
- Spec metadata: `.kiro/specs/<spec>/.config.kiro`.
- Codex helper indexes: `RULES/`, `plans/`, `subagents/`, `.codex/agents/`.

## Spec Lifecycle

1. Read `.kiro/specs/<spec>/.config.kiro`.
2. If `workflowType` is `requirements-first`, read in this order:
   - `requirements.md`
   - `design.md`
   - `tasks.md`
3. If `workflowType` is `design-first`, read in this order:
   - `design.md`
   - `requirements.md`
   - `tasks.md`
4. Read the task dependency graph at the end of `tasks.md` when present.
5. Pick the smallest unblocked unchecked task.
6. State assumptions, scope, and verification before editing.
7. Implement only the selected task slice.
8. Run the task's required checks or the narrowest relevant project checks.
9. When verified, update the matching checkbox in `.kiro/specs/<spec>/tasks.md` unless the current user request explicitly forbids `.kiro` edits.

## Task Checkbox Rules

- Mark only tasks that are actually completed and verified.
- Preserve task wording, indentation, requirements links, and dependency graph.
- Do not mark parent tasks complete unless all child tasks are complete or the task text itself is fully satisfied.
- If verification is skipped, do not mark the task complete unless the task is documentation-only or the user explicitly accepts the skip.
- Never edit `.kiro/steering/*`, `.kiro/specs/*/requirements.md`, `.kiro/specs/*/design.md`, or `.config.kiro` during ordinary implementation unless the user explicitly requests spec maintenance.

## Codex Adapter Rules

- `plans/` is an index and checkpoint area, not a second source of truth.
- `RULES/` mirrors Kiro steering for Codex visibility, but `.kiro/steering/` wins on conflict.
- `.codex/rules/default.rules` controls shell command approval only.
- `.codex/agents/*.toml` are Codex runtime subagents that read Kiro specs.
- `subagents/README.md` documents those runtime subagents for humans.

## Switching Between Codex And Kiro

- Before switching from Codex to Kiro, ensure verified task checkboxes in `.kiro/specs/*/tasks.md` reflect completed work.
- Before switching from Kiro to Codex, read current `.kiro` files again. Do not trust stale summaries in `plans/`.
- If `.kiro` changed externally during a Codex session, re-read the relevant spec before continuing.
