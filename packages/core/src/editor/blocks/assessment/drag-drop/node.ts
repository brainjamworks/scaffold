import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  DragDropPrivateAssessmentSchema,
  DragDropSettingsSchema,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

import {
  DRAG_DROP_CHILD_TYPES,
  DRAG_DROP_NODE_TYPE,
} from "@/editor/assessment/drag-drop/node-codecs";

export interface DragDropNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}
export function createDragDropNode(options: DragDropNodeOptions = {}) {
  return Node.create({
    name: DRAG_DROP_NODE_TYPE,
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content: DRAG_DROP_CHILD_TYPES.join(" "),
    defining: true,
    draggable: false,

    addAttributes() {
      const settings = DragDropSettingsSchema.parse({});
      const assessment = DragDropPrivateAssessmentSchema.parse({});
      return {
        settings: structuredAttr("data-drag-drop-settings", settings, DragDropSettingsSchema),
        assessment: {
          ...structuredAttr(
            "data-drag-drop-assessment",
            assessment,
            DragDropPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="drag_drop"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": DRAG_DROP_NODE_TYPE }), 0];
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

export const DragDropNode = createDragDropNode();

function structuredAttr<T>(
  htmlKey: string,
  defaultValue: T,
  schema: { parse: (value: unknown) => T },
) {
  return {
    default: defaultValue,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(htmlKey);
      return raw === null ? defaultValue : schema.parse(JSON.parse(raw));
    },
    renderHTML: (attrs: Record<string, unknown>) => ({
      [htmlKey]: JSON.stringify(
        schema.parse(attrs[htmlKey.includes("settings") ? "settings" : "assessment"]),
      ),
    }),
  };
}
