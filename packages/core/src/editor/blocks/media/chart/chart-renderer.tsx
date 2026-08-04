import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { init, use as registerEChartsModules } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChartType } from "@/schemas/shared";
import { useCourseTheme } from "@/theme/course/CourseThemeProvider";

import {
  buildChartTheme,
  CHART_BODY_FONT_ROLE,
  CHART_INK_COLOUR_ROLE,
  CHART_MUTED_COLOUR_ROLE,
  readChartTokens,
  type ChartTokens,
} from "./chart-theme";
import { chartProfiles } from "./chart-profiles";
import type { ChartViewport } from "./chart-profiles/types";

registerEChartsModules([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

interface ChartRendererProps {
  option: Record<string, unknown>;
  ariaLabel: string;
  chartType?: ChartType | undefined;
}

/** Floor below which ECharts struggles to render axes / pie radius cleanly. */
const MIN_CHART_HEIGHT = 120;

/**
 * Thin wrapper around an ECharts instance. The renderer owns
 * lifecycle (mount, resize, dispose, error surface). Viewport-aware
 * layout decisions live on each profile's `responsive()` method, not
 * here — see `chart-profiles/*.ts`. The renderer only dispatches.
 */
export function ChartRenderer({ option, ariaLabel, chartType }: ChartRendererProps) {
  const courseTheme = useCourseTheme();
  const courseThemeRevision = [
    courseTheme.design.id,
    courseTheme.design.revision,
    courseTheme.colourSystem.id,
    courseTheme.colourSystem.revision,
    courseTheme.appearance,
  ].join(":");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ReturnType<typeof init> | null>(null);
  const [viewport, setViewport] = useState<ChartViewport | null>(null);
  const responsiveOption = useMemo(
    () => applyProfileResponsive(option, chartType, viewport),
    [option, chartType, viewport],
  );
  const latestOptionRef = useRef(responsiveOption);
  const latestAriaLabelRef = useRef(ariaLabel);
  const errorFrameRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publishRenderError = useCallback((next: string | null) => {
    if (errorFrameRef.current !== null) {
      cancelAnimationFrame(errorFrameRef.current);
    }
    errorFrameRef.current = requestAnimationFrame(() => {
      errorFrameRef.current = null;
      setError(next);
    });
  }, []);

  useEffect(() => {
    latestOptionRef.current = responsiveOption;
  }, [responsiveOption]);
  useEffect(() => {
    latestAriaLabelRef.current = ariaLabel;
  }, [ariaLabel]);

  useEffect(
    () => () => {
      if (errorFrameRef.current !== null) {
        cancelAnimationFrame(errorFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let frame = 0;

    const publishViewport = () => {
      const width = container.clientWidth;
      if (!Number.isFinite(width) || width <= 0) return;
      const nextHeight = Math.max(container.clientHeight, MIN_CHART_HEIGHT);
      setViewport((current) =>
        current?.width === width && current.height === nextHeight
          ? current
          : { height: nextHeight, width },
      );
    };

    const mountChart = () => {
      let instance: ReturnType<typeof init> | null = null;

      try {
        const tokens = readChartTokens(container);
        instance = init(container, buildChartTheme(tokens), {
          renderer: "canvas",
        });
        instanceRef.current = instance;
        instance.setOption(
          prepareChartOption(latestOptionRef.current, tokens, latestAriaLabelRef.current),
          { notMerge: true },
        );
        publishRenderError(null);
      } catch {
        instance?.dispose();
        instanceRef.current = null;
        publishRenderError("Chart could not be rendered.");
      }

      return instance;
    };

    const mountWhenMeasured = () => {
      if (disposed || instanceRef.current) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        frame = requestAnimationFrame(mountWhenMeasured);
        return;
      }

      publishViewport();
      mountChart();

      resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              publishViewport();
              instanceRef.current?.resize();
            });
      resizeObserver?.observe(container);
    };

    frame = requestAnimationFrame(mountWhenMeasured);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [courseThemeRevision, publishRenderError]);

  useEffect(() => {
    const instance = instanceRef.current;
    const container = containerRef.current;
    if (!instance || !container) return;

    try {
      const tokens = readChartTokens(container);
      instance.setOption(
        prepareChartOption(responsiveOption, tokens, ariaLabel),
        { notMerge: true },
      );
      publishRenderError(null);
    } catch {
      publishRenderError("Chart could not be rendered.");
    }
  }, [ariaLabel, responsiveOption, publishRenderError]);

  return (
    <>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        style={{ height: "100%", minHeight: `${MIN_CHART_HEIGHT}px` }}
        className="sc-course-chart__visual"
      />
      {error && (
        <p role="status" className="sc-course-chart__error">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * Dispatches to the profile's optional `responsive()` transform. Pure
 * passthrough when the chart type doesn't declare one or the viewport
 * isn't measured yet. Exposed for tests so each profile's responsive
 * behaviour can be exercised without mounting the renderer.
 */
export function applyProfileResponsive(
  option: Record<string, unknown>,
  chartType: ChartType | undefined,
  viewport: ChartViewport | null,
): Record<string, unknown> {
  if (!chartType || !viewport) return option;
  const profile = chartProfiles[chartType];
  if (!profile?.responsive) return option;
  return profile.responsive(option, viewport);
}

export function applyChartCourseTypography(
  option: Record<string, unknown>,
  bodyFont: string,
): Record<string, unknown> {
  return replaceChartFontRoles(option, bodyFont) as Record<string, unknown>;
}

export function applyChartCourseColours(
  option: Record<string, unknown>,
  colours: Pick<ChartTokens, "ink" | "muted">,
): Record<string, unknown> {
  return replaceChartColourRoles(option, colours) as Record<string, unknown>;
}

export function applyChartAccessibility(
  option: Record<string, unknown>,
  accessibleName: string,
): Record<string, unknown> {
  const aria = isRecord(option["aria"]) ? option["aria"] : {};
  const label = isRecord(aria["label"]) ? aria["label"] : {};
  const decal = isRecord(aria["decal"]) ? aria["decal"] : {};
  return {
    ...option,
    aria: {
      ...aria,
      enabled: true,
      label: { ...label, enabled: true, description: accessibleName },
      decal: { ...decal, show: true },
    },
  };
}

function prepareChartOption(
  option: Record<string, unknown>,
  tokens: ChartTokens,
  accessibleName: string,
): Record<string, unknown> {
  return applyChartAccessibility(
    applyChartCourseColours(applyChartCourseTypography(option, tokens.sans), tokens),
    accessibleName,
  );
}

function replaceChartFontRoles(value: unknown, bodyFont: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => replaceChartFontRoles(entry, bodyFont));
  }
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "fontFamily" && entry === CHART_BODY_FONT_ROLE
        ? bodyFont
        : replaceChartFontRoles(entry, bodyFont),
    ]),
  );
}

function replaceChartColourRoles(
  value: unknown,
  colours: Pick<ChartTokens, "ink" | "muted">,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => replaceChartColourRoles(entry, colours));
  }
  if (value === CHART_INK_COLOUR_ROLE) return colours.ink;
  if (value === CHART_MUTED_COLOUR_ROLE) return colours.muted;
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, replaceChartColourRoles(entry, colours)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
