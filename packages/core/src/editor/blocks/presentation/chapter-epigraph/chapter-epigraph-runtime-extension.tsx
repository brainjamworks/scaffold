import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { ChapterEpigraphView } from "./ChapterEpigraph";
import { chapterEpigraphBlockDefinition } from "./chapter-epigraph-definition";
import { createChapterEpigraphNode } from "./node";
import { ChapterEpigraphAttributionNode, ChapterEpigraphBodyNode } from "./slots";

const ChapterEpigraphRuntimeNode = createChapterEpigraphNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: chapterEpigraphBlockDefinition,
      view: { component: ChapterEpigraphView },
    }),
});

export const ChapterEpigraphRuntimeExtension = Extension.create({
  name: "chapter_epigraph_runtime_bundle",

  addExtensions() {
    return [ChapterEpigraphBodyNode, ChapterEpigraphAttributionNode, ChapterEpigraphRuntimeNode];
  },
});
