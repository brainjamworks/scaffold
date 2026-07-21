import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { FLASHCARD_NODE } from "./content";

export function resolveParentFlashcardBlock(
  props: NodeViewProps,
): { id: string; node: ProseMirrorNode } | null {
  const pos = readNodeViewPos(props.getPos);
  if (!isValidEditorDocPos(props.editor, pos)) return null;

  const resolved = props.editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== FLASHCARD_NODE) continue;
    return {
      id: readRequiredNodeId(node.attrs["id"], "flashcard block"),
      node,
    };
  }

  return null;
}

export function readNodeViewPos(getPos: NodeViewProps["getPos"]): number | undefined {
  if (typeof getPos !== "function") return undefined;

  try {
    const pos = getPos();
    return typeof pos === "number" && Number.isFinite(pos) ? pos : undefined;
  } catch {
    return undefined;
  }
}

export function readRequiredNodeId(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`${label} is missing a stable id.`);
}
