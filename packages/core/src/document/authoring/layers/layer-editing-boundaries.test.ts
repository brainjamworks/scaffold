import type { Icon } from "@phosphor-icons/react";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  deleteSelection,
  joinBackward,
  joinForward,
  lift,
  selectAll,
  splitBlock,
} from "@tiptap/pm/commands";
import { history, redo, undo } from "@tiptap/pm/history";
import {
  EditorState,
  NodeSelection,
  Plugin,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import { describe, expect, it } from "vite-plus/test";

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import {
  deleteNodeChecked,
  replaceRangeWithNodeChecked,
} from "@/document/model/commands/checked-transactions";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  allowsLayerEditingTransaction,
  authorizeExplicitLayerStructuralSteps,
  resolveLayerEditingTarget,
  validateImplicitLayerEditRange,
  validateLayerContentPlacement,
  type LayerEditingContext,
} from "./layer-editing-boundaries";

const IDS = {
  surface: id("surface00001"),
  region: id("region000001"),
  layer1: id("layer0000001"),
  layer2: id("layer0000002"),
  paragraph1: id("paragraph001"),
  paragraph1b: id("paragraph002"),
  paragraph2: id("paragraph003"),
  cell: id("cell00000001"),
  cellLayer1: id("celllayer001"),
  cellLayer2: id("celllayer002"),
  missingLayer: id("missinglayer"),
  otherRegion: id("region000002"),
  otherLayer: id("layer0000003"),
  layout: id("layout000001"),
  section: id("section00001"),
  sectionLayer: id("sectionlayer1"),
} as const;

const TestIcon = (() => null) as unknown as Icon;
const blockDefinitions = createBlockRegistry([
  defineBlock({ nodeType: "fill_block", title: "Fill", boundedPlacement: "fill" }),
]);
const layoutDefinitions = createLayoutRegistry([
  {
    id: "test-tabs",
    title: "Tabs",
    description: "Tabs",
    icon: TestIcon,
    createContent: () => ({ type: "layout" }),
    section: {
      label: "Tab",
      addLabel: "Add tab",
      create: () => ({ type: "section" }),
    },
  },
  {
    id: "test-accordion",
    title: "Accordion",
    description: "Accordion",
    icon: TestIcon,
    boundedPlacement: "fill",
    boundedSectionBehavior: "terminal-scroll",
    createContent: () => ({ type: "layout" }),
    section: {
      label: "Section",
      addLabel: "Add section",
      compositionSlot: { kind: "child", nodeType: "accordion_section_panel" },
      structure: {
        kind: "ordered-children",
        nodeTypes: ["accordion_section_title", "accordion_section_panel"],
      },
      create: () => ({ type: "section" }),
    },
  },
]);

