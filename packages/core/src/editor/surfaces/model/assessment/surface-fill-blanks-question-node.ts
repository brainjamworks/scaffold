import {
  FillBlanksPrivateAssessmentSchema,
  FillBlanksSettingsSchema,
  type FillBlanksPrivateAssessment,
  type FillBlanksSettings,
} from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

import { fullSlideQuestionStageAttributes } from "./full-slide-question-stage";

export const SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE = "surface_fill_blanks_question";

export interface SurfaceFillBlanksQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceFillBlanksQuestionNode(
  options: SurfaceFillBlanksQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "fill_blanks_body assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: FillBlanksPrivateAssessment =
        FillBlanksPrivateAssessmentSchema.parse({});
      const settingsDefault: FillBlanksSettings = FillBlanksSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute("data-fill-blanks-settings", settingsDefault, FillBlanksSettingsSchema),
          renderHTML: (attrs: { settings: FillBlanksSettings }) => ({
            "data-fill-blanks-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute(
            "data-fill-blanks-assessment",
            assessmentDefault,
            FillBlanksPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          HTMLAttributes,
          {
            "data-node": SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE,
            "data-surface-assessment-question": "",
          },
          fullSlideQuestionStageAttributes(SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE),
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

export const SurfaceFillBlanksQuestionNode = createSurfaceFillBlanksQuestionNode();

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
