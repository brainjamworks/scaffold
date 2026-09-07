import type { EmbeddedNodeId, PresentationVisualCapabilityId } from "@scaffold/contracts";

import type { DocumentItemLocation } from "./document-item-location";
import type { DocumentTreeBuildDiagnostic } from "./document-tree-build-diagnostic";

export type DocumentTreeItemKind =
  | "course-section"
  | "surface"
  | "layout"
  | "layout-section"
  | "region"
  | "layer"
  | "grid"
  | "cell"
  | "block"
  | "rich-text"
  | "exposed-child";

export interface DocumentItemPresentationCapability {
  readonly actionIds: readonly PresentationVisualCapabilityId[];
  readonly reconstructableCommandTypes?: readonly string[];
  readonly disabledReason: string | null;
}

export interface DocumentTreeItem {
  readonly id: EmbeddedNodeId;
  readonly kind: DocumentTreeItemKind;
  readonly nodeType: string;
  readonly definitionId: string | null;
  readonly label: string;
  readonly summary: string | null;
  readonly presentation: DocumentItemPresentationCapability;
  readonly children: readonly DocumentTreeItem[];
}

export interface DocumentTreeSnapshot {
  readonly revision: number;
  readonly mode: "page" | "slideshow";
  readonly roots: readonly DocumentTreeItem[];
  readonly itemById: ReadonlyMap<EmbeddedNodeId, DocumentTreeItem>;
  readonly parentById: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId | null>;
  readonly locationById: ReadonlyMap<EmbeddedNodeId, DocumentItemLocation>;
  readonly diagnostics: readonly DocumentTreeBuildDiagnostic[];
}

export type DocumentTreeBuildResult = DocumentTreeSnapshot;