describe("Layer editing boundaries", () => {
  it("distinguishes the authoring-open Layer from an explicitly addressed Layer", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);

    expect(resolveLayerEditingTarget({ ...context, doc, ownerId: IDS.region })).toMatchObject({
      status: "ready",
      value: { layerId: IDS.layer1 },
    });
    expect(
      resolveLayerEditingTarget({
        ...context,
        doc,
        ownerId: IDS.region,
        layerId: IDS.layer2,
      }),
    ).toMatchObject({ status: "ready", value: { layerId: IDS.layer2 } });
    expect(
      resolveLayerEditingTarget({
        ...context,
        doc,
        ownerId: IDS.region,
        layerId: IDS.otherLayer,
      }),
    ).toEqual({
      status: "error",
      error: {
        reason: "layer-owner-mismatch",
        layerId: IDS.otherLayer,
        expectedOwnerId: IDS.region,
        actualOwnerId: IDS.otherRegion,
      },
    });
    expect(
      resolveLayerEditingTarget({
        ...context,
        doc,
        ownerId: IDS.region,
        layerId: IDS.missingLayer,
      }),
    ).toEqual({
      status: "error",
      error: { reason: "layer-missing", requestedLayerId: IDS.missingLayer },
    });
    expect(
      resolveLayerEditingTarget({
        ...context,
        doc,
        ownerId: IDS.region,
        capturedSlotId: id("staleslot001"),
      }),
    ).toEqual({
      status: "error",
      error: {
        reason: "captured-slot-changed",
        ownerId: IDS.region,
        capturedSlotId: "staleslot001",
        currentSlotId: IDS.region,
      },
    });
  });

  it("refuses inactive and cross-alternative ranges with required facts", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);
    const first = findNode(doc, IDS.paragraph1);
    const second = findNode(doc, IDS.paragraph2);
    const firstLayer = findNode(doc, IDS.layer1);

    expect(
      validateImplicitLayerEditRange({
        ...context,
        doc,
        from: second.pos + 1,
        to: second.pos + 1,
      }),
    ).toEqual({
      status: "error",
      error: {
        reason: "inactive-layer-target",
        ownerId: IDS.region,
        targetLayerId: IDS.layer2,
        currentOpenLayerId: IDS.layer1,
      },
    });
    expect(
      validateImplicitLayerEditRange({
        ...context,
        doc,
        from: first.pos + 1,
        to: second.pos + 1,
      }),
    ).toEqual({
      status: "error",
      error: {
        reason: "edit-crosses-sibling-alternatives",
        layerIds: [IDS.layer1, IDS.layer2],
        range: { from: first.pos + 1, to: second.pos + 1 },
      },
    });
    expect(
      validateImplicitLayerEditRange({
        ...context,
        doc,
        from: firstLayer.pos,
        to: firstLayer.pos + firstLayer.node.nodeSize,
      }),
    ).toEqual({
      status: "error",
      error: {
        reason: "protected-layer-structure",
        layerId: IDS.layer1,
        range: {
          from: firstLayer.pos,
          to: firstLayer.pos + firstLayer.node.nodeSize,
        },
      },
    });
  });

  it("uses only the addressed Layer's direct children for Cell and fill policy", () => {
    const doc = cellDocumentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.cell, IDS.cellLayer1],
    ]);
    const target = resolveLayerEditingTarget({ ...context, doc, ownerId: IDS.cell });
    if (target.status === "error") throw new Error(target.error.reason);

    expect(
      validateLayerContentPlacement({
        target: target.value,
        contentType: "layout",
        contentIsFillOccupant: false,
        existingChildIsFillOccupant: (node) => node.type.name === "fill_block",
        from: target.value.contentTo,
        to: target.value.contentTo,
      }),
    ).toMatchObject({ status: "ready" });
    expect(
      validateLayerContentPlacement({
        target: target.value,
        contentType: "grid",
        contentIsFillOccupant: true,
        existingChildIsFillOccupant: (node) => node.type.name === "fill_block",
        from: target.value.contentTo,
        to: target.value.contentTo,
      }),
    ).toEqual({
      status: "error",
      error: {
        reason: "content-incompatible",
        ownerId: IDS.cell,
        layerId: IDS.cellLayer1,
        contentType: "grid",
        rule: "grid-not-allowed-in-cell",
      },
    });
  });

  it("rejects checked transaction results that violate Cell and exclusive-fill policy", () => {
    const doc = cellDocumentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.cell, IDS.cellLayer1],
    ]);
    const target = resolveLayerEditingTarget({ ...context, doc, ownerId: IDS.cell });
    if (target.status === "error") throw new Error(target.error.reason);
    const state = EditorState.create({ doc });
    const directGrid = candidateSchema.node("grid", { id: id("grid00000001") }, [
      candidateSchema.node("cell", { id: id("cell00000002") }, [
        layer(id("celllayer003"), [paragraph(id("paragraph004"), "Nested")]),
      ]),
    ]);
    const replaceWithGrid = state.tr.replaceWith(
      target.value.contentFrom,
      target.value.contentTo,
      directGrid,
    );
    expect(
      allowsLayerEditingTransaction({
        ...context,
        blockDefinitions,
        transaction: replaceWithGrid,
        state,
      }),
    ).toBe(false);

    const appendFill = state.tr.insert(target.value.contentTo, candidateSchema.node("fill_block"));
    expect(
      allowsLayerEditingTransaction({
        ...context,
        blockDefinitions,
        transaction: appendFill,
        state,
      }),
    ).toBe(false);
    expect(state.doc).toBe(doc);
  });

  it("rejects an ordinary transaction that changes Layer membership", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);
    const state = EditorState.create({ doc });
    const firstLayer = findNode(doc, IDS.layer1);
    const insertLayer = state.tr.insert(
      firstLayer.pos + firstLayer.node.nodeSize,
      layer(id("layer0000004"), [paragraph(id("paragraph005"), "Unexpected")]),
    );

    expect(
      allowsLayerEditingTransaction({
        ...context,
        blockDefinitions,
        transaction: insertLayer,
        state,
      }),
    ).toBe(false);
    expect(state.doc).toBe(doc);
  });

  it("applies a checked Grid insertion through the installed guard without consuming hidden content", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);
    const state = guardedState(doc, context);
    const sourceParagraph = findNode(doc, id("paragraph004"));
    const grid = candidateSchema.node("grid", { id: id("grid00000002") }, [
      candidateSchema.node("cell", { id: id("cell00000002") }, [
        layer(id("celllayer004"), [paragraph(id("paragraph006"), "Nested")]),
      ]),
    ]);
    const mutation = replaceRangeWithNodeChecked({
      tr: state.tr,
      from: sourceParagraph.pos,
      to: sourceParagraph.pos + sourceParagraph.node.nodeSize,
      node: grid,
      layerAccess: {
        kind: "implicit-authoring",
        context: { ...context, blockDefinitions },
      },
    });
    expect(mutation.ok).toBe(true);
    if (!mutation.ok) return;

    const applied = state.applyTransaction(mutation.tr);
    expect(applied.transactions).toHaveLength(1);
    expect(findNode(applied.state.doc, id("grid00000002")).node.type.name).toBe("grid");
    expect(findNode(applied.state.doc, IDS.paragraph2).node.textContent).toBe("Hidden");
    expect(findNode(applied.state.doc, IDS.layer2).node.attrs["id"]).toBe(IDS.layer2);
  });

  it("scopes whole-owner authorization to the steps produced by that operation", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);
    const state = guardedState(doc, context);
    const hidden = findNode(doc, IDS.paragraph2);
    const other = findNode(doc, id("paragraph004"));
    const transaction = state.tr.insertText("!", hidden.pos + 2);
    const fromStep = transaction.steps.length;
    transaction.insertText(" renamed", other.pos + other.node.nodeSize - 1);
    authorizeExplicitLayerStructuralSteps(transaction, {
      fromStep,
      rootIds: [IDS.otherRegion],
    });

    const applied = state.applyTransaction(transaction);
    expect(applied.transactions).toHaveLength(0);
    expect(applied.state.doc).toBe(state.doc);
    expect(findNode(applied.state.doc, IDS.paragraph2).node.textContent).toBe("Hidden");
    expect(undo(applied.state)).toBe(false);
  });

  it("covers adjacent authorized roots without permitting a gap", () => {
    const doc = adjacentRootDocumentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
      [id("region000003"), id("layer0000004")],
    ]);
    const first = findNode(doc, IDS.region);
    const second = findNode(doc, IDS.otherRegion);

    const adjacentState = guardedState(doc, context);
    const adjacentDelete = adjacentState.tr.delete(first.pos, second.pos + second.node.nodeSize);
    authorizeExplicitLayerStructuralSteps(adjacentDelete, {
      fromStep: 0,
      rootIds: [IDS.region, IDS.otherRegion],
    });
    expect(adjacentState.applyTransaction(adjacentDelete).transactions).toHaveLength(1);

    const gapState = guardedState(doc, context);
    const gapDelete = gapState.tr.delete(first.pos, second.pos + second.node.nodeSize);
    authorizeExplicitLayerStructuralSteps(gapDelete, {
      fromStep: 0,
      rootIds: [IDS.region, id("region000003")],
    });
    expect(() => gapState.applyTransaction(gapDelete)).toThrow(
      "Explicit Layer structural authorization exceeds its declared roots.",
    );
    expect(gapState.doc).toBe(doc);
  });

  it("allows open whole-owner NodeSelections without exposing Layer wrappers or closed ancestors", () => {
    const doc = structuralSelectionDocumentFixture();
    const openContext = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.cell, IDS.cellLayer1],
      [IDS.section, IDS.sectionLayer],
    ]);

    for (const ownerId of [id("grid00000001"), IDS.layout]) {
      const owner = findNode(doc, ownerId);
      const state = guardedState(doc, openContext);
      const applied = state.applyTransaction(
        state.tr.setSelection(NodeSelection.create(doc, owner.pos)),
      );
      expect(applied.transactions, ownerId).toHaveLength(1);
      expect(applied.state.selection).toBeInstanceOf(NodeSelection);
    }

    const layerTarget = findNode(doc, IDS.layer1);
    const layerState = guardedState(doc, openContext);
    expect(
      layerState.applyTransaction(
        layerState.tr.setSelection(NodeSelection.create(doc, layerTarget.pos)),
      ).transactions,
    ).toHaveLength(0);

    const layoutTarget = findNode(doc, IDS.layout);
    const closedState = guardedState(
      doc,
      editingContext([
        [IDS.region, IDS.layer2],
        [IDS.cell, IDS.cellLayer1],
        [IDS.section, IDS.sectionLayer],
      ]),
    );
    expect(
      closedState.applyTransaction(
        closedState.tr.setSelection(NodeSelection.create(doc, layoutTarget.pos)),
      ).transactions,
    ).toHaveLength(0);
    expect(closedState.selection).not.toBeInstanceOf(NodeSelection);
    expect(undo(closedState)).toBe(false);
  });

  it("validates a whole-owner delete before intentionally including its complete subtree", () => {
    const doc = structuralSelectionDocumentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer2],
      [IDS.cell, IDS.cellLayer1],
      [IDS.section, IDS.sectionLayer],
    ]);
    const state = guardedState(doc, context);
    const layout = findNode(doc, IDS.layout);
    const range = { from: layout.pos, to: layout.pos + layout.node.nodeSize };

    const wrongDestination = state.tr;
    expect(
      deleteNodeChecked({
        tr: wrongDestination,
        pos: layout.pos,
        layerAccess: {
          kind: "explicit-layer",
          blockDefinitions,
          layoutDefinitions,
          destination: {
            ownerId: IDS.region,
            layerId: IDS.layer2,
            capturedSlotId: IDS.region,
          },
        },
      }),
    ).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_editing_refused",
        message: "Layer editing refused: explicit-layer-destination-mismatch.",
        error: {
          reason: "explicit-layer-destination-mismatch",
          declaredOwnerId: IDS.region,
          declaredLayerId: IDS.layer2,
          actualOwnerId: IDS.cell,
          actualLayerId: IDS.cellLayer1,
          range,
        },
      },
    });
    expect(wrongDestination.steps).toHaveLength(0);
    expect(state.doc).toBe(doc);
    expect(undo(state)).toBe(false);

    const implicit = state.tr;
    expect(
      deleteNodeChecked({
        tr: implicit,
        pos: layout.pos,
        layerAccess: {
          kind: "implicit-authoring",
          context: { ...context, blockDefinitions },
        },
      }),
    ).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_editing_refused",
        message: "Layer editing refused: inactive-layer-target.",
        error: {
          reason: "inactive-layer-target",
          ownerId: IDS.region,
          targetLayerId: IDS.layer1,
          currentOpenLayerId: IDS.layer2,
        },
      },
    });
    expect(implicit.steps).toHaveLength(0);

    const correct = deleteNodeChecked({
      tr: state.tr,
      pos: layout.pos,
      layerAccess: {
        kind: "explicit-layer",
        blockDefinitions,
        layoutDefinitions,
        destination: {
          ownerId: IDS.cell,
          layerId: IDS.cellLayer1,
          capturedSlotId: IDS.cell,
        },
      },
    });
    expect(correct.ok).toBe(true);
    if (!correct.ok) return;
    const applied = state.applyTransaction(correct.tr);
    expect(applied.transactions).toHaveLength(1);
    expect(hasNodeId(applied.state.doc, IDS.layout)).toBe(false);
    expect(hasNodeId(applied.state.doc, IDS.sectionLayer)).toBe(false);
    expect(hasNodeId(applied.state.doc, id("sectionlayer2"))).toBe(false);
    expect(findNode(applied.state.doc, IDS.paragraph1).node.textContent).toBe("Cell");
    expect(findNode(applied.state.doc, IDS.paragraph2).node.textContent).toBe("Hidden");

    const undoDelete = captureCommand(undo, applied.state);
    expect(undoDelete).not.toBeNull();
    const restored = applied.state.applyTransaction(undoDelete!);
    expect(restored.transactions).toHaveLength(1);
    expect(hasNodeId(restored.state.doc, IDS.layout)).toBe(true);
  });

  it("deletes a sole whole owner through the guard with one identified editable replacement", () => {
    const doc = cellDocumentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.cell, IDS.cellLayer1],
    ]);
    const state = guardedState(doc, context);
    const grid = findNode(doc, id("grid00000001"));
    const deletion = deleteNodeChecked({
      tr: state.tr,
      pos: grid.pos,
      layerAccess: { kind: "implicit-authoring", context: { ...context, blockDefinitions } },
    });
    expect(deletion.ok).toBe(true);
    if (!deletion.ok) return;
    expect(deletion.tr.steps).toHaveLength(1);

    const replacementLayer = findNode(deletion.tr.doc, IDS.layer1).node;
    const replacement = replacementLayer.firstChild;
    expect(replacement?.type.name).toBe("paragraph");
    expect(replacement?.content.size).toBe(0);
    const replacementId = EmbeddedNodeIdSchema.parse(replacement?.attrs["id"]);

    const applied = state.applyTransaction(deletion.tr);
    expect(applied.transactions).toHaveLength(1);
    expect(findNode(applied.state.doc, IDS.layer1).node.attrs["id"]).toBe(IDS.layer1);
    expect(findNode(applied.state.doc, replacementId).node.type.name).toBe("paragraph");
    expect(findNode(applied.state.doc, IDS.layer2).node.attrs["id"]).toBe(IDS.layer2);
    expect(findNode(applied.state.doc, IDS.paragraph2).node.textContent).toBe("Hidden");
    expect(hasNodeId(applied.state.doc, id("grid00000001"))).toBe(false);

    const undoDelete = captureCommand(undo, applied.state);
    expect(undoDelete).not.toBeNull();
    const restored = applied.state.applyTransaction(undoDelete!);
    expect(restored.transactions).toHaveLength(1);
    expect(findNode(restored.state.doc, id("grid00000001")).node.type.name).toBe("grid");
    expect(findNode(restored.state.doc, IDS.cellLayer1).node.attrs["id"]).toBe(IDS.cellLayer1);

    const redoDelete = captureCommand(redo, restored.state);
    expect(redoDelete).not.toBeNull();
    const redone = restored.state.applyTransaction(redoDelete!);
    expect(redone.transactions).toHaveLength(1);
    expect(hasNodeId(redone.state.doc, id("grid00000001"))).toBe(false);
    expect(findNode(redone.state.doc, replacementId).node.type.name).toBe("paragraph");

    const guardedAgainstChaining = guardedState(doc, context);
    const chained = deleteNodeChecked({
      tr: guardedAgainstChaining.tr,
      pos: grid.pos,
      layerAccess: { kind: "implicit-authoring", context: { ...context, blockDefinitions } },
    });
    expect(chained.ok).toBe(true);
    if (!chained.ok) return;
    const hidden = findNode(chained.tr.doc, IDS.paragraph2);
    chained.tr.insertText("!", hidden.pos + 2);
    const refused = guardedAgainstChaining.applyTransaction(chained.tr);
    expect(refused.transactions).toHaveLength(0);
    expect(refused.state.doc).toBe(doc);
    expect(undo(refused.state)).toBe(false);
  });

  it("allows split/join within the open Layer and rejects boundary joins and cross-Layer cut", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);
    const paragraph1 = findNode(doc, IDS.paragraph1);
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, paragraph1.pos + 3),
    });
    const split = captureCommand(splitBlock, state);
    expect(split).not.toBeNull();
    expect(allowsLayerEditingTransaction({ ...context, transaction: split!, state })).toBe(true);

    const paragraph1b = findNode(doc, IDS.paragraph1b);
    state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, paragraph1b.pos + 1),
    });
    const join = captureCommand(joinBackward, state);
    expect(join).not.toBeNull();
    expect(allowsLayerEditingTransaction({ ...context, transaction: join!, state })).toBe(true);

    state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, paragraph1b.pos + paragraph1b.node.nodeSize - 1),
    });
    expect(captureCommand(joinForward, state)).toBeNull();

    state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, paragraph1.pos + 2),
    });
    expect(captureCommand(lift, state)).toBeNull();

    const paragraph2 = findNode(doc, IDS.paragraph2);
    state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, paragraph2.pos + 1),
    });
    expect(captureCommand(joinBackward, state)).toBeNull();

    const crossSelection = TextSelection.create(
      doc,
      paragraph1.pos + 1,
      paragraph2.pos + paragraph2.node.nodeSize - 1,
    );
    state = EditorState.create({ doc, selection: crossSelection });
    const cut = captureCommand(deleteSelection, state);
    expect(cut).not.toBeNull();
    expect(allowsLayerEditingTransaction({ ...context, transaction: cut!, state })).toBe(false);
    expect(state.doc).toBe(doc);
  });

  it("refuses select-all but permits marked whole-owner operations and undo", () => {
    const doc = documentFixture();
    const context = editingContext([
      [IDS.region, IDS.layer1],
      [IDS.otherRegion, IDS.otherLayer],
    ]);
    let state = EditorState.create({ doc, plugins: [history()] });
    const selectAllTransaction = captureCommand(selectAll, state);
    expect(selectAllTransaction).not.toBeNull();
    expect(
      allowsLayerEditingTransaction({
        ...context,
        transaction: selectAllTransaction!,
        state,
      }),
    ).toBe(false);

    const otherRegion = findNode(doc, IDS.otherRegion);
    const deleteOwner = state.tr.delete(
      otherRegion.pos,
      otherRegion.pos + otherRegion.node.nodeSize,
    );
    expect(allowsLayerEditingTransaction({ ...context, transaction: deleteOwner, state })).toBe(
      false,
    );
    authorizeExplicitLayerStructuralSteps(deleteOwner, {
      fromStep: 0,
      rootIds: [IDS.otherRegion],
    });
    expect(allowsLayerEditingTransaction({ ...context, transaction: deleteOwner, state })).toBe(
      true,
    );

    const paragraph = findNode(state.doc, IDS.paragraph1);
    const typing = state.tr.insertText("!", paragraph.pos + 2);
    expect(allowsLayerEditingTransaction({ ...context, transaction: typing, state })).toBe(true);
    state = state.apply(typing);
    const undoTransaction = captureCommand(undo, state);
    expect(undoTransaction).not.toBeNull();
    expect(
      allowsLayerEditingTransaction({ ...context, transaction: undoTransaction!, state }),
    ).toBe(true);
  });
});

