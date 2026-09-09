import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { AttrStep, type Transform } from "@tiptap/pm/transform";

import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";
import { getScaffoldCapabilitiesForState } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  createLayerOwnerSlotIndex,
  resolveLayerOwnerSlot,
  type LayerOwnerSlotIndex,
  type LayerLogicalOwnerType,
  type LayerOwnerSlot,
  type LayerOwnerSlotResolutionError,
} from "@/document/model/layers/layer-owner-slot";
import {
  isLayerCompositionFillOccupant,
  validateLayerCompositionPlacement,
} from "@/document/model/layers/layer-composition-policy";
import { validateLayerContext } from "@/document/model/layers/layer-validation";
import {
  CELL_NODE_TYPE,
  GRID_NODE_TYPE,
  LAYER_NODE_TYPE,
  LAYOUT_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
  SURFACE_NODE_TYPE,
} from "@/document/model/nodes/structural-node-types";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { isAllSelection, isNodeSelection } from "@/editor/selection/selection-facts";

export const layerEditingBoundaryPluginKey = new PluginKey("sc-layer-editing-boundary");
const LAYER_EDITING_OPERATION_META = "sc-layer-editing-operation";

interface LayerStructuralStepAuthorization {
  readonly kind: "explicit-structural-steps";
  readonly fromStep: number;
  readonly toStep: number;
  readonly rootIds: readonly EmbeddedNodeId[];
}

interface LayerEditingSnapshotIndex {
  readonly ownerIndex: LayerOwnerSlotIndex;
  readonly ownerSlotById: Map<EmbeddedNodeId, LayerOwnerSlot>;
  readonly targetByLayerId: Map<EmbeddedNodeId, LayerEditingTarget>;
}

export interface LayerEditingTarget {
  readonly ownerSlot: LayerOwnerSlot;
  readonly layerId: EmbeddedNodeId;
  readonly layer: ProseMirrorNode;
  readonly pos: number;
  readonly contentFrom: number;
  readonly contentTo: number;
}

export type LayerEditingBoundaryError =
  | LayerOwnerSlotResolutionError
  | {
      readonly reason: "captured-slot-changed";
      readonly ownerId: EmbeddedNodeId;
      readonly capturedSlotId: EmbeddedNodeId;
      readonly currentSlotId: EmbeddedNodeId;
    }
  | {
      readonly reason: "layer-missing";
      readonly requestedLayerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "layer-owner-mismatch";
      readonly layerId: EmbeddedNodeId;
      readonly expectedOwnerId: EmbeddedNodeId;
      readonly actualOwnerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "explicit-layer-destination-mismatch";
      readonly declaredOwnerId: EmbeddedNodeId;
      readonly declaredLayerId: EmbeddedNodeId;
      readonly actualOwnerId: EmbeddedNodeId;
      readonly actualLayerId: EmbeddedNodeId;
      readonly range: Readonly<{ from: number; to: number }>;
    }
  | {
      readonly reason: "inactive-layer-target";
      readonly ownerId: EmbeddedNodeId;
      readonly targetLayerId: EmbeddedNodeId;
      readonly currentOpenLayerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "edit-crosses-sibling-alternatives";
      readonly layerIds: readonly EmbeddedNodeId[];
      readonly range: Readonly<{ from: number; to: number }>;
    }
  | {
      readonly reason: "protected-layer-structure";
      readonly layerId: EmbeddedNodeId;
      readonly range: Readonly<{ from: number; to: number }>;
    }
  | {
      readonly reason: "content-incompatible";
      readonly ownerId: EmbeddedNodeId;
      readonly layerId: EmbeddedNodeId;
      readonly contentType: string;
      readonly rule: "grid-not-allowed-in-cell" | "fill-occupant-must-be-exclusive";
    };

export type LayerEditingBoundaryResult<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "error"; readonly error: LayerEditingBoundaryError };

export interface LayerEditingContext {
  readonly layoutDefinitions: LayoutRegistry;
  readonly openLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
  readonly blockDefinitions?: BlockDefinitionLookup;
}

export type LayerMutationAccess =
  | { readonly kind: "non-layer-document" }
  | {
      readonly kind: "layer-capable-document";
      readonly layoutDefinitions: LayoutRegistry;
      readonly blockDefinitions: BlockDefinitionLookup;
    }
  | {
      readonly kind: "implicit-authoring";
      readonly context: LayerEditingContext & { readonly blockDefinitions: BlockDefinitionLookup };
    }
  | {
      readonly kind: "explicit-layer";
      readonly layoutDefinitions: LayoutRegistry;
      readonly blockDefinitions: BlockDefinitionLookup;
      readonly destination: Readonly<{
        ownerId: EmbeddedNodeId;
        layerId: EmbeddedNodeId;
        capturedSlotId?: EmbeddedNodeId;
      }>;
    };

