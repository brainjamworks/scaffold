import type { ChartBlockData } from "@/schemas/shared";

import { findCategoryAxis, isRecord } from "./axis-utils";
import { withInsidePan } from "./zoom";

/**
 * Cross-profile axis chrome: dimension names, tick-label visibility,
 * density-driven rotation, inside-pan + density chip. Bar / combo /
 * line / area / histogram all use the same primitives — coordinating
 * here means a single tweak propagates to every chart family.
 */

/** Band width below which category labels rotate 35°. */
const ROTATE_LABEL_BAND = 40;
/** Band width below which inside-pan engages and a density chip renders. */
const DENSE_BAND = 24;
/** Maximum categories shown when inside-pan is engaged. */
const VISIBLE_CATEGORY_BUDGET = 8;

export interface AxisChromeFlags {
  showAxisNames: boolean;
  showAxisLabels: boolean;
}

export function readAxisChromeFlags(chart: ChartBlockData): AxisChromeFlags {
  return {
    showAxisNames: chart.showAxisNames !== false,
    showAxisLabels: chart.showAxisLabels !== false,
  };
}

/**
 * Centred dimension name. X-axis: horizontal, sits below the tick
 * labels. Y-axis: rotated 90°, sits to the left of the tick labels.
 * The large `nameGap` for y keeps the rotated text outside the
 * tick-label column so they never fight for space.
 */
export function withAxisName(
  axis: Record<string, unknown>,
  name: string,
  orientation: "x" | "y",
): Record<string, unknown> {
  if (!name) return axis;
  const isY = orientation === "y";
  return {
    ...axis,
    name,
    nameLocation: "middle" as const,
    nameGap: isY ? 44 : 28,
    ...(isY ? { nameRotate: 90 } : {}),
    nameTextStyle: {
      color: "rgba(0, 0, 0, 0.55)",
      fontSize: 11,
      fontWeight: 600,
    },
  };
}

export function withHiddenLabels(axis: Record<string, unknown>): Record<string, unknown> {
  const existing = isRecord(axis["axisLabel"]) ? axis["axisLabel"] : {};
  return {
    ...axis,
    axisLabel: { ...existing, show: false },
    // Tick marks on a label-less axis read as visual noise.
    axisTick: { show: false },
  };
}

export function stripAxisName(axis: unknown): unknown {
  if (!isRecord(axis)) return axis;
  const next: Record<string, unknown> = { ...axis };
  delete next["name"];
  delete next["nameLocation"];
  delete next["nameGap"];
  delete next["nameRotate"];
  delete next["nameTextStyle"];
  return next;
}

export function gridLeftFor({
  hasName,
  hasLabels,
}: {
  hasName: boolean;
  hasLabels: boolean;
}): number {
  if (hasName) return 56;
  if (hasLabels) return 16;
  return 8;
}

export function gridBottomFor({
  hasName,
  hasLabels,
}: {
  hasName: boolean;
  hasLabels: boolean;
}): number {
  if (hasName) return 36;
  if (hasLabels) return 16;
  return 8;
}

/**
 * Compose a y-axis dimension name from one or more value columns.
 * Joins with ' / ' so the rotated label still reads at a glance. For
 * 4+ series the label gets long; the toggle is the escape hatch.
 * De-dupes labels so a column that appears in both bars + lines of a
 * combo doesn't render as "Actual / Actual".
 */
export function joinYLabel(columns: Array<{ label: string }>): string {
  if (columns.length === 0) return "";
  const unique: string[] = [];
  for (const column of columns) {
    const label = column.label ?? "";
    if (label && !unique.includes(label)) unique.push(label);
  }
  return unique.join(" / ");
}

/** Carry the value-axis unit only when every column shares it. */
export function sharedUnit(columns: Array<{ unit?: string | undefined }>): string | undefined {
  if (!columns.length) return undefined;
  const first = columns[0]?.unit;
  if (!first) return undefined;
  return columns.every((column) => column.unit === first) ? first : undefined;
}

/**
 * Reads the category-axis band width and shapes the chart accordingly:
 * - Roomy (≥40 band): no changes.
 * - Tight (24-40 band): rotate x-category labels 35°.
 * - Dense (<24 band): inside-pan + density chip.
 */
export function applyCategoryDensity(
  option: Record<string, unknown>,
  viewport: { width: number; height: number },
): Record<string, unknown> {
  const category = findCategoryAxis(option);
  if (!category) return option;
  const total = category.data.length;
  if (total <= 1) return option;
  const isXCategory = category.axis === "xAxis";
  const extent = isXCategory ? viewport.width - 64 : viewport.height - 64;
  const band = extent / total;

  let next = option;
  if (band < ROTATE_LABEL_BAND && band >= DENSE_BAND && isXCategory) {
    next = withAxisLabelRotate(next, category.axis, 35);
  }
  if (band < DENSE_BAND) {
    next = withInsidePan(next, true);
    next = withDensityChip(next, Math.min(total, VISIBLE_CATEGORY_BUDGET), total);
  }
  return next;
}

function withAxisLabelRotate(
  option: Record<string, unknown>,
  axis: "xAxis" | "yAxis",
  rotate: number,
): Record<string, unknown> {
  const target = isRecord(option[axis]) ? option[axis] : {};
  const existingLabel = isRecord(target["axisLabel"]) ? target["axisLabel"] : {};
  return {
    ...option,
    [axis]: {
      ...target,
      axisLabel: { ...existingLabel, rotate },
    },
  };
}

/**
 * Bottom-right density chip rendered via the `graphic` component.
 * Discoverability for inside-pan: without it, users don't realise
 * there's more data than what's visible.
 */
function withDensityChip(
  option: Record<string, unknown>,
  visible: number,
  total: number,
): Record<string, unknown> {
  if (visible >= total) return option;
  const existing = Array.isArray(option["graphic"]) ? option["graphic"] : [];
  return {
    ...option,
    graphic: [
      ...existing,
      {
        type: "text",
        right: 8,
        bottom: 4,
        z: 100,
        silent: true,
        style: {
          text: `Showing ${visible} of ${total} — scroll`,
          fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
          fontSize: 10,
          fill: "rgba(0, 0, 0, 0.45)",
        },
      },
    ],
  };
}
