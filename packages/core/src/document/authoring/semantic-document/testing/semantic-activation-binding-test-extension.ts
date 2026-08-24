import { Extension } from "@tiptap/core";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { SemanticActivationRelationship } from "@/document/model/semantic-document";
import {
  createSemanticActivationRegistry,
  createSemanticTargetInteractionEnvironmentStorageExtension,
  type MountedSemanticActivationBinding,
  type SemanticActivationRegistryPort,
  type SemanticActivationRequest,
  type SemanticInteractionOrigin,
  type SemanticTargetInteractionEnvironment,
} from "@/document/semantic-target-interaction";

export function createSemanticActivationBindingTestExtension() {
  const registry = createSemanticActivationRegistry();
  const environment = Object.freeze({
    registry,
    coordinator: Object.freeze({
      activate: async () => {
        throw new Error("The binding test environment does not provide a semantic coordinator");
      },
    }),
  }) satisfies SemanticTargetInteractionEnvironment;
  const extension = Extension.create({
    name: "semantic_activation_binding_test",
    addExtensions() {
      return [
        createSemanticTargetInteractionEnvironmentStorageExtension({
          getEnvironment: () => environment,
        }),
      ];
    },
    onDestroy() {
      registry.dispose();
    },
  });
  return { extension, registry };
}

export function requireSemanticActivationBinding(
  registry: Pick<SemanticActivationRegistryPort, "resolve">,
  ownerId: EmbeddedNodeId,
): MountedSemanticActivationBinding {
  const resolution = registry.resolve(ownerId);
  if (resolution.kind !== "resolved") {
    throw new Error(`Missing semantic activation binding for owner "${ownerId}"`);
  }
  return resolution.binding;
}

export function semanticActivationRequest(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  options: {
    readonly ownerKind?: SemanticActivationRelationship["ownerKind"];
    readonly origin?: SemanticInteractionOrigin;
    readonly signal?: AbortSignal;
  } = {},
): SemanticActivationRequest {
  return {
    requestedId: childId,
    relationship: { ownerId, childId, ownerKind: options.ownerKind ?? "block" },
    origin: options.origin ?? "document-outline",
    causationId: `test:${ownerId}:${childId}`,
    signal: options.signal ?? new AbortController().signal,
  };
}
