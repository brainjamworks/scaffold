import type { EmbeddedNodeId } from "@scaffold/contracts";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

import { getScaffoldCapabilitiesForState } from "@/composition/extensions/scaffold-capabilities-storage";
import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";
import {
  allowsLayerEditingTransaction,
  documentContainsLayer,
  NON_LAYER_DOCUMENT_MUTATION_ACCESS,
  type LayerEditingContext,
  type LayerMutationAccess,
} from "@/document/model/layers/layer-editing-policy";
import {
  createLayerOwnerSlotIndex,
  resolveLayerOwnerSlot,
  type LayerLogicalOwnerType,
} from "@/document/model/layers/layer-owner-slot";
import {
  CELL_NODE_TYPE,
  LAYER_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
} from "@/document/model/nodes/structural-node-types";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

export const layerEditingBoundaryPluginKey = new PluginKey("sc-layer-editing-boundary");
interface ScopedLayerOwnerRecord {
  readonly nodeType: LayerLogicalOwnerType;
  readonly orderedLayerIds: readonly EmbeddedNodeId[];
}

interface ScopedLayerEditingContextState extends LayerEditingContext {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly ownerById: ReadonlyMap<EmbeddedNodeId, ScopedLayerOwnerRecord>;
  readonly preferredLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
}
const scopedLayerEditingContextPluginKey = new PluginKey<ScopedLayerEditingContextState>(
  "sc-scoped-layer-editing-context",
);

export function createScopedLayerEditingContextExtension({
  blockDefinitions,
  layoutDefinitions,
  openLayerByOwnerId,
}: {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: LayoutRegistry;
  readonly openLayerByOwnerId: LayerEditingContext["openLayerByOwnerId"];
}) {
  return Extension.create({
    name: "scopedLayerEditingContext",

    addProseMirrorPlugins() {
      return [
        new Plugin<ScopedLayerEditingContextState>({
          key: scopedLayerEditingContextPluginKey,
          state: {
            init: (_config, state) =>
              createInitialScopedLayerEditingContext({
                blockDefinitions,
                document: state.doc,
                initialOpenLayerByOwnerId: openLayerByOwnerId,
                layoutDefinitions,
              }),
            apply: (transaction, currentContext) =>
              transaction.docChanged
                ? reconcileScopedLayerEditingContext(currentContext, transaction.doc)
                : currentContext,
          },
        }),
      ];
    },
  });
}

function createInitialScopedLayerEditingContext({
  blockDefinitions,
  document,
  initialOpenLayerByOwnerId,
  layoutDefinitions,
}: {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly document: ProseMirrorNode;
  readonly initialOpenLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
  readonly layoutDefinitions: LayoutRegistry;
}): ScopedLayerEditingContextState {
  const ownerById = collectScopedLayerOwners(document, layoutDefinitions);
  const ownerIdByLayerId = collectOwnerIdsByLayerId(ownerById);
  const currentInitialOpenLayerByOwnerId = new Map<EmbeddedNodeId, EmbeddedNodeId>();
  // An extension may outlive one editor instance. Missing entries are stale
  // preferences after deletion; live Layer ownership mismatches remain defects.
  for (const [ownerId, layerId] of initialOpenLayerByOwnerId) {
    const owner = ownerById.get(ownerId);
    if (!owner) {
      const currentOwnerId = ownerIdByLayerId.get(layerId);
      if (currentOwnerId) {
        throw new Error(
          `Scoped Layer editing context names Layer "${layerId}" for missing owner "${ownerId}", but it belongs to "${currentOwnerId}".`,
        );
      }
      continue;
    }
    if (owner.orderedLayerIds.includes(layerId)) {
      currentInitialOpenLayerByOwnerId.set(ownerId, layerId);
      continue;
    }
    const currentOwnerId = ownerIdByLayerId.get(layerId);
    if (currentOwnerId) {
      throw new Error(
        `Scoped Layer editing context names Layer "${layerId}" outside owner "${ownerId}"; it belongs to "${currentOwnerId}".`,
      );
    }
  }

  const openLayerByOwnerId = new Map<EmbeddedNodeId, EmbeddedNodeId>();
  for (const [ownerId, owner] of ownerById) {
    openLayerByOwnerId.set(
      ownerId,
      currentInitialOpenLayerByOwnerId.get(ownerId) ?? requireFirstLayer(ownerId, owner),
    );
  }
  return freezeScopedLayerEditingContext({
    blockDefinitions,
    layoutDefinitions,
    openLayerByOwnerId,
    ownerById,
    preferredLayerByOwnerId: openLayerByOwnerId,
  });
}

