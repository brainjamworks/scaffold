import type { ComboChartEncoding } from "@/schemas/shared";

import {
  applyCategoryDensity,
  gridBottomFor,
  gridLeftFor,
  joinYLabel,
  readAxisChromeFlags,
  sharedUnit,
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
  numberCell,
  requireColumn,
  stringifyCell,
  valueAxisDefaults,
} from "./shared";

export const comboChartProfile: ChartProfile<ComboChartEncoding> = {
  chartType: "combo",
  createDefaultEncoding(source) {
    const { categoryColumn, numberColumns, valueColumn } = getDefaultChartColumns(source);
    const barColumn = numberColumns[0] ?? valueColumn;
    const lineColumn = numberColumns[1] ?? numberColumns[0] ?? valueColumn;
    return {
      bars: [{ columnId: barColumn.id }],
      chartType: "combo",
      lines: [{ columnId: lineColumn.id }],
      x: { columnId: categoryColumn.id },
    };
  },
  compile(chart, encoding) {
    const source = chart.data;
    const barColumns = encoding.bars.map((ref) => requireColumn(source, ref.columnId));
    const lineColumns = encoding.lines.map((ref) => requireColumn(source, ref.columnId));
    const allYColumns = [...barColumns, ...lineColumns];
    if (isEmptyData(source, allYColumns)) {
      return emptyStateOption(chart);
    }
    const xColumn = requireColumn(source, encoding.x.columnId);
    const categories = source.rows.map((row) => stringifyCell(row.cells[xColumn.id]));
    // Combo plots bars + lines on a single shared value axis. Unit
    // only carries through when both encode the same dimension —
    // mixed-unit combos (e.g. count + percentage) drop the suffix
    // to avoid implying false equivalence between series.
    const unit = sharedUnit(allYColumns);
    const { showAxisNames, showAxisLabels } = readAxisChromeFlags(chart);
    const categoryName = showAxisNames ? xColumn.label : "";
    const valueName = showAxisNames ? joinYLabel(allYColumns) : "";

    const xAxis = withAxisName(categoryAxisDefaults(categories), categoryName, "x");
    const yAxis = withAxisName(valueAxisDefaults(unit), valueName, "y");

    return {
      ...baseOption(chart, "axis"),
      grid: {
        top: chartHeaderReserve(chart).gridTop,
        right: 16,
        bottom: gridBottomFor({
          hasName: Boolean(categoryName),
          hasLabels: showAxisLabels,
        }),
        left: gridLeftFor({
          hasName: Boolean(valueName),
          hasLabels: showAxisLabels,
        }),
        ...cartesianGridLabelBounds(),
      },
      xAxis: showAxisLabels ? xAxis : withHiddenLabels(xAxis),
      yAxis: showAxisLabels ? yAxis : withHiddenLabels(yAxis),
      series: [
        ...barColumns.map((column) => ({
          name: column.label,
          type: "bar",
          barMinWidth: 4,
          data: source.rows.map((row) => numberCell(row.cells[column.id])),
        })),
        ...lineColumns.map((column) => ({
          name: column.label,
          type: "line",
          data: source.rows.map((row) => numberCell(row.cells[column.id])),
          smooth: true,
        })),
      ],
    };
  },
  responsive(option, viewport) {
    // Unlike bar, combo doesn't flip — a horizontal combo with a
    // line series reads as two unrelated charts overlapped. We keep
    // vertical and rely on the category-density rules (rotate at
    // 24-40px band, inside-pan + chip below).
    return applyCategoryDensity(option, viewport);
  },
};
