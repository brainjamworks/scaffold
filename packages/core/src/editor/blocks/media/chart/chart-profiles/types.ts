import type { ChartBlockData, ChartDataSource, ChartEncoding } from "@/schemas/shared";

/**
 * Viewport hint passed to `responsive()` so each profile can adapt
 * its layout to the current container size without the renderer
 * embedding chart-type-specific transforms.
 */
export interface ChartViewport {
  width: number;
  height: number;
}

export interface ChartProfile<TEncoding extends ChartEncoding = ChartEncoding> {
  chartType: TEncoding["chartType"];
  compile: (chart: ChartBlockData, encoding: TEncoding) => Record<string, unknown>;
  createDefaultEncoding: (source: ChartDataSource) => TEncoding;
  /**
   * Viewport-adaptive transform applied after compile. Receives the
   * compiled option and the current viewport; returns the option to
   * actually render. Pure: must not mutate inputs.
   *
   * Profiles use this to flip orientation, drop labels at small radius,
   * swap visualMap orientation, add inside-pan zoom when categories
   * are dense, etc. Anything that needs to know the container size.
   */
  responsive?: (
    option: Record<string, unknown>,
    viewport: ChartViewport,
  ) => Record<string, unknown>;
}
