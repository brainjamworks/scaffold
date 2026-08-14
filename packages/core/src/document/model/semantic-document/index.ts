export type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticActivationRelationship,
  SemanticChildProjectionInput,
  SemanticChildProjector,
  SemanticDefinitionOwnerInput,
  SemanticItemDescriber,
  SemanticItemDescription,
  SemanticPresentationDefinition,
  SemanticProjectionHelpers,
} from "./definition";
export type {
  SemanticBlockDefinition,
  SemanticDefinitionLookup,
  SemanticLayoutDefinition,
  SemanticLayoutSectionDefinition,
  SemanticSurfaceDefinition,
} from "./definition-lookup";
export type { SemanticEditorSelectionTarget, SemanticLocation } from "./semantic-location";
export type {
  SemanticProjectionDiagnostic,
  SemanticProjectionDiagnosticCode,
} from "./projection-diagnostic";
export type {
  SemanticDocumentProjectionResult,
  SemanticDocumentSnapshot,
  SemanticItem,
  SemanticItemKind,
  SemanticPresentationCapability,
} from "./semantic-document-snapshot";
export {
  resolveSemanticPresentationContainer,
  type ResolvedSemanticPresentationContainer,
} from "./presentation-container-resolution";
export { normalizeDocumentSemanticsDefinition } from "./normalize-document-semantics-definition";
export {
  projectSemanticDocument,
  type ProjectSemanticDocumentInput,
} from "./project-semantic-document";
