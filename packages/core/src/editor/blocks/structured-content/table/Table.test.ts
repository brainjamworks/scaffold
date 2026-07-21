// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createStableId } from "@/document/model/identity/stable-ids";
import { AUTHORING_FRAME_EDITABLE_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { resolveEditorPlaceholder } from "@/editor/prosemirror/placeholder/resolve-editor-placeholder";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createCatalogNodeChecked } from "@/editor/insertion/checked-insertion";
import { describeBlockContract } from "@/editor/testing";

import "./table-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "table",
  catalogId: "table",
  expectsFrame: true,
  expectsAuthoringResizeWrapper: false,
  expectsAuthoringFrame: true,
});

describe("Table containment contract", () => {
  it("keeps authoring controls on the single table definition", () => {
    const tableDefinitions = builtInBlockRegistry.definitions.filter(
      (definition) => definition.nodeType === "table",
    );

    expect(tableDefinitions).toHaveLength(1);
    expect(tableDefinitions[0]?.authoringControls?.controls).toBeTypeOf("function");
  });

  it("registers table authoring controls for the block bubble", () => {
    const editor = createTableContractEditor();
    try {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: createStableId(), variant: "page-default" },
                content: [createTableJson(editor)],
              },
            ],
          },
        ],
      });

      const tablePos = firstNodePos(editor, "table");
      editor.commands.setTextSelection(firstTextPos(editor, "Column 1"));

      const controls =
        builtInBlockRegistry.getByNodeType("table")?.authoringControls?.controls({
          editor,
          nodeType: "table",
          pos: tablePos,
        }) ?? [];

      expect(controls.map((control) => (control.kind === "action" ? control.id : ""))).toContain(
        "table:add-row-after",
      );
      expect(
        controls.find(
          (control) => control.kind === "action" && control.id === "table:add-row-after",
        ),
      ).toMatchObject({ disabled: false });
    } finally {
      editor.destroy();
    }
  });

  it("registers table-owned placeholder policy", () => {
    expect(builtInBlockRegistry.getByNodeType("table")?.placeholders).toMatchObject({
      tableCell: "",
      tableHeader: "",
    });
  });

  it("runs contextual row commands through Tiptap table commands", () => {
    const editor = createTableContractEditor();
    try {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: createStableId(), variant: "page-default" },
                content: [createTableJson(editor)],
              },
            ],
          },
        ],
      });

      editor.commands.setTextSelection(firstTextPos(editor, "Column 1"));
      const before = countNodes(editor, "tableRow");
      const controls =
        builtInBlockRegistry.getByNodeType("table")?.authoringControls?.controls({
          editor,
          nodeType: "table",
          pos: firstNodePos(editor, "table"),
        }) ?? [];
      const addRow = controls.find(
        (control) => control.kind === "action" && control.id === "table:add-row-after",
      );

      expect(addRow?.kind).toBe("action");
      if (!addRow || addRow.kind !== "action") throw new Error("add row control missing");
      addRow.run?.();

      expect(countNodes(editor, "tableRow")).toBe(before + 1);
      expect(() => editor.state.doc.check()).not.toThrow();
    } finally {
      editor.destroy();
    }
  });

  it("marks table cells as editable interiors of the block authoring frame", async () => {
    const editor = createTableContractEditor();
    try {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: createStableId(), variant: "page-default" },
                content: [createTableJson(editor)],
              },
            ],
          },
        ],
      });

      render(createElement(EditorContent, { editor }));

      await waitFor(() => {
        const table = document.body.querySelector('table[data-authoring-frame="block"]');
        const cells = Array.from(document.body.querySelectorAll("th, td"));

        expect(table).not.toBeNull();
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.every((cell) => cell.hasAttribute(AUTHORING_FRAME_EDITABLE_ATTR))).toBe(true);
      });
    } finally {
      cleanup();
      editor.destroy();
    }
  });

  it("can be authored directly on a surface, inside a grid cell, and inside a layout section", () => {
    const editor = createTableContractEditor();
    try {
      const surfaceTable = createTableJson(editor);
      const gridTable = createTableJson(editor);
      const layoutTable = createTableJson(editor);

      expect(() => {
        editor.schema
          .nodeFromJSON({
            type: "doc",
            content: [
              {
                type: "courseDocument",
                content: [
                  {
                    type: "surface",
                    attrs: { id: createStableId(), variant: "page-default" },
                    content: [
                      surfaceTable,
                      {
                        type: "grid",
                        attrs: {
                          id: createStableId(),
                          columnWidths: [1],
                        },
                        content: [
                          {
                            type: "cell",
                            attrs: { id: createStableId() },
                            content: [gridTable],
                          },
                        ],
                      },
                      {
                        type: "layout",
                        attrs: { id: createStableId() },
                        content: [
                          {
                            type: "section",
                            attrs: { id: createStableId() },
                            content: [layoutTable],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          })
          .check();
      }).not.toThrow();
    } finally {
      editor.destroy();
    }
  });

  it("keeps table cells as text content rather than nested Course block containers", () => {
    const editor = createTableContractEditor();
    try {
      const nestedTable = createTableJson(editor);

      expect(() => {
        editor.schema
          .nodeFromJSON({
            type: "table",
            attrs: { id: createStableId() },
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [nestedTable],
                  },
                ],
              },
            ],
          })
          .check();
      }).toThrow();
    } finally {
      editor.destroy();
    }
  });

  it("does not advertise slash block insertion inside empty table cells", () => {
    const editor = createTableContractEditor();
    try {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: createStableId(), variant: "page-default" },
                content: [createTableJson(editor)],
              },
            ],
          },
        ],
      });

      const emptyCellParagraphs = Array.from(editor.view.dom.querySelectorAll("td p.is-empty"));

      expect(emptyCellParagraphs.length).toBeGreaterThan(0);
      expect(
        emptyCellParagraphs.every((paragraph) => paragraph.getAttribute("data-placeholder") === ""),
      ).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("resolves table cell paragraph placeholders through the table owner", () => {
    const editor = createTableContractEditor();
    try {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: createStableId(), variant: "page-default" },
                content: [createTableJson(editor)],
              },
            ],
          },
        ],
      });

      let targetNode: ProseMirrorNode | null = null;
      let targetPos: number | null = null;
      editor.state.doc.descendants((node, pos, parent) => {
        if (targetNode) return false;
        if (node.type.name !== "paragraph") return true;
        if (parent?.type.name !== "tableCell") return true;
        targetNode = node;
        targetPos = pos;
        return false;
      });

      expect(targetNode).not.toBeNull();
      expect(targetPos).not.toBeNull();
      if (!targetNode || targetPos === null) {
        throw new Error("missing table cell paragraph");
      }
      expect(
        resolveEditorPlaceholder({
          editor,
          node: targetNode,
          pos: targetPos,
        }),
      ).toBe("");
    } finally {
      editor.destroy();
    }
  });
});

function createTableContractEditor(): Editor {
  return new Editor({
    extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
  });
}

function createTableJson(editor: Editor) {
  const result = createCatalogNodeChecked({
    catalog: builtInInsertCatalog,
    schema: editor.schema,
    catalogId: "table",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issue.message);
  return result.node.toJSON();
}

function firstNodePos(editor: Editor, nodeType: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Could not find ${nodeType}`);
  return found;
}

function firstTextPos(editor: Editor, text: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText || node.text !== text) return true;
    found = pos + 1;
    return false;
  });
  if (found === null) throw new Error(`Could not find text "${text}"`);
  return found;
}

function countNodes(editor: Editor, nodeType: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) count += 1;
  });
  return count;
}
