import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Transaction } from "@tiptap/pm/state";

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
} from "@/document/semantic-target-interaction";

import {
  setSemanticSelectionTransactionMeta,
  type SemanticSelectionOrigin,
} from "./semantic-selection-origin";

export interface SemanticNavigationEditor {
  dispatch(transaction: Transaction): void;
  focus(): void;
}

export interface SemanticNavigationEnvironment {
  presentSurface(surfaceId: EmbeddedNodeId): Promise<void>;
  createActivationTransaction(location: SemanticLocation): Transaction | null;
  bringIntoView(location: SemanticLocation, behavior: "instant" | "smooth"): Promise<void>;
}

export interface SemanticNavigationOptions {
  readonly origin: Extract<SemanticSelectionOrigin, "document-outline" | "presentation-timeline">;
  readonly focusEditor?: boolean;
}

type SemanticNavigationReachedOwnerReason =
  | "owner-unmounted"
  | Extract<SemanticActivationOutcome, { kind: "unavailable" | "refused" }>["reason"];

export type SemanticNavigationResult =
  | { readonly kind: "reached"; readonly id: EmbeddedNodeId }
  | {
      readonly kind: "reached-owner";
      readonly requestedId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly reason: SemanticNavigationReachedOwnerReason;
    }
  | { readonly kind: "missing"; readonly id: EmbeddedNodeId }
  | { readonly kind: "interrupted"; readonly id: EmbeddedNodeId };

interface SemanticNavigationCoordinatorInput {
  readonly registry: SemanticActivationRegistry;
  readonly getSemantics: () => SemanticDocumentSnapshot;
  readonly getCourseStructure: () => ProjectedCourseStructure;
  readonly editor?: SemanticNavigationEditor;
  readonly environment?: SemanticNavigationEnvironment;
}

interface ResolvedSemanticTarget {
  readonly id: EmbeddedNodeId;
  readonly location: SemanticLocation;
}

export class SemanticNavigationCoordinator {
  readonly #registry: SemanticActivationRegistry;
  readonly #getSemantics: () => SemanticDocumentSnapshot;
  readonly #getCourseStructure: () => ProjectedCourseStructure;
  #editor: SemanticNavigationEditor | null;
  #environment: SemanticNavigationEnvironment | null;
  #requestToken = 0;
  #requestAbortController: AbortController | null = null;

  constructor({
    registry,
    getSemantics,
    getCourseStructure,
    editor,
    environment,
  }: SemanticNavigationCoordinatorInput) {
    this.#registry = registry;
    this.#getSemantics = getSemantics;
    this.#getCourseStructure = getCourseStructure;
    this.#editor = editor ?? null;
    this.#environment = environment ?? null;
  }

  setEditor(editor: SemanticNavigationEditor): void {
    this.interrupt();
    this.#editor = editor;
  }

  setEnvironment(environment: SemanticNavigationEnvironment): void {
    this.interrupt();
    this.#environment = environment;
  }

  interrupt(): void {
    this.#requestToken += 1;
    this.#requestAbortController?.abort();
    this.#requestAbortController = null;
  }

