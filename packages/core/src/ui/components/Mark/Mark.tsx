import { cn } from "@/lib/cn";

import "./Mark.css";

/* ─── Brand triple (single source of truth for the mark) ──────────
 * OKLCH-tuned per brand/DESIGN-SYSTEM.md. sRGB hex used here so the SVG renders consistently in
 * environments that don't resolve OKLCH (older mail clients, raster
 * exports). */
const BRAND_NAVY = "#161d77"; // oklch(0.30 0.15 270)
const BRAND_TEAL = "#00ba92"; // oklch(0.68 0.18 175)
const BRAND_CORAL = "#f43a57"; // oklch(0.64 0.22 18)

interface MarkProps {
  /**
   * Surface the mark sits on. The register mark is one hue throughout:
   * navy on light surfaces, white on dark/navy. The plus stays full
   * strength; the registration corners drop to 50% opacity.
   */
  surface?: "light" | "dark" | "navy";
  /**
   * Visual variant. `flat` is the default — solid tiles, SVG-rendered,
   * works at any size including favicon. `material` is the brand-
   * presence treatment — translucent glass tiles over an aurora field,
   * rendered as HTML divs with backdrop-filter. Use `material` only
   * on dark splash / login / OG / marketing hero surfaces at ≥ 64px.
   */
  variant?: "flat" | "material";
  /** Pixel size (width = height). */
  size?: number;
  /**
   * Show the plus at the centre of the mark. Defaults to true — the
   * plus is the figure and survives at any size. Pass `false` only for
   * the rare frame-only treatment.
   */
  showPlus?: boolean;
  /**
   * Use the simplified small-size variant — solid, full-strength
   * corners (no dashes). Auto-enabled below 22px because dashes don't
   * render cleanly that small.
   */
  smallVariant?: boolean;
  className?: string;
}

/**
 * The register brand mark — four construction/registration corners
 * (the dashed add-slot reduced to its corners) framing a bold plus.
 *
 * The mark still embodies the product mechanic: scaffold is a block
 * editor, and the empty framed slot reads as "add the next block." The
 * plus is the figure, the corners are the ground. One hue throughout,
 * so it reduces cleanly to a favicon and to single-ink stamps.
 *
 * Default `flat` variant renders as inline SVG; `material` renders
 * HTML divs with backdrop-filter for brand-presence surfaces.
 *
 * NOTE: the `material` glass-tile variant below still renders the
 * retired 2×2 block-stack. Its aurora/glass brand-presence treatment
 * needs its own reimagining against the register mark — tracked as a
 * follow-up, not auto-converted here. Same for the EmptyState motif.
 *
 * Used in:
 *   1. Editor topbar wordmark (flat, small)
 *   2. Brand-presence surfaces (material when ≥64px on dark)
 *   3. Empty-state moments inside composite blocks (flat, via EmptyState)
 *   4. Favicon family (flat SVG, sub-22px → smallVariant)
 */
