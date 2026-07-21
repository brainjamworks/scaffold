import { FilePdfIcon as FilePdf } from "@phosphor-icons/react";
import { PdfEmbedDataSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { emptyPdfEmbedData } from "./content";

export const PDF_EMBED_BLOCK_ID = "pdf-embed";

const pdfEmbedConfiguration = defineConfiguration({
  attr: "data",
  schema: PdfEmbedDataSchema,
  sheet: {
    title: "PDF settings",
    defaultOpenSections: ["source"],
    sections: [{ id: "source", title: "Source" }],
  },
  controls: [
    {
      kind: "number",
      name: "initialPage",
      label: "Initial page",
      min: 1,
      step: 1,
      placement: { sheet: { section: "source" } },
    },
    {
      kind: "text",
      name: "title",
      label: "Title",
      placeholder: "Optional caption",
      placement: { sheet: { section: "source" } },
    },
  ],
});

export const pdfEmbedBlockDefinition = defineBlock({
  nodeType: "pdf_embed",
  configuration: pdfEmbedConfiguration,
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: PDF_EMBED_BLOCK_ID,
    category: "embed",
    title: "PDF",
    description: "Inline PDF viewer with page navigation",
    icon: FilePdf,
    keywords: ["pdf", "document", "paper", "reading", "worksheet"],
    content: () => ({
      type: "pdf_embed",
      attrs: {
        id: createStableId(),
        data: emptyPdfEmbedData(),
      },
    }),
  },
});
