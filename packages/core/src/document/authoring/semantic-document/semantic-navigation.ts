import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type {
  SemanticActivationRelationship,
  SemanticDocumentSnapshot,
  SemanticLocation,
} from "@/document/model/semantic-document";
import {
  setNodeSelectionInTransaction,
  setTextSelectionInTransaction,
  setTextSelectionNearInTransaction,
} from "@/editor/selection/selection-transactions";

import {
  SemanticContainerAdapterRegistry,
  type SemanticContainerAdapter,
} from "./semantic-container-adapter-registry";
import {
  setSemanticSelectionTransactionMeta,
  type SemanticSelectionOrigin,
} from "./semantic-selection-origin";

export interface SemanticNavigationEditor {
  getState(): EditorState;
  dispatch(transaction: Transaction): void;
  focus(): void;
}

export interface SemanticNavigationEnvironment {
  presentSurface(surfaceId: EmbeddedNodeId): Promise<void>;
  bringIntoView(location: SemanticLocation, behavior: "instant" | "smooth"): Promise<void>;
}

export interface SemanticNavigationOptions {
  readonly origin: Extract<SemanticSelectionOrigin, "document-outline" | "presentation-timeline">;
  readonly focusEditor?: boolean;
}

export type SemanticNavigationResult =
  | { readonly kind: "reached"; readonly id: EmbeddedNodeId }
  | {
      readonly kind: "reached-owner";
      readonly requestedId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly reason: "missing-container-adapter" | "child-unavailable";
    }
  | { readonly kind: "missing"; readonly id: EmbeddedNodeId }
  | { readonly kind: "interrupted"; readonly id: EmbeddedNodeId };

interface SemanticNavigationCoordinatorInput {
  readonly registry: SemanticContainerAdapterRegistry;
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
  readonly #registry: SemanticContainerAdapterRegistry;
  readonly #getSemantics: () => SemanticDocumentSnapshot;
  readonly #getCourseStructure: () => ProjectedCourseStructure;
  #editor: SemanticNavigationEditor | null;
  #environment: SemanticNavigationEnvironment | null;
  #requestToken = 0;

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
  }

  async select(
    id: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    const token = ++this.#requestToken;
    const completedAdapters = new Map<string, SemanticContainerAdapter>();
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
      const next = this.#nextActivation(target, completedAdapters);
      if (!next) return this.#reach(target, token, options);

      const adapter = this.#registry.get(next.ownerId);
      if (!adapter) {
        return this.#reachOwner(target, next, token, options, "missing-container-adapter");
      }

      let result;
      try {
        result = await adapter.reveal(next.childId, "navigate");
      } catch {
        result = "child-unavailable" as const;
      }
      if (!this.#isCurrent(token)) return { kind: "interrupted", id };

      const currentTarget = this.#resolve(id);
      if (!currentTarget) return { kind: "missing", id };
      if (this.#registry.get(next.ownerId) !== adapter) {
        return this.#reachOwner(currentTarget, next, token, options, "missing-container-adapter");
      }
      if (result === "child-unavailable" || result === "suppressed-by-user") {
        return this.#reachOwner(currentTarget, next, token, options, "child-unavailable");
      }
      completedAdapters.set(activationKey(next), adapter);
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
    completedAdapters: ReadonlyMap<string, SemanticContainerAdapter>,
  ): SemanticActivationRelationship | null {
    for (const relationship of target.location.activationPath) {
      const adapter = this.#registry.get(relationship.ownerId);
      if (adapter && completedAdapters.get(activationKey(relationship)) === adapter) continue;
      return relationship;
    }
    return null;
  }

  async #reachOwner(
    target: ResolvedSemanticTarget,
    failedRelationship: SemanticActivationRelationship,
    token: number,
    options: SemanticNavigationOptions,
    reason: "missing-container-adapter" | "child-unavailable",
  ): Promise<SemanticNavigationResult> {
    const ownerId = this.#nearestSemanticOwner(target, failedRelationship);
    if (!ownerId) return { kind: "missing", id: target.id };
    const owner = this.#resolve(ownerId);
    if (!owner) return { kind: "missing", id: target.id };
    const reached = await this.#reach(owner, token, options);
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
  ): Promise<SemanticNavigationResult> {
    if (!this.#isCurrent(token)) return { kind: "interrupted", id: target.id };
    const currentTarget = this.#resolve(target.id);
    const editor = this.#editor;
    const environment = this.#environment;
    if (!currentTarget) return { kind: "missing", id: target.id };
    if (!editor || !environment) return { kind: "interrupted", id: target.id };
    const authoringTarget = this.#resolveAuthoringTarget(currentTarget);
    if (!authoringTarget) return { kind: "missing", id: target.id };

    const preflightTransaction = editor.getState().tr;
    if (!setSelectionForLocation(preflightTransaction, authoringTarget.location)) {
      return { kind: "interrupted", id: target.id };
    }

    try {
      await environment.bringIntoView(authoringTarget.location, "smooth");
    } catch {
      return { kind: "interrupted", id: target.id };
    }
    if (!this.#isCurrent(token)) return { kind: "interrupted", id: target.id };

    const selectionTarget = this.#resolve(target.id);
    if (!selectionTarget) return { kind: "missing", id: target.id };
    const authoringSelectionTarget = this.#resolveAuthoringTarget(selectionTarget);
    if (!authoringSelectionTarget) return { kind: "missing", id: target.id };
    const transaction = editor.getState().tr;
    if (!setSelectionForLocation(transaction, authoringSelectionTarget.location)) {
      return { kind: "interrupted", id: target.id };
    }
    setSemanticSelectionTransactionMeta(transaction, {
      intendedId: target.id,
      origin: options.origin,
    });
    editor.dispatch(transaction);
    if (options.focusEditor) editor.focus();

    return this.#resolve(target.id)
      ? { kind: "reached", id: target.id }
      : { kind: "missing", id: target.id };
  }

  #resolveAuthoringTarget(target: ResolvedSemanticTarget): ResolvedSemanticTarget | null {
    const anchorId = target.location.authoringAnchorId;
    return anchorId ? this.#resolve(anchorId) : target;
  }

  #isCurrent(token: number): boolean {
    return token === this.#requestToken;
  }
}

function setSelectionForLocation(transaction: Transaction, location: SemanticLocation): boolean {
  switch (location.selectionTarget.kind) {
    case "node":
      return setNodeSelectionInTransaction(transaction, location.selectionTarget.pos);
    case "text":
      return setTextSelectionInTransaction(
        transaction,
        location.selectionTarget.from,
        location.selectionTarget.to,
      );
    case "near":
      return setTextSelectionNearInTransaction(transaction, location.selectionTarget.pos);
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
