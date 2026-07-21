import type { BarChartEncoding } from "@/schemas/shared";

import { isAxisRecordOfType, isRecord } from "./axis-utils";
import {
  applyCategoryDensity,
  gridBottomFor,
  gridLeftFor,
  joinYLabel,
  readAxisChromeFlags,
  sharedUnit,
  stripAxisName,
  withAxisName,
  withHiddenLabels,
} from "./axis-styling";
import { emptyStateOption, isEmptyData } from "./empty-state";
import type { ChartProfile } from "./types";
import {
  baseOption,
  cartesianGridLabelBounds,
  categoryAxisDefaults,
  chartHeaderReserve,
  getDefaultChartColumns,
  getDefaultYSeries,
  numberCell,
  requireColumn,
  stringifyCell,
  valueAxisDefaults,
} from "./shared";

const COMPACT_BAR_WIDTH = 520;

export const barChartProfile: ChartProfile<BarChartEncoding> = {
  chartType: "bar",
  createDefaultEncoding(source) {
    const { categoryColumn } = getDefaultChartColumns(source);
    return {
      chartType: "bar",
      orientation: "vertical",
      stacked: false,
      x: { columnId: categoryColumn.id },
      y: getDefaultYSeries(source),
    };
  },
  compile(chart, encoding) {
    const source = chart.data;
    const yColumns = encoding.y.map((ref) => requireColumn(source, ref.columnId));
    if (isEmptyData(source, yColumns)) {
      return emptyStateOption(chart);
    }
    const xColumn = requireColumn(source, encoding.x.columnId);
    const categories = source.rows.map((row) => stringifyCell(row.cells[xColumn.id]));
    const horizontal = encoding.orientation === "horizontal";
    const unit = sharedUnit(yColumns);
    const { showAxisNames, showAxisLabels } = readAxisChromeFlags(chart);
    const categoryName = showAxisNames ? xColumn.label : "";
    const valueName = showAxisNames ? joinYLabel(yColumns) : "";
    const series = yColumns.map((column, index) => {
      const isLastStackSegment = !encoding.stacked || index === yColumns.length - 1;
      const itemStyleOverride: { borderRadius: number | number[] } | null = encoding.stacked
        ? isLastStackSegment
          ? { borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] }
          : { borderRadius: 0 }
        : horizontal
          ? { borderRadius: [0, 6, 6, 0] }
          : null;
      return {
        name: column.label,
        type: "bar",
        barMinWidth: 4,
        data: source.rows.map((row) => numberCell(row.cells[column.id])),
        ...(encoding.stacked ? { stack: "total" } : {}),
        ...(itemStyleOverride ? { itemStyle: itemStyleOverride } : {}),
      };
    });

    const xAxis = horizontal
      ? withAxisName(valueAxisDefaults(unit), valueName, "x")
      : withAxisName(categoryAxisDefaults(categories), categoryName, "x");
    const yAxis = horizontal
      ? withAxisName(categoryAxisDefaults(categories), categoryName, "y")
      : withAxisName(valueAxisDefaults(unit), valueName, "y");

    return {
      ...baseOption(chart, "axis"),
      grid: {
        top: chartHeaderReserve(chart).gridTop,
        right: 16,
        bottom: gridBottomFor({
          hasName: Boolean(categoryName) || Boolean(valueName && horizontal),
          hasLabels: showAxisLabels,
        }),
        left: gridLeftFor({
          hasName: Boolean(valueName) || Boolean(categoryName && horizontal),
          hasLabels: showAxisLabels,
        }),
        ...cartesianGridLabelBounds(),
      },
      xAxis: showAxisLabels ? xAxis : withHiddenLabels(xAxis),
      yAxis: showAxisLabels ? yAxis : withHiddenLabels(yAxis),
      series,
    };
  },
  responsive(option, viewport) {
    // Vertical bars become unreadable when categories crowd horizontally;
    // flip to horizontal below COMPACT_BAR_WIDTH (FT / Datawrapper pattern).
    const compact = viewport.width < COMPACT_BAR_WIDTH;
    const flipped = compact && isVerticalBarOption(option) ? flipToHorizontal(option) : option;
    return applyCategoryDensity(flipped, viewport);
  },
};

function flipToHorizontal(option: Record<string, unknown>): Record<string, unknown> {
  // The rotated y-axis name would land on top of the vertical category
  // rows post-flip, and the x-axis name would squeeze the value-tick
  // band. Strip both — the chart title carries the dimensions in
  // compact mode.
  return {
    ...option,
    grid: {
      ...(isRecord(option["grid"]) ? option["grid"] : {}),
      left: 16,
      bottom: 24,
    },
    xAxis: stripAxisName(option["yAxis"]),
    yAxis: stripAxisName(option["xAxis"]),
    series: Array.isArray(option["series"])
      ? option["series"].map(rotateBarRadius)
      : option["series"],
  };
}

/**
 * Rotate a bar series' top-corner radius into right-corner radius
 * after a vertical→horizontal flip. Preserves `borderRadius: 0` for
 * inner stack segments and pulls the theme default forward when no
 * explicit radius was set.
 */
function rotateBarRadius(series: unknown): unknown {
  if (!isRecord(series) || series["type"] !== "bar") return series;
  const existing = isRecord(series["itemStyle"]) ? series["itemStyle"] : null;
  if (existing?.["borderRadius"] === 0) return series;
  return {
    ...series,
    itemStyle: { ...(existing ?? {}), borderRadius: [0, 6, 6, 0] },
  };
}

function isVerticalBarOption(option: Record<string, unknown>): boolean {
  if (!isAxisRecordOfType(option["xAxis"], "category")) return false;
  if (!isAxisRecordOfType(option["yAxis"], "value")) return false;
  return Array.isArray(option["series"])
    ? option["series"].some((series) => isRecord(series) && series["type"] === "bar")
    : false;
}
