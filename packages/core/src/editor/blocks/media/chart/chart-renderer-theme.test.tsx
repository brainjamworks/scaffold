// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createDefaultPersistedCourseTheme } from "@/theme/course";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import { ChartRenderer } from "./chart-renderer";

const echarts = vi.hoisted(() => ({
  init: vi.fn(),
  instances: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    setOption: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("echarts/charts", () => ({
  BarChart: {},
  HeatmapChart: {},
  LineChart: {},
  PieChart: {},
  ScatterChart: {},
}));
vi.mock("echarts/components", () => ({
  AriaComponent: {},
  DataZoomComponent: {},
  GridComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  TooltipComponent: {},
  VisualMapComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));
vi.mock("echarts/core", () => ({ init: echarts.init, use: vi.fn() }));

beforeEach(() => {
  echarts.instances.length = 0;
  echarts.init.mockReset();
  echarts.init.mockImplementation(() => {
    const instance = { dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() };
    echarts.instances.push(instance);
    return instance;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(360);
  vi.spyOn(globalThis, "getComputedStyle").mockImplementation(
    (element) =>
      ({
        getPropertyValue: (name: string) => chartToken(name, element.closest(".dark") !== null),
      }) as CSSStyleDeclaration,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChartRenderer Course theme redraw", () => {
  it("recreates ECharts after Course appearance changes commit", async () => {
    const theme = createDefaultPersistedCourseTheme();
    const { rerender } = render(
      <CourseThemeProvider appearance="light" theme={theme}>
        <ChartRenderer ariaLabel="Learner confidence" chartType="bar" option={{ series: [] }} />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(echarts.init).toHaveBeenCalledOnce());
    const firstTheme = echarts.init.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(firstTheme["textStyle"]).toMatchObject({ color: "#111111" });

    rerender(
      <CourseThemeProvider appearance="dark" theme={theme}>
        <ChartRenderer ariaLabel="Learner confidence" chartType="bar" option={{ series: [] }} />
      </CourseThemeProvider>,
    );

    await waitFor(() => expect(echarts.init).toHaveBeenCalledTimes(2));
    expect(echarts.instances[0]?.dispose).toHaveBeenCalledOnce();
    const secondTheme = echarts.init.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(secondTheme["textStyle"]).toMatchObject({ color: "#f5f5f5" });
  });
});

function chartToken(name: string, dark: boolean): string {
  const values: Record<string, string> = {
    "--accent-a3": dark ? "rgba(129, 140, 248, 0.16)" : "rgba(79, 70, 229, 0.12)",
    "--color-panel-solid": dark ? "#18181b" : "#ffffff",
    "--gray-11": dark ? "#d4d4d8" : "#52525b",
    "--gray-12": dark ? "#f5f5f5" : "#111111",
    "--gray-a4": dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
    "--gray-a6": dark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.16)",
    "--shadow-4": "0 8px 24px rgba(0,0,0,.12)",
    "--default-font-family": "Chart Sans",
    "--heading-font-family": "Chart Heading",
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
  };
  if (name.startsWith("--sc-course-data-series-")) return "#4f46e5";
  return values[name] ?? "";
}
