// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { PresentationContentLayout } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CELL_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
} from "@/document/model/nodes/structural-node-types";
import { createGridNode, createCellNode } from "@/editor/arrangements/grid/model/grid-nodes";
import {
  createLayoutNode,
  createSectionNode,
} from "@/editor/arrangements/layout/model/layout-nodes";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  CONTENT_LAYOUT_ATTR,
  CONTENT_LAYOUT_HTML_ATTR,
  contentLayoutAttribute,
} from "./content-layout-attribute";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const eligibleNodeTypes = [REGION_NODE_TYPE, CELL_NODE_TYPE, SECTION_NODE_TYPE] as const;

const arrangementNodeTypes: ReadonlySet<string> = new Set([
  ...eligibleNodeTypes,
  "grid",
  "layout",
]);

describe("content layout attribute schema", () => {
  it("defaults eligible containers to Flow and keeps arrangement nodes unowned", () => {
    const editor = createEditor();

    try {
      const nodes = findNodes(editor);

      expect(nodes.region.attrs[CONTENT_LAYOUT_ATTR]).toBe(FLOW);
      expect(nodes.cell.attrs[CONTENT_LAYOUT_ATTR]).toBe(FLOW);
      expect(nodes.section.attrs[CONTENT_LAYOUT_ATTR]).toBe(FLOW);
      expect(nodes.grid.attrs).not.toHaveProperty(CONTENT_LAYOUT_ATTR);
      expect(nodes.layout.attrs).not.toHaveProperty(CONTENT_LAYOUT_ATTR);

      const rendered = renderHTML(editor);
      expect(
        rendered
          .querySelector('section[data-node="region"]')
          ?.getAttribute(CONTENT_LAYOUT_HTML_ATTR),
      ).toBe(FLOW);
      expect(
        rendered.querySelector('div[data-node="cell"]')?.getAttribute(CONTENT_LAYOUT_HTML_ATTR),
      ).toBe(FLOW);
      expect(
        rendered
          .querySelector('section[data-node="section"]')
          ?.getAttribute(CONTENT_LAYOUT_HTML_ATTR),
      ).toBe(FLOW);
      expect(rendered.querySelector('div[data-node="grid"]')).not.toHaveAttribute(
        CONTENT_LAYOUT_HTML_ATTR,
      );
      expect(rendered.querySelector('section[data-node="layout"]')).not.toHaveAttribute(
        CONTENT_LAYOUT_HTML_ATTR,
      );
    } finally {
      editor.destroy();
    }
  });

  it("distinguishes absent values from explicit null at the attribute boundary", () => {
    const descriptor = contentLayoutAttribute[CONTENT_LAYOUT_ATTR];
    const parseHTML = descriptor.parseHTML;
    const renderHTML = descriptor.renderHTML;

    if (!parseHTML || !renderHTML) throw new Error("Expected content-layout adapter hooks");

    expect(parseHTML(document.createElement("div"))).toBe(FLOW);
    expect(renderHTML({})).toEqual({ [CONTENT_LAYOUT_HTML_ATTR]: FLOW });
    expect(() => renderHTML({ [CONTENT_LAYOUT_ATTR]: null })).toThrow();
  });

  it("projects an explicit Sequence value to eligible JSON and HTML nodes", () => {
    const editor = createEditor(SEQUENCE);

    try {
      const json = editor.getJSON();

      for (const nodeType of eligibleNodeTypes) {
        expect(findJsonNode(json, nodeType)?.attrs).toMatchObject({
          [CONTENT_LAYOUT_ATTR]: SEQUENCE,
        });
      }

      const rendered = renderHTML(editor);
      expect(
        rendered
          .querySelector('section[data-node="region"]')
          ?.getAttribute(CONTENT_LAYOUT_HTML_ATTR),
      ).toBe(SEQUENCE);
      expect(
        rendered.querySelector('div[data-node="cell"]')?.getAttribute(CONTENT_LAYOUT_HTML_ATTR),
      ).toBe(SEQUENCE);
      expect(
        rendered
          .querySelector('section[data-node="section"]')
          ?.getAttribute(CONTENT_LAYOUT_HTML_ATTR),
      ).toBe(SEQUENCE);
      expect(rendered.querySelector('div[data-node="grid"]')).not.toHaveAttribute(
        CONTENT_LAYOUT_HTML_ATTR,
      );
      expect(rendered.querySelector('section[data-node="layout"]')).not.toHaveAttribute(
        CONTENT_LAYOUT_HTML_ATTR,
      );
    } finally {
      editor.destroy();
    }
  });

  it.each(eligibleNodeTypes)(
    "rejects an explicit unknown value for %s through schema validation",
    (nodeType) => {
      const editor = createEditor();

      try {
        const node = editor.schema.nodes[nodeType];
        if (!node) throw new Error(`Expected ${nodeType} schema node`);
        expect(node.spec.attrs).toHaveProperty(CONTENT_LAYOUT_ATTR);
        expect(node.spec.attrs?.[CONTENT_LAYOUT_ATTR]).toHaveProperty(
          "validate",
        );
        expect(() =>
          editor.schema
            .nodeFromJSON({
              type: nodeType,
              attrs: { [CONTENT_LAYOUT_ATTR]: "unsupported" },
              content: [paragraph("invalid")],
            })
            .check(),
        ).toThrow();
      } finally {
        editor.destroy();
      }
    },
  );
});

function createEditor(contentLayout?: typeof FLOW | typeof SEQUENCE): Editor {
  const eligibleAttrs = contentLayout ? { [CONTENT_LAYOUT_ATTR]: contentLayout } : {};

  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      createGridNode(),
      createCellNode(),
      createLayoutNode(),
      createSectionNode(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              content: [
                {
                  type: REGION_NODE_TYPE,
                  attrs: eligibleAttrs,
                  content: [
                    {
                      type: "grid",
                      content: [
                        {
                          type: CELL_NODE_TYPE,
                          attrs: eligibleAttrs,
                          content: [
                            {
                              type: "layout",
                              content: [
                                {
                                  type: SECTION_NODE_TYPE,
                                  attrs: eligibleAttrs,
                                  content: [paragraph("Section content")],
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
            },
          ],
        },
      ],
    },
  });
}

function findNodes(editor: Editor) {
  const nodes = {} as Record<string, ReturnType<typeof editor.state.doc.nodeAt>>;

  editor.state.doc.descendants((node) => {
    if (arrangementNodeTypes.has(node.type.name)) {
      nodes[node.type.name] = node;
    }
    return true;
  });

  if (!nodes.region || !nodes.grid || !nodes.cell || !nodes.layout || !nodes.section) {
    throw new Error("Expected the integrated Region -> Grid -> Cell -> Layout -> Section fixture.");
  }

  return {
    region: nodes.region,
    grid: nodes.grid,
    cell: nodes.cell,
    layout: nodes.layout,
    section: nodes.section,
  };
}

function findJsonNode(root: JSONContent | undefined, type: string): JSONContent | undefined {
  if (!root) return undefined;
  if (root.type === type) return root;

  for (const child of root.content ?? []) {
    const found = findJsonNode(child, type);
    if (found) return found;
  }

  return undefined;
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function renderHTML(editor: Editor): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = editor.getHTML();
  return root;
}
