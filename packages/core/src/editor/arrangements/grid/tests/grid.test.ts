// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Fragment } from "@tiptap/pm/model";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  ARRANGEMENT_CONTENT,
  CELL_ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { RESIZE_GESTURE_ACTIVE_ATTR } from "@/editor/interactions/gesture/editor-resize-gesture";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { AUTHORING_CHROME_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_FRAME_ATTR,
  AUTHORING_CHROME_ACTIVE_ATTR,
  AUTHORING_ANCHOR_ATTR,
} from "@/editor/interactions/dom/authoring-frame";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { AuthoringContentChrome } from "@/editor/shell/authoring/AuthoringContentChrome";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import {
  resolveStructuralBubbleAnchorVirtualElement,
  resolveStructuralInteractionBubbleModel,
} from "@/editor/shell/bubbles/interaction/StructuralInteractionBubbleMenu";
import { createStructuralInteractionBubbleRendererMap } from "@/editor/interactions/interaction-bubble";

import { createGridAuthoringNodes } from "../authoring/grid-nodes";
import { CellRuntimeNode, GridRuntimeNode } from "../runtime/grid-nodes";
import { gridStructuralInteractionBubbleRendererBindings } from "../authoring/grid-bubble-controls";
import { isGridCellChromeActive, resolveGridChromeState } from "../authoring/grid-chrome-state";
import { gridCellPositionAt } from "../authoring/grid-menu-target";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const TEST_INNER_BLOCK = "grid_selection_test_block";

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  defineBlock({ nodeType: TEST_INNER_BLOCK }),
]);
const { CellAuthoringNode, GridAuthoringNode } = createGridAuthoringNodes(testBlockRegistry);
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: testBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});
const gridStructuralRenderers = createStructuralInteractionBubbleRendererMap(
  gridStructuralInteractionBubbleRendererBindings,
);

const TestInnerBlockNode = Node.create({
  name: TEST_INNER_BLOCK,
  group: "block",
  content: "paragraph+",
  selectable: true,

  parseHTML() {
    return [{ tag: "section[data-grid-selection-test-block]" }];
  },

  renderHTML() {
    return ["section", { "data-grid-selection-test-block": "" }, 0];
  },
});

const TestLayoutNode = Node.create({
  name: "testLayout",
  group: CELL_ARRANGEMENT_CONTENT,
  content: "paragraph+",
  parseHTML() {
    return [{ tag: "div[data-test-layout]" }];
  },
  renderHTML() {
    return ["div", { "data-test-layout": "" }, 0];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      GridAuthoringNode,
      CellAuthoringNode,
      TestLayoutNode,
    ],
  });
}

function makeCourseEditor(editable = true) {
  return makeCourseEditorWithSurfaceContent(
    [
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
    editable,
  );
}

function renderAuthoringShell(editor: Editor) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    bottom: 640,
    height: 600,
    left: 20,
    right: 1020,
    top: 40,
    width: 1000,
    x: 20,
    y: 40,
    toJSON: () => ({}),
  }));
  const rendered = render(
    createElement(AuthoringContentChrome, {
      blockDefinitions: testBlockRegistry,
      children: createElement(EditorContent, { editor }),
      editable: true,
      editor,
      surfaceAuthoringChrome: builtInSurfaceAuthoringChromeResolver,
      surfaceVariants: builtInSurfaceVariantRegistry,
    }),
  );
  editor.view.dom.focus();
  return rendered;
}

function makeCourseEditorWithSurfaceContent(content: JSONContent[], editable = true) {
  const editor = new Editor({
    editable,
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
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestInnerBlockNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content,
            },
          ],
        },
      ],
    },
  });
  return editor;
}

interface GridMenuTargetInput {
  kind: "grid" | "cell";
  gridPos: number;
  cellIndex?: number;
}

function gridMenuRefForTest(
  editor: Editor,
  target: GridMenuTargetInput,
): InteractionTargetRef | null {
  const grid = editor.state.doc.nodeAt(target.gridPos);
  if (!grid || grid.type.name !== "grid") return null;

  if (target.kind === "grid") {
    const gridId = readTestStableId(grid.attrs["id"]);
    return {
      ...(gridId ? { id: gridId } : {}),
      kind: InteractionTargetKind.Grid,
      pos: target.gridPos,
    };
  }

  const cellIndex = target.cellIndex ?? -1;
  const pos = gridCellPositionAt(editor.state.doc, target.gridPos, cellIndex);
  if (pos === null) return null;
  const cell = editor.state.doc.nodeAt(pos);
  if (!cell || cell.type.name !== "cell") return null;
  const cellId = readTestStableId(cell.attrs["id"]);

  return {
    ...(cellId ? { id: cellId } : {}),
    kind: InteractionTargetKind.Cell,
    pos,
  };
}

