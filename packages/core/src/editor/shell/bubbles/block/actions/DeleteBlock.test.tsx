// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { createDisposableEditor } from "@/editor/testing";

import { DeleteBlock } from "./DeleteBlock";

const TestBlockNode = Node.create({
  name: "test_delete_block",
  group: "block",

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-delete-block]" }];
  },

  renderHTML() {
    return ["div", { "data-test-delete-block": "" }];
  },
});

function makeEditor() {
  return createDisposableEditor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestBlockNode],
    content: {
      type: "doc",
      content: [
        {
          type: "test_delete_block",
          attrs: { id: "delete-me" },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep me" }],
        },
      ],
    },
  });
}

describe("DeleteBlock", () => {
  it("deletes the explicit block target through a checked transaction", async () => {
    const fixture = makeEditor();
    const { editor } = fixture;

    render(
      <TooltipProvider>
        <DeleteBlock editor={editor} pos={0} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete block" }));

    expect(fixture.topLevelNodeTypes()).toEqual(["paragraph"]);
    expect(editor.state.doc.textContent).toBe("Keep me");

    fixture.destroy();
  });
});
