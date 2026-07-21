// @vitest-environment happy-dom

import { Editor, Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CellAuthoringNode, GridAuthoringNode } from "../../arrangements/grid/authoring/grid-nodes";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { CELL_ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import {
  AUTHORING_CHROME_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "../../interactions/dom/authoring-chrome";
import { courseBlockAuthoringFrameAttributes } from "../../interactions/dom/authoring-frame";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { InteractionOwnerCommandKind } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-command-model";
import { setInteractionOwnerCommandMeta } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { RESIZE_GESTURE_ACTIVE_ATTR } from "@/editor/interactions/gesture/editor-resize-gesture";
import { createTiptapResizableReactNodeView } from "./tiptap-resizable-react-node-view";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const TEST_NODE_TYPE = "test_tiptap_resizable_block";
const TEST_FIXED_NODE_TYPE = "test_tiptap_fixed_frame_block";
const TEST_TARGET_DISABLED_NODE_TYPE = "test_tiptap_target_disabled_resize_block";
const TEST_EXPLICIT_SURFACE_NODE_TYPE = "test_tiptap_explicit_surface_resize_block";
const TEST_EMBEDDED_OWNER_NODE_TYPE = "test_tiptap_embedded_resize_owner";

const testBlockRegistry = createBlockRegistry([
  defineBlock({
    nodeType: TEST_NODE_TYPE,
    frame: { preserveAspectRatio: true, resizable: true, resizeMode: "responsive" },
  }),
  defineBlock({ nodeType: TEST_FIXED_NODE_TYPE, frame: { resizable: false } }),
  defineBlock({ nodeType: TEST_TARGET_DISABLED_NODE_TYPE, frame: { resizable: false } }),
  defineBlock({
    nodeType: TEST_EXPLICIT_SURFACE_NODE_TYPE,
    frame: { resizable: true, resizeMode: "responsive" },
  }),
  defineBlock({
    nodeType: TEST_EMBEDDED_OWNER_NODE_TYPE,
    frame: { resizable: true, resizeMode: "responsive" },
    interaction: { embeddedChildSelection: "delegate-to-parent" },
  }),
]);

function findRegisteredEventListener(
  calls: readonly (readonly unknown[])[],
  eventName: string,
): EventListener {
  const listener = calls.find(([calledEventName]) => calledEventName === eventName)?.[1];
  expect(typeof listener).toBe("function");

  return listener as EventListener;
}

const TestCellArrangementNode = Node.create({
  name: "test_tiptap_cell_arrangement",
  group: CELL_ARRANGEMENT_CONTENT,
  content: "paragraph+",

  parseHTML() {
    return [{ tag: "div[data-test-tiptap-cell-arrangement]" }];
  },

  renderHTML() {
    return ["div", { "data-test-tiptap-cell-arrangement": "" }, 0];
  },
});

function TestResizableBlock(props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      data-node={TEST_NODE_TYPE}
      {...courseBlockAuthoringFrameAttributes({
        blockId: props.node.attrs["id"],
        nodeType: props.node.type.name,
      })}
    >
      <div data-testid="resizable-react-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

function TestTargetDisabledBlock() {
  return (
    <NodeViewWrapper data-node={TEST_TARGET_DISABLED_NODE_TYPE}>
      <div data-testid="target-disabled-resize-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

function TestExplicitSurfaceBlock(props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      data-node={TEST_EXPLICIT_SURFACE_NODE_TYPE}
      data-testid="explicit-resize-wrapper"
    >
      <section
        data-testid="explicit-resize-surface"
        {...courseBlockAuthoringFrameAttributes({
          blockId: props.node.attrs["id"],
          nodeType: props.node.type.name,
        })}
      >
        <div data-testid="explicit-resize-content">
          <NodeViewContent />
        </div>
      </section>
    </NodeViewWrapper>
  );
}

const TestResizableNode = Node.create({
  name: TEST_NODE_TYPE,
  group: "block",
  content: "paragraph",
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: "test-resizable-block-id",
      },
      frame: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-node": TEST_NODE_TYPE }), 0];
  },

  addNodeView() {
    return createTiptapResizableReactNodeView(TestResizableBlock, {
      blockDefinitions: testBlockRegistry,
      frame: {
        preserveAspectRatio: true,
        resizable: true,
        resizeMode: "responsive",
      },
    });
  },
});

const TestFixedFrameNode = Node.create({
  name: TEST_FIXED_NODE_TYPE,
  group: "block",
  content: "paragraph",
  selectable: true,

  addAttributes() {
    return {
      frame: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_FIXED_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-node": TEST_FIXED_NODE_TYPE }), 0];
  },

  addNodeView() {
    return createTiptapResizableReactNodeView(TestResizableBlock, {
      blockDefinitions: testBlockRegistry,
      frame: {
        resizable: false,
      },
    });
  },
});

const TestTargetDisabledResizeNode = Node.create({
  name: TEST_TARGET_DISABLED_NODE_TYPE,
  group: "block",
  content: "paragraph",
  selectable: true,

  addAttributes() {
    return {
      frame: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_TARGET_DISABLED_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node": TEST_TARGET_DISABLED_NODE_TYPE,
      }),
      0,
    ];
  },

  addNodeView() {
    return createTiptapResizableReactNodeView(TestTargetDisabledBlock, {
      blockDefinitions: testBlockRegistry,
      frame: {
        preserveAspectRatio: true,
        resizable: true,
        resizeMode: "responsive",
      },
    });
  },
});

const TestExplicitSurfaceResizeNode = Node.create({
  name: TEST_EXPLICIT_SURFACE_NODE_TYPE,
  group: "block",
  content: "paragraph",
  selectable: true,

  addAttributes() {
    return {
      frame: {
        default: null,
      },
      id: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_EXPLICIT_SURFACE_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node": TEST_EXPLICIT_SURFACE_NODE_TYPE,
      }),
      0,
    ];
  },

  addNodeView() {
    return createTiptapResizableReactNodeView(TestExplicitSurfaceBlock, {
      blockDefinitions: testBlockRegistry,
      frame: {
        resizable: true,
        resizeMode: "responsive",
      },
    });
  },
});

