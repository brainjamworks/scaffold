import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import {
  VerticalContentPositionSchema,
  type VerticalContentPosition,
} from "@/schemas/course-document";
import { isValidDocPos } from "@/editor/prosemirror/position/document-position";

export function readRegionVerticalPosition(node: ProseMirrorNode): VerticalContentPosition {
  const parsed = VerticalContentPositionSchema.safeParse(node.attrs["verticalPosition"]);
  return parsed.success ? parsed.data : "top";
}

export function setRegionVerticalPositionInTransaction(
  tr: Transaction,
  pos: number,
  value: VerticalContentPosition,
): Transaction | null {
  if (!isValidDocPos(tr.doc, pos)) return null;
  const region = tr.doc.nodeAt(pos);
  if (!region || region.type.name !== "region") return null;

  const parsed = VerticalContentPositionSchema.safeParse(value);
  if (!parsed.success) return null;

  try {
    tr.setNodeMarkup(pos, undefined, {
      ...region.attrs,
      verticalPosition: parsed.data,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}
