// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { createLazyAuthoringBlockNodeView } from "./lazy-authoring-block-node-view";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";

const TEST_NODE_TYPE = "test_lazy_authoring_frame_block";

function LazyAuthoringFrameFallback() {
  return <div>Loading lazy authoring block</div>;
}

function LazyAuthoringFrameBody() {
  return <div>Loaded lazy authoring block</div>;
}

const LazyAuthoringFrameTestNode = Node.create({
  name: TEST_NODE_TYPE,
  group: `block ${COURSE_BLOCK_CONTENT}`,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": TEST_NODE_TYPE }];
  },

  addNodeView() {
    return createLazyAuthoringBlockNodeView({
      fallback: LazyAuthoringFrameFallback,
      frame: {
        resizable: true,
        resizeMode: "freeform",
      },
      loadView: async () => ({ default: LazyAuthoringFrameBody }),
      nodeType: TEST_NODE_TYPE,
      wrapperClassName: "test-lazy-authoring-frame",
    });
  },
});

describe("createLazyAuthoringBlockNodeView", () => {
  it("keeps authoring frame attrs on the visible block wrapper after lazy content resolves", async () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        LazyAuthoringFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            attrs: { id: "lazy-authoring-frame-1" },
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await screen.findByText("Loaded lazy authoring block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_NODE_TYPE}"][${AUTHORING_FRAME_ATTR}="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-id")).toBe("lazy-authoring-frame-1");
        expect(frame?.getAttribute("data-definition")).toBe(TEST_NODE_TYPE);
        expect(frame?.classList.contains("test-lazy-authoring-frame")).toBe(true);
        expect(frame?.style.width).toBe("100%");
        expect(frame?.style.height).toBe("100%");
        expect(frame?.textContent).toContain("Loaded lazy authoring block");
      });
    } finally {
      editor.destroy();
    }
  });
});
