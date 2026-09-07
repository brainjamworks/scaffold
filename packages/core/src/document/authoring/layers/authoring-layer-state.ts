import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  DocumentItemActivation,
  DocumentTreeItem,
  DocumentTreeSnapshot,
} from "@/document/model/document-tree";
import type {
  MountedSemanticActivationBinding,
  SemanticActivationOutcome,
  SemanticActivationRequest,
} from "@/document/semantic-target-interaction";

type LayerOwnerKind = Extract<DocumentItemActivation["ownerKind"], "region" | "cell" | "section">;

interface LayerOwnerRecord {
  readonly ownerId: EmbeddedNodeId;
  readonly ownerKind: LayerOwnerKind;
  readonly orderedLayerIds: readonly EmbeddedNodeId[];
}

export interface AuthoringLayerStateSnapshot {
  readonly openLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
}

export type OpenAuthoringLayerAncestorsResult =
  | {
      readonly kind: "opened";
      readonly targetId: EmbeddedNodeId;
      readonly openedLayerIds: readonly EmbeddedNodeId[];
    }
  | { readonly kind: "missing-target"; readonly targetId: EmbeddedNodeId };

export interface AuthoringLayerActivationRegistry {
  register(binding: MountedSemanticActivationBinding): () => void;
}

export interface CreateAuthoringLayerStateInput {
  readonly documentTree: DocumentTreeSnapshot;
  readonly activationRegistry: AuthoringLayerActivationRegistry;
}

/** Editor-session authority for the composition opened for authoring in each logical owner. */
export class AuthoringLayerState {
  readonly #activationRegistry: AuthoringLayerActivationRegistry;
  readonly #listeners = new Set<() => void>();
  readonly #unregisterByOwnerId = new Map<EmbeddedNodeId, () => void>();
  #owners = new Map<EmbeddedNodeId, LayerOwnerRecord>();
  #snapshot: AuthoringLayerStateSnapshot = createSnapshot(new Map());
  #disposed = false;

  constructor({ documentTree, activationRegistry }: CreateAuthoringLayerStateInput) {
    this.#activationRegistry = activationRegistry;
    this.#reconcile(documentTree);
  }

  readonly getSnapshot = (): AuthoringLayerStateSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getOpenLayerId(ownerId: EmbeddedNodeId): EmbeddedNodeId | null {
    return this.#snapshot.openLayerByOwnerId.get(ownerId) ?? null;
  }

  reconcile(documentTree: DocumentTreeSnapshot): void {
    if (this.#disposed) {
      throw new Error("Cannot reconcile authoring Layer state after disposal");
    }
    this.#reconcile(documentTree);
  }

