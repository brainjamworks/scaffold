import {
  CHART_TYPES,
  type ChartBlockData,
  type ChartCellValue,
  type ChartDataSource,
  type ChartType,
} from "@/schemas/shared";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";

import { createDefaultProfileEncoding } from "./chart-profiles";

interface ChartSampleDataTemplate {
  kind: "inlineTable";
  columns: Array<{
    id: string;
    label: string;
    valueType: "category" | "number";
  }>;
  rows: Array<{
    id: string;
    cells: Record<string, ChartCellValue>;
  }>;
}

const categoryValueData: ChartSampleDataTemplate = {
  kind: "inlineTable",
  columns: [
    { id: "category", label: "Category", valueType: "category" },
    { id: "value", label: "Value", valueType: "number" },
  ],
  rows: [
    { id: "row-1", cells: { category: "Apples", value: 34 } },
    { id: "row-2", cells: { category: "Bananas", value: 22 } },
    { id: "row-3", cells: { category: "Cherries", value: 18 } },
    { id: "row-4", cells: { category: "Dates", value: 11 } },
    { id: "row-5", cells: { category: "Grapes", value: 15 } },
  ],
};

const actualTargetData: ChartSampleDataTemplate = {
  kind: "inlineTable",
  columns: [
    { id: "month", label: "Month", valueType: "category" },
    { id: "actual", label: "Actual", valueType: "number" },
    { id: "target", label: "Target", valueType: "number" },
  ],
  rows: [
    { id: "row-1", cells: { month: "Jan", actual: 42, target: 45 } },
    { id: "row-2", cells: { month: "Feb", actual: 48, target: 50 } },
    { id: "row-3", cells: { month: "Mar", actual: 55, target: 54 } },
    { id: "row-4", cells: { month: "Apr", actual: 61, target: 58 } },
    { id: "row-5", cells: { month: "May", actual: 66, target: 63 } },
    { id: "row-6", cells: { month: "Jun", actual: 72, target: 68 } },
  ],
};

const scoreData: ChartSampleDataTemplate = {
  kind: "inlineTable",
  columns: [
    { id: "sample", label: "Sample", valueType: "category" },
    { id: "score", label: "Score", valueType: "number" },
  ],
  rows: [42, 55, 61, 64, 67, 68, 70, 72, 73, 75, 78, 80, 81, 83, 84, 86, 88, 90, 91, 94].map(
    (score, index) => ({
      id: `row-${index + 1}`,
      cells: { sample: `S${index + 1}`, score },
    }),
  ),
};

const scatterData: ChartSampleDataTemplate = {
  kind: "inlineTable",
  columns: [
    { id: "study_hours", label: "Study hours", valueType: "number" },
    { id: "score", label: "Score", valueType: "number" },
  ],
  rows: [
    { id: "row-1", cells: { study_hours: 1, score: 54 } },
    { id: "row-2", cells: { study_hours: 2, score: 58 } },
    { id: "row-3", cells: { study_hours: 3, score: 65 } },
    { id: "row-4", cells: { study_hours: 4, score: 70 } },
    { id: "row-5", cells: { study_hours: 5, score: 76 } },
    { id: "row-6", cells: { study_hours: 6, score: 82 } },
  ],
};

const heatmapData: ChartSampleDataTemplate = {
  kind: "inlineTable",
  columns: [
    { id: "week", label: "Week", valueType: "category" },
    { id: "activity", label: "Activity", valueType: "category" },
    { id: "completion", label: "Completion", valueType: "number" },
  ],
  rows: [
    {
      id: "row-1",
      cells: { week: "Week 1", activity: "Reading", completion: 62 },
    },
    {
      id: "row-2",
      cells: { week: "Week 1", activity: "Practice", completion: 48 },
    },
    {
      id: "row-3",
      cells: { week: "Week 1", activity: "Quiz", completion: 72 },
    },
    {
      id: "row-4",
      cells: { week: "Week 2", activity: "Reading", completion: 70 },
    },
    {
      id: "row-5",
      cells: { week: "Week 2", activity: "Practice", completion: 58 },
    },
    {
      id: "row-6",
      cells: { week: "Week 2", activity: "Quiz", completion: 81 },
    },
    {
      id: "row-7",
      cells: { week: "Week 3", activity: "Reading", completion: 76 },
    },
    {
      id: "row-8",
      cells: { week: "Week 3", activity: "Practice", completion: 64 },
    },
    {
      id: "row-9",
      cells: { week: "Week 3", activity: "Quiz", completion: 86 },
    },
  ],
};

const chartSampleDataByType = {
  area: actualTargetData,
  bar: categoryValueData,
  combo: actualTargetData,
  donut: categoryValueData,
  heatmap: heatmapData,
  histogram: scoreData,
  line: actualTargetData,
  pie: categoryValueData,
  scatter: scatterData,
} satisfies Record<ChartType, ChartSampleDataTemplate>;

function createChartSampleData(template: ChartSampleDataTemplate): ChartDataSource {
  const columnIds = new Map(
    template.columns.map((column) => [column.id, createEmbeddedDataId()] as const),
  );
  return {
    kind: "inlineTable",
    columns: template.columns.map((column) => ({
      ...column,
      id: columnIds.get(column.id)!,
    })),
    rows: template.rows.map((row) => ({
      id: createEmbeddedDataId(),
      cells: Object.fromEntries(
        Object.entries(row.cells).map(([columnId, value]) => [columnIds.get(columnId)!, value]),
      ),
    })),
  };
}

export function createChartSample(chartType: ChartType): ChartBlockData {
  const data = createChartSampleData(chartSampleDataByType[chartType]);
  return {
    kind: "chart",
    version: 1,
    chartType,
    caption: "",
    showLegend: chartType === "combo",
    showAxisNames: true,
    showAxisLabels: true,
    data,
    encoding: createDefaultProfileEncoding(chartType, data),
  };
}

export const chartSamples = Object.fromEntries(
  CHART_TYPES.map((chartType) => [chartType, createChartSample(chartType)]),
) as Record<ChartType, ChartBlockData>;
