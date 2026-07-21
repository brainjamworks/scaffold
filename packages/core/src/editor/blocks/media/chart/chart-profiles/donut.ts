import type { DonutChartEncoding } from "@/schemas/shared";

import { emptyStateOption, isEmptyData } from "./empty-state";
import {
  DEFAULT_DONUT_RADIUS,
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

export const donutChartProfile: ChartProfile<DonutChartEncoding> = {
  chartType: "donut",
  createDefaultEncoding(source) {
    const { categoryColumn, valueColumn } = getDefaultChartColumns(source);
    return {
      chartType: "donut",
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
          radius: DEFAULT_DONUT_RADIUS,
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
    return pieResponsive(option, viewport, extractCurrentChart(option), "donut");
  },
};
