import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { AudioBlockAttrsSchema, type AudioBlockAttrs } from "@scaffold/contracts";

export interface AudioBlockNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createAudioBlockNode(options: AudioBlockNodeOptions = {}) {
  return Node.create({
    name: "audio_block",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    atom: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: null as AudioBlockAttrs | null,
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-audio");
            if (!raw) return null;
            try {
              const parsed = AudioBlockAttrsSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : null;
            } catch {
              return null;
            }
          },
          renderHTML: (attrs: { data: AudioBlockAttrs | null }) =>
            attrs.data ? { "data-audio": JSON.stringify(attrs.data) } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="audio_block"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "audio_block" })];
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

export const AudioBlockNode = createAudioBlockNode();
