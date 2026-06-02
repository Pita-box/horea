# Feature Backlog

This is a Codex index over Kiro feature specs. Detailed requirements, design, tasks, dependency graphs, and task state remain in `.kiro/specs/<feature>/` and must be read before implementation.

## Features

| Order | Feature | Source | Depends on | Next slice |
| --- | --- | --- | --- | --- |
| 1 | `auth-onboarding` | `.kiro/specs/auth-onboarding/` | `architecture` schema/auth baseline | Onboarding draft schema, slug normalization, DPA constants |
| 2 | `services-and-availability` | `.kiro/specs/services-and-availability/` | `architecture`, `auth-onboarding` tenant context | `Slot_Calculator` tests and pure function |
| 3 | `public-business-page` | `.kiro/specs/public-business-page/` | `services-and-availability` slot logic, published business model | Public renderer and `/{slug}` routing utility |
| 4 | `reservation-management` | `.kiro/specs/reservation-management/` | `public-business-page`, `services-and-availability`, active subscription status | Shared reservation creation/email refactor, dashboard read layer |
| 5 | `subscription-payments` | `.kiro/specs/subscription-payments/` | `architecture` payment model, auth/business ownership | Subscription state machine and payment identifiers |
| 6 | `admin-dashboard` | `.kiro/specs/admin-dashboard/` | `subscription-payments`, admin role/RLS override | Audit log core and admin access guard |

## Implementation Rules

- Read `requirements.md`, then `design.md`, then `tasks.md` for the selected feature.
- If `.config.kiro` says `design-first`, read `design.md` before `requirements.md`.
- Identify cross-feature contracts before editing. Examples: `Slot_Calculator`, reservation creation, subscription status, audit logging.
- Keep each feature slice testable and reversible.
- Update this backlog only when order, dependency, or next-slice guidance changes. Do not track task completion here.

## Known Cross-Feature Contracts

- `auth-onboarding` owns slug validation, DPA acceptance, business bootstrap, and free-user state.
- `services-and-availability` owns service CRUD, opening hours, availability settings, and `Slot_Calculator`.
- `public-business-page` consumes slug/business/service/availability data and creates client reservations with server-side revalidation.
- `reservation-management` reuses reservation creation and slot validation for owner-created or edited reservations.
- `subscription-payments` owns subscription status transitions, plan changes, invoices, QR/manual payment logic, and billing cron behavior.
- `admin-dashboard` may override subscription/business state, but must audit sensitive actions and respect admin-only access.

## Verification Notes

- Property or table-driven tests are preferred for pure domain logic such as slot calculation, status machines, slug normalization, payment symbols, and date/time boundaries.
- Playwright tests should cover only key happy paths and user-visible regressions; avoid duplicating every unit case in E2E.
- Database/RLS work needs local Supabase verification when possible.
