import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createPdfEmbedNode } from "./node";
import { pdfEmbedBlockDefinition } from "./pdf-embed-definition";

import "./PdfEmbed.css";

function PdfEmbedAuthoringFallback() {
  return <div aria-hidden="true" className="sc-course-pdf-embed__fallback" />;
}

export const PdfEmbedAuthoringExtension = createPdfEmbedNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-course-pdf-embed",
      definition: pdfEmbedBlockDefinition,
      view: {
        fallback: PdfEmbedAuthoringFallback,
        load: async () => {
          const mod = await import("./authoring-view");
          return { default: mod.PdfEmbedAuthoringView };
        },
      },
    }),
});
