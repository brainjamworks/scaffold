import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { embedBlockDefinition } from "./embed-definition";
import { createEmbedNode } from "./node";

import "./Embed.css";

function EmbedRuntimeFallback() {
  return <div aria-hidden="true" className="sc-embed__fallback" />;
}

export const EmbedRuntimeExtension = createEmbedNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-embed",
      definition: embedBlockDefinition,
      view: {
        fallback: EmbedRuntimeFallback,
        load: async () => {
          const mod = await import("./runtime-view");
          return { default: mod.EmbedRuntimeView };
        },
      },
    }),
});
