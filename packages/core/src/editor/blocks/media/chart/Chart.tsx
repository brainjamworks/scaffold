import { useMemo } from "react";

import type { ChartBlockData } from "@/schemas/shared";

import { compileChart } from "./chart-compiler";
import { ChartRenderer } from "./chart-renderer";

import "./chart.css";

export interface ChartProps {
  chart: ChartBlockData | null;
  showCaption?: boolean;
}

export function Chart({ chart, showCaption }: ChartProps) {
  const compiled = useMemo(() => (chart ? compileChart(chart) : null), [chart]);
  const accessibleName = chart
    ? chart.caption.trim() || chart.title?.trim() || "Chart"
    : "Chart";

  return (
    <figure className="sc-course-chart__figure">
      {compiled ? (
        <>
          <ChartRenderer
            option={compiled.option}
            ariaLabel={accessibleName}
            chartType={chart?.chartType}
          />
          <ChartDataTable accessibleName={accessibleName} table={compiled.table} />
        </>
      ) : (
        <div aria-hidden="true" className="sc-course-chart__fallback" />
      )}
      {showCaption && chart?.caption && chart.caption !== chart.title && (
        <figcaption className="sc-course-chart__caption">{chart.caption}</figcaption>
      )}
    </figure>
  );
}

interface ChartDataTableProps {
  accessibleName: string;
  table: ReturnType<typeof compileChart>["table"];
}

function ChartDataTable({ accessibleName, table }: ChartDataTableProps) {
  return (
    <div className="sc-sr-only">
      <table aria-label={`${accessibleName} data table`}>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column.id} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              {table.columns.map((column) => (
                <td key={column.id}>{row.cells[column.id] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
