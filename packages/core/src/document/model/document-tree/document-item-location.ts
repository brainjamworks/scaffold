import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { DocumentItemActivation } from "./definition";

export type DocumentItemEditorSelectionTarget =
  | { readonly kind: "node"; readonly pos: number }
  | { readonly kind: "text"; readonly from: number; readonly to: number }
  | { readonly kind: "near"; readonly pos: number };

export interface DocumentItemLocation {
  readonly id: EmbeddedNodeId;
  readonly nodeType: string;
  readonly from: number;
  readonly to: number;
  readonly selectionTarget: DocumentItemEditorSelectionTarget;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly authoringAnchorId: EmbeddedNodeId | null;
  readonly activationPath: readonly DocumentItemActivation[];
}
