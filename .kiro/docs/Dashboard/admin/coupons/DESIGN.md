---
name: Adora Style
colors:
  surface: '#fdf8ff'
  surface-dim: '#ddd7eb'
  surface-bright: '#fdf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f1ff'
  surface-container: '#f1ebff'
  surface-container-high: '#ece5f9'
  surface-container-highest: '#e6dff3'
  on-surface: '#1c1a28'
  on-surface-variant: '#474557'
  inverse-surface: '#312e3d'
  inverse-on-surface: '#f4eeff'
  outline: '#787589'
  outline-variant: '#c9c4da'
  surface-tint: '#592eff'
  primary: '#4100dc'
  on-primary: '#ffffff'
  primary-container: '#592eff'
  on-primary-container: '#dbd4ff'
  inverse-primary: '#c8bfff'
  secondary: '#61568f'
  on-secondary: '#ffffff'
  secondary-container: '#cabeff'
  on-secondary-container: '#554b82'
  tertiary: '#880068'
  on-tertiary: '#ffffff'
  tertiary-container: '#b20089'
  on-tertiary-container: '#ffcae5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5deff'
  primary-fixed-dim: '#c8bfff'
  on-primary-fixed: '#190064'
  on-primary-fixed-variant: '#4100db'
  secondary-fixed: '#e6deff'
  secondary-fixed-dim: '#cabeff'
  on-secondary-fixed: '#1d1148'
  on-secondary-fixed-variant: '#493f76'
  tertiary-fixed: '#ffd8eb'
  tertiary-fixed-dim: '#ffaedc'
  on-tertiary-fixed: '#3c002c'
  on-tertiary-fixed-variant: '#880068'
  background: '#fdf8ff'
  on-background: '#1c1a28'
  surface-variant: '#e6dff3'
  canvas-white: '#ffffff'
  cloud-mist: '#f0f3fe'
  soft-gray: '#eeeeee'
  input-border: '#d8ddef'
  air-blue: '#bcf2ff'
  lush-green: '#dfff9d'
  sunset-pink: '#ffaae6'
  aqua-blue: '#2ed6ff'
  electric-green: '#a2ea13'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 68px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-md:
    fontFamily: Montserrat
    fontSize: 58px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-sm:
    fontFamily: Montserrat
    fontSize: 38px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  gap-element: 5px
  gap-section: 30px
  padding-card: 40px
  padding-input-v: 12px
  padding-input-h: 10px
  stack-4: 4px
  stack-8: 8px
  stack-16: 16px
  stack-24: 24px
  stack-48: 48px
  stack-100: 100px
---

# Horea — Style Reference (Adora style)
> Digital Canvas with Violet Bloom. A pristine workspace where key actions pop with vibrant, focused energy.

**Theme:** light

Adora's design system evokes a digital canvas aesthetic with its predominantly white and subtle off-white backgrounds, punctuated by a vivid violet for primary actions and brand presence. Typography is grounded by a modern sans-serif, using a tighter letter-spacing for a precise, organized feel. Cards and interactive elements are softly rounded, creating a friendly and approachable interface, while decorative strokes and fills hint at an underlying creative energy without overwhelming the functional UI.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Canvas White | `#ffffff` | `--color-canvas-white` | Page backgrounds, card surfaces, internal component backgrounds |
| Cloud Mist | `#f0f3fe` | `--color-cloud-mist` | Subtle borders for buttons and cards, faint dividers |
| Slate Text | `#353241` | `--color-slate-text` | Primary body text, neutral links, general UI text |
| Rich Violet | `#21164c` | `--color-rich-violet` | Headlines, important textual elements, primary icon fills |
| Action Violet | `#592eff` | `--color-action-violet` | Primary call-to-action buttons, active badges, distinctive links and interactive icons — provides energetic focus |
| Air Blue | `#bcf2ff` | `--color-air-blue` | Decorative card backgrounds, accent fills in illustrations |
| Lush Green | `#dfff9d` | `--color-lush-green` | Decorative card backgrounds, accent fills in illustrations |
| Sunset Pink | `#ffaae6` | `--color-sunset-pink` | Decorative card backgrounds, accent strokes in illustrations |
| Neon Pink | `#f843c2` | `--color-neon-pink` | Accent text for labels, decorative badges, icon tints |
| Aqua Blue | `#2ed6ff` | `--color-aqua-blue` | Accent text for labels, decorative badges, icon tints |
| Electric Green | `#a2ea13` | `--color-electric-green` | Success states, accent text for labels, decorative badges, icon tints |
| Soft Gray Fill | `#eeeeee` | `--color-soft-gray-fill` | Subtle background fills for minor interactive elements or sections |
| Input Border | `#d8ddef` | `--color-input-border` | Okraje formulářových polí (input, textarea) — přebíjí Cloud Mist konkrétně pro form fieldy. |

