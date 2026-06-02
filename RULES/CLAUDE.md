# Codex Coding Rules

Canonical source: `.kiro/steering/CLAUDE.md`.

Read that source before non-trivial coding work. This file only adapts the Kiro rule to Codex runtime behavior. If this file and `.kiro/steering/CLAUDE.md` conflict, follow `.kiro/steering/CLAUDE.md`.

## Language

- Always use Czech language for project-facing communication, UI copy, validation messages, and docs unless the user explicitly asks otherwise.
- Code identifiers, framework APIs, package names, and commands can stay English.

## Kiro Task State

- Kiro guidance says: after finishing any task from `tasks.md`, mark it done.
- Codex must follow the same workflow for implementation tasks: after verification, update the matching checkbox in `.kiro/specs/<spec>/tasks.md`.
- Only change task checkbox state. Do not rewrite task wording, requirements, design text, or unrelated checkboxes.
- If the current user request says `.kiro` must remain unchanged, do not mark the task. Report the completed task and verification instead.

## Coding Discipline

- Think before coding. State assumptions, surface tradeoffs, and ask when ambiguity is risky.
- Simplicity first. Minimum code that solves the task; no speculative features, abstractions, or configurability.
- Surgical changes. Touch only what the task needs; clean up only unused code created by your change.
- Goal-driven execution. Turn work into verifiable goals and loop until checks pass or blockers are explicit.

For multi-step tasks, use this shape:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

## Done Criteria

- Code compiles or the blocker is explicit.
- Narrow relevant tests run, or skipped checks are explained.
- If work completed a `.kiro` task and `.kiro` writes are allowed, the matching task checkbox is updated.
- Final response names changed files and verification.
