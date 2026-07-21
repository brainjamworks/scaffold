import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  CategorisePrivateAssessmentSchema,
  CategoriseSettingsSchema,
  type CategorisePrivateAssessment,
  type CategoriseSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Composite Categorise node. Reuses the standard assessment shell
 * (title / instructions / prompt / hints / summary feedback) with authored
 * bins and sortable items represented as PM field nodes.
 */
export interface CategoriseNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createCategoriseNode(options: CategoriseNodeOptions = {}) {
  return Node.create({
    name: "categorise",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "categorise_content assessment_actions_group",
    defining: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: CategorisePrivateAssessment =
        CategorisePrivateAssessmentSchema.parse({});
      const settingsDefault: CategoriseSettings = CategoriseSettingsSchema.parse({});

      const makeAttr = <T>(
        htmlKey: string,
        defaultValue: T,
        schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
      ) => ({
        default: defaultValue,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute(htmlKey);
          if (!raw) return defaultValue;
          try {
            const parsed = schema.safeParse(JSON.parse(raw));
            return parsed.success && parsed.data !== undefined ? parsed.data : defaultValue;
          } catch {
            return defaultValue;
          }
        },
      });

      return {
        id: stableNodeIdAttribute(),
        settings: {
          ...makeAttr("data-categorise-settings", settingsDefault, CategoriseSettingsSchema),
          renderHTML: (attrs: { settings: CategoriseSettings }) => ({
            "data-categorise-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-categorise-assessment",
            assessmentDefault,
            CategorisePrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="categorise"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "categorise" }), 0];
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

export const CategoriseNode = createCategoriseNode();
