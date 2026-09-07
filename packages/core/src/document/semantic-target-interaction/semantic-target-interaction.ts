import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { DocumentItemActivation } from "@/document/model/document-tree";

export type SemanticInteractionOrigin =
  | "document-outline"
  | "presentation-timeline"
  | "author-preview"
  | "configured-presentation"
  | "learner-interaction-rule";

export interface SemanticActivationRequest {
  readonly requestedId: EmbeddedNodeId;
  readonly relationship: DocumentItemActivation;
  readonly origin: SemanticInteractionOrigin;
  readonly causationId: string;
  readonly signal: AbortSignal;
}

export type SemanticActivationOutcome =
  | {
      readonly kind: "revealed";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }
  | {
      readonly kind: "already-visible";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    }
  | {
      readonly kind: "refused";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
      readonly reason:
        | "authority-boundary"
        | "hidden-layer-ancestor"
        | "origin-not-supported"
        | "learner-interaction-precedence";
    }
  | {
      readonly kind: "unavailable";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
      readonly reason: "owner-unmounted" | "child-missing" | "temporarily-unavailable";
    }
  | {
      readonly kind: "interrupted";
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
    };

export interface MountedSemanticActivationBinding {
  readonly ownerId: EmbeddedNodeId;
  activate(request: SemanticActivationRequest): Promise<SemanticActivationOutcome>;
}

export type SemanticActivationBindingResolution =
  | {
      readonly kind: "resolved";
      readonly binding: MountedSemanticActivationBinding;
    }
  | {
      readonly kind: "unavailable";
      readonly ownerId: EmbeddedNodeId;
      readonly reason: "owner-unmounted";
    };

export interface SemanticActivationRegistry {
  register(binding: MountedSemanticActivationBinding): () => void;
  resolve(ownerId: EmbeddedNodeId): SemanticActivationBindingResolution;
  dispose(): void;
}
