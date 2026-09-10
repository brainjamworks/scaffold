import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";

import type { DocumentTreeSnapshot } from "@/document/model/document-tree";
import type {
  SemanticActivationRegistryPort,
  SemanticActivationRequest,
  SemanticActivationOutcome,
} from "@/document/semantic-target-interaction";
import type { PresentationVisualScene } from "@/presentation/model";

export const PRESENTATION_LAYER_OWNER_ID_ATTRIBUTE = "data-layer-owner-id";
export const PRESENTATION_LAYER_STATE_ATTRIBUTE = "data-layer-state";

export interface PresentationLayerApplicationPort {
  applySelection(
    scene: Pick<PresentationVisualScene, "surfaceId" | "selectedLayerByOwnerId">,
  ): void;
}

export interface PresentationLayerRuntime {
  getSelectedLayerId(
    surfaceId: EmbeddedNodeId,
    ownerId: EmbeddedNodeId,
  ): EmbeddedNodeId | undefined;
  subscribe(listener: () => void): () => void;
  createApplicationPort(surfaceRoot: HTMLElement): PresentationLayerApplicationPort;
  reconcileSemanticOwners(): void;
  dispose(): void;
}

export interface CreatePresentationLayerRuntimeInput {
  readonly activationRegistry: Pick<SemanticActivationRegistryPort, "register">;
  readonly getSemantics: () => DocumentTreeSnapshot;
  readonly getInitialLayerId: (
    surfaceId: EmbeddedNodeId,
    ownerId: EmbeddedNodeId,
  ) => EmbeddedNodeId | undefined;
}

interface MountedLayer {
  readonly element: HTMLElement;
  readonly layerId: EmbeddedNodeId;
  readonly ownerId: EmbeddedNodeId;
  readonly depth: number;
}

/**
 * Editor-owned projection state for Layer choices. It never derives time or a
 * schedule: the visual scene remains the sole source of playback selection.
 */
export function createPresentationLayerRuntime({
  activationRegistry,
  getSemantics,
  getInitialLayerId,
}: CreatePresentationLayerRuntimeInput): PresentationLayerRuntime {
  const selectedBySurfaceId = new Map<
    EmbeddedNodeId,
    ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>
  >();
  const listeners = new Set<() => void>();
  const unregisterByOwnerId = new Map<EmbeddedNodeId, () => void>();
  let disposed = false;

  const activateRegionLayer = async (
    registeredOwnerId: EmbeddedNodeId,
    request: SemanticActivationRequest,
  ): Promise<SemanticActivationOutcome> => {
    const { relationship } = request;
    if (relationship.ownerId !== registeredOwnerId) {
      throw new Error(
        `Runtime Layer binding for "${registeredOwnerId}" received owner "${relationship.ownerId}".`,
      );
    }
    if (relationship.ownerKind !== "region") {
      throw new Error(
        `Runtime Region Layer binding for "${registeredOwnerId}" received owner kind "${relationship.ownerKind}".`,
      );
    }
    if (request.signal.aborted || disposed) {
      return activationOutcome("interrupted", relationship);
    }

    const semantics = getSemantics();
    const owner = semantics.itemById.get(registeredOwnerId);
    if (!owner) return unavailableOutcome("owner-unmounted", relationship);
    if (owner.kind !== "region") {
      throw new Error(
        `Runtime Region Layer owner "${registeredOwnerId}" changed kind to "${owner.kind}".`,
      );
    }
    const child = owner.children.find(({ id }) => id === relationship.childId);
    if (!child || child.kind !== "layer") {
      return unavailableOutcome("child-missing", relationship);
    }
    const surfaceId = semantics.locationById.get(registeredOwnerId)?.surfaceId;
    if (!surfaceId) {
      throw new Error(
        `Runtime Region Layer owner "${registeredOwnerId}" has no Surface ownership.`,
      );
    }

    const selectedLayerId =
      selectedBySurfaceId.get(surfaceId)?.get(registeredOwnerId) ??
      getInitialLayerId(surfaceId, registeredOwnerId);
    return selectedLayerId === relationship.childId
      ? activationOutcome("already-visible", relationship)
      : refusedHiddenLayerOutcome(relationship);
  };

  const reconcileSemanticOwners = (): void => {
    assertNotDisposed(disposed);
    const semantics = getSemantics();
    const nextOwnerIds = new Set<EmbeddedNodeId>();
    for (const item of semantics.itemById.values()) {
      if (item.kind === "region" && item.children.some((child) => child.kind === "layer")) {
        nextOwnerIds.add(item.id);
      }
    }

    for (const [ownerId, unregister] of unregisterByOwnerId) {
      if (nextOwnerIds.has(ownerId)) continue;
      unregister();
      unregisterByOwnerId.delete(ownerId);
    }
    for (const ownerId of nextOwnerIds) {
      if (unregisterByOwnerId.has(ownerId)) continue;
      unregisterByOwnerId.set(
        ownerId,
        activationRegistry.register({
          ownerId,
          activate: (request) => activateRegionLayer(ownerId, request),
        }),
      );
    }
  };

  reconcileSemanticOwners();

  return Object.freeze({
    getSelectedLayerId(surfaceId: EmbeddedNodeId, ownerId: EmbeddedNodeId) {
      assertNotDisposed(disposed);
      return selectedBySurfaceId.get(surfaceId)?.get(ownerId);
    },
    subscribe(listener: () => void) {
      assertNotDisposed(disposed);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createApplicationPort(surfaceRoot: HTMLElement) {
      assertNotDisposed(disposed);
      return Object.freeze({
        applySelection(
          scene: Pick<PresentationVisualScene, "surfaceId" | "selectedLayerByOwnerId">,
        ) {
          assertNotDisposed(disposed);
          const selected = new Map(scene.selectedLayerByOwnerId);
          const prior = selectedBySurfaceId.get(scene.surfaceId);
          if (sameSelection(prior, selected)) return;

          const mounted = resolveMountedLayers(surfaceRoot);
          assertMountedSelectionOwnership(mounted, selected);
          selectedBySurfaceId.set(scene.surfaceId, selected);

          const relevant = mounted.filter(({ ownerId }) => selected.has(ownerId));
          // Withhold every outgoing or otherwise non-selected composition before
          // any incoming composition becomes available.
          for (const layer of relevant) {
            if (selected.get(layer.ownerId) !== layer.layerId) setLayerActive(layer.element, false);
          }
          // DOM ancestry depth is the projection order for nested logical owners.
          for (const layer of [...relevant].sort((left, right) => left.depth - right.depth)) {
            if (selected.get(layer.ownerId) === layer.layerId) setLayerActive(layer.element, true);
          }

          for (const listener of [...listeners]) listener();
        },
      });
    },
    reconcileSemanticOwners,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const unregister of unregisterByOwnerId.values()) unregister();
      unregisterByOwnerId.clear();
      selectedBySurfaceId.clear();
      listeners.clear();
    },
  });
}

