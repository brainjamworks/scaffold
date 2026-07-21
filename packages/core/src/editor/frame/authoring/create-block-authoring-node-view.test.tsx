// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { AUTHORING_FRAME_WRAPPER_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { createBlockAuthoringNodeView } from "./create-block-authoring-node-view";
import { defineBlock } from "@/editor/blocks/block-definition";

const TEST_PLAIN_NODE_TYPE = "test_block_authoring_plain_frame_block";

const plainBlockDefinition = defineBlock({
  nodeType: TEST_PLAIN_NODE_TYPE,
  boundedPlacement: "fill",
});

function EagerAuthoringView() {
  return <div>Eager authoring block</div>;
}

const PlainAuthoringFrameTestNode = Node.create({
  name: TEST_PLAIN_NODE_TYPE,
  group: `block ${COURSE_BLOCK_CONTENT}`,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_PLAIN_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": TEST_PLAIN_NODE_TYPE }];
  },

  addNodeView() {
    return createBlockAuthoringNodeView({
      className: "test-block-authoring-plain-frame",
      definition: plainBlockDefinition,
      view: { component: EagerAuthoringView },
    });
  },
});

const AuthoringRegionTestNode = Node.create({
  name: "region",
  group: "block",
  content: `${TEST_PLAIN_NODE_TYPE}+`,

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

describe("createBlockAuthoringNodeView", () => {
  it("renders an eager authoring view in a plain authoring frame", async () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        PlainAuthoringFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_PLAIN_NODE_TYPE,
            attrs: { id: "plain-frame-1" },
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await screen.findByText("Eager authoring block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_PLAIN_NODE_TYPE}"][${AUTHORING_FRAME_ATTR}="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-id")).toBe("plain-frame-1");
        expect(frame?.getAttribute("data-definition")).toBe(TEST_PLAIN_NODE_TYPE);
        expect(frame?.getAttribute("data-bounded-placement")).toBeNull();
        expect(frame?.classList.contains("test-block-authoring-plain-frame")).toBe(true);
        expect(frame?.textContent).toContain("Eager authoring block");
        expect(document.body.querySelector(`[${AUTHORING_FRAME_WRAPPER_ATTR}]`)).toBeNull();
      });
    } finally {
      editor.destroy();
    }
  });

  it("marks a fill-capable authoring frame as fill only inside a bounded region", async () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          undoRedo: false,
        }),
        AuthoringRegionTestNode,
        PlainAuthoringFrameTestNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "region",
            attrs: { id: "authoring-region-1" },
            content: [
              {
                type: TEST_PLAIN_NODE_TYPE,
                attrs: { id: "plain-frame-1" },
              },
            ],
          },
        ],
      },
    });

    try {
      render(createElement(EditorContent, { editor }));

      await screen.findByText("Eager authoring block");

      await waitFor(() => {
        const frame = document.body.querySelector<HTMLElement>(
          `[data-node="${TEST_PLAIN_NODE_TYPE}"][${AUTHORING_FRAME_ATTR}="block"]`,
        );

        expect(frame).not.toBeNull();
        expect(frame?.getAttribute("data-bounded-placement")).toBe("fill");
      });
    } finally {
      editor.destroy();
    }
  });
});
