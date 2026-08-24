import type { EmbeddedNodeId } from "@scaffold/contracts";

import {
  createSemanticActivationRegistry,
  type MountedSemanticActivationBinding,
  type SemanticActivationOutcome,
  type SemanticActivationRegistry,
  type SemanticInteractionOrigin,
} from "@/document/semantic-target-interaction";

export type SemanticContainerRevealReason = "navigate" | "present";

export type SemanticContainerRevealResult =
  | "revealed"
  | "already-visible"
  | "suppressed-by-user"
  | "child-unavailable";

export interface SemanticContainerAdapter {
  readonly ownerId: EmbeddedNodeId;
  reveal(
    childId: EmbeddedNodeId,
    reason: SemanticContainerRevealReason,
    signal?: AbortSignal,
  ): SemanticContainerRevealResult | Promise<SemanticContainerRevealResult>;
}

const legacyAdapterKey = Symbol("legacy-semantic-container-adapter");

interface LegacyMountedSemanticActivationBinding extends MountedSemanticActivationBinding {
  readonly [legacyAdapterKey]: SemanticContainerAdapter;
}

export class SemanticContainerAdapterRegistry {
  readonly #activationRegistry: SemanticActivationRegistry;

  constructor(activationRegistry: SemanticActivationRegistry = createSemanticActivationRegistry()) {
    this.#activationRegistry = activationRegistry;
  }

  register(adapter: SemanticContainerAdapter): () => void {
    const binding: LegacyMountedSemanticActivationBinding = {
      ownerId: adapter.ownerId,
      [legacyAdapterKey]: adapter,
      activate: async (request) => {
        const result = await adapter.reveal(
          request.relationship.childId,
          toLegacyReason(request.origin),
          request.signal,
        );
        return toActivationOutcome(adapter.ownerId, request.relationship.childId, result);
      },
    };
    return this.#activationRegistry.register(binding);
  }

  get(ownerId: EmbeddedNodeId): SemanticContainerAdapter | undefined {
    const resolution = this.#activationRegistry.resolve(ownerId);
    if (resolution.kind === "unavailable") return undefined;
    if (!(legacyAdapterKey in resolution.binding)) {
      throw new Error(
        `Cannot expose semantic activation binding for owner "${ownerId}" through the legacy adapter facade`,
      );
    }
    return (resolution.binding as LegacyMountedSemanticActivationBinding)[legacyAdapterKey];
  }

  clear(): void {
    this.#activationRegistry.dispose();
  }
}

function toLegacyReason(origin: SemanticInteractionOrigin): SemanticContainerRevealReason {
  return origin === "document-outline" || origin === "presentation-timeline"
    ? "navigate"
    : "present";
}

function toActivationOutcome(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  result: SemanticContainerRevealResult,
): SemanticActivationOutcome {
  switch (result) {
    case "revealed":
    case "already-visible":
      return Object.freeze({ kind: result, ownerId, childId });
    case "suppressed-by-user":
      return Object.freeze({
        kind: "refused",
        ownerId,
        childId,
        reason: "learner-interaction-precedence",
      });
    case "child-unavailable":
      return Object.freeze({ kind: "unavailable", ownerId, childId, reason: "child-missing" });
  }
}
