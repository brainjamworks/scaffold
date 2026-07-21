import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isSurfaceHeaderFooterNodeType } from "@/editor/surfaces/model/nodes/header-footer-slots";

import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromProseMirror,
} from "./surface-fixed-structure";
import type { SurfaceVariantLookup } from "../surface-variant-registry";

export interface CanInsertSurfaceStructureChildInput {
  surface: ProseMirrorNode;
  child: ProseMirrorNode;
  surfaceVariants: SurfaceVariantLookup;
}

export function canMoveSurfaceStructureNode(
  doc: ProseMirrorNode,
  sourcePos: number,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  if (!isValidDocumentPosition(doc, sourcePos)) return false;

  const sourceNode = doc.nodeAt(sourcePos);
  if (!sourceNode) return false;

  const $source = doc.resolve(sourcePos);
  const parent = $source.parent;
  if (parent.type.name !== "surface") return true;

  if (isSurfaceHeaderFooterNodeType(sourceNode.type.name)) return false;

  const policy = surfaceStructurePolicy(parent, surfaceVariants);
  if (!policy) return false;
  if (policy?.fixedChildren !== undefined) {
    const snapshots = snapshotSurfaceStructureChildrenFromProseMirror(parent);
    const boundaryOffset = parent.firstChild?.type.name === "surface_header" ? 1 : 0;
    const sourceSnapshot = snapshots[$source.index() - boundaryOffset];
    if (!sourceSnapshot) return true;

    const matchesDeclaredChild = policy.fixedChildren.some((fixedChild) => {
      return matchFixedSurfaceChildren([sourceSnapshot], [fixedChild]).exact;
    });
    return !matchesDeclaredChild;
  }

  return true;
}

export function canInsertSurfaceStructureChild({
  surface,
  child,
  surfaceVariants,
}: CanInsertSurfaceStructureChildInput): boolean {
  if (surface.type.name !== "surface") return true;
  if (isSurfaceHeaderFooterNodeType(child.type.name)) return false;

  const policy = surfaceStructurePolicy(surface, surfaceVariants);
  if (!policy) return false;
  if (policy?.fixedChildren !== undefined) return false;
  return true;
}

function surfaceStructurePolicy(surface: ProseMirrorNode, surfaceVariants: SurfaceVariantLookup) {
  const variant = surface.attrs["variant"];
  if (typeof variant !== "string" || variant.length === 0) return undefined;
  const definition = surfaceVariants.get(variant);
  if (!definition) return undefined;
  return { fixedChildren: definition.structurePolicy?.fixedChildren };
}

function isValidDocumentPosition(doc: ProseMirrorNode, pos: number): boolean {
  return Number.isInteger(pos) && pos >= 0 && pos <= doc.content.size;
}
