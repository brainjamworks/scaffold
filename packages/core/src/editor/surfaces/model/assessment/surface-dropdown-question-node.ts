import {
  DropdownPrivateAssessmentSchema,
  DropdownSettingsSchema,
  type DropdownPrivateAssessment,
  type DropdownSettings,
} from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  ASSESSMENT_QUESTION_CONTENT,
  BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";

export const SURFACE_DROPDOWN_QUESTION_NODE_TYPE = "surface_dropdown_question";

export interface SurfaceDropdownQuestionNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSurfaceDropdownQuestionNode(
  options: SurfaceDropdownQuestionNodeOptions = {},
) {
  return Node.create({
    name: SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
    group: `${BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "dropdown_choices_group assessment_actions_group",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      const assessmentDefault: DropdownPrivateAssessment = DropdownPrivateAssessmentSchema.parse(
        {},
      );
      const settingsDefault: DropdownSettings = DropdownSettingsSchema.parse({});

      return {
        id: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" && attrs.id.length > 0 ? { "data-id": attrs.id } : {},
        },
        settings: {
          ...jsonAttribute("data-dropdown-settings", settingsDefault, DropdownSettingsSchema),
          renderHTML: (attrs: { settings: DropdownSettings }) => ({
            "data-dropdown-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...jsonAttribute(
            "data-dropdown-assessment",
            assessmentDefault,
            DropdownPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-node="${SURFACE_DROPDOWN_QUESTION_NODE_TYPE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
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

export const SurfaceDropdownQuestionNode = createSurfaceDropdownQuestionNode();

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
