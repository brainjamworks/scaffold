import { findCategoryAxis } from "./axis-utils";

/**
 * Shared inside-pan helper for line / area / combo / bar (dense).
 * Adds a touch/scroll-driven zoom-and-pan without rendering a slider —
 * the slider chrome eats more pixels than the categories it would
 * gate at scaffold's small-canvas convention (per Datawrapper /
 * Observable Plot).
 */
const DENSE_CATEGORY_THRESHOLD = 8;
const COMPACT_DENSE_CATEGORY_THRESHOLD = 5;

export function withInsidePan(
  option: Record<string, unknown>,
  compact: boolean,
): Record<string, unknown> {
  if (option["dataZoom"] !== undefined) return option;
  const categoryAxis = findCategoryAxis(option);
  if (!categoryAxis) return option;
  const threshold = compact ? COMPACT_DENSE_CATEGORY_THRESHOLD : DENSE_CATEGORY_THRESHOLD;
  const total = categoryAxis.data.length;
  if (total <= threshold) return option;
  const visibleCount = Math.min(total, threshold);
  const start = Math.max(0, Math.round(100 - (visibleCount / total) * 100));
  return {
    ...option,
    dataZoom: [
      {
        type: "inside",
        filterMode: "weakFilter",
        start,
        end: 100,
        ...(categoryAxis.axis === "xAxis" ? { xAxisIndex: 0 } : { yAxisIndex: 0 }),
      },
    ],
  };
}