function openGridMenuTargetForTest(editor: Editor, target: GridMenuTargetInput): boolean {
  const ref = gridMenuRefForTest(editor, target);
  if (!ref) return false;
  return createInteractionOwnerCommandPorts(editor.view, testBlockRegistry).openMenu(ref);
}

function menuOwnerForTest(editor: Editor): InteractionTargetRef | null {
  return interactionOwnerPluginKey.getState(editor.state)?.menuOwner ?? null;
}

function explicitOwnerForTest(editor: Editor): InteractionTargetRef | null {
  return interactionOwnerPluginKey.getState(editor.state)?.explicitOwner ?? null;
}

function resolveGridMenuModelForTest(editor: Editor) {
  return resolveStructuralInteractionBubbleModel(
    editor,
    publishInteractionOwnerSnapshot(editor.state, null, {
      blockDefinitions: testBlockRegistry,
    }),
    alignmentTargetPort,
    gridStructuralRenderers,
  );
}

function resolveGridMenuVirtualElementForTest(editor: Editor) {
  return resolveStructuralBubbleAnchorVirtualElement(
    editor,
    resolveGridMenuModelForTest(editor)?.descriptor ?? null,
  );
}

function readTestStableId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function makeRuntimeCourseEditorWithSurfaceContent(content: JSONContent[]) {
  return new Editor({
    editable: false,
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
      GridRuntimeNode,
      CellRuntimeNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestInnerBlockNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content,
            },
          ],
        },
      ],
    },
  });
}

