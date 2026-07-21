import type { AreaChartEncoding } from "@/schemas/shared";

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
  getDefaultYSeries,
  numberCell,
  requireColumn,
  stringifyCell,
  valueAxisDefaults,
} from "./shared";

export const areaChartProfile: ChartProfile<AreaChartEncoding> = {
  chartType: "area",
  createDefaultEncoding(source) {
    const { categoryColumn } = getDefaultChartColumns(source);
    return {
      chartType: "area",
      smooth: false,
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
    const unit = sharedUnit(yColumns);
    const { showAxisNames, showAxisLabels } = readAxisChromeFlags(chart);
    const categoryName = showAxisNames ? xColumn.label : "";
    const valueName = showAxisNames ? joinYLabel(yColumns) : "";

    const xAxis = withAxisName(
      { ...categoryAxisDefaults(categories), boundaryGap: false },
      categoryName,
      "x",
    );
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
      series: yColumns.map((column) => ({
        name: column.label,
        type: "line",
        data: source.rows.map((row) => numberCell(row.cells[column.id])),
        smooth: encoding.smooth,
        stack: encoding.stacked ? "total" : undefined,
        areaStyle: { opacity: 0.12 },
      })),
    };
  },
  responsive(option, viewport) {
    return applyCategoryDensity(option, viewport);
  },
};
