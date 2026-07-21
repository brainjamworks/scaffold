// @vitest-environment happy-dom

import type { Icon } from "@phosphor-icons/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { createCatalogNodeChecked, insertCatalogItemChecked } from "./checked-insertion";
import type { InsertAction } from "./insert-action";
import { createInsertCatalog } from "./insert-catalog";

const TestIcon = (() => null) as unknown as Icon;
const editors: Editor[] = [];

const TestManualBlock = Node.create({
  name: "test_manual_catalog_block",
  group: "block",
  renderHTML() {
    return ["div", { "data-test-manual-catalog-block": "" }];
  },
});

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
    extensions: [StarterKit.configure({ undoRedo: false }), TestManualBlock],
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
    extensions: [...createCourseDocumentAuthoringExtensions({ editable: true }), TestManualBlock],
    content,
  });
  editors.push(editor);
  return editor;
}

function slideCoverDocument(surfaceContent: JSONContent[]): JSONContent {
  const surface: JSONContent = slideCoverSurfaceDefinition.createSurface({
    surfaceId: "surface-slide-cover",
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
    surfaceId: "surface-slide-content",
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
      insertCatalogItemChecked(editor, item, testBlockRegistry, testSurfaceVariants, {
        from,
        to: from + "/aligned".length,
      }),
    ).toBe(true);

    const inserted = editor.state.doc.nodeAt(0);
    expect(inserted?.attrs["frame"]).toMatchObject({
      align: "end",
      widthMode: "fill",
      widthPercent: 100,
    });
    expect(inserted?.attrs["data"]).toEqual({ retained: true });
    expect(editor.state.selection.from).toBeGreaterThanOrEqual(0);
    expect(editor.state.selection.from).toBeLessThanOrEqual(editor.state.doc.content.size);
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
    const calloutAction = builtInInsertCatalog.getById("callout");
    if (!calloutAction) throw new Error("Expected the built-in callout action.");

    const inserted = insertCatalogItemChecked(
      editor,
      calloutAction,
      testBlockRegistry,
      testSurfaceVariants,
      {
        from,
        to: from + "/block".length,
      },
    );

    expect(inserted).toBe(true);
    expect(nodeTypesInJson(editor.getJSON())).toContain("callout");
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
      catalogId: "paragraph",
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
      catalogId: "paragraph",
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

function nodeTypesInJson(content: JSONContent): string[] {
  const types: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type) types.push(node.type);
    node.content?.forEach(visit);
  };
  visit(content);
  return types;
}
