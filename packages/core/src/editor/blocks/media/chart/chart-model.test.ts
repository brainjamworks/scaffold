import { describe, expect, it } from "vite-plus/test";

import {
  CHART_TYPES,
  ChartBlockDataSchema,
  ChartDataSourceSchema,
  ChartTypeSchema,
  type ChartBlockData,
} from "@/schemas/shared";

import {
  chartDataToSettingsDraft,
  chartSettingsDraftToData,
  ChartSettingsDraftSchema,
  createDefaultChartEncoding,
  getChartCatalogVariants,
  normalizeChartData,
} from "./chart-model";
import { chartProfiles } from "./chart-profiles";
import { createChartSample } from "./chart-samples";
import {
  CHART_TYPE_ORDER,
  chartTypeDefinitions,
  chartTypeOptions,
  getChartTypeDefinition,
  groupedChartTypeOptions,
} from "./chart-types";

describe("chart type definitions", () => {
  it("covers every schema-supported chart type and every chart profile", () => {
    expect(ChartTypeSchema.options).toEqual(CHART_TYPES);
    const schemaTypes = [...CHART_TYPES].sort();
    const profileTypes = Object.keys(chartProfiles).sort();
    const definitionTypes = chartTypeDefinitions.map((definition) => definition.chartType).sort();

    expect(profileTypes).toEqual(schemaTypes);
    expect(definitionTypes).toEqual(schemaTypes);
  });

  it("keeps chart type definitions to stable product metadata", () => {
    expect(Object.keys(getChartTypeDefinition("bar")).sort()).toEqual([
      "chartType",
      "description",
      "family",
      "label",
    ]);
    expect(getChartTypeDefinition("bar")).toEqual({
      chartType: "bar",
      description: "Compare values across categories",
      family: "comparison",
      label: "Bar",
    });
  });

  it("keeps chart type picker options aligned with chart definitions", () => {
    expect(CHART_TYPE_ORDER).toEqual([
      "bar",
      "combo",
      "line",
      "area",
      "pie",
      "donut",
      "scatter",
      "heatmap",
      "histogram",
    ]);
    expect(chartTypeDefinitions.map((definition) => definition.chartType)).toEqual(
      CHART_TYPE_ORDER,
    );
    expect(chartTypeOptions).toEqual(
      chartTypeDefinitions.map((definition) => ({
        family: definition.family,
        label: definition.label,
        value: definition.chartType,
      })),
    );
    expect(groupedChartTypeOptions).toEqual([
      {
        family: "comparison",
        label: "Comparison",
        options: [
          { family: "comparison", label: "Bar", value: "bar" },
          { family: "comparison", label: "Combo", value: "combo" },
        ],
      },
      {
        family: "trend",
        label: "Trend",
        options: [
          { family: "trend", label: "Line", value: "line" },
          { family: "trend", label: "Area", value: "area" },
        ],
      },
      {
        family: "part-to-whole",
        label: "Part-to-whole",
        options: [
          { family: "part-to-whole", label: "Pie", value: "pie" },
          { family: "part-to-whole", label: "Donut", value: "donut" },
        ],
      },
      {
        family: "relationship",
        label: "Relationship",
        options: [
          { family: "relationship", label: "Scatter", value: "scatter" },
          { family: "relationship", label: "Heatmap", value: "heatmap" },
        ],
      },
      {
        family: "distribution",
        label: "Distribution",
        options: [{ family: "distribution", label: "Histogram", value: "histogram" }],
      },
    ]);
    expect(
      Object.fromEntries(
        chartTypeDefinitions.map((definition) => [definition.chartType, definition.family]),
      ),
    ).toEqual({
      area: "trend",
      bar: "comparison",
      combo: "comparison",
      donut: "part-to-whole",
      heatmap: "relationship",
      histogram: "distribution",
      line: "trend",
      pie: "part-to-whole",
      scatter: "relationship",
    });
  });
});