function firstNodePosByAttr(
  editor: Editor,
  nodeType: string,
  attr: string,
  value: unknown,
): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType || node.attrs[attr] !== value) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Missing ${nodeType} node with ${attr}`);
  return found;
}

function firstNodePos(editor: Editor, nodeType: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Missing ${nodeType} node`);
  return found;
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;

    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;

    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Missing text: ${text}`);
  return found;
}

describe("grid arrangement nodes", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("defines grid and cell schema placement rules", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const gridType = schema.nodes.grid;
    const cellType = schema.nodes.cell;

    expect(gridType?.spec.group).toBe(`${ARRANGEMENT_CONTENT} ${SECTION_ARRANGEMENT_CONTENT}`);
    expect(gridType?.spec.content).toBe("cell+");
    expect(gridType?.spec.selectable).toBe(false);
    expect(gridType?.spec.draggable).toBe(false);
    expect(cellType?.spec.content).toBe(`(block | ${CELL_ARRANGEMENT_CONTENT})+`);
    expect(cellType?.spec.selectable).toBe(false);
    expect(cellType?.spec.draggable).toBe(false);

    editor.destroy();
  });

  it("defines stable id attrs for grids and cells", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const gridType = schema.nodes.grid!;
    const cellType = schema.nodes.cell!;

    expect(gridType.create().attrs["id"]).toBeNull();
    expect(cellType.create().attrs["id"]).toBeNull();

    editor.destroy();
  });

  it("allows layouts inside cells and rejects nested grids inside cells", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const gridType = schema.nodes.grid!;
    const cellType = schema.nodes.cell!;
    const layoutType = schema.nodes.testLayout!;

    const paragraph = paragraphType.create();
    const layout = layoutType.create(null, paragraphType.create());
    const cellWithParagraph = cellType.create(null, paragraph);
    const nestedGrid = gridType.create(null, cellWithParagraph);

    expect(cellType.validContent(Fragment.from(layout))).toBe(true);
    expect(cellType.validContent(Fragment.from(nestedGrid))).toBe(false);

    editor.destroy();
  });

  it("requires cells to contain an editable anchor", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const cellType = schema.nodes.cell!;
    const paragraphType = schema.nodes.paragraph!;

    expect(cellType.validContent(Fragment.empty)).toBe(false);
    expect(cellType.validContent(Fragment.from(paragraphType.create()))).toBe(true);

    editor.destroy();
  });

  it("allows multiple blocks inside one cell", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const cellType = schema.nodes.cell!;

    const firstParagraph = paragraphType.create();
    const secondParagraph = paragraphType.create();

    expect(cellType.validContent(Fragment.fromArray([firstParagraph, secondParagraph]))).toBe(true);

    editor.destroy();
  });

  it("renders explicit authoring frames for grid and every cell", async () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1, 1, 1], id: "grid-contract" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-contract-a" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-contract-b" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-contract-c" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);

    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="grid"]')).not.toBeNull();
    });

    const gridElement = document.body.querySelector('[data-authoring-frame="grid"]');
    const cellElements = Array.from(
      document.body.querySelectorAll('[data-authoring-frame="cell"]'),
    );

    expect(gridElement?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("grid");
    expect(gridElement?.getAttribute("data-node")).toBe("grid");
    expect(gridElement?.getAttribute("data-definition")).toBe("grid");
    expect(gridElement?.getAttribute("data-id")).toBe("grid-contract");
    expect(cellElements).toHaveLength(3);

    for (const [index, cellElement] of cellElements.entries()) {
      const id = ["cell-contract-a", "cell-contract-b", "cell-contract-c"][index];

      expect(cellElement.getAttribute(AUTHORING_FRAME_ATTR)).toBe("cell");
      expect(cellElement.getAttribute("data-node")).toBe("cell");
      expect(cellElement.getAttribute("data-definition")).toBe("cell");
      expect(cellElement.getAttribute("data-id")).toBe(id);
      expect(cellElement.getAttribute("data-empty")).toBe("true");
    }

    editor.destroy();
  });

  it("renders normalized CSS grid columns without grid or cell movement handles", async () => {
    const editor = makeCourseEditor();
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-column-content]")).not.toBeNull();
    });

    const gridContent = document.body.querySelector("[data-grid-column-content]");
    const gridElement = document.body.querySelector('[data-authoring-frame="grid"]');
    const cellElement = document.body.querySelector('[data-authoring-frame="cell"]');
    const gridMenuTrigger = document.body.querySelector("[data-grid-menu-trigger]");
    const addCellEndTrigger = document.body.querySelector("[data-grid-add-cell-end]");
    const cellMenuTrigger = document.body.querySelector("[data-grid-cell-menu-trigger]");
    const controls = document.body.querySelector("[data-grid-column-controls]");

    expect(gridElement?.getAttribute("style")).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(gridElement?.getAttribute("class")).toContain("sc-grid-authoring");
    expect(gridElement?.getAttribute("class")).toContain("sc-grid-authoring--editable");
    expect(gridElement?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(cellElement?.getAttribute("class")).toContain("sc-grid-cell-authoring");
    expect(cellElement?.getAttribute("class")).toContain("sc-grid-cell-authoring--editable");
    expect(cellElement?.getAttribute("data-vertical-content-position")).toBe("top");
    expect(cellElement?.getAttribute("class")).not.toContain("rounded-md");
    expect(cellElement?.getAttribute("class")).not.toContain("border-dashed");
    expect(gridMenuTrigger).toBeNull();
    expect(addCellEndTrigger).toBeNull();
    expect(cellMenuTrigger).toBeNull();
    expect(gridContent?.getAttribute("class")).toContain("sc-grid-authoring__content");
    expect(controls).toBeNull();
    expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();

    editor.destroy();
  });

  it("renders runtime grid and cells without authoring chrome", async () => {
    const editor = makeRuntimeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [2, 1], id: "grid-runtime" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-runtime-a", verticalPosition: "middle" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-runtime-b" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);

    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-node="grid"]')).not.toBeNull();
    });

    const gridElement = document.body.querySelector('[data-node="grid"]');
    const cellElements = Array.from(document.body.querySelectorAll('[data-node="cell"]'));

    expect(gridElement?.getAttribute("data-id")).toBe("grid-runtime");
    expect(gridElement?.getAttribute("data-authoring-frame")).toBeNull();
    expect(gridElement?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(gridElement?.getAttribute("class")).toContain("sc-grid");
    expect(gridElement?.getAttribute("style")).toContain(
      "grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);",
    );
    expect(cellElements).toHaveLength(2);
    expect(cellElements[0]?.getAttribute("data-id")).toBe("cell-runtime-a");
    expect(cellElements[0]?.getAttribute("data-vertical-content-position")).toBe("middle");
    expect(cellElements[0]?.getAttribute("data-authoring-frame")).toBeNull();
    expect(cellElements[0]?.getAttribute("class")).toContain("sc-grid-cell");
    expect(cellElements[1]?.getAttribute("data-vertical-content-position")).toBe("top");
    expect(document.body.querySelector("[data-grid-menu-trigger]")).toBeNull();
    expect(document.body.querySelector("[data-grid-add-cell-end]")).toBeNull();
    expect(document.body.querySelector("[data-grid-column-resize-handle]")).toBeNull();
    expect(document.body.querySelector("[data-grid-cell-menu-trigger]")).toBeNull();

    editor.destroy();
  });

  it("reveals the editable grid outline for grid selection state", async () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Outside grid" }],
      },
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Inside grid" }],
              },
            ],
          },
        ],
      },
    ]);
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="grid"]')).not.toBeNull();
    });

    const gridElement = document.body.querySelector('[data-authoring-frame="grid"]');
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    editor.commands.focus();
    editor.commands.setTextSelection(textPos(editor, "Outside grid") + 2);

    await waitFor(() => {
      expect(gridElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBeNull();
    });

    editor.commands.setTextSelection(textPos(editor, "Inside grid") + 2);

    await waitFor(() => {
      expect(gridElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBe("");
    });

    editor.commands.setTextSelection(textPos(editor, "Outside grid") + 2);
    expect(openGridMenuTargetForTest(editor, { kind: "grid", gridPos })).toBe(true);

    await waitFor(() => {
      expect(gridElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBe("");
    });

    editor.destroy();
  });

  it("drives grid outline and cell active chrome from shared menu targets", async () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    render(createElement(EditorContent, { editor }));
    editor.view.dom.focus();

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="grid"]')).not.toBeNull();
      expect(document.body.querySelector('[data-authoring-frame="cell"]')).not.toBeNull();
    });

    const gridElement = document.body.querySelector('[data-authoring-frame="grid"]');
    const cellElement = document.body.querySelector('[data-authoring-frame="cell"]');
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    expect(openGridMenuTargetForTest(editor, { kind: "grid", gridPos })).toBe(true);

    await waitFor(() => {
      expect(gridElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBe("");
    });

    expect(
      openGridMenuTargetForTest(editor, {
        cellIndex: 0,
        gridPos,
        kind: "cell",
      }),
    ).toBe(true);

    await waitFor(() => {
      expect(gridElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBe("");
      expect(cellElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBe("");
    });

    editor.destroy();
  });

  it("resolves grid chrome state from selection and shared menu targets", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Outside grid" }],
      },
      {
        type: "grid",
        attrs: { columnWidths: [1, 1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Inside first cell" }],
              },
            ],
          },
          {
            type: "cell",
            attrs: { id: "cell-b" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");
    const cellAPos = firstNodePosByAttr(editor, "cell", "id", "cell-a");
    const cellBPos = firstNodePosByAttr(editor, "cell", "id", "cell-b");

    editor.commands.setTextSelection(textPos(editor, "Outside grid") + 2);
    expect(resolveGridChromeState(editor.state, gridPos, testBlockRegistry)).toEqual({
      cellChromeIndex: null,
      outlineActive: false,
      showGridLevelTriggers: false,
    });

    editor.commands.setTextSelection(textPos(editor, "Inside first cell") + 2);
    expect(resolveGridChromeState(editor.state, gridPos, testBlockRegistry)).toEqual({
      cellChromeIndex: 0,
      outlineActive: true,
      showGridLevelTriggers: true,
    });
    expect(
      resolveGridChromeState(editor.state, gridPos, testBlockRegistry, {
        selectionActive: false,
      }),
    ).toEqual({
      cellChromeIndex: 0,
      outlineActive: false,
      showGridLevelTriggers: true,
    });

    expect(
      openGridMenuTargetForTest(editor, {
        cellIndex: 1,
        gridPos,
        kind: "cell",
      }),
    ).toBe(true);
    expect(resolveGridChromeState(editor.state, gridPos, testBlockRegistry)).toEqual({
      cellChromeIndex: 1,
      outlineActive: true,
      showGridLevelTriggers: true,
    });
    expect(isGridCellChromeActive(editor.state, cellAPos, testBlockRegistry)).toBe(false);
    expect(isGridCellChromeActive(editor.state, cellBPos, testBlockRegistry)).toBe(true);

    editor.destroy();
  });

  it("resolves active nested blocks as outline-active while hiding grid-level triggers", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [
              {
                type: TEST_INNER_BLOCK,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Inner block" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    editor.commands.setTextSelection(textPos(editor, "Inner block") + 2);

    expect(resolveGridChromeState(editor.state, gridPos, testBlockRegistry)).toEqual({
      cellChromeIndex: null,
      outlineActive: true,
      showGridLevelTriggers: true,
    });
    expect(
      resolveGridChromeState(editor.state, gridPos, testBlockRegistry, {
        selectionActive: false,
      }),
    ).toEqual({
      cellChromeIndex: null,
      outlineActive: false,
      showGridLevelTriggers: true,
    });

    editor.destroy();
  });

  it("drops grid chrome after a cell menu is dismissed with selection elsewhere", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Outside grid" }],
      },
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    editor.commands.setTextSelection(textPos(editor, "Outside grid") + 2);
    expect(
      openGridMenuTargetForTest(editor, {
        cellIndex: 0,
        gridPos,
        kind: "cell",
      }),
    ).toBe(true);
    expect(resolveGridChromeState(editor.state, gridPos, testBlockRegistry)).toEqual({
      cellChromeIndex: 0,
      outlineActive: true,
      showGridLevelTriggers: true,
    });

    expect(
      createInteractionOwnerCommandPorts(editor.view, testBlockRegistry).dismissInteraction(),
    ).toBe(true);
    expect(resolveGridChromeState(editor.state, gridPos, testBlockRegistry)).toEqual({
      cellChromeIndex: null,
      outlineActive: false,
      showGridLevelTriggers: false,
    });

    editor.destroy();
  });

  it("keeps grid-level floating controls visible when a registered block inside the grid is active", async () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Outside grid" }],
      },
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Cell text" }],
              },
              {
                type: TEST_INNER_BLOCK,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Inner block" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    renderAuthoringShell(editor);

    editor.commands.focus();
    editor.commands.setTextSelection(textPos(editor, "Cell text") + 2);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
      expect(document.body.querySelector("[data-grid-add-cell-end]")).not.toBeNull();
      expect(document.body.querySelector("[data-grid-cell-menu-trigger]")).not.toBeNull();
    });

    editor.commands.setTextSelection(textPos(editor, "Inner block") + 2);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
      expect(document.body.querySelector("[data-grid-add-cell-end]")).not.toBeNull();
      expect(document.body.querySelector("[data-grid-cell-menu-trigger]")).toBeNull();
    });

    editor.destroy();
  });

  it("opens grid menu targets from grid and cell affordances", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
      expect(document.body.querySelector("[data-grid-cell-menu-trigger]")).not.toBeNull();
    });

    const gridTrigger = document.body.querySelector("[data-grid-menu-trigger]")!;
    const gridAnchorId = gridTrigger.getAttribute(AUTHORING_ANCHOR_ATTR);
    if (!gridAnchorId) throw new Error("Missing grid trigger anchor id");
    expect(gridAnchorId).toBe("grid-menu:grid-a");
    fireEvent.mouseDown(gridTrigger);
    fireEvent.click(gridTrigger);
    expect(menuOwnerForTest(editor)).toMatchObject({
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
    });
    expect(resolveGridMenuVirtualElementForTest(editor)?.contextElement).toBe(
      document.body.querySelector('[data-authoring-frame="grid"][data-id="grid-a"]'),
    );
    fireEvent.mouseDown(gridTrigger);
    fireEvent.click(gridTrigger);
    expect(menuOwnerForTest(editor)).toBeNull();
    fireEvent.mouseDown(gridTrigger);
    fireEvent.click(gridTrigger);
    expect(menuOwnerForTest(editor)).toMatchObject({
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
    });

    const cellTrigger = document.body.querySelector("[data-grid-cell-menu-trigger]")!;
    const cellAnchorId = cellTrigger.getAttribute(AUTHORING_ANCHOR_ATTR);
    if (!cellAnchorId) throw new Error("Missing cell trigger anchor id");
    expect(cellAnchorId).toBe("cell-menu:cell-a");
    fireEvent.mouseDown(cellTrigger);
    fireEvent.click(cellTrigger);
    expect(menuOwnerForTest(editor)).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    const cellModel = resolveGridMenuModelForTest(editor);
    expect(
      cellModel?.descriptor.kind === InteractionTargetKind.Cell
        ? cellModel.descriptor.cellIndex
        : null,
    ).toBe(0);
    expect(resolveGridMenuVirtualElementForTest(editor)?.contextElement).toBe(
      document.body.querySelector('[data-authoring-frame="cell"][data-id="cell-a"]'),
    );
    fireEvent.mouseDown(cellTrigger);
    fireEvent.click(cellTrigger);
    expect(menuOwnerForTest(editor)).toBeNull();

    editor.destroy();
  });

  it("keeps grid and cell menu bubbles closed for structural activation", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="grid"]')).not.toBeNull();
      expect(document.body.querySelector('[data-authoring-frame="cell"]')).not.toBeNull();
    });

    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();

    fireEvent.mouseDown(document.body.querySelector('[data-authoring-frame="cell"]')!);

    expect(explicitOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Cell,
    });
    expect(menuOwnerForTest(editor)).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();

    fireEvent.mouseDown(document.body.querySelector('[data-authoring-frame="grid"]')!);

    expect(explicitOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Grid,
    });
    expect(menuOwnerForTest(editor)).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();

    editor.destroy();
  });

  it("keeps a cell grid menu target attached to the same cell when cells are inserted before it", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1, 1, 1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-b" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-c" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePos(editor, "grid");
    const cellBPos = firstNodePosByAttr(editor, "cell", "id", "cell-b");

    expect(
      openGridMenuTargetForTest(editor, {
        kind: "cell",
        gridPos,
        cellIndex: 1,
      }),
    ).toBe(true);

    const insertedCell = editor.schema.nodes.cell?.create(
      { id: "cell-inserted" },
      editor.schema.nodes.paragraph?.create(),
    );
    if (!insertedCell) throw new Error("Missing inserted cell");

    editor.view.dispatch(editor.state.tr.insert(cellBPos, insertedCell));

    expect(menuOwnerForTest(editor)).toMatchObject({
      id: "cell-b",
      kind: InteractionTargetKind.Cell,
    });
    const model = resolveGridMenuModelForTest(editor);
    expect(
      model?.descriptor.kind === InteractionTargetKind.Cell ? model.descriptor.cellIndex : null,
    ).toBe(2);

    editor.destroy();
  });

  it("preserves stable grid identity on grid and cell grid menu targets", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1, 1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-b" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    expect(
      openGridMenuTargetForTest(editor, {
        kind: "grid",
        gridPos,
      }),
    ).toBe(true);
    expect(menuOwnerForTest(editor)).toMatchObject({
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
    });

    expect(
      openGridMenuTargetForTest(editor, {
        cellIndex: 1,
        gridPos,
        kind: "cell",
      }),
    ).toBe(true);
    expect(menuOwnerForTest(editor)).toMatchObject({
      id: "cell-b",
      kind: InteractionTargetKind.Cell,
    });
    const cellModel = resolveGridMenuModelForTest(editor);
    if (cellModel?.descriptor.kind !== InteractionTargetKind.Cell) {
      throw new Error("expected cell descriptor");
    }
    expect(cellModel.descriptor.cellIndex).toBe(1);
    expect(cellModel.descriptor.gridId).toBe("grid-a");

    editor.destroy();
  });

  it("clears grid menu targets when another grid replaces the original position", () => {
    const gridEditor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(gridEditor, "grid", "id", "grid-a");
    const gridNode = gridEditor.state.doc.nodeAt(gridPos);
    const replacementGrid = gridEditor.schema.nodes.grid?.create(
      { columnWidths: [1], id: "grid-b" },
      gridEditor.schema.nodes.cell?.create(
        { id: "cell-a" },
        gridEditor.schema.nodes.paragraph?.create(),
      ),
    );
    if (!gridNode || !replacementGrid) throw new Error("Missing grid nodes");

    expect(
      openGridMenuTargetForTest(gridEditor, {
        gridPos,
        kind: "grid",
      }),
    ).toBe(true);

    gridEditor.view.dispatch(
      gridEditor.state.tr.replaceWith(gridPos, gridPos + gridNode.nodeSize, replacementGrid),
    );
    expect(menuOwnerForTest(gridEditor)).toBeNull();
    gridEditor.destroy();

    const cellEditor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const cellGridPos = firstNodePosByAttr(cellEditor, "grid", "id", "grid-a");
    const cellGridNode = cellEditor.state.doc.nodeAt(cellGridPos);
    const replacementCellGrid = cellEditor.schema.nodes.grid?.create(
      { columnWidths: [1], id: "grid-b" },
      cellEditor.schema.nodes.cell?.create(
        { id: "cell-x" },
        cellEditor.schema.nodes.paragraph?.create(),
      ),
    );
    if (!cellGridNode || !replacementCellGrid) {
      throw new Error("Missing cell grid nodes");
    }

    expect(
      openGridMenuTargetForTest(cellEditor, {
        cellIndex: 0,
        gridPos: cellGridPos,
        kind: "cell",
      }),
    ).toBe(true);

    cellEditor.view.dispatch(
      cellEditor.state.tr.replaceWith(
        cellGridPos,
        cellGridPos + cellGridNode.nodeSize,
        replacementCellGrid,
      ),
    );
    expect(menuOwnerForTest(cellEditor)).toBeNull();
    cellEditor.destroy();
  });

  it("shows the arrangement menu for an active editable grid target through chrome policy", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    expect(
      openGridMenuTargetForTest(editor, {
        gridPos,
        kind: "grid",
      }),
    ).toBe(true);
    expect(resolveGridMenuModelForTest(editor)).not.toBeNull();

    editor.destroy();
  });

  it("suppresses the arrangement menu while resize owns the transient interaction", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");

    expect(
      openGridMenuTargetForTest(editor, {
        gridPos,
        kind: "grid",
      }),
    ).toBe(true);
    expect(resolveGridMenuModelForTest(editor)).not.toBeNull();

    editor.view.dom.setAttribute(RESIZE_GESTURE_ACTIVE_ATTR, "");

    expect(resolveGridMenuModelForTest(editor)).toBeNull();

    editor.view.dom.removeAttribute(RESIZE_GESTURE_ACTIVE_ATTR);

    expect(resolveGridMenuModelForTest(editor)).not.toBeNull();

    editor.destroy();
  });

  it("clears grid menu targets when their grid or cell is deleted", () => {
    const editor = makeCourseEditorWithSurfaceContent([
      {
        type: "grid",
        attrs: { columnWidths: [1, 1], id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "cell",
            attrs: { id: "cell-b" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const gridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");
    const cellBPos = firstNodePosByAttr(editor, "cell", "id", "cell-b");
    const cellB = editor.state.doc.nodeAt(cellBPos);
    if (!cellB) throw new Error("Missing cell-b");

    expect(
      openGridMenuTargetForTest(editor, {
        cellIndex: 1,
        gridPos,
        kind: "cell",
      }),
    ).toBe(true);

    editor.view.dispatch(editor.state.tr.delete(cellBPos, cellBPos + cellB.nodeSize));
    expect(menuOwnerForTest(editor)).toBeNull();

    const nextGridPos = firstNodePosByAttr(editor, "grid", "id", "grid-a");
    const gridNode = editor.state.doc.nodeAt(nextGridPos);
    if (!gridNode) throw new Error("Missing grid-a");

    expect(
      openGridMenuTargetForTest(editor, {
        gridPos: nextGridPos,
        kind: "grid",
      }),
    ).toBe(true);

    editor.view.dispatch(editor.state.tr.delete(nextGridPos, nextGridPos + gridNode.nodeSize));
    expect(menuOwnerForTest(editor)).toBeNull();

    editor.destroy();
  });

  it("falls back from missing trigger anchors to node anchors and hides when no anchor exists", async () => {
    const editor = makeCourseEditor();
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="grid"]')).not.toBeNull();
    });

    const gridPos = firstNodePos(editor, "grid");
    expect(
      openGridMenuTargetForTest(editor, {
        kind: "grid",
        gridPos,
      }),
    ).toBe(true);

    const gridElement = document.body.querySelector('[data-authoring-frame="grid"]');
    expect(resolveGridMenuVirtualElementForTest(editor)?.contextElement).toBe(gridElement);

    const fakeEditor = {
      isEditable: true,
      state: editor.state,
      view: { dom: document.createElement("div") },
    } as unknown as Editor;
    expect(resolveGridMenuVirtualElementForTest(fakeEditor)).toBeNull();

    editor.destroy();
  });

  it("clears grid menu target when clicking into cell content", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-cell-menu-trigger]")).not.toBeNull();
      expect(document.body.querySelector('[data-authoring-frame="cell"]')).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector("[data-grid-cell-menu-trigger]")!);
    expect(menuOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Cell,
    });

    fireEvent.mouseDown(document.body.querySelector('[data-authoring-frame="cell"]')!);

    expect(menuOwnerForTest(editor)).toBeNull();
    editor.destroy();
  });

  it("clears grid menu target when structural space takes the interaction", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
      expect(document.body.querySelector('[data-authoring-frame="cell"]')).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector("[data-grid-menu-trigger]")!);
    expect(menuOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Grid,
    });

    fireEvent.mouseDown(document.body.querySelector('[data-authoring-frame="cell"]')!);

    expect(menuOwnerForTest(editor)).toBeNull();
    editor.destroy();
  });

  it("clears grid menu target from document pointerdown outside grid chrome", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector("[data-grid-menu-trigger]")!);
    expect(menuOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Grid,
    });

    fireEvent.pointerDown(document.body);

    expect(menuOwnerForTest(editor)).toBeNull();
    editor.destroy();
  });

  it("preserves grid menu target while interacting with the grid bubble", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      if (!document.body.querySelector("[data-grid-menu-trigger]")) {
        throw new Error("Grid menu trigger did not mount");
      }
    });

    const menuTrigger = document.body.querySelector("[data-grid-menu-trigger]");
    if (!menuTrigger) {
      throw new Error("Grid menu trigger did not mount");
    }
    fireEvent.click(menuTrigger);

    await waitFor(() => {
      if (!document.body.querySelector('[data-authoring-chrome="menu"]')) {
        throw new Error("Grid menu did not open");
      }
    });

    fireEvent.pointerDown(document.body.querySelector('[data-authoring-chrome="menu"]')!);

    expect(menuOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Grid,
    });
    editor.destroy();
  });

  it("preserves grid menu target while interacting with shared editor chrome", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector("[data-grid-menu-trigger]")!);
    expect(menuOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Grid,
    });

    const blockBubble = document.createElement("div");
    blockBubble.setAttribute(AUTHORING_CHROME_ATTR, "bubble");
    document.body.querySelector(".sc-authoring-chrome-root")?.append(blockBubble);
    fireEvent.pointerDown(blockBubble);

    expect(menuOwnerForTest(editor)).toMatchObject({
      kind: InteractionTargetKind.Grid,
    });
    editor.destroy();
  });

  it("mounts the grid menu bubble from target state", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector("[data-grid-menu-trigger]")!);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-chrome="menu"]')).not.toBeNull();
    });

    expect(
      document.body.querySelector('[role="radiogroup"][aria-label="Vertical alignment"]'),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[role="radiogroup"][aria-label^="Horizontal alignment"]'),
    ).toBeNull();

    editor.destroy();
  });

  it("renders the grid cell count menu as styled editor chrome", async () => {
    const editor = makeCourseEditor();
    renderAuthoringShell(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-grid-menu-trigger]")).not.toBeNull();
    });

    fireEvent.click(document.body.querySelector("[data-grid-menu-trigger]")!);

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-chrome="menu"]')).not.toBeNull();
    });

    const trigger = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Grid cells"]',
    );
    if (!trigger) {
      throw new Error("Grid cells trigger did not mount");
    }
    if (document.body.querySelector('select[aria-label="Grid cells"]')) {
      throw new Error("Grid cells control rendered a native select");
    }
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(trigger.getAttribute("aria-label")).toBe("Grid cells");

    editor.destroy();
  });

  it("renders editable empty cells without making the cell a drag bar", async () => {
    const editor = makeCourseEditor();
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="cell"]')).not.toBeNull();
    });

    const cellElement = document.body.querySelector('[data-authoring-frame="cell"]');
    expect(cellElement?.getAttribute("data-empty")).toBe("true");
    expect(cellElement?.hasAttribute("data-authoring-move-handle")).toBe(false);

    editor.destroy();
  });

  it("does not render grid chrome in readonly runtime", async () => {
    const editor = makeCourseEditor(false);
    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-authoring-frame="grid"]')).not.toBeNull();
    });

    expect(document.body.querySelector("[data-grid-column-controls]")).toBeNull();
    expect(document.body.querySelector("[data-grid-column-resize-handle]")).toBeNull();
    const gridElement = document.body.querySelector('[data-authoring-frame="grid"]');
    expect(gridElement?.getAttribute("class")).toContain("sc-grid-authoring");
    expect(gridElement?.getAttribute("class")).not.toContain("sc-grid-authoring--editable");
    expect(gridElement?.getAttribute(AUTHORING_CHROME_ACTIVE_ATTR)).toBeNull();

    editor.destroy();
  });

  it("serializes grid column widths", () => {
    const editor = makeEditor();
    const { schema } = editor;
    const paragraphType = schema.nodes.paragraph!;
    const gridType = schema.nodes.grid!;
    const cellType = schema.nodes.cell!;
    const firstCell = cellType.create(null, paragraphType.create());
    const secondCell = cellType.create(null, paragraphType.create());

    const grid = gridType.create(
      { columnWidths: [35, 65] },
      Fragment.fromArray([firstCell, secondCell]),
    );

    expect(grid.toJSON().attrs).toMatchObject({ columnWidths: [35, 65] });

    editor.destroy();
  });
});