function captureCommand(
  command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean,
  state: EditorState,
): Transaction | null {
  let transaction: Transaction | null = null;
  const applied = command(state, (next) => {
    transaction = next;
  });
  expect(applied).toBe(transaction !== null);
  return transaction;
}

function guardedState(doc: ProseMirrorNode, context: LayerEditingContext): EditorState {
  return EditorState.create({
    doc,
    plugins: [
      history(),
      new Plugin({
        filterTransaction: (transaction, state) =>
          allowsLayerEditingTransaction({
            ...context,
            blockDefinitions,
            transaction,
            state,
          }),
      }),
    ],
  });
}

function editingContext(
  entries: readonly (readonly [EmbeddedNodeId, EmbeddedNodeId])[],
): LayerEditingContext {
  return {
    layoutDefinitions,
    openLayerByOwnerId: new Map(entries),
  };
}

function documentFixture(): ProseMirrorNode {
  return candidateSchema.node("doc", null, [
    candidateSchema.node("surface", { id: IDS.surface }, [
      candidateSchema.node("region", { id: IDS.region }, [
        layer(IDS.layer1, [paragraph(IDS.paragraph1, "First"), paragraph(IDS.paragraph1b, "More")]),
        layer(IDS.layer2, [paragraph(IDS.paragraph2, "Hidden")]),
      ]),
      candidateSchema.node("region", { id: IDS.otherRegion }, [
        layer(IDS.otherLayer, [paragraph(id("paragraph004"), "Other")]),
      ]),
    ]),
  ]);
}

