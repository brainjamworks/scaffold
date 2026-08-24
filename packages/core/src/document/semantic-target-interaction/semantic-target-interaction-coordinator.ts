import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type {
  SemanticActivationRelationship,
  SemanticDocumentSnapshot,
  SemanticLocation,
} from "@/document/model/semantic-document";

import type {
  MountedSemanticActivationBinding,
  SemanticActivationOutcome,
  SemanticActivationRegistry,
  SemanticInteractionOrigin,
} from "./semantic-target-interaction";

export interface SemanticSurfacePresentationPort {
  presentSurface(surfaceId: EmbeddedNodeId, signal: AbortSignal): Promise<void>;
}

export interface SemanticTargetInteractionOptions {
  readonly origin: SemanticInteractionOrigin;
  readonly signal?: AbortSignal;
}

export type SemanticTargetInteractionResult =
  | { readonly kind: "reached"; readonly requestedId: EmbeddedNodeId }
  | { readonly kind: "missing-target"; readonly requestedId: EmbeddedNodeId }
  | {
      readonly kind: "unavailable";
      readonly requestedId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
      readonly reason: Extract<SemanticActivationOutcome, { kind: "unavailable" }>["reason"];
    }
  | {
      readonly kind: "refused";
      readonly requestedId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly childId: EmbeddedNodeId;
      readonly reason: Extract<SemanticActivationOutcome, { kind: "refused" }>["reason"];
    }
  | { readonly kind: "interrupted"; readonly requestedId: EmbeddedNodeId };

export interface SemanticTargetInteractionCoordinator {
  activate(
    requestedId: EmbeddedNodeId,
    options: SemanticTargetInteractionOptions,
  ): Promise<SemanticTargetInteractionResult>;
}

interface CreateSemanticTargetInteractionCoordinatorInput {
  readonly registry: SemanticActivationRegistry;
  readonly getSemantics: () => SemanticDocumentSnapshot;
  readonly getCourseStructure: () => ProjectedCourseStructure;
  readonly surfacePresentation: SemanticSurfacePresentationPort;
  readonly lifecycleSignal?: AbortSignal;
}

interface ResolvedSemanticTarget {
  readonly id: EmbeddedNodeId;
  readonly location: SemanticLocation;
}

export function createSemanticTargetInteractionCoordinator({
  registry,
  getSemantics,
  getCourseStructure,
  surfacePresentation,
  lifecycleSignal,
}: CreateSemanticTargetInteractionCoordinatorInput): SemanticTargetInteractionCoordinator {
  let currentRequest: AbortController | null = null;
  let requestOrdinal = 0;

  return Object.freeze({
    async activate(
      requestedId: EmbeddedNodeId,
      options: SemanticTargetInteractionOptions,
    ): Promise<SemanticTargetInteractionResult> {
      currentRequest?.abort();
      const requestController = new AbortController();
      currentRequest = requestController;
      const operationSignal = createOperationSignal([
        requestController.signal,
        ...(lifecycleSignal ? [lifecycleSignal] : []),
        ...(options.signal ? [options.signal] : []),
      ]);
      const causationId = `semantic-target-interaction:${++requestOrdinal}`;
      const completedBindings = new Map<string, MountedSemanticActivationBinding>();
      let presentedSurfaceId: EmbeddedNodeId | null = null;

      try {
        while (true) {
          if (operationSignal.signal.aborted) return interrupted(requestedId);
          const target = resolveTarget(getSemantics(), requestedId);
          if (!target) return missingTarget(requestedId);
          const surfaceId = resolveSurfaceId(target, getSemantics(), getCourseStructure());
          if (!surfaceId || surfaceId === presentedSurfaceId) break;

          await surfacePresentation.presentSurface(surfaceId, operationSignal.signal);
          if (operationSignal.signal.aborted) return interrupted(requestedId);
          if (!resolveTarget(getSemantics(), requestedId)) return missingTarget(requestedId);
          presentedSurfaceId = surfaceId;
        }

        while (true) {
          if (operationSignal.signal.aborted) return interrupted(requestedId);
          const target = resolveTarget(getSemantics(), requestedId);
          if (!target) return missingTarget(requestedId);
          const relationship = nextActivation(target, completedBindings, registry);
          if (!relationship) return reached(requestedId);

          const resolution = registry.resolve(relationship.ownerId);
          if (resolution.kind === "unavailable") {
            return unavailable(requestedId, relationship, resolution.reason);
          }

          const binding = resolution.binding;
          const outcome = await binding.activate({
            requestedId,
            relationship,
            origin: options.origin,
            causationId,
            signal: operationSignal.signal,
          });
          assertOutcomeIdentity(outcome, relationship);
          if (operationSignal.signal.aborted) return interrupted(requestedId);
          const currentTarget = resolveTarget(getSemantics(), requestedId);
          if (!currentTarget) return missingTarget(requestedId);
          if (outcome.kind === "revealed" || outcome.kind === "already-visible") {
            completedBindings.set(activationKey(relationship), binding);
          }
          const currentRelationship = nextActivation(currentTarget, completedBindings, registry);
          if (!currentRelationship || !sameActivation(currentRelationship, relationship)) {
            continue;
          }
          const currentResolution = registry.resolve(currentRelationship.ownerId);
          if (currentResolution.kind === "unavailable") {
            return unavailable(requestedId, currentRelationship, currentResolution.reason);
          }
          if (currentResolution.binding !== binding) continue;

          if (outcome.kind === "interrupted") return interrupted(requestedId);
          if (outcome.kind === "unavailable") {
            return unavailable(requestedId, relationship, outcome.reason);
          }
          if (outcome.kind === "refused") {
            return refused(requestedId, relationship, outcome.reason);
          }
        }
      } finally {
        operationSignal.dispose();
        if (currentRequest === requestController) currentRequest = null;
      }
    },
  });
}

