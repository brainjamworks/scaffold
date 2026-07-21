import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  MultiselectPrivateAssessmentSchema,
  MultiselectSettingsSchema,
  type MultiselectPrivateAssessment,
  type MultiselectSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Composite Multiselect node. The parent stores identity, settings, and
 * private assessment payload; visible authored content lives in child PM
 * nodes. Choices use the shared `selectable_choice` node.
 */
export interface MultiselectNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createMultiselectNode(options: MultiselectNodeOptions = {}) {
  return Node.create({
    name: "multiselect",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "assessment_choices_group assessment_actions_group",
    defining: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: MultiselectPrivateAssessment =
        MultiselectPrivateAssessmentSchema.parse({});
      const settingsDefault: MultiselectSettings = MultiselectSettingsSchema.parse({});

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
          ...makeAttr("data-multiselect-settings", settingsDefault, MultiselectSettingsSchema),
          renderHTML: (attrs: { settings: MultiselectSettings }) => ({
            "data-multiselect-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-multiselect-assessment",
            assessmentDefault,
            MultiselectPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="multiselect"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "multiselect" }), 0];
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

export const MultiselectNode = createMultiselectNode();
