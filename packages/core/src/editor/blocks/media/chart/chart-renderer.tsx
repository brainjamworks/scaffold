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
import { init, registerTheme, use as registerEChartsModules } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChartType } from "@/schemas/shared";
import { cn } from "@/lib/cn";

import { buildChartTheme, SCAFFOLD_CHART_THEME_NAME, readChartTokens } from "./chart-theme";
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

// Register the scaffold theme once at module load. Reads CSS custom
// properties from documentElement so palette/fonts pick up the brand
// values; SSR / test environments fall back to the default brand
// tokens defined in chart-theme.ts.
registerTheme(
  SCAFFOLD_CHART_THEME_NAME,
  buildChartTheme(
    readChartTokens(typeof document !== "undefined" ? document.documentElement : null),
  ),
);

interface ChartRendererProps {
  option: Record<string, unknown>;
  ariaLabel: string;
  chartType?: ChartType | undefined;
  className?: string;
}

/** Floor below which ECharts struggles to render axes / pie radius cleanly. */
const MIN_CHART_HEIGHT = 120;

/**
 * Thin wrapper around an ECharts instance. The renderer owns
 * lifecycle (mount, resize, dispose, error surface). Viewport-aware
 * layout decisions live on each profile's `responsive()` method, not
 * here — see `chart-profiles/*.ts`. The renderer only dispatches.
 */
export function ChartRenderer({ option, ariaLabel, chartType, className }: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ReturnType<typeof init> | null>(null);
  const [viewport, setViewport] = useState<ChartViewport | null>(null);
  const responsiveOption = useMemo(
    () => applyProfileResponsive(option, chartType, viewport),
    [option, chartType, viewport],
  );
  const latestOptionRef = useRef(responsiveOption);
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

    const mountWhenMeasured = () => {
      if (disposed || instanceRef.current) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        frame = requestAnimationFrame(mountWhenMeasured);
        return;
      }

      publishViewport();

      const instance = init(container, SCAFFOLD_CHART_THEME_NAME, {
        renderer: "canvas",
      });
      instanceRef.current = instance;

      try {
        instance.setOption(latestOptionRef.current, { notMerge: true });
        publishRenderError(null);
      } catch {
        publishRenderError("Chart could not be rendered.");
      }

      resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              publishViewport();
              instance.resize();
            });
      resizeObserver?.observe(container);
    };

    mountWhenMeasured();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [publishRenderError]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    try {
      instance.setOption(responsiveOption, { notMerge: true });
      publishRenderError(null);
    } catch {
      publishRenderError("Chart could not be rendered.");
    }
  }, [responsiveOption, publishRenderError]);

  return (
    <>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        style={{ height: "100%", minHeight: `${MIN_CHART_HEIGHT}px` }}
        className={cn("sc-chart-renderer", className)}
      />
      {error && (
        <p role="status" className="sc-chart-renderer__error">
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
