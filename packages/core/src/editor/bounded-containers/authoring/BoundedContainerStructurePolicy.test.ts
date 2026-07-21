// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceAuthoringViewMap } from "@/editor/surfaces/authoring/surface-authoring-views";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createSurfaceAuthoringNode } from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";

import { BoundedContainerStructurePolicy } from "./BoundedContainerStructurePolicy";

const editors: Editor[] = [];
const SurfaceAuthoringNode = createSurfaceAuthoringNode({
  registry: builtInSurfaceVariantRegistry,
  views: builtInSurfaceAuthoringViewMap,
});

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("BoundedContainerStructurePolicy", () => {
  it("allows inserting a sibling paragraph after a fill tabs layout in a page-flow cell", () => {
    const editor = makeEditor([
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [cell([tabsLayout()])],
      },
    ]);
    const cellRange = firstNodeRange(editor, "cell");
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) throw new Error("expected paragraph node");

    editor.view.dispatch(editor.state.tr.insert(cellRange.to - 1, paragraph));

    expect(firstCellContentTypes(editor)).toEqual(["layout", "paragraph"]);
  });

  it("rejects inserting a sibling paragraph after a fill tabs layout in an active bounded cell", () => {
    const editor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [
          {
            type: "grid",
            attrs: { id: "grid-a" },
            content: [cell([tabsLayout()])],
          },
        ],
      },
    ]);
    const cellRange = firstNodeRange(editor, "cell");
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) throw new Error("expected paragraph node");

    editor.view.dispatch(editor.state.tr.insert(cellRange.to - 1, paragraph));

    expect(firstCellContentTypes(editor)).toEqual(["layout"]);
  });

  it("allows inserting a paragraph after a non-fill layout in a cell", () => {
    const editor = makeEditor([
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [cell([basicLayout()])],
      },
    ]);
    const cellRange = firstNodeRange(editor, "cell");
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) throw new Error("expected paragraph node");

    editor.view.dispatch(editor.state.tr.insert(cellRange.to - 1, paragraph));

    expect(firstCellContentTypes(editor)).toEqual(["layout", "paragraph"]);
  });

  it("allows inserting a sibling paragraph after a fill occupant in a page-flow fill layout section", () => {
    const editor = makeEditor([tabsLayoutWithSectionContent([grid()])]);
    const sectionRange = firstNodeRange(editor, "section");
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) throw new Error("expected paragraph node");

    editor.view.dispatch(editor.state.tr.insert(sectionRange.to - 1, paragraph));

    expect(firstSectionContentTypes(editor)).toEqual(["grid", "paragraph"]);
  });

  it("rejects inserting a sibling paragraph after a fill occupant in an active bounded fill layout section", () => {
    const editor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [tabsLayoutWithSectionContent([grid()])],
      },
    ]);
    const sectionRange = firstNodeRange(editor, "section");
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) throw new Error("expected paragraph node");

    editor.view.dispatch(editor.state.tr.insert(sectionRange.to - 1, paragraph));

    expect(firstSectionContentTypes(editor)).toEqual(["grid"]);
  });

  it("allows inserting a paragraph after a fill occupant in a non-fill layout section", () => {
    const editor = makeEditor([basicLayoutWithSectionContent([grid()])]);
    const sectionRange = firstNodeRange(editor, "section");
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) throw new Error("expected paragraph node");

    editor.view.dispatch(editor.state.tr.insert(sectionRange.to - 1, paragraph));

    expect(firstSectionContentTypes(editor)).toEqual(["grid", "paragraph"]);
  });
});

function makeEditor(surfaceContent: JSONContent[]): Editor {
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
      SurfaceAuthoringNode,
      RegionAuthoringNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      BoundedContainerStructurePolicy,
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
              content: surfaceContent,
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function firstNodeRange(editor: Editor, nodeType: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== nodeType) return true;
    range = { from: pos, to: pos + node.nodeSize };
    return false;
  });

  if (!range) throw new Error(`expected "${nodeType}" node`);
  return range;
}

function firstCellContentTypes(editor: Editor): string[] {
  return firstNodeChildTypes(editor, "cell");
}

function firstSectionContentTypes(editor: Editor): string[] {
  return firstNodeChildTypes(editor, "section");
}

function firstNodeChildTypes(editor: Editor, nodeType: string): string[] {
  let out: string[] | null = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== nodeType) return true;
    out = [];
    node.forEach((child) => out?.push(child.type.name));
    return false;
  });

  if (!out) throw new Error(`expected "${nodeType}" node`);
  return out;
}

function paragraph(): JSONContent {
  return { type: "paragraph" };
}

function cell(content: JSONContent[]): JSONContent {
  return {
    type: "cell",
    attrs: { id: `cell-${content.length}` },
    content,
  };
}

function grid(): JSONContent {
  return {
    type: "grid",
    attrs: { id: "grid-b" },
    content: [cell([paragraph()])],
  };
}

function tabsLayout(): JSONContent {
  return tabsLayoutWithSectionContent([paragraph()]);
}

function tabsLayoutWithSectionContent(content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: "layout-tabs", variant: "tabs" },
    content: [
      {
        type: "section",
        attrs: { id: "section-tabs", role: "tab-panel" },
        content,
      },
    ],
  };
}

function basicLayout(): JSONContent {
  return basicLayoutWithSectionContent([paragraph()]);
}

function basicLayoutWithSectionContent(content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: "layout-basic", variant: "basic" },
    content: [
      {
        type: "section",
        attrs: { id: "section-basic" },
        content,
      },
    ],
  };
}
