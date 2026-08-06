// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import {
  CHART_TYPES,
  ChartBlockDataSchema,
  type ChartBlockData,
  type ChartColumnId,
  type ChartType,
} from "@/schemas/shared";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";

import { chartProfiles } from "./chart-profiles";
import { compileChart, defaultEncodingFor } from "./chart-compiler";
import { createChartSample } from "./chart-samples";

describe("chart compiler", () => {
  it("has a chart profile for every schema-supported chart type", () => {
    expect(Object.keys(chartProfiles).sort()).toEqual([...CHART_TYPES].sort());
  });

  it.each([...CHART_TYPES] satisfies ChartType[])(
    "creates a schema-valid default %s encoding from profile metadata",
    (chartType) => {
      const chart = createChartSample(chartType);
      const encoding = defaultEncodingFor(chartType, chart.data);

      expect(
        ChartBlockDataSchema.safeParse({
          ...chart,
          chartType,
          encoding,
        }).success,
      ).toBe(true);
      expect(encoding.chartType).toBe(chartType);
    },
  );

  it("keeps existing cartesian default encoding semantics", () => {
    const barChart = createChartSample("bar");
    const comboChart = createChartSample("combo");
    const lineChart = createChartSample("line");
    const areaChart = createChartSample("area");

    expect(defaultEncodingFor("bar", barChart.data)).toEqual({
      chartType: "bar",
      orientation: "vertical",
      stacked: false,
      x: { columnId: columnIdByLabel(barChart, "Category") },
      y: [{ columnId: columnIdByLabel(barChart, "Value") }],
    });
    expect(defaultEncodingFor("combo", comboChart.data)).toEqual({
      bars: [{ columnId: columnIdByLabel(comboChart, "Actual") }],
      chartType: "combo",
      lines: [{ columnId: columnIdByLabel(comboChart, "Target") }],
      x: { columnId: columnIdByLabel(comboChart, "Month") },
    });
    expect(defaultEncodingFor("line", lineChart.data)).toEqual({
      chartType: "line",
      area: false,
      smooth: false,
      stacked: false,
      x: { columnId: columnIdByLabel(lineChart, "Month") },
      y: [
        { columnId: columnIdByLabel(lineChart, "Actual") },
        { columnId: columnIdByLabel(lineChart, "Target") },
      ],
    });
    expect(defaultEncodingFor("area", areaChart.data)).toEqual({
      chartType: "area",
      smooth: false,
      stacked: false,
      x: { columnId: columnIdByLabel(areaChart, "Month") },
      y: [
        { columnId: columnIdByLabel(areaChart, "Actual") },
        { columnId: columnIdByLabel(areaChart, "Target") },
      ],
    });
    expect(defaultEncodingFor("donut", barChart.data)).toEqual({
      chartType: "donut",
      label: { columnId: columnIdByLabel(barChart, "Category") },
      value: { columnId: columnIdByLabel(barChart, "Value") },
    });
  });

  it("creates a numeric x/y default encoding for scatter charts", () => {
    const chart = createChartSample("scatter");
    expect(defaultEncodingFor("scatter", chart.data)).toEqual({
      chartType: "scatter",
      x: { columnId: columnIdByLabel(chart, "Study hours") },
      y: { columnId: columnIdByLabel(chart, "Score") },
    });
  });

  it("creates a numeric value default encoding for histogram charts", () => {
    const chart = createChartSample("histogram");
    expect(defaultEncodingFor("histogram", chart.data)).toEqual({
      chartType: "histogram",
      value: { columnId: columnIdByLabel(chart, "Score") },
    });
  });

  it("creates a category/category/value default encoding for heatmap charts", () => {
    const chart = createChartSample("heatmap");
    expect(defaultEncodingFor("heatmap", chart.data)).toEqual({
      chartType: "heatmap",
      x: { columnId: columnIdByLabel(chart, "Week") },
      y: { columnId: columnIdByLabel(chart, "Activity") },
      value: { columnId: columnIdByLabel(chart, "Completion") },
    });
  });

  it("compiles authored chart data to an ECharts bar option", () => {
    const chart = createChartSample("bar");
    const compiled = compileChart(chart);

    expect(compiled.option).toMatchObject({
      xAxis: { type: "category" },
      yAxis: { type: "value" },
    });
    expect(compiled.option["series"]).toMatchObject([
      { type: "bar", name: "Value", data: [34, 22, 18, 11, 15] },
    ]);
    expect(compiled.table.rows[0]?.cells[columnIdByLabel(chart, "Category")]).toBe("Apples");
  });

  it("compiles combo charts to mixed bar and line series", () => {
    const compiled = compileChart(createChartSample("combo"));

    expect(compiled.option).toMatchObject({
      xAxis: { type: "category" },
      yAxis: { type: "value" },
    });
    expect(compiled.option["series"]).toMatchObject([
      {
        type: "bar",
        name: "Actual",
        data: [42, 48, 55, 61, 66, 72],
      },
      {
        type: "line",
        name: "Target",
        data: [45, 50, 54, 58, 63, 68],
      },
    ]);
  });

  it("switches the default encoding for pie charts", () => {
    const compiled = compileChart(createChartSample("pie"));

    expect(compiled.option["series"]).toMatchObject([
      {
        type: "pie",
        data: [
          { name: "Apples", value: 34 },
          { name: "Bananas", value: 22 },
          { name: "Cherries", value: 18 },
          { name: "Dates", value: 11 },
          { name: "Grapes", value: 15 },
        ],
      },
    ]);
  });

  it("compiles donut charts as pie series with an inner radius", () => {
    const compiled = compileChart(createChartSample("donut"));

    expect(compiled.option["series"]).toMatchObject([
      {
        type: "pie",
        radius: ["40%", "72%"],
        data: [
          { name: "Apples", value: 34 },
          { name: "Bananas", value: 22 },
          { name: "Cherries", value: 18 },
          { name: "Dates", value: 11 },
          { name: "Grapes", value: 15 },
        ],
      },
    ]);
  });

  it("compiles scatter charts to value axes and point pairs", () => {
    const compiled = compileChart(createChartSample("scatter"));

    expect(compiled.option).toMatchObject({
      xAxis: { type: "value" },
      yAxis: { type: "value" },
    });
    expect(compiled.option["series"]).toMatchObject([
      {
        type: "scatter",
        name: "Score",
        data: [
          [1, 54],
          [2, 58],
          [3, 65],
          [4, 70],
          [5, 76],
          [6, 82],
        ],
      },
    ]);
  });

  it("compiles area charts to filled line series", () => {
    const compiled = compileChart(createChartSample("area"));

    expect(compiled.option).toMatchObject({
      xAxis: { type: "category", boundaryGap: false },
      yAxis: { type: "value" },
    });
    expect(compiled.option["series"]).toMatchObject([
      {
        type: "line",
        name: "Actual",
        data: [42, 48, 55, 61, 66, 72],
        areaStyle: { opacity: 0.12 },
      },
      {
        type: "line",
        name: "Target",
        data: [45, 50, 54, 58, 63, 68],
        areaStyle: { opacity: 0.12 },
      },
    ]);
  });

  it("compiles histogram charts to automatic numeric bins", () => {
    const chart = histogramFixture();
    const encoding = defaultEncodingFor("histogram", chart.data);
    const compiled = compileChart({
      ...chart,
      chartType: "histogram",
      encoding,
    });

    expect(compiled.option).toMatchObject({
      xAxis: {
        type: "category",
        data: ["1-3.67", "3.67-6.33", "6.33-9"],
      },
      yAxis: { type: "value" },
    });
    expect(compiled.option["series"]).toMatchObject([
      {
        type: "bar",
        name: "Score",
        data: [3, 3, 3],
      },
    ]);
  });

  it("compiles equal histogram values to one bin", () => {
    const chart = histogramFixture([4, 4, 4]);
    const encoding = defaultEncodingFor("histogram", chart.data);
    const compiled = compileChart({
      ...chart,
      chartType: "histogram",
      encoding,
    });

    expect(compiled.option["xAxis"]).toMatchObject({
      data: ["4"],
    });
    expect(compiled.option["series"]).toMatchObject([{ data: [3] }]);
  });

  it("compiles heatmap charts to categorical axes and heatmap points", () => {
    const compiled = compileChart(createChartSample("heatmap"));

    expect(compiled.option).toMatchObject({
      xAxis: {
        type: "category",
        data: ["Week 1", "Week 2", "Week 3"],
      },
      yAxis: {
        type: "category",
        data: ["Reading", "Practice", "Quiz"],
      },
      visualMap: {
        min: 48,
        max: 86,
        calculable: true,
        orient: "horizontal",
      },
    });
    expect(compiled.option["series"]).toMatchObject([
      {
        type: "heatmap",
        name: "Completion",
        data: [
          [0, 0, 62],
          [0, 1, 48],
          [0, 2, 72],
          [1, 0, 70],
          [1, 1, 58],
          [1, 2, 81],
          [2, 0, 76],
          [2, 1, 64],
          [2, 2, 86],
        ],
      },
    ]);
  });
});

function histogramFixture(values = [1, 2, 3, 4, 5, 6, 7, 8, 9]): ChartBlockData {
  const chart = createChartSample("histogram");
  const sampleColumn = chart.data.columns[0];
  const scoreColumn = chart.data.columns[1];
  if (!sampleColumn || !scoreColumn) throw new Error("Expected histogram sample columns");

  return {
    ...chart,
    data: {
      ...chart.data,
      rows: values.map((value, index) => ({
        id: createEmbeddedDataId(),
        cells: {
          [sampleColumn.id]: `S${index + 1}`,
          [scoreColumn.id]: value,
        },
      })),
    },
  };
}

function columnIdByLabel(chart: ChartBlockData, label: string): ChartColumnId {
  const column = chart.data.columns.find((candidate) => candidate.label === label);
  if (!column) throw new Error(`Expected chart column labeled "${label}"`);
  return column.id;
}
