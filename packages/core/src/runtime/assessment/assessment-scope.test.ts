import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";

import { resolveAssessmentSurfaceScope } from "./assessment-scope";

const TestAssessmentNode = Node.create({
  name: "test_assessment_block",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-test-assessment-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-assessment-block": "" }];
  },
});

const TestArrangementNode = Node.create({
  name: "test_arrangement",
  group: "arrangement",
  atom: true,
});

const editors: Editor[] = [];

function makeEditor({
  blockId = "block-1",
  surfaceId = "surface-1",
}: {
  blockId?: string | null;
  surfaceId?: string | null;
} = {}) {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, undoRedo: false }),
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      TestAssessmentNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: surfaceId, variant: "page-default" },
              content: [
                {
                  type: "test_assessment_block",
                  attrs: { id: blockId },
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

function findAssessmentBlockPos(editor: Editor): number {
  let blockPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "test_assessment_block") {
      blockPos = pos;
      return false;
    }
    return true;
  });
  if (blockPos === null) {
    throw new Error("expected test assessment block");
  }
  return blockPos;
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

describe("resolveAssessmentSurfaceScope", () => {
  it("resolves the nearest ancestor surface id for a block position", () => {
    const editor = makeEditor();
    const blockPos = findAssessmentBlockPos(editor);

    expect(
      resolveAssessmentSurfaceScope({
        doc: editor.state.doc,
        blockPos,
      }),
    ).toEqual({ ok: true, surfaceId: "surface-1" });
  });

  it("reports unsafe identity when the ancestor surface id is missing", () => {
    const editor = makeEditor({ surfaceId: "" });
    const blockPos = findAssessmentBlockPos(editor);

    expect(
      resolveAssessmentSurfaceScope({
        doc: editor.state.doc,
        blockPos,
      }),
    ).toEqual({ ok: false, reason: "missing-surface-id" });
  });
});
