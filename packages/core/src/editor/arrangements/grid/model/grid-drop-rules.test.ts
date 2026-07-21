// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";

import { CellAuthoringNode, GridAuthoringNode } from "../authoring/grid-nodes";
import {
  buildGridBesideDropTransaction,
  canCreateSiblingGridDrop,
  canUseGridMovementSource,
} from "./grid-drop-rules";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const TestBlockNode = Node.create({
  name: "test_block",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      frame: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-frame");
          return raw ? JSON.parse(raw) : null;
        },
        renderHTML: (attrs: { frame?: unknown }) =>
          attrs.frame ? { "data-frame": JSON.stringify(attrs.frame) } : {},
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-block": "" }];
  },
});

function block(id: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "test_block", attrs: { id, ...attrs } };
}

function resizedBlock(id: string): JSONContent {
  return block(id, {
    frame: {
      align: "center",
      aspectRatio: 1.4,
      widthMode: "percent",
      widthPercent: 45,
    },
  });
}

function section(content: JSONContent[]): JSONContent {
  return { type: "section", content };
}

function layout(content: JSONContent[]): JSONContent {
  return { type: "layout", content: [section(content)] };
}

function cell(content: JSONContent[]): JSONContent {
  return { type: "cell", content };
}

function grid(cells: JSONContent[]): JSONContent {
  return {
    type: "grid",
    attrs: { columnWidths: cells.map(() => 1) },
    content: cells,
  };
}

function makeEditor(content: JSONContent[]) {
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

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  return found;
}

function surfaceChildrenFromDoc(editor: Editor, doc = editor.state.doc): JSONContent[] {
  return doc.toJSON().content?.[0]?.content?.[0]?.content ?? [];
}

function gridCellsFromDoc(editor: Editor, doc = editor.state.doc): JSONContent[] {
  const gridNode = surfaceChildrenFromDoc(editor, doc).find((child) => child.type === "grid");
  return gridNode?.content ?? [];
}

function cellBlockIds(cellNode: JSONContent): string[] {
  return (cellNode.content ?? [])
    .filter((child) => child.type === "test_block")
    .map((child) => child.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
}

function cellBlockAttrs(cellNode: JSONContent): Record<string, unknown>[] {
  return (cellNode.content ?? [])
    .filter((child) => child.type === "test_block")
    .map((child) => child.attrs ?? {});
}

describe("grid drop rules", () => {
  it("allows grid movement sources only for normal authored blocks", () => {
    const editor = makeEditor([
      block("a"),
      layout([block("layout-child")]),
      grid([cell([block("b")])]),
    ]);

    expect(
      canUseGridMovementSource(editor.state.doc.nodeAt(nodePos(editor, "test_block", "a"))),
    ).toBe(true);
    expect(canUseGridMovementSource(editor.state.doc.nodeAt(nodePos(editor, "layout")))).toBe(true);
    expect(canUseGridMovementSource(editor.state.doc.nodeAt(nodePos(editor, "section")))).toBe(
      false,
    );
    expect(canUseGridMovementSource(editor.state.doc.nodeAt(nodePos(editor, "grid")))).toBe(false);
    expect(canUseGridMovementSource(editor.state.doc.nodeAt(nodePos(editor, "cell")))).toBe(false);
    editor.destroy();
  });

  it("allows side-drop grid creation only between sibling block nodes", () => {
    const editor = makeEditor([block("a"), block("b"), layout([block("c")])]);
    const source = editor.state.doc.nodeAt(nodePos(editor, "test_block", "a"));
    const blockTarget = editor.state.doc.nodeAt(nodePos(editor, "test_block", "b"));
    const layoutTarget = editor.state.doc.nodeAt(nodePos(editor, "layout"));

    expect(canCreateSiblingGridDrop(source, blockTarget)).toBe(true);
    expect(canCreateSiblingGridDrop(source, layoutTarget)).toBe(false);
    expect(canCreateSiblingGridDrop(layoutTarget, blockTarget)).toBe(false);
    editor.destroy();
  });

  it("builds a transaction that creates a sibling grid without a row node", () => {
    const editor = makeEditor([block("a"), block("b"), block("c")]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "test_block", "b");
    const sourceNode = editor.state.doc.nodeAt(sourcePos)!;
    const targetNode = editor.state.doc.nodeAt(targetPos)!;

    const tr = buildGridBesideDropTransaction({
      editor,
      side: "left",
      sourceNode,
      sourcePos,
      targetNode,
      targetPos,
    });

    expect(surfaceChildrenFromDoc(editor, tr?.doc).map((node) => node.type)).toEqual([
      "grid",
      "test_block",
    ]);
    expect(gridCellsFromDoc(editor, tr?.doc).map(cellBlockIds)).toEqual([["a"], ["b"]]);
    expect(JSON.stringify(tr?.doc.toJSON())).not.toContain('"row"');
    editor.destroy();
  });

  it("builds a transaction that inserts beside an existing grid cell edge", () => {
    const editor = makeEditor([block("a"), grid([cell([block("b")]), cell([block("c")])])]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "cell");
    const sourceNode = editor.state.doc.nodeAt(sourcePos)!;
    const targetNode = editor.state.doc.nodeAt(targetPos)!;

    const tr = buildGridBesideDropTransaction({
      editor,
      side: "right",
      sourceNode,
      sourcePos,
      targetNode,
      targetPos,
    });

    expect(gridCellsFromDoc(editor, tr?.doc).map(cellBlockIds)).toEqual([["b"], ["a"], ["c"]]);
    expect(surfaceChildrenFromDoc(editor, tr?.doc)[0]?.attrs).toMatchObject({
      columnWidths: [1, 1, 1],
    });
    editor.destroy();
  });

  it("inserts a framed block beside a grid cell without mutating grid column widths to pixels", () => {
    const editor = makeEditor([
      resizedBlock("a"),
      {
        type: "grid",
        attrs: { columnWidths: [2, 1] },
        content: [cell([block("b")]), cell([block("c")])],
      },
    ]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "cell");
    const sourceNode = editor.state.doc.nodeAt(sourcePos)!;
    const targetNode = editor.state.doc.nodeAt(targetPos)!;

    const tr = buildGridBesideDropTransaction({
      editor,
      side: "right",
      sourceNode,
      sourcePos,
      targetNode,
      targetPos,
    });

    const cells = gridCellsFromDoc(editor, tr?.doc);
    expect(cells.map(cellBlockIds)).toEqual([["b"], ["a"], ["c"]]);
    expect(cellBlockAttrs(cells[1] ?? { type: "cell" })[0]?.["frame"]).toEqual(
      sourceNode.attrs["frame"],
    );
    expect(surfaceChildrenFromDoc(editor, tr?.doc)[0]?.attrs).toMatchObject({
      columnWidths: [1, 1, 1],
    });
    editor.destroy();
  });

  it("does not build a grid cell edge transaction for section movement", () => {
    const editor = makeEditor([
      layout([block("a")]),
      grid([cell([block("b")]), cell([block("c")])]),
    ]);
    const sourcePos = nodePos(editor, "section");
    const targetPos = nodePos(editor, "cell");
    const sourceNode = editor.state.doc.nodeAt(sourcePos)!;
    const targetNode = editor.state.doc.nodeAt(targetPos)!;

    const tr = buildGridBesideDropTransaction({
      editor,
      side: "right",
      sourceNode,
      sourcePos,
      targetNode,
      targetPos,
    });

    expect(tr).toBeNull();
    editor.destroy();
  });
});
