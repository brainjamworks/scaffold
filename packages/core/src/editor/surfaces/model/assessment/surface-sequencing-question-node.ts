import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  SequencingPrivateAssessmentSchema,
  SequencingSettingsSchema,
  type SequencingPrivateAssessment,
  type SequencingSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

import { fullSlideQuestionStageAttributes } from "./full-slide-question-stage";

export const SURFACE_SEQUENCING_QUESTION_NODE_TYPE = "surface_sequencing_question";

export interface SurfaceSequencingQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceSequencingQuestionNode(
  options: SurfaceSequencingQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "sequencing_items_group assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: SequencingPrivateAssessment =
        SequencingPrivateAssessmentSchema.parse({});
      const settingsDefault: SequencingSettings = SequencingSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute("data-sequencing-settings", settingsDefault, SequencingSettingsSchema),
          renderHTML: (attrs: { settings: SequencingSettings }) => ({
            "data-sequencing-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute(
            "data-sequencing-assessment",
            assessmentDefault,
            SequencingPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_SEQUENCING_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          HTMLAttributes,
          {
            "data-node": SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
            "data-surface-assessment-question": "",
          },
          fullSlideQuestionStageAttributes(SURFACE_SEQUENCING_QUESTION_NODE_TYPE),
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

export const SurfaceSequencingQuestionNode = createSurfaceSequencingQuestionNode();

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
