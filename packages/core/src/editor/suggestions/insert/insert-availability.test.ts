// @vitest-environment happy-dom

import { TextHIcon as TextH } from "@phosphor-icons/react";
import { Editor, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { LayerNode } from "@/document/model/layers/layer-node";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { defineConfiguration } from "@/editor/configuration/definition";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";

import {
  canInsertCatalogItem,
  getInsertableCatalogItems,
  getSelectedBlockQuickMenu,
} from "./insert-availability";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { surfaceAssessmentQuestionSchemaExtensions } from "@/editor/testing/surface-assessment-schema-extensions";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

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
    title: "Quick insert block",
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
const testPlacementDependencies = {
  blockDefinitions: testBlockRegistry,
  layoutDefinitions: builtInLayoutRegistry,
  surfaceVariants: createSurfaceVariantRegistry([
    pageDefaultSurfaceDefinition,
    slideCoverSurfaceDefinition,
    slideContentSurfaceDefinition,
  ]),
};

function itemFor(nodeType: string, boundedPlacement?: "fill"): InsertAction {
  return {
    id: nodeType,
    nodeType,
    title: nodeType,
    description: nodeType,
    category: "content",
    icon: TextH,
    ...(boundedPlacement ? { boundedPlacement } : {}),
    content: () => ({ type: nodeType }),
  };
}

const structuralInsertCatalog = createInsertCatalog([
  itemFor("grid", "fill"),
  itemFor("layout", "fill"),
]);

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
      createCourseSectionNode(),
      SurfaceNode,
      ...surfaceAssessmentQuestionSchemaExtensions,
      RegionNode,
      LayerNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      createTestNodeIdentityExtension(),
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

function selectText(editor: Editor, text: string): void {
  let from: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (from !== null || !node.isText || node.text !== text) return true;
    from = pos;
    return false;
  });
  if (from === null) throw new Error(`Expected text: ${text}`);
  editor.commands.setTextSelection({ from, to: from + text.length });
}

