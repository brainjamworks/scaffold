import type { ScatterChartEncoding } from "@/schemas/shared";

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
  chartHeaderReserve,
  getDefaultChartColumns,
  numberCell,
  requireColumn,
  valueAxisDefaults,
} from "./shared";

export const scatterChartProfile: ChartProfile<ScatterChartEncoding> = {
  chartType: "scatter",
  createDefaultEncoding(source) {
    const { numberColumns, valueColumn } = getDefaultChartColumns(source);
    const xColumn = numberColumns[0] ?? valueColumn;
    const yColumn = numberColumns[1] ?? numberColumns[0] ?? valueColumn;
    return {
      chartType: "scatter",
      x: { columnId: xColumn.id },
      y: { columnId: yColumn.id },
    };
  },
  compile(chart, encoding) {
    const source = chart.data;
    const xColumn = requireColumn(source, encoding.x.columnId);
    const yColumn = requireColumn(source, encoding.y.columnId);
    if (isEmptyData(source, [xColumn, yColumn])) {
      return emptyStateOption(chart);
    }
    const { showAxisNames, showAxisLabels } = readAxisChromeFlags(chart);
    // Both axes are value with no inherent dimension — names matter
    // most on scatter. X = independent variable, Y = response.
    const xName = showAxisNames ? xColumn.label : "";
    const yName = showAxisNames ? yColumn.label : "";

    const xAxis = withAxisName(valueAxisDefaults(xColumn.unit), xName, "x");
    const yAxis = withAxisName(valueAxisDefaults(yColumn.unit), yName, "y");

    return {
      ...baseOption(chart, "item"),
      grid: {
        top: chartHeaderReserve(chart).gridTop,
        right: 16,
        bottom: gridBottomFor({
          hasName: Boolean(xName),
          hasLabels: showAxisLabels,
        }),
        left: gridLeftFor({
          hasName: Boolean(yName),
          hasLabels: showAxisLabels,
        }),
        ...cartesianGridLabelBounds(),
      },
      xAxis: showAxisLabels ? xAxis : withHiddenLabels(xAxis),
      yAxis: showAxisLabels ? yAxis : withHiddenLabels(yAxis),
      series: [
        {
          name: yColumn.label,
          type: "scatter",
          data: source.rows.map((row) => [
            numberCell(row.cells[xColumn.id]),
            numberCell(row.cells[yColumn.id]),
          ]),
        },
      ],
    };
  },
};
