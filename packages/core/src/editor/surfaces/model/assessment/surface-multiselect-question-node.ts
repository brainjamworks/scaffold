import {
  MultiselectPrivateAssessmentSchema,
  MultiselectSettingsSchema,
  type MultiselectPrivateAssessment,
  type MultiselectSettings,
} from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

import { fullSlideQuestionStageAttributes } from "./full-slide-question-stage";

export const SURFACE_MULTISELECT_QUESTION_NODE_TYPE = "surface_multiselect_question";

export interface SurfaceMultiselectQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceMultiselectQuestionNode(
  options: SurfaceMultiselectQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_MULTISELECT_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "assessment_choices_group assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: MultiselectPrivateAssessment =
        MultiselectPrivateAssessmentSchema.parse({});
      const settingsDefault: MultiselectSettings = MultiselectSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute("data-multiselect-settings", settingsDefault, MultiselectSettingsSchema),
          renderHTML: (attrs: { settings: MultiselectSettings }) => ({
            "data-multiselect-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute(
            "data-multiselect-assessment",
            assessmentDefault,
            MultiselectPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_MULTISELECT_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          HTMLAttributes,
          {
            "data-node": SURFACE_MULTISELECT_QUESTION_NODE_TYPE,
            "data-surface-assessment-question": "",
          },
          fullSlideQuestionStageAttributes(SURFACE_MULTISELECT_QUESTION_NODE_TYPE),
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

export const SurfaceMultiselectQuestionNode = createSurfaceMultiselectQuestionNode();

function jsonAttribute<T>(
  htmlKey: string,
  defaultValue: T,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
) {
  return {
    default: defaultValue,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(htmlKey);
      if (!raw) return defaultValue;
      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success && parsed.data !== undefined ? parsed.data : defaultValue;
      } catch {
        return defaultValue;
      }
    },
  };
}
