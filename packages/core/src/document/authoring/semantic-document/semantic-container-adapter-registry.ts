import type { EmbeddedNodeId } from "@scaffold/contracts";

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
  ): SemanticContainerRevealResult | Promise<SemanticContainerRevealResult>;
}

export class SemanticContainerAdapterRegistry {
  readonly #adapters = new Map<EmbeddedNodeId, SemanticContainerAdapter>();

  register(adapter: SemanticContainerAdapter): () => void {
    this.#adapters.set(adapter.ownerId, adapter);
    return () => {
      if (this.#adapters.get(adapter.ownerId) === adapter) {
        this.#adapters.delete(adapter.ownerId);
      }
    };
  }

  get(ownerId: EmbeddedNodeId): SemanticContainerAdapter | undefined {
    return this.#adapters.get(ownerId);
  }

  clear(): void {
    this.#adapters.clear();
  }
}