function collectOwnerIdsByLayerId(
  ownerById: ReadonlyMap<EmbeddedNodeId, ScopedLayerOwnerRecord>,
): ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId> {
  const ownerIdByLayerId = new Map<EmbeddedNodeId, EmbeddedNodeId>();
  for (const [ownerId, owner] of ownerById) {
    for (const layerId of owner.orderedLayerIds) {
      const previousOwnerId = ownerIdByLayerId.get(layerId);
      if (previousOwnerId) {
        throw new Error(
          `Scoped Layer "${layerId}" is owned by both "${previousOwnerId}" and "${ownerId}".`,
        );
      }
      ownerIdByLayerId.set(layerId, ownerId);
    }
  }
  return ownerIdByLayerId;
}

function reconcileScopedLayerEditingContext(
  current: ScopedLayerEditingContextState,
  document: ProseMirrorNode,
): ScopedLayerEditingContextState {
  const ownerById = collectScopedLayerOwners(document, current.layoutDefinitions);
  const openLayerByOwnerId = new Map<EmbeddedNodeId, EmbeddedNodeId>();
  const preferredLayerByOwnerId = new Map(current.preferredLayerByOwnerId);

  for (const [ownerId, owner] of ownerById) {
    const previousOwner = current.ownerById.get(ownerId);
    if (previousOwner && previousOwner.nodeType !== owner.nodeType) {
      throw new Error(
        `Scoped Layer owner "${ownerId}" changed kind from "${previousOwner.nodeType}" to "${owner.nodeType}".`,
      );
    }

    const previousOpenLayerId = current.openLayerByOwnerId.get(ownerId);
    const preferredLayerId = preferredLayerByOwnerId.get(ownerId);
    const openLayerId =
      previousOpenLayerId && owner.orderedLayerIds.includes(previousOpenLayerId)
        ? previousOpenLayerId
        : previousOwner && previousOpenLayerId
          ? resolveDeletedLayerFallback(previousOwner, owner, previousOpenLayerId)
          : preferredLayerId && owner.orderedLayerIds.includes(preferredLayerId)
            ? preferredLayerId
            : requireFirstLayer(ownerId, owner);
    openLayerByOwnerId.set(ownerId, openLayerId);
    preferredLayerByOwnerId.set(ownerId, openLayerId);
  }

  return freezeScopedLayerEditingContext({
    blockDefinitions: current.blockDefinitions,
    layoutDefinitions: current.layoutDefinitions,
    openLayerByOwnerId,
    ownerById,
    preferredLayerByOwnerId,
  });
}

function collectScopedLayerOwners(
  document: ProseMirrorNode,
  layoutDefinitions: LayoutRegistry,
): ReadonlyMap<EmbeddedNodeId, ScopedLayerOwnerRecord> {
  const index = createLayerOwnerSlotIndex(document);
  const ownerById = new Map<EmbeddedNodeId, ScopedLayerOwnerRecord>();
  document.descendants((node) => {
    if (!isLayerOwnerNodeType(node.type.name)) return true;
    const ownerId = EmbeddedNodeIdSchema.parse(node.attrs["id"]);
    const resolution = resolveLayerOwnerSlot({
      doc: document,
      ownerId,
      layoutDefinitions,
      index,
    });
    if (resolution.status === "error") {
      throw new Error(`Scoped Layer owner "${ownerId}" could not resolve its composition slot.`);
    }
    ownerById.set(
      ownerId,
      Object.freeze({
        nodeType: resolution.value.logicalOwner.nodeType,
        orderedLayerIds: resolution.value.orderedLayerIds,
      }),
    );
    return true;
  });
  return ownerById;
}

function freezeScopedLayerEditingContext({
  blockDefinitions,
  layoutDefinitions,
  openLayerByOwnerId,
  ownerById,
  preferredLayerByOwnerId,
}: {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: LayoutRegistry;
  readonly openLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
  readonly ownerById: ReadonlyMap<EmbeddedNodeId, ScopedLayerOwnerRecord>;
  readonly preferredLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
}): ScopedLayerEditingContextState {
  return Object.freeze({
    blockDefinitions,
    layoutDefinitions,
    openLayerByOwnerId: new Map(openLayerByOwnerId),
    ownerById: new Map(ownerById),
    preferredLayerByOwnerId: new Map(preferredLayerByOwnerId),
  });
}

