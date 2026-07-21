// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { DuplicateBlock } from "./DuplicateBlock";

const STABLE_ID_PATTERN = /^[0-9A-Z_a-z-]{12}$/;

const TestMcqNode = Node.create({
  name: "mcq",
  group: "block",
  content: "selectable_choice*",

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-mcq]" }];
  },

  renderHTML() {
    return ["div", { "data-test-mcq": "" }, 0];
  },
});

const TestSelectableChoiceNode = Node.create({
  name: "selectable_choice",
  content: "inline*",

  addAttributes() {
    return {
      id: { default: null },
      isCorrect: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-test-choice]" }];
  },

  renderHTML() {
    return ["span", { "data-test-choice": "" }, 0];
  },
});

const TestGalleryNode = Node.create({
  name: "gallery",
  group: "block",
  content: "gallery_item*",

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-test-gallery]" }];
  },

  renderHTML() {
    return ["section", { "data-test-gallery": "" }, 0];
  },
});

const TestGalleryItemNode = Node.create({
  name: "gallery_item",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      data: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-test-gallery-item]" }];
  },

  renderHTML() {
    return ["figure", { "data-test-gallery-item": "" }];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestMcqNode,
      TestSelectableChoiceNode,
      TestGalleryNode,
      TestGalleryItemNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: { id: "block-source" },
          content: [
            {
              type: "selectable_choice",
              attrs: { id: "choice-source", isCorrect: true },
              content: [{ type: "text", text: "A" }],
            },
          ],
        },
      ],
    },
  });
}

function makeGalleryEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestGalleryNode, TestGalleryItemNode],
    content: {
      type: "doc",
      content: [
        {
          type: "gallery",
          attrs: { id: "block-gallery-source" },
          content: [
            {
              type: "gallery_item",
              attrs: {
                id: "component-gallery-item-a",
                data: { src: "a.jpg" },
              },
            },
            {
              type: "gallery_item",
              attrs: {
                id: "component-gallery-item-b",
                data: { src: "b.jpg" },
              },
            },
          ],
        },
      ],
    },
  });
}

describe("DuplicateBlock", () => {
  it("duplicates with fresh stable block and component ids", async () => {
    const editor = makeEditor();

    render(
      <TooltipProvider>
        <DuplicateBlock editor={editor} pos={0} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Duplicate block" }));

    const blocks = ((editor.getJSON().content ?? []) as JSONContent[]).filter(
      (node) => node.type === "mcq",
    );
    const clone = blocks[1] as JSONContent | undefined;
    const clonedChoice = clone?.content?.[0] as JSONContent | undefined;

    expect(blocks).toHaveLength(2);
    expect(clone?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone?.attrs?.["id"]).not.toBe("block-source");
    expect(clonedChoice?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clonedChoice?.attrs?.["id"]).not.toBe("choice-source");

    editor.destroy();
  });

  it("duplicates galleries with fresh block and item ids", async () => {
    const editor = makeGalleryEditor();

    render(
      <TooltipProvider>
        <DuplicateBlock editor={editor} pos={0} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Duplicate block" }));

    const galleries = ((editor.getJSON().content ?? []) as JSONContent[]).filter(
      (node) => node.type === "gallery",
    );
    const clone = galleries[1] as JSONContent | undefined;
    const cloneItems = clone?.content ?? [];

    expect(galleries).toHaveLength(2);
    expect(clone?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(clone?.attrs?.["id"]).not.toBe("block-gallery-source");
    expect(cloneItems.map((item) => item.attrs?.["id"])).toEqual([
      expect.stringMatching(STABLE_ID_PATTERN),
      expect.stringMatching(STABLE_ID_PATTERN),
    ]);
    expect(cloneItems[0]?.attrs?.["id"]).not.toBe("component-gallery-item-a");
    expect(cloneItems[1]?.attrs?.["id"]).not.toBe("component-gallery-item-b");

    editor.destroy();
  });
});
