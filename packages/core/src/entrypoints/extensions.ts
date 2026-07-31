export {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type CreateScaffoldApplicationOptions,
  type BlockCapability,
  type LayoutCapability,
  type ScaffoldApplication,
  type ScaffoldExtensionPack,
  type ScaffoldExtensionPackInput,
} from "@/composition/application/create-scaffold-application";
export type {
  ScaffoldAuthoringBlockComposition,
  ScaffoldAuthoringComposition,
  ScaffoldAuthoringLayoutComposition,
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
} from "@/composition/model/resolved-scaffold-capabilities";
export type {
  ScaffoldRuntimeBlockComposition,
  ScaffoldRuntimeComposition,
  ScaffoldRuntimeLayoutComposition,
} from "@/composition/runtime/scaffold-runtime-composition";
export {
  defineBlock,
  type BlockDefinition,
  type BlockDefinitionInput,
} from "@/editor/blocks/block-definition";