function resolveDeletedLayerFallback(
  previousOwner: ScopedLayerOwnerRecord,
  nextOwner: ScopedLayerOwnerRecord,
  deletedLayerId: EmbeddedNodeId,
): EmbeddedNodeId {
  const deletedIndex = previousOwner.orderedLayerIds.indexOf(deletedLayerId);
  const surviving = new Set(nextOwner.orderedLayerIds);
  if (deletedIndex >= 0) {
    for (let index = deletedIndex - 1; index >= 0; index -= 1) {
      const candidate = previousOwner.orderedLayerIds[index];
      if (candidate && surviving.has(candidate)) return candidate;
    }
    for (let index = deletedIndex + 1; index < previousOwner.orderedLayerIds.length; index += 1) {
      const candidate = previousOwner.orderedLayerIds[index];
      if (candidate && surviving.has(candidate)) return candidate;
    }
  }
  return requireFirstLayer("reconciled owner", nextOwner);
}

function requireFirstLayer(
  ownerId: EmbeddedNodeId | "reconciled owner",
  owner: ScopedLayerOwnerRecord,
): EmbeddedNodeId {
  const first = owner.orderedLayerIds[0];
  if (!first) throw new Error(`Scoped Layer owner "${ownerId}" has no Layers.`);
  return first;
}

function isLayerOwnerNodeType(value: string): value is LayerLogicalOwnerType {
  return value === REGION_NODE_TYPE || value === CELL_NODE_TYPE || value === SECTION_NODE_TYPE;
}

export function requireLayerMutationAccessForState(state: EditorState): LayerMutationAccess {
  if (!documentContainsLayer(state.doc)) {
    if (!state.schema.nodes[LAYER_NODE_TYPE]) return NON_LAYER_DOCUMENT_MUTATION_ACCESS;
    const capabilities = getScaffoldCapabilitiesForState(state);
    return Object.freeze({
      kind: "layer-capable-document",
      layoutDefinitions: capabilities.layouts.registry,
      blockDefinitions: capabilities.blocks.registry,
    });
  }
  const capabilities = getScaffoldCapabilitiesForState(state);
  const context = readLayerEditingContextForState(
    state,
    capabilities.layouts.registry,
    capabilities.blocks.registry,
  );
  if (!context?.blockDefinitions) {
    throw new Error("Layer-aware mutation requires an authoring Layer context.");
  }
  return Object.freeze({
    kind: "implicit-authoring",
    context: Object.freeze({ ...context, blockDefinitions: context.blockDefinitions }),
  });
}

export function readLayerEditingContextForState(
  state: EditorState,
  layoutDefinitions: LayoutRegistry,
  blockDefinitions?: BlockDefinitionLookup,
): LayerEditingContext | null {
  const lifecycle = documentAuthoringPluginKey.getState(state);
  const scopedContext = scopedLayerEditingContextPluginKey.getState(state);
  if (lifecycle && scopedContext) {
    throw new Error("Layer editing context has both document and scoped authoring owners.");
  }
  if (scopedContext) {
    if (scopedContext.layoutDefinitions !== layoutDefinitions) {
      throw new Error("Scoped Layer editing context uses a different Layout registry.");
    }
    if (blockDefinitions && scopedContext.blockDefinitions !== blockDefinitions) {
      throw new Error("Scoped Layer editing context uses a different Block registry.");
    }
    return scopedContext;
  }
  if (!lifecycle) return null;
  return Object.freeze({
    layoutDefinitions,
    openLayerByOwnerId: lifecycle.editorNavigation.authoringLayers.getSnapshot().openLayerByOwnerId,
    ...(blockDefinitions ? { blockDefinitions } : {}),
  });
}

export function createLayerEditingBoundaryExtension(
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
) {
  return Extension.create({
    name: "layerEditingBoundaries",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: layerEditingBoundaryPluginKey,
          filterTransaction(transaction, state) {
            const lifecycle = documentAuthoringPluginKey.getState(state);
            if (!lifecycle) {
              throw new Error("Layer editing boundaries require the document authoring lifecycle.");
            }
            return allowsLayerEditingTransaction({
              transaction,
              documentBefore: state.doc,
              blockDefinitions,
              layoutDefinitions,
              openLayerByOwnerId:
                lifecycle.editorNavigation.authoringLayers.getSnapshot().openLayerByOwnerId,
            });
          },
        }),
      ];
    },
  });
}
