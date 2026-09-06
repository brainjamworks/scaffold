import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Transaction } from "@tiptap/pm/state";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot, DocumentItemLocation } from "@/document/model/document-tree";
import { resolveDocumentItemSurfaceId } from "@/document/model/document-tree";
import type {
  SemanticTargetInteractionCoordinator,
  SemanticTargetInteractionResult,
} from "@/document/semantic-target-interaction";

import {
  setEditorSelectionTransactionMeta,
  type EditorSelectionOrigin,
} from "./editor-selection-origin";

export interface EditorNavigationEditor {
  dispatch(transaction: Transaction): void;
  focus(): void;
}

export interface EditorNavigationEnvironment {
  presentSurface(surfaceId: EmbeddedNodeId): Promise<void>;
  createActivationTransaction(location: DocumentItemLocation): Transaction | null;
  bringIntoView(location: DocumentItemLocation, behavior: "instant" | "smooth"): Promise<void>;
}

export interface EditorNavigationOptions {
  readonly origin: Extract<EditorSelectionOrigin, "document-outline" | "presentation-timeline">;
  readonly focusEditor?: boolean;
  readonly signal?: AbortSignal;
}

type EditorNavigationReachedOwnerReason = Extract<
  SemanticTargetInteractionResult,
  { kind: "unavailable" | "refused" }
>["reason"];

export type EditorNavigationResult =
  | { readonly kind: "reached"; readonly id: EmbeddedNodeId }
  | {
      readonly kind: "reached-owner";
      readonly requestedId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly reason: EditorNavigationReachedOwnerReason;
    }
  | { readonly kind: "missing"; readonly id: EmbeddedNodeId }
  | { readonly kind: "interrupted"; readonly id: EmbeddedNodeId };

interface EditorNavigationCoordinatorInput {
  readonly targetInteractions: SemanticTargetInteractionCoordinator;
  readonly getDocumentTree: () => DocumentTreeSnapshot;
  readonly getCourseStructure: () => ProjectedCourseStructure;
  readonly editor?: EditorNavigationEditor;
  readonly environment?: EditorNavigationEnvironment;
}

interface ResolvedDocumentTarget {
  readonly id: EmbeddedNodeId;
  readonly location: DocumentItemLocation;
}

export class EditorNavigationCoordinator {
  readonly #targetInteractions: SemanticTargetInteractionCoordinator;
  readonly #getDocumentTree: () => DocumentTreeSnapshot;
  readonly #getCourseStructure: () => ProjectedCourseStructure;
  #editor: EditorNavigationEditor | null;
  #environment: EditorNavigationEnvironment | null;
  #requestToken = 0;
  #requestAbortController: AbortController | null = null;

  constructor({
    targetInteractions,
    getDocumentTree,
    getCourseStructure,
    editor,
    environment,
  }: EditorNavigationCoordinatorInput) {
    this.#targetInteractions = targetInteractions;
    this.#getDocumentTree = getDocumentTree;
    this.#getCourseStructure = getCourseStructure;
    this.#editor = editor ?? null;
    this.#environment = environment ?? null;
  }

  setEditor(editor: EditorNavigationEditor): void {
    this.interrupt();
    this.#editor = editor;
  }

  setEnvironment(environment: EditorNavigationEnvironment): void {
    this.interrupt();
    this.#environment = environment;
  }

  clearEnvironment(): void {
    this.interrupt();
    this.#editor = null;
    this.#environment = null;
  }

  interrupt(): void {
    this.#requestToken += 1;
    this.#requestAbortController?.abort();
    this.#requestAbortController = null;
  }

  async showTarget(
    id: EmbeddedNodeId,
    options: EditorNavigationOptions,
  ): Promise<EditorNavigationResult> {
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

  #resolve(id: EmbeddedNodeId): ResolvedDocumentTarget | null {
    const tree = this.#getDocumentTree();
    if (!tree.itemById.has(id)) return null;
    const location = tree.locationById.get(id);
    return location ? { id, location } : null;
  }

  #resolveSurfaceId(target: ResolvedDocumentTarget): EmbeddedNodeId | null {
    return resolveDocumentItemSurfaceId(
      target.id,
      this.#getDocumentTree(),
      this.#getCourseStructure(),
    );
  }

  async #reachOwner(
    requestedId: EmbeddedNodeId,
    ownerId: EmbeddedNodeId | null,
    token: number,
    options: EditorNavigationOptions,
    reason: EditorNavigationReachedOwnerReason,
  ): Promise<EditorNavigationResult> {
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
    target: ResolvedDocumentTarget,
    token: number,
    options: EditorNavigationOptions,
    intendedId: EmbeddedNodeId = target.id,
  ): Promise<EditorNavigationResult> {
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
    setEditorSelectionTransactionMeta(transaction, {
      intendedId,
      origin: options.origin,
    });
    editor.dispatch(transaction);
    if (options.focusEditor) editor.focus();

    return this.#resolve(intendedId)
      ? { kind: "reached", id: intendedId }
      : { kind: "missing", id: intendedId };
  }

  #resolveAuthoringTarget(target: ResolvedDocumentTarget): ResolvedDocumentTarget | null {
    const anchorId = target.location.authoringAnchorId;
    if (anchorId) return this.#resolve(anchorId);
    const item = this.#getDocumentTree().itemById.get(target.id);
    if (item?.kind !== "course-section") return target;
    const surfaceId = this.#resolveSurfaceId(target);
    return surfaceId ? this.#resolve(surfaceId) : null;
  }

  #isCurrent(token: number): boolean {
    return token === this.#requestToken;
  }

  dispose(): void {
    this.interrupt();
    this.#editor = null;
    this.#environment = null;
  }
}
