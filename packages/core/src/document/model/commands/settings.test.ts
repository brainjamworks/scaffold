// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import { updateNodeSettingsChecked } from "./settings";

const SettingsSchema = z.object({
  points: z.number().int().nonnegative(),
});

const TestSettingsBlockNode = Node.create({
  name: "test_document_settings_block",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      settings: { default: { points: 1 } },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

const OtherSettingsBlockNode = Node.create({
  name: "test_other_document_settings_block",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      settings: { default: { points: 1 } },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

function makeEditor(extraContent: Record<string, unknown>[] = []) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      TestSettingsBlockNode,
      OtherSettingsBlockNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "test_document_settings_block",
          attrs: { id: "block-a", settings: { points: 1 } },
        },
        {
          type: "test_other_document_settings_block",
          attrs: { id: "block-b", settings: { points: 1 } },
        },
        ...extraContent,
      ],
    },
  });
  editors.push(editor);
  return editor;
}

describe("updateNodeSettingsChecked", () => {
  it("updates validated node settings on a transaction without dispatching", () => {
    const editor = makeEditor();

    const result = updateNodeSettingsChecked({
      tr: editor.state.tr,
      nodeId: "block-a",
      nodeType: "test_document_settings_block",
      attr: "settings",
      schema: SettingsSchema,
      value: { points: 5 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.nodeAt(0)?.attrs["settings"]).toEqual({ points: 5 });
    expect(editor.state.doc.nodeAt(0)?.attrs["settings"]).toEqual({ points: 1 });
  });

  it("rejects values that do not pass the supplied schema", () => {
    const editor = makeEditor();

    const result = updateNodeSettingsChecked({
      tr: editor.state.tr,
      nodeId: "block-a",
      nodeType: "test_document_settings_block",
      attr: "settings",
      schema: SettingsSchema,
      value: { points: -1 },
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_settings_value" }),
    });
    expect(editor.state.doc.nodeAt(0)?.attrs["settings"]).toEqual({ points: 1 });
  });

  it("rejects missing nodes and wrong node types", () => {
    const editor = makeEditor();

    expect(
      updateNodeSettingsChecked({
        tr: editor.state.tr,
        nodeId: "missing-block",
        nodeType: "test_document_settings_block",
        attr: "settings",
        schema: SettingsSchema,
        value: { points: 5 },
      }),
    ).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "missing_node" }),
    });

    expect(
      updateNodeSettingsChecked({
        tr: editor.state.tr,
        nodeId: "block-b",
        nodeType: "test_document_settings_block",
        attr: "settings",
        schema: SettingsSchema,
        value: { points: 5 },
      }),
    ).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "wrong_node_type" }),
    });
  });

  it("rejects duplicate stable ids without adding transaction steps", () => {
    const editor = makeEditor([
      {
        type: "test_document_settings_block",
        attrs: { id: "block-a", settings: { points: 2 } },
      },
    ]);
    const tr = editor.state.tr;

    expect(
      updateNodeSettingsChecked({
        tr,
        nodeId: "block-a",
        nodeType: "test_document_settings_block",
        attr: "settings",
        schema: SettingsSchema,
        value: { points: 5 },
      }),
    ).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "duplicate_node_id" }),
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });
});
