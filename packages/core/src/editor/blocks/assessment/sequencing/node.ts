import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  SequencingPrivateAssessmentSchema,
  SequencingSettingsSchema,
  type SequencingPrivateAssessment,
  type SequencingSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Composite Sequencing node. Same shell shape as MCQ / Multiselect
 * (title + instructions + prompt + hints + summary) with ordered
 * sequencing_item field nodes as authored content.
 */
export interface SequencingNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSequencingNode(options: SequencingNodeOptions = {}) {
  return Node.create({
    name: "sequencing",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "sequencing_items_group assessment_actions_group",
    defining: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: SequencingPrivateAssessment =
        SequencingPrivateAssessmentSchema.parse({});
      const settingsDefault: SequencingSettings = SequencingSettingsSchema.parse({});

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
          ...makeAttr("data-sequencing-settings", settingsDefault, SequencingSettingsSchema),
          renderHTML: (attrs: { settings: SequencingSettings }) => ({
            "data-sequencing-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-sequencing-assessment",
            assessmentDefault,
            SequencingPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="sequencing"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "sequencing" }), 0];
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

export const SequencingNode = createSequencingNode();
