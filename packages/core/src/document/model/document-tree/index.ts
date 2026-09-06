export type {
  DocumentTreeDefinition,
  ExposedDocumentChild,
  DocumentItemActivation,
  DocumentTreeChildrenInput,
  DocumentTreeChildrenBuilder,
  DocumentTreeOwnerInput,
  DocumentTreeItemDescriber,
  DocumentTreeItemDescription,
  DocumentItemPresentation,
  DocumentTreeBuildHelpers,
} from "./definition";
export type {
  DocumentTreeBlockDefinition,
  DocumentTreeDefinitionLookup,
  DocumentTreeLayoutDefinition,
  DocumentTreeLayoutSectionDefinition,
  DocumentTreeSurfaceDefinition,
} from "./definition-lookup";
export type {
  DocumentItemEditorSelectionTarget,
  DocumentItemLocation,
} from "./document-item-location";
export type {
  DocumentTreeBuildDiagnostic,
  DocumentTreeBuildDiagnosticCode,
} from "./document-tree-build-diagnostic";
export type {
  DocumentTreeBuildResult,
  DocumentTreeSnapshot,
  DocumentTreeItem,
  DocumentTreeItemKind,
  DocumentItemPresentationCapability,
} from "./document-tree-snapshot";
export {
  resolveDocumentItemPresentationContainer,
  type ResolvedDocumentItemPresentationContainer,
} from "./document-item-presentation-container";
export { normalizeDocumentTreeDefinition } from "./normalize-document-tree-definition";
export { buildDocumentTree, type BuildDocumentTreeInput } from "./build-document-tree";
export { resolveDocumentItemSurfaceId } from "./document-item-surface-resolution";
