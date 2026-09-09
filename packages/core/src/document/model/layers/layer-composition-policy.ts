import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { LayerOwnerSlot } from "./layer-owner-slot";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

export type LayerCompositionPolicyViolation = {
  readonly reason: "content-incompatible";
  readonly ownerId: EmbeddedNodeId;
  readonly layerId: EmbeddedNodeId;
  readonly contentType: string;
  readonly rule: "grid-not-allowed-in-cell" | "fill-occupant-must-be-exclusive";
};

export function isLayerCompositionFillOccupant(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: Pick<LayoutRegistry, "getForNode">,
): boolean {
  if (node.type.name === "grid") return true;
  if (node.type.name === "layout") {
    return layoutDefinitions.getForNode(node)?.boundedPlacement === "fill";
  }
  return blockDefinitions.getByNodeType(node.type.name)?.boundedPlacement === "fill";
}

export function validateLayerCompositionPlacement(input: {
  readonly ownerSlot: LayerOwnerSlot;
  readonly layerId: EmbeddedNodeId;
  readonly layer: ProseMirrorNode;
  readonly contentType: string;
  readonly contentIsFillOccupant: boolean;
  readonly existingChildIsFillOccupant: (node: ProseMirrorNode) => boolean;
  readonly contentFrom: number;
  readonly from: number;
  readonly to: number;
}): LayerCompositionPolicyViolation | null {
  if (input.ownerSlot.policy.directGrid === "forbidden" && input.contentType === "grid") {
    return Object.freeze({
      reason: "content-incompatible",
      ownerId: input.ownerSlot.logicalOwner.id,
      layerId: input.layerId,
      contentType: input.contentType,
      rule: "grid-not-allowed-in-cell",
    });
  }

  let remainingChildren = 0;
  let remainingFillOccupant = false;
  let offset = 0;
  input.layer.forEach((child) => {
    const childFrom = input.contentFrom + offset;
    const childTo = childFrom + child.nodeSize;
    offset += child.nodeSize;
    if (input.from <= childFrom && input.to >= childTo) return;
    remainingChildren += 1;
    if (input.existingChildIsFillOccupant(child)) remainingFillOccupant = true;
  });

  if (remainingFillOccupant || (input.contentIsFillOccupant && remainingChildren > 0)) {
    return Object.freeze({
      reason: "content-incompatible",
      ownerId: input.ownerSlot.logicalOwner.id,
      layerId: input.layerId,
      contentType: input.contentType,
      rule: "fill-occupant-must-be-exclusive",
    });
  }
  return null;
}

export function validateCompleteLayerComposition(input: {
  readonly ownerSlot: LayerOwnerSlot;
  readonly layerId: EmbeddedNodeId;
  readonly layer: ProseMirrorNode;
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: Pick<LayoutRegistry, "getForNode">;
}): LayerCompositionPolicyViolation | null {
  let fillOccupants = 0;
  let forbiddenGrid = false;
  input.layer.forEach((child) => {
    if (input.ownerSlot.policy.directGrid === "forbidden" && child.type.name === "grid") {
      forbiddenGrid = true;
    }
    if (isLayerCompositionFillOccupant(child, input.blockDefinitions, input.layoutDefinitions)) {
      fillOccupants += 1;
    }
  });
  if (forbiddenGrid) {
    return Object.freeze({
      reason: "content-incompatible",
      ownerId: input.ownerSlot.logicalOwner.id,
      layerId: input.layerId,
      contentType: "grid",
      rule: "grid-not-allowed-in-cell",
    });
  }
  if (fillOccupants > 0 && input.layer.childCount !== 1) {
    return Object.freeze({
      reason: "content-incompatible",
      ownerId: input.ownerSlot.logicalOwner.id,
      layerId: input.layerId,
      contentType: input.layer.firstChild?.type.name ?? "unknown",
      rule: "fill-occupant-must-be-exclusive",
    });
  }
  return null;
}
