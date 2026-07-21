import type {
  ChartBlockData,
  ChartCellValue,
  ChartColumn,
  ChartColumnRef,
  ChartDataSource,
  ChartEncoding,
  ChartType,
} from "@/schemas/shared";
import { ChartBlockDataSchema, ChartEncodingSchema, ChartTypeSchema } from "@/schemas/shared";
import { createStableId } from "@/document/model/identity/stable-ids";
import { z } from "zod";

import { chartProfiles } from "./chart-profiles";
import { createChartSample } from "./chart-samples";
import { chartTypeDefinitions } from "./chart-types";

const ChartSettingsTableColumnTypeSchema = z.enum(["number", "text"]);
type ChartSettingsTableColumnType = z.infer<typeof ChartSettingsTableColumnTypeSchema>;
type ChartEncodingFor<TChartType extends ChartType> = Extract<
  ChartEncoding,
  { chartType: TChartType }
>;

export const ChartSettingsTableSchema = z
  .object({
    columnIds: z.array(z.string()).optional(),
    columnTypes: z.array(ChartSettingsTableColumnTypeSchema).optional(),
    headers: z.array(z.string()).min(1),
    rowIds: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())),
  })
  .strict();

export type ChartSettingsTable = z.infer<typeof ChartSettingsTableSchema>;

export const ChartSettingsMappingSchema = z
  .object({
    bars: z.array(z.string()).default([]),
    category: z.string().optional(),
    label: z.string().optional(),
    lines: z.array(z.string()).default([]),
    value: z.string().optional(),
    values: z.array(z.string()).default([]),
    xCategory: z.string().optional(),
    xValue: z.string().optional(),
    yCategory: z.string().optional(),
    yValue: z.string().optional(),
  })
  .strict();

export type ChartSettingsMapping = z.infer<typeof ChartSettingsMappingSchema>;

const EMPTY_CHART_SETTINGS_MAPPING: ChartSettingsMapping = {
  bars: [],
  lines: [],
  values: [],
};

export const ChartSettingsDraftSchema = z
  .object({
    chartType: ChartTypeSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    caption: z.string().default(""),
    showLegend: z.boolean().default(true),
    showAxisNames: z.boolean().default(true),
    showAxisLabels: z.boolean().default(true),
    table: ChartSettingsTableSchema,
    mapping: ChartSettingsMappingSchema.default({}),
    encoding: ChartEncodingSchema.optional(),
  })
  .strict();

export type ChartSettingsDraft = z.infer<typeof ChartSettingsDraftSchema>;

export interface ChartInsertVariant {
  chartType: ChartType;
  description: string;
  id: `chart-${ChartType}`;
  keywords: string[];
  nodeType: "chart_block";
  title: string;
  variantOf: "chart";
  content: () => Record<string, unknown>;
}

export function createDefaultChartEncoding(
  chartType: ChartType,
  source: ChartDataSource,
): ChartEncoding {
  return chartProfiles[chartType].createDefaultEncoding(source);
}

export function createDefaultChartData(): ChartBlockData {
  return createChartSample("bar");
}

export function createChartDataForType(chartType: ChartType): ChartBlockData {
  return createChartSample(chartType);
}

export function getChartCatalogVariants(): readonly ChartInsertVariant[] {
  return chartTypeDefinitions.map((definition) => {
    const title = `${definition.label} chart`;
    return {
      chartType: definition.chartType,
      description: definition.description,
      id: `chart-${definition.chartType}`,
      keywords: [
        "chart",
        "graph",
        definition.chartType,
        definition.label.toLowerCase(),
        definition.family,
      ],
      nodeType: "chart_block",
      title,
      variantOf: "chart",
      content: () => ({
        type: "chart_block",
        attrs: {
          id: createStableId(),
          data: createChartDataForType(definition.chartType),
        },
      }),
    };
  });
}

export function normalizeChartData(draft: ChartBlockData): ChartBlockData {
  return {
    ...draft,
    encoding: isEncodingValidForChart(draft)
      ? draft.encoding
      : createDefaultChartEncoding(draft.chartType, draft.data),
  };
}