const TestEmbeddedResizeOwnerNode = Node.create({
  name: TEST_EMBEDDED_OWNER_NODE_TYPE,
  group: "block",
  content: TEST_NODE_TYPE,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: "test-embedded-owner-id",
      },
    };
  },

  parseHTML() {
    return [{ tag: `section[data-node="${TEST_EMBEDDED_OWNER_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-node": TEST_EMBEDDED_OWNER_NODE_TYPE,
      }),
      0,
    ];
  },
});

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  cleanup();
  vi.restoreAllMocks();
});

describe("createTiptapResizableReactNodeView", () => {
  it("marks resize chrome active when text selection is inside the composite block", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Editable child content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Editable child content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() =>
      expect(document.querySelector("[data-authoring-frame-wrapper-active]")).not.toBeNull(),
    );
    expect(document.querySelector("[data-authoring-frame-wrapper-active]")).not.toBeNull();
  });

  it("shows resize chrome when the composite block is node-selected", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Editable child content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Editable child content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));
    const bottomRightHandle = screen.getByRole("button", {
      name: "Resize block from bottom-right corner",
    });
    expect(bottomRightHandle).toBe(handle);
    expect(handle.closest("[data-resize-container]")).not.toBeNull();
    expect(describedText(bottomRightHandle)).toBe("Drag to resize this block.");
    expect(document.querySelector("[data-authoring-frame-wrapper-active]")).not.toBeNull();
    expect(resizeHandleDirections()).toEqual([
      "bottom-left",
      "bottom-right",
      "right",
      "top-left",
      "top-right",
    ]);
    expect(handle.getAttribute("contenteditable")).toBe("false");
    expect(handle.getAttribute(AUTHORING_CHROME_ATTR)).toBe("resize");
  });

  it("applies frame mode attributes to the explicit authoring frame", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestExplicitSurfaceResizeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_EXPLICIT_SURFACE_NODE_TYPE,
            attrs: { id: "block-explicit-resize-test" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Explicit surface content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Explicit surface content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    const surface = await screen.findByTestId("explicit-resize-surface");
    await waitFor(() => {
      expect(surface.dataset.authoringFrameResizeMode).toBe("responsive");
    });

    const wrapper = await screen.findByTestId("explicit-resize-wrapper");
    expect(wrapper.dataset.authoringFrameResizeMode).toBeUndefined();

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));
  });

  it("suppresses resize chrome for embedded child blocks under a delegated owner", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
        TestEmbeddedResizeOwnerNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_EMBEDDED_OWNER_NODE_TYPE,
            content: [
              {
                type: TEST_NODE_TYPE,
                attrs: { id: "embedded-child-block-id" },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Embedded child content" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Embedded child content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("none"));
    expect(document.querySelector("[data-authoring-frame-wrapper-active]")).toBeNull();
  });

  it("does not show resize chrome before the editor receives focus", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Initial selection content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Initial selection content");

    act(() => {
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    await waitFor(() => {
      expect(document.querySelector("[data-authoring-frame-wrapper-active]")).toBeNull();
    });
    for (const handle of document.querySelectorAll<HTMLElement>("[data-authoring-resize-handle]")) {
      expect(handle.getAttribute(AUTHORING_CHROME_ATTR)).toBe("resize");
      expect(handle.style.display).toBe("none");
    }
  });

  it("scopes resize chrome to the active resizable block", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "First resizable content" }],
              },
            ],
          },
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Second resizable content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("First resizable content");
    await screen.findByText("Second resizable content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, textPos(editor, "Second resizable") + 2),
        ),
      );
    });

    await waitFor(() => {
      const activeFrames = activeResizeFrames();
      expect(activeFrames).toHaveLength(1);
      expect(
        activeFrames[0]?.querySelector('[data-authoring-frame="block"]')?.textContent,
      ).toContain("Second resizable content");
    });

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, textPos(editor, "First resizable") + 2),
        ),
      );
    });

    await waitFor(() => {
      const activeFrames = activeResizeFrames();
      expect(activeFrames).toHaveLength(1);
      expect(
        activeFrames[0]?.querySelector('[data-authoring-frame="block"]')?.textContent,
      ).toContain("First resizable content");
    });
  });

  it("does not expose resize chrome for blocks whose frame policy is fixed", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestFixedFrameNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_FIXED_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Fixed child content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Fixed child content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    await waitFor(() => {
      expect(document.querySelector("[data-authoring-frame-wrapper-active]")).toBeNull();
    });
    for (const handle of document.querySelectorAll<HTMLElement>("[data-authoring-resize-handle]")) {
      expect(handle.style.display).toBe("none");
    }
  });

  it("does not expose resize chrome when the active target lacks resize capability", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestTargetDisabledResizeNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_TARGET_DISABLED_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Target disabled content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Target disabled content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    await waitFor(() => {
      expect(document.querySelector("[data-authoring-frame-wrapper-active]")).toBeNull();
    });

    for (const handle of document.querySelectorAll<HTMLElement>("[data-authoring-resize-handle]")) {
      expect(handle.style.display).toBe("none");
    }
  });

  it("suppresses resize chrome while structure movement drag owns the interaction", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Movement active content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Movement active content");

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));

    act(() => {
      editor?.view.dispatch(
        setInteractionOwnerCommandMeta(editor.state.tr, {
          kind: InteractionOwnerCommandKind.BeginGesture,
          target: {
            id: "test-resizable-block-id",
            kind: InteractionTargetKind.Block,
            pos: 0,
          },
        }),
      );
    });

    await waitFor(() => expect(handle.style.display).toBe("none"));
    expect(document.querySelector("[data-authoring-frame-wrapper-active]")).toBeNull();
  });

  it("keeps the resize frame neutral about outer block rhythm", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Frame child content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Frame child content");

    const frame = document.querySelector("[data-authoring-frame-wrapper]") as HTMLElement | null;
    expect(frame).not.toBeNull();
    if (!frame) return;

    const container = frame.closest("[data-resize-container]") as HTMLElement | null;
    expect(container).not.toBeNull();
    if (!container) return;

    const block = document.querySelector(
      `[data-authoring-frame="block"][data-node="${TEST_NODE_TYPE}"]`,
    ) as HTMLElement | null;
    expect(block).not.toBeNull();
    if (!block) return;

    expect(container.style.marginBottom).toBe("");
    expect(frame.style.marginBottom).toBe("");
    expect(block.style.marginBottom).toBe("");

    act(() => {
      editor?.setEditable(false);
    });

    expect(container.style.marginBottom).toBe("");

    act(() => {
      editor?.setEditable(true);
    });

    expect(container.style.marginBottom).toBe("");
  });

  it("persists native resize gestures through Scaffold frame attrs", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Editable child content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    const content = await screen.findByTestId("resizable-react-content");
    expect(content.textContent).toBe("Editable child content");

    const resizeElement = document.querySelector(
      "[data-authoring-frame-wrapper]",
    ) as HTMLElement | null;
    expect(resizeElement).not.toBeNull();
    if (!resizeElement) return;

    mockResizableGeometry(resizeElement);

    const block = document.querySelector(
      `[data-authoring-frame="block"][data-node="${TEST_NODE_TYPE}"]`,
    ) as HTMLElement | null;
    expect(block).not.toBeNull();
    if (!block) return;

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });

    await waitFor(() => expect(block.style.width).toBe("100%"));

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));

    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });

    expect(resizeElement.style.width).toBe("300px");

    const responsiveContent = screen.getByTestId("resizable-react-content");
    expect(block?.style.width).toBe("100%");
    expect(block?.style.height).toBe("");
    expect(block?.style.transform).toBe("");
    expect(responsiveContent.style.width).toBe("");
    expect(responsiveContent.style.transform).toBe("");

    fireEvent.mouseUp(document);

    await waitFor(() => {
      const frame = editor?.state.doc.firstChild?.attrs["frame"];
      expect(frame).toMatchObject({
        aspectRatio: 2,
        widthMode: "percent",
        widthPercent: 75,
      });
    });
  });

  it("persists intrinsic resize deltas inside a scaled slideshow surface", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Scaled resize content" }],
              },
            ],
          },
        ],
      },
    });

    render(
      <div data-authoring-slide-scale="0.5">
        <EditorContent editor={editor} />
      </div>,
    );

    await screen.findByText("Scaled resize content");
    const resizeElement = document.querySelector(
      "[data-authoring-frame-wrapper]",
    ) as HTMLElement | null;
    expect(resizeElement).not.toBeNull();
    if (!resizeElement) return;
    mockResizableGeometry(resizeElement);

    const block = document.querySelector(
      `[data-authoring-frame="block"][data-node="${TEST_NODE_TYPE}"]`,
    ) as HTMLElement | null;
    expect(block).not.toBeNull();
    if (!block) return;

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });
    await waitFor(() => expect(block.style.width).toBe("100%"));

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });
    expect(resizeElement.style.width).toBe("400px");
    fireEvent.mouseUp(document);

    await waitFor(() => {
      expect(editor?.state.doc.firstChild?.attrs["frame"]).toMatchObject({
        aspectRatio: 2,
        widthMode: "percent",
        widthPercent: 100,
      });
    });
  });

  it("clears transient resize state when window blur interrupts an active resize", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Interrupted resize content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Interrupted resize content");

    const resizeElement = document.querySelector(
      "[data-authoring-frame-wrapper]",
    ) as HTMLElement | null;
    expect(resizeElement).not.toBeNull();
    if (!resizeElement) return;

    mockResizableGeometry(resizeElement);

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));

    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });

    expect(editor.view.dom.hasAttribute(RESIZE_GESTURE_ACTIVE_ATTR)).toBe(true);

    fireEvent.blur(window);

    await waitFor(() => {
      expect(editor?.view.dom.hasAttribute(RESIZE_GESTURE_ACTIVE_ATTR)).toBe(false);
    });
    expect(editor.state.doc.firstChild?.attrs["frame"]).toBeNull();
  });

  it("removes resize interruption listeners when destroyed during active resize", async () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: TEST_NODE_TYPE,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Destroy interrupted resize content" }],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Destroy interrupted resize content");

    const resizeElement = document.querySelector(
      "[data-authoring-frame-wrapper]",
    ) as HTMLElement | null;
    expect(resizeElement).not.toBeNull();
    if (!resizeElement) return;

    mockResizableGeometry(resizeElement);

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));

    const documentAddSpy = vi.spyOn(document, "addEventListener");
    const documentRemoveSpy = vi.spyOn(document, "removeEventListener");
    const windowAddSpy = vi.spyOn(window, "addEventListener");
    const windowRemoveSpy = vi.spyOn(window, "removeEventListener");

    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });

    expect(editor.view.dom.hasAttribute(RESIZE_GESTURE_ACTIVE_ATTR)).toBe(true);
    const documentInterruptionListeners = new Map(
      (["mouseup", "touchend", "touchcancel", "visibilitychange"] as const).map((eventName) => [
        eventName,
        findRegisteredEventListener(documentAddSpy.mock.calls, eventName),
      ]),
    );
    const blurInterruptionListener = findRegisteredEventListener(windowAddSpy.mock.calls, "blur");

    const activeEditor = editor;
    expect(() => activeEditor.destroy()).not.toThrow();
    editor = null;

    for (const [eventName, listener] of documentInterruptionListeners) {
      expect(documentRemoveSpy).toHaveBeenCalledWith(eventName, listener);
    }
    expect(windowRemoveSpy).toHaveBeenCalledWith("blur", blurInterruptionListener);
    expect(activeEditor.state.doc.firstChild?.attrs["frame"]).toBeNull();
  });

  it("resizes a selected block inside a cell without mutating grid column widths", async () => {
    editor = new Editor({
      extensions: [
        DocumentNode,
        StarterKit.configure({ document: false, undoRedo: false }),
        createScaffoldInteractionOwnerExtension(testBlockRegistry),
        CourseDocumentNode,
        SurfaceNode,
        RegionNode,
        GridAuthoringNode,
        CellAuthoringNode,
        TestCellArrangementNode,
        TestResizableNode,
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                content: [
                  {
                    type: "grid",
                    attrs: { columnWidths: [1], id: "grid-a" },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: "cell-a" },
                        content: [
                          {
                            type: TEST_NODE_TYPE,
                            content: [
                              {
                                type: "paragraph",
                                content: [
                                  {
                                    type: "text",
                                    text: "Resizable cell content",
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    render(<EditorContent editor={editor} />);

    await screen.findByText("Resizable cell content");

    const resizeElement = document.querySelector(
      "[data-authoring-frame-wrapper]",
    ) as HTMLElement | null;
    expect(resizeElement).not.toBeNull();
    if (!resizeElement) return;

    const container = resizeElement.closest("[data-resize-container]") as HTMLElement | null;
    expect(container).not.toBeNull();
    await waitFor(() => expect(container?.style.marginBottom).toBe(""));

    mockResizableGeometry(resizeElement);

    const gridPos = nodePos(editor, "grid");
    const blockPos = nodePos(editor, TEST_NODE_TYPE);
    const beforeGridAttrs = editor.state.doc.nodeAt(gridPos)?.attrs;

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, blockPos)),
      );
    });

    const handle = document.querySelector(
      '[data-authoring-resize-handle="bottom-right"]',
    ) as HTMLElement | null;
    expect(handle).not.toBeNull();
    if (!handle) return;

    await waitFor(() => expect(handle.style.display).toBe("block"));

    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });
    fireEvent.mouseUp(document);

    await waitFor(() => {
      const resizedBlock = editor?.state.doc.nodeAt(blockPos);
      expect(resizedBlock?.attrs["frame"]).toMatchObject({
        aspectRatio: 2,
        widthMode: "percent",
        widthPercent: 75,
      });
    });
    expect(editor.state.doc.nodeAt(gridPos)?.attrs["columnWidths"]).toEqual(
      beforeGridAttrs?.["columnWidths"],
    );
  });
});

function resizeHandleDirections(): string[] {
  return Array.from(document.querySelectorAll(`[${AUTHORING_RESIZE_HANDLE_ATTR}]`))
    .map((element) => element.getAttribute(AUTHORING_RESIZE_HANDLE_ATTR) ?? "")
    .sort();
}

function activeResizeFrames(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-authoring-frame-wrapper-active]"),
  );
}

function describedText(element: Element): string {
  const describedBy = element.getAttribute("aria-describedby");
  if (!describedBy) return "";
  return describedBy
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
    .filter(Boolean)
    .join(" ");
}

function mockResizableGeometry(element: HTMLElement): void {
  defineElementGeometry(element);

  const resizeTarget = element.firstElementChild;
  if (resizeTarget instanceof HTMLElement) {
    defineElementGeometry(resizeTarget);

    const blockElement = resizeTarget.querySelector('[data-authoring-frame="block"]');
    if (blockElement instanceof HTMLElement) {
      defineElementGeometry(blockElement);
    }
  }

  const container = element.closest("[data-resize-container]");
  if (container?.parentElement) {
    container.parentElement.getBoundingClientRect = () =>
      DOMRect.fromRect({ height: 200, width: 400, x: 0, y: 0 });
  }
}

function nodePos(editor: Editor | null, type: string): number {
  if (!editor) throw new Error("Missing editor");

  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Missing ${type}`);
  return found;
}

function textPos(editor: Editor | null, text: string): number {
  if (!editor) throw new Error("Missing editor");

  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;

    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;

    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Missing text: ${text}`);
  return found;
}

function defineElementGeometry(
  element: HTMLElement,
  fallback: { height: number; width: number } = { height: 100, width: 200 },
): void {
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get: () => pixelWidth(element, fallback.width),
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get: () => pixelSize(element.style.height, fallback.height),
  });
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({
      height: element.offsetHeight,
      width: element.offsetWidth,
      x: 0,
      y: 0,
    });
}

function pixelSize(value: string, fallback: number): number {
  if (!value.endsWith("px")) return fallback;
  const size = Number.parseFloat(value);
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

function pixelWidth(element: HTMLElement, fallback: number): number {
  if (element.style.width === "100%" && element.parentElement) {
    return pixelSize(element.parentElement.style.width, fallback);
  }

  return pixelSize(element.style.width, fallback);
}
