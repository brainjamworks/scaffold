# scaffold Design System — Summary

A short markdown summary of the scaffold visual identity. The
canonical, browsable reference is **[`design-system.html`](./design-system.html)** — open
it in any browser, no build needed.

## Identity in one paragraph

scaffold's visual identity is **education-flavoured, calm, and
considered**. Authors are building real teaching content — the editor
should feel like a focused work surface, not a marketing site, not a
slide deck, not a children's app. The signature moves are a
**triple-colour palette** (navy + coral + teal) used with restraint
and a **register mark** — the add-block slot reduced to registration
corners around a plus — that doubles as a literal product metaphor.

Intentionally distinct from:

- Linear / Vercel / Notion clones (single-accent SaaS)
- Canvas / Blackboard (institutional corporate)
- Teachable / Kajabi (marketing-glossy prosumer)
- Children's edtech (saturated, cartoon)
- Learnhouse (open-source LMS we were briefly tempted to imitate)

## Palette

The **brand triple** — the fingerprint. Coral and teal earn their
distinctive signal value by being scarce.

| Role                    | Hex       | Used for                                           |
| ----------------------- | --------- | -------------------------------------------------- |
| **Navy** — brand        | `#161D77` | Primary CTA, wordmark, focus rings, brand presence |
| **Coral** — destructive | `#F43A57` | Error, delete, destructive actions ONLY            |
| **Teal** — affirmation  | `#00BA92` | Correct, save-confirmation, success state ONLY     |
| **Ink**                 | `#18181B` | Body text, secondary CTAs, dark chrome             |
| **Canvas**              | `#FAFAFA` | Page background (light editor surface)             |
| **Dark surface**        | `#0A0A0F` | Splash / login / brand-presence surfaces           |

Full neutrals + semantic pairs live in
[`design-system.html`](./design-system.html) and
[`packages/core/src/styles/globals.css`](../packages/core/src/styles/globals.css).

## Typography

Two branded families:

- **Poppins** — primary. Prose + chrome. Weights 400/500/600/700/800.
  Hierarchy comes from size + weight contrast within the family.
- **JetBrains Mono** — secondary. Code blocks, tabular data values
  ("5 pts · attempt 1 of 3"), numeric status pills, token references
  in author chrome. Weights 400/500/700. Excellent tabular numerals;
  programming ligatures off by default.

Both load from Google Fonts with system fallbacks. The `@import url`
sits before local rules per CSS spec.

```css
@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap");
```

In CSS tokens:

- `--font-sans` → Poppins (the default — applied at `body`)
- `--font-mono` → JetBrains Mono

## The mark

The **register mark** — four construction/registration corners framing
a bold plus. It's the dashed add-block slot reduced to its corners: the
plus is the figure, the corners are the ground. The framed-but-empty
slot still reads as _"add the next block"_ — the mark embodies the
product mechanic without leaning on a filled 2×2 grid (Microsoft /
G Suite territory).

One hue throughout — navy on light, white on dark/navy — so it reduces
cleanly to a favicon and to single-ink stamps. The reserved brand
colours stay **out** of the mark: coral is destructive-only and teal is
success-only, so tinting the plus with either would misuse a semantic
signal.

| Element | Treatment                                             |
| ------- | ----------------------------------------------------- |
| Corners | Registration brackets, dashed, 50% opacity (the slot) |
| Plus    | Bold stroke, full strength (the add action)           |

**Keep the plus centred and dominant; keep the corners quiet.** The
framed-but-empty slot IS the brand — don't fill it, don't close it into
a full outline, don't tint the plus.

Available variants in [`mark/`](./mark/):

