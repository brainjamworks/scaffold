// @vitest-environment happy-dom

import { Editor, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import {
  courseBlockAuthoringFrameAttributes,
  structuralAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";

import {
  resolveEditorMovementTarget,
  resolveEditorMovementTargetAtPos,
  useEditorMovementTarget,
  type EditorMovementTarget,
} from "./use-editor-movement-target";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const TEST_BLOCK = "movement_target_test_block";
const FRAMED_BLOCK = "movement_target_framed_block";
const MISSING_ANCHOR_BLOCK = "movement_target_missing_anchor_block";
const TEXT_BLOCK = "movement_target_text_block";
const TEXT_FIELD = "movement_target_text_field";
const EMBEDDED_OWNER_BLOCK = "movement_target_embedded_owner_block";

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: TEST_BLOCK }),
  defineBlock({ nodeType: FRAMED_BLOCK }),
  defineBlock({ nodeType: MISSING_ANCHOR_BLOCK }),
  defineBlock({ nodeType: TEXT_BLOCK }),
  defineBlock({
    nodeType: EMBEDDED_OWNER_BLOCK,
    interaction: { embeddedChildSelection: "delegate-to-parent" },
  }),
]);

const MovementTargetGridNode = GridNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "grid",
          frameKind: "grid",
        }),
        {
          "data-node": "grid",
          "data-definition": "grid",
        },
      ),
      0,
    ];
  },
});

const MovementTargetCellNode = CellNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "cell",
          frameKind: "cell",
        }),
        {
          "data-node": "cell",
          "data-definition": "cell",
        },
      ),
      0,
    ];
  },
});

const MovementTargetLayoutNode = LayoutNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    const definition =
      typeof node.attrs["variant"] === "string" && node.attrs["variant"]
        ? node.attrs["variant"]
        : "layout";

    return [
      "section",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          definition,
          id: node.attrs["id"],
          nodeType: "layout",
          frameKind: "layout",
        }),
        {
          "data-node": "layout",
        },
      ),
      0,
    ];
  },
});

const MovementTargetSectionNode = SectionNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "section",
          frameKind: "section",
        }),
        {
          "data-node": "section",
          "data-definition": "section",
        },
      ),
      0,
    ];
  },
});

const TestBlockNode = Node.create({
  name: TEST_BLOCK,
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        ...courseBlockAuthoringFrameAttributes({
          blockId: HTMLAttributes["data-id"],
          nodeType: TEST_BLOCK,
        }),
        "data-node": TEST_BLOCK,
        "data-test-block": "",
      },
    ];
  },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const FramedBlockNode = Node.create({
  name: FRAMED_BLOCK,
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-framed-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-framed-test-block": "",
      },
      [
        "div",
        { "data-authoring-frame-wrapper": "" },
        [
          "article",
          {
            ...courseBlockAuthoringFrameAttributes({
              blockId: HTMLAttributes["data-id"],
              nodeType: FRAMED_BLOCK,
            }),
            "data-node": FRAMED_BLOCK,
          },
        ],
      ],
    ];
  },
});

const MissingAnchorBlockNode = Node.create({
  name: MISSING_ANCHOR_BLOCK,
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-movement-target-missing-anchor-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-movement-target-missing-anchor-block": "",
      },
    ];
  },
});

const TestTextFieldNode = Node.create({
  name: TEXT_FIELD,
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-movement-target-text-field]" }];
  },

  renderHTML() {
    return ["div", { "data-movement-target-text-field": "" }, 0];
  },
});

const TestTextBlockNode = Node.create({
  name: TEXT_BLOCK,
  group: "block",
  content: TEXT_FIELD,
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: "movement-target-text-block",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-movement-target-text-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      { ...HTMLAttributes, "data-movement-target-text-block": "" },
      [
        "div",
        {
          ...courseBlockAuthoringFrameAttributes({
            blockId: HTMLAttributes["data-id"],
            nodeType: TEXT_BLOCK,
          }),
          "data-node": TEXT_BLOCK,
        },
        0,
      ],
    ];
  },
});

const EmbeddedOwnerBlockNode = Node.create({
  name: EMBEDDED_OWNER_BLOCK,
  group: "block",
  content: TEST_BLOCK,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-movement-target-embedded-owner]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      {
        ...HTMLAttributes,
        ...courseBlockAuthoringFrameAttributes({
          blockId: HTMLAttributes["data-id"],
          nodeType: EMBEDDED_OWNER_BLOCK,
        }),
        "data-node": EMBEDDED_OWNER_BLOCK,
        "data-movement-target-embedded-owner": "",
      },
      0,
    ];
  },
});