function activationOutcome(
  kind: "already-visible" | "interrupted",
  relationship: SemanticActivationRequest["relationship"],
): SemanticActivationOutcome {
  return Object.freeze({
    kind,
    ownerId: relationship.ownerId,
    childId: relationship.childId,
  });
}

function unavailableOutcome(
  reason: "owner-unmounted" | "child-missing",
  relationship: SemanticActivationRequest["relationship"],
): SemanticActivationOutcome {
  return Object.freeze({
    kind: "unavailable",
    ownerId: relationship.ownerId,
    childId: relationship.childId,
    reason,
  });
}

function refusedHiddenLayerOutcome(
  relationship: SemanticActivationRequest["relationship"],
): SemanticActivationOutcome {
  return Object.freeze({
    kind: "refused",
    ownerId: relationship.ownerId,
    childId: relationship.childId,
    reason: "hidden-layer-ancestor",
  });
}

function resolveMountedLayers(surfaceRoot: HTMLElement): readonly MountedLayer[] {
  const mounted: MountedLayer[] = [];
  const seenLayerIds = new Set<EmbeddedNodeId>();
  for (const element of surfaceRoot.querySelectorAll<HTMLElement>('[data-node="layer"]')) {
    const layerId = EmbeddedNodeIdSchema.parse(element.getAttribute("data-layer-id"));
    const ownerId = EmbeddedNodeIdSchema.parse(
      element.getAttribute(PRESENTATION_LAYER_OWNER_ID_ATTRIBUTE),
    );
    if (seenLayerIds.has(layerId)) {
      throw new Error(`Runtime Surface contains duplicate mounted Layer "${layerId}".`);
    }
    seenLayerIds.add(layerId);
    mounted.push(Object.freeze({ element, layerId, ownerId, depth: elementDepth(element) }));
  }
  return mounted;
}

function assertMountedSelectionOwnership(
  mounted: readonly MountedLayer[],
  selected: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
): void {
  const layersByOwnerId = new Map<EmbeddedNodeId, Set<EmbeddedNodeId>>();
  for (const { layerId, ownerId } of mounted) {
    const layers = layersByOwnerId.get(ownerId) ?? new Set<EmbeddedNodeId>();
    layers.add(layerId);
    layersByOwnerId.set(ownerId, layers);
  }
  for (const [ownerId, layerId] of selected) {
    const mountedLayers = layersByOwnerId.get(ownerId);
    // Feature-owned content may legitimately be unmounted. If any of an
    // owner's Layers are mounted, however, its selected Layer must be among them.
    if (mountedLayers && !mountedLayers.has(layerId)) {
      throw new Error(
        `Projected Layer "${layerId}" is not mounted beneath runtime owner "${ownerId}".`,
      );
    }
  }
}

function setLayerActive(element: HTMLElement, active: boolean): void {
  element.toggleAttribute("data-layer-active", active);
  element.setAttribute(PRESENTATION_LAYER_STATE_ATTRIBUTE, active ? "active" : "inactive");
  element.hidden = !active;
  element.toggleAttribute("inert", !active);
  if (active) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", "true");
}

function elementDepth(element: HTMLElement): number {
  let depth = 0;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) depth += 1;
  return depth;
}

function sameSelection(
  left: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId> | undefined,
  right: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
): boolean {
  if (!left || left.size !== right.size) return false;
  for (const [ownerId, layerId] of right) {
    if (left.get(ownerId) !== layerId) return false;
  }
  return true;
}

function assertNotDisposed(disposed: boolean): void {
  if (disposed) throw new Error("Presentation Layer runtime has been disposed.");
}