- `mark-light.svg` — light surfaces (navy)
- `mark-dark.svg` — dark surfaces (#0a0a0f) — white plus, corners white at 50%
- `mark-navy.svg` — navy surfaces (#161D77) — same as dark
- `mark-mono-black.svg` — single-ink stamps
- `mark-mono-white.svg` — single-ink dark stamps

### Small-size variant

At 16–22px the dashed corners get fuzzy. For favicon-tier contexts use
[`favicon/favicon-sm.svg`](./favicon/favicon-sm.svg) — the same mark
with solid, full-strength corners (no dashes). Accepted visual
difference at small sizes; preserves recognition.

## The wordmark

"scaffold." in Poppins 700, mark on the left. Trailing dot is **coral
on light + dark surfaces**, **teal on navy**. The dot is the one place
inside the wordmark where the brand colours peek through.

Available variants in [`wordmark/`](./wordmark/):

- `wordmark-light.svg`
- `wordmark-dark.svg`
- `wordmark-navy.svg`
- `wordmark-mono-black.svg`
- `wordmark-mono-white.svg`

## Brand-presence material

> **Under revision.** The glass-tile treatment below still renders the
> retired 2×2 block-stack. It needs reworking around the register mark
> (a frosted register on the aurora field) — tracked as a follow-up.

The dark splash refresh. Translucent block-stack tiles over a whisper
aurora — depth without breaking the flat-at-rest rule. Used on splash,
login, OG, marketing hero, design-system hero, dark wordmark lockup at
≥ 64px. Editor surfaces, favicons, and sub-64px marks stay flat.

Two ingredients, applied together:

- **Aurora field** — two soft radial gradients (navy hue 270 / 13–20%
  opacity; teal hue 175 / 10–13%), blurred 60px, with a darkening
  vignette. Whisper level, not stage lights.
- **Glass tiles** — each block of the mark gets `backdrop-filter:
blur(20px) saturate(150%)`, a hairline white border at 18% opacity,
  inset highlight top/bottom. The dashed slot stays dashed.

In code:

```tsx
<div className="sc-brand-surface">
  <Mark variant="material" size={140} />
</div>
```

Tokens live alongside the rest of the palette in
[`globals.css`](../packages/core/src/styles/globals.css):
`--color-brand-aurora-navy`, `--color-brand-aurora-teal`,
`--color-brand-material-border`,
`--color-brand-material-highlight-top`,
`--color-brand-material-highlight-bottom`.

Falls back to solid OKLCH fills under `prefers-reduced-transparency`;
aurora drift disabled under `prefers-reduced-motion`.

## Component vocabulary (high level)

- **CTAs** are always pill-shaped (`border-radius: 999px`)
- **Cards** are flat: hairline border, no shadow at rest, hover darkens border to ink
- **Pills/badges/tags** are pill-shaped + fill-only (no border)
- **Empty states** pair a mini mark with short copy — the brand moment that turns "nothing here" into "scaffold is a block editor" (the EmptyState motif is being migrated from the block-stack to the register mark)
- **Shadows** are reserved for true overlays only (popovers, modals, drag previews) — not at rest

React component primitives implementing all of this live at
[`packages/core/src/components/`](../packages/core/src/components/).

## Voice

Direct, calm, educator-respecting. No exclamation marks in chrome.
No emoji in UI strings. Lowercase for status chrome. Always specific
over abstract.

| ✅ Do                         | ❌ Don't                                      |
| ----------------------------- | --------------------------------------------- |
| "3 hotspots · partial credit" | "Customize your assessment experience!"       |
| "Add a hint"                  | "✨ Empower your learners with helpful hints" |
| "This block is graded."       | "Unlock powerful grading features."           |
| "Image URL not valid."        | "Oops! Something went wrong 😬"               |

Full do/don't grid in [`design-system.html`](./design-system.html#voice).

## What lives where

```
brand/
├── design-system.html        — canonical visual reference (open in browser)
├── DESIGN-SYSTEM.md          — this file
├── mark/                     — block-stack mark SVGs (5 surface variants)
├── wordmark/                 — mark + "scaffold." SVGs (5 surface variants)
├── logo/                     — wordmark-only + stacked lockups
├── favicon/                  — favicon SVG, apple-touch-icon SVG, manifest
└── social/                   — OG image (1200×630)
```

The React-side implementation (Mark + Wordmark components, design
tokens) lives in
[`packages/core/src/components/Mark.tsx`](../packages/core/src/components/Mark.tsx)
and
[`packages/core/src/styles/globals.css`](../packages/core/src/styles/globals.css)
respectively.

## Source of truth

- **Visual reference (the what):** `design-system.html` (this directory)
- **Tokens (the how):** `packages/core/src/styles/globals.css`
- **Primitives (the use):** `packages/core/src/components/`
