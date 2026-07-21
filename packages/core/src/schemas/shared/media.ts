import { z } from "zod";

export const CHART_TYPES = [
  "bar",
  "combo",
  "line",
  "area",
  "pie",
  "donut",
  "scatter",
  "heatmap",
  "histogram",
] as const;
export const ChartTypeSchema = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const ChartCellValueSchema = z.union([z.string(), z.number(), z.null()]);
export type ChartCellValue = z.infer<typeof ChartCellValueSchema>;

export const ChartColumnSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    valueType: z.enum(["category", "number"]),
    // Optional unit suffix applied to value-axis tick labels in charts
    // ("%", "€", " ms", " count"). Carries the dimension instead of an
    // explicit axis name, per Datawrapper convention.
    unit: z.string().optional(),
  })
  .strict();
export type ChartColumn = z.infer<typeof ChartColumnSchema>;

export const ChartRowSchema = z
  .object({
    id: z.string().min(1),
    cells: z.record(z.string(), ChartCellValueSchema),
  })
  .strict();
export type ChartRow = z.infer<typeof ChartRowSchema>;

export const ChartDataSourceSchema = z
  .object({
    kind: z.literal("inlineTable"),
    columns: z.array(ChartColumnSchema).min(2),
    rows: z.array(ChartRowSchema).min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    const columnIds = new Set(data.columns.map((column) => column.id));

    data.rows.forEach((row, rowIndex) => {
      Object.keys(row.cells).forEach((columnId) => {
        if (!columnIds.has(columnId)) {
          ctx.addIssue({
            code: "custom",
            message: `row cell references missing column "${columnId}"`,
            path: ["rows", rowIndex, "cells", columnId],
          });
        }
      });
    });
  });
export type ChartDataSource = z.infer<typeof ChartDataSourceSchema>;

export const ChartColumnRefSchema = z
  .object({
    columnId: z.string().min(1),
  })
  .strict();
export type ChartColumnRef = z.infer<typeof ChartColumnRefSchema>;

export const BarChartEncodingSchema = z
  .object({
    chartType: z.literal("bar"),
    orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
    stacked: z.boolean().default(false),
    x: ChartColumnRefSchema,
    y: z.array(ChartColumnRefSchema).min(1),
  })
  .strict();
export type BarChartEncoding = z.infer<typeof BarChartEncodingSchema>;

export const ComboChartEncodingSchema = z
  .object({
    bars: z.array(ChartColumnRefSchema).min(1),
    chartType: z.literal("combo"),
    lines: z.array(ChartColumnRefSchema).min(1),
    x: ChartColumnRefSchema,
  })
  .strict();
export type ComboChartEncoding = z.infer<typeof ComboChartEncodingSchema>;

export const LineChartEncodingSchema = z
  .object({
    area: z.boolean().default(false),
    chartType: z.literal("line"),
    smooth: z.boolean().default(false),
    stacked: z.boolean().default(false),
    x: ChartColumnRefSchema,
    y: z.array(ChartColumnRefSchema).min(1),
  })
  .strict();
export type LineChartEncoding = z.infer<typeof LineChartEncodingSchema>;

export const AreaChartEncodingSchema = z
  .object({
    chartType: z.literal("area"),
    smooth: z.boolean().default(false),
    stacked: z.boolean().default(false),
    x: ChartColumnRefSchema,
    y: z.array(ChartColumnRefSchema).min(1),
  })
  .strict();
export type AreaChartEncoding = z.infer<typeof AreaChartEncodingSchema>;

export const PieChartEncodingSchema = z
  .object({
    chartType: z.literal("pie"),
    doughnut: z.boolean().default(false),
    label: ChartColumnRefSchema,
    value: ChartColumnRefSchema,
  })
  .strict();
export type PieChartEncoding = z.infer<typeof PieChartEncodingSchema>;

export const DonutChartEncodingSchema = z
  .object({
    chartType: z.literal("donut"),
    label: ChartColumnRefSchema,
    value: ChartColumnRefSchema,
  })
  .strict();
export type DonutChartEncoding = z.infer<typeof DonutChartEncodingSchema>;

export const ScatterChartEncodingSchema = z
  .object({
    chartType: z.literal("scatter"),
    x: ChartColumnRefSchema,
    y: ChartColumnRefSchema,
  })
  .strict();
export type ScatterChartEncoding = z.infer<typeof ScatterChartEncodingSchema>;

export const HeatmapChartEncodingSchema = z
  .object({
    chartType: z.literal("heatmap"),
    x: ChartColumnRefSchema,
    y: ChartColumnRefSchema,
    value: ChartColumnRefSchema,
  })
  .strict();