export const NON_LAYER_DOCUMENT_MUTATION_ACCESS: LayerMutationAccess = Object.freeze({
  kind: "non-layer-document",
});

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
    throw new Error("Layer-aware mutation requires the document authoring lifecycle.");
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
  if (!lifecycle) return null;
  return Object.freeze({
    layoutDefinitions,
    openLayerByOwnerId: lifecycle.editorNavigation.authoringLayers.getSnapshot().openLayerByOwnerId,
    ...(blockDefinitions ? { blockDefinitions } : {}),
  });
}

export interface ResolveLayerEditingTargetInput extends LayerEditingContext {
  readonly doc: ProseMirrorNode;
  readonly ownerId: EmbeddedNodeId;
  readonly layerId?: EmbeddedNodeId;
  readonly capturedSlotId?: EmbeddedNodeId;
}

/** Resolves an implicit authoring target, or an explicitly addressed Layer when `layerId` is set. */
export function resolveLayerEditingTarget({
  doc,
  ownerId,
  layerId: requestedLayerId,
  capturedSlotId,
  layoutDefinitions,
  openLayerByOwnerId,
}: ResolveLayerEditingTargetInput): LayerEditingBoundaryResult<LayerEditingTarget> {
  const layerId = requestedLayerId ?? openLayerByOwnerId.get(ownerId);
  if (!layerId) {
    throw new Error(`Authoring Layer state has no open Layer for owner "${ownerId}".`);
  }
  return resolveExplicitLayerEditingTarget({
    doc,
    ownerId,
    layerId,
    ...(capturedSlotId ? { capturedSlotId } : {}),
    layoutDefinitions,
  });
}

export function resolveExplicitLayerEditingTarget({
  doc,
  ownerId,
  layerId,
  capturedSlotId,
  layoutDefinitions,
}: {
  readonly doc: ProseMirrorNode;
  readonly ownerId: EmbeddedNodeId;
  readonly layerId: EmbeddedNodeId;
  readonly capturedSlotId?: EmbeddedNodeId;
  readonly layoutDefinitions: LayoutRegistry;
}): LayerEditingBoundaryResult<LayerEditingTarget> {
  const index = createLayerEditingSnapshotIndex(doc, layoutDefinitions);
  return resolveExplicitLayerEditingTargetWithIndex(
    {
      doc,
      ownerId,
      layerId,
      ...(capturedSlotId ? { capturedSlotId } : {}),
      layoutDefinitions,
    },
    index,
  );
}

function resolveExplicitLayerEditingTargetWithIndex(
  {
    doc,
    ownerId,
    layerId,
    capturedSlotId,
    layoutDefinitions,
  }: {
    readonly doc: ProseMirrorNode;
    readonly ownerId: EmbeddedNodeId;
    readonly layerId: EmbeddedNodeId;
    readonly capturedSlotId?: EmbeddedNodeId;
    readonly layoutDefinitions: LayoutRegistry;
  },
  index: LayerEditingSnapshotIndex,
): LayerEditingBoundaryResult<LayerEditingTarget> {
  const ownerResolution = resolveIndexedOwnerSlot(index, ownerId, layoutDefinitions);
  if (ownerResolution.status === "error") return ownerResolution;
  const ownerSlot = ownerResolution.value;

  if (capturedSlotId && capturedSlotId !== ownerSlot.physicalSlot.id) {
    return error({
      reason: "captured-slot-changed",
      ownerId,
      capturedSlotId,
      currentSlotId: ownerSlot.physicalSlot.id,
    });
  }

  if (!ownerSlot.orderedLayerIds.includes(layerId)) {
    const actual = findLayerById(doc, layerId, layoutDefinitions, index);
    if (!actual) return error({ reason: "layer-missing", requestedLayerId: layerId });
    return error({
      reason: "layer-owner-mismatch",
      layerId,
      expectedOwnerId: ownerId,
      actualOwnerId: actual.ownerSlot.logicalOwner.id,
    });
  }

  const target = findDirectLayer(ownerSlot, layerId);
  if (!target) {
    throw new Error(
      `Resolved slot "${ownerSlot.physicalSlot.id}" did not contain Layer "${layerId}".`,
    );
  }
  return ready(target);
}

