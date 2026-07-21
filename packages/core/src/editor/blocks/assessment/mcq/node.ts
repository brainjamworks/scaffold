import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  McqPrivateAssessmentSchema,
  McqSettingsSchema,
  type McqPrivateAssessment,
  type McqSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Composite MCQ node.
 *
 * - Recipe: composite (atom: false; children: prompt + choices + hints)
 * - Settings attr: block configuration edited by quick menu and settings sheet
 *
 * Visible assessment content is authored as child PM nodes. Private
 * answer keys and gated feedback live under attrs.assessment.
 */
export interface McqNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createMcqNode(options: McqNodeOptions = {}) {
  return Node.create({
    name: "mcq",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "assessment_choices_group assessment_actions_group",
    defining: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: McqPrivateAssessment = McqPrivateAssessmentSchema.parse({});
      const settingsDefault: McqSettings = McqSettingsSchema.parse({});

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
          ...makeAttr("data-mcq-settings", settingsDefault, McqSettingsSchema),
          renderHTML: (attrs: { settings: McqSettings }) => ({
            "data-mcq-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr("data-mcq-assessment", assessmentDefault, McqPrivateAssessmentSchema),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="mcq"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "mcq" }), 0];
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

export const McqNode = createMcqNode();
