import { createLazyRuntimeBlockNodeView } from "@/runtime/foundation/node-views/lazy-runtime-block-node-view";

import { chartBlockDefinition } from "./chart-definition";
import { createChartNode } from "./chart-node";

import "./chart.css";

function ChartRuntimeFallback() {
  return (
    <figure className="sc-chart-block__figure">
      <div aria-hidden="true" className="sc-chart-block__fallback" />
    </figure>
  );
}

export const ChartRuntimeExtension = createChartNode({
  addNodeView: () =>
    createLazyRuntimeBlockNodeView({
      definition: chartBlockDefinition,
      fallback: ChartRuntimeFallback,
      loadView: async () => {
        const mod = await import("./chart-body");
        return { default: mod.ChartBody };
      },
      wrapperClassName: "sc-chart-block",
    }),
});
