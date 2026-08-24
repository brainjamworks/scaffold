export { createSemanticActivationRegistry } from "./semantic-activation-registry";
export {
  createSemanticTargetInteractionCoordinator,
  type SemanticSurfacePresentationPort,
  type SemanticTargetInteractionCoordinator,
  type SemanticTargetInteractionOptions,
  type SemanticTargetInteractionResult,
} from "./semantic-target-interaction-coordinator";
export {
  createSemanticTargetInteractionEnvironment,
  type CreateSemanticTargetInteractionEnvironmentInput,
  type SemanticActivationRegistryPort,
  type SemanticTargetInteractionEnvironment,
  type SemanticTargetInteractionEnvironmentOwner,
} from "./semantic-target-interaction-environment";
export {
  createSemanticTargetInteractionEnvironmentStorageExtension,
  getSemanticTargetInteractionEnvironmentForEditor,
} from "./semantic-target-interaction-storage";
export type {
  MountedSemanticActivationBinding,
  SemanticActivationBindingResolution,
  SemanticActivationOutcome,
  SemanticActivationRegistry,
  SemanticActivationRequest,
  SemanticInteractionOrigin,
} from "./semantic-target-interaction";
