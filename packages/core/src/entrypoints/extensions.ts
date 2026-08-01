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
} from "@/editor/blocks/block-definition";
export type {
  SurfaceAuthoringViewBinding,
  SurfaceAuthoringViewProps,
} from "@/editor/surfaces/authoring/surface-authoring-view-registry";
export type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
export type {
  SurfaceRuntimeViewBinding,
  SurfaceRuntimeViewProps,
} from "@/editor/surfaces/runtime/surface-runtime-view-registry";