export function validateExplicitLayerEditRange(input: {
  readonly doc: ProseMirrorNode;
  readonly ownerId: EmbeddedNodeId;
  readonly layerId: EmbeddedNodeId;
  readonly capturedSlotId?: EmbeddedNodeId;
  readonly layoutDefinitions: LayoutRegistry;
  readonly from: number;
  readonly to: number;
}): LayerEditingBoundaryResult<LayerEditingTarget> {
  const range = freezeRange(input.from, input.to);
  if (!isValidRange(range, input.doc.content.size)) {
    throw new RangeError(`Layer edit range ${range.from}-${range.to} is outside the document.`);
  }

  const index = createLayerEditingSnapshotIndex(input.doc, input.layoutDefinitions);
  const declared = resolveExplicitLayerEditingTargetWithIndex(input, index);
  if (declared.status === "error") return declared;
  if (range.from < declared.value.contentFrom || range.to > declared.value.contentTo) {
    return error({
      reason: "protected-layer-structure",
      layerId: declared.value.layerId,
      range,
    });
  }

  const touched = findTouchedLayers(input.doc, range, input.layoutDefinitions, index);
  for (let leftIndex = 0; leftIndex < touched.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < touched.length; rightIndex += 1) {
      const left = touched[leftIndex]!;
      const right = touched[rightIndex]!;
      if (containsLayer(left, right) || containsLayer(right, left)) continue;
      return error({
        reason: "edit-crosses-sibling-alternatives",
        layerIds: Object.freeze(touched.map(({ layerId }) => layerId)),
        range,
      });
    }
  }

  const actual = touched
    .filter((target) => range.from >= target.contentFrom && range.to <= target.contentTo)
    .sort((left, right) => left.layer.nodeSize - right.layer.nodeSize)[0];
  if (!actual) {
    throw new Error(
      `Explicit edit range ${range.from}-${range.to} has no enclosing Layer composition.`,
    );
  }
  if (
    actual.layerId !== declared.value.layerId ||
    actual.ownerSlot.logicalOwner.id !== declared.value.ownerSlot.logicalOwner.id
  ) {
    return error({
      reason: "explicit-layer-destination-mismatch",
      declaredOwnerId: declared.value.ownerSlot.logicalOwner.id,
      declaredLayerId: declared.value.layerId,
      actualOwnerId: actual.ownerSlot.logicalOwner.id,
      actualLayerId: actual.layerId,
      range,
    });
  }
  return ready(actual);
}

export function validateImplicitLayerStructuralRootAccess(
  input: LayerEditingContext & {
    readonly doc: ProseMirrorNode;
    readonly node: ProseMirrorNode;
    readonly pos: number;
  },
): LayerEditingBoundaryResult<readonly LayerEditingTarget[]> {
  const index = createLayerEditingSnapshotIndex(input.doc, input.layoutDefinitions);
  const ancestors = findEnclosingLayerAncestors(
    input.doc,
    input.node,
    input.pos,
    input.layoutDefinitions,
    index,
  );
  for (const target of ancestors) {
    const currentOpenLayerId = input.openLayerByOwnerId.get(target.ownerSlot.logicalOwner.id);
    if (!currentOpenLayerId) {
      throw new Error(
        `Authoring Layer state has no open Layer for owner "${target.ownerSlot.logicalOwner.id}".`,
      );
    }
    if (currentOpenLayerId !== target.layerId) {
      return error({
        reason: "inactive-layer-target",
        ownerId: target.ownerSlot.logicalOwner.id,
        targetLayerId: target.layerId,
        currentOpenLayerId,
      });
    }
  }
  return ready(ancestors);
}

export function validateExplicitLayerStructuralRootAccess(input: {
  readonly doc: ProseMirrorNode;
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly ownerId: EmbeddedNodeId;
  readonly layerId: EmbeddedNodeId;
  readonly capturedSlotId?: EmbeddedNodeId;
  readonly layoutDefinitions: LayoutRegistry;
}): LayerEditingBoundaryResult<LayerEditingTarget> {
  const index = createLayerEditingSnapshotIndex(input.doc, input.layoutDefinitions);
  const declared = resolveExplicitLayerEditingTargetWithIndex(input, index);
  if (declared.status === "error") return declared;
  const actual = findEnclosingLayerAncestors(
    input.doc,
    input.node,
    input.pos,
    input.layoutDefinitions,
    index,
  )[0];
  if (!actual) {
    return error({
      reason: "protected-layer-structure",
      layerId: declared.value.layerId,
      range: freezeRange(input.pos, input.pos + input.node.nodeSize),
    });
  }
  if (
    actual.layerId !== declared.value.layerId ||
    actual.ownerSlot.logicalOwner.id !== declared.value.ownerSlot.logicalOwner.id
  ) {
    return error({
      reason: "explicit-layer-destination-mismatch",
      declaredOwnerId: declared.value.ownerSlot.logicalOwner.id,
      declaredLayerId: declared.value.layerId,
      actualOwnerId: actual.ownerSlot.logicalOwner.id,
      actualLayerId: actual.layerId,
      range: freezeRange(input.pos, input.pos + input.node.nodeSize),
    });
  }
  return ready(actual);
}

export function resolveImplicitLayerTargetAtPosition(
  input: LayerEditingContext & {
    readonly doc: ProseMirrorNode;
    readonly pos: number;
  },
): LayerEditingBoundaryResult<LayerEditingTarget | null> {
  const target = findNearestLayerAtPosition(
    input.doc,
    input.pos,
    input.layoutDefinitions,
    createLayerEditingSnapshotIndex(input.doc, input.layoutDefinitions),
  );
  if (!target) return ready(null);

  const currentOpenLayerId = input.openLayerByOwnerId.get(target.ownerSlot.logicalOwner.id);
  if (!currentOpenLayerId) {
    throw new Error(
      `Authoring Layer state has no open Layer for owner "${target.ownerSlot.logicalOwner.id}".`,
    );
  }
  if (currentOpenLayerId !== target.layerId) {
    return error({
      reason: "inactive-layer-target",
      ownerId: target.ownerSlot.logicalOwner.id,
      targetLayerId: target.layerId,
      currentOpenLayerId,
    });
  }
  return ready(target);
}