function resolveTarget(
  semantics: SemanticDocumentSnapshot,
  requestedId: EmbeddedNodeId,
): ResolvedSemanticTarget | null {
  if (!semantics.itemById.has(requestedId)) return null;
  const location = semantics.locationById.get(requestedId);
  if (!location) {
    throw new Error(`Public semantic target "${requestedId}" has no location`);
  }
  if (location.id !== requestedId) {
    throw new Error(`Semantic location identity does not match target "${requestedId}"`);
  }
  return { id: requestedId, location };
}

function resolveSurfaceId(
  target: ResolvedSemanticTarget,
  semantics: SemanticDocumentSnapshot,
  courseStructure: ProjectedCourseStructure,
): EmbeddedNodeId | null {
  if (target.location.surfaceId) return target.location.surfaceId;
  const item = semantics.itemById.get(target.id);
  if (item?.kind !== "course-section") return null;
  return courseStructure.courseSectionById[target.id]?.firstSurfaceId ?? null;
}

function nextActivation(
  target: ResolvedSemanticTarget,
  completedBindings: ReadonlyMap<string, MountedSemanticActivationBinding>,
  registry: SemanticActivationRegistry,
): SemanticActivationRelationship | null {
  for (const relationship of target.location.activationPath) {
    const resolution = registry.resolve(relationship.ownerId);
    if (
      resolution.kind === "resolved" &&
      completedBindings.get(activationKey(relationship)) === resolution.binding
    ) {
      continue;
    }
    return relationship;
  }
  return null;
}

function assertOutcomeIdentity(
  outcome: SemanticActivationOutcome,
  relationship: SemanticActivationRelationship,
): void {
  if (outcome.ownerId !== relationship.ownerId || outcome.childId !== relationship.childId) {
    throw new Error(
      `Semantic activation outcome identity does not match owner "${relationship.ownerId}" and child "${relationship.childId}"`,
    );
  }
}

function activationKey(relationship: SemanticActivationRelationship): string {
  return `${relationship.ownerKind}:${relationship.ownerId}:${relationship.childId}`;
}

function sameActivation(
  left: SemanticActivationRelationship,
  right: SemanticActivationRelationship,
): boolean {
  return (
    left.ownerKind === right.ownerKind &&
    left.ownerId === right.ownerId &&
    left.childId === right.childId
  );
}

function reached(requestedId: EmbeddedNodeId): SemanticTargetInteractionResult {
  return Object.freeze({ kind: "reached", requestedId });
}

function missingTarget(requestedId: EmbeddedNodeId): SemanticTargetInteractionResult {
  return Object.freeze({ kind: "missing-target", requestedId });
}

function interrupted(requestedId: EmbeddedNodeId): SemanticTargetInteractionResult {
  return Object.freeze({ kind: "interrupted", requestedId });
}

function unavailable(
  requestedId: EmbeddedNodeId,
  relationship: SemanticActivationRelationship,
  reason: Extract<SemanticActivationOutcome, { kind: "unavailable" }>["reason"],
): SemanticTargetInteractionResult {
  return Object.freeze({
    kind: "unavailable",
    requestedId,
    ownerId: relationship.ownerId,
    childId: relationship.childId,
    reason,
  });
}

function refused(
  requestedId: EmbeddedNodeId,
  relationship: SemanticActivationRelationship,
  reason: Extract<SemanticActivationOutcome, { kind: "refused" }>["reason"],
): SemanticTargetInteractionResult {
  return Object.freeze({
    kind: "refused",
    requestedId,
    ownerId: relationship.ownerId,
    childId: relationship.childId,
    reason,
  });
}

function createOperationSignal(signals: readonly AbortSignal[]): {
  readonly signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const signal of signals) signal.removeEventListener("abort", abort);
    },
  };
}
