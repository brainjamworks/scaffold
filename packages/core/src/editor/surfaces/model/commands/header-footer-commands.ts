import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import {
  createEmptySurfaceHeaderFooterNode,
  type SurfaceHeaderFooterNodeType,
} from "@/editor/surfaces/model/nodes/header-footer-slots";

interface SurfaceRecord {
  node: ProseMirrorNode;
  pos: number;
}

interface HeaderFooterRecord {
  from: number;
  to: number;
}

export interface SetSurfaceHeaderFooterEnabledInput {
  enabled: boolean;
  surfaceId: string;
  tr: Transaction;
  type: SurfaceHeaderFooterNodeType;
}

export function setSurfaceHeaderEnabled({
  enabled,
  surfaceId,
  tr,
}: Omit<SetSurfaceHeaderFooterEnabledInput, "type">) {
  return setSurfaceHeaderFooterEnabled({
    enabled,
    surfaceId,
    tr,
    type: "surface_header",
  });
}

export function setSurfaceFooterEnabled({
  enabled,
  surfaceId,
  tr,
}: Omit<SetSurfaceHeaderFooterEnabledInput, "type">) {
  return setSurfaceHeaderFooterEnabled({
    enabled,
    surfaceId,
    tr,
    type: "surface_footer",
  });
}

export function setSurfaceHeaderFooterEnabled({
  enabled,
  surfaceId,
  tr,
  type,
}: SetSurfaceHeaderFooterEnabledInput): { ok: true } | { ok: false; error: string } {
  const surface = findSurfaceById(tr.doc, surfaceId);
  if (!surface) {
    return { ok: false, error: `Surface "${surfaceId}" was not found.` };
  }

  const existing = findChildByType(surface.node, surface.pos, type);
  if (!enabled) {
    if (existing) tr.delete(existing.from, existing.to);
    return { ok: true };
  }

  if (existing) return { ok: true };

  const headerFooter = createEmptySurfaceHeaderFooterNode(tr.doc.type.schema, type);
  if (!headerFooter) {
    return {
      ok: false,
      error: `Could not create "${type}" for surface "${surfaceId}".`,
    };
  }

  const insertPos =
    type === "surface_header" ? surface.pos + 1 : surface.pos + surface.node.nodeSize - 1;
  tr.insert(insertPos, headerFooter);
  return { ok: true };
}

function findSurfaceById(doc: ProseMirrorNode, surfaceId: string): SurfaceRecord | null {
  let result: SurfaceRecord | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name !== "surface" || node.attrs["id"] !== surfaceId) {
      return true;
    }
    result = { node, pos };
    return false;
  });

  return result;
}

function findChildByType(
  parent: ProseMirrorNode,
  parentPos: number,
  childType: SurfaceHeaderFooterNodeType,
): HeaderFooterRecord | null {
  let result: HeaderFooterRecord | null = null;

  parent.forEach((child, offset) => {
    if (result || child.type.name !== childType) return;
    const from = parentPos + 1 + offset;
    result = {
      from,
      to: from + child.nodeSize,
    };
  });

  return result;
}