export function resolveLayerTargetAtPosition(input: {
  readonly doc: ProseMirrorNode;
  readonly pos: number;
  readonly layoutDefinitions: LayoutRegistry;
}): LayerEditingTarget | null {
  return findNearestLayerAtPosition(
    input.doc,
    input.pos,
    input.layoutDefinitions,
    createLayerEditingSnapshotIndex(input.doc, input.layoutDefinitions),
  );
}

export function validateImplicitLayerEditRange(
  input: LayerEditingContext & {
    readonly doc: ProseMirrorNode;
    readonly from: number;
    readonly to: number;
  },
): LayerEditingBoundaryResult<readonly LayerEditingTarget[]> {
  return validateImplicitLayerEditRangeWithIndex(
    input,
    createLayerEditingSnapshotIndex(input.doc, input.layoutDefinitions),
  );
}

function validateImplicitLayerEditRangeWithIndex(
  input: LayerEditingContext & {
    readonly doc: ProseMirrorNode;
    readonly from: number;
    readonly to: number;
  },
  index: LayerEditingSnapshotIndex,
): LayerEditingBoundaryResult<readonly LayerEditingTarget[]> {
  const range = freezeRange(input.from, input.to);
  if (!isValidRange(range, input.doc.content.size)) {
    throw new RangeError(`Layer edit range ${range.from}-${range.to} is outside the document.`);
  }

  const touched = findTouchedLayers(input.doc, range, input.layoutDefinitions, index);
  for (let leftIndex = 0; leftIndex < touched.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < touched.length; rightIndex += 1) {
      const left = touched[leftIndex]!;
      const right = touched[rightIndex]!;
      if (containsLayer(left, right) || containsLayer(right, left)) continue;
      return error({
        reason: "edit-crosses-sibling-alternatives",
        layerIds: Object.freeze(touched.map(({ layerId }) => layerId)),
        range,
      });
    }
  }

  for (const target of touched) {
    if (range.from < target.contentFrom || range.to > target.contentTo) {
      return error({ reason: "protected-layer-structure", layerId: target.layerId, range });
    }
    const currentOpenLayerId = input.openLayerByOwnerId.get(target.ownerSlot.logicalOwner.id);
    if (!currentOpenLayerId) {
      throw new Error(
        `Authoring Layer state has no open Layer for owner "${target.ownerSlot.logicalOwner.id}".`,
      );
    }
    if (currentOpenLayerId !== target.layerId) {
      return error({
        reason: "inactive-layer-target",
        ownerId: target.ownerSlot.logicalOwner.id,
        targetLayerId: target.layerId,
        currentOpenLayerId,
      });
    }
  }

  return ready(Object.freeze(touched));
}

export function validateLayerContentPlacement(input: {
  readonly target: LayerEditingTarget;
  readonly contentType: string;
  readonly contentIsFillOccupant: boolean;
  readonly existingChildIsFillOccupant: (node: ProseMirrorNode) => boolean;
  readonly from: number;
  readonly to: number;
}): LayerEditingBoundaryResult<LayerEditingTarget> {
  const violation = validateLayerCompositionPlacement({
    ownerSlot: input.target.ownerSlot,
    layerId: input.target.layerId,
    layer: input.target.layer,
    contentFrom: input.target.contentFrom,
    contentType: input.contentType,
    contentIsFillOccupant: input.contentIsFillOccupant,
    existingChildIsFillOccupant: input.existingChildIsFillOccupant,
    from: input.from,
    to: input.to,
  });
  return violation ? error(violation) : ready(input.target);
}

