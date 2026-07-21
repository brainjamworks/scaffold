import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { ASSESSMENT_QUESTION_CONTENT } from "@/document/model/content-model/content-groups";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

export interface AssessmentMeta {
  points: number | null;
}

export function isAssessmentQuestionNode(node: ProseMirrorNode): boolean {
  return node.type.spec.group?.split(/\s+/).includes(ASSESSMENT_QUESTION_CONTENT) ?? false;
}

function resolveParentAssessmentNode(
  editor: Editor,
  pos: number | undefined,
): ProseMirrorNode | null {
  if (!isValidEditorDocPos(editor, pos)) return null;

  const doc = editor.state.doc;
  const nodeAtPos = doc.nodeAt(pos);
  if (nodeAtPos && isAssessmentQuestionNode(nodeAtPos)) return nodeAtPos;

  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isAssessmentQuestionNode(node)) return node;
  }

  return null;
}

export function resolveAssessmentMeta(
  editor: Editor,
  pos: number | undefined,
): AssessmentMeta | null {
  const node = resolveParentAssessmentNode(editor, pos);
  if (!node) return null;

  const settings = node.attrs["settings"];
  const points =
    settings &&
    typeof settings === "object" &&
    "points" in settings &&
    typeof settings.points === "number"
      ? settings.points
      : null;

  return { points };
}

export function formatAssessmentPoints(points: number | null): string | null {
  if (points === null) return null;
  return `${points} ${points === 1 ? "POINT" : "POINTS"}`;
}
