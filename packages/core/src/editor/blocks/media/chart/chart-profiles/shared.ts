import type {
  ChartBlockData,
  ChartCellValue,
  ChartColumn,
  ChartDataSource,
} from "@/schemas/shared";

/**
 * `shared.ts` holds the *non-layout* primitives every profile reuses:
 * base option (header + tooltip), axis defaults (no name/no layout),
 * data-shape helpers. Per-profile `compile()` and `responsive()`
 * functions own the layout themselves — chrome competition at small
 * canvases is genuinely chart-type-specific (Datawrapper, FT, Superset
 * all follow the same per-chart pattern). Cross-profile axis chrome
 * (rotation, density chip, name positioning) lives in `axis-styling.ts`.
 */

/**
 * Pixel reserve above the grid for the title + subtitle + legend
 * stack. Mirrored by the legend `top` so they sit in the same band.
 */
export function chartHeaderReserve(chart: ChartBlockData): {
  legendTop: number;
  gridTop: number;
} {
  const hasTitle = Boolean(chart.title);
  const hasSubtitle = Boolean(chart.subtitle);
  const showLegend = Boolean(chart.showLegend);

  let stack = 0;
  if (hasTitle) stack += 24;
  if (hasSubtitle) stack += 18;
  const legendTop = stack > 0 ? stack + 6 : 8;
  if (showLegend) stack = legendTop + 18;

  return {
    legendTop,
    gridTop: stack > 0 ? stack + 12 : 12,
  };
}

export function baseOption(
  chart: ChartBlockData,
  tooltipTrigger: "axis" | "item",
): Record<string, unknown> {
  const { legendTop } = chartHeaderReserve(chart);
  return {
    aria: { enabled: true },
    title: {
      text: chart.title || undefined,
      subtext: chart.subtitle || undefined,
      left: "center",
      top: 4,
      itemGap: 6,
    },
    legend: chart.showLegend ? { show: true, top: legendTop, left: "center" } : { show: false },
    tooltip: {
      show: true,
      trigger: tooltipTrigger,
      ...(tooltipTrigger === "axis" ? { axisPointer: { type: "shadow" as const } } : {}),
    },
  };
}

/**
 * ECharts 6 deprecated `grid.containLabel`. Its type docs define the same
 * behavior as `outerBoundsMode: 'same'` plus `outerBoundsContain: 'axisLabel'`.
 * Keep that migration in one helper so profile layout remains chart-specific
 * without repeating compatibility fields everywhere.
 */
export function cartesianGridLabelBounds(): {
  outerBoundsContain: "axisLabel";
  outerBoundsMode: "same";
} {
  return {
    outerBoundsMode: "same",
    outerBoundsContain: "axisLabel",
  };
}

/**
 * Category axis defaults. No `name` — axis names are off by default
 * across scaffold charts (per Datawrapper / FT / Observable Plot).
 * The chart title or block heading carries the dimension; the column
 * label remains in the tick labels and tooltip.
 */
export function categoryAxisDefaults(data: string[]) {
  return {
    type: "category" as const,
    data,
    axisLabel: {
      interval: 0,
      overflow: "truncate" as const,
      width: 80,
      hideOverlap: true,
      margin: 10,
    },
  };
}

/**
 * Value axis defaults. No `name`. Optional `unit` is appended to the
 * tick label so the dimension is still readable (Datawrapper pattern).
 */
export function valueAxisDefaults(unit?: string) {
  return {
    type: "value" as const,
    minorTick: { show: false },
    minorSplitLine: { show: false },
    axisLabel: {
      margin: 10,
      ...(unit ? { formatter: `{value}${unit}` } : {}),
    },
  };
}

export function requireColumn(source: ChartDataSource, columnId: string): ChartColumn {
  const column = source.columns.find((candidate) => candidate.id === columnId);
  if (!column) throw new Error(`Chart references missing column "${columnId}"`);
  return column;
}

export function getDefaultChartColumns(source: ChartDataSource): {
  categoryColumn: ChartColumn;
  numberColumns: ChartColumn[];
  valueColumn: ChartColumn;
} {
  const firstColumn = source.columns[0];
  if (!firstColumn) throw new Error("Chart requires at least one column");

  const categoryColumn =
    source.columns.find((column) => column.valueType === "category") ?? firstColumn;
  const numberColumns = source.columns.filter((column) => column.valueType === "number");
  const valueColumn = numberColumns[0] ?? source.columns[1] ?? firstColumn;

  return { categoryColumn, numberColumns, valueColumn };
}

export function getDefaultYSeries(source: ChartDataSource): Array<{
  columnId: string;
}> {
  const { numberColumns, valueColumn } = getDefaultChartColumns(source);
  return numberColumns.length
    ? numberColumns.map((column) => ({ columnId: column.id }))
    : [{ columnId: valueColumn.id }];
}

export function stringifyCell(value: ChartCellValue | undefined): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

export function numberCell(value: ChartCellValue | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