  openAncestorsForTarget(
    documentTree: DocumentTreeSnapshot,
    targetId: EmbeddedNodeId,
  ): OpenAuthoringLayerAncestorsResult {
    if (this.#disposed) {
      throw new Error("Cannot open authoring Layer ancestors after disposal");
    }
    if (!documentTree.itemById.has(targetId)) {
      return Object.freeze({ kind: "missing-target", targetId });
    }

    const layers: EmbeddedNodeId[] = [];
    let candidate: EmbeddedNodeId | null = targetId;
    while (candidate) {
      const item = documentTree.itemById.get(candidate);
      if (!item) {
        throw new Error(`Document Tree ancestry contains missing item "${candidate}".`);
      }
      if (item.kind === "layer") layers.push(item.id);
      candidate = documentTree.parentById.get(candidate) ?? null;
    }

    const nextOpen = new Map(this.#snapshot.openLayerByOwnerId);
    const openedLayerIds: EmbeddedNodeId[] = [];
    for (const layerId of layers.reverse()) {
      const ownerId = documentTree.parentById.get(layerId);
      if (!ownerId) throw new Error(`Layer "${layerId}" has no logical owner in Document Tree.`);
      const owner = this.#owners.get(ownerId);
      if (!owner || !owner.orderedLayerIds.includes(layerId)) {
        throw new Error(`Layer "${layerId}" is not owned by "${ownerId}" in authoring state.`);
      }
      if (nextOpen.get(ownerId) === layerId) continue;
      nextOpen.set(ownerId, layerId);
      openedLayerIds.push(layerId);
    }
    this.#replaceOpenLayers(nextOpen);

    return Object.freeze({
      kind: "opened",
      targetId,
      openedLayerIds: Object.freeze(openedLayerIds),
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const unregister of this.#unregisterByOwnerId.values()) unregister();
    this.#unregisterByOwnerId.clear();
    this.#listeners.clear();
  }

  #reconcile(documentTree: DocumentTreeSnapshot): void {
    const nextOwners = collectLayerOwners(documentTree);
    for (const [ownerId, nextOwner] of nextOwners) {
      const previousOwner = this.#owners.get(ownerId);
      if (previousOwner && previousOwner.ownerKind !== nextOwner.ownerKind) {
        throw new Error(
          `Layer owner "${ownerId}" changed kind from "${previousOwner.ownerKind}" to "${nextOwner.ownerKind}".`,
        );
      }
    }

    const nextOpen = new Map<EmbeddedNodeId, EmbeddedNodeId>();
    for (const [ownerId, nextOwner] of nextOwners) {
      const previousOwner = this.#owners.get(ownerId);
      const previousOpen = this.#snapshot.openLayerByOwnerId.get(ownerId);
      const openLayerId =
        previousOpen && nextOwner.orderedLayerIds.includes(previousOpen)
          ? previousOpen
          : previousOwner && previousOpen
            ? resolveDeletedLayerFallback(previousOwner, nextOwner, previousOpen)
            : nextOwner.orderedLayerIds[0];
      if (!openLayerId) {
        throw new Error(`Layer owner "${ownerId}" has no published Layers.`);
      }
      nextOpen.set(ownerId, openLayerId);
    }

    for (const [ownerId, unregister] of this.#unregisterByOwnerId) {
      if (nextOwners.has(ownerId)) continue;
      unregister();
      this.#unregisterByOwnerId.delete(ownerId);
    }
    this.#owners = nextOwners;
    for (const ownerId of nextOwners.keys()) {
      if (this.#unregisterByOwnerId.has(ownerId)) continue;
      const unregister = this.#activationRegistry.register(this.#createBinding(ownerId));
      this.#unregisterByOwnerId.set(ownerId, unregister);
    }
    this.#replaceOpenLayers(nextOpen);
  }

  #createBinding(ownerId: EmbeddedNodeId): MountedSemanticActivationBinding {
    return Object.freeze({
      ownerId,
      activate: (request: SemanticActivationRequest) => this.#activate(ownerId, request),
    });
  }

  async #activate(
    registeredOwnerId: EmbeddedNodeId,
    request: SemanticActivationRequest,
  ): Promise<SemanticActivationOutcome> {
    const relationship = request.relationship;
    if (relationship.ownerId !== registeredOwnerId) {
      throw new Error(
        `Authoring Layer binding for "${registeredOwnerId}" received owner "${relationship.ownerId}".`,
      );
    }
    const owner = this.#owners.get(registeredOwnerId);
    if (!owner) {
      return Object.freeze({
        kind: "unavailable",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
        reason: "owner-unmounted",
      });
    }
    if (relationship.ownerKind !== owner.ownerKind) {
      throw new Error(
        `Layer activation owner "${registeredOwnerId}" expected kind "${owner.ownerKind}" but received "${relationship.ownerKind}".`,
      );
    }
    if (request.signal.aborted || this.#disposed) {
      return Object.freeze({
        kind: "interrupted",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
      });
    }
    if (!owner.orderedLayerIds.includes(relationship.childId)) {
      return Object.freeze({
        kind: "unavailable",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
        reason: "child-missing",
      });
    }
    if (this.#snapshot.openLayerByOwnerId.get(registeredOwnerId) === relationship.childId) {
      return Object.freeze({
        kind: "already-visible",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
      });
    }
    if (!isExplicitAuthoringOrigin(request.origin)) {
      return Object.freeze({
        kind: "refused",
        ownerId: relationship.ownerId,
        childId: relationship.childId,
        reason: "hidden-layer-ancestor",
      });
    }

    const nextOpen = new Map(this.#snapshot.openLayerByOwnerId);
    nextOpen.set(registeredOwnerId, relationship.childId);
    this.#replaceOpenLayers(nextOpen);
    return Object.freeze({
      kind: "revealed",
      ownerId: relationship.ownerId,
      childId: relationship.childId,
    });
  }

  #replaceOpenLayers(nextOpen: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>): void {
    if (sameMap(this.#snapshot.openLayerByOwnerId, nextOpen)) return;
    this.#snapshot = createSnapshot(nextOpen);
    for (const listener of this.#listeners) listener();
  }
}

function collectLayerOwners(
  documentTree: DocumentTreeSnapshot,
): Map<EmbeddedNodeId, LayerOwnerRecord> {
  const owners = new Map<EmbeddedNodeId, LayerOwnerRecord>();
  const visit = (item: DocumentTreeItem): void => {
    const ownerKind = treeOwnerKind(item);
    if (ownerKind) {
      const orderedLayerIds = item.children
        .filter((child) => child.kind === "layer")
        .map((child) => child.id);
      if (orderedLayerIds.length > 0) {
        owners.set(
          item.id,
          Object.freeze({
            ownerId: item.id,
            ownerKind,
            orderedLayerIds: Object.freeze(orderedLayerIds),
          }),
        );
      }
    }
    for (const child of item.children) visit(child);
  };
  for (const root of documentTree.roots) visit(root);
  return owners;
}

function treeOwnerKind(item: DocumentTreeItem): LayerOwnerKind | null {
  if (item.kind === "region") return "region";
  if (item.kind === "cell") return "cell";
  if (item.kind === "layout-section") return "section";
  return null;
}

function resolveDeletedLayerFallback(
  previousOwner: LayerOwnerRecord,
  nextOwner: LayerOwnerRecord,
  deletedLayerId: EmbeddedNodeId,
): EmbeddedNodeId | undefined {
  const deletedIndex = previousOwner.orderedLayerIds.indexOf(deletedLayerId);
  if (deletedIndex < 0) return nextOwner.orderedLayerIds[0];
  const surviving = new Set(nextOwner.orderedLayerIds);
  for (let index = deletedIndex - 1; index >= 0; index -= 1) {
    const candidate = previousOwner.orderedLayerIds[index];
    if (candidate && surviving.has(candidate)) return candidate;
  }
  for (let index = deletedIndex + 1; index < previousOwner.orderedLayerIds.length; index += 1) {
    const candidate = previousOwner.orderedLayerIds[index];
    if (candidate && surviving.has(candidate)) return candidate;
  }
  return nextOwner.orderedLayerIds[0];
}

function isExplicitAuthoringOrigin(origin: SemanticActivationRequest["origin"]): boolean {
  return origin === "document-outline" || origin === "presentation-timeline";
}

function sameMap(
  left: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
  right: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

function createSnapshot(
  openLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
): AuthoringLayerStateSnapshot {
  return Object.freeze({ openLayerByOwnerId: new Map(openLayerByOwnerId) });
}