function availableNodeTypes(editor: Editor): string[] {
  return getInsertableCatalogItems(
    editor,
    structuralInsertCatalog.actions,
    testPlacementDependencies,
  ).map((item) => item.nodeType);
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

    expect(
      canInsertCatalogItem(editor, itemFor("test_course_block"), testPlacementDependencies),
    ).toBe(true);
    expect(
      canInsertCatalogItem(editor, itemFor("test_field_media"), testPlacementDependencies),
    ).toBe(false);

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

    expect(
      canInsertCatalogItem(editor, itemFor("test_course_block"), testPlacementDependencies),
    ).toBe(false);
    expect(
      canInsertCatalogItem(editor, itemFor("test_rich_block"), testPlacementDependencies),
    ).toBe(true);
    expect(
      canInsertCatalogItem(editor, itemFor("test_field_media"), testPlacementDependencies),
    ).toBe(true);

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

    expect(
      canInsertCatalogItem(editor, itemFor("test_course_block"), testPlacementDependencies),
    ).toBe(false);
    expect(
      canInsertCatalogItem(editor, itemFor("test_rich_block"), testPlacementDependencies),
    ).toBe(false);
    expect(
      canInsertCatalogItem(editor, itemFor("test_field_media"), testPlacementDependencies),
    ).toBe(false);

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
          attrs: { id: createEmbeddedNodeId(), mode: "page" },
          content: [
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "page-default" },
              content: [
                {
                  type: "paragraph",
                  attrs: { id: createEmbeddedNodeId() },
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
          attrs: { id: createEmbeddedNodeId(), mode: "slideshow" },
          content: [
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Insertion fixtures" },
            },
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: createEmbeddedNodeId(), role: "main" },
                  content: [
                    createLayerWithContent([
                      { type: "paragraph", attrs: { id: createEmbeddedNodeId() } },
                    ]),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInFirstEmptyParagraph(editor);

    expect(availableNodeTypes(editor)).toEqual(expect.arrayContaining(["grid", "layout"]));

    editor.destroy();
  });

  it("rejects fill actions when a bounded region contains authored sibling content", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: createEmbeddedNodeId(), mode: "slideshow" },
          content: [
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Insertion fixtures" },
            },
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: createEmbeddedNodeId(), role: "main" },
                  content: [
                    createLayerWithContent([
                      { type: "paragraph", attrs: { id: createEmbeddedNodeId() } },
                      {
                        type: "paragraph",
                        attrs: { id: createEmbeddedNodeId() },
                        content: [{ type: "text", text: "Authored sibling" }],
                      },
                    ]),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    setCursorInFirstEmptyParagraph(editor);

    expect(availableNodeTypes(editor)).not.toContain("grid");
    expect(availableNodeTypes(editor)).not.toContain("layout");

    editor.destroy();
  });

  it("rejects fill actions over a fully selected authored paragraph", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: createEmbeddedNodeId(), mode: "slideshow" },
          content: [
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Insertion fixtures" },
            },
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: createEmbeddedNodeId(), role: "main" },
                  content: [
                    createLayerWithContent([
                      {
                        type: "paragraph",
                        attrs: { id: createEmbeddedNodeId() },
                        content: [{ type: "text", text: "Authored region content" }],
                      },
                    ]),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    selectText(editor, "Authored region content");

    expect(availableNodeTypes(editor)).not.toContain("grid");
    expect(availableNodeTypes(editor)).not.toContain("layout");

    editor.destroy();
  });

  it("does not grant slash replacement permission without an explicit trigger range", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: createEmbeddedNodeId(), mode: "slideshow" },
          content: [
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Insertion fixtures" },
            },
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: createEmbeddedNodeId(), role: "main" },
                  content: [
                    createLayerWithContent([
                      {
                        type: "paragraph",
                        attrs: { id: createEmbeddedNodeId() },
                        content: [{ type: "text", text: "Authored region content" }],
                      },
                    ]),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    selectText(editor, "Authored region content");

    const available = getInsertableCatalogItems(
      editor,
      structuralInsertCatalog.actions,
      testPlacementDependencies,
      undefined,
      "slash-trigger-replacement",
    );
    expect(available.map((item) => item.nodeType)).not.toContain("grid");
    expect(available.map((item) => item.nodeType)).not.toContain("layout");

    editor.destroy();
  });

  it("filters catalog items without invoking their content factories", () => {
    const editor = makeEditor();
    const content = vi.fn(() => {
      throw new Error("Availability must remain factory-inert.");
    });
    const item: InsertAction = {
      ...itemFor("paragraph"),
      content,
    };

    expect(getInsertableCatalogItems(editor, [item], testPlacementDependencies)).toEqual([item]);
    expect(content).not.toHaveBeenCalled();

    editor.destroy();
  });

  it("allows layout but rejects grid inside cells", () => {
    const editor = makeCourseEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: createEmbeddedNodeId(), mode: "page" },
          content: [
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "page-default" },
              content: [
                {
                  type: "grid",
                  attrs: { id: createEmbeddedNodeId() },
                  content: [
                    {
                      type: "cell",
                      attrs: { id: createEmbeddedNodeId() },
                      content: [
                        createLayerWithContent([
                          {
                            type: "paragraph",
                            attrs: { id: createEmbeddedNodeId() },
                            content: [{ type: "text", text: "Cell text" }],
                          },
                        ]),
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
          attrs: { id: createEmbeddedNodeId(), mode: "page" },
          content: [
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "page-default" },
              content: [
                {
                  type: "layout",
                  attrs: { id: createEmbeddedNodeId(), variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: createEmbeddedNodeId() },
                      content: [
                        createLayerWithContent([
                          {
                            type: "paragraph",
                            attrs: { id: createEmbeddedNodeId() },
                            content: [{ type: "text", text: "Section text" }],
                          },
                        ]),
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
