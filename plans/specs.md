# Kiro Spec Map

This file maps Kiro specs for Codex. `.kiro/specs/` remains the source of truth.

## Spec Metadata

| Spec | Workflow | Type | Config |
| --- | --- | --- | --- |
| `architecture` | `design-first` | `feature` | `.kiro/specs/architecture/.config.kiro` |
| `auth-onboarding` | `requirements-first` | `feature` | `.kiro/specs/auth-onboarding/.config.kiro` |
| `services-and-availability` | `requirements-first` | `feature` | `.kiro/specs/services-and-availability/.config.kiro` |
| `public-business-page` | `requirements-first` | `feature` | `.kiro/specs/public-business-page/.config.kiro` |
| `reservation-management` | `requirements-first` | `feature` | `.kiro/specs/reservation-management/.config.kiro` |
| `subscription-payments` | `requirements-first` | `feature` | `.kiro/specs/subscription-payments/.config.kiro` |
| `admin-dashboard` | `requirements-first` | `feature` | `.kiro/specs/admin-dashboard/.config.kiro` |
| `multi-service-reservations` | viz `.config.kiro` | `feature` | `.kiro/specs/multi-service-reservations/.config.kiro` |

## Logical Dependency Order

Source: `.kiro/specs/architecture/design.md`, section `Planned Spec Structure`.

1. `architecture` foundation.
2. `auth-onboarding`.
3. `services-and-availability` and `public-business-page`.
4. `reservation-management`.
5. `subscription-payments`.
6. `admin-dashboard`.
7. `multi-service-reservations` (navazuje na `reservation-management`).

## Switching Checklist

- Codex -> Kiro: verified completed tasks are reflected in `.kiro/specs/*/tasks.md` checkboxes.
- Kiro -> Codex: re-read `.kiro/specs/<spec>/.config.kiro`, required source docs, and `tasks.md` before continuing.
- If source docs changed, ignore stale summaries in `plans/`.
