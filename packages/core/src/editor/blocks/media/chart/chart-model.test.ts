import { describe, expect, it } from "vite-plus/test";

import {
  CHART_TYPES,
  ChartBlockDataSchema,
  ChartTypeSchema,
  type ChartBlockData,
} from "@/schemas/shared";

import {
  chartDataToSettingsDraft,
  chartSettingsDraftToData,
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

    const next = chartSettingsDraftToData({
      ...draft,
      mapping: {
        ...draft.mapping,
        values: ["target"],
      },
    });

    expect(next.encoding).toMatchObject({
      chartType: "line",
      x: { columnId: "month" },
      y: [{ columnId: "target" }],
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

    const next = chartSettingsDraftToData({
      ...draft,
      chartType: "pie",
      mapping: {
        ...draft.mapping,
        label: "category",
        value: "value",
      },
    });

    expect(next.encoding).toEqual({
      chartType: "pie",
      doughnut: false,
      label: { columnId: "category" },
      value: { columnId: "value" },
    });
    expect(ChartBlockDataSchema.safeParse(next).success).toBe(true);
  });

  it("creates direct chart insertion variants from chart type definitions", () => {
    const variants = getChartCatalogVariants();

    expect(variants.map((variant) => variant.chartType)).toEqual(CHART_TYPE_ORDER);
    expect(variants.map((variant) => variant.id)).toEqual(
      CHART_TYPE_ORDER.map((chartType) => `chart-${chartType}`),
    );

    for (const variant of variants) {
      const content = variant.content();

      expect(variant.nodeType).toBe("chart_block");
      expect(variant.variantOf).toBe("chart");
      expect(variant.keywords).toContain("chart");
      expect(content).toMatchObject({
        type: "chart_block",
        attrs: {
          data: {
            kind: "chart",
            chartType: variant.chartType,
            encoding: { chartType: variant.chartType },
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
