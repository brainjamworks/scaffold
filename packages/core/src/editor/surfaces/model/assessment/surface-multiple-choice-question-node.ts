import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  McqPrivateAssessmentSchema,
  McqSettingsSchema,
  type McqPrivateAssessment,
  type McqSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

export const SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE = "surface_multiple_choice_question";

export interface SurfaceMultipleChoiceQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceMultipleChoiceQuestionNode(
  options: SurfaceMultipleChoiceQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "assessment_choices_group assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: McqPrivateAssessment = McqPrivateAssessmentSchema.parse({});
      const settingsDefault: McqSettings = McqSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute("data-mcq-settings", settingsDefault, McqSettingsSchema),
          renderHTML: (attrs: { settings: McqSettings }) => ({
            "data-mcq-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute("data-mcq-assessment", assessmentDefault, McqPrivateAssessmentSchema),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
          "data-surface-assessment-question": "",
        }),
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

export const SurfaceMultipleChoiceQuestionNode = createSurfaceMultipleChoiceQuestionNode();

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
