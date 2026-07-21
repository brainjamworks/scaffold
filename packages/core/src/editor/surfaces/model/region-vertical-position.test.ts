// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import {
  readRegionVerticalPosition,
  setRegionVerticalPositionInTransaction,
} from "./region-vertical-position";

const RegionChildNode = Node.create({
  name: "regionVerticalPositionTestBlock",
  group: "block",
  content: "paragraph+",
  addAttributes() {
    return {
      horizontalAlignment: { default: "left" },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },
});

const TestArrangementNode = Node.create({
  name: "regionVerticalPositionTestArrangement",
  group: "arrangement",
  content: "paragraph+",
  renderHTML() {
    return ["div", 0];
  },
});

describe("Region vertical content position", () => {
  it("normalizes missing and invalid values to top", () => {
    const editor = createEditor();

    try {
      const regionType = editor.schema.nodes.region;
      if (!regionType) throw new Error("expected Region node type");

      expect(readRegionVerticalPosition(regionType.create())).toBe("top");
      expect(readRegionVerticalPosition(regionType.create({ verticalPosition: "sideways" }))).toBe(
        "top",
      );
    } finally {
      editor.destroy();
    }
  });

  it("updates a supplied transaction while preserving identity, role, content, and child alignment", () => {
    const editor = createEditor();

    try {
      const pos = nodePos(editor, "region");
      const tr = setRegionVerticalPositionInTransaction(editor.state.tr, pos, "middle");

      const region = tr?.doc.nodeAt(pos);
      expect(region?.attrs).toMatchObject({
        id: "region-a",
        role: "main",
        verticalPosition: "middle",
      });
      expect(region?.textContent).toBe("Region content");
      expect(region?.firstChild?.attrs["horizontalAlignment"]).toBe("right");
      expect(editor.state.doc.nodeAt(pos)?.attrs["verticalPosition"]).toBe("top");
    } finally {
      editor.destroy();
    }
  });

  it("supports transaction composition without dispatching", () => {
    const editor = createEditor();

    try {
      const pos = nodePos(editor, "region");
      const tr = setRegionVerticalPositionInTransaction(editor.state.tr, pos, "bottom");

      expect(tr).not.toBeNull();
      expect(tr?.doc.nodeAt(pos)?.attrs["verticalPosition"]).toBe("bottom");
      expect(editor.state.doc.nodeAt(pos)?.attrs["verticalPosition"]).toBe("top");
    } finally {
      editor.destroy();
    }
  });

  it("rejects stale positions, wrong node types, and invalid values", () => {
    const editor = createEditor();

    try {
      const pos = nodePos(editor, "region");
      expect(setRegionVerticalPositionInTransaction(editor.state.tr, 999, "middle")).toBeNull();
      expect(setRegionVerticalPositionInTransaction(editor.state.tr, 1, "middle")).toBeNull();
      expect(
        setRegionVerticalPositionInTransaction(editor.state.tr, pos, "sideways" as never),
      ).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

function createEditor(): Editor {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      RegionChildNode,
      TestArrangementNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
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
                      type: "regionVerticalPositionTestBlock",
                      attrs: { horizontalAlignment: "right" },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Region content" }],
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

function nodePos(editor: Editor, type: string): number {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== type) return true;
    result = pos;
    return false;
  });
  if (result === null) throw new Error(`expected ${type}`);
  return result;
}
