import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react";
import { ChapterEpigraphAlignSchema, ChapterEpigraphDataSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { emptyChapterEpigraphData } from "./content";

export const CHAPTER_EPIGRAPH_BLOCK_ID = "chapter-epigraph";

const ALIGN_LABELS: Record<"left" | "center", string> = {
  left: "Left",
  center: "Centre",
};

const chapterEpigraphConfiguration = defineConfiguration({
  attr: "data",
  schema: ChapterEpigraphDataSchema,
  sheet: {
    title: "Epigraph settings",
    defaultOpenSections: ["appearance"],
    sections: [{ id: "appearance", title: "Appearance" }],
  },
  controls: [
    {
      kind: "select",
      name: "align",
      label: "Alignment",
      options: ChapterEpigraphAlignSchema.options.map((value) => ({
        value,
        label: ALIGN_LABELS[value],
      })),
      placement: { sheet: { section: "appearance" } },
    },
  ],
});

export const chapterEpigraphBlockDefinition = defineBlock({
  nodeType: "chapter_epigraph",
  configuration: chapterEpigraphConfiguration,
  placeholders: {
    chapter_epigraph_attribution: "Attribution",
    chapter_epigraph_body: "Write the opener quote",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: CHAPTER_EPIGRAPH_BLOCK_ID,
    category: "display",
    title: "Chapter epigraph",
    description: "Italic opener quote with attribution",
    icon: BookOpenText,
    keywords: ["epigraph", "opener", "quote", "chapter", "preface"],
    content: () => ({
      type: "chapter_epigraph",
      attrs: {
        id: createStableId(),
        data: emptyChapterEpigraphData(),
      },
      content: [
        { type: "chapter_epigraph_body", content: [{ type: "paragraph" }] },
        {
          type: "chapter_epigraph_attribution",
          content: [{ type: "paragraph" }],
        },
      ],
    }),
  },
});
