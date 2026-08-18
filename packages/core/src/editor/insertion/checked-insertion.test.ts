// @vitest-environment happy-dom

import type { Icon } from "@phosphor-icons/react";
import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { createCatalogNodeChecked, insertCatalogItemChecked } from "./checked-insertion";
import type { InsertAction } from "./insert-action";
import { createInsertCatalog } from "./insert-catalog";

const TestIcon = (() => null) as unknown as Icon;
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const editors: Editor[] = [];

const TestManualBlock = Node.create({
  name: "test_manual_catalog_block",
  group: "block",
  renderHTML() {
    return ["div", { "data-test-manual-catalog-block": "" }];
  },
});
const TestContentfulCatalogBlock = Node.create({
  name: "test_contentful_catalog_block",
  group: "block",
  content: "paragraph",
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-test-contentful-catalog-block": "" }, 0];
  },
});
const TestReadOnlyAtomicBlock = Node.create({
  name: "test_read_only_atomic_catalog_block",
  group: "block",
  atom: true,
  selectable: false,
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-read-only-atomic-catalog-block": "" }];
  },
});
const RejectDocumentChanges = Extension.create({
  name: "rejectDocumentChanges",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (transaction) => !transaction.docChanged,
      }),
    ];
  },
});
const nestedCellInsertCatalog = createInsertCatalog([
  {
    id: "test-nested-cell-block",
    nodeType: "test_manual_catalog_block",
    title: "Nested cell block",
    description: "Test nested cell insertion",
    icon: TestIcon,
    category: "content",
    content: () => ({ type: "test_manual_catalog_block" }),
  },
]);

const RESIZABLE_CATALOG_BLOCK = "test_resizable_alignment_catalog_block";
const TestResizableCatalogBlock = Node.create({
  name: RESIZABLE_CATALOG_BLOCK,
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null }, frame: { default: null }, data: { default: {} } };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-resizable-alignment-catalog-block": "" }];
  },
});

const testResizableCatalogBlockDefinition = defineBlock({
  nodeType: RESIZABLE_CATALOG_BLOCK,
  title: "Resizable alignment block",
  frame: { resizable: true },
});

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  testResizableCatalogBlockDefinition,
]);
const testSurfaceVariants = createSurfaceVariantRegistry([
  pageDefaultSurfaceDefinition,
  slideCoverSurfaceDefinition,
  slideContentSurfaceDefinition,
]);

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

function makeEditor() {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestManualBlock,
      TestContentfulCatalogBlock,
      TestReadOnlyAtomicBlock,
    ],
  });
  editors.push(editor);
  return editor;
}

function makeAlignedEditor() {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldTextAlignExtension(["paragraph", "heading"]),
      TestManualBlock,
      TestResizableCatalogBlock,
    ],
  });
  editors.push(editor);
  return editor;
}

function makeCourseEditor(content: JSONContent) {
  const editor = new Editor({
    extensions: [
      ...createCourseDocumentAuthoringExtensions({
        composition: coreAuthoringComposition,
        editable: true,
      }),
      TestManualBlock,
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function slideCoverDocument(surfaceContent: JSONContent[]): JSONContent {
  const surface: JSONContent = slideCoverSurfaceDefinition.createSurface({
    surfaceId: createEmbeddedNodeId(),
  });
  surface.content = surfaceContent;
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow", surfaceSize: "16x9" },
        content: [surface],
      },
    ],
  };
}

function slideContentDocument(regionContent: JSONContent[]): JSONContent {
  const surface: JSONContent = slideContentSurfaceDefinition.createSurface({
    surfaceId: createEmbeddedNodeId(),
  });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected slide content surface to include its main region.");
  region.attrs = { ...region.attrs, id: "region-slide-content" };
  region.content = regionContent;
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow", surfaceSize: "16x9" },
        content: [surface],
      },
    ],
  };
}

