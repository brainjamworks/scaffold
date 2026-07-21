import { Node as TiptapNode, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  FillBlankAttrsSchema,
  FillBlankPrivateAssessmentEntrySchema,
  type FillBlankAttrs,
  type FillBlankPrivateAssessmentEntry,
} from "@scaffold/contracts";
import { createStableId } from "@/document/model/identity/stable-ids";

export const FILL_BLANK_NODE_TYPE = "fill_blank";

export interface FillBlankNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createFillBlankAttrs(selectedText = ""): FillBlankAttrs {
  return FillBlankAttrsSchema.parse({
    id: createStableId(),
    placeholder: selectedText ? "" : "",
  });
}

export const defaultBlankAttrs = (): FillBlankAttrs => createFillBlankAttrs();

export const defaultBlankAssessment = (): FillBlankPrivateAssessmentEntry =>
  FillBlankPrivateAssessmentEntrySchema.parse({});

export function blankAttrsFromNode(attrs: unknown): FillBlankAttrs {
  const parsed = FillBlankAttrsSchema.safeParse(attrs);
  return parsed.success ? parsed.data : defaultBlankAttrs();
}

export function firstAnswer(blank: FillBlankPrivateAssessmentEntry): string {
  return blank.acceptedAnswers.find((answer) => answer.trim().length > 0) ?? "";
}

export function answerCount(blank: FillBlankPrivateAssessmentEntry): number {
  return blank.acceptedAnswers.filter((answer) => answer.trim().length > 0).length;
}

export function compactAnswers(answers: readonly string[]): string[] {
  return answers.length > 0 ? [...answers] : [""];
}

export function createFillBlankNode(options: FillBlankNodeOptions = {}) {
  return TiptapNode.create({
    name: FILL_BLANK_NODE_TYPE,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      const blankDefault = defaultBlankAttrs();
      return {
        id: {
          default: blankDefault.id,
          parseHTML: (el: HTMLElement) => el.getAttribute("data-blank-id") ?? "",
          renderHTML: (attrs: { id: string }) => (attrs.id ? { "data-blank-id": attrs.id } : {}),
        },
        placeholder: {
          default: blankDefault.placeholder,
          parseHTML: (el: HTMLElement) => el.getAttribute("data-placeholder") ?? "",
          renderHTML: (attrs: { placeholder: string }) =>
            attrs.placeholder ? { "data-placeholder": attrs.placeholder } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: 'span[data-node="fill-blank"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes, { "data-node": "fill-blank" })];
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
