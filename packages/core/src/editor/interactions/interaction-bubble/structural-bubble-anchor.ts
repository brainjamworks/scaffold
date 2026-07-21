import type { StructuralInteractionTargetKind } from "@/editor/interactions/targets/prosemirror/projection/target-ref-projection";

export function structuralMenuAnchorId(
  kind: StructuralInteractionTargetKind,
  stableId: string | null | undefined,
): string | null {
  if (typeof stableId === "string" && stableId.length > 0) {
    return `${kind}-menu:${stableId}`;
  }
  return null;
}
