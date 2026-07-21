import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

export type AssessmentAncestorMatcher = readonly string[] | ((node: ProseMirrorNode) => boolean);

export function countAssessmentHints(node: ProseMirrorNode): number {
  let total = 0;
  node.forEach((child) => {
    if (child.type.name === "assessment_hints_group") {
      total += child.childCount;
      return;
    }
    total += countAssessmentHints(child);
  });
  return total;
}

export function findAncestorAssessmentId(
  editor: Editor,
  childPos: number | undefined,
  matcher: AssessmentAncestorMatcher,
): string | null {
  if (!isValidEditorDocPos(editor, childPos)) return null;

  const resolved = editor.state.doc.resolve(childPos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    const matches =
      typeof matcher === "function" ? matcher(node) : matcher.includes(node.type.name);
    if (!matches) continue;

    const id = node.attrs["id"];
    return typeof id === "string" && id.trim() ? id : null;
  }

  return null;
}
