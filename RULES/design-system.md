# Design System Rules

Canonical source: `.kiro/steering/design-system.md`.

Read that source before visual UI work. This file is a short Codex index and must not drift from the source. If this file and `.kiro/steering/design-system.md` conflict, follow `.kiro/steering/design-system.md`.

## Direction

Horea uses a light, precise SaaS interface: white canvas, subtle borders, dark violet headings, and vivid violet primary actions. UI should feel clean, functional, Czech, and mobile-first for booking flows.

## Key Tokens

- Canvas White: `#ffffff`, `--color-canvas-white`.
- Cloud Mist: `#e0e0db`, `--color-cloud-mist`.
- Slate Text: `#353241`, `--color-slate-text`.
- Rich Violet: `#21164c`, `--color-rich-violet`.
- Action Violet: `#592eff`, `--color-action-violet`.
- Air Blue: `#bcf2ff`, `--color-air-blue`.
- Lush Green: `#dfff9d`, `--color-lush-green`.
- Sunset Pink: `#ffaae6`, `--color-sunset-pink`.
- Neon Pink: `#f843c2`, `--color-neon-pink`.
- Aqua Blue: `#2ed6ff`, `--color-aqua-blue`.
- Electric Green: `#a2ea13`, `--color-electric-green`.
- Soft Gray Fill: `#eeeeee`, `--color-soft-gray-fill`.

## Typography

- Display/headlines: PolySans in source design; Montserrat substitute in implementation.
- Body/UI: Plus Jakarta Sans; Inter fallback.
- Common sizes: 14, 16, 18, 20, 32, 58, 68px.
- Kiro source uses tight letter spacing. If active Codex runtime instructions conflict, obey higher-priority runtime instructions and mention the conflict.

## Component Rules

- Primary action button: `#592eff` background, white text, 12px radius.
- Ghost button: transparent background, Slate Text, Cloud Mist border, 12px radius.
- Outline nav button: transparent background, Slate Text border, 8px radius.
- Feature card: white background, 26px radius, no heavy shadow.
- Outline badge: transparent background, accent text, pill radius.
- Use existing tokens in `src/app/globals.css` when present; do not invent near-match colors.
