import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isValidDocPos } from "@/editor/prosemirror/position/document-position";

export function createLayoutArrangementAnchorId(
  role: "layout-menu" | "layout-add-section" | "section-menu",
  stableId: unknown,
): string | null {
  if (typeof stableId === "string" && stableId.length > 0) {
    return `${role}:${stableId}`;
  }
  return null;
}

export function layoutSectionPositionAt(
  doc: ProseMirrorNode,
  layoutPos: number,
  sectionIndex: number,
): number | null {
  if (!isValidDocPos(doc, layoutPos)) return null;
  const layout = doc.nodeAt(layoutPos);
  if (!layout || layout.type.name !== "layout") return null;
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= layout.childCount) {
    return null;
  }

  let sectionPos = layoutPos + 1;
  for (let index = 0; index < sectionIndex; index += 1) {
    sectionPos += layout.child(index).nodeSize;
  }
  return sectionPos;
}
