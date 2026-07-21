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

  return (
    <figure className="sc-chart-block__figure">
      {compiled ? (
        <>
          <ChartRenderer
            option={compiled.option}
            ariaLabel={chart?.caption ?? ""}
            chartType={chart?.chartType}
            className="sc-chart-block__renderer"
          />
          <ChartDataTable table={compiled.table} />
        </>
      ) : (
        <div aria-hidden="true" className="sc-chart-block__fallback" />
      )}
      {showCaption && chart?.caption && chart.caption !== chart.title && (
        <figcaption className="sc-chart-block__caption">{chart.caption}</figcaption>
      )}
    </figure>
  );
}

interface ChartDataTableProps {
  table: ReturnType<typeof compileChart>["table"];
}

function ChartDataTable({ table }: ChartDataTableProps) {
  return (
    <div className="sc-sr-only">
      <table aria-label={`${table.caption} data table`}>
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
