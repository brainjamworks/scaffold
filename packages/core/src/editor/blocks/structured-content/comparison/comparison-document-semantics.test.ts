import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import { SemanticDocumentController } from "@/document/authoring/semantic-document/semantic-document-controller";
import type {
  SemanticNavigationEditor,
  SemanticNavigationEnvironment,
} from "@/document/authoring/semantic-document/semantic-navigation";
import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure/course-structure-projection";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
} from "@/document/model/semantic-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { COMPARISON_CELL_NODE, COMPARISON_NODE, COMPARISON_ROW_NODE } from "./content";
import { comparisonBlockDefinition } from "./comparison-definition";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "surface+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    surface: {
      content: "block+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    [COMPARISON_NODE]: {
      group: "block",
      content: `${COMPARISON_ROW_NODE}+`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [COMPARISON_ROW_NODE]: {
      content: `${COMPARISON_CELL_NODE} ${COMPARISON_CELL_NODE}`,
      attrs: { id: { default: null } },
      selectable: false,
    },
    [COMPARISON_CELL_NODE]: {
      content: "paragraph+",
      attrs: { id: { default: null }, side: { default: "left" } },
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Comparison document semantics", () => {
  it("publishes direct rows with stable locations and privacy-safe ordinal labels", () => {
    const comparisonId = makeId("cm", 1);
    const firstRowId = makeId("cr", 1);
    const secondRowId = makeId("cr", 2);
    const firstLeftCellId = makeId("cc", 1);
    const firstRightCellId = makeId("cc", 2);
    const secondLeftCellId = makeId("cc", 3);
    const secondRightCellId = makeId("cc", 4);
    const firstLeftParagraphId = makeId("pa", 1);
    const firstRightParagraphId = makeId("pa", 2);
    const secondLeftParagraphId = makeId("pa", 3);
    const secondRightParagraphId = makeId("pa", 4);
    const privateConfiguration = {
      leftLabel: "Private before column",
      rightLabel: "Private after column",
    };
    const privateProse = [
      "Private first left comparison prose",
      "Private first right comparison prose",
      "Private second left comparison prose",
      "Private second right comparison prose",
    ];
    const comparison = comparisonNode(
      comparisonId,
      [
        comparisonRow(firstRowId, [
          comparisonCell(firstLeftCellId, firstLeftParagraphId, "left", privateProse[0]!),
          comparisonCell(firstRightCellId, firstRightParagraphId, "right", privateProse[1]!),
        ]),
        comparisonRow(secondRowId, [
          comparisonCell(secondLeftCellId, secondLeftParagraphId, "left", privateProse[2]!),
          comparisonCell(secondRightCellId, secondRightParagraphId, "right", privateProse[3]!),
        ]),
      ],
      privateConfiguration,
    );
    const doc = documentNode(comparison);
    const snapshot = project(doc, 4);

    expect(comparisonBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(comparisonId)).toMatchObject({
      kind: "block",
      label: "Comparison",
      children: [{ id: firstRowId }, { id: secondRowId }],
    });
    for (const [index, rowId] of [firstRowId, secondRowId].entries()) {
      const row = snapshot.itemById.get(rowId);
      expect(row).toMatchObject({
        id: rowId,
        kind: "published-child",
        nodeType: COMPARISON_ROW_NODE,
        label: `Comparison row ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(rowId)).toBe(comparisonId);
      const current = requireNodeById(doc, rowId);
      expect(snapshot.locationById.get(rowId)).toMatchObject({
        id: rowId,
        nodeType: COMPARISON_ROW_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: comparisonId,
        activationPath: [],
      });
    }

    const privateIds = [
      firstLeftCellId,
      firstRightCellId,
      secondLeftCellId,
      secondRightCellId,
      firstLeftParagraphId,
      firstRightParagraphId,
      secondLeftParagraphId,
      secondRightParagraphId,
    ];
    for (const privateId of privateIds) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publicBoundary = JSON.stringify({
      descriptions: [...snapshot.itemById.values()].map(({ label, summary }) => ({
        label,
        summary,
      })),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      ...privateIds,
      privateConfiguration.leftLabel,
      privateConfiguration.rightLabel,
      ...privateProse,
      '"left"',
      '"right"',
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted row identity", () => {
    const comparisonId = makeId("cm", 2);
    const first = simpleRow(makeId("cr", 3), 3);
    const second = simpleRow(makeId("cr", 4), 4);
    const third = simpleRow(makeId("cr", 5), 5);

    const initial = projectRows(comparisonId, [first, second], 5);
    const added = projectRows(comparisonId, [first, second, third], 6);
    const changed = projectRows(comparisonId, [third, first], 7);

    expect(childIds(initial.snapshot, comparisonId)).toEqual([makeId("cr", 3), makeId("cr", 4)]);
    expect(childIds(added.snapshot, comparisonId)).toEqual([
      makeId("cr", 3),
      makeId("cr", 4),
      makeId("cr", 5),
    ]);
    expect(childIds(changed.snapshot, comparisonId)).toEqual([makeId("cr", 5), makeId("cr", 3)]);
    expect(changed.snapshot.itemById.has(makeId("cr", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("cr", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("cr", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("cr", 5))?.label).toBe("Comparison row 1");
    expect(changed.snapshot.itemById.get(makeId("cr", 3))?.label).toBe("Comparison row 2");
    for (const rowId of [makeId("cr", 5), makeId("cr", 3)]) {
      expect(changed.snapshot.itemById.get(rowId)?.id).toBe(rowId);
      expect(changed.snapshot.locationById.get(rowId)?.from).toBe(
        requireNodeById(changed.doc, rowId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("reaches the exact row through its Comparison anchor without focusing cells or invoking controls", async () => {
    const comparisonId = makeId("cm", 3);
    const firstRowId = makeId("cr", 6);
    const secondRowId = makeId("cr", 7);
    const focusedCellId = makeId("cc", 25);
    const doc = documentNode(
      comparisonNode(comparisonId, [simpleRow(firstRowId, 6), simpleRow(secondRowId, 7)]),
    );
    const originalDocument = doc.toJSON();
    const cellFocusState = { focusedCellId };
    const originalCellFocusState = structuredClone(cellFocusState);
    const addRow = vi.fn();
    const deleteRow = vi.fn();
    const focusEditor = vi.fn();
    let state = EditorState.create({ doc });
    let controller: SemanticDocumentController;
    const navigationEditor: SemanticNavigationEditor = {
      dispatch: (transaction: Transaction) => {
        state = state.apply(transaction);
        controller.applyTransaction(transaction, state);
      },
      focus: focusEditor,
    };
    const presentSurface = vi.fn(async () => undefined);
    const bringIntoView = vi.fn(async () => undefined);
    const createActivationTransaction = vi.fn((location) => {
      const tr = state.tr;
      if (location.selectionTarget.kind !== "node") return null;
      tr.setSelection(NodeSelection.create(tr.doc, location.selectionTarget.pos));
      return tr;
    });
    const environment: SemanticNavigationEnvironment = {
      createActivationTransaction,
      presentSurface,
      bringIntoView,
    };
    controller = new SemanticDocumentController({
      state,
      definitions: definitions(),
      navigationEditor,
    });
    controller.setNavigationEnvironment(environment);
    const comparisonLocation = controller.getSnapshot().semantics.locationById.get(comparisonId)!;
    const activationLookup = vi
      .spyOn(controller.semanticTargetInteractions.registry, "resolve")
      .mockImplementation(() => {
        throw new Error("Anchor-only navigation must not resolve an activation binding");
      });

    await expect(controller.select(secondRowId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: secondRowId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(comparisonId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondRowId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(comparisonLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === comparisonId),
    ).toBe(true);
    expect(activationLookup).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(addRow).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(cellFocusState).toEqual(originalCellFocusState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

function simpleRow(id: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return comparisonRow(id, [
    comparisonCell(
      makeId("cc", ordinal * 2 - 1),
      makeId("pa", ordinal * 2 - 1),
      "left",
      `Private left comparison prose ${ordinal}`,
    ),
    comparisonCell(
      makeId("cc", ordinal * 2),
      makeId("pa", ordinal * 2),
      "right",
      `Private right comparison prose ${ordinal}`,
    ),
  ]);
}

function comparisonCell(
  id: EmbeddedNodeId,
  paragraphId: EmbeddedNodeId,
  side: "left" | "right",
  prose: string,
): ProseMirrorNode {
  return schema.node(COMPARISON_CELL_NODE, { id, side }, [
    schema.node("paragraph", { id: paragraphId }, prose ? [schema.text(prose)] : []),
  ]);
}

function comparisonRow(
  id: EmbeddedNodeId,
  cells: readonly [ProseMirrorNode, ProseMirrorNode],
): ProseMirrorNode {
  return schema.node(COMPARISON_ROW_NODE, { id }, cells);
}

function comparisonNode(
  id: EmbeddedNodeId,
  rows: readonly ProseMirrorNode[],
  data: Readonly<Record<string, unknown>> = {
    leftLabel: "Private left column",
    rightLabel: "Private right column",
  },
): ProseMirrorNode {
  return schema.node(COMPARISON_NODE, { id, data }, rows);
}

function documentNode(comparison: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [comparison]),
      ]),
    ]),
  ]);
}

function project(doc: ProseMirrorNode, revision: number) {
  return projectSemanticDocument({
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions: definitions(),
    revision,
  });
}

function projectRows(
  comparisonId: EmbeddedNodeId,
  rows: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(comparisonNode(comparisonId, rows));
  return { doc, snapshot: project(doc, revision) };
}

function childIds(
  snapshot: ReturnType<typeof projectSemanticDocument>,
  ownerId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  return snapshot.itemById.get(ownerId)?.children.map(({ id }) => id) ?? [];
}

function requireNodeById(
  doc: ProseMirrorNode,
  id: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let found: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`Expected node ${id}.`);
  return found;
}

function definitions(): SemanticDefinitionLookup {
  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) =>
        nodeType === COMPARISON_NODE
          ? {
              nodeType,
              title: comparisonBlockDefinition.title,
              isAssessment: false,
              ...(comparisonBlockDefinition.documentSemantics
                ? { documentSemantics: comparisonBlockDefinition.documentSemantics }
                : {}),
            }
          : undefined,
    }),
    layouts: Object.freeze({ get: () => undefined }),
    surfaces: Object.freeze({
      get: (variant: string) => {
        const definition = builtInSurfaceVariantRegistry.get(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentSemantics
                ? { documentSemantics: definition.documentSemantics }
                : {}),
            }
          : undefined;
      },
    }),
  });
}

function requireCourseStructure(doc: ProseMirrorNode): ProjectedCourseStructure {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid Comparison semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
