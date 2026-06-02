# Codex Rules Adapter

This directory is the Codex-facing adapter for Kiro steering.

`.kiro/` is the canonical source of truth. These files exist so Codex has visible `RULES/` files, but they must not drift from `.kiro/steering/`. If a rule here conflicts with `.kiro/steering/`, the `.kiro` source wins.

Do not edit `.kiro` while maintaining this adapter. During normal feature implementation, Codex follows the same task-state workflow as Kiro: after a task from `.kiro/specs/*/tasks.md` is completed and verified, update only that task checkbox unless the current user request explicitly says `.kiro` is read-only for that turn.

## Files

- `RULES/workflow.md` - Kiro spec lifecycle mapped to Codex.
- `RULES/CLAUDE.md` - coding discipline adapter for `.kiro/steering/CLAUDE.md`.
- `RULES/tech-conventions.md` - adapter for package manager, commands, CI, and deploy conventions.
- `RULES/design-system.md` - adapter for UI tokens, visual style, and component rules.

## How Codex Uses This

- `AGENTS.md` is loaded automatically by Codex and points to these rule files.
- Read `RULES/workflow.md` before starting work from any Kiro spec.
- Read `RULES/CLAUDE.md` before multi-step code work.
- Read `RULES/tech-conventions.md` before dependency, script, CI, or tooling changes.
- Read `RULES/design-system.md` before visual UI work.
- `.codex/rules/default.rules` is command execution policy. It is not the same thing as these project steering rules.

## Planning State

- Keep Codex planning helpers under `plans/`, but keep task truth in `.kiro/specs/*/tasks.md`.
- Treat `.kiro/specs/` as the shared Kiro/Codex product workflow.
- Do not duplicate task status in `plans/`.