export type HeatmapChartEncoding = z.infer<typeof HeatmapChartEncodingSchema>;

export const HistogramChartEncodingSchema = z
  .object({
    chartType: z.literal("histogram"),
    value: ChartColumnRefSchema,
  })
  .strict();
export type HistogramChartEncoding = z.infer<typeof HistogramChartEncodingSchema>;

export const ChartEncodingSchema = z.discriminatedUnion("chartType", [
  BarChartEncodingSchema,
  ComboChartEncodingSchema,
  LineChartEncodingSchema,
  AreaChartEncodingSchema,
  PieChartEncodingSchema,
  DonutChartEncodingSchema,
  ScatterChartEncodingSchema,
  HeatmapChartEncodingSchema,
  HistogramChartEncodingSchema,
]);
export type ChartEncoding = z.infer<typeof ChartEncodingSchema>;

export const ChartBlockDataSchema = z
  .object({
    kind: z.literal("chart"),
    version: z.literal(1),
    chartType: ChartTypeSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    caption: z.string().default(""),
    showLegend: z.boolean().default(true),
    showAxisNames: z.boolean().default(true),
    showAxisLabels: z.boolean().default(true),
    data: ChartDataSourceSchema,
    encoding: ChartEncodingSchema,
  })
  .strict()
  .superRefine((chart, ctx) => {
    const columnsById = new Map(chart.data.columns.map((column) => [column.id, column]));

    const getColumn = (
      ref: ChartColumnRef,
      path: Array<string | number>,
    ): ChartColumn | undefined => {
      const column = columnsById.get(ref.columnId);
      if (!column) {
        ctx.addIssue({
          code: "custom",
          message: `encoding references missing column "${ref.columnId}"`,
          path,
        });
      }
      return column;
    };

    const requireNumberColumn = (ref: ChartColumnRef, path: Array<string | number>) => {
      const column = getColumn(ref, path);
      if (column && column.valueType !== "number") {
        ctx.addIssue({
          code: "custom",
          message: `encoding channel must reference a number column, got "${column.valueType}"`,
          path,
        });
      }
    };

    const requireCategoryColumn = (ref: ChartColumnRef, path: Array<string | number>) => {
      const column = getColumn(ref, path);
      if (column && column.valueType !== "category") {
        ctx.addIssue({
          code: "custom",
          message: `encoding channel must reference a category column, got "${column.valueType}"`,
          path,
        });
      }
    };

    if (chart.encoding.chartType !== chart.chartType) {
      ctx.addIssue({
        code: "custom",
        message: "encoding.chartType must match chartType",
        path: ["encoding", "chartType"],
      });
    }

    switch (chart.encoding.chartType) {
      case "bar":
      case "line":
      case "area":
        getColumn(chart.encoding.x, ["encoding", "x", "columnId"]);
        chart.encoding.y.forEach((ref, index) => {
          requireNumberColumn(ref, ["encoding", "y", index, "columnId"]);
        });
        break;
      case "combo":
        getColumn(chart.encoding.x, ["encoding", "x", "columnId"]);
        chart.encoding.bars.forEach((ref, index) => {
          requireNumberColumn(ref, ["encoding", "bars", index, "columnId"]);
        });
        chart.encoding.lines.forEach((ref, index) => {
          requireNumberColumn(ref, ["encoding", "lines", index, "columnId"]);
        });
        break;
      case "pie":
      case "donut":
        getColumn(chart.encoding.label, ["encoding", "label", "columnId"]);
        requireNumberColumn(chart.encoding.value, ["encoding", "value", "columnId"]);
        break;
      case "scatter":
        requireNumberColumn(chart.encoding.x, ["encoding", "x", "columnId"]);
        requireNumberColumn(chart.encoding.y, ["encoding", "y", "columnId"]);
        break;
      case "heatmap":
        requireCategoryColumn(chart.encoding.x, ["encoding", "x", "columnId"]);
        requireCategoryColumn(chart.encoding.y, ["encoding", "y", "columnId"]);
        requireNumberColumn(chart.encoding.value, ["encoding", "value", "columnId"]);
        break;
      case "histogram":
        requireNumberColumn(chart.encoding.value, ["encoding", "value", "columnId"]);
        break;
    }
  });
export type ChartBlockData = z.infer<typeof ChartBlockDataSchema>;

/**
 * Chart block attrs. `data` follows the Beam-style table + encoding
 * contract, scoped to the chart types Scaffold currently renders.
 */
export const ChartBlockAttrsSchema = z.object({
  data: ChartBlockDataSchema.nullish(),
});
export type ChartBlockAttrs = z.infer<typeof ChartBlockAttrsSchema>;
