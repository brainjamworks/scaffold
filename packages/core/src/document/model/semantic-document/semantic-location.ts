import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { SemanticActivationRelationship } from "./definition";

export type SemanticEditorSelectionTarget =
  | { readonly kind: "node"; readonly pos: number }
  | { readonly kind: "text"; readonly from: number; readonly to: number }
  | { readonly kind: "near"; readonly pos: number };

export interface SemanticLocation {
  readonly id: EmbeddedNodeId;
  readonly nodeType: string;
  readonly from: number;
  readonly to: number;
  readonly selectionTarget: SemanticEditorSelectionTarget;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly activationPath: readonly SemanticActivationRelationship[];
}
