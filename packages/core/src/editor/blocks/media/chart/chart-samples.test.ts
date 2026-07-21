import { describe, expect, it } from "vite-plus/test";

import { CHART_TYPES, ChartBlockDataSchema, type ChartType } from "@/schemas/shared";

import { compileChart } from "./chart-compiler";
import { chartSamples, createChartSample } from "./chart-samples";

describe("chart samples", () => {
  it("provides one schema-valid sample for every chart type", () => {
    expect(Object.keys(chartSamples).sort()).toEqual([...CHART_TYPES].sort());

    for (const chartType of CHART_TYPES) {
      const sample = chartSamples[chartType];
      expect(sample.chartType).toBe(chartType);
      expect(sample.encoding.chartType).toBe(chartType);
      expect(ChartBlockDataSchema.safeParse(sample).success).toBe(true);
    }
  });

  it.each([...CHART_TYPES] satisfies ChartType[])("compiles the %s chart sample", (chartType) => {
    const sample = createChartSample(chartType);
    const compiled = compileChart(sample);

    expect(compiled.option["series"]).toBeDefined();
    expect(compiled.table.rows.length).toBeGreaterThan(0);
  });
});