describe("insertCatalogItemChecked", () => {
  it("selects the fitted contentful root instead of the original mapped caret", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Existing paragraph" }],
        },
      ],
    });
    const originalCaret = findTextPosition(editor, "Existing paragraph") + 2;
    expect(editor.commands.setTextSelection({ from: originalCaret, to: originalCaret })).toBe(true);

    expect(
      insertCatalogItemChecked(
        editor,
        {
          id: "test-contentful-fitted-block",
          nodeType: "test_contentful_catalog_block",
          title: "Contentful fitted block",
          description: "Test fitted contentful block selection",
          icon: TestIcon,
          category: "content",
          content: () => ({
            type: "test_contentful_catalog_block",
            attrs: { id: "fitted-contentful-root" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Inserted" }] }],
          }),
        },
        testBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
      ),
    ).toBe(true);

    const insertedPosition = findNodePositionByAttribute(editor, "id", "fitted-contentful-root");
    const inserted = editor.state.doc.nodeAt(insertedPosition);
    if (!inserted) throw new Error("Expected the inserted contentful node.");
    expect(insertedPosition).not.toBe(originalCaret);
    expectSelectionWithinNode(editor, insertedPosition, inserted);
  });

  it("materializes replaced text alignment on an inserted resizable block", () => {
    const item: InsertAction = {
      id: RESIZABLE_CATALOG_BLOCK,
      nodeType: RESIZABLE_CATALOG_BLOCK,
      title: "Resizable alignment block",
      description: "Test inherited alignment",
      icon: TestIcon,
      category: "content",
      content: () => ({
        type: RESIZABLE_CATALOG_BLOCK,
        attrs: {
          id: "inserted-aligned",
          frame: { align: "start", widthMode: "fill", widthPercent: 100 },
          data: { retained: true },
        },
      }),
    };
    const editor = makeAlignedEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "right" },
          content: [{ type: "text", text: "/aligned" }],
        },
      ],
    });
    const from = findTextPosition(editor, "/aligned");

    expect(
      insertCatalogItemChecked(
        editor,
        item,
        testBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
        {
          from,
          to: from + "/aligned".length,
        },
      ),
    ).toBe(true);

    const inserted = editor.state.doc.nodeAt(0);
    expect(inserted?.attrs["frame"]).toMatchObject({
      align: "end",
      widthMode: "fill",
      widthPercent: 100,
    });
    expect(inserted?.attrs["data"]).toEqual({ retained: true });
    const insertedPosition = findNodePositionByAttribute(editor, "id", "inserted-aligned");
    if (!inserted) throw new Error("Expected the inserted resizable block.");
    expectSelectionWithinNode(editor, insertedPosition, inserted);
  });
  it("dispatches a checked catalog range replacement for manual insertion", () => {
    const item: InsertAction = {
      id: "test-manual-catalog-replace",
      nodeType: "paragraph",
      title: "Manual catalog replace",
      description: "Test manual catalog replace",
      icon: TestIcon,
      category: "content",
      content: () => ({
        type: "paragraph",
        content: [{ type: "text", text: "Inserted manually" }],
      }),
    };
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before /manual" }],
        },
      ],
    });
    const from = findTextPosition(editor, "/manual");

    const inserted = insertCatalogItemChecked(
      editor,
      item,
      testBlockRegistry,
      builtInLayoutRegistry,
      testSurfaceVariants,
      {
        from,
        to: from + "/manual".length,
      },
    );

    expect(inserted).toBe(true);
    expect(editor.state.doc.textContent).toContain("Inserted manually");
    expect(editor.state.doc.textContent).not.toContain("/manual");
  });

  it("does not dispatch when the checked catalog replacement fails", () => {
    const editor = makeEditor();
    const before = editor.getJSON();

    const inserted = insertCatalogItemChecked(
      editor,
      {
        id: "test-manual-catalog-invalid-range",
        nodeType: "paragraph",
        title: "Manual invalid range",
        description: "Test manual invalid range",
        icon: TestIcon,
        category: "content",
        content: () => ({ type: "paragraph" }),
      },
      testBlockRegistry,
      builtInLayoutRegistry,
      testSurfaceVariants,
      { from: 9, to: 1 },
    );

    expect(inserted).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("replaces slash text with a checked block node", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before /block" }],
        },
      ],
    });
    const from = findTextPosition(editor, "/block");

    const inserted = insertCatalogItemChecked(
      editor,
      {
        id: "test-manual-catalog-block",
        nodeType: "test_manual_catalog_block",
        title: "Manual catalog block",
        description: "Test manual catalog block",
        icon: TestIcon,
        category: "content",
        content: () => ({ type: "test_manual_catalog_block" }),
      },
      testBlockRegistry,
      builtInLayoutRegistry,
      testSurfaceVariants,
      { from, to: from + "/block".length },
    );

    expect(inserted).toBe(true);
    expect(editor.getJSON().content).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Before " }],
      },
      { type: "test_manual_catalog_block" },
      { type: "paragraph" },
    ]);
    const insertedPosition = findNodePositionByType(editor, "test_manual_catalog_block");
    const insertedNode = editor.state.doc.nodeAt(insertedPosition);
    if (!insertedNode) throw new Error("Expected the inserted slash block.");
    expectSelectionWithinNode(editor, insertedPosition, insertedNode);
  });

  it("keeps a valid selection for a non-selectable atomic insertion", () => {
    const editor = makeEditor();

    expect(
      insertCatalogItemChecked(
        editor,
        {
          id: "test-read-only-atomic-catalog-block",
          nodeType: "test_read_only_atomic_catalog_block",
          title: "Read-only atomic block",
          description: "Test read-only atomic selection fallback",
          icon: TestIcon,
          category: "content",
          content: () => ({
            type: "test_read_only_atomic_catalog_block",
            attrs: { id: "read-only-atomic-root" },
          }),
        },
        testBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
      ),
    ).toBe(true);

    expect(editor.state.selection.from).toBeGreaterThanOrEqual(0);
    expect(editor.state.selection.to).toBeLessThanOrEqual(editor.state.doc.content.size);
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
  });

  it("does not insert catalog blocks directly at a disabled surface root", () => {
    const editor = makeCourseEditor(
      slideCoverDocument([
        {
          type: "paragraph",
          content: [{ type: "text", text: "/block" }],
        },
      ]),
    );
    const before = editor.getJSON();
    const from = findTextPosition(editor, "/block");

    const inserted = insertCatalogItemChecked(
      editor,
      {
        id: "test-manual-catalog-disabled-surface-root",
        nodeType: "test_manual_catalog_block",
        title: "Manual root policy block",
        description: "Test root policy block",
        icon: TestIcon,
        category: "content",
        content: () => ({ type: "test_manual_catalog_block" }),
      },
      testBlockRegistry,
      builtInLayoutRegistry,
      testSurfaceVariants,
      { from, to: from + "/block".length },
    );

    expect(inserted).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("still inserts catalog blocks inside nested cells on a disabled surface root", () => {
    const editor = makeCourseEditor(
      slideContentDocument([
        {
          type: "grid",
          content: [
            {
              type: "cell",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "/block" }],
                },
              ],
            },
          ],
        },
      ]),
    );
    const from = findTextPosition(editor, "/block");
    const nestedCellAction = nestedCellInsertCatalog.getById("test-nested-cell-block");
    if (!nestedCellAction) throw new Error("Expected the nested-cell test action.");

    const inserted = insertCatalogItemChecked(
      editor,
      nestedCellAction,
      testBlockRegistry,
      builtInLayoutRegistry,
      testSurfaceVariants,
      {
        from,
        to: from + "/block".length,
      },
    );

    expect(inserted).toBe(true);
    expect(nodeTypesInJson(editor.getJSON())).toContain("test_manual_catalog_block");
    const insertedPosition = findNodePositionByType(editor, "test_manual_catalog_block");
    const insertedNode = editor.state.doc.nodeAt(insertedPosition);
    if (!insertedNode) throw new Error("Expected the nested-cell insertion.");
    expectSelectionWithinNode(editor, insertedPosition, insertedNode);
  });

  it("selects the fitted Grid root through the existing layout insertion action", () => {
    const editor = makeCourseEditor(slideContentDocument([{ type: "paragraph" }]));
    setCursorInFirstEmptyParagraph(editor);

    expect(
      insertCatalogItemChecked(
        editor,
        gridInsertAction,
        builtInBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
      ),
    ).toBe(true);

    const insertedPosition = findNodePositionByType(editor, "grid");
    const insertedNode = editor.state.doc.nodeAt(insertedPosition);
    if (!insertedNode) throw new Error("Expected the inserted Grid.");
    expectSelectionWithinNode(editor, insertedPosition, insertedNode);
  });

  it("selects the fitted Layout root through the existing layout insertion action", () => {
    const editor = makeCourseEditor(slideContentDocument([{ type: "paragraph" }]));
    setCursorInFirstEmptyParagraph(editor);
    const action = createLayoutInsertAction(tabsLayoutDefinition);

    expect(
      insertCatalogItemChecked(
        editor,
        action,
        builtInBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
      ),
    ).toBe(true);

    const insertedPosition = findNodePositionByAttribute(editor, "variant", "tabs");
    const insertedNode = editor.state.doc.nodeAt(insertedPosition);
    if (!insertedNode) throw new Error("Expected the inserted Layout.");
    expectSelectionWithinNode(editor, insertedPosition, insertedNode);
  });

  it("rejects an invalid bounded fill placement before materializing catalog content", () => {
    const editor = makeCourseEditor(
      slideContentDocument([
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Existing region content" }],
        },
      ]),
    );
    setCursorInFirstEmptyParagraph(editor);
    const before = editor.getJSON();
    const content = vi.fn(() => ({ type: "grid" }));

    expect(
      insertCatalogItemChecked(
        editor,
        {
          id: "test-grid-fill",
          nodeType: "grid",
          title: "Grid",
          description: "Test bounded fill insertion",
          icon: TestIcon,
          category: "layout",
          boundedPlacement: "fill",
          content,
        },
        testBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
      ),
    ).toBe(false);
    expect(content).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
  });

  it("does not replace a fully selected authored paragraph with a bounded fill action", () => {
    const editor = makeCourseEditor(
      slideContentDocument([
        {
          type: "paragraph",
          content: [{ type: "text", text: "Authored region content" }],
        },
      ]),
    );
    const from = findTextPosition(editor, "Authored region content");
    const range = { from, to: from + "Authored region content".length };
    editor.commands.setTextSelection(range);
    const before = editor.getJSON();
    const content = vi.fn(() => ({ type: "grid" }));

    expect(
      insertCatalogItemChecked(
        editor,
        {
          id: "test-grid-authored-selection",
          nodeType: "grid",
          title: "Grid",
          description: "Test authored selection protection",
          icon: TestIcon,
          category: "layout",
          boundedPlacement: "fill",
          content,
        },
        testBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
        range,
      ),
    ).toBe(false);
    expect(content).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
  });

  it("returns false when an editor transaction filter rejects insertion", () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), RejectDocumentChanges],
    });
    editors.push(editor);
    const before = editor.getJSON();

    expect(
      insertCatalogItemChecked(
        editor,
        {
          id: "test-filtered-insertion",
          nodeType: "paragraph",
          title: "Filtered insertion",
          description: "Test filtered insertion result",
          icon: TestIcon,
          category: "content",
          content: () => ({
            type: "paragraph",
            content: [{ type: "text", text: "Rejected content" }],
          }),
        },
        testBlockRegistry,
        builtInLayoutRegistry,
        testSurfaceVariants,
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("createCatalogNodeChecked", () => {
  it("resolves node content only from the supplied catalog", () => {
    const catalog = createInsertCatalog([
      {
        id: "paragraph",
        nodeType: "paragraph",
        title: "Paragraph",
        description: "Insert a paragraph",
        icon: TestIcon,
        category: "content",
        content: () => ({
          type: "paragraph",
          content: [{ type: "text", text: "Explicit catalog" }],
        }),
      },
    ]);
    const editor = makeEditor();

    const result = createCatalogNodeChecked({
      catalog,
      schema: editor.schema,
      actionId: "paragraph",
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({ id: "paragraph" }),
        node: expect.objectContaining({ textContent: "Explicit catalog" }),
      }),
    );
  });

  it("rejects ids absent from the supplied catalog", () => {
    const editor = makeEditor();
    const result = createCatalogNodeChecked({
      catalog: createInsertCatalog([]),
      schema: editor.schema,
      actionId: "paragraph",
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "unknown_catalog_item",
        message: 'Insert action "paragraph" is not in the supplied catalog.',
      },
    });
  });
});

