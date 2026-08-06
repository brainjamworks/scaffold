import type { ChartBlockData, ChartColumn, ChartDataSource } from "@/schemas/shared";

import {
  CHART_BODY_FONT_ROLE,
  CHART_INK_COLOUR_ROLE,
  CHART_MUTED_COLOUR_ROLE,
} from "../chart-theme";
import { baseOption } from "./shared";

/**
 * Empty-state branch: when there's no plottable data, render a quiet
 * centred message via the `graphic` component instead of an empty
 * plot area. Keeps the block visually intentional rather than broken.
 *
 * The chart title / subtitle / legend still render from the header
 * stack so context isn't lost.
 */
export function emptyStateOption(chart: ChartBlockData): Record<string, unknown> {
  return {
    ...baseOption(chart, "item"),
    graphic: [
      {
        type: "group",
        left: "center",
        top: "middle",
        children: [
          {
            type: "text",
            silent: true,
            style: {
              text: "No data to display",
              fontFamily: CHART_BODY_FONT_ROLE,
              fontSize: 13,
              fontWeight: 500,
              fill: CHART_INK_COLOUR_ROLE,
              textAlign: "center",
            },
          },
          {
            type: "text",
            y: 22,
            silent: true,
            style: {
              text: "Add rows to the data table to plot this chart",
              fontFamily: CHART_BODY_FONT_ROLE,
              fontSize: 11,
              fill: CHART_MUTED_COLOUR_ROLE,
              textAlign: "center",
            },
          },
        ],
      },
    ],
  };
}

/**
 * Empty when every plottable cell is null/missing across the y series.
 * Real zeros count as data (a value of 0 is meaningful for bar/line);
 * only completely absent values trigger the empty state.
 */
export function isEmptyData(source: ChartDataSource, yColumns: ChartColumn[]): boolean {
  if (!source.rows.length || !yColumns.length) return true;
  return yColumns.every((column) =>
    source.rows.every((row) => {
      const value = row.cells[column.id];
      return value === null || value === undefined || value === "";
    }),
  );
}
