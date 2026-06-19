# Design System Rules (Adora style)

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
- Global body text default (`body` v `globals.css`): font-size 18px, font-weight 500, color `#353241`. Výjimka: tlumené dekorativní doplňkové texty `color-mix(in srgb, var(--color-slate-text) 70%, white)` se NEmění — drží si vlastní barvu/velikost/váhu.
- Kiro source uses tight letter spacing. If active Codex runtime instructions conflict, obey higher-priority runtime instructions and mention the conflict.

## Component Rules

- Primary action button: `#592eff` background, white text, 12px radius.
- Ghost button: transparent background, Slate Text, Cloud Mist border, 12px radius.
- Outline nav button: transparent background, Slate Text border, 8px radius.
- Feature card: white background, 26px radius, no heavy shadow.
- Outline badge: transparent background, accent text, pill radius.
- Use existing tokens in `src/app/globals.css` when present; do not invent near-match colors.
- Růžová jako popředí (text/ikona/rámeček) na bílém/skoro-bílém pozadí: vždy `var(--color-neon-pink)` (#f843c2), nikdy `var(--color-sunset-pink)` (#ffaae6 — světlý, nečitelný). Sunset Pink jen jako dekorativní výplň/pozadí.


## Notice / Alert (in-page hlášky)

> Týká se POUZE in-page hlášek (komponenta `Notice`, `src/components/ui/notice.tsx`).
> NETÝKÁ se toast notifikací — ty mají vlastní komponentu a styl.
> Pro nové in-page hlášky vždy používej `Notice` s jednou z těchto variant; nevytvářej ad-hoc barevné boxy.

Tři varianty (jediný zdroj pravdy je komponenta `Notice`):

| Varianta | `variant` | Ikona (tabler) | Rámeček | Pozadí | Text |
|----------|-----------|----------------|---------|--------|------|
| General (výchozí) | `neutral` | `IconBulb` | `--color-dark` | `--color-dark` | `white` |
| Warning | `warning` | `IconAlertCircle` | `--color-border-yellow` | `--color-bg-yellow` | `--color-brown` |
| Error | `error` | `IconCancel` | `--color-red` | `--color-canvas-white` (bílá) | `--color-red` |

Pravidla:
- Neduplikovat styly — používat komponentu `Notice` (`variant="neutral" | "warning" | "error"`).
- Ikona, rámeček, pozadí a barva textu jsou pevně dané variantou; nepřepisovat je ad-hoc.
- General = informační/nápověda; Warning = upozornění vyžadující pozornost (ne chyba); Error = chyba/odmítnutí.

## Tabulky (řádky)

> Platí pro VŠECHNY tabulky na webu. Jednotné chování řádků je v `globals.css`
> jako globální pravidlo (`tbody tr`), záměrně mimo `@layer`, aby přebilo Tailwind utility.

- Výchozí pozadí datového řádku (`<tbody><tr>`): bílé (`--color-canvas-white`).
- Na hover: světle fialové (`--color-light-violet`).
- Hlavička (`<thead>`) se nezvýrazňuje.
- Nepřidávej na řádky ad-hoc `hover:bg-…` utility — globální pravidlo je jediný zdroj pravdy.
- Pro grid-list „pseudo-tabulky" (které nejsou `<table>`, např. `TableView` rezervací) použij stejný hover ručně: `hover:bg-[var(--color-light-violet)]`.
- **Výjimka — tabulky se sloupcem „Akce" (tlačítka akcí v řádku, řádek není klikací):** hover se NEpoužívá. Označ `<table data-no-row-hover …>` — CSS override v `globals.css` hover vypne (např. `/dashboard/services`, admin kupóny, admin platby).
