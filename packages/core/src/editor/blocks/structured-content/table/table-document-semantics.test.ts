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

import { tableBlockDefinition } from "./table-definition";

const TABLE_NODE = "table";
const TABLE_ROW_NODE = "tableRow";
const TABLE_HEADER_NODE = "tableHeader";
const TABLE_CELL_NODE = "tableCell";

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
    [TABLE_NODE]: {
      group: "block",
      content: `${TABLE_ROW_NODE}+`,
      attrs: { id: { default: null } },
    },
    [TABLE_ROW_NODE]: {
      content: `(${TABLE_HEADER_NODE} | ${TABLE_CELL_NODE})+`,
      attrs: { id: { default: null } },
      selectable: false,
    },
    [TABLE_HEADER_NODE]: {
      content: "paragraph+",
      attrs: tableCellAttrs(),
    },
    [TABLE_CELL_NODE]: {
      content: "paragraph+",
      attrs: tableCellAttrs(),
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Table document semantics", () => {
  it("publishes header and body rows uniformly while keeping cells, prose and merge topology private", () => {
    const tableId = makeId("tb", 1);
    const headerRowId = makeId("tr", 1);
    const bodyRowId = makeId("tr", 2);
    const headerCellId = makeId("th", 1);
    const bodyCellId = makeId("tc", 1);
    const headerParagraphId = makeId("pa", 1);
    const bodyParagraphId = makeId("pa", 2);
    const privateHeaderProse = "Private header prose";
    const privateBodyProse = "Private body prose";
    const headerCell = tableCell(
      TABLE_HEADER_NODE,
      headerCellId,
      headerParagraphId,
      privateHeaderProse,
      { colspan: 7, rowspan: 5, colwidth: [997, 991] },
    );
    const bodyCell = tableCell(TABLE_CELL_NODE, bodyCellId, bodyParagraphId, privateBodyProse, {
      colspan: 3,
      rowspan: 11,
      colwidth: [983],
    });
    const table = tableNode(tableId, [
      tableRow(headerRowId, [headerCell]),
      tableRow(bodyRowId, [bodyCell]),
    ]);
    const doc = documentNode(table);
    const snapshot = project(doc, 4);

    expect(tableBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(tableId)).toMatchObject({
      kind: "block",
      label: "Table",
      children: [{ id: headerRowId }, { id: bodyRowId }],
    });
    for (const [index, rowId] of [headerRowId, bodyRowId].entries()) {
      expect(snapshot.itemById.get(rowId)).toMatchObject({
        id: rowId,
        kind: "published-child",
        nodeType: TABLE_ROW_NODE,
        label: `Table row ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(rowId)).toBe(tableId);
      const current = requireNodeById(doc, rowId);
      expect(snapshot.locationById.get(rowId)).toMatchObject({
        id: rowId,
        nodeType: TABLE_ROW_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: tableId,
        activationPath: [],
      });
    }

    for (const privateId of [headerCellId, bodyCellId, headerParagraphId, bodyParagraphId]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publishedChildDescriptions = [headerRowId, bodyRowId].flatMap((rowId) => {
      const row = snapshot.itemById.get(rowId);
      if (!row) throw new Error(`Expected published Table row ${rowId}.`);
      return row.summary === null ? [row.label] : [row.label, row.summary];
    });
    const publicBoundary = JSON.stringify({
      descriptions: publishedChildDescriptions,
      nodeTypes: [...snapshot.itemById.values()].map(({ nodeType }) => nodeType),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      headerCellId,
      bodyCellId,
      headerParagraphId,
      bodyParagraphId,
      privateHeaderProse,
      privateBodyProse,
      TABLE_HEADER_NODE,
      TABLE_CELL_NODE,
      "paragraph",
      '"colspan":7',
      '"rowspan":5',
      '"colwidth":[997,991]',
      '"colspan":3',
      '"rowspan":11',
      '"colwidth":[983]',
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted row identity", () => {
    const tableId = makeId("tb", 2);
    const first = simpleRow(makeId("tr", 3), "th", 2, TABLE_HEADER_NODE);
    const second = simpleRow(makeId("tr", 4), "tc", 2, TABLE_CELL_NODE);
    const third = simpleRow(makeId("tr", 5), "tc", 3, TABLE_CELL_NODE);

    const initial = projectRows(tableId, [first, second], 5);
    const added = projectRows(tableId, [first, second, third], 6);
    const changed = projectRows(tableId, [third, first], 7);

    expect(childIds(initial.snapshot, tableId)).toEqual([makeId("tr", 3), makeId("tr", 4)]);
    expect(childIds(added.snapshot, tableId)).toEqual([
      makeId("tr", 3),
      makeId("tr", 4),
      makeId("tr", 5),
    ]);
    expect(childIds(changed.snapshot, tableId)).toEqual([makeId("tr", 5), makeId("tr", 3)]);
    expect(changed.snapshot.itemById.has(makeId("tr", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("tr", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("tr", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("tr", 5))?.label).toBe("Table row 1");
    expect(changed.snapshot.itemById.get(makeId("tr", 3))?.label).toBe("Table row 2");
    for (const rowId of [makeId("tr", 5), makeId("tr", 3)]) {
      expect(changed.snapshot.itemById.get(rowId)?.id).toBe(rowId);
      expect(changed.snapshot.parentById.get(rowId)).toBe(tableId);
      expect(changed.snapshot.locationById.get(rowId)?.from).toBe(
        requireNodeById(changed.doc, rowId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("selects the Table owner without selecting a cell, invoking commands or mutating table state", async () => {
    const tableId = makeId("tb", 3);
    const headerRowId = makeId("tr", 6);
    const bodyRowId = makeId("tr", 7);
    const selectedCellId = makeId("tc", 4);
    const doc = documentNode(
      tableNode(tableId, [
        simpleRow(headerRowId, "th", 3, TABLE_HEADER_NODE),
        tableRow(bodyRowId, [
          tableCell(TABLE_CELL_NODE, selectedCellId, makeId("pa", 4), "Private selected cell"),
        ]),
      ]),
    );
    const originalDocument = doc.toJSON();
    const tableState = { selectedCellId, mergedCellIds: [selectedCellId] };
    const originalTableState = structuredClone(tableState);
    const addRowAfter = vi.fn();
    const deleteRow = vi.fn();
    const mergeCells = vi.fn();
    const splitCell = vi.fn();
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
    const tableLocation = controller.getSnapshot().semantics.locationById.get(tableId)!;
    const activationLookup = vi.spyOn(controller.semanticActivations, "resolve");

    await expect(controller.select(bodyRowId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: bodyRowId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(tableId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: bodyRowId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(tableLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === tableId),
    ).toBe(true);
    expect(activationLookup).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(addRowAfter).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(mergeCells).not.toHaveBeenCalled();
    expect(splitCell).not.toHaveBeenCalled();
    expect(tableState).toEqual(originalTableState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

function tableCellAttrs() {
  return {
    id: { default: null },
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  };
}

function simpleRow(
  rowId: EmbeddedNodeId,
  cellPrefix: string,
  ordinal: number,
  cellType: typeof TABLE_HEADER_NODE | typeof TABLE_CELL_NODE,
): ProseMirrorNode {
  return tableRow(rowId, [
    tableCell(
      cellType,
      makeId(cellPrefix, ordinal),
      makeId("pa", ordinal),
      `Private cell prose ${ordinal}`,
    ),
  ]);
}

function tableCell(
  type: typeof TABLE_HEADER_NODE | typeof TABLE_CELL_NODE,
  id: EmbeddedNodeId,
  paragraphId: EmbeddedNodeId,
  text: string,
  attrs: Readonly<{ colspan?: number; rowspan?: number; colwidth?: readonly number[] }> = {},
): ProseMirrorNode {
  return schema.node(type, { id, ...attrs }, [
    schema.node("paragraph", { id: paragraphId }, text ? [schema.text(text)] : []),
  ]);
}

function tableRow(id: EmbeddedNodeId, cells: readonly ProseMirrorNode[]): ProseMirrorNode {
  return schema.node(TABLE_ROW_NODE, { id }, cells);
}

function tableNode(id: EmbeddedNodeId, rows: readonly ProseMirrorNode[]): ProseMirrorNode {
  return schema.node(TABLE_NODE, { id }, rows);
}

function documentNode(table: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [table]),
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

function projectRows(tableId: EmbeddedNodeId, rows: readonly ProseMirrorNode[], revision: number) {
  const doc = documentNode(tableNode(tableId, rows));
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
        nodeType === TABLE_NODE
          ? {
              nodeType,
              title: tableBlockDefinition.title,
              isAssessment: false,
              ...(tableBlockDefinition.documentSemantics
                ? { documentSemantics: tableBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Table semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