describe("chart data model helpers", () => {
  it("requires Data-family identities for chart row and column owners and references", () => {
    const result = ChartDataSourceSchema.safeParse({
      kind: "inlineTable",
      columns: [
        { id: "category", label: "Category", valueType: "category" },
        { id: "column_00002", label: "Value", valueType: "number" },
      ],
      rows: [
        {
          id: "row-1",
          cells: { category: "Apples", column_00002: 34 },
        },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid chart-local identities");
    expect(result.error.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["columns", 0, "id"],
        ["rows", 0, "id"],
        ["rows", 0, "cells", "category"],
      ]),
    );
  });

  it("reports duplicate chart-local owners at the duplicate paths", () => {
    const result = ChartDataSourceSchema.safeParse({
      kind: "inlineTable",
      columns: [
        { id: "column_00001", label: "Category", valueType: "category" },
        { id: "column_00001", label: "Value", valueType: "number" },
      ],
      rows: [
        { id: "rowdata_0001", cells: { column_00001: "Apples" } },
        { id: "rowdata_0001", cells: { column_00001: "Bananas" } },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected duplicate chart-local owners");
    expect(result.error.issues.map(({ message, path }) => ({ message, path }))).toEqual([
      {
        message: 'duplicate chart column id "column_00001"',
        path: ["columns", 1, "id"],
      },
      {
        message: 'duplicate chart row id "rowdata_0001"',
        path: ["rows", 1, "id"],
      },
    ]);
  });

  it("requires chart settings owner and mapping identities to use the Data family", () => {
    const draft = chartDataToSettingsDraft(createChartSample("bar"));
    const result = ChartSettingsDraftSchema.safeParse({
      ...draft,
      table: {
        ...draft.table,
        columnIds: ["category", "value"],
        rowIds: ["row-1"],
      },
      mapping: {
        ...draft.mapping,
        category: "category",
        values: ["value"],
      },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid chart settings identities");
    expect(result.error.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["table", "columnIds", 0],
        ["table", "rowIds", 0],
        ["mapping", "category"],
        ["mapping", "values", 0],
      ]),
    );
  });

  it("creates schema-valid default encodings through chart profiles", () => {
    for (const chartType of ChartTypeSchema.options) {
      const chart = createChartSample(chartType);
      const encoding = createDefaultChartEncoding(chartType, chart.data);
      expect(
        ChartBlockDataSchema.safeParse({
          ...chart,
          chartType,
          encoding,
        }).success,
      ).toBe(true);
    }
  });

  it("normalizes invalid encoding back to the selected chart type", () => {
    const chart = createChartSample("bar");
    const invalid = {
      ...chart,
      encoding: createChartSample("pie").encoding,
    } as ChartBlockData;

    const normalized = normalizeChartData(invalid);

    expect(normalized.chartType).toBe("bar");
    expect(normalized.encoding.chartType).toBe("bar");
    expect(ChartBlockDataSchema.safeParse(normalized).success).toBe(true);
  });

  it("projects persisted chart data to a settings draft table", () => {
    const chart = createChartSample("bar");
    const draft = chartDataToSettingsDraft(chart);

    expect(draft.chartType).toBe("bar");
    expect(draft.table.headers).toEqual(chart.data.columns.map((column) => column.label));
    expect(draft.table.columnIds).toEqual(chart.data.columns.map((column) => column.id));
    expect(draft.table.rowIds).toEqual(chart.data.rows.map((row) => row.id));
    expect(draft.encoding).toEqual(chart.encoding);
  });

  it("maps a settings draft table back to schema-valid chart data", () => {
    const chart = createChartSample("bar");
    const draft = chartDataToSettingsDraft(chart);

    const next = chartSettingsDraftToData({
      ...draft,
      title: "Updated chart",
      table: {
        ...draft.table,
        rows: [
          ["Apples", "10"],
          ["Bananas", "15"],
        ],
      },
    });

    expect(ChartBlockDataSchema.safeParse(next).success).toBe(true);
    expect(next.title).toBe("Updated chart");
    expect(next.data.columns.map((column) => column.id)).toEqual(
      chart.data.columns.map((column) => column.id),
    );
    expect(next.data.rows).toHaveLength(2);
  });

  it("maps selected draft value series into persisted chart encoding", () => {
    const chart = createChartSample("line");
    const draft = chartDataToSettingsDraft(chart);
    const monthId = chart.data.columns.find((column) => column.label === "Month")!.id;
    const targetId = chart.data.columns.find((column) => column.label === "Target")!.id;

    const next = chartSettingsDraftToData({
      ...draft,
      mapping: {
        ...draft.mapping,
        values: [targetId],
      },
    });

    expect(next.encoding).toMatchObject({
      chartType: "line",
      x: { columnId: monthId },
      y: [{ columnId: targetId }],
    });
    expect(ChartBlockDataSchema.safeParse(next).success).toBe(true);
  });

  it("resets encoding when the settings draft changes chart type", () => {
    const chart = createChartSample("bar");
    const draft = chartDataToSettingsDraft(chart);

    const next = chartSettingsDraftToData({
      ...draft,
      chartType: "pie",
    });

    expect(next.chartType).toBe("pie");
    expect(next.encoding.chartType).toBe("pie");
    expect(ChartBlockDataSchema.safeParse(next).success).toBe(true);
  });

  it("uses draft mapping when changing to a different chart type", () => {
    const chart = createChartSample("bar");
    const draft = chartDataToSettingsDraft(chart);
    const categoryId = chart.data.columns.find((column) => column.label === "Category")!.id;
    const valueId = chart.data.columns.find((column) => column.label === "Value")!.id;

    const next = chartSettingsDraftToData({
      ...draft,
      chartType: "pie",
      mapping: {
        ...draft.mapping,
        label: categoryId,
        value: valueId,
      },
    });

    expect(next.encoding).toEqual({
      chartType: "pie",
      doughnut: false,
      label: { columnId: categoryId },
      value: { columnId: valueId },
    });
    expect(ChartBlockDataSchema.safeParse(next).success).toBe(true);
  });

  it("creates block-owned chart insertion variants from chart type definitions", () => {
    const variants = getChartCatalogVariants();

    expect(variants.map(({ content: _content, ...metadata }) => metadata)).toEqual(
      chartTypeDefinitions.map((definition) => ({
        description: definition.description,
        id: `chart-${definition.chartType}`,
        keywords: [
          "chart",
          "graph",
          definition.chartType,
          definition.label.toLowerCase(),
          definition.family,
        ],
        title: `${definition.label} chart`,
      })),
    );

    for (const [index, variant] of variants.entries()) {
      const chartType = CHART_TYPE_ORDER[index];
      const content = variant.content();

      expect(variant).not.toHaveProperty("chartType");
      expect(variant).not.toHaveProperty("nodeType");
      expect(variant).not.toHaveProperty("variantOf");
      expect(variant.keywords).toContain("chart");
      expect(content).toMatchObject({
        type: "chart_block",
        attrs: {
          data: {
            kind: "chart",
            chartType,
            encoding: { chartType },
          },
        },
      });
      expect(
        ChartBlockDataSchema.safeParse((content["attrs"] as Record<string, unknown>)["data"])
          .success,
      ).toBe(true);
    }
  });
});