function cellDocumentFixture(): ProseMirrorNode {
  return candidateSchema.node("doc", null, [
    candidateSchema.node("surface", { id: IDS.surface }, [
      candidateSchema.node("region", { id: IDS.region }, [
        layer(IDS.layer1, [
          candidateSchema.node("grid", { id: id("grid00000001") }, [
            candidateSchema.node("cell", { id: IDS.cell }, [
              layer(IDS.cellLayer1, [paragraph(IDS.paragraph1, "Open")]),
              layer(IDS.cellLayer2, [candidateSchema.node("fill_block")]),
            ]),
          ]),
        ]),
        layer(IDS.layer2, [paragraph(IDS.paragraph2, "Hidden")]),
      ]),
    ]),
  ]);
}

function structuralSelectionDocumentFixture(): ProseMirrorNode {
  return candidateSchema.node("doc", null, [
    candidateSchema.node("surface", { id: IDS.surface }, [
      candidateSchema.node("region", { id: IDS.region }, [
        layer(IDS.layer1, [
          candidateSchema.node("grid", { id: id("grid00000001") }, [
            candidateSchema.node("cell", { id: IDS.cell }, [
              layer(IDS.cellLayer1, [
                paragraph(IDS.paragraph1, "Cell"),
                candidateSchema.node("layout", { id: IDS.layout, variant: "test-tabs" }, [
                  candidateSchema.node("section", { id: IDS.section }, [
                    layer(IDS.sectionLayer, [paragraph(IDS.paragraph1b, "Section")]),
                    layer(id("sectionlayer2"), [paragraph(id("paragraph006"), "Alternative")]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
        layer(IDS.layer2, [paragraph(IDS.paragraph2, "Hidden")]),
      ]),
    ]),
  ]);
}

function adjacentRootDocumentFixture(): ProseMirrorNode {
  return candidateSchema.node("doc", null, [
    candidateSchema.node("surface", { id: IDS.surface }, [
      candidateSchema.node("region", { id: IDS.region }, [
        layer(IDS.layer1, [paragraph(IDS.paragraph1, "First")]),
      ]),
      candidateSchema.node("region", { id: IDS.otherRegion }, [
        layer(IDS.otherLayer, [paragraph(IDS.paragraph2, "Second")]),
      ]),
      candidateSchema.node("region", { id: id("region000003") }, [
        layer(id("layer0000004"), [paragraph(id("paragraph005"), "Third")]),
      ]),
    ]),
  ]);
}

function layer(layerId: EmbeddedNodeId, content: readonly ProseMirrorNode[]): ProseMirrorNode {
  return candidateSchema.node("layer", { id: layerId }, content);
}

function paragraph(paragraphId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return candidateSchema.node("paragraph", { id: paragraphId }, [candidateSchema.text(text)]);
}

function findNode(
  doc: ProseMirrorNode,
  nodeId: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let match: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== nodeId) return true;
    match = { node, pos };
    return false;
  });
  if (!match) throw new Error(`Missing fixture node "${nodeId}".`);
  return match;
}

function hasNodeId(doc: ProseMirrorNode, nodeId: EmbeddedNodeId): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.attrs["id"] !== nodeId) return true;
    found = true;
    return false;
  });
  return found;
}

function id(value: string): EmbeddedNodeId {
  return value as EmbeddedNodeId;
}

const candidateSchema = new Schema({
  nodes: {
    doc: { content: "surface+" },
    text: { group: "inline" },
    surface: { content: "region+", attrs: { id: { default: null } } },
    region: { content: "layer+", attrs: { id: { default: null } } },
    layer: {
      content: "(paragraph | fill_block | grid | layout)+",
      attrs: { id: { default: null } },
      isolating: true,
      defining: true,
    },
    paragraph: { content: "inline*", attrs: { id: { default: null } } },
    fill_block: { group: "block", atom: true },
    grid: { content: "cell+", attrs: { id: { default: null } } },
    cell: { content: "layer+", attrs: { id: { default: null } } },
    layout: { content: "section+", attrs: { id: { default: null }, variant: {} } },
    section: {
      content: "layer+ | (accordion_section_title accordion_section_panel)",
      attrs: { id: { default: null } },
    },
    accordion_section_title: {
      content: "paragraph",
      attrs: { id: { default: null } },
    },
    accordion_section_panel: {
      content: "layer+",
      attrs: { id: { default: null } },
    },
  },
});
