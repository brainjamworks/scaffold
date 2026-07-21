import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { SurfaceVariantLookup } from "../surface-variant-registry";

export function allowsSurfaceRootInsertion(
  node: ProseMirrorNode,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  if (node.type.name !== "surface") return true;

  const variant = node.attrs["variant"];
  if (typeof variant !== "string" || variant.length === 0) return false;

  const definition = surfaceVariants.get(variant);
  if (!definition) return false;
  return definition.structurePolicy?.allowRootInsertion !== false;
}

export function allowsSurfaceRootInsertionAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) return true;

  const $pos = doc.resolve(pos);
  const insertionParent =
    $pos.parent.isTextblock && $pos.depth > 0 ? $pos.node($pos.depth - 1) : $pos.parent;

  return allowsSurfaceRootInsertion(insertionParent, surfaceVariants);
}
