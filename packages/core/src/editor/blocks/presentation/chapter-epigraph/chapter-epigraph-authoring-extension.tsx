import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { ChapterEpigraphView } from "./ChapterEpigraph";
import { chapterEpigraphBlockDefinition } from "./chapter-epigraph-definition";
import { createChapterEpigraphNode } from "./node";
import { ChapterEpigraphAttributionNode, ChapterEpigraphBodyNode } from "./slots";

const ChapterEpigraphAuthoringNode = createChapterEpigraphNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: chapterEpigraphBlockDefinition,
      view: { component: ChapterEpigraphView },
    }),
});

export const ChapterEpigraphAuthoringExtension = Extension.create({
  name: "chapter_epigraph_authoring_bundle",

  addExtensions() {
    return [ChapterEpigraphBodyNode, ChapterEpigraphAttributionNode, ChapterEpigraphAuthoringNode];
  },
});
