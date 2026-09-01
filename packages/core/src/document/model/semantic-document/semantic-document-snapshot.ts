import type {
  EmbeddedNodeId,
  PresentationContentLayout,
  PresentationVisualCapabilityId,
} from "@scaffold/contracts";

import type { SemanticLocation } from "./semantic-location";
import type { SemanticProjectionDiagnostic } from "./projection-diagnostic";

export type SemanticItemKind =
  | "course-section"
  | "surface"
  | "layout"
  | "layout-section"
  | "region"
  | "grid"
  | "cell"
  | "block"
  | "rich-text"
  | "published-child";

export interface SemanticPresentationCapability {
  readonly actionIds: readonly PresentationVisualCapabilityId[];
  readonly reconstructableCommandTypes?: readonly string[];
  readonly disabledReason: string | null;
}

export interface SemanticPresentationContainer {
  readonly contentLayout: PresentationContentLayout;
}

export interface SemanticItem {
  readonly id: EmbeddedNodeId;
  readonly kind: SemanticItemKind;
  readonly nodeType: string;
  readonly definitionId: string | null;
  readonly label: string;
  readonly summary: string | null;
  readonly presentation: SemanticPresentationCapability;
  readonly presentationContainer: SemanticPresentationContainer | null;
  readonly children: readonly SemanticItem[];
}

export interface SemanticDocumentSnapshot {
  readonly revision: number;
  readonly mode: "page" | "slideshow";
  readonly roots: readonly SemanticItem[];
  readonly itemById: ReadonlyMap<EmbeddedNodeId, SemanticItem>;
  readonly parentById: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId | null>;
  readonly locationById: ReadonlyMap<EmbeddedNodeId, SemanticLocation>;
  readonly diagnostics: readonly SemanticProjectionDiagnostic[];
}

export type SemanticDocumentProjectionResult = SemanticDocumentSnapshot;
