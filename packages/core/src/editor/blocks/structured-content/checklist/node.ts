import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { ChecklistDataSchema, type ChecklistData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { CHECKLIST_ITEM_NODE, CHECKLIST_NODE, emptyChecklistData } from "./content";

export interface ChecklistNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createChecklistNode(options: ChecklistNodeOptions = {}) {
  return Node.create({
    name: CHECKLIST_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${CHECKLIST_ITEM_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyChecklistData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-checklist");
            if (!raw) return emptyChecklistData();
            try {
              const parsed = ChecklistDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyChecklistData();
            } catch {
              return emptyChecklistData();
            }
          },
          renderHTML: (attrs: { data: ChecklistData }) => ({
            "data-checklist": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="checklist"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-node": "checklist" }), 0];
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

export const ChecklistNode = createChecklistNode();
