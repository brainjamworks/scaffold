import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { QuizSettingsSchema, type QuizSettings } from "@scaffold/contracts";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { emptyQuizSettings } from "./quiz-shared";

export interface QuizNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createQuizNode(options: QuizNodeOptions = {}) {
  return Node.create({
    name: "quiz",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${ASSESSMENT_QUESTION_CONTENT}*`,
    defining: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        settings: {
          default: emptyQuizSettings(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-quiz-settings");
            if (!raw) return emptyQuizSettings();
            try {
              const parsed = QuizSettingsSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyQuizSettings();
            } catch {
              return emptyQuizSettings();
            }
          },
          renderHTML: (attrs: { settings: QuizSettings }) => ({
            "data-quiz-settings": JSON.stringify(attrs.settings),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="quiz"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-node": "quiz" }), 0];
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

export const QuizNode = createQuizNode();