  async select(
    id: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    this.#requestAbortController?.abort();
    const requestAbortController = new AbortController();
    this.#requestAbortController = requestAbortController;
    const token = ++this.#requestToken;
    const completedBindings = new Map<string, MountedSemanticActivationBinding>();
    let presentedSurfaceId: EmbeddedNodeId | null = null;

    while (true) {
      const target = this.#resolve(id);
      if (!target) return { kind: "missing", id };
      const surfaceId = this.#resolveSurfaceId(target);
      if (!surfaceId || surfaceId === presentedSurfaceId) break;
      const environment = this.#environment;
      if (!environment) return { kind: "interrupted", id };

      try {
        await environment.presentSurface(surfaceId);
      } catch {
        return { kind: "interrupted", id };
      }
      if (!this.#isCurrent(token)) return { kind: "interrupted", id };
      if (!this.#resolve(id)) return { kind: "missing", id };
      presentedSurfaceId = surfaceId;
    }

    while (true) {
      const target = this.#resolve(id);
      if (!target) return { kind: "missing", id };
      const next = this.#nextActivation(target, completedBindings);
      if (!next) return this.#reach(target, token, options);

      const resolution = this.#registry.resolve(next.ownerId);
      if (resolution.kind === "unavailable") {
        return this.#reachOwner(target, next, token, options, resolution.reason);
      }
      const binding = resolution.binding;

      const outcome = await binding.activate({
        requestedId: id,
        relationship: next,
        origin: options.origin,
        causationId: `semantic-navigation:${token}`,
        signal: requestAbortController.signal,
      });
      if (!this.#isCurrent(token)) return { kind: "interrupted", id };

      const currentTarget = this.#resolve(id);
      if (!currentTarget) return { kind: "missing", id };
      const currentResolution = this.#registry.resolve(next.ownerId);
      if (currentResolution.kind === "unavailable" || currentResolution.binding !== binding) {
        return this.#reachOwner(currentTarget, next, token, options, "owner-unmounted");
      }
      if (outcome.kind === "interrupted") return { kind: "interrupted", id };
      if (outcome.kind === "unavailable" || outcome.kind === "refused") {
        return this.#reachOwner(currentTarget, next, token, options, outcome.reason);
      }
      completedBindings.set(activationKey(next), binding);
    }
  }

  #resolve(id: EmbeddedNodeId): ResolvedSemanticTarget | null {
    const semantics = this.#getSemantics();
    if (!semantics.itemById.has(id)) return null;
    const location = semantics.locationById.get(id);
    return location ? { id, location } : null;
  }

  #resolveSurfaceId(target: ResolvedSemanticTarget): EmbeddedNodeId | null {
    if (target.location.surfaceId) return target.location.surfaceId;
    const item = this.#getSemantics().itemById.get(target.id);
    if (item?.kind !== "course-section") return null;
    return this.#getCourseStructure().courseSectionById[target.id]?.firstSurfaceId ?? null;
  }

  #nextActivation(
    target: ResolvedSemanticTarget,
    completedBindings: ReadonlyMap<string, MountedSemanticActivationBinding>,
  ): SemanticActivationRelationship | null {
    for (const relationship of target.location.activationPath) {
      const resolution = this.#registry.resolve(relationship.ownerId);
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

  async #reachOwner(
    target: ResolvedSemanticTarget,
    failedRelationship: SemanticActivationRelationship,
    token: number,
    options: SemanticNavigationOptions,
    reason: SemanticNavigationReachedOwnerReason,
  ): Promise<SemanticNavigationResult> {
    const ownerId = this.#nearestSemanticOwner(target, failedRelationship);
    if (!ownerId) return { kind: "missing", id: target.id };
    const owner = this.#resolve(ownerId);
    if (!owner) return { kind: "missing", id: target.id };
    const reached = await this.#reach(owner, token, options, target.id);
    if (reached.kind !== "reached") return reached;
    return {
      kind: "reached-owner",
      requestedId: target.id,
      ownerId,
      reason,
    };
  }

  #nearestSemanticOwner(
    target: ResolvedSemanticTarget,
    failedRelationship: SemanticActivationRelationship,
  ): EmbeddedNodeId | null {
    const semantics = this.#getSemantics();
    if (semantics.itemById.has(failedRelationship.ownerId)) {
      return failedRelationship.ownerId;
    }

    let candidate = semantics.parentById.get(target.id) ?? null;
    while (candidate) {
      const location = semantics.locationById.get(candidate);
      if (
        location &&
        !location.activationPath.some((relationship) =>
          sameActivation(relationship, failedRelationship),
        )
      ) {
        return candidate;
      }
      candidate = semantics.parentById.get(candidate) ?? null;
    }
    return target.location.surfaceId;
  }

  async #reach(
    target: ResolvedSemanticTarget,
    token: number,
    options: SemanticNavigationOptions,
    intendedId: EmbeddedNodeId = target.id,
  ): Promise<SemanticNavigationResult> {
    if (!this.#isCurrent(token)) return { kind: "interrupted", id: target.id };
    const currentTarget = this.#resolve(target.id);
    const editor = this.#editor;
    const environment = this.#environment;
    if (!currentTarget) return { kind: "missing", id: target.id };
    if (!editor || !environment) return { kind: "interrupted", id: target.id };
    const authoringTarget = this.#resolveAuthoringTarget(currentTarget);
    if (!authoringTarget) return { kind: "missing", id: target.id };

    let preflightTransaction: Transaction | null;
    try {
      preflightTransaction = environment.createActivationTransaction(authoringTarget.location);
    } catch {
      return { kind: "interrupted", id: intendedId };
    }
    if (!preflightTransaction) {
      return { kind: "interrupted", id: intendedId };
    }

    try {
      await environment.bringIntoView(authoringTarget.location, "smooth");
    } catch {
      return { kind: "interrupted", id: intendedId };
    }
    if (!this.#isCurrent(token)) return { kind: "interrupted", id: intendedId };

    const selectionTarget = this.#resolve(target.id);
    if (!selectionTarget) return { kind: "missing", id: target.id };
    const authoringSelectionTarget = this.#resolveAuthoringTarget(selectionTarget);
    if (!authoringSelectionTarget) return { kind: "missing", id: target.id };
    let transaction: Transaction | null;
    try {
      transaction = environment.createActivationTransaction(authoringSelectionTarget.location);
    } catch {
      return { kind: "interrupted", id: intendedId };
    }
    if (!transaction) {
      return { kind: "interrupted", id: intendedId };
    }
    setSemanticSelectionTransactionMeta(transaction, {
      intendedId,
      origin: options.origin,
    });
    editor.dispatch(transaction);
    if (options.focusEditor) editor.focus();

    return this.#resolve(intendedId)
      ? { kind: "reached", id: intendedId }
      : { kind: "missing", id: intendedId };
  }

  #resolveAuthoringTarget(target: ResolvedSemanticTarget): ResolvedSemanticTarget | null {
    const anchorId = target.location.authoringAnchorId;
    if (anchorId) return this.#resolve(anchorId);
    const item = this.#getSemantics().itemById.get(target.id);
    if (item?.kind !== "course-section") return target;
    const surfaceId = this.#resolveSurfaceId(target);
    return surfaceId ? this.#resolve(surfaceId) : null;
  }

  #isCurrent(token: number): boolean {
    return token === this.#requestToken;
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
