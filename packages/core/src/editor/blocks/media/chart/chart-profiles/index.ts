import type { ChartBlockData, ChartDataSource, ChartEncoding, ChartType } from "@/schemas/shared";

import { areaChartProfile } from "./area";
import { barChartProfile } from "./bar";
import { comboChartProfile } from "./combo";
import { donutChartProfile } from "./donut";
import { heatmapChartProfile } from "./heatmap";
import { histogramChartProfile } from "./histogram";
import { lineChartProfile } from "./line";
import { pieChartProfile } from "./pie";
import { scatterChartProfile } from "./scatter";

export const chartProfiles = {
  bar: barChartProfile,
  combo: comboChartProfile,
  line: lineChartProfile,
  area: areaChartProfile,
  pie: pieChartProfile,
  donut: donutChartProfile,
  scatter: scatterChartProfile,
  heatmap: heatmapChartProfile,
  histogram: histogramChartProfile,
} as const;

export function compileProfileChartOption(chart: ChartBlockData): Record<string, unknown> {
  switch (chart.encoding.chartType) {
    case "bar":
      return chartProfiles.bar.compile(chart, chart.encoding);
    case "combo":
      return chartProfiles.combo.compile(chart, chart.encoding);
    case "line":
      return chartProfiles.line.compile(chart, chart.encoding);
    case "area":
      return chartProfiles.area.compile(chart, chart.encoding);
    case "pie":
      return chartProfiles.pie.compile(chart, chart.encoding);
    case "donut":
      return chartProfiles.donut.compile(chart, chart.encoding);
    case "scatter":
      return chartProfiles.scatter.compile(chart, chart.encoding);
    case "heatmap":
      return chartProfiles.heatmap.compile(chart, chart.encoding);
    case "histogram":
      return chartProfiles.histogram.compile(chart, chart.encoding);
  }
}

export function createDefaultProfileEncoding(
  chartType: ChartType,
  source: ChartDataSource,
): ChartEncoding {
  switch (chartType) {
    case "bar":
      return chartProfiles.bar.createDefaultEncoding(source);
    case "combo":
      return chartProfiles.combo.createDefaultEncoding(source);
    case "line":
      return chartProfiles.line.createDefaultEncoding(source);
    case "area":
      return chartProfiles.area.createDefaultEncoding(source);
    case "pie":
      return chartProfiles.pie.createDefaultEncoding(source);
    case "donut":
      return chartProfiles.donut.createDefaultEncoding(source);
    case "scatter":
      return chartProfiles.scatter.createDefaultEncoding(source);
    case "heatmap":
      return chartProfiles.heatmap.createDefaultEncoding(source);
    case "histogram":
      return chartProfiles.histogram.createDefaultEncoding(source);
  }
}

export type { ChartProfile } from "./types";
export { numberCell, stringifyCell } from "./shared";
