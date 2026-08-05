import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { embedBlockDefinition } from "./embed-definition";
import { createEmbedNode } from "./node";

import "./Embed.css";

function EmbedAuthoringFallback() {
  return <div aria-hidden="true" className="sc-course-embed__fallback" />;
}

export const EmbedAuthoringExtension = createEmbedNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-course-embed",
      definition: embedBlockDefinition,
      view: {
        fallback: EmbedAuthoringFallback,
        load: async () => {
          const mod = await import("./EmbedAuthoringView");
          return { default: mod.EmbedAuthoringView };
        },
      },
    }),
});
