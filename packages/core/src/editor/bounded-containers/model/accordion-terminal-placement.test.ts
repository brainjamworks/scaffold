// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import {
  allowsBoundedContainerRootInsertionAtPosition as allowsBoundedContainerRootInsertionAtPositionWithLookup,
  isActiveBoundedContainerAtPosition as isActiveBoundedContainerAtPositionWithLookup,
  resolveActiveBoundedPlacement as resolveActiveBoundedPlacementWithLookup,
  validateBoundedContainerStructure as validateBoundedContainerStructureWithLookup,
} from "./bounded-container-structure-policy";

const TEST_FILL_NODE = "test_accordion_terminal_fill";
const editors: Editor[] = [];

const TestFillNode = Node.create({
  name: TEST_FILL_NODE,
  group: "block",
  atom: true,
  renderHTML() {
    return ["div", { "data-node": TEST_FILL_NODE }];
  },
});

const testFillDefinition = defineBlock({
  nodeType: TEST_FILL_NODE,
  boundedPlacement: "fill",
});

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  testFillDefinition,
]);

function validateBoundedContainerStructure(
  doc: Parameters<typeof validateBoundedContainerStructureWithLookup>[0],
) {
  return validateBoundedContainerStructureWithLookup(doc, testBlockRegistry);
}

function allowsBoundedContainerRootInsertionAtPosition(
  input: Omit<
    Parameters<typeof allowsBoundedContainerRootInsertionAtPositionWithLookup>[0],
    "blockDefinitions"
  >,
) {
  return allowsBoundedContainerRootInsertionAtPositionWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });
}

function resolveActiveBoundedPlacement(
  input: Omit<Parameters<typeof resolveActiveBoundedPlacementWithLookup>[0], "blockDefinitions">,
) {
  return resolveActiveBoundedPlacementWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });
}

function isActiveBoundedContainerAtPosition(
  input: Omit<
    Parameters<typeof isActiveBoundedContainerAtPositionWithLookup>[0],
    "blockDefinitions"
  >,
) {
  return isActiveBoundedContainerAtPositionWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("accordion terminal bounded placement", () => {
  it("keeps a bounded accordion section in normal flow", () => {
    const editor = makeEditor([
      accordionLayout([{ type: TEST_FILL_NODE }, paragraph("Normal-flow sibling")]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, TEST_FILL_NODE),
      }),
    ).toBeUndefined();
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: editor.state.doc,
        pos: firstNodePos(editor, "section"),
      }),
    ).toBe(true);
    expect(validateBoundedContainerStructure(editor.state.doc)).toEqual({
      ok: true,
      violations: [],
    });
    expect(
      isActiveBoundedContainerAtPosition({
        containerType: "section",
        doc: editor.state.doc,
        pos: firstNodePos(editor, "section"),
      }),
    ).toBe(false);
  });

  it("keeps fill-capable content inside the accordion panel in normal flow", () => {
    const editor = makeEditor([
      accordionLayout([
        accordionTitle("Assessment"),
        {
          type: "accordion_section_panel",
          content: [{ type: TEST_FILL_NODE }],
        },
      ]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, TEST_FILL_NODE),
      }),
    ).toBeUndefined();
  });

  it("preserves the default bounded handoff for tabs sections", () => {
    const editor = makeEditor([
      {
        type: "layout",
        attrs: { id: "layout-tabs", variant: "tabs" },
        content: [
          {
            type: "section",
            attrs: { id: "section-tabs", role: "tab-panel" },
            content: [{ type: TEST_FILL_NODE }],
          },
        ],
      },
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, TEST_FILL_NODE),
      }),
    ).toBe("fill");
  });
});

function makeEditor(regionContent: JSONContent[]): Editor {
  const editor = new Editor({
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
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      TestFillNode,
    ],
    content: {
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
                  attrs: { id: "region-a" },
                  content: regionContent,
                },
              ],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function accordionLayout(content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: "layout-accordion", variant: "accordion" },
    content: [
      {
        type: "section",
        attrs: { id: "section-accordion", role: "accordion-panel" },
        content,
      },
    ],
  };
}

function accordionTitle(text: string): JSONContent {
  return {
    type: "accordion_section_title",
    content: [paragraph(text)],
  };
}

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function firstNodePos(editor: Editor, nodeType: string): number {
  let result: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== nodeType) return true;
    result = pos;
    return false;
  });

  if (result === null) throw new Error(`expected "${nodeType}" node`);
  return result;
}