export function chartDataToSettingsDraft(chart: ChartBlockData): ChartSettingsDraft {
  return ChartSettingsDraftSchema.parse({
    chartType: chart.chartType,
    title: chart.title,
    subtitle: chart.subtitle,
    caption: chart.caption,
    showLegend: chart.showLegend,
    showAxisNames: chart.showAxisNames,
    showAxisLabels: chart.showAxisLabels,
    table: chartDataSourceToSettingsTable(chart.data),
    mapping: chartEncodingToSettingsMapping(chart.encoding),
    encoding: chart.encoding,
  });
}

export function createDefaultChartSettingsDraft(): ChartSettingsDraft {
  return chartDataToSettingsDraft(createDefaultChartData());
}

export function chartSettingsDraftToData(draft: ChartSettingsDraft): ChartBlockData {
  const data = normalizeChartSettingsTable(draft.table);
  const encoding = createChartEncodingFromSettingsMapping({
    chartType: draft.chartType,
    data,
    mapping: draft.mapping,
    ...(draft.encoding ? { baseEncoding: draft.encoding } : {}),
  });
  const candidate: ChartBlockData = {
    kind: "chart",
    version: 1,
    chartType: draft.chartType,
    ...(draft.title === undefined ? {} : { title: draft.title }),
    ...(draft.subtitle === undefined ? {} : { subtitle: draft.subtitle }),
    caption: draft.caption,
    showLegend: draft.showLegend,
    showAxisNames: draft.showAxisNames,
    showAxisLabels: draft.showAxisLabels,
    data,
    encoding,
  };
  return ChartBlockDataSchema.parse(normalizeChartData(candidate));
}

function chartEncodingToSettingsMapping(encoding: ChartEncoding): ChartSettingsMapping {
  switch (encoding.chartType) {
    case "bar":
    case "line":
    case "area":
      return {
        ...EMPTY_CHART_SETTINGS_MAPPING,
        category: encoding.x.columnId,
        values: encoding.y.map((ref) => ref.columnId),
      };
    case "combo":
      return {
        ...EMPTY_CHART_SETTINGS_MAPPING,
        bars: encoding.bars.map((ref) => ref.columnId),
        category: encoding.x.columnId,
        lines: encoding.lines.map((ref) => ref.columnId),
      };
    case "pie":
    case "donut":
      return {
        ...EMPTY_CHART_SETTINGS_MAPPING,
        label: encoding.label.columnId,
        value: encoding.value.columnId,
      };
    case "scatter":
      return {
        ...EMPTY_CHART_SETTINGS_MAPPING,
        xValue: encoding.x.columnId,
        yValue: encoding.y.columnId,
      };
    case "heatmap":
      return {
        ...EMPTY_CHART_SETTINGS_MAPPING,
        xCategory: encoding.x.columnId,
        yCategory: encoding.y.columnId,
        value: encoding.value.columnId,
      };
    case "histogram":
      return {
        ...EMPTY_CHART_SETTINGS_MAPPING,
        value: encoding.value.columnId,
      };
  }
}

