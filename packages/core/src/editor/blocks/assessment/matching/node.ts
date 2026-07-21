import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import {
  MatchingPrivateAssessmentSchema,
  MatchingSettingsSchema,
  type MatchingPrivateAssessment,
  type MatchingSettings,
} from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

/**
 * Composite Matching node. Reuses the standard assessment shell
 * (title + instructions + prompt + hints + summary) and stores authored
 * matching pairs as child field nodes.
 */
export interface MatchingNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createMatchingNode(options: MatchingNodeOptions = {}) {
  return Node.create({
    name: "matching",
    group: `block ${COURSE_BLOCK_CONTENT} ${ASSESSMENT_QUESTION_CONTENT}`,
    content:
      "assessment_title assessment_instructions assessment_prompt " +
      "matching_pairs_group assessment_actions_group",
    defining: true,
    draggable: false,

    addAttributes() {
      const assessmentDefault: MatchingPrivateAssessment = MatchingPrivateAssessmentSchema.parse(
        {},
      );
      const settingsDefault: MatchingSettings = MatchingSettingsSchema.parse({});

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
          ...makeAttr("data-matching-settings", settingsDefault, MatchingSettingsSchema),
          renderHTML: (attrs: { settings: MatchingSettings }) => ({
            "data-matching-settings": JSON.stringify(attrs.settings),
          }),
        },
        assessment: {
          ...makeAttr(
            "data-matching-assessment",
            assessmentDefault,
            MatchingPrivateAssessmentSchema,
          ),
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="matching"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "matching" }), 0];
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

export const MatchingNode = createMatchingNode();
