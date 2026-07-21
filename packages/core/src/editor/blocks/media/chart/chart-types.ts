import type { ChartType } from "@/schemas/shared";

export type ChartFamily =
  | "comparison"
  | "distribution"
  | "part-to-whole"
  | "relationship"
  | "trend";

export interface ChartTypeDefinition {
  chartType: ChartType;
  description: string;
  family: ChartFamily;
  label: string;
}

export const CHART_TYPE_ORDER = [
  "bar",
  "combo",
  "line",
  "area",
  "pie",
  "donut",
  "scatter",
  "heatmap",
  "histogram",
] satisfies ChartType[];

const chartTypeDefinitionByType = {
  bar: {
    chartType: "bar",
    description: "Compare values across categories",
    family: "comparison",
    label: "Bar",
  },
  combo: {
    chartType: "combo",
    description: "Compare bars and a line in one chart",
    family: "comparison",
    label: "Combo",
  },
  line: {
    chartType: "line",
    description: "Show change across an ordered series",
    family: "trend",
    label: "Line",
  },
  area: {
    chartType: "area",
    description: "Show cumulative change over a series",
    family: "trend",
    label: "Area",
  },
  pie: {
    chartType: "pie",
    description: "Show parts of a whole",
    family: "part-to-whole",
    label: "Pie",
  },
  donut: {
    chartType: "donut",
    description: "Show parts of a whole with a centre",
    family: "part-to-whole",
    label: "Donut",
  },
  scatter: {
    chartType: "scatter",
    description: "Plot relationships between two measures",
    family: "relationship",
    label: "Scatter",
  },
  heatmap: {
    chartType: "heatmap",
    description: "Show intensity across two categories",
    family: "relationship",
    label: "Heatmap",
  },
  histogram: {
    chartType: "histogram",
    description: "Show how values are distributed",
    family: "distribution",
    label: "Histogram",
  },
} satisfies Record<ChartType, ChartTypeDefinition>;

export const chartTypeDefinitions = CHART_TYPE_ORDER.map(
  (chartType) => chartTypeDefinitionByType[chartType],
);

export const chartTypeOptions = chartTypeDefinitions.map((definition) => ({
  family: definition.family,
  label: definition.label,
  value: definition.chartType,
}));

export const CHART_FAMILY_LABELS = {
  comparison: "Comparison",
  distribution: "Distribution",
  "part-to-whole": "Part-to-whole",
  relationship: "Relationship",
  trend: "Trend",
} satisfies Record<ChartFamily, string>;

export const CHART_FAMILY_ORDER = [
  "comparison",
  "trend",
  "part-to-whole",
  "relationship",
  "distribution",
] satisfies ChartFamily[];

export const groupedChartTypeOptions = CHART_FAMILY_ORDER.map((family) => ({
  family,
  label: CHART_FAMILY_LABELS[family],
  options: chartTypeOptions.filter((option) => option.family === family),
})).filter((group) => group.options.length > 0);

export function getChartTypeDefinition(chartType: ChartType): ChartTypeDefinition {
  const definition = chartTypeDefinitionByType[chartType];
  if (!definition) {
    throw new Error(`Unsupported chart type "${chartType}"`);
  }
  return definition;
}