function block(id: string): JSONContent {
  return { type: TEST_BLOCK, attrs: { id } };
}

function embeddedOwner(id: string, child: JSONContent): JSONContent {
  return {
    type: EMBEDDED_OWNER_BLOCK,
    attrs: { id },
    content: [child],
  };
}

function textBlock(text: string): JSONContent {
  return {
    type: TEXT_BLOCK,
    content: [
      {
        type: TEXT_FIELD,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}

function cell(content: JSONContent[]): JSONContent {
  return { type: "cell", attrs: { id: `cell-${content.length}` }, content };
}

function grid(cells: JSONContent[]): JSONContent {
  return {
    type: "grid",
    attrs: { id: `grid-${cells.length}` },
    content: cells,
  };
}

function layout(id: string, sections: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id },
    content: sections,
  };
}

function section(id: string, content: JSONContent[] = []): JSONContent {
  return {
    type: "section",
    attrs: { id },
    content: content.length ? content : [{ type: "paragraph" }],
  };
}

function makeEditor(content: JSONContent[]) {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
      MovementTargetGridNode,
      MovementTargetCellNode,
      MovementTargetLayoutNode,
      MovementTargetSectionNode,
      TestBlockNode,
      FramedBlockNode,
      MissingAnchorBlockNode,
      TestTextFieldNode,
      TestTextBlockNode,
      EmbeddedOwnerBlockNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content,
            },
          ],
        },
      ],
    },
  });

  render(createElement(EditorContent, { editor }));
  activateAuthoringSession(editor);
  return editor;
}

