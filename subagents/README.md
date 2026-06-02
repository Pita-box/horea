# Codex Subagents

This directory preserves the Kiro-style `subagents` concept as a human-readable index.

Runtime Codex custom agents live in `.codex/agents/*.toml`. Keep those TOML files as the source of executable subagent configuration.

## Available Agents

| Agent | Runtime file | Use |
| --- | --- | --- |
| `spec-explorer` | `.codex/agents/spec-explorer.toml` | Read-only exploration of specs, plans, architecture, and design constraints |
| `kiro-requirements-auditor` | `.codex/agents/kiro-requirements-auditor.toml` | Requirements-first acceptance criteria, scope, and traceability audit |
| `kiro-design-auditor` | `.codex/agents/kiro-design-auditor.toml` | Design-first, architecture-heavy, and cross-spec contract audit |
| `kiro-task-planner` | `.codex/agents/kiro-task-planner.toml` | Task checkbox state, dependency graph, and next-slice selection |
| `code-reviewer` | `.codex/agents/code-reviewer.toml` | Review for correctness, security, regressions, and missing tests |
| `test-verifier` | `.codex/agents/test-verifier.toml` | Run or audit verification commands and summarize failures |

## Rules

- Codex spawns subagents only when explicitly asked.
- Prefer subagents for read-heavy or parallel work.
- Avoid parallel write-heavy work unless the user explicitly asks for it.
- Subagents must not modify `.kiro`.
- Main agent owns any final `.kiro/specs/*/tasks.md` checkbox update after verification.

## Example Prompts

```text
Spawn `spec-explorer` for services-and-availability. Wait for it, then summarize next implementation slice and risks.
```

```text
Spawn `kiro-task-planner` for architecture. Wait for it, then identify the next unblocked unchecked task and required verification.
```

```text
Spawn `code-reviewer` and `test-verifier` for this branch. Wait for both, then merge findings by severity.
```
