import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  AssessmentFeedbackContentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import {
  ScaffoldRichTextDocumentSchema,
  createAssessmentFeedbackContent,
  isScaffoldRichTextDocumentEmpty,
} from "@/schemas/rich-text";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

export const ASSESSMENT_ATTR_NODE_TYPES = [
  "mcq",
  "multiselect",
  "dropdown",
  "fill_blanks",
  "sequencing",
  "matching",
  "categorise",
  "image_hotspot",
] as const;

export type AssessmentAttrNodeType = (typeof ASSESSMENT_ATTR_NODE_TYPES)[number];

export interface AssessmentAttrParent {
  typeName: AssessmentAttrNodeType;
  pos: number;
  node: ProseMirrorNode;
}

const assessmentAttrNodeTypeSet = new Set<string>(ASSESSMENT_ATTR_NODE_TYPES);

export function resolveAssessmentAttrParent(
  editor: Editor,
  childPos: number,
  allowedTypes: readonly AssessmentAttrNodeType[] = ASSESSMENT_ATTR_NODE_TYPES,
): AssessmentAttrParent | null {
  if (!isValidEditorDocPos(editor, childPos)) return null;
  const allowed = new Set<string>(allowedTypes);
  const $pos = editor.state.doc.resolve(childPos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (!assessmentAttrNodeTypeSet.has(node.type.name)) continue;
    if (!allowed.has(node.type.name)) continue;
    return {
      typeName: node.type.name as AssessmentAttrNodeType,
      pos: $pos.before(depth),
      node,
    };
  }
  return null;
}

export function setAssessmentAttr(
  editor: Editor,
  parent: AssessmentAttrParent,
  assessment: unknown,
): void {
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(parent.pos, null, {
      ...parent.node.attrs,
      assessment,
    }),
  );
}

export function readAssessmentFeedbackContent(value: unknown): AssessmentFeedbackContent | null {
  const parsed = AssessmentFeedbackContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function richTextDocumentToAssessmentFeedback(
  document: unknown,
): AssessmentFeedbackContent | null {
  const parsed = ScaffoldRichTextDocumentSchema.safeParse(document);
  if (!parsed.success) return null;
  return isScaffoldRichTextDocumentEmpty(parsed.data)
    ? null
    : createAssessmentFeedbackContent(parsed.data);
}

export function nextAssessmentFeedbackRecord(
  current: Record<string, AssessmentFeedbackContent>,
  id: string,
  feedback: AssessmentFeedbackContent | null,
): Record<string, AssessmentFeedbackContent> {
  const next = { ...current };
  if (feedback) next[id] = feedback;
  else delete next[id];
  return next;
}
