import { describe, expect, it } from "vite-plus/test";

import { cartesianGridLabelBounds } from "./chart-profiles/shared";
import { applyProfileResponsive } from "./chart-renderer";

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
      { type: "bar", itemStyle: { borderRadius: [0, 6, 6, 0] } },
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
    expect(series).toBeDefined();
    expect((series?.["labelLine"] as Record<string, unknown>)["show"]).toBe(false);
    expect((series?.["label"] as Record<string, unknown>)["position"]).toBe("inside");
  });

  it("returns option unchanged when chartType is missing", () => {
    const option = { series: [] };
    expect(applyProfileResponsive(option, undefined, { width: 100, height: 100 })).toBe(option);
  });
});
