import { Editor, Node, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { countAssessmentHints, findAncestorAssessmentId } from "./assessment-prosemirror";

const documentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
});

const textNode = Node.create({
  name: "text",
  group: "inline",
});

const ownerNode = Node.create({
  name: "assessment_owner",
  group: "block",
  content: "block+",
  addAttributes: () => ({ id: { default: null } }),
});

const childNode = Node.create({
  name: "assessment_child",
  group: "block",
  atom: true,
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function createEditor(content?: JSONContent): Editor {
  const editor = new Editor({
    extensions: [documentNode, textNode, ownerNode, childNode],
    content: content ?? {
      type: "doc",
      content: [
        {
          type: "assessment_owner",
          attrs: { id: "problem-one" },
          content: [{ type: "assessment_child" }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function positionOf(editor: Editor, nodeType: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found === null && node.type.name === nodeType) found = pos;
  });
  if (found === null) throw new Error(`expected ${nodeType} in test document`);
  return found;
}

describe("findAncestorAssessmentId", () => {
  it("returns the nearest matching assessment ancestor id", () => {
    const editor = createEditor();

    expect(findAncestorAssessmentId(editor, 1, ["assessment_owner"])).toBe("problem-one");
  });

  it("supports a node matcher and prefers the nearest matching ancestor", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "assessment_owner",
          attrs: { id: "outer-problem" },
          content: [
            {
              type: "assessment_owner",
              attrs: { id: "inner-problem" },
              content: [{ type: "assessment_child" }],
            },
          ],
        },
      ],
    });

    expect(
      findAncestorAssessmentId(
        editor,
        positionOf(editor, "assessment_child"),
        (node) => node.type.name === "assessment_owner",
      ),
    ).toBe("inner-problem");
  });

  it.each([undefined, -1, Number.NaN, 99])("returns null for invalid position %s", (position) => {
    const editor = createEditor();

    expect(findAncestorAssessmentId(editor, position, ["assessment_owner"])).toBeNull();
  });

  it("returns null when no ancestor matches", () => {
    const editor = createEditor();

    expect(findAncestorAssessmentId(editor, 1, ["other_owner"])).toBeNull();
  });

  it.each([null, " "])("returns null for a %s ancestor id", (id) => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "assessment_owner",
          attrs: { id },
          content: [{ type: "assessment_child" }],
        },
      ],
    });

    expect(findAncestorAssessmentId(editor, 1, ["assessment_owner"])).toBeNull();
  });
});

describe("countAssessmentHints", () => {
  it("counts hints nested under the structural action group", () => {
    const block = fakeNode("mcq", [
      fakeNode("assessment_prompt"),
      fakeNode("assessment_choices_group"),
      fakeNode("assessment_actions_group", [
        fakeNode("assessment_hints_group", [
          fakeNode("assessment_hint"),
          fakeNode("assessment_hint"),
        ]),
        fakeNode("assessment_summary_feedback"),
      ]),
    ]);

    expect(countAssessmentHints(block)).toBe(2);
  });
});

function fakeNode(typeName: string, children: ProseMirrorNode[] = []): ProseMirrorNode {
  return {
    childCount: children.length,
    type: { name: typeName },
    forEach: (callback: (node: ProseMirrorNode, offset: number, index: number) => void) => {
      children.forEach((child, index) => callback(child, index, index));
    },
  } as unknown as ProseMirrorNode;
}
