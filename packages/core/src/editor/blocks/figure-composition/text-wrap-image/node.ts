import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { TextWrapImageDataSchema, type TextWrapImageData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { TEXT_WRAP_IMAGE_NODE, emptyTextWrapImageData } from "./content";

export interface TextWrapImageNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createTextWrapImageNode(options: TextWrapImageNodeOptions = {}) {
  return Node.create({
    name: TEXT_WRAP_IMAGE_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "text_wrap_image_body",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyTextWrapImageData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-text-wrap-image");
            if (!raw) return emptyTextWrapImageData();
            try {
              const parsed = TextWrapImageDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyTextWrapImageData();
            } catch {
              return emptyTextWrapImageData();
            }
          },
          renderHTML: (attrs: { data: TextWrapImageData }) => ({
            "data-text-wrap-image": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${TEXT_WRAP_IMAGE_NODE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": TEXT_WRAP_IMAGE_NODE }), 0];
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

export const TextWrapImageNode = createTextWrapImageNode();
