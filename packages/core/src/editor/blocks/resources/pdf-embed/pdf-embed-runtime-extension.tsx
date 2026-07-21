import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createPdfEmbedNode } from "./node";
import { pdfEmbedBlockDefinition } from "./pdf-embed-definition";

import "./PdfEmbed.css";

function PdfEmbedRuntimeFallback() {
  return <div aria-hidden="true" className="sc-pdf-embed__fallback" />;
}

export const PdfEmbedRuntimeExtension = createPdfEmbedNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-pdf-embed",
      definition: pdfEmbedBlockDefinition,
      view: {
        fallback: PdfEmbedRuntimeFallback,
        load: async () => {
          const mod = await import("./runtime-view");
          return { default: mod.PdfEmbedRuntimeView };
        },
      },
    }),
});
