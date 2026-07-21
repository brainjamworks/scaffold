import type { HistogramChartEncoding } from "@/schemas/shared";

import {
  applyCategoryDensity,
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
  requireColumn,
  valueAxisDefaults,
} from "./shared";

const MAX_HISTOGRAM_BINS = 12;
/** Reserved y-axis name — bin counts are always frequencies. */
const FREQUENCY_LABEL = "Frequency";

export const histogramChartProfile: ChartProfile<HistogramChartEncoding> = {
  chartType: "histogram",
  createDefaultEncoding(source) {
    const { valueColumn } = getDefaultChartColumns(source);
    return {
      chartType: "histogram",
      value: { columnId: valueColumn.id },
    };
  },
  compile(chart, encoding) {
    const source = chart.data;
    const valueColumn = requireColumn(source, encoding.value.columnId);
    if (isEmptyData(source, [valueColumn])) {
      return emptyStateOption(chart);
    }
    const values = source.rows
      .map((row) => numericCell(row.cells[valueColumn.id]))
      .filter((value): value is number => value !== null);
    const bins = createHistogramBins(values);

    const { showAxisNames, showAxisLabels } = readAxisChromeFlags(chart);
    // X = the binned dimension (e.g. "Score"). Y = always "Frequency" —
    // bar heights are bin counts, not the column's raw values.
    const xName = showAxisNames ? valueColumn.label : "";
    const yName = showAxisNames ? FREQUENCY_LABEL : "";

    const xAxis = withAxisName(categoryAxisDefaults(bins.map((bin) => bin.label)), xName, "x");
    const yAxis = withAxisName(valueAxisDefaults(), yName, "y");

    return {
      ...baseOption(chart, "axis"),
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
          name: valueColumn.label,
          type: "bar",
          barMinWidth: 4,
          // Histogram bins are continuous — tighter gap than categorical.
          barCategoryGap: "10%",
          data: bins.map((bin) => bin.count),
        },
      ],
    };
  },
  responsive(option, viewport) {
    // Same density rules as bar: rotate x-bin labels at 24-40px band,
    // engage inside-pan + chip below 24. Bin labels like "62.8-73.2"
    // are wide so rotation kicks in earlier than for short categories.
    return applyCategoryDensity(option, viewport);
  },
};

function numericCell(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function createHistogramBins(values: number[]): Array<{
  count: number;
  label: string;
}> {
  if (!values.length) return [{ count: 0, label: "No data" }];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [{ count: values.length, label: formatBinValue(min) }];
  }

  const binCount = Math.min(MAX_HISTOGRAM_BINS, Math.max(1, Math.ceil(Math.sqrt(values.length))));
  const binWidth = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + binWidth * index;
    const end = index === binCount - 1 ? max : min + binWidth * (index + 1);
    return {
      count: 0,
      label: `${formatBinValue(start)}-${formatBinValue(end)}`,
    };
  });

  for (const value of values) {
    const rawIndex = Math.floor((value - min) / binWidth);
    const binIndex = Math.min(Math.max(rawIndex, 0), binCount - 1);
    const bin = bins[binIndex];
    if (bin) bin.count += 1;
  }

  return bins;
}

function formatBinValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