export function Mark({
  surface = "light",
  variant = "flat",
  size = 32,
  showPlus,
  smallVariant,
  className,
}: MarkProps) {
  if (variant === "material") {
    const materialProps: MarkMaterialProps = { size };
    if (showPlus !== undefined) materialProps.showPlus = showPlus;
    if (className !== undefined) materialProps.className = className;
    return <MarkMaterial {...materialProps} />;
  }

  // Below 22px the dashed corners blur — swap to a solid, full-strength
  // frame. The plus is the figure and is always drawn (unless explicitly
  // suppressed) because it survives reduction where the frame doesn't.
  const useSmall = smallVariant ?? size < 22;
  const showPlusResolved = showPlus ?? true;

  // Surface-driven colour. The whole register mark is one hue: navy on
  // light, white on dark/navy. Hierarchy comes from stroke weight (plus)
  // and opacity (corners), not colour.
  const isDark = surface === "dark" || surface === "navy";
  const strokeColor = isDark ? "#FFFFFF" : BRAND_NAVY;

  return (
    <svg
      role="img"
      aria-label="scaffold mark"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("sc-mark", className)}
    >
      <title>scaffold</title>
      {/* Registration corners — the dashed add-slot reduced to its four
          construction corners (the ground). Dashed at normal sizes;
          solid + full-strength below 22px where dashes blur. */}
      <path
        d="M5 24V5h19M40 5h19v19M59 40v19H40M24 59H5V40"
        fill="none"
        stroke={strokeColor}
        strokeWidth={useSmall ? 2.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(useSmall ? {} : { strokeDasharray: "3 3" })}
        opacity={useSmall ? 1 : 0.5}
      />

      {/* Plus — the figure. Always the strongest element in the mark. */}
      {showPlusResolved && (
        <path
          d="M32 18v28M18 32h28"
          fill="none"
          stroke={strokeColor}
          strokeWidth={useSmall ? 4.5 : 4.25}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * Material variant — translucent block tiles rendered over the brand
 * aurora field. Used only on dark brand-presence surfaces (splash,
 * login, OG, marketing hero, design-system hero).
 *
 * Built from HTML divs because backdrop-filter is the load-bearing
 * effect and SVG can't express it. Parent surface should already paint
 * the aurora gradient backdrop (see BrandSplash / splash CSS).
 *
 * Respects `prefers-reduced-transparency`: tiles fall back to solid
 * fills via the @media rule on `.sc-mark-material`.
 */
interface MarkMaterialProps {
  size: number;
  showPlus?: boolean;
  className?: string;
}

function MarkMaterial({ size, showPlus, className }: MarkMaterialProps) {
  const showPlusResolved = showPlus ?? size >= 24;
  const tileGap = Math.max(4, Math.round(size * 0.05));
  const tileRadius = Math.max(4, Math.round(size * 0.07));

  return (
    <div
      role="img"
      aria-label="scaffold mark"
      className={cn("sc-mark-material", className)}
      style={
        {
          "--mk-size": `${size}px`,
          "--mk-gap": `${tileGap}px`,
          "--mk-radius": `${tileRadius}px`,
        } as React.CSSProperties
      }
    >
      <span className="sc-mark-tile sc-mark-tile--tl" />
      <span className="sc-mark-tile sc-mark-tile--slot">
        {showPlusResolved && (
          <svg
            viewBox="0 0 24 24"
            width="40%"
            height="40%"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </span>
      <span className="sc-mark-tile sc-mark-tile--bl" />
      <span className="sc-mark-tile sc-mark-tile--br" />
    </div>
  );
}

interface WordmarkProps {
  surface?: "light" | "dark" | "navy";
  /** Visual variant for the inner mark. Defaults to `flat`. */
  variant?: "flat" | "material";
  /** Show the mark to the left of the wordmark. Defaults to true. */
  showMark?: boolean;
  /** Pixel size of the mark (when shown). Wordmark size scales with this. */
  markSize?: number;
  className?: string;
}

/**
 * The full lockup: Mark + "scaffold." wordmark in Poppins 700. The
 * trailing dot is coral on light + dark surfaces, teal on navy.
 */
export function Wordmark({
  surface = "light",
  variant = "flat",
  showMark = true,
  markSize = 28,
  className,
}: WordmarkProps) {
  // Wordmark font size scales with mark size to keep visual balance.
  const fontSize = Math.round(markSize * 0.62);
  const isDark = surface === "dark" || surface === "navy";
  const typeColor = isDark ? "#FFFFFF" : "#18181B";
  // Coral dot on light + dark; teal dot on navy (coral would clash).
  const dotColor = surface === "navy" ? BRAND_TEAL : BRAND_CORAL;

  return (
    <span className={cn("sc-wordmark", className)} data-scaffold-wordmark="">
      {showMark && <Mark surface={surface} variant={variant} size={markSize} />}
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 700,
          fontSize: `${fontSize}px`,
          letterSpacing: "-0.025em",
          color: typeColor,
          lineHeight: 1,
        }}
      >
        scaffold<span style={{ color: dotColor }}>.</span>
      </span>
    </span>
  );
}