## Tokens — Typography

### PolySans — Display and marketing headlines – its heavier weights and tighter line-height create a bold, modern statement without being ostentatious. · `--font-polysans`
- **Substitute:** Montserrat
- **Weights:** 600, 700
- **Sizes:** 18px, 28px, 38px, 58px, 68px
- **Line height:** 1.10, 1.20
- **Letter spacing:** -0.02
- **Role:** Display and marketing headlines – its heavier weights and tighter line-height create a bold, modern statement without being ostentatious.

### Plus Jakarta Sans — Body text, UI elements, navigation, and secondary headings – its consistent line-height and versatile weights maintain legibility across various contexts. · `--font-plus-jakarta-sans`
- **Substitute:** Inter
- **Weights:** 400, 500, 600, 700
- **Sizes:** 14px, 16px, 18px, 20px, 32px
- **Line height:** 1.00, 1.10, 1.60
- **Letter spacing:** -0.02
- **Role:** Body text, UI elements, navigation, and secondary headings – its consistent line-height and versatile weights maintain legibility across various contexts.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 14px | 1.1 | — | `--text-caption` |
| body-sm | 16px | 1.1 | — | `--text-body-sm` |
| body | 18px | 1.1 | — | `--text-body` |
| body-lg | 20px | 1.1 | — | `--text-body-lg` |
| heading-sm | 32px | 1.1 | — | `--text-heading-sm` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 60 | 60px | `--spacing-60` |
| 100 | 100px | `--spacing-100` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 26px |
| badges | 200px |
| buttons | 12px |

### Layout

- **Section gap:** 30px
- **Card padding:** 40px
- **Element gap:** 5px
- **Input padding:** 12px 10px

## Components

### Primary Action Button
**Role:** Filled button for main calls to action

Background: Action Violet (#592eff). Text: Canvas White (#ffffff), Plus Jakarta Sans, weight 400. Radius: 12px. Padding: 0px vertical, 20px horizontal.

### Ghost Button
**Role:** Button with transparent background and defined text/border color

Background: transparent. Text: Slate Text (#353241), Plus Jakarta Sans. Border: Cloud Mist (#f0f3fe), 1px solid. Radius: 12px. Padding: 0px vertical, 20px horizontal.

### Outline Nav Button
**Role:** Navigation button with distinct border

Background: transparent. Text: Slate Text (#353241), Plus Jakarta Sans. Border: Slate Text (#353241), 1px solid. Radius: 8px. Padding: 0px vertical, 5px horizontal.

### Feature Card
**Role:** Informational cards displaying content with an associated visual

Background: Canvas White (#ffffff). Radius: 26px. No shadow. Padding: 0px.

### Gradient Accent Card
**Role:** Decorative cards with soft color washes, used for visual breaks or special content sections

Background: Air Blue (#bcf2ff), Lush Green (#dfff9d), or Sunset Pink (#ffaae6). Radius: 64px. Padding: 48px.

### Outline Badge
**Role:** Small, informational tag with colored text

Background: transparent. Text: Neon Pink (#f843c2). Radius: 200px. Padding: 0px vertical, 8px horizontal.

### Icon Button
**Role:** Small, functional buttons likely containing an icon or short text

Background: transparent. Text: Slate Text (#353241). Radius: 16px. Padding: 0px. Used for language switchers or minor controls.

### Call-to-Action Link
**Role:** Text link that functions as a smaller, less prominent call to action than a button

Text: Action Violet (#592eff), Plus Jakarta Sans, weight 500. No underline by default; hover state implies interaction.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 1 | Cloud Mist | `#f0f3fe` | Primary app/page (body) background canvas |
| 2 | Canvas White | `#ffffff` | Default container and card surface background, elevated surfaces |
| 3 | Soft Gray Fill | `#eeeeee` | Backgrounds for minor or secondary interactive elements, subtle section breaks |
| 4 | Card White | `#ffffff` | Background for feature cards and main content blocks, with noticeable rounded corners |

## Agent Prompt Guide

Quick Color Reference:
- text: #353241
- background: #f0f3fe (body); cards use #ffffff
- border: #f0f3fe
- accent: #21164c
- primary action: #592eff (filled action)

Example Component Prompts:
- Create a Primary Action Button: #592eff background, #ffffff text, 9999px radius, compact pill padding. Use this filled treatment for the main CTA.
- Design a feature card: Canvas White background, 26px radius. Headline 'AI-powered Journey Mapping' using PolySans 28px, Rich Violet, letter-spacing -0.02em. Body text 'Automatically visualize every user path across your product lifecycle' using Plus Jakarta Sans 16px, Slate Text, letter-spacing -0.02em. Include an Electric Green (#a2ea13) Outline Badge 'New Feature' with 200px radius.