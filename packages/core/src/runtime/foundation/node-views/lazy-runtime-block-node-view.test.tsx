// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";

import { createLazyRuntimeBlockNodeView } from "./lazy-runtime-block-node-view";

const TEST_NODE_TYPE = "test_lazy_runtime_frame_block";

const testBlockDefinition = defineBlock({
  nodeType: TEST_NODE_TYPE,
  frame: {
    resizable: true,
    resizeMode: "freeform",
  },
});

function LazyRuntimeFrameFallback() {
  return <div aria-hidden="true" className="test-lazy-runtime-skeleton" />;
}

function LazyRuntimeFrameBody() {
  return <div>Loaded lazy runtime block</div>;
}

const LazyRuntimeFrameTestNode = Node.create({
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
    return createLazyRuntimeBlockNodeView({
      definition: testBlockDefinition,
      fallback: LazyRuntimeFrameFallback,
      loadView: async () => ({ default: LazyRuntimeFrameBody }),
      nodeType: TEST_NODE_TYPE,
      wrapperClassName: "test-lazy-runtime-frame",
    });
  },
});

describe("createLazyRuntimeBlockNodeView", () => {
  it("keeps persisted runtime frame attrs on a stable wrapper after lazy content resolves", async () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        createRuntimeBlockFrameAttributesExtension([TEST_NODE_TYPE]),
        LazyRuntimeFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            attrs: {
              id: "lazy-frame-1",
              frame: {
                align: "center",
                aspectRatio: null,
                heightPx: 288,
                widthMode: "percent",
                widthPercent: 50,
              },
            },
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await screen.findByText("Loaded lazy runtime block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_NODE_TYPE}"][data-runtime-frame="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-id")).toBe("lazy-frame-1");
        expect(frame?.classList.contains("test-lazy-runtime-frame")).toBe(true);
        expect(frame?.style.width).toBe("50%");
        expect(frame?.style.height).toBe("288px");
        expect(frame?.style.maxWidth).toBe("100%");
        expect(frame?.textContent).toContain("Loaded lazy runtime block");
      });
    } finally {
      editor.destroy();
    }
  });
});
