import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import { getSemanticDocumentControllerForState } from "@/document/authoring/semantic-document/semantic-document-storage";
import type { SemanticLocation } from "@/document/model/semantic-document/semantic-location";
import type {
  SemanticItem,
  SemanticItemKind,
} from "@/document/model/semantic-document/semantic-document-snapshot";
import {
  resolveDefaultStructuralActivationPlacement,
  type StructuralActivationPlacementIssue,
  type StructuralActivationPlacementResolution,
  type StructuralActivationPlacementResolver,
} from "@/editor/interactions/targets/prosemirror/activation/structural-activation-placement";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";

import { readContentLayoutAuthoringState } from "../prosemirror/content-layout-authoring-extension";

export const resolveContentLayoutStructuralActivationPlacement: StructuralActivationPlacementResolver =
  (input) => {
    const semanticKind = eligibleSemanticKind(input.target);
    if (semanticKind === null) return resolveDefaultStructuralActivationPlacement(input);

    const targetId = requireTargetId(input.target);
    const snapshot = getSemanticDocumentControllerForState(input.state).getSnapshot().semantics;
    const targetItem = snapshot.itemById.get(targetId);
    const targetLocation = snapshot.locationById.get(targetId);
    if (
      !targetItem ||
      targetItem.id !== targetId ||
      targetItem.kind !== semanticKind ||
      !isLiveSemanticNode(input.state, targetItem, targetLocation)
    ) {
      return placementUnavailable({ kind: "target-unavailable", targetId });
    }

    const presentationContainer = targetItem.presentationContainer;
    if (presentationContainer === null) {
      return placementUnavailable({ kind: "target-unavailable", targetId });
    }
    if (presentationContainer.contentLayout === PresentationContentLayout.Flow) {
      return resolveDefaultStructuralActivationPlacement(input);
    }
    if (presentationContainer.contentLayout !== PresentationContentLayout.Sequence) {
      throw new Error("Unsupported Content Layout structural activation policy.");
    }

    const containerState = readContentLayoutAuthoringState(input.state).containers.get(targetId);
    if (
      containerState === undefined ||
      containerState.containerId !== targetId ||
      containerState.activeChildId === null
    ) {
      return placementUnavailable({ kind: "target-unavailable", targetId });
    }

    const activeChildId = containerState.activeChildId;
    const activeChild = targetItem.children.find((child) => child.id === activeChildId);
    if (
      activeChild === undefined ||
      snapshot.itemById.get(activeChildId) !== activeChild ||
      snapshot.parentById.get(activeChildId) !== targetId
    ) {
      return placementUnavailable({
        kind: "retained-child-unavailable",
        targetId,
        activeChildId,
      });
    }

    const activeLocation = snapshot.locationById.get(activeChildId);
    if (
      !isLiveSemanticNode(input.state, activeChild, activeLocation, targetLocation) ||
      !isSelectionTargetWithinLocation(activeLocation)
    ) {
      return placementUnavailable({
        kind: "retained-child-selection-unavailable",
        targetId,
        activeChildId,
      });
    }

    return Object.freeze({
      kind: "retain-active-child",
      activeChildId,
      activeRange: activeLocation,
      selectionTarget: activeLocation.selectionTarget,
    });
  };

function eligibleSemanticKind(target: InteractionTargetRef): SemanticItemKind | null {
  switch (target.kind) {
    case InteractionTargetKind.Region:
      return "region";
    case InteractionTargetKind.Cell:
      return "cell";
    case InteractionTargetKind.Section:
      return "layout-section";
    default:
      return null;
  }
}

function requireTargetId(target: InteractionTargetRef): EmbeddedNodeId {
  const targetId = EmbeddedNodeIdSchema.safeParse(target.id);
  if (!targetId.success) {
    throw new Error("Content Layout structural activation requires a valid embedded node ID.");
  }
  return targetId.data;
}

function isLiveSemanticNode(
  state: EditorState,
  item: SemanticItem,
  location: SemanticLocation | undefined,
  parentLocation?: SemanticLocation,
): location is SemanticLocation {
  if (
    location === undefined ||
    location.id !== item.id ||
    location.nodeType !== item.nodeType ||
    !isValidRange(location.from, location.to) ||
    (parentLocation !== undefined &&
      (location.from <= parentLocation.from || location.to >= parentLocation.to))
  ) {
    return false;
  }

  const node = readDocumentNodeAt(state.doc, location.from);
  return (
    node !== null &&
    node.attrs["id"] === item.id &&
    node.type.name === location.nodeType &&
    node.nodeSize === location.to - location.from
  );
}

function isSelectionTargetWithinLocation(location: SemanticLocation): boolean {
  const selectionTarget = location.selectionTarget;
  if (typeof selectionTarget !== "object" || selectionTarget === null) return false;

  switch (selectionTarget.kind) {
    case "node":
    case "near":
      return (
        Number.isSafeInteger(selectionTarget.pos) &&
        selectionTarget.pos >= location.from &&
        selectionTarget.pos <= location.to
      );
    case "text":
      return (
        Number.isSafeInteger(selectionTarget.from) &&
        Number.isSafeInteger(selectionTarget.to) &&
        selectionTarget.from <= selectionTarget.to &&
        selectionTarget.from >= location.from &&
        selectionTarget.to <= location.to
      );
    default:
      return false;
  }
}

function isValidRange(from: number, to: number): boolean {
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && from < to;
}

function readDocumentNodeAt(doc: ProseMirrorNode, position: number): ProseMirrorNode | null {
  return position > doc.content.size ? null : doc.nodeAt(position);
}

function placementUnavailable(
  issue: StructuralActivationPlacementIssue,
): StructuralActivationPlacementResolution {
  return Object.freeze({
    kind: "placement-unavailable",
    issue: Object.freeze(issue),
  });
}
