import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Transaction } from "@tiptap/pm/state";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type {
  DocumentTreeItem,
  DocumentTreeSnapshot,
  DocumentItemLocation,
} from "@/document/model/document-tree";
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

interface NavigationRequestSnapshot {
  readonly requestedId: EmbeddedNodeId;
  readonly resolvedTarget: ResolvedDocumentTarget;
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
      if (requestAbortController.signal.aborted) return { kind: "interrupted", id };
      let activationTarget = this.#resolveLayerNavigationTarget(id);
      if (!activationTarget) return { kind: "missing", id };

      while (true) {
        const activation = await this.#targetInteractions.activate(activationTarget.id, {
          origin: options.origin,
          signal: requestAbortController.signal,
        });
        if (!this.#isCurrent(token)) return { kind: "interrupted", id };

        switch (activation.kind) {
          case "missing-target": {
            const currentTarget = this.#resolveLayerNavigationTarget(id);
            if (currentTarget && !sameNavigationActivation(currentTarget, activationTarget)) {
              activationTarget = currentTarget;
              continue;
            }
            return { kind: "missing", id };
          }
          case "interrupted":
            return { kind: "interrupted", id };
          case "unavailable":
          case "refused": {
            const currentTarget = this.#resolveLayerNavigationTarget(id);
            if (!currentTarget) return { kind: "missing", id };
            if (!sameNavigationActivation(currentTarget, activationTarget)) {
              return { kind: "interrupted", id };
            }
            return await this.#reachOwner(
              { requestedId: id, resolvedTarget: currentTarget },
              activation.nearestReachableOwnerId,
              token,
              options,
              activation.reason,
            );
          }
          case "reached": {
            const currentTarget = this.#resolveLayerNavigationTarget(id);
            if (!currentTarget) return { kind: "missing", id };
            if (!sameNavigationActivation(currentTarget, activationTarget)) {
              activationTarget = currentTarget;
              continue;
            }
            return await this.#reach(currentTarget, token, options, {
              requestedId: id,
              resolvedTarget: currentTarget,
            });
          }
        }
        const unreachable: never = activation;
        return unreachable;
      }
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

  #resolveLayerNavigationTarget(id: EmbeddedNodeId): ResolvedDocumentTarget | null {
    const target = this.#resolve(id);
    if (!target) return null;
    const item = this.#getDocumentTree().itemById.get(id);
    return item?.kind === "layer" ? this.#resolveLayerContentTarget(item) : target;
  }

  async #reachOwner(
    request: NavigationRequestSnapshot,
    ownerId: EmbeddedNodeId | null,
    token: number,
    options: EditorNavigationOptions,
    reason: EditorNavigationReachedOwnerReason,
  ): Promise<EditorNavigationResult> {
    if (!ownerId) return { kind: "missing", id: request.requestedId };
    const owner = this.#resolve(ownerId);
    if (!owner) return { kind: "missing", id: request.requestedId };
    const reached = await this.#reach(owner, token, options, request);
    if (reached.kind !== "reached") return reached;
    return {
      kind: "reached-owner",
      requestedId: request.requestedId,
      ownerId,
      reason,
    };
  }

  async #reach(
    target: ResolvedDocumentTarget,
    token: number,
    options: EditorNavigationOptions,
    request: NavigationRequestSnapshot,
  ): Promise<EditorNavigationResult> {
    if (!this.#isCurrent(token)) return { kind: "interrupted", id: request.requestedId };
    const currentTarget = this.#resolve(target.id);
    const editor = this.#editor;
    const environment = this.#environment;
    if (!currentTarget) return { kind: "missing", id: request.requestedId };
    if (!editor || !environment) return { kind: "interrupted", id: request.requestedId };
    if (!sameNavigationActivation(currentTarget, target)) {
      return { kind: "interrupted", id: request.requestedId };
    }
    const currentRequestedTarget = this.#resolveLayerNavigationTarget(request.requestedId);
    if (!currentRequestedTarget) return { kind: "missing", id: request.requestedId };
    if (!sameNavigationActivation(currentRequestedTarget, request.resolvedTarget)) {
      return { kind: "interrupted", id: request.requestedId };
    }
    const authoringTarget = this.#resolveAuthoringTarget(currentTarget);
    if (!authoringTarget) return { kind: "missing", id: request.requestedId };

    let preflightTransaction: Transaction | null;
    try {
      preflightTransaction = environment.createActivationTransaction(authoringTarget.location);
    } catch {
      return { kind: "interrupted", id: request.requestedId };
    }
    if (!preflightTransaction) {
      return { kind: "interrupted", id: request.requestedId };
    }

    try {
      await environment.bringIntoView(authoringTarget.location, "smooth");
    } catch {
      return { kind: "interrupted", id: request.requestedId };
    }
    if (!this.#isCurrent(token)) return { kind: "interrupted", id: request.requestedId };

    const selectionTarget = this.#resolve(target.id);
    if (!selectionTarget) return { kind: "missing", id: request.requestedId };
    if (!sameNavigationActivation(selectionTarget, currentTarget)) {
      return { kind: "interrupted", id: request.requestedId };
    }
    const currentRequestedSelectionTarget = this.#resolveLayerNavigationTarget(request.requestedId);
    if (!currentRequestedSelectionTarget) return { kind: "missing", id: request.requestedId };
    if (!sameNavigationActivation(currentRequestedSelectionTarget, request.resolvedTarget)) {
      return { kind: "interrupted", id: request.requestedId };
    }
    const authoringSelectionTarget = this.#resolveAuthoringTarget(selectionTarget);
    if (!authoringSelectionTarget) return { kind: "missing", id: request.requestedId };
    if (!sameNavigationActivation(authoringSelectionTarget, authoringTarget)) {
      return { kind: "interrupted", id: request.requestedId };
    }
    let transaction: Transaction | null;
    try {
      transaction = environment.createActivationTransaction(authoringSelectionTarget.location);
    } catch {
      return { kind: "interrupted", id: request.requestedId };
    }
    if (!transaction) {
      return { kind: "interrupted", id: request.requestedId };
    }
    setEditorSelectionTransactionMeta(transaction, {
      intendedId: request.requestedId,
      origin: options.origin,
    });
    editor.dispatch(transaction);
    if (options.focusEditor) editor.focus();

    return this.#resolve(request.requestedId)
      ? { kind: "reached", id: request.requestedId }
      : { kind: "missing", id: request.requestedId };
  }

  #resolveAuthoringTarget(target: ResolvedDocumentTarget): ResolvedDocumentTarget | null {
    const anchorId = target.location.authoringAnchorId;
    if (anchorId) return this.#resolve(anchorId);
    const item = this.#getDocumentTree().itemById.get(target.id);
    if (item?.kind === "layer") return this.#resolveLayerContentTarget(item);
    if (item?.kind !== "course-section") return target;
    const surfaceId = this.#resolveSurfaceId(target);
    return surfaceId ? this.#resolve(surfaceId) : null;
  }

  #resolveLayerContentTarget(layer: DocumentTreeItem): ResolvedDocumentTarget {
    let fallback: ResolvedDocumentTarget | null = null;
    for (const item of publishedDescendants(layer)) {
      const target = this.#resolve(item.id);
      if (!target) {
        throw new Error(`Published Layer content "${item.id}" has no current location.`);
      }
      if (target.location.selectionTarget.kind === "text") return target;
      fallback ??= target;
    }
    if (fallback) return fallback;
    throw new Error(`Published Layer "${layer.id}" has no addressable content.`);
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

function publishedDescendants(layer: DocumentTreeItem): readonly DocumentTreeItem[] {
  const descendants: DocumentTreeItem[] = [];
  const visit = (item: DocumentTreeItem): void => {
    descendants.push(item);
    for (const child of item.children) visit(child);
  };
  for (const child of layer.children) visit(child);
  return descendants;
}

function sameNavigationActivation(
  left: ResolvedDocumentTarget,
  right: ResolvedDocumentTarget,
): boolean {
  if (
    left.id !== right.id ||
    left.location.surfaceId !== right.location.surfaceId ||
    left.location.authoringAnchorId !== right.location.authoringAnchorId ||
    left.location.activationPath.length !== right.location.activationPath.length
  ) {
    return false;
  }
  return left.location.activationPath.every((relationship, index) => {
    const other = right.location.activationPath[index];
    return (
      other?.ownerKind === relationship.ownerKind &&
      other.ownerId === relationship.ownerId &&
      other.childId === relationship.childId
    );
  });
}