function createChartEncodingFromSettingsMapping({
  baseEncoding,
  chartType,
  data,
  mapping,
}: {
  baseEncoding?: ChartEncoding;
  chartType: ChartType;
  data: ChartDataSource;
  mapping: ChartSettingsMapping;
}): ChartEncoding {
  const defaultEncoding = createDefaultChartEncoding(chartType, data);
  const base = baseEncoding?.chartType === chartType ? baseEncoding : defaultEncoding;
  const allColumnIds = new Set(data.columns.map((column) => column.id));
  const numberColumnIds = new Set(
    data.columns.filter((column) => column.valueType === "number").map((column) => column.id),
  );
  const categoryColumnIds = new Set(
    data.columns.filter((column) => column.valueType === "category").map((column) => column.id),
  );
  const anyColumn = (columnId: string | undefined) =>
    columnId && allColumnIds.has(columnId) ? columnId : undefined;
  const numberColumn = (columnId: string | undefined) =>
    columnId && numberColumnIds.has(columnId) ? columnId : undefined;
  const categoryColumn = (columnId: string | undefined) =>
    columnId && categoryColumnIds.has(columnId) ? columnId : undefined;
  const refs = (
    columnIds: readonly string[],
    accepts: (columnId: string | undefined) => string | undefined,
  ): ChartColumnRef[] =>
    columnIds.flatMap((columnId) => {
      const validColumnId = accepts(columnId);
      return validColumnId ? [{ columnId: validColumnId }] : [];
    });
  const ref = (
    columnId: string | undefined,
    fallback: ChartColumnRef,
    accepts: (columnId: string | undefined) => string | undefined,
  ): ChartColumnRef => {
    const validColumnId = accepts(columnId);
    return validColumnId ? { columnId: validColumnId } : fallback;
  };
  const refList = (
    columnIds: readonly string[],
    fallback: readonly ChartColumnRef[],
    accepts: (columnId: string | undefined) => string | undefined,
  ): ChartColumnRef[] => {
    const selected = refs(columnIds, accepts);
    return selected.length > 0 ? selected : [...fallback];
  };

  switch (chartType) {
    case "bar": {
      const current = (
        base.chartType === "bar" ? base : defaultEncoding
      ) as ChartEncodingFor<"bar">;
      return {
        ...current,
        x: ref(mapping.category, current.x, anyColumn),
        y: refList(mapping.values, current.y, numberColumn),
      };
    }
    case "line": {
      const current = (
        base.chartType === "line" ? base : defaultEncoding
      ) as ChartEncodingFor<"line">;
      return {
        ...current,
        x: ref(mapping.category, current.x, anyColumn),
        y: refList(mapping.values, current.y, numberColumn),
      };
    }
    case "area": {
      const current = (
        base.chartType === "area" ? base : defaultEncoding
      ) as ChartEncodingFor<"area">;
      return {
        ...current,
        x: ref(mapping.category, current.x, anyColumn),
        y: refList(mapping.values, current.y, numberColumn),
      };
    }
    case "combo": {
      const current = (
        base.chartType === "combo" ? base : defaultEncoding
      ) as ChartEncodingFor<"combo">;
      return {
        ...current,
        x: ref(mapping.category, current.x, anyColumn),
        bars: refList(mapping.bars, current.bars, numberColumn),
        lines: refList(mapping.lines, current.lines, numberColumn),
      };
    }
    case "pie": {
      const current = (
        base.chartType === "pie" ? base : defaultEncoding
      ) as ChartEncodingFor<"pie">;
      return {
        ...current,
        label: ref(mapping.label, current.label, anyColumn),
        value: ref(mapping.value, current.value, numberColumn),
      };
    }
    case "donut": {
      const current = (
        base.chartType === "donut" ? base : defaultEncoding
      ) as ChartEncodingFor<"donut">;
      return {
        ...current,
        label: ref(mapping.label, current.label, anyColumn),
        value: ref(mapping.value, current.value, numberColumn),
      };
    }
    case "scatter": {
      const current = (
        base.chartType === "scatter" ? base : defaultEncoding
      ) as ChartEncodingFor<"scatter">;
      return {
        ...current,
        x: ref(mapping.xValue, current.x, numberColumn),
        y: ref(mapping.yValue, current.y, numberColumn),
      };
    }
    case "heatmap": {
      const current = (
        base.chartType === "heatmap" ? base : defaultEncoding
      ) as ChartEncodingFor<"heatmap">;
      return {
        ...current,
        x: ref(mapping.xCategory, current.x, categoryColumn),
        y: ref(mapping.yCategory, current.y, categoryColumn),
        value: ref(mapping.value, current.value, numberColumn),
      };
    }
    case "histogram": {
      const current = (
        base.chartType === "histogram" ? base : defaultEncoding
      ) as ChartEncodingFor<"histogram">;
      return {
        ...current,
        value: ref(mapping.value, current.value, numberColumn),
      };
    }
  }
}

function chartDataSourceToSettingsTable(data: ChartDataSource): ChartSettingsTable {
  return {
    columnIds: data.columns.map((column) => column.id),
    columnTypes: data.columns.map((column) => (column.valueType === "number" ? "number" : "text")),
    headers: data.columns.map((column) => column.label),
    rowIds: data.rows.map((row) => row.id),
    rows: data.rows.map((row) => data.columns.map((column) => stringifyCell(row.cells[column.id]))),
  };
}

function normalizeChartSettingsTable(table: ChartSettingsTable): ChartDataSource {
  const width = Math.max(table.headers.length, ...table.rows.map((row) => row.length), 2);
  const columns = createColumns(
    table.headers,
    width,
    table.rows,
    table.columnIds,
    table.columnTypes,
  );
  const rows = table.rows.map((row, rowIndex) => ({
    id: table.rowIds?.[rowIndex] ?? createStableId(),
    cells: Object.fromEntries(
      columns.map((column, columnIndex) => [
        column.id,
        normalizeCell(row[columnIndex] ?? "", column.valueType),
      ]),
    ),
  }));

  return {
    kind: "inlineTable",
    columns,
    rows: rows.length > 0 ? rows : [emptyDataRow(columns)],
  };
}