export function authorizeExplicitLayerStructuralSteps<TTransform extends Transform>(
  tr: TTransform,
  input: {
    readonly fromStep: number;
    readonly rootIds: readonly EmbeddedNodeId[];
  },
): TTransform {
  if (input.rootIds.length === 0) {
    throw new Error("An explicit Layer structural operation requires at least one root identity.");
  }
  const transaction = trTransaction(tr);
  if (!transaction) return tr;
  if (
    !Number.isInteger(input.fromStep) ||
    input.fromStep < 0 ||
    input.fromStep >= transaction.steps.length
  ) {
    throw new Error("Explicit Layer structural authorization has an invalid step range.");
  }
  const authorization = Object.freeze({
    kind: "explicit-structural-steps" as const,
    fromStep: input.fromStep,
    toStep: transaction.steps.length,
    rootIds: Object.freeze([...input.rootIds]),
  });
  const existing = readStructuralStepAuthorizations(transaction);
  transaction.setMeta(LAYER_EDITING_OPERATION_META, Object.freeze([...existing, authorization]));
  return tr;
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
              state,
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

export function allowsLayerEditingTransaction(
  input: LayerEditingContext & {
    readonly transaction: Transaction;
    readonly state: EditorState;
    readonly blockDefinitions?: BlockDefinitionLookup;
  },
): boolean {
  const { transaction, state } = input;
  if (transaction.getMeta("history$")) return true;

  if (!transaction.docChanged) {
    if (!transaction.selectionSet) return true;
    if (isAllSelection(transaction.selection)) {
      return !documentContainsLayer(state.doc);
    }
    if (isNodeSelection(transaction.selection)) {
      const selectedNode = transaction.selection.node;
      if (selectedNode.type.name === LAYER_NODE_TYPE) return false;
      if (isLayerStructuralOwnerType(selectedNode.type.name)) {
        return (
          validateImplicitLayerStructuralRootAccess({
            ...input,
            doc: state.doc,
            node: selectedNode,
            pos: transaction.selection.from,
          }).status === "ready"
        );
      }
    }
    return (
      validateImplicitLayerEditRange({
        ...input,
        doc: state.doc,
        from: transaction.selection.from,
        to: transaction.selection.to,
      }).status === "ready"
    );
  }

  const authorizations = readStructuralStepAuthorizations(transaction);
  const indexByDocument = new Map<ProseMirrorNode, LayerEditingSnapshotIndex>();
  const indexFor = (doc: ProseMirrorNode): LayerEditingSnapshotIndex => {
    const existing = indexByDocument.get(doc);
    if (existing) return existing;
    const created = createLayerEditingSnapshotIndex(doc, input.layoutDefinitions);
    indexByDocument.set(doc, created);
    return created;
  };

  for (let index = 0; index < transaction.steps.length; index += 1) {
    const step = transaction.steps[index]!;
    const stepDoc = transaction.docs[index]!;
    const nextStepDoc = transaction.docs[index + 1] ?? transaction.doc;
    const stepAuthorization = authorizations.find(
      ({ fromStep, toStep }) => index >= fromStep && index < toStep,
    );
    if (
      stepAuthorization &&
      !authorizationContainsStep(
        step,
        stepDoc,
        nextStepDoc,
        stepAuthorization,
        indexFor(stepDoc),
        indexFor(nextStepDoc),
      )
    ) {
      throw new Error("Explicit Layer structural authorization exceeds its declared roots.");
    }
    if (stepAuthorization) continue;

    if (
      hasChangedExistingLayerMembership(
        stepDoc,
        nextStepDoc,
        input.layoutDefinitions,
        indexFor(stepDoc),
        indexFor(nextStepDoc),
      )
    ) {
      return false;
    }
    let allowed = true;
    step.getMap().forEach((oldStart, oldEnd) => {
      if (!allowed) return;
      allowed =
        validateImplicitLayerEditRangeWithIndex(
          { ...input, doc: stepDoc, from: oldStart, to: oldEnd },
          indexFor(stepDoc),
        ).status === "ready";
    });
    if (!allowed) return false;
  }

  if (
    input.blockDefinitions &&
    validateLayerContext({
      document: transaction.doc,
      blockDefinitions: input.blockDefinitions,
      layoutDefinitions: input.layoutDefinitions,
    }).length > 0
  ) {
    return false;
  }
  return true;
}

export function isLayerFillOccupantNode(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  return isLayerCompositionFillOccupant(node, blockDefinitions, layoutDefinitions);
}

function readStructuralStepAuthorizations(
  transaction: Transaction,
): readonly LayerStructuralStepAuthorization[] {
  const meta = transaction.getMeta(LAYER_EDITING_OPERATION_META) as unknown;
  if (meta === undefined) return Object.freeze([]);
  if (!Array.isArray(meta)) {
    throw new Error("Invalid explicit Layer structural-operation metadata.");
  }
  const authorizations: LayerStructuralStepAuthorization[] = [];
  for (const candidate of meta) {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Invalid explicit Layer structural-operation metadata.");
    }
    const value = candidate as {
      readonly kind?: unknown;
      readonly fromStep?: unknown;
      readonly toStep?: unknown;
      readonly rootIds?: unknown;
    };
    if (
      value.kind !== "explicit-structural-steps" ||
      !Number.isInteger(value.fromStep) ||
      !Number.isInteger(value.toStep) ||
      (value.fromStep as number) < 0 ||
      (value.toStep as number) <= (value.fromStep as number) ||
      (value.toStep as number) > transaction.steps.length ||
      !Array.isArray(value.rootIds)
    ) {
      throw new Error("Invalid explicit Layer structural-operation metadata.");
    }
    const rootIds = value.rootIds.map((rootId) => {
      if (typeof rootId !== "string" || rootId.length === 0) {
        throw new Error(
          "Explicit Layer structural-operation metadata has an invalid root identity.",
        );
      }
      return rootId as EmbeddedNodeId;
    });
    if (rootIds.length === 0) {
      throw new Error("An explicit Layer structural operation requires a root identity.");
    }
    authorizations.push(
      Object.freeze({
        kind: "explicit-structural-steps",
        fromStep: value.fromStep as number,
        toStep: value.toStep as number,
        rootIds: Object.freeze(rootIds),
      }),
    );
  }
  return Object.freeze(authorizations);
}

