import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Transaction } from "@tiptap/pm/state";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type {
  SemanticDocumentSnapshot,
  SemanticLocation,
} from "@/document/model/semantic-document";
import type {
  SemanticTargetInteractionCoordinator,
  SemanticTargetInteractionResult,
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
  readonly signal?: AbortSignal;
}

type SemanticNavigationReachedOwnerReason = Extract<
  SemanticTargetInteractionResult,
  { kind: "unavailable" | "refused" }
>["reason"];

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
  readonly targetInteractions: SemanticTargetInteractionCoordinator;
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
  readonly #targetInteractions: SemanticTargetInteractionCoordinator;
  readonly #getSemantics: () => SemanticDocumentSnapshot;
  readonly #getCourseStructure: () => ProjectedCourseStructure;
  #editor: SemanticNavigationEditor | null;
  #environment: SemanticNavigationEnvironment | null;
  #requestToken = 0;
  #requestAbortController: AbortController | null = null;

  constructor({
    targetInteractions,
    getSemantics,
    getCourseStructure,
    editor,
    environment,
  }: SemanticNavigationCoordinatorInput) {
    this.#targetInteractions = targetInteractions;
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
    const interruptFromExternalSignal = () => {
      if (this.#requestAbortController === requestAbortController) this.interrupt();
    };
    if (options.signal?.aborted) requestAbortController.abort();
    else options.signal?.addEventListener("abort", interruptFromExternalSignal, { once: true });

    try {
      const activation = await this.#targetInteractions.activate(id, {
        origin: options.origin,
        signal: requestAbortController.signal,
      });
      if (!this.#isCurrent(token)) return { kind: "interrupted", id };

      switch (activation.kind) {
        case "missing-target":
          return { kind: "missing", id };
        case "interrupted":
          return { kind: "interrupted", id };
        case "unavailable":
        case "refused":
          return await this.#reachOwner(
            id,
            activation.nearestReachableOwnerId,
            token,
            options,
            activation.reason,
          );
        case "reached": {
          const target = this.#resolve(id);
          return target ? await this.#reach(target, token, options) : { kind: "missing", id };
        }
      }
      const unreachable: never = activation;
      return unreachable;
    } finally {
      options.signal?.removeEventListener("abort", interruptFromExternalSignal);
      if (this.#requestAbortController === requestAbortController) {
        this.#requestAbortController = null;
      }
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

  async #reachOwner(
    requestedId: EmbeddedNodeId,
    ownerId: EmbeddedNodeId | null,
    token: number,
    options: SemanticNavigationOptions,
    reason: SemanticNavigationReachedOwnerReason,
  ): Promise<SemanticNavigationResult> {
    if (!ownerId) return { kind: "missing", id: requestedId };
    const owner = this.#resolve(ownerId);
    if (!owner) return { kind: "missing", id: requestedId };
    const reached = await this.#reach(owner, token, options, requestedId);
    if (reached.kind !== "reached") return reached;
    return {
      kind: "reached-owner",
      requestedId,
      ownerId,
      reason,
    };
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