function createColumns(
  headers: string[],
  width: number,
  rows: string[][],
  columnIds: string[] | undefined,
  columnTypes: ChartSettingsTable["columnTypes"],
): ChartColumn[] {
  return Array.from({ length: width }, (_, index) => {
    const rawLabel = headers[index]?.trim();
    const label = dedupeLabel(rawLabel || `Column ${index + 1}`, index, headers);

    return {
      id: columnIds?.[index] ?? createStableId(),
      label,
      valueType: inferColumnType(
        rows.map((row) => row[index] ?? ""),
        columnTypes?.[index],
      ),
    };
  });
}

function dedupeLabel(label: string, index: number, headers: string[]): string {
  const previousMatches = headers
    .slice(0, index)
    .map((header) => header.trim())
    .filter((header) => header === label).length;

  return previousMatches === 0 ? label : `${label} ${previousMatches + 1}`;
}

function inferColumnType(
  values: string[],
  fallback?: ChartSettingsTableColumnType,
): ChartColumn["valueType"] {
  const populated = values.map((value) => value.trim()).filter(Boolean);
  if (populated.length === 0) {
    return fallback === "number" ? "number" : "category";
  }
  return populated.every(isNumericCell) ? "number" : "category";
}

function normalizeCell(value: string, valueType: ChartColumn["valueType"]): ChartCellValue {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (valueType === "number") return parseNumberCell(trimmed);
  return trimmed;
}

function emptyDataRow(columns: ChartColumn[]) {
  return {
    id: createStableId(),
    cells: Object.fromEntries(columns.map((column) => [column.id, null])),
  };
}

function stringifyCell(value: ChartCellValue | undefined): string {
  if (value == null) return "";
  return String(value);
}

function isNumericCell(value: string): boolean {
  return Number.isFinite(parseNumberCell(value));
}

function parseNumberCell(value: string): number {
  const normalized = value.trim().replace(/,/g, "").replace(/%$/, "");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function isEncodingValidForChart(chart: ChartBlockData): boolean {
  if (chart.encoding.chartType !== chart.chartType) return false;
  const columnsById = new Map(chart.data.columns.map((column) => [column.id, column]));
  const hasColumn = (columnId: string) => columnsById.has(columnId);
  const hasNumberColumn = (columnId: string) => columnsById.get(columnId)?.valueType === "number";
  const hasCategoryColumn = (columnId: string) =>
    columnsById.get(columnId)?.valueType === "category";

  switch (chart.encoding.chartType) {
    case "bar":
    case "combo":
    case "line":
      if (!hasColumn(chart.encoding.x.columnId)) return false;
      if (chart.encoding.chartType === "combo") {
        return (
          chart.encoding.bars.length > 0 &&
          chart.encoding.lines.length > 0 &&
          chart.encoding.bars.every((ref) => hasNumberColumn(ref.columnId)) &&
          chart.encoding.lines.every((ref) => hasNumberColumn(ref.columnId))
        );
      }
      return (
        chart.encoding.y.length > 0 &&
        chart.encoding.y.every((ref) => hasNumberColumn(ref.columnId))
      );
    case "area":
      return (
        hasColumn(chart.encoding.x.columnId) &&
        chart.encoding.y.length > 0 &&
        chart.encoding.y.every((ref) => hasNumberColumn(ref.columnId))
      );
    case "pie":
    case "donut":
      return (
        hasColumn(chart.encoding.label.columnId) && hasNumberColumn(chart.encoding.value.columnId)
      );
    case "scatter":
      return (
        hasNumberColumn(chart.encoding.x.columnId) && hasNumberColumn(chart.encoding.y.columnId)
      );
    case "heatmap":
      return (
        hasCategoryColumn(chart.encoding.x.columnId) &&
        hasCategoryColumn(chart.encoding.y.columnId) &&
        hasNumberColumn(chart.encoding.value.columnId)
      );
    case "histogram":
      return hasNumberColumn(chart.encoding.value.columnId);
  }
}
