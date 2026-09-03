import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  DragDropPrivateAssessmentSchema,
  DragDropSettingsSchema,
  type DragDropPrivateAssessment,
  type DragDropSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/blocks/assessment/drag-drop/node";

import { fullSlideQuestionStageAttributes } from "./full-slide-question-stage";

export { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE };

export interface SurfaceDragDropQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceDragDropQuestionNode(
  options: SurfaceDragDropQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "drag_drop_canvas assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const settings = DragDropSettingsSchema.parse({});
      const assessment = DragDropPrivateAssessmentSchema.parse({});
      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
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
      return [{ tag: `div[data-node="${SURFACE_DRAG_DROP_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          HTMLAttributes,
          {
            "data-node": SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
            "data-surface-assessment-question": "",
          },
          fullSlideQuestionStageAttributes(SURFACE_DRAG_DROP_QUESTION_NODE_TYPE),
        ),
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

export const SurfaceDragDropQuestionNode = createSurfaceDragDropQuestionNode();

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
    renderHTML: (attrs: {
      settings?: DragDropSettings;
      assessment?: DragDropPrivateAssessment;
    }) => ({
      [htmlKey]: JSON.stringify(
        schema.parse(htmlKey.includes("settings") ? attrs.settings : attrs.assessment),
      ),
    }),
  };
}
