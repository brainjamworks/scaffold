import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  DropdownPrivateAssessmentSchema,
  DropdownSettingsSchema,
  type DropdownPrivateAssessment,
  type DropdownSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Composite Dropdown node. Options use dropdown_choice children so select
 * labels are authored as text-content rows while the compact select UI
 * renders a flattened one-line display label.
 */
export interface DropdownNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createDropdownNode(options: DropdownNodeOptions = {}) {
  return Node.create({
    name: "dropdown",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "dropdown_choices_group assessment_actions_group",
    defining: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: DropdownPrivateAssessment = DropdownPrivateAssessmentSchema.parse(
        {},
      );
      const settingsDefault: DropdownSettings = DropdownSettingsSchema.parse({});

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
          ...makeAttr("data-dropdown-settings", settingsDefault, DropdownSettingsSchema),
          renderHTML: (attrs: { settings: DropdownSettings }) => ({
            "data-dropdown-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-dropdown-assessment",
            assessmentDefault,
            DropdownPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="dropdown"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "dropdown" }), 0];
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

export const DropdownNode = createDropdownNode();
