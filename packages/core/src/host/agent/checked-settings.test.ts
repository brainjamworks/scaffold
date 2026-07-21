// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { emptyQuizSettings } from "@/editor/blocks/assessment/quiz/quiz-shared";

import { updateRegisteredNodeSettingsChecked } from "./checked-settings";

const TestSettingsBlockNode = Node.create({
  name: "quiz",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      settings: { default: emptyQuizSettings() },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

const OtherSettingsBlockNode = Node.create({
  name: "test_other_agent_settings_block",
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

function makeEditor() {
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
          type: "quiz",
          attrs: { id: "block-a", settings: emptyQuizSettings() },
        },
        {
          type: "test_other_agent_settings_block",
          attrs: { id: "block-b", settings: { points: 1 } },
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

describe("updateRegisteredNodeSettingsChecked", () => {
  it("looks up registered settings and updates without dispatching", () => {
    const editor = makeEditor();

    const result = updateRegisteredNodeSettingsChecked({
      tr: editor.state.tr,
      nodeId: "block-a",
      nodeType: "quiz",
      value: emptyQuizSettings({ allowBacktracking: false }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.nodeAt(0)?.attrs["settings"]).toEqual(
      emptyQuizSettings({ allowBacktracking: false }),
    );
    expect(editor.state.doc.nodeAt(0)?.attrs["settings"]).toEqual(emptyQuizSettings());
  });

  it("preserves schema-validation failures from the document command", () => {
    const editor = makeEditor();

    const result = updateRegisteredNodeSettingsChecked({
      tr: editor.state.tr,
      nodeId: "block-a",
      nodeType: "quiz",
      value: { ...emptyQuizSettings(), attemptsPerQuestion: 0 },
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_settings_value" }),
    });
  });

  it("rejects node types without registered settings", () => {
    const editor = makeEditor();

    const result = updateRegisteredNodeSettingsChecked({
      tr: editor.state.tr,
      nodeId: "block-b",
      nodeType: "test_other_agent_settings_block",
      value: { points: 5 },
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "missing_settings_configuration" }),
    });
  });
});
