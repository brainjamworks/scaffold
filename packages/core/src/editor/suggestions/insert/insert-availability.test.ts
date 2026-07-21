// @vitest-environment happy-dom

import { TextHIcon as TextH } from "@phosphor-icons/react";
import { Editor, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { defineConfiguration } from "@/editor/configuration/definition";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import type { InsertAction } from "@/editor/insertion/insert-action";

import {
  canInsertCatalogItem,
  getInsertableCatalogItems,
  getSelectedBlockQuickMenu,
} from "./insert-availability";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const TestCourseBlock = Node.create({
  name: "test_course_block",
  group: "block",
  renderHTML() {
    return ["div", { "data-test-course-block": "" }];
  },
});

const TestRichBlock = Node.create({
  name: "test_rich_block",
  group: `block ${TEXT_CONTENT}`,
  renderHTML() {
    return ["div", { "data-test-rich-block": "" }];
  },
});

const TestFieldMedia = Node.create({
  name: "test_field_media",
  group: TEXT_CONTENT,
  renderHTML() {
    return ["div", { "data-test-field-media": "" }];
  },
});

const TestQuickBlock = Node.create({
  name: "test_quick_block",
  group: "block",
  selectable: true,
  renderHTML() {
    return ["div", { "data-test-quick-block": "" }];
  },
});

const TestCalloutTitle = Node.create({
  name: "test_callout_title",
  content: "paragraph",
  renderHTML() {
    return ["div", { "data-test-callout-title": "" }, 0];
  },
});

const TestCalloutPrompt = Node.create({
  name: "test_callout_prompt",
  content: `${TEXT_CONTENT}+`,
  renderHTML() {
    return ["div", { "data-test-callout-prompt": "" }, 0];
  },
});

const TestCallout = Node.create({
  name: "test_callout",
  group: "block",
  content: "test_callout_title test_callout_prompt",
  renderHTML() {
    return ["div", { "data-test-callout": "" }, 0];
  },
});

const testBlockRegistry = createBlockRegistry([
  defineBlock({
    nodeType: "test_quick_block",
    configuration: defineConfiguration({
      attr: "settings",
      schema: z.object({ enabled: z.boolean().default(true) }),
      controls: [
        {
          kind: "boolean",
          name: "enabled",
          label: "Enabled",
          placement: { quickMenu: { presentation: "icon-toggle" } },
        },
      ],
    }),
  }),
]);

function itemFor(nodeType: string): InsertAction {
  return {
    id: nodeType,
    nodeType,
    title: nodeType,
    description: nodeType,
    category: "content",
    icon: TextH,
    content: () => ({ type: nodeType }),
  };
}

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      TestCourseBlock,
      TestRichBlock,
      TestFieldMedia,
      TestQuickBlock,
      TestCalloutTitle,
      TestCalloutPrompt,
      TestCallout,
    ],
  });
}

function makeCourseEditor() {
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
    ],
  });
}

function setCursorInsideText(editor: Editor, text: string, offset = 0) {
  let pos: number | null = null;

  editor.state.doc.descendants((node, nodePos) => {
    if (pos !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    pos = nodePos + index + offset;
    return false;
  });

  if (pos === null) throw new Error(`No text node containing "${text}"`);
  editor.commands.setTextSelection(pos);
}

function availableNodeTypes(editor: Editor): string[] {
  return getInsertableCatalogItems(editor, builtInInsertCatalog.actions).map(
    (item) => item.nodeType,
  );
}

describe("canInsertCatalogItem", () => {
  it("allows block catalog items from top-level paragraphs", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Top level text" }],
        },
      ],
    });

    setCursorInsideText(editor, "level");

    expect(canInsertCatalogItem(editor, itemFor("test_course_block"))).toBe(true);
    expect(canInsertCatalogItem(editor, itemFor("test_field_media"))).toBe(false);

    editor.destroy();
  });

  it("allows only text-content catalog items inside field containers", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "test_callout",
          content: [
            {
              type: "test_callout_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Title text" }],
                },
              ],
            },
            {
              type: "test_callout_prompt",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Prompt text" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInsideText(editor, "Prompt");

    expect(canInsertCatalogItem(editor, itemFor("test_course_block"))).toBe(false);
    expect(canInsertCatalogItem(editor, itemFor("test_rich_block"))).toBe(true);
    expect(canInsertCatalogItem(editor, itemFor("test_field_media"))).toBe(true);

    editor.destroy();
  });

  it("blocks all block catalog items inside single-paragraph title fields", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "test_callout",
          content: [
            {
              type: "test_callout_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Title text" }],
                },
              ],
            },
            {
              type: "test_callout_prompt",
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });

    setCursorInsideText(editor, "Title");

    expect(canInsertCatalogItem(editor, itemFor("test_course_block"))).toBe(false);
    expect(canInsertCatalogItem(editor, itemFor("test_rich_block"))).toBe(false);
    expect(canInsertCatalogItem(editor, itemFor("test_field_media"))).toBe(false);

    editor.destroy();
  });

  it("reads configuration-derived quick settings from the selected block definition", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "test_quick_block" }],
    });

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));

    expect(getSelectedBlockQuickMenu(editor, testBlockRegistry)).toMatchObject({
      attr: "settings",
      controls: [{ kind: "boolean", name: "enabled" }],
    });

    editor.commands.setTextSelection(0);
    expect(getSelectedBlockQuickMenu(editor, testBlockRegistry)).toBeNull();

    editor.destroy();
  });

  it("allows columns insert actions and layout catalog items inside surfaces", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Surface text" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInsideText(editor, "Surface");

    expect(availableNodeTypes(editor)).toEqual(expect.arrayContaining(["grid", "layout"]));

    editor.destroy();
  });

  it("allows grid and layout catalog items inside regions", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-a", variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: "region-a", role: "main" },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Region text" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInsideText(editor, "Region");

    expect(availableNodeTypes(editor)).toEqual(expect.arrayContaining(["grid", "layout"]));

    editor.destroy();
  });

  it("allows layout but rejects grid inside cells", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "grid",
                  content: [
                    {
                      type: "cell",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Cell text" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInsideText(editor, "Cell");

    expect(availableNodeTypes(editor)).toEqual(expect.arrayContaining(["layout"]));
    expect(availableNodeTypes(editor)).not.toContain("grid");

    editor.destroy();
  });

  it("allows grids but rejects layout catalog items inside sections", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: "layout",
                  content: [
                    {
                      type: "section",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Section text" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInsideText(editor, "Section");

    expect(availableNodeTypes(editor)).toContain("grid");
    expect(availableNodeTypes(editor)).not.toContain("layout");

    editor.destroy();
  });
});
