import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import {
  FillBlanksPrivateAssessmentSchema,
  FillBlanksSettingsSchema,
  type FillBlanksPrivateAssessment,
  type FillBlanksSettings,
} from "@scaffold/contracts";

export interface FillBlanksNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createFillBlanksNode(options: FillBlanksNodeOptions = {}) {
  return Node.create({
    name: "fill_blanks",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "fill_blanks_body assessment_actions_group",
    defining: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: FillBlanksPrivateAssessment =
        FillBlanksPrivateAssessmentSchema.parse({});
      const settingsDefault: FillBlanksSettings = FillBlanksSettingsSchema.parse({});

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
          ...makeAttr("data-fill-blanks-settings", settingsDefault, FillBlanksSettingsSchema),
          renderHTML: (attrs: { settings: FillBlanksSettings }) => ({
            "data-fill-blanks-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-fill-blanks-assessment",
            assessmentDefault,
            FillBlanksPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="fill_blanks"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "fill_blanks" }), 0];
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

export const FillBlanksNode = createFillBlanksNode();
