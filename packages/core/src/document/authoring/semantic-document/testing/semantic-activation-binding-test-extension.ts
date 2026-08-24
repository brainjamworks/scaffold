import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { SemanticActivationRelationship } from "@/document/model/semantic-document";
import {
  createSemanticActivationRegistry,
  type MountedSemanticActivationBinding,
  type SemanticActivationRegistry,
  type SemanticActivationRequest,
} from "@/document/semantic-target-interaction";

import { semanticDocumentPluginKey } from "../semantic-document-storage";
import type { SemanticDocumentController } from "../semantic-document-controller";

export function createSemanticActivationBindingTestExtension() {
  const registry = createSemanticActivationRegistry();
  const controller = { semanticActivations: registry } as SemanticDocumentController;
  const extension = Extension.create({
    name: "semantic_activation_binding_test",
    addProseMirrorPlugins() {
      return [
        new Plugin<SemanticDocumentController>({
          key: semanticDocumentPluginKey,
          state: {
            init: () => controller,
            apply: (_transaction, current) => current,
          },
        }),
      ];
    },
  });
  return { extension, registry };
}

export function requireSemanticActivationBinding(
  registry: SemanticActivationRegistry,
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
    readonly signal?: AbortSignal;
  } = {},
): SemanticActivationRequest {
  return {
    requestedId: childId,
    relationship: { ownerId, childId, ownerKind: options.ownerKind ?? "block" },
    origin: "document-outline",
    causationId: `test:${ownerId}:${childId}`,
    signal: options.signal ?? new AbortController().signal,
  };
}
