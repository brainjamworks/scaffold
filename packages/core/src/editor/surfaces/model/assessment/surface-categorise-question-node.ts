import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  CategorisePrivateAssessmentSchema,
  CategoriseSettingsSchema,
  type CategorisePrivateAssessment,
  type CategoriseSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

export const SURFACE_CATEGORISE_QUESTION_NODE_TYPE = "surface_categorise_question";

export interface SurfaceCategoriseQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceCategoriseQuestionNode(
  options: SurfaceCategoriseQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "categorise_content assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: CategorisePrivateAssessment =
        CategorisePrivateAssessmentSchema.parse({});
      const settingsDefault: CategoriseSettings = CategoriseSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute("data-categorise-settings", settingsDefault, CategoriseSettingsSchema),
          renderHTML: (attrs: { settings: CategoriseSettings }) => ({
            "data-categorise-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute(
            "data-categorise-assessment",
            assessmentDefault,
            CategorisePrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_CATEGORISE_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
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

export const SurfaceCategoriseQuestionNode = createSurfaceCategoriseQuestionNode();

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
