import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { chartBlockDefinition } from "./chart-definition";
import { createChartNode } from "./chart-node";

import "./chart.css";

function ChartAuthoringFallback() {
  return (
    <figure className="sc-course-chart__figure">
      <div aria-hidden="true" className="sc-course-chart__fallback" />
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
      className: "sc-course-chart",
    }),
});