function activateAuthoringSession(editor: Editor) {
  editor.view.dom.focus();
  editor.view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

function framedBlock(id: string): JSONContent {
  return { type: FRAMED_BLOCK, attrs: { id } };
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;

    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;

    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Could not find text: ${text}`);
  return found;
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  return found;
}

function rect(): DOMRect {
  return {
    bottom: 92,
    height: 80,
    left: 24,
    right: 224,
    top: 12,
    width: 200,
    x: 24,
    y: 12,
    toJSON: () => ({}),
  };
}

function dispatchEditorGutterMouseDown(editor: Editor) {
  const editorGutter = document.createElement("section");
  editor.view.dom.append(editorGutter);
  editorGutter.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}

describe("resolveEditorMovementTarget", () => {
  it("keeps the live anchor stable when scroll changes the anchor rect", async () => {
    const editor = makeEditor([block("a")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    let anchorRect = {
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    };
    vi.spyOn(dom, "getBoundingClientRect").mockImplementation(() => anchorRect);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const observedTargets: Array<EditorMovementTarget | null> = [];
    function MovementTargetProbe() {
      observedTargets.push(useEditorMovementTarget(editor, testBlockRegistry));
      return null;
    }

    render(createElement(MovementTargetProbe));

    await waitFor(() => {
      expect(observedTargets.at(-1)?.element).toBe(dom);
    });

    const initialTarget = observedTargets.at(-1);
    expect(initialTarget?.rect.top).toBe(20);

    anchorRect = {
      bottom: 160,
      height: 80,
      left: 80,
      right: 280,
      top: 80,
      width: 200,
      x: 80,
      y: 80,
      toJSON: () => ({}),
    };
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(observedTargets.at(-1)).toBe(initialTarget);
    expect(observedTargets.at(-1)?.element).toBe(dom);
    expect(observedTargets.at(-1)?.rect.top).toBe(20);
    editor.destroy();
  });

  it("resolves the selected movement source from ProseMirror node context and DOM rect", () => {
    const editor = makeEditor([block("a"), block("b")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(rect());
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes[TEST_BLOCK],
        pos,
      },
      targetRef: {
        id: "a",
        kind: InteractionTargetKind.Block,
        pos,
      },
      rect: {
        left: 24,
        top: 12,
        width: 200,
      },
    });
    editor.destroy();
  });

  it("resolves the active block as the movement target when the caret is inside field content", () => {
    const editor = makeEditor([textBlock("Nested field text")]);
    const pos = nodePos(editor, TEXT_BLOCK);
    const shell = editor.view.nodeDOM(pos);
    if (!(shell instanceof HTMLElement)) throw new Error("Expected block DOM");
    const dom = shell.querySelector('[data-authoring-frame="block"]');
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block anchor DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(rect());
    editor.commands.setTextSelection(textPos(editor, "field") + 2);

    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes[TEXT_BLOCK],
        pos,
      },
      element: dom,
    });
    expect(resolveEditorMovementTargetAtPos(editor, pos, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes[TEXT_BLOCK],
        pos,
      },
      element: dom,
      targetRef: {
        kind: InteractionTargetKind.Block,
        pos,
      },
    });
    editor.destroy();
  });

  it("does not expose caret-owned movement after editor-local clicks outside authored frames", () => {
    const editor = makeEditor([textBlock("Nested field text")]);
    const pos = nodePos(editor, TEXT_BLOCK);
    const shell = editor.view.nodeDOM(pos);
    if (!(shell instanceof HTMLElement)) throw new Error("Expected block DOM");
    const dom = shell.querySelector('[data-authoring-frame="block"]');
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block anchor DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(rect());
    editor.commands.setTextSelection(textPos(editor, "field") + 2);
    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes[TEXT_BLOCK],
        pos,
      },
    });

    dispatchEditorGutterMouseDown(editor);

    expect(editor.state.selection.from).toBe(textPos(editor, "field") + 2);
    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toBeNull();
    editor.destroy();
  });

  it("uses the selected block frame as the movement anchor when a resizable frame exists", () => {
    const editor = makeEditor([framedBlock("framed")]);
    const pos = nodePos(editor, FRAMED_BLOCK, "framed");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");
    const frame = dom.querySelector("[data-authoring-frame-wrapper]");
    const blockAnchor = dom.querySelector('[data-authoring-frame="block"]');
    if (!(frame instanceof HTMLElement)) throw new Error("Expected frame DOM");
    if (!(blockAnchor instanceof HTMLElement)) throw new Error("Expected block anchor DOM");

    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(rect());
    vi.spyOn(blockAnchor, "getBoundingClientRect").mockReturnValue({
      bottom: 40,
      height: 20,
      left: 120,
      right: 220,
      top: 20,
      width: 100,
      x: 120,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes[FRAMED_BLOCK],
        pos,
      },
      element: frame,
      rect: {
        left: 24,
        top: 12,
        width: 200,
      },
    });
    editor.destroy();
  });

  it("uses the delegated parent owner as movement target for selected embedded children", () => {
    const editor = makeEditor([embeddedOwner("quiz-a", block("question-a"))]);
    const ownerPos = nodePos(editor, EMBEDDED_OWNER_BLOCK, "quiz-a");
    const childPos = nodePos(editor, TEST_BLOCK, "question-a");
    const dom = editor.view.nodeDOM(ownerPos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected owner DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(rect());
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes[EMBEDDED_OWNER_BLOCK],
        pos: ownerPos,
      },
      targetRef: {
        id: "quiz-a",
        kind: InteractionTargetKind.Block,
        pos: ownerPos,
      },
      rect: {
        left: 24,
        top: 12,
        width: 200,
      },
    });
    editor.destroy();
  });

  it("does not expose grid or cell as selected movement targets", () => {
    const editor = makeEditor([grid([cell([block("a")])])]);
    const gridPos = nodePos(editor, "grid");
    const cellPos = nodePos(editor, "cell");

    expect(resolveEditorMovementTargetAtPos(editor, gridPos, testBlockRegistry)).toBeNull();
    expect(resolveEditorMovementTargetAtPos(editor, cellPos, testBlockRegistry)).toBeNull();
    editor.destroy();
  });

  it("resolves a structural layout position for arrangement-owned drag priming", () => {
    const editor = makeEditor([layout("layout-a", [section("section-a", [block("nested")])])]);
    const pos = nodePos(editor, "layout", "layout-a");

    expect(resolveEditorMovementTargetAtPos(editor, pos, testBlockRegistry)).toMatchObject({
      context: {
        nodeType: editor.schema.nodes.layout,
        pos,
      },
      targetRef: {
        id: "layout-a",
        kind: InteractionTargetKind.Layout,
        pos,
      },
    });
    editor.destroy();
  });

  it("does not expose a movement target when the source anchor is missing", () => {
    const editor = makeEditor([{ type: MISSING_ANCHOR_BLOCK, attrs: { id: "missing-anchor" } }]);
    const pos = nodePos(editor, MISSING_ANCHOR_BLOCK);

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    expect(resolveEditorMovementTarget(editor, testBlockRegistry)).toBeNull();
    editor.destroy();
  });
});
