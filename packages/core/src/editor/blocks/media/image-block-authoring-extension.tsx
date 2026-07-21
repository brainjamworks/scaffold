import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createImageBlockNode } from "./image-block-node";
import { imageBlockDefinition } from "./image-block-definition";

import "./ImageBlock.css";

function ImageBlockAuthoringFallback() {
  return <div aria-hidden="true" className="sc-image-block__fallback" />;
}

export const ImageBlockAuthoringExtension = createImageBlockNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: imageBlockDefinition,
      view: {
        fallback: ImageBlockAuthoringFallback,
        load: async () => {
          const mod = await import("./ImageBlockAuthoringView");
          return { default: mod.ImageBlockAuthoringView };
        },
      },
      className: "sc-image-block",
    }),
});
