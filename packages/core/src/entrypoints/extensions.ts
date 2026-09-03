export {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type CreateScaffoldApplicationOptions,
  type BlockCapability,
  type LayoutCapability,
  type ScaffoldApplication,
  type ScaffoldExtensionPack,
  type ScaffoldExtensionPackInput,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
export type {
  ScaffoldAuthoringBlockComposition,
  ScaffoldAuthoringComposition,
  ScaffoldAuthoringLayoutComposition,
  ScaffoldAuthoringSurfaceComposition,
} from "@/composition/authoring/scaffold-authoring-composition";
export {
  createScaffoldCapabilitiesStorageExtension,
  getScaffoldCapabilitiesForEditor,
  type ScaffoldCapabilitiesStorage,
} from "@/composition/extensions/scaffold-capabilities-storage";
export {
  getScaffoldAuthoringCataloguesForEditor,
  type ScaffoldAuthoringCatalogues,
} from "@/composition/extensions/scaffold-authoring-catalogues-storage";
export type {
  ResolvedBlockCapabilities,
  ResolvedLayoutCapabilities,
  ResolvedScaffoldCapabilities,
  ResolvedSurfaceCapabilities,
} from "@/composition/model/resolved-scaffold-capabilities";
export type {
  ScaffoldRuntimeBlockComposition,
  ScaffoldRuntimeComposition,
  ScaffoldRuntimeLayoutComposition,
  ScaffoldRuntimeSurfaceComposition,
} from "@/composition/runtime/scaffold-runtime-composition";
export {
  defineBlock,
  type BlockDefinition,
  type BlockDefinitionInput,
  type BlockInsertVariantDefinition,
} from "@/editor/blocks/block-definition";
export type {
  LayoutDefinition,
  LayoutSectionDefinition,
} from "@/editor/arrangements/layout/model/layout-definition";
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
} from "@/document/model/semantic-document";
export type { SurfaceAuthoringViewBinding } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
export type {
  SurfaceAuthoringViewProps,
  SurfaceRuntimeViewBinding,
  SurfaceRuntimeViewProps,
} from "@/editor/surfaces/shared/surface-view-props";
export type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
export {
  useLearningEventReporter,
  type LearningEventReporter,
} from "@/runtime/learning-events/LearningEventRuntimeProvider";
export type { BlockLearningEventInput } from "@/runtime/learning-events/catalogue";
