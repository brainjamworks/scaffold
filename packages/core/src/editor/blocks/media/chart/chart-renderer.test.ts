// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { cartesianGridLabelBounds } from "./chart-profiles/shared";
import { pieResponsive, pieRichLabel } from "./chart-profiles/pie-shared";
import {
  applyChartCourseColours,
  applyChartCourseGeometry,
  applyChartCourseTypography,
  applyChartAccessibility,
  applyProfileResponsive,
} from "./chart-renderer";
import {
  buildChartTheme,
  CHART_BACKGROUND_COLOUR_ROLE,
  CHART_BAR_RADIUS_ROLE,
  CHART_BODY_FONT_ROLE,
  CHART_INK_COLOUR_ROLE,
  CHART_MUTED_COLOUR_ROLE,
  readChartTokens,
} from "./chart-theme";

describe("chart theme baseline", () => {
  it("reads public Course/Radix values and the Flow canvas recipe from its supplied scope", () => {
    const originalGetComputedStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (() =>
      ({
        getPropertyValue: (name: string) =>
          ({
            "--accent-a3": "rgba(79, 70, 229, 0.12)",
            "--color-panel-solid": "#fefefe",
            "--gray-11": "#666666",
            "--gray-12": "#111111",
            "--gray-a4": "rgba(17, 17, 17, 0.08)",
            "--gray-a6": "rgba(17, 17, 17, 0.16)",
            "--shadow-4": "0 8px 24px rgba(0, 0, 0, 0.12)",
            "--default-font-family": "Baseline Sans",
            "--heading-font-family": "Baseline Heading",
            "--sc-course-data-series-1": "#110000",
            "--sc-course-data-series-2": "#220000",
            "--sc-course-data-series-3": "#330000",
            "--sc-course-data-series-4": "#440000",
            "--sc-course-data-series-5": "#550000",
            "--sc-course-data-series-6": "#660000",
            "--sc-course-data-series-7": "#770000",
            "--sc-course-data-series-8": "#880000",
            "--sc-course-chart-axis-font-size": "11",
            "--sc-course-chart-compact-font-size": "10",
            "--sc-course-chart-supporting-font-size": "12",
            "--sc-course-chart-body-font-size": "13",
            "--sc-course-chart-title-font-size": "17",
            "--sc-course-chart-bar-radius": "6",
            "--sc-course-chart-tooltip-radius": "12",
            "--sc-course-chart-pie-radius": "6",
            "--sc-course-chart-symbol-size": "8",
            "--sc-course-chart-line-width": "2.5",
            "--sc-course-chart-line-emphasis-scale": "1.3",
            "--sc-course-chart-series-emphasis-size": "6",
          })[name] ?? "",
      }) as CSSStyleDeclaration) as typeof getComputedStyle;

    try {
      const tokens = readChartTokens({} as Element);
      const theme = buildChartTheme(tokens);

      expect(tokens).toMatchObject({
        background: "#fefefe",
        border: "rgba(17, 17, 17, 0.16)",
        borderSubtle: "rgba(17, 17, 17, 0.08)",
        ink: "#111111",
        muted: "#666666",
        sans: "Baseline Sans",
        heading: "Baseline Heading",
        axisPointerWash: "rgba(79, 70, 229, 0.12)",
        tooltipShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
        palette: [
          "#110000",
          "#220000",
          "#330000",
          "#440000",
          "#550000",
          "#660000",
          "#770000",
          "#880000",
        ],
        fontSizeAxis: 11,
        fontSizeCompact: 10,
        fontSizeSupporting: 12,
        fontSizeBody: 13,
        fontSizeTitle: 17,
        radiusBar: 6,
        radiusTooltip: 12,
        radiusPie: 6,
        symbolSize: 8,
        lineWidth: 2.5,
        emphasisScaleLine: 1.3,
        emphasisScaleSize: 6,
      });
      expect(theme["textStyle"]).toMatchObject({
        color: "#111111",
        fontFamily: "Baseline Sans",
      });
      expect(theme["categoryAxis"]).toMatchObject({
        axisLabel: { fontFamily: "Baseline Sans" },
      });
      expect(theme["title"]).toMatchObject({
        textStyle: { fontFamily: "Baseline Heading", fontSize: 17 },
      });
    } finally {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });

  it("projects the course body font through profile-generated chart text", () => {
    const option = {
      graphic: [
        {
          type: "text",
          style: {
            text: "No data to display",
            fontFamily: CHART_BODY_FONT_ROLE,
          },
        },
      ],
      series: [
        {
          label: {
            rich: {
              percent: {
                fontFamily: CHART_BODY_FONT_ROLE,
              },
            },
          },
        },
      ],
    };

    expect(applyChartCourseTypography(option, "Course Body")).toMatchObject({
      graphic: [{ style: { fontFamily: "Course Body" } }],
      series: [{ label: { rich: { percent: { fontFamily: "Course Body" } } } }],
    });
  });

  it("projects course text colours through profile-generated chart text", () => {
    const option = {
      graphic: [
        { style: { fill: CHART_INK_COLOUR_ROLE } },
        { style: { fill: CHART_MUTED_COLOUR_ROLE } },
        { style: { fill: CHART_BACKGROUND_COLOUR_ROLE } },
      ],
      xAxis: {
        nameTextStyle: { color: CHART_MUTED_COLOUR_ROLE },
      },
    };

    expect(
      applyChartCourseColours(option, {
        background: "#18181b",
        ink: "#f5f3ff",
        muted: "#a78bfa",
      }),
    ).toEqual({
      graphic: [
        { style: { fill: "#f5f3ff" } },
        { style: { fill: "#a78bfa" } },
        { style: { fill: "#18181b" } },
      ],
      xAxis: {
        nameTextStyle: { color: "#a78bfa" },
      },
    });
  });

  it("projects the Course bar radius through profile geometry", () => {
    expect(
      applyChartCourseGeometry(
        {
          series: [
            { itemStyle: { borderRadius: [0, CHART_BAR_RADIUS_ROLE, CHART_BAR_RADIUS_ROLE, 0] } },
          ],
        },
        { radiusBar: 0 },
      ),
    ).toEqual({ series: [{ itemStyle: { borderRadius: [0, 0, 0, 0] } }] });
  });

  it("uses Course ink and surface roles for pie labels instead of series colours", () => {
    expect(pieRichLabel()).toMatchObject({
      rich: {
        name: { color: CHART_INK_COLOUR_ROLE },
        percent: { color: CHART_INK_COLOUR_ROLE },
      },
    });

    const responsive = pieResponsive(
      { series: [{ type: "pie" }] },
      { height: 256, width: 280 },
      { showLegend: false, subtitle: "", title: "" },
      "pie",
    );
    expect(responsive["series"]).toMatchObject([
      {
        label: {
          backgroundColor: CHART_BACKGROUND_COLOUR_ROLE,
          color: CHART_INK_COLOUR_ROLE,
        },
      },
    ]);
  });

  it("sets explicit ECharts naming and restrained non-colour differentiation", () => {
    expect(applyChartAccessibility({ aria: { enabled: false } }, "Learner confidence")).toEqual({
      aria: {
        enabled: true,
        label: { enabled: true, description: "Learner confidence" },
        decal: { show: true },
      },
    });
  });
});

describe("chart profile responsive dispatch", () => {
  it("flips vertical bar charts to horizontal in compact containers", () => {
    const option = {
      grid: {
        top: 16,
        right: 16,
        bottom: 24,
        left: 16,
        ...cartesianGridLabelBounds(),
      },
      xAxis: { type: "category", data: ["Apples", "Bananas"] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [12, 18] }],
    };

    const responsive = applyProfileResponsive(option, "bar", {
      height: 256,
      width: 420,
    });

    expect(responsive["xAxis"]).toEqual({ type: "value" });
    expect(responsive["yAxis"]).toEqual({
      type: "category",
      data: ["Apples", "Bananas"],
    });
    expect(responsive["series"]).toMatchObject([
      {
        type: "bar",
        itemStyle: {
          borderRadius: [0, CHART_BAR_RADIUS_ROLE, CHART_BAR_RADIUS_ROLE, 0],
        },
      },
    ]);
    // Pure: input unchanged.
    expect(option["xAxis"]).toEqual({
      type: "category",
      data: ["Apples", "Bananas"],
    });
  });

  it("leaves bars alone in roomy containers", () => {
    const option = {
      xAxis: { type: "category", data: ["A", "B"] },
      yAxis: { type: "value" },
      series: [{ type: "bar" }],
    };

    const responsive = applyProfileResponsive(option, "bar", {
      height: 360,
      width: 720,
    });
    expect(responsive["xAxis"]).toEqual(option["xAxis"]);
    expect(responsive["yAxis"]).toEqual(option["yAxis"]);
    expect(responsive["dataZoom"]).toBeUndefined();
  });

  it("adds inside-only data zoom for line charts when category band gets dense", () => {
    // 20 categories at 280px wide → band ≈ 11px (below DENSE_BAND of 24).
    const data = Array.from({ length: 20 }, (_, i) => `C${i + 1}`);
    const option = {
      grid: {
        top: 16,
        right: 16,
        bottom: 24,
        left: 16,
        ...cartesianGridLabelBounds(),
      },
      xAxis: { type: "category", data },
      yAxis: { type: "value" },
      series: [{ type: "line", data: data.map((_, i) => i + 1) }],
    };

    const responsive = applyProfileResponsive(option, "line", {
      height: 256,
      width: 280,
    });

    expect(responsive["dataZoom"]).toMatchObject([{ type: "inside", xAxisIndex: 0 }]);
  });

  it("flips bars and engages density chip when category band gets tight", () => {
    // 20 categories at 256px tall after flip = ~9px band per row → dense.
    const data = Array.from({ length: 20 }, (_, i) => `Cat ${i + 1}`);
    const option = {
      grid: {
        top: 16,
        right: 16,
        bottom: 24,
        left: 16,
        ...cartesianGridLabelBounds(),
      },
      xAxis: { type: "category", data },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: data.map((_, i) => i + 1) }],
    };

    const responsive = applyProfileResponsive(option, "bar", {
      height: 256,
      width: 420,
    });

    expect(responsive["xAxis"]).toEqual({ type: "value" });
    expect((responsive["yAxis"] as Record<string, unknown>)["type"]).toBe("category");
    expect(responsive["dataZoom"]).toMatchObject([{ type: "inside", yAxisIndex: 0 }]);
    // Density chip discoverability for inside-pan.
    expect(responsive["graphic"]).toBeInstanceOf(Array);
  });

  it("skips zoom when category band is comfortable", () => {
    // 6 categories at 256px tall after flip = ~32px band per row → fine.
    const option = {
      grid: {
        top: 16,
        right: 16,
        bottom: 24,
        left: 16,
        ...cartesianGridLabelBounds(),
      },
      xAxis: {
        type: "category",
        data: ["One", "Two", "Three", "Four", "Five", "Six"],
      },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [1, 2, 3, 4, 5, 6] }],
    };

    const responsive = applyProfileResponsive(option, "bar", {
      height: 256,
      width: 420,
    });

    expect(responsive["dataZoom"]).toBeUndefined();
    expect(responsive["graphic"]).toBeUndefined();
  });

  it("drops pie labels in narrow containers", () => {
    const option = {
      series: [
        {
          type: "pie",
          radius: "68%",
          data: [
            { name: "A", value: 50 },
            { name: "B", value: 5 },
          ],
          label: { formatter: "{b}\n{d}%" },
          labelLine: { length: 12, length2: 8 },
        },
      ],
    };
    const responsive = applyProfileResponsive(option, "pie", {
      height: 256,
      width: 280,
    });
    const series = (responsive["series"] as Array<Record<string, unknown>>)[0];
    if (!series) throw new Error("Expected a responsive pie series");
    expect((series["labelLine"] as Record<string, unknown>)["show"]).toBe(false);
    expect((series["label"] as Record<string, unknown>)["position"]).toBe("inside");
  });

  it("reserves space and edge-aligns outer pie labels", () => {
    const option = {
      series: [
        {
          type: "pie",
          radius: "68%",
          data: [
            { name: "Apples", value: 34 },
            { name: "Bananas", value: 22 },
            { name: "Cherries", value: 18 },
            { name: "Dates", value: 11 },
            { name: "Grapes", value: 15 },
          ],
          label: { formatter: "{b}\n{d}%" },
          labelLine: { length: 12, length2: 8 },
        },
      ],
    };
    const responsive = applyProfileResponsive(option, "pie", {
      height: 325,
      width: 394,
    });
    const series = (responsive["series"] as Array<Record<string, unknown>>)[0];
    if (!series) throw new Error("Expected a responsive pie series");

    expect(series["radius"]).toBeLessThanOrEqual(110);
    expect(series["label"]).toMatchObject({
      alignTo: "edge",
      bleedMargin: 4,
      distanceToLabelLine: 6,
      edgeDistance: 16,
      position: "outside",
    });
  });

  it("returns option unchanged when chartType is missing", () => {
    const option = { series: [] };
    expect(applyProfileResponsive(option, undefined, { width: 100, height: 100 })).toBe(option);
  });
});
