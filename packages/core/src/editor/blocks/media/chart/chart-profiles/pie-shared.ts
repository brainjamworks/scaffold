import type { ChartBlockData } from "@/schemas/shared";

import { isRecord } from "./axis-utils";
import { chartHeaderReserve } from "./shared";

/**
 * Pie/donut chrome shared between the two profiles. Layout is so
 * close that splitting the helpers stays cleaner than two near-clone
 * compile functions.
 */

const JETBRAINS_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";
/** Minimum segment percent that still earns an in-circle label. */
const SMALL_SEGMENT_PERCENT_CUTOFF = 8;
/** Below this rendered radius the pie can't accommodate any labels. */
const NO_LABEL_RADIUS_THRESHOLD = 44;
/** Reserve when legend sits at the bottom (single-row scroll). */
const LEGEND_BOTTOM_RESERVE = 32;
/** Scroll legend bottom inset within its reserve band. */
const LEGEND_BOTTOM_INSET = 8;

/** Default centre + radius used at compile time (canvas size unknown). */
export const DEFAULT_PIE_RADIUS = "68%";
export const DEFAULT_DONUT_RADIUS: [string, string] = ["40%", "72%"];

export function defaultPieCenter(chart: ChartBlockData): [string, string] {
  return ["50%", chart.title || chart.subtitle ? "56%" : "50%"];
}

/**
 * Full label set with brand-mono percentage chip — used at wider
 * canvases where the leader lines have room to breathe.
 */
export function pieRichLabel(): Record<string, unknown> {
  return {
    formatter: "{name|{b}}\n{percent|{d}%}",
    lineHeight: 16,
    rich: {
      name: { fontSize: 12, fontWeight: 500, color: "inherit" },
      percent: {
        fontFamily: JETBRAINS_MONO,
        fontSize: 11,
        fontWeight: 500,
        color: "inherit",
        padding: [2, 0, 0, 0],
      },
    },
  };
}

/**
 * Viewport-aware pie/donut layout. Computes pixel centre + radius so
 * the slice never overlaps the title/subtitle/legend header stack —
 * percentage layouts ignore the fixed-pixel header, so at small
 * canvases the pie crashes into the chrome.
 *
 * Also picks the right label strategy:
 * - Wide enough (≥320 width) → keep authored rich labels.
 * - Narrow → inside %-only for segments ≥8%.
 * - Cramped (radius < 44px) → drop all labels; legend + tooltip carry meaning.
 */
export function pieResponsive(
  option: Record<string, unknown>,
  viewport: { width: number; height: number },
  chart: Pick<ChartBlockData, "title" | "subtitle" | "showLegend">,
  variant: "pie" | "donut",
): Record<string, unknown> {
  // For pie/donut we only reserve top space when there's actually a
  // title or subtitle to render — `chartHeaderReserve` always returns
  // 12px minimum for grid-based charts, but pie doesn't need that
  // padding when the canvas is otherwise empty above. Same below: only
  // reserve room when a legend is present.
  const hasTitle = Boolean(chart.title);
  const hasSubtitle = Boolean(chart.subtitle);
  const headerTop =
    hasTitle || hasSubtitle ? chartHeaderReserve(chart as ChartBlockData).gridTop : 0;
  const hasLegend = isRecord(option["legend"]) && option["legend"]["show"] !== false;
  const bottomReserve = hasLegend ? LEGEND_BOTTOM_RESERVE : 0;
  const availableHeight = Math.max(0, viewport.height - headerTop - bottomReserve);
  const availableWidth = Math.max(0, viewport.width - 32);
  const diameter = Math.max(0, Math.min(availableHeight, availableWidth) - 8);
  const radius = Math.max(0, diameter / 2);
  const centerX = Math.round(viewport.width / 2);
  const centerY = Math.round(headerTop + availableHeight / 2);

  const radiusOption =
    variant === "donut" ? [Math.round(radius * 0.55), Math.round(radius)] : Math.round(radius);

  const legendOption = hasLegend
    ? {
        ...(option["legend"] as Record<string, unknown>),
        // type: 'scroll' keeps the legend on a single row with
        // pagination arrows when it overflows — never wraps under
        // (or into) the slice at narrow widths.
        type: "scroll" as const,
        orient: "horizontal" as const,
        bottom: LEGEND_BOTTOM_INSET,
        left: "center",
        top: undefined,
      }
    : option["legend"];

  return {
    ...option,
    legend: legendOption,
    series: (Array.isArray(option["series"]) ? option["series"] : []).map((entry) => {
      if (!isRecord(entry) || entry["type"] !== "pie") return entry;
      const useOuterLabels =
        !hasLegend && radius >= NO_LABEL_RADIUS_THRESHOLD && viewport.width >= 320;
      return {
        ...entry,
        radius: radiusOption,
        center: [centerX, centerY],
        label: labelForState(radius, useOuterLabels),
        labelLine: useOuterLabels ? entry["labelLine"] : { show: false },
      };
    }),
  };
}

/**
 * Label strategy:
 * - Cramped radius (<44px) → no labels; legend + tooltip carry meaning.
 * - Outer rich labels only when there's no legend AND the canvas is
 *   wide enough for leader-line breathing room. With a legend on,
 *   names are already covered there and outer labels punch through
 *   the bottom legend band.
 * - Otherwise inside %-only for segments ≥8%.
 */
function labelForState(radius: number, useOuterLabels: boolean): Record<string, unknown> {
  if (radius < NO_LABEL_RADIUS_THRESHOLD) {
    return { show: false };
  }
  if (useOuterLabels) {
    return pieRichLabel();
  }
  return {
    show: true,
    position: "inside",
    color: "#fff",
    fontFamily: JETBRAINS_MONO,
    fontSize: 11,
    fontWeight: 600,
    formatter: (params: { percent?: number }) =>
      (params.percent ?? 0) >= SMALL_SEGMENT_PERCENT_CUTOFF
        ? `${(params.percent ?? 0).toFixed(0)}%`
        : "",
  };
}

/**
 * Reconstruct the title/subtitle/legend flags the `pieResponsive`
 * helper needs from a compiled option. Used by pie.ts and donut.ts
 * since `responsive()` doesn't receive the raw chart.
 */
export function extractCurrentChart(
  option: Record<string, unknown>,
): Pick<ChartBlockData, "title" | "subtitle" | "showLegend"> {
  const title = isRecord(option["title"]) ? option["title"] : null;
  const legend = isRecord(option["legend"]) ? option["legend"] : null;
  return {
    title: (title?.["text"] as string | undefined) ?? "",
    subtitle: (title?.["subtext"] as string | undefined) ?? "",
    showLegend: legend?.["show"] === true,
  } as Pick<ChartBlockData, "title" | "subtitle" | "showLegend">;
}
