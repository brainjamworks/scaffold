import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { ChapterEpigraphDataSchema, type ChapterEpigraphData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { emptyChapterEpigraphData } from "./content";

export interface ChapterEpigraphNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createChapterEpigraphNode(options: ChapterEpigraphNodeOptions = {}) {
  return Node.create({
    name: "chapter_epigraph",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "chapter_epigraph_body chapter_epigraph_attribution",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyChapterEpigraphData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-chapter-epigraph");
            if (!raw) return emptyChapterEpigraphData();
            try {
              const parsed = ChapterEpigraphDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyChapterEpigraphData();
            } catch {
              return emptyChapterEpigraphData();
            }
          },
          renderHTML: (attrs: { data: ChapterEpigraphData }) => ({
            "data-chapter-epigraph": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'blockquote[data-node="chapter_epigraph"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "blockquote",
        mergeAttributes(HTMLAttributes, { "data-node": "chapter_epigraph" }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const ChapterEpigraphNode = createChapterEpigraphNode();
