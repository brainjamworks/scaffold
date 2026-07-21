import type { HeatmapChartEncoding } from "@/schemas/shared";

import {
  gridBottomFor,
  gridLeftFor,
  readAxisChromeFlags,
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
} from "./shared";

/** Pixel height reserved for the horizontal visualMap above the grid. */
const VISUAL_MAP_RESERVE = 44;

export const heatmapChartProfile: ChartProfile<HeatmapChartEncoding> = {
  chartType: "heatmap",
  createDefaultEncoding(source) {
    const { categoryColumn, valueColumn } = getDefaultChartColumns(source);
    const categoryColumns = source.columns.filter((column) => column.valueType === "category");
    const xColumn = categoryColumns[0] ?? categoryColumn;
    const yColumn = categoryColumns[1] ?? categoryColumns[0] ?? categoryColumn;
    return {
      chartType: "heatmap",
      x: { columnId: xColumn.id },
      y: { columnId: yColumn.id },
      value: { columnId: valueColumn.id },
    };
  },
  compile(chart, encoding) {
    const source = chart.data;
    const valueColumn = requireColumn(source, encoding.value.columnId);
    if (isEmptyData(source, [valueColumn])) {
      return emptyStateOption(chart);
    }
    const xColumn = requireColumn(source, encoding.x.columnId);
    const yColumn = requireColumn(source, encoding.y.columnId);
    const xCategories = uniqueValues(
      source.rows.map((row) => stringifyCell(row.cells[xColumn.id])),
    );
    const yCategories = uniqueValues(
      source.rows.map((row) => stringifyCell(row.cells[yColumn.id])),
    );
    const xIndexByValue = new Map(xCategories.map((value, index) => [value, index]));
    const yIndexByValue = new Map(yCategories.map((value, index) => [value, index]));
    const data = source.rows
      .map((row) => {
        const xValue = stringifyCell(row.cells[xColumn.id]);
        const yValue = stringifyCell(row.cells[yColumn.id]);
        const xIndex = xIndexByValue.get(xValue);
        const yIndex = yIndexByValue.get(yValue);
        if (xIndex === undefined || yIndex === undefined) return null;
        return [xIndex, yIndex, numberCell(row.cells[valueColumn.id])];
      })
      .filter((point): point is [number, number, number] => point !== null);
    const values = data.map((point) => point[2]);

    const { showAxisNames, showAxisLabels } = readAxisChromeFlags(chart);
    const xName = showAxisNames ? xColumn.label : "";
    const yName = showAxisNames ? yColumn.label : "";
    const headerTop = chartHeaderReserve(chart).gridTop;

    // Both axes are category — wider labels than a value axis. Push
    // the rotated y-name further out (nameGap 72 vs the default 44)
    // and bump the bottom x-name gap so they clear category labels
    // instead of landing on top of them. Grid reserves enlarge in
    // turn so the names fit inside the canvas.
    const xAxis = applyCategoryAxisName(
      withAxisName(categoryAxisDefaults(xCategories), xName, "x"),
    );
    const yAxis = applyCategoryAxisName(
      withAxisName(categoryAxisDefaults(yCategories), yName, "y"),
    );

    return {
      ...baseOption(chart, "item"),
      grid: {
        // VisualMap claims a horizontal band above the plot (per
        // Observable Plot / Datawrapper top-legend convention) so it
        // doesn't collide with the bottom x-axis labels.
        top: headerTop + VISUAL_MAP_RESERVE,
        right: 16,
        bottom: xName ? 52 : gridBottomFor({ hasName: false, hasLabels: showAxisLabels }),
        left: yName ? 84 : gridLeftFor({ hasName: false, hasLabels: showAxisLabels }),
        ...cartesianGridLabelBounds(),
      },
      xAxis: showAxisLabels ? xAxis : withHiddenLabels(xAxis),
      yAxis: showAxisLabels ? yAxis : withHiddenLabels(yAxis),
      visualMap: {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        calculable: true,
        orient: "horizontal",
        top: headerTop,
        right: 12,
        itemWidth: 8,
        itemHeight: 96,
        textGap: 6,
        // Default echarts handle is a heavy custom pill at 120% size
        // that dominates the gradient bar. A small navy circle reads
        // as a quiet draggable affordance and matches the brand chip
        // family used elsewhere in the editor.
        handleIcon: "circle",
        handleSize: 12,
        indicatorIcon: "circle",
        indicatorSize: 10,
      },
      series: [
        {
          name: valueColumn.label,
          type: "heatmap",
          data,
          label: { show: false },
        },
      ],
    };
  },
};

/**
 * Heatmap axes are both category, which means wider tick labels than
 * a value-axis. Push the dimension name further out so it clears the
 * label band; the per-chart grid insets are bumped to match.
 */
function applyCategoryAxisName(axis: Record<string, unknown>) {
  if (!axis["name"]) return axis;
  const isY = axis["nameRotate"] === 90;
  return { ...axis, nameGap: isY ? 72 : 40 };
}

function uniqueValues(values: string[]): string[] {
  return values.filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}
