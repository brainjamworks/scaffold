import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState } from "@tiptap/pm/state";

import type { DocumentItemEditorSelectionTarget } from "@/document/model/document-tree/document-item-location";
import type { SelectionDocumentRange } from "@/editor/selection/selection-transactions";

import type { InteractionTargetRef } from "../../model/interaction-owner-state";

export type StructuralActivationPlacementRange = Readonly<SelectionDocumentRange>;

export type StructuralActivationPlacementIssue =
  | {
      readonly kind: "target-unavailable";
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "retained-child-unavailable";
      readonly targetId: EmbeddedNodeId;
      readonly activeChildId: EmbeddedNodeId;
    }
  | {
      readonly kind: "retained-child-selection-unavailable";
      readonly targetId: EmbeddedNodeId;
      readonly activeChildId: EmbeddedNodeId;
    };

export type StructuralActivationPlacementResolution =
  | { readonly kind: "pointer-within-target" }
  | {
      readonly kind: "retain-active-child";
      readonly activeChildId: EmbeddedNodeId;
      readonly activeRange: StructuralActivationPlacementRange;
      readonly selectionTarget: DocumentItemEditorSelectionTarget;
    }
  | {
      readonly kind: "placement-unavailable";
      readonly issue: StructuralActivationPlacementIssue;
    };

export type StructuralActivationPlacementUnavailable = Extract<
  StructuralActivationPlacementResolution,
  { readonly kind: "placement-unavailable" }
>;

export type StructuralActivationPlacement = Exclude<
  StructuralActivationPlacementResolution,
  StructuralActivationPlacementUnavailable
>;

export interface StructuralActivationPlacementResolverInput {
  readonly state: EditorState;
  readonly target: InteractionTargetRef;
}

export type StructuralActivationPlacementResolver = (
  input: StructuralActivationPlacementResolverInput,
) => StructuralActivationPlacementResolution;

const POINTER_WITHIN_TARGET_PLACEMENT = Object.freeze({
  kind: "pointer-within-target" as const,
});

export const resolveDefaultStructuralActivationPlacement = (
  _input: StructuralActivationPlacementResolverInput,
): Extract<StructuralActivationPlacement, { readonly kind: "pointer-within-target" }> =>
  POINTER_WITHIN_TARGET_PLACEMENT;
