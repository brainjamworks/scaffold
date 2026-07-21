// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { VocabularyTermRuntimeNode } from "./VocabularyTermRuntimeNode";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  cleanup();
});

describe("VocabularyTermRuntimeNode", () => {
  it("renders an accessible learner trigger that reveals the definition", async () => {
    const user = userEvent.setup();
    editor = new Editor({
      editable: false,
      extensions: [StarterKit, VocabularyTermRuntimeNode],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "vocabTerm",
                attrs: {
                  term: "schema",
                  definition: "A structural contract for content.",
                },
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
    expect(term.getAttribute("data-vocab-definition")).toBe("A structural contract for content.");

    await user.click(screen.getByRole("button", { name: "schema" }));
    expect(await screen.findByText("A structural contract for content.")).toBeInTheDocument();
  });
});