function authorizationContainsStep(
  step: Transaction["steps"][number],
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  authorization: LayerStructuralStepAuthorization,
  beforeIndex: LayerEditingSnapshotIndex,
  afterIndex: LayerEditingSnapshotIndex,
): boolean {
  if (step instanceof AttrStep) {
    return authorizationContainsAttributeStep(
      step,
      before,
      after,
      authorization,
      beforeIndex,
      afterIndex,
    );
  }
  const beforeRoots = authorizedRootRanges(before, beforeIndex, authorization.rootIds);
  const afterRoots = authorizedRootRanges(after, afterIndex, authorization.rootIds);
  let sawChange = false;
  let contained = true;
  step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
    sawChange = true;
    if (oldStart !== oldEnd && !rangeWithinAuthorizedRoots(oldStart, oldEnd, beforeRoots)) {
      contained = false;
    }
    if (newStart !== newEnd && !rangeWithinAuthorizedRoots(newStart, newEnd, afterRoots)) {
      contained = false;
    }
  });
  return sawChange && contained;
}

function authorizationContainsAttributeStep(
  step: AttrStep,
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  authorization: LayerStructuralStepAuthorization,
  beforeIndex: LayerEditingSnapshotIndex,
  afterIndex: LayerEditingSnapshotIndex,
): boolean {
  const beforeTarget = before.nodeAt(step.pos);
  const afterTarget = after.nodeAt(step.pos);
  const beforeId = beforeTarget?.attrs["id"];
  const afterId = afterTarget?.attrs["id"];
  if (
    typeof beforeId !== "string" ||
    beforeId.length === 0 ||
    beforeId !== afterId ||
    !authorization.rootIds.includes(beforeId as EmbeddedNodeId)
  ) {
    return false;
  }
  const id = beforeId as EmbeddedNodeId;
  const beforeEntry = beforeIndex.ownerIndex.nodeById.get(id);
  const afterEntry = afterIndex.ownerIndex.nodeById.get(id);
  return (
    beforeEntry?.pos === step.pos &&
    beforeEntry.node === beforeTarget &&
    afterEntry?.pos === step.pos &&
    afterEntry.node === afterTarget
  );
}

function authorizedRootRanges(
  doc: ProseMirrorNode,
  index: LayerEditingSnapshotIndex,
  rootIds: readonly EmbeddedNodeId[],
): readonly Readonly<{ from: number; to: number }>[] {
  const ranges: { from: number; to: number }[] = [];
  for (const rootId of rootIds) {
    if (index.ownerIndex.duplicateIds.has(rootId)) {
      throw new Error(`Duplicate document identity "${rootId}".`);
    }
    const match = index.ownerIndex.nodeById.get(rootId);
    if (!match) continue;
    if (match.node.type.name === LAYER_NODE_TYPE) {
      throw new Error("A Layer cannot be authorized as an ordinary structural root.");
    }
    ranges.push(Object.freeze({ from: match.pos, to: match.pos + match.node.nodeSize }));
  }
  if (ranges.length === 0 && rootIds.every((id) => !index.ownerIndex.nodeById.has(id))) {
    return Object.freeze([]);
  }
  if (index.ownerIndex.doc !== doc) {
    throw new Error("Layer editing index belongs to a different document snapshot.");
  }
  return Object.freeze(ranges);
}

function rangeWithinAuthorizedRoots(
  from: number,
  to: number,
  roots: readonly Readonly<{ from: number; to: number }>[],
): boolean {
  let coveredTo = from;
  for (const root of [...roots].sort((left, right) => left.from - right.from)) {
    if (root.to <= coveredTo) continue;
    if (root.from > coveredTo) return false;
    coveredTo = root.to;
    if (coveredTo >= to) return true;
  }
  return false;
}

function hasChangedExistingLayerMembership(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  layoutDefinitions: LayoutRegistry,
  beforeIndex: LayerEditingSnapshotIndex,
  afterIndex: LayerEditingSnapshotIndex,
): boolean {
  if (beforeIndex.ownerIndex.doc !== before || afterIndex.ownerIndex.doc !== after) {
    throw new Error("Layer editing index belongs to a different document snapshot.");
  }
  for (const [ownerId, entry] of beforeIndex.ownerIndex.nodeById) {
    if (!isLogicalOwnerType(entry.node.type.name)) continue;
    const beforeHasLayers = ownerHasDeclaredLayerComposition(
      before,
      entry.node,
      entry.pos,
      layoutDefinitions,
    );
    const afterEntry = afterIndex.ownerIndex.nodeById.get(ownerId);
    if (!afterEntry || !isLogicalOwnerType(afterEntry.node.type.name)) continue;
    const afterHasLayers = ownerHasDeclaredLayerComposition(
      after,
      afterEntry.node,
      afterEntry.pos,
      layoutDefinitions,
    );
    if (!beforeHasLayers && !afterHasLayers) continue;
    if (beforeHasLayers !== afterHasLayers) return true;
    const beforeResolution = resolveIndexedOwnerSlot(beforeIndex, ownerId, layoutDefinitions);
    if (beforeResolution.status === "error") continue;
    const afterResolution = resolveIndexedOwnerSlot(afterIndex, ownerId, layoutDefinitions);
    if (afterResolution.status === "error") continue;
    if (!sameIds(beforeResolution.value.orderedLayerIds, afterResolution.value.orderedLayerIds)) {
      return true;
    }
  }
  return false;
}

