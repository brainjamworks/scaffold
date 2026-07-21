// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";

import { CellAuthoringNode, GridAuthoringNode } from "../authoring/grid-nodes";
import {
  addGridCellAt,
  addGridCellAtEnd,
  deleteGridAt,
  deleteGridCellAt,
  insertGridChecked,
  insertGridAt,
  resizeGridColumnsAt,
  setAllGridCellsVerticalPositionAt,
  setGridCellCountAt,
  setGridCellVerticalPositionAt,
} from "./grid-commands";
import {
  createGridTemplate,
  isGridCellEmpty,
  isGridCellVerticalPosition,
  isGridEmpty,
  normalizeColumnWidths,
  resizeAdjacentColumnWidths,
} from "./grid-model";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const TestBlockNode = Node.create({
  name: "test_block",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
      marker: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-marker"),
        renderHTML: (attrs: { marker?: unknown }) =>
          typeof attrs.marker === "string" ? { "data-marker": attrs.marker } : {},
      },
      horizontalAlignment: { default: "left" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-block": "" }];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
    ],
  });
}

function makeCourseEditor(content: JSONContent[] = []) {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestBlockNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content,
            },
          ],
        },
      ],
    },
  });
}

function block(id: string, marker = id): JSONContent {
  return { type: "test_block", attrs: { id, marker } };
}

function paragraph(text?: string): JSONContent {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function cell(content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent {
  return {
    type: "cell",
    attrs,
    content: content.length ? content : [paragraph()],
  };
}

function grid(cells: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "grid", attrs, content: cells };
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) {
    throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  }

  return found;
}

function surfaceInsertPos(editor: Editor): number {
  return nodePos(editor, "surface") + 1;
}

function firstGrid(editor: Editor): JSONContent {
  const surface = editor.getJSON().content?.[0]?.content?.[0] as JSONContent | undefined;
  const gridNode = surface?.content?.find((node) => node.type === "grid");
  if (!gridNode) throw new Error("Could not find grid JSON");
  return gridNode;
}

function firstSurfaceContent(editor: Editor): JSONContent[] {
  const surface = editor.getJSON().content?.[0]?.content?.[0] as JSONContent | undefined;
  return surface?.content ?? [];
}

function firstGridInDoc(doc: ProseMirrorNode): ProseMirrorNode {
  let found: ProseMirrorNode | null = null;
  doc.descendants((node) => {
    if (node.type.name !== "grid") return true;
    found = node;
    return false;
  });
  if (!found) throw new Error("Could not find grid node");
  return found;
}

function cellBlockIds(cellNode: JSONContent): string[] {
  return (cellNode.content ?? [])
    .filter((child) => child.type === "test_block")
    .map((child) => child.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
}

function surfaceChildren(editor: Editor): JSONContent[] {
  const surface = editor.getJSON().content?.[0]?.content?.[0] as JSONContent | undefined;
  return surface?.content ?? [];
}

function blockAttrs(editor: Editor, id: string): Record<string, unknown> {
  const attrs: Record<string, unknown>[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "test_block" && node.attrs["id"] === id) {
      attrs.push({ ...node.attrs });
    }
    return true;
  });

  if (!attrs[0]) throw new Error(`Could not find block:${id}`);
  return attrs[0];
}

function blockIds(editor: Editor): string[] {
  const ids: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "test_block") return true;
    const id = node.attrs["id"];
    if (typeof id === "string") ids.push(id);
    return true;
  });

  return ids;
}

