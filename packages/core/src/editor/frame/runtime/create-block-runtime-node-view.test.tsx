// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { defineBlock } from "@/editor/blocks/block-definition";

import { createRuntimeBlockFrameAttributesExtension } from "../model/frame-attributes-extension";
import { createBlockRuntimeNodeView } from "./create-block-runtime-node-view";

const TEST_EAGER_NODE_TYPE = "test_block_runtime_eager_frame_block";
const TEST_LAZY_NODE_TYPE = "test_block_runtime_lazy_frame_block";

const eagerBlockDefinition = defineBlock({
  nodeType: TEST_EAGER_NODE_TYPE,
  boundedPlacement: "fill",
});

const lazyBlockDefinition = defineBlock({
  nodeType: TEST_LAZY_NODE_TYPE,
  frame: {
    resizable: true,
    resizeMode: "freeform",
  },
});

function EagerRuntimeView() {
  return <div>Eager runtime block</div>;
}

function LazyRuntimeFallback() {
  return <div aria-hidden="true" className="test-block-runtime-skeleton" />;
}

function LazyRuntimeView() {
  return <div>Loaded runtime block</div>;
}

const EagerRuntimeFrameTestNode = Node.create({
  name: TEST_EAGER_NODE_TYPE,
  group: `block ${COURSE_BLOCK_CONTENT}`,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_EAGER_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": TEST_EAGER_NODE_TYPE }];
  },

  addNodeView() {
    return createBlockRuntimeNodeView({
      className: "test-block-runtime-eager-frame",
      definition: eagerBlockDefinition,
      view: { component: EagerRuntimeView },
    });
  },
});

const LazyRuntimeFrameTestNode = Node.create({
  name: TEST_LAZY_NODE_TYPE,
  group: `block ${COURSE_BLOCK_CONTENT}`,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_LAZY_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": TEST_LAZY_NODE_TYPE }];
  },

  addNodeView() {
    return createBlockRuntimeNodeView({
      className: "test-block-runtime-lazy-frame",
      definition: lazyBlockDefinition,
      view: {
        fallback: LazyRuntimeFallback,
        load: async () => ({ default: LazyRuntimeView }),
      },
    });
  },
});

const RuntimeRegionTestNode = Node.create({
  name: "region",
  group: "block",
  content: `${TEST_EAGER_NODE_TYPE}+`,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-node="region"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-node": "region" }, 0];
  },
});

describe("createBlockRuntimeNodeView", () => {
  it("renders an eager runtime view in a runtime frame", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        EagerRuntimeFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_EAGER_NODE_TYPE,
            attrs: { id: "runtime-frame-1" },
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await screen.findByText("Eager runtime block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_EAGER_NODE_TYPE}"][data-runtime-frame="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-id")).toBe("runtime-frame-1");
        expect(frame?.getAttribute("data-bounded-placement")).toBeNull();
        expect(frame?.classList.contains("test-block-runtime-eager-frame")).toBe(true);
        expect(frame?.textContent).toContain("Eager runtime block");
      });
    } finally {
      editor.destroy();
    }
  });

  it("marks a fill-capable runtime frame as fill only inside a bounded region", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        RuntimeRegionTestNode,
        EagerRuntimeFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "region",
            attrs: { id: "runtime-region-1" },
            content: [
              {
                type: TEST_EAGER_NODE_TYPE,
                attrs: { id: "runtime-frame-1" },
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await screen.findByText("Eager runtime block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_EAGER_NODE_TYPE}"][data-runtime-frame="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-bounded-placement")).toBe("fill");
      });
    } finally {
      editor.destroy();
    }
  });

  it("renders a lazy runtime view with persisted frame attrs", async () => {
    const editor = new Editor({
      editable: false,
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        createRuntimeBlockFrameAttributesExtension([TEST_LAZY_NODE_TYPE]),
        LazyRuntimeFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_LAZY_NODE_TYPE,
            attrs: {
              id: "runtime-frame-2",
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

      await screen.findByText("Loaded runtime block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_LAZY_NODE_TYPE}"][data-runtime-frame="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-id")).toBe("runtime-frame-2");
        expect(frame?.classList.contains("test-block-runtime-lazy-frame")).toBe(true);
        expect(frame?.style.width).toBe("50%");
        expect(frame?.style.height).toBe("288px");
        expect(frame?.style.maxWidth).toBe("100%");
        expect(frame?.textContent).toContain("Loaded runtime block");
      });
    } finally {
      editor.destroy();
    }
  });
});