function ownerHasDeclaredLayerComposition(
  doc: ProseMirrorNode,
  owner: ProseMirrorNode,
  ownerPos: number,
  layoutDefinitions: LayoutRegistry,
): boolean {
  if (owner.type.name !== "section") return hasDirectLayerChild(owner);
  const resolved = doc.resolve(ownerPos);
  const layout = resolved.parent;
  if (layout.type.name !== "layout") {
    throw new Error("A Section Layer owner must be directly owned by a Layout.");
  }
  const declaration = layoutDefinitions.getForNode(layout)?.section?.compositionSlot;
  if (!declaration || declaration.kind === "direct") return hasDirectLayerChild(owner);
  let slot: ProseMirrorNode | null = null;
  owner.forEach((child) => {
    if (child.type.name !== declaration.nodeType) return;
    if (slot) {
      throw new Error(`Section Layer owner has multiple declared slots "${declaration.nodeType}".`);
    }
    slot = child;
  });
  return slot ? hasDirectLayerChild(slot) : false;
}

function hasDirectLayerChild(node: ProseMirrorNode): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name === LAYER_NODE_TYPE) return true;
  }
  return false;
}

function findTouchedLayers(
  doc: ProseMirrorNode,
  range: Readonly<{ from: number; to: number }>,
  layoutDefinitions: LayoutRegistry,
  index: LayerEditingSnapshotIndex,
): readonly LayerEditingTarget[] {
  const targets: LayerEditingTarget[] = [];
  for (const entry of index.ownerIndex.layerEntries) {
    if (!rangeTouchesNode(range, entry.pos, entry.node.nodeSize)) {
      continue;
    }
    targets.push(requireLayerAtPosition(doc, entry.pos, layoutDefinitions, index));
  }
  return targets;
}

function containsLayer(outer: LayerEditingTarget, inner: LayerEditingTarget): boolean {
  return (
    outer.pos < inner.pos && outer.pos + outer.layer.nodeSize > inner.pos + inner.layer.nodeSize
  );
}

function findDirectLayer(
  ownerSlot: LayerOwnerSlot,
  layerId: EmbeddedNodeId,
): LayerEditingTarget | null {
  let offset = 0;
  let match: LayerEditingTarget | null = null;
  ownerSlot.physicalSlot.node.forEach((child) => {
    const pos = ownerSlot.physicalSlot.pos + 1 + offset;
    offset += child.nodeSize;
    if (child.type.name !== LAYER_NODE_TYPE || child.attrs["id"] !== layerId) return;
    match = Object.freeze({
      ownerSlot,
      layerId,
      layer: child,
      pos,
      contentFrom: pos + 1,
      contentTo: pos + child.nodeSize - 1,
    });
  });
  return match;
}

function findLayerById(
  doc: ProseMirrorNode,
  layerId: EmbeddedNodeId,
  layoutDefinitions: LayoutRegistry,
  index: LayerEditingSnapshotIndex,
): LayerEditingTarget | null {
  if (index.ownerIndex.duplicateIds.has(layerId)) {
    throw new Error(`Duplicate document identity "${layerId}".`);
  }
  const entry = index.ownerIndex.nodeById.get(layerId);
  if (!entry || entry.node.type.name !== LAYER_NODE_TYPE) return null;
  return requireLayerAtPosition(doc, entry.pos, layoutDefinitions, index);
}

function resolveIndexedOwnerSlot(
  index: LayerEditingSnapshotIndex,
  ownerId: EmbeddedNodeId,
  layoutDefinitions: LayoutRegistry,
) {
  const cached = index.ownerSlotById.get(ownerId);
  if (cached) return ready(cached);
  const resolution = resolveLayerOwnerSlot({
    doc: index.ownerIndex.doc,
    ownerId,
    layoutDefinitions,
    index: index.ownerIndex,
  });
  if (resolution.status === "error") return resolution;
  index.ownerSlotById.set(ownerId, resolution.value);
  for (const layerId of resolution.value.orderedLayerIds) {
    const target = findDirectLayer(resolution.value, layerId);
    if (!target) {
      throw new Error(
        `Resolved slot "${resolution.value.physicalSlot.id}" did not contain Layer "${layerId}".`,
      );
    }
    const existing = index.targetByLayerId.get(layerId);
    if (existing && existing.ownerSlot.logicalOwner.id !== ownerId) {
      throw new Error(`Layer "${layerId}" belongs to more than one logical owner.`);
    }
    index.targetByLayerId.set(layerId, target);
  }
  return ready(resolution.value);
}

function createLayerEditingSnapshotIndex(
  doc: ProseMirrorNode,
  layoutDefinitions: LayoutRegistry,
): LayerEditingSnapshotIndex {
  const ownerIndex = createLayerOwnerSlotIndex(doc);
  const ownerSlotById = new Map<EmbeddedNodeId, LayerOwnerSlot>();
  const targetByLayerId = new Map<EmbeddedNodeId, LayerEditingTarget>();
  void layoutDefinitions;
  return Object.freeze({ ownerIndex, ownerSlotById, targetByLayerId });
}

function findNearestLayerAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  layoutDefinitions: LayoutRegistry,
  index: LayerEditingSnapshotIndex,
): LayerEditingTarget | null {
  if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) return null;
  const node = doc.nodeAt(pos);
  if (node?.type.name === LAYER_NODE_TYPE) {
    return requireLayerAtPosition(doc, pos, layoutDefinitions, index);
  }
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== LAYER_NODE_TYPE) continue;
    return requireLayerAtPosition(doc, $pos.before(depth), layoutDefinitions, index);
  }
  return null;
}

function requireLayerAtPosition(
  doc: ProseMirrorNode,
  layerPos: number,
  layoutDefinitions: LayoutRegistry,
  index: LayerEditingSnapshotIndex,
): LayerEditingTarget {
  const layer = doc.nodeAt(layerPos);
  if (!layer || layer.type.name !== LAYER_NODE_TYPE) {
    throw new Error(`Expected a Layer at position ${layerPos}.`);
  }
  const layerId = requireNodeId(layer, "Layer");
  const cached = index.targetByLayerId.get(layerId);
  if (cached?.pos === layerPos) return cached;
  const $layer = doc.resolve(layerPos);
  for (let depth = $layer.depth; depth > 0; depth -= 1) {
    const owner = $layer.node(depth);
    if (!isLogicalOwnerType(owner.type.name)) continue;
    const ownerId = requireNodeId(owner, "Layer owner");
    const resolution = resolveIndexedOwnerSlot(index, ownerId, layoutDefinitions);
    if (resolution.status === "error") continue;
    const target = index.targetByLayerId.get(layerId);
    if (target?.pos === layerPos) return target;
  }
  throw new Error(`Layer "${layerId}" is not a direct child of a declared composition slot.`);
}

function findEnclosingLayerAncestors(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
  layoutDefinitions: LayoutRegistry,
  index: LayerEditingSnapshotIndex,
): readonly LayerEditingTarget[] {
  if (doc.nodeAt(pos) !== node) {
    throw new Error(`Layer structural root at position ${pos} is stale or invalid.`);
  }
  const $pos = doc.resolve(pos);
  const ancestors: LayerEditingTarget[] = [];
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== LAYER_NODE_TYPE) continue;
    ancestors.push(requireLayerAtPosition(doc, $pos.before(depth), layoutDefinitions, index));
  }
  return Object.freeze(ancestors);
}

function requireNodeId(node: ProseMirrorNode, label: string): EmbeddedNodeId {
  const id = node.attrs["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`${label} "${node.type.name}" has no stable identity.`);
  }
  return id as EmbeddedNodeId;
}

function isLogicalOwnerType(nodeType: string): nodeType is LayerLogicalOwnerType {
  return nodeType === "region" || nodeType === "cell" || nodeType === "section";
}

function isLayerStructuralOwnerType(nodeType: string): boolean {
  return (
    nodeType === SURFACE_NODE_TYPE ||
    nodeType === REGION_NODE_TYPE ||
    nodeType === GRID_NODE_TYPE ||
    nodeType === CELL_NODE_TYPE ||
    nodeType === LAYOUT_NODE_TYPE ||
    nodeType === SECTION_NODE_TYPE
  );
}

function documentContainsLayer(doc: ProseMirrorNode): boolean {
  let containsLayer = false;
  doc.descendants((node) => {
    if (node.type.name !== LAYER_NODE_TYPE) return true;
    containsLayer = true;
    return false;
  });
  return containsLayer;
}

function sameIds(left: readonly EmbeddedNodeId[], right: readonly EmbeddedNodeId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function trTransaction(tr: Transform): Transaction | null {
  const candidate = tr as Transform & {
    readonly setMeta?: (key: string, value: unknown) => Transaction;
  };
  return typeof candidate.setMeta === "function" ? (candidate as Transaction) : null;
}

function rangeTouchesNode(
  range: Readonly<{ from: number; to: number }>,
  pos: number,
  nodeSize: number,
): boolean {
  if (range.from === range.to) return range.from >= pos + 1 && range.from <= pos + nodeSize - 1;
  return range.from < pos + nodeSize && range.to > pos;
}

function isValidRange(range: Readonly<{ from: number; to: number }>, docSize: number): boolean {
  return (
    Number.isInteger(range.from) &&
    Number.isInteger(range.to) &&
    range.from >= 0 &&
    range.from <= range.to &&
    range.to <= docSize
  );
}

function freezeRange(from: number, to: number): Readonly<{ from: number; to: number }> {
  return Object.freeze({ from, to });
}

function ready<T>(value: T): LayerEditingBoundaryResult<T> {
  return Object.freeze({ status: "ready", value });
}

function error(errorValue: LayerEditingBoundaryError): LayerEditingBoundaryResult<never> {
  return Object.freeze({ status: "error", error: Object.freeze(errorValue) });
}
