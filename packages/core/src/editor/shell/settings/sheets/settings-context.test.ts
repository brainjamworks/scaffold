import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { resolveSettingsContext } from "./settings-context";

const SettingsContextChildNode = Node.create({
  name: "settings_context_child",
  group: "block assessment_question",
  atom: true,
  addAttributes: () => ({
    id: { default: null },
    settings: { default: {} },
  }),
  parseHTML: () => [{ tag: "settings-context-child" }],
  renderHTML: ({ HTMLAttributes }) => ["settings-context-child", HTMLAttributes],
});

const SettingsContextParentNode = Node.create({
  name: "settings_context_parent",
  group: "block",
  content: "settings_context_child*",
  addAttributes: () => ({
    id: { default: null },
  }),
  parseHTML: () => [{ tag: "settings-context-parent" }],
  renderHTML: ({ HTMLAttributes }) => ["settings-context-parent", HTMLAttributes, 0],
});

const SettingsContextPlainParentNode = Node.create({
  name: "settings_context_plain_parent",
  group: "block",
  content: "settings_context_child*",
  addAttributes: () => ({
    id: { default: null },
  }),
  parseHTML: () => [{ tag: "settings-context-plain-parent" }],
  renderHTML: ({ HTMLAttributes }) => ["settings-context-plain-parent", HTMLAttributes, 0],
});

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: "settings_context_child" }),
  defineBlock({
    nodeType: "settings_context_parent",
    childSettings: {
      managedFields: [
        {
          childGroup: "assessment_question",
          names: ["feedbackMode", "showAnswer"],
          reason: "Managed by parent",
          hints: {
            feedbackMode: "Parent decides when review appears.",
            showAnswer: "Parent decides whether correct answers are visible.",
          },
        },
      ],
    },
  }),
  defineBlock({ nodeType: "settings_context_plain_parent" }),
]);

function createSettingsContextEditor(parentType: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      SettingsContextParentNode,
      SettingsContextPlainParentNode,
      SettingsContextChildNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: parentType,
          attrs: { id: "parent" },
          content: [
            {
              type: "settings_context_child",
              attrs: { id: "child", settings: {} },
            },
          ],
        },
      ],
    },
  });
}

function findNodePos(editor: Editor, nodeType: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found === null && node.type.name === nodeType) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) throw new Error(`expected ${nodeType} node`);
  return found;
}

describe("resolveSettingsContext", () => {
  it("returns parent-managed settings for a child matching the parent policy group", () => {
    const editor = createSettingsContextEditor("settings_context_parent");
    const pos = findNodePos(editor, "settings_context_child");

    const context = resolveSettingsContext({
      blockDefinitions: testBlockRegistry,
      editor,
      target: { nodeType: "settings_context_child", pos },
    });

    expect(context.managedFields.get("feedbackMode")).toEqual({
      name: "feedbackMode",
      reason: "Managed by parent",
      hint: "Parent decides when review appears.",
    });
    expect(context.managedFields.get("showAnswer")).toEqual({
      name: "showAnswer",
      reason: "Managed by parent",
      hint: "Parent decides whether correct answers are visible.",
    });

    editor.destroy();
  });

  it("returns no managed settings for a standalone child", () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), SettingsContextChildNode],
      content: {
        type: "doc",
        content: [
          {
            type: "settings_context_child",
            attrs: { id: "child", settings: {} },
          },
        ],
      },
    });
    const pos = findNodePos(editor, "settings_context_child");

    const context = resolveSettingsContext({
      blockDefinitions: testBlockRegistry,
      editor,
      target: { nodeType: "settings_context_child", pos },
    });

    expect(context.managedFields.size).toBe(0);

    editor.destroy();
  });

  it("returns no managed settings when the parent has no child settings policy", () => {
    const editor = createSettingsContextEditor("settings_context_plain_parent");
    const pos = findNodePos(editor, "settings_context_child");

    const context = resolveSettingsContext({
      blockDefinitions: testBlockRegistry,
      editor,
      target: { nodeType: "settings_context_child", pos },
    });

    expect(context.managedFields.size).toBe(0);

    editor.destroy();
  });
});
