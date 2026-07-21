import type { PieChartEncoding } from "@/schemas/shared";

import { emptyStateOption, isEmptyData } from "./empty-state";
import {
  DEFAULT_PIE_RADIUS,
  defaultPieCenter,
  extractCurrentChart,
  pieResponsive,
  pieRichLabel,
} from "./pie-shared";
import type { ChartProfile } from "./types";
import {
  baseOption,
  getDefaultChartColumns,
  numberCell,
  requireColumn,
  stringifyCell,
} from "./shared";

export const pieChartProfile: ChartProfile<PieChartEncoding> = {
  chartType: "pie",
  createDefaultEncoding(source) {
    const { categoryColumn, valueColumn } = getDefaultChartColumns(source);
    return {
      chartType: "pie",
      doughnut: false,
      label: { columnId: categoryColumn.id },
      value: { columnId: valueColumn.id },
    };
  },
  compile(chart, encoding) {
    const source = chart.data;
    const valueColumn = requireColumn(source, encoding.value.columnId);
    if (isEmptyData(source, [valueColumn])) {
      return emptyStateOption(chart);
    }
    const labelColumn = requireColumn(source, encoding.label.columnId);

    return {
      ...baseOption(chart, "item"),
      series: [
        {
          name: valueColumn.label,
          type: "pie",
          radius: encoding.doughnut ? ["40%", "72%"] : DEFAULT_PIE_RADIUS,
          center: defaultPieCenter(chart),
          avoidLabelOverlap: true,
          data: source.rows.map((row) => ({
            name: stringifyCell(row.cells[labelColumn.id]),
            value: numberCell(row.cells[valueColumn.id]),
          })),
          label: pieRichLabel(),
          labelLine: { length: 12, length2: 8, smooth: 0.2 },
        },
      ],
    };
  },
  responsive(option, viewport) {
    // We always recompute — even at wide canvases the header-stack-aware
    // centring beats the static percentage default. Label strategy
    // switches by rendered radius and width.
    return pieResponsive(option, viewport, extractCurrentChart(option), "pie");
  },
};
