# brand/

Brand assets for scaffold. Self-contained — no build step, no
node_modules, no dependencies. Everything here renders standalone.

## Quick links

- **[`design-system.html`](./design-system.html)** — full visual
  reference. Open in any browser.
- **[`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md)** — short markdown
  summary of the identity.

## Asset layout

```
brand/
├── design-system.html        canonical visual reference
├── DESIGN-SYSTEM.md          summary + how-to-use
├── README.md                 this file
│
├── mark/                     just the block-stack mark
│   ├── mark-light.svg
│   ├── mark-dark.svg
│   ├── mark-navy.svg
│   ├── mark-mono-black.svg
│   └── mark-mono-white.svg
│
├── wordmark/                 mark + "scaffold." lockup
│   ├── wordmark-light.svg
│   ├── wordmark-dark.svg
│   ├── wordmark-navy.svg
│   ├── wordmark-mono-black.svg
│   └── wordmark-mono-white.svg
│
├── logo/                     other lockups
│   ├── wordmark-only-light.svg
│   ├── wordmark-only-dark.svg
│   ├── lockup-stacked-light.svg
│   └── lockup-stacked-dark.svg
│
├── favicon/                  app icons
│   ├── favicon.svg           modern browsers — full mark with dashed slot + plus
│   ├── favicon-sm.svg        small-size variant (≤22px) — solid outline, no plus
│   ├── apple-touch-icon.svg  iOS / Android home-screen
│   └── site.webmanifest      PWA manifest (references both favicon variants)
│
└── social/                   social cards
    └── og-image.svg          1200×630 OG image (dark surface)
```

## Picking the right variant

- **Light background (white, canvas, gray-50)** → `-light.svg`
- **Dark background (near-black #0a0a0f)** → `-dark.svg`
- **Navy background (#161D77)** → `-navy.svg`
- **Single-ink contexts** (stamps, fax, embossing) → `-mono-black.svg` or `-mono-white.svg`

## Mark vs wordmark vs logo

| When                                                            | Use                         |
| --------------------------------------------------------------- | --------------------------- |
| Favicon, small app icon, OG corner badge                        | `mark/`                     |
| Marketing header, splash, document home, README                 | `wordmark/`                 |
| Stacked context (avatar, app icon settings, badge)              | `logo/lockup-stacked-*.svg` |
| Inside another branded chrome where the mark would be redundant | `logo/wordmark-only-*.svg`  |

## Fonts in SVG

The wordmark SVGs reference `Poppins` via `font-family` with a
system-ui fallback. This works in modern browsers when Poppins is
loaded (e.g. via Google Fonts on the host page) but falls back to
the OS sans-serif otherwise. For pixel-perfect rendering in
environments where Poppins isn't available (PDF export, third-party
embedders), run a text-to-paths conversion via a separate tool
(e.g. `inkscape --export-text-to-path`, or a service like
[fontello](https://fontello.com/) / [SVG font fixer](https://github.com/zerodevx/svg-font-fixer)).

## Generating PNG / ICO

Browsers prefer SVG favicons. If a context requires PNG or ICO (legacy
browsers, certain CMS uploaders), rasterise the SVG with any of:

```bash
# Inkscape (best fidelity)
inkscape favicon/favicon.svg --export-type=png --export-width=32 -o favicon-32.png

# rsvg-convert
rsvg-convert favicon/favicon.svg -w 32 -h 32 -o favicon-32.png

# ImageMagick
convert -background none -density 600 favicon/favicon.svg -resize 32x32 favicon-32.png
```

PNG / ICO outputs are intentionally NOT checked in — they're build
artefacts, generated on demand.

## Do / don't

✅ Use the provided SVG assets unmodified
✅ Pick the right surface variant for the background you're placing it on
✅ Maintain ≥ 1 square width of clear space around the mark
✅ For dark backgrounds, use the `-dark.svg` variant (not the light one with a manual filter)
✅ For sub-22px contexts use `favicon-sm.svg` (solid outline, no plus icon)

❌ Don't fill the empty top-right slot — the dashed outline is the point
❌ Don't apply a gradient to the mark or wordmark — gradient is dead
❌ Don't reorder, rotate, or recolour the three filled blocks
❌ Don't use the dashed mark at sub-22px sizes — switch to the small variant
❌ Don't add drop shadows, outlines, or glow effects
❌ Don't stretch the wordmark non-proportionally
❌ Don't place on busy or low-contrast backgrounds
