// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  moveSiblingNode,
  moveSiblingNodeTo,
} from "@/editor/prosemirror/move-sibling/move-sibling-node";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

const TestItemNode = Node.create({
  name: "test_reorder_item",
  content: "paragraph",
  addAttributes() {
    return {
      id: {
        default: "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-test-reorder-item]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },
});

const TestGroupNode = Node.create({
  name: "test_reorder_group",
  group: "block",
  content: "test_reorder_item+",
  parseHTML() {
    return [{ tag: "div[data-test-reorder-group]" }];
  },
  renderHTML() {
    return ["div", { "data-test-reorder-group": "" }, 0];
  },
});

const SelectableChoiceNode = Node.create({
  name: "selectable_choice",
  content: "paragraph",
  addAttributes() {
    return {
      id: {
        default: "",
      },
      isCorrect: {
        default: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-node="selectable-choice"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": "selectable-choice" }, 0];
  },
});

const AssessmentChoicesGroupNode = Node.create({
  name: "assessment_choices_group",
  group: "block",
  content: "selectable_choice+",
  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-choices-group"]' }];
  },
  renderHTML() {
    return ["div", { "data-slot": "assessment-choices-group" }, 0];
  },
});

const SequencingItemNode = Node.create({
  name: "sequencing_item",
  content: "paragraph",
  addAttributes() {
    return {
      id: {
        default: "",
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-node="sequencing-item"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": "sequencing-item" }, 0];
  },
});

const SequencingItemsGroupNode = Node.create({
  name: "sequencing_items_group",
  group: "block",
  content: "sequencing_item+",
  parseHTML() {
    return [{ tag: 'div[data-slot="sequencing-items-group"]' }];
  },
  renderHTML() {
    return ["div", { "data-slot": "sequencing-items-group" }, 0];
  },
});

function makeEditor({ undoRedo = false }: { undoRedo?: boolean } = {}) {
  return new Editor({
    extensions: [
      StarterKit.configure({
        undoRedo: undoRedo ? {} : false,
        paragraph: false,
      }),
      ExtendedParagraph,
      TestItemNode,
      TestGroupNode,
      SelectableChoiceNode,
      AssessmentChoicesGroupNode,
      SequencingItemNode,
      SequencingItemsGroupNode,
    ],
  });
}

function docJson(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "test_reorder_group",
        content: [
          {
            type: "test_reorder_item",
            attrs: { id: "a" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "test_reorder_item",
            attrs: { id: "b" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "test_reorder_item",
            attrs: { id: "c" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function choicesDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "assessment_choices_group",
        content: [
          {
            type: "selectable_choice",
            attrs: { id: "a", isCorrect: false },
            content: [{ type: "paragraph" }],
          },
          {
            type: "selectable_choice",
            attrs: { id: "b", isCorrect: true },
            content: [{ type: "paragraph" }],
          },
          {
            type: "selectable_choice",
            attrs: { id: "c", isCorrect: false },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function twoChoiceGroupsDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "assessment_choices_group",
        content: [
          {
            type: "selectable_choice",
            attrs: { id: "a", isCorrect: false },
            content: [{ type: "paragraph" }],
          },
        ],
      },
      {
        type: "assessment_choices_group",
        content: [
          {
            type: "selectable_choice",
            attrs: { id: "b", isCorrect: true },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function sequencingDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "sequencing_items_group",
        content: [
          {
            type: "sequencing_item",
            attrs: { id: "a" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "sequencing_item",
            attrs: { id: "b" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "sequencing_item",
            attrs: { id: "c" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function itemPositions(editor: Editor): Record<string, number> {
  const out: Record<string, number> = {};
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "test_reorder_item") return;
    out[String(node.attrs["id"])] = pos;
  });
  return out;
}

function nodePositions(editor: Editor, type: string, attr = "id"): Record<string, number> {
  const out: Record<string, number> = {};
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== type) return;
    out[String(node.attrs[attr])] = pos;
  });
  return out;
}

function itemIds(editor: Editor, groupType = "test_reorder_group"): string[] {
  const group = editor.getJSON().content?.[0] as JSONContent | undefined;
  expect(group?.type).toBe(groupType);
  return (group?.content ?? []).map((item) => String(item.attrs?.["id"]));
}

describe("moveSiblingNode", () => {
  it("moves a node up and down inside its parent", () => {
    const editor = makeEditor();
    editor.commands.setContent(docJson());

    expect(moveSiblingNode(editor, itemPositions(editor)["b"]!, "up")).toBe(true);
    expect(itemIds(editor)).toEqual(["b", "a", "c"]);
    expect(moveSiblingNode(editor, itemPositions(editor)["b"]!, "down")).toBe(true);
    expect(itemIds(editor)).toEqual(["a", "b", "c"]);

    editor.destroy();
  });

  it("does not move beyond parent boundaries", () => {
    const editor = makeEditor();
    editor.commands.setContent(docJson());

    expect(moveSiblingNode(editor, itemPositions(editor)["a"]!, "up")).toBe(false);
    expect(moveSiblingNode(editor, itemPositions(editor)["c"]!, "down")).toBe(false);
    expect(itemIds(editor)).toEqual(["a", "b", "c"]);

    editor.destroy();
  });

  it("moves a selectable choice before or after a sibling in the same parent", () => {
    const editor = makeEditor();
    editor.commands.setContent(choicesDoc());

    const positions = nodePositions(editor, "selectable_choice");
    expect(moveSiblingNodeTo(editor, positions["a"]!, positions["c"]!, "after")).toBe(true);

    expect(itemIds(editor, "assessment_choices_group")).toEqual(["b", "c", "a"]);
    expect(
      (editor.getJSON().content?.[0] as JSONContent | undefined)?.content?.map(
        (item) => item.attrs,
      ),
    ).toEqual([
      { id: "b", isCorrect: true },
      { id: "c", isCorrect: false },
      { id: "a", isCorrect: false },
    ]);

    editor.destroy();
  });

  it("moves a sequencing item before a sibling in the same parent", () => {
    const editor = makeEditor();
    editor.commands.setContent(sequencingDoc());

    const positions = nodePositions(editor, "sequencing_item");
    expect(moveSiblingNodeTo(editor, positions["c"]!, positions["a"]!, "before")).toBe(true);

    expect(itemIds(editor, "sequencing_items_group")).toEqual(["c", "a", "b"]);

    editor.destroy();
  });

  it("rejects targeted sibling moves across parent boundaries", () => {
    const editor = makeEditor();
    editor.commands.setContent(twoChoiceGroupsDoc());
    const positions = nodePositions(editor, "selectable_choice");

    expect(moveSiblingNodeTo(editor, positions["a"]!, positions["b"]!, "after")).toBe(false);

    const groups = (editor.getJSON().content ?? []).filter(
      (node) => node.type === "assessment_choices_group",
    );
    expect(
      groups.map((group) => {
        const child = group.content?.[0] as JSONContent | undefined;
        return child?.attrs?.["id"];
      }),
    ).toEqual(["a", "b"]);

    editor.destroy();
  });

  it("treats already-adjacent targeted sibling moves as no-ops", () => {
    const editor = makeEditor();
    editor.commands.setContent(choicesDoc());
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const positions = nodePositions(editor, "selectable_choice");

    expect(moveSiblingNodeTo(editor, positions["b"]!, positions["c"]!, "before")).toBe(false);

    expect(dispatch).not.toHaveBeenCalled();
    expect(itemIds(editor, "assessment_choices_group")).toEqual(["a", "b", "c"]);

    editor.destroy();
  });

  it("commits a targeted sibling move as one authored transaction", () => {
    const editor = makeEditor({ undoRedo: true });
    editor.commands.setContent(sequencingDoc());
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const positions = nodePositions(editor, "sequencing_item");

    expect(moveSiblingNodeTo(editor, positions["a"]!, positions["c"]!, "after")).toBe(true);
    expect(itemIds(editor, "sequencing_items_group")).toEqual(["b", "c", "a"]);
    expect(dispatch).toHaveBeenCalledTimes(1);

    editor.destroy();
  });
});