function findTextPosition(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Could not find text: ${text}`);
  return found;
}

function findNodePositionByAttribute(editor: Editor, attribute: string, value: unknown): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs[attribute] !== value) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`Could not find node with ${attribute}=${String(value)}.`);
  return found;
}

function findNodePositionByType(editor: Editor, type: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== type) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`Could not find node type: ${type}`);
  return found;
}

function expectSelectionWithinNode(
  editor: Editor,
  position: number,
  node: ProseMirrorNode | null,
): void {
  if (!node) throw new Error("Expected a node at the inserted position.");
  if (node.isAtom && node.type.spec.selectable !== false) {
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(position);
    expect(editor.state.selection.to).toBe(position + node.nodeSize);
    return;
  }
  expect(editor.state.selection.from).toBeGreaterThan(position);
  expect(editor.state.selection.to).toBeLessThan(position + node.nodeSize);
}

function setCursorInFirstEmptyParagraph(editor: Editor): void {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null || node.type.name !== "paragraph" || node.content.size !== 0) {
      return true;
    }
    position = pos + 1;
    return false;
  });
  if (position === null) throw new Error("Expected an empty paragraph.");
  editor.commands.setTextSelection(position);
}

function nodeTypesInJson(content: JSONContent): string[] {
  const types: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type) types.push(node.type);
    node.content?.forEach(visit);
  };
  visit(content);
  return types;
}
