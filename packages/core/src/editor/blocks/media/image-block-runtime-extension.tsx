import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { imageBlockDefinition } from "./image-block-definition";
import { createImageBlockNode } from "./image-block-node";

import "./ImageBlock.css";

function ImageBlockRuntimeFallback() {
  return <div aria-hidden="true" className="sc-image-block__fallback" />;
}

export const ImageBlockRuntimeExtension = createImageBlockNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: imageBlockDefinition,
      view: {
        fallback: ImageBlockRuntimeFallback,
        load: async () => {
          const mod = await import("./image-block-runtime-view");
          return { default: mod.ImageBlockRuntimeView };
        },
      },
      className: "sc-image-block",
    }),
});
