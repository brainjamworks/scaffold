import type { ChartBlockData, ChartColumn, ChartDataSource, ChartEncoding } from "@/schemas/shared";

import {
  compileProfileChartOption,
  createDefaultProfileEncoding,
  stringifyCell,
} from "./chart-profiles";

export interface CompiledChart {
  option: Record<string, unknown>;
  table: {
    caption: string;
    columns: ChartColumn[];
    rows: Array<{ id: string; cells: Record<string, string> }>;
  };
}

export function compileChart(data: ChartBlockData): CompiledChart {
  return {
    option: compileChartOption(data),
    table: compileChartTable(data),
  };
}

export function compileChartOption(data: ChartBlockData): Record<string, unknown> {
  return compileProfileChartOption(data);
}

export function defaultEncodingFor(
  chartType: ChartBlockData["chartType"],
  source: ChartDataSource,
): ChartEncoding {
  return createDefaultProfileEncoding(chartType, source);
}

export function compileChartTable(data: ChartBlockData): CompiledChart["table"] {
  return {
    caption: data.caption,
    columns: data.data.columns,
    rows: data.data.rows.map((row) => ({
      id: row.id,
      cells: Object.fromEntries(
        data.data.columns.map((column) => [column.id, stringifyCell(row.cells[column.id])]),
      ),
    })),
  };
}

export { numberCell, stringifyCell } from "./chart-profiles";