describe("grid command templates", () => {
  it("accepts only common vertical content positions for Cells", () => {
    expect(["top", "middle", "bottom"].every(isGridCellVerticalPosition)).toBe(true);
    expect(isGridCellVerticalPosition("stretch")).toBe(false);
  });

  it("repairs column widths to match the number of cells", () => {
    expect(normalizeColumnWidths([2, 1], 3)).toEqual([1, 1, 1]);
    expect(normalizeColumnWidths([2, 1], 2)).toEqual([2, 1]);
    expect(normalizeColumnWidths([2, 0], 2)).toEqual([1, 1]);
  });

  it("resizes adjacent column widths with a relative min-width clamp", () => {
    expect(resizeAdjacentColumnWidths([1, 1], 0, 0.5)).toEqual([1.5, 0.5]);
    expect(resizeAdjacentColumnWidths([1, 1], 0, 4)).toEqual([1.8, 0.2]);
    expect(resizeAdjacentColumnWidths([1, 1], 1, 0.5)).toBeNull();
    expect(resizeAdjacentColumnWidths([1, 1], 0, Number.NaN)).toBeNull();
  });

  it("creates a grid with editable empty cells", () => {
    const editor = makeEditor();

    const template = createGridTemplate(editor.schema, { columns: 3 });

    expect(template?.toJSON()).toMatchObject({
      type: "grid",
      attrs: { columnWidths: [1, 1, 1] },
      content: [
        { type: "cell", content: [{ type: "paragraph" }] },
        { type: "cell", content: [{ type: "paragraph" }] },
        { type: "cell", content: [{ type: "paragraph" }] },
      ],
    });
    expect(template && isGridCellEmpty(template.child(0))).toBe(true);
    expect(template?.toJSON().attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    const cellIds = (
      (template?.toJSON().content ?? []) as Array<{
        attrs?: Record<string, unknown>;
      }>
    ).map((cell) => cell.attrs?.["id"]);

    expect(cellIds).toEqual([
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
    ]);
    editor.destroy();
  });

  it("creates a grid with repaired column widths", () => {
    const editor = makeEditor();

    const template = createGridTemplate(editor.schema, {
      columns: 3,
      columnWidths: [2, 1],
    });

    expect(template?.toJSON().attrs).toMatchObject({
      columnWidths: [1, 1, 1],
    });
    editor.destroy();
  });

  it("rejects preset grids outside the supported cell count", () => {
    const editor = makeEditor();

    expect(createGridTemplate(editor.schema, { columns: 0 })).toBeNull();
    expect(createGridTemplate(editor.schema, { columns: 7 })).toBeNull();
    expect(createGridTemplate(editor.schema, { columns: 2.5 })).toBeNull();

    editor.destroy();
  });
});

describe("grid transaction commands", () => {
  it("builds a checked grid insert transaction without dispatching", () => {
    const editor = makeCourseEditor([block("after")]);

    const result = insertGridChecked({
      tr: editor.state.tr,
      schema: editor.schema,
      pos: surfaceInsertPos(editor),
      options: { columns: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(firstGridInDoc(result.tr.doc).childCount).toBe(3);
    expect(firstSurfaceContent(editor)).toHaveLength(1);

    editor.destroy();
  });

  it("rejects invalid checked grid insert inputs before dispatch", () => {
    const editor = makeCourseEditor([block("after")]);

    const invalidTemplate = insertGridChecked({
      tr: editor.state.tr,
      schema: editor.schema,
      pos: surfaceInsertPos(editor),
      options: { columns: 7 },
    });
    expect(invalidTemplate).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_grid_template" }),
    });

    const invalidPosition = insertGridChecked({
      tr: editor.state.tr,
      schema: editor.schema,
      pos: editor.state.doc.content.size + 10,
      options: { columns: 2 },
    });
    expect(invalidPosition).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_insert_position" }),
    });
    expect(firstSurfaceContent(editor)).toHaveLength(1);

    editor.destroy();
  });

  it("inserts a preset grid with equal widths", () => {
    const editor = makeCourseEditor([block("after")]);

    expect(insertGridAt(editor, surfaceInsertPos(editor), { columns: 4 })).toBe(true);

    const insertedGrid = firstGrid(editor);
    expect(insertedGrid.attrs).toMatchObject({
      columnWidths: [1, 1, 1, 1],
    });
    expect(insertedGrid.content).toHaveLength(4);
    expect(insertedGrid.content?.map((cellNode) => cellNode.type)).toEqual([
      "cell",
      "cell",
      "cell",
      "cell",
    ]);
    expect(
      insertedGrid.content?.every((cellNode) => cellNode.content?.[0]?.type === "paragraph"),
    ).toBe(true);

    editor.destroy();
  });

  it("treats blank textblocks as empty grid cell content", () => {
    const editor = makeCourseEditor([
      grid(
        [
          cell([paragraph()], { id: "blank-cell" }),
          cell([paragraph("content")], { id: "text-cell" }),
          cell([block("block")], { id: "block-cell" }),
        ],
        { id: "grid-1", columnWidths: [1, 1, 1] },
      ),
    ]);
    const gridNode = editor.state.doc.nodeAt(nodePos(editor, "grid", "grid-1"))!;

    expect(isGridCellEmpty(gridNode.child(0))).toBe(true);
    expect(isGridCellEmpty(gridNode.child(1))).toBe(false);
    expect(isGridCellEmpty(gridNode.child(2))).toBe(false);

    editor.destroy();
  });

  it("adds cells on either edge and renormalizes widths", () => {
    const editor = makeCourseEditor([
      grid([cell([block("a")], { id: "cell-a" }), cell([block("b")], { id: "cell-b" })], {
        id: "grid-1",
        columnWidths: [3, 1],
      }),
    ]);

    expect(addGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 0, "left")).toBe(true);
    expect(addGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 2, "right")).toBe(true);

    const cells = firstGrid(editor).content ?? [];
    expect(firstGrid(editor).attrs).toMatchObject({
      columnWidths: [1, 1, 1, 1],
    });
    expect(cells.map(cellBlockIds)).toEqual([[], ["a"], ["b"], []]);
    expect(cells[1]?.attrs?.["id"]).toBe("cell-a");
    expect(cells[2]?.attrs?.["id"]).toBe("cell-b");

    editor.destroy();
  });

  it("deletes a cell from a three-column grid and renormalizes widths", () => {
    const editor = makeCourseEditor([
      grid(
        [
          cell([block("a")], { id: "cell-a" }),
          cell([block("b")], { id: "cell-b" }),
          cell([block("c")], { id: "cell-c" }),
        ],
        { id: "grid-1", columnWidths: [2, 1, 1] },
      ),
    ]);

    expect(deleteGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 1)).toBe(true);

    const cells = firstGrid(editor).content ?? [];
    expect(firstGrid(editor).attrs).toMatchObject({ columnWidths: [1, 1] });
    expect(cells.map(cellBlockIds)).toEqual([["a"], ["c"]]);
    expect(cells.map((cellNode) => cellNode.attrs?.["id"])).toEqual(["cell-a", "cell-c"]);

    editor.destroy();
  });

  it("deletes a cell and renormalizes widths", () => {
    const editor = makeCourseEditor([
      grid(
        [
          cell([block("a")], { id: "cell-a" }),
          cell([block("b")], { id: "cell-b" }),
          cell([block("c")], { id: "cell-c" }),
        ],
        { id: "grid-1", columnWidths: [2, 1, 1] },
      ),
    ]);

    expect(deleteGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 1)).toBe(true);

    const cells = firstGrid(editor).content ?? [];
    expect(firstGrid(editor).attrs).toMatchObject({ columnWidths: [1, 1] });
    expect(cells.map(cellBlockIds)).toEqual([["a"], ["c"]]);
    editor.destroy();
  });

  it("deletes non-empty cells as an explicit destructive arrangement action", () => {
    const editor = makeCourseEditor([
      grid([cell([block("a")], { id: "cell-a" }), cell([block("b")], { id: "cell-b" })], {
        id: "grid-1",
        columnWidths: [1, 1],
      }),
    ]);

    expect(deleteGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 0)).toBe(true);

    expect(surfaceChildren(editor).map((node) => node.type)).toEqual(["test_block"]);
    expect(surfaceChildren(editor)[0]?.attrs?.["id"]).toBe("b");
    expect(blockIds(editor)).toEqual(["b"]);
    editor.destroy();
  });

  it("unwraps the remaining cell when deleting an empty cell from a two-column grid", () => {
    const editor = makeCourseEditor([
      grid([cell([], { id: "cell-empty" }), cell([block("b")], { id: "cell-b" })], {
        id: "grid-1",
        columnWidths: [1, 1],
      }),
    ]);

    expect(deleteGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 0)).toBe(true);

    expect(surfaceChildren(editor).map((node) => node.type)).toEqual(["test_block"]);
    expect(surfaceChildren(editor)[0]?.attrs?.["id"]).toBe("b");
    editor.destroy();
  });

  it("deletes a whole grid and all contained authored content", () => {
    const emptyEditor = makeCourseEditor([
      grid([cell([], { id: "cell-a" }), cell([], { id: "cell-b" })], {
        id: "grid-1",
        columnWidths: [1, 1],
      }),
    ]);
    const populatedEditor = makeCourseEditor([
      grid([cell([block("a")]), cell([])], {
        id: "grid-1",
        columnWidths: [1, 1],
      }),
    ]);

    expect(isGridEmpty(emptyEditor.state.doc.nodeAt(nodePos(emptyEditor, "grid"))!)).toBe(true);
    expect(deleteGridAt(emptyEditor, nodePos(emptyEditor, "grid", "grid-1"))).toBe(true);
    expect(surfaceChildren(emptyEditor).map((node) => node.type)).toEqual(["paragraph"]);
    expect(blockIds(emptyEditor)).toEqual([]);

    expect(deleteGridAt(populatedEditor, nodePos(populatedEditor, "grid", "grid-1"))).toBe(true);
    expect(surfaceChildren(populatedEditor).map((node) => node.type)).toEqual(["paragraph"]);
    expect(blockIds(populatedEditor)).toEqual([]);

    emptyEditor.destroy();
    populatedEditor.destroy();
  });

  it("sets vertical position on one cell or all cells without changing structure or content", () => {
    const editor = makeCourseEditor([
      grid(
        [
          cell(
            [
              {
                type: "test_block",
                attrs: { id: "a", marker: "alpha", horizontalAlignment: "right" },
              },
            ],
            { id: "cell-a" },
          ),
          cell([block("b", "beta")], { id: "cell-b" }),
        ],
        {
          id: "grid-1",
          columnWidths: [2, 1],
        },
      ),
    ]);

    expect(
      setGridCellVerticalPositionAt(editor, nodePos(editor, "grid", "grid-1"), 0, "middle"),
    ).toBe(true);
    expect((firstGrid(editor).content ?? [])[0]?.attrs).toMatchObject({
      id: "cell-a",
      verticalPosition: "middle",
    });
    expect(firstGrid(editor).attrs).toMatchObject({ id: "grid-1", columnWidths: [2, 1] });
    expect(blockAttrs(editor, "a")).toMatchObject({
      horizontalAlignment: "right",
      marker: "alpha",
    });

    expect(
      setAllGridCellsVerticalPositionAt(editor, nodePos(editor, "grid", "grid-1"), "bottom"),
    ).toBe(true);
    expect(
      (firstGrid(editor).content ?? []).map((node) => node.attrs?.["verticalPosition"]),
    ).toEqual(["bottom", "bottom"]);
    expect((firstGrid(editor).content ?? []).map((node) => node.attrs?.["id"])).toEqual([
      "cell-a",
      "cell-b",
    ]);
    expect(blockIds(editor)).toEqual(["a", "b"]);

    editor.destroy();
  });

  it("reduces grid cell count as an explicit destructive arrangement action", () => {
    const editor = makeCourseEditor([
      grid(
        [
          cell([block("a")], { id: "cell-a" }),
          cell([block("b")], { id: "cell-b" }),
          cell([block("c")], { id: "cell-c" }),
        ],
        { id: "grid-1", columnWidths: [1, 1, 1] },
      ),
    ]);

    expect(setGridCellCountAt(editor, nodePos(editor, "grid", "grid-1"), 2)).toBe(true);
    expect(firstGrid(editor).content).toHaveLength(2);
    expect(firstGrid(editor).attrs).toMatchObject({ columnWidths: [1, 1] });
    expect((firstGrid(editor).content ?? []).map(cellBlockIds)).toEqual([["a"], ["b"]]);
    expect(blockIds(editor)).toEqual(["a", "b"]);

    expect(addGridCellAtEnd(editor, nodePos(editor, "grid", "grid-1"))).toBe(true);
    expect(firstGrid(editor).content).toHaveLength(3);

    expect(setGridCellCountAt(editor, nodePos(editor, "grid", "grid-1"), 1)).toBe(false);
    expect(firstGrid(editor).content).toHaveLength(3);
    editor.destroy();
  });

  it("resizes adjacent grid columns without mutating contained block attrs", () => {
    const editor = makeCourseEditor([
      grid([cell([block("a", "alpha")]), cell([block("b", "beta")])], {
        id: "grid-1",
        columnWidths: [1, 1],
      }),
    ]);
    const before = blockAttrs(editor, "a");

    expect(resizeGridColumnsAt(editor, nodePos(editor, "grid", "grid-1"), 0, 0.5)).toBe(true);

    expect(firstGrid(editor).attrs).toMatchObject({ columnWidths: [1.5, 0.5] });
    expect(blockAttrs(editor, "a")).toEqual(before);

    editor.destroy();
  });

  it("rejects invalid grid command inputs before dispatch", () => {
    const editor = makeCourseEditor([
      grid([cell([block("a")]), cell([block("b")])], {
        id: "grid-1",
        columnWidths: [1, 1],
      }),
    ]);
    const before = editor.getJSON();

    expect(insertGridAt(editor, surfaceInsertPos(editor), { columns: 7 })).toBe(false);
    expect(addGridCellAt(editor, nodePos(editor, "grid", "grid-1"), -1, "left")).toBe(false);
    expect(deleteGridCellAt(editor, nodePos(editor, "grid", "grid-1"), 2)).toBe(false);
    expect(
      resizeGridColumnsAt(editor, nodePos(editor, "grid", "grid-1"), 0, Number.POSITIVE_INFINITY),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });
});
