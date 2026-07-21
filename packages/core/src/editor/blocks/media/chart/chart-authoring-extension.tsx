import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { chartBlockDefinition } from "./chart-definition";
import { createChartNode } from "./chart-node";

import "./chart.css";

function ChartAuthoringFallback() {
  return (
    <figure className="sc-chart-block__figure">
      <div aria-hidden="true" className="sc-chart-block__fallback" />
    </figure>
  );
}

export const ChartAuthoringExtension = createChartNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: chartBlockDefinition,
      view: {
        fallback: ChartAuthoringFallback,
        load: async () => {
          const mod = await import("./chart-body");
          return { default: mod.ChartBody };
        },
      },
      className: "sc-chart-block",
    }),
});
