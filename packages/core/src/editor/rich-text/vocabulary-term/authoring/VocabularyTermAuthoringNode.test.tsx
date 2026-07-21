// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { VocabularyTermAuthoringNode } from "./VocabularyTermAuthoringNode";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  cleanup();
});

describe("VocabularyTermAuthoringNode", () => {
  it("renders non-editable authoring presentation and selects itself on pointer intent", async () => {
    editor = new Editor({
      extensions: [StarterKit, VocabularyTermAuthoringNode],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "vocabTerm",
                attrs: { term: "schema", definition: "A structural contract." },
              },
            ],
          },
        ],
      },
    });

    const { container } = render(<EditorContent editor={editor} />);
    const term = await waitFor(() => {
      const element = container.querySelector('[data-type="vocab-term"]');
      if (!(element instanceof HTMLElement)) throw new Error("expected vocabulary term NodeView");
      return element;
    });

    expect(term.getAttribute("contenteditable")).toBe("false");
    expect(term.classList.contains("sc-vocabulary-term--authoring")).toBe(true);
    fireEvent.mouseDown(term);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(
      editor.state.selection instanceof NodeSelection
        ? editor.state.selection.node.type.name
        : null,
    ).toBe("vocabTerm");
  });
});
