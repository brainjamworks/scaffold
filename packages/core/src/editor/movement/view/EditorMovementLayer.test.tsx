// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { AUTHORING_CHROME_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import {
  authoringInteractionRootAttributes,
  resolveAuthoringInteractionRoot,
} from "@/editor/interactions/dom/authoring-root";
import { registerOverlayHostOwner } from "@/editor/interactions/dom/overlay-ownership";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createInteractionStore } from "@/editor/interactions/targets/facade/interaction-store";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { InteractionOwnerCommandKind } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-command-model";
import { setInteractionOwnerCommandMeta } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { setEditorResizeGestureActive } from "@/editor/interactions/gesture/editor-resize-gesture";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { zIndex } from "@/ui/overlays/z-index";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { ContainedMovementHandle } from "./ContainedMovementHandle";
import {
  EditorMovementLayer,
  MovementDropIndicator,
  isStructureMovementDragEventSource,
  resolveLiveMovementSourcePos,
  sourcePosFromDragEvent,
} from "./EditorMovementLayer";
import { StructureMovementHandle } from "./StructureMovementHandle";
import {
  InsertAfterTarget,
  InsertInsideTarget,
  MoveContainedAfterTarget,
} from "../model/movement-intents";
import {
  CellMovementTarget,
  ContainedMovementTarget,
  GridMovementTarget,
  type MovementTargetRect,
} from "../model/movement-target";
import type { MovementNodeContext } from "../model/movement-policy";
import type { MovementCandidate } from "./movement-candidate";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const floatingUiMock = vi.hoisted(() => {
  const computePositionFromAnchor = (reference: {
    getBoundingClientRect: () => DOMRectReadOnly;
  }) => {
    const rect = reference.getBoundingClientRect();
    return Promise.resolve({
      middlewareData: {},
      placement: "left-start",
      strategy: "absolute",
      x: rect.left + 111,
      y: rect.top + 222,
    });
  };

  return {
    autoUpdate: vi.fn((_reference: unknown, _floating: unknown, update: () => void) => {
      update();
      return vi.fn();
    }),
    computePosition: vi.fn(computePositionFromAnchor),
    computePositionFromAnchor,
    flip: vi.fn((options: unknown) => ({ name: "flip", options })),
    hide: vi.fn((options: unknown) => ({ name: "hide", options })),
    offset: vi.fn((value: number) => ({ name: "offset", options: value })),
    shift: vi.fn((options: unknown) => ({ name: "shift", options })),
    size: vi.fn((options: unknown) => ({ name: "size", options })),
  };
});

vi.mock("@floating-ui/dom", () => floatingUiMock);

const TEST_BLOCK = "movement_layer_test_block";
const FRAMED_BLOCK = "movement_layer_framed_block";
const MISSING_ANCHOR_BLOCK = "movement_layer_missing_anchor_block";
const TEXT_BLOCK = "movement_layer_text_block";
const TEXT_FIELD = "movement_layer_text_field";
const CONTAINED_CHOICE = "selectable_choice";
const CONTAINED_CHOICES_GROUP = "assessment_choices_group";

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: TEST_BLOCK }),
  defineBlock({ nodeType: FRAMED_BLOCK }),
  defineBlock({ nodeType: MISSING_ANCHOR_BLOCK }),
  defineBlock({ nodeType: TEXT_BLOCK }),
]);
const testSurfaceVariants = createSurfaceVariantRegistry([pageDefaultSurfaceDefinition]);

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
    return [{ tag: "div[data-framed-movement-layer-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-framed-movement-layer-block": "",
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
    return [{ tag: "div[data-movement-layer-missing-anchor-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-movement-layer-missing-anchor-block": "",
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
    return [{ tag: "div[data-movement-layer-text-field]" }];
  },

  renderHTML() {
    return ["div", { "data-movement-layer-text-field": "" }, 0];
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
        default: "movement-layer-text-block",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-movement-layer-text-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      { ...HTMLAttributes, "data-movement-layer-text-block": "" },
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

const TestContainedChoiceNode = Node.create({
  name: CONTAINED_CHOICE,
  content: "paragraph+",
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-choice-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-choice-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-movement-layer-contained-choice]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-movement-layer-contained-choice": "" }, 0];
  },
});

const TestContainedChoicesGroupNode = Node.create({
  name: CONTAINED_CHOICES_GROUP,
  group: "block",
  content: `${CONTAINED_CHOICE}+`,
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-movement-layer-contained-choices]" }];
  },

  renderHTML() {
    return ["div", { "data-movement-layer-contained-choices": "" }, 0];
  },
});

function block(id: string): JSONContent {
  return { type: TEST_BLOCK, attrs: { id } };
}

function containedChoice(id: string): JSONContent {
  return {
    type: CONTAINED_CHOICE,
    attrs: { id },
    content: [{ type: "paragraph" }],
  };
}

function containedChoices(ids: string[]): JSONContent {
  return {
    type: CONTAINED_CHOICES_GROUP,
    content: ids.map(containedChoice),
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
  return { type: "cell", content };
}

function grid(cells: JSONContent[]): JSONContent {
  return { type: "grid", content: cells };
}

function makeEditor(content: JSONContent[]) {
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  const element = document.createElement("div");
  ownerRoot.append(element);
  document.body.append(ownerRoot);
  const editor = new Editor({
    element,
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
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestBlockNode,
      FramedBlockNode,
      MissingAnchorBlockNode,
      TestTextFieldNode,
      TestTextBlockNode,
      TestContainedChoicesGroupNode,
      TestContainedChoiceNode,
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

  editor.view.dom.focus();
  return editor;
}

function renderMovementLayer(
  editor: Editor,
  children?: Parameters<typeof EditorMovementLayer>[0]["children"],
) {
  const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);
  return render(
    <InteractionProvider store={createInteractionStore()}>
      <AuthoringOverlayBoundary ownerRoot={ownerRoot}>
        <EditorMovementLayer
          blockDefinitions={testBlockRegistry}
          editor={editor}
          surfaceVariants={testSurfaceVariants}
        >
          {children}
        </EditorMovementLayer>
      </AuthoringOverlayBoundary>
    </InteractionProvider>,
  );
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

function idsInDocument(editor: Editor): string[] {
  const ids: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === TEST_BLOCK && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });

  return ids;
}

function containedChoiceIds(editor: Editor): string[] {
  const ids: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === CONTAINED_CHOICE && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });

  return ids;
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

function movementCandidate(
  Target: new (
    context: MovementNodeContext,
    rect: MovementTargetRect,
  ) => GridMovementTarget | CellMovementTarget,
  rect: MovementTargetRect,
  intentName: "after" | "inside",
): MovementCandidate {
  const context = {
    ancestors: [],
    index: 0,
    node: {} as MovementNodeContext["node"],
    nodeType: { name: "test" } as MovementNodeContext["nodeType"],
    parent: null,
    parentPos: null,
    parentType: null,
    pos: 12,
  };
  const target = new Target(context, rect);

  return {
    intent: intentName === "after" ? new InsertAfterTarget(target) : new InsertInsideTarget(target),
    source: context,
    target,
  };
}

function containedMovementCandidate(rect: MovementTargetRect): MovementCandidate {
  const context = {
    ancestors: [],
    index: 1,
    node: {} as MovementNodeContext["node"],
    nodeType: { name: "selectable_choice" } as MovementNodeContext["nodeType"],
    parent: {} as MovementNodeContext["parent"],
    parentPos: 8,
    parentType: {
      name: "assessment_choices_group",
    } as MovementNodeContext["parentType"],
    pos: 24,
  };
  const target = new ContainedMovementTarget(context, rect);

  return {
    intent: new MoveContainedAfterTarget(target),
    source: context,
    target,
  };
}

function movementRect(overrides: Partial<MovementTargetRect>): MovementTargetRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    ...overrides,
  };
}

function dragSourceEvent(
  current: Record<string, unknown>,
): Parameters<typeof sourcePosFromDragEvent>[0] {
  return {
    active: {
      data: {
        current,
      },
    },
  } as unknown as Parameters<typeof sourcePosFromDragEvent>[0];
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetFloatingUiMock();
});

describe("EditorMovementLayer", () => {
  it("resolves a live contained source position before using rendered drag data", () => {
    expect(
      isStructureMovementDragEventSource(
        dragSourceEvent({
          nonStructureDrag: true,
        }),
      ),
    ).toBe(false);

    expect(
      sourcePosFromDragEvent(
        dragSourceEvent({
          getSourcePos: () => 42,
          sourcePos: 12,
        }),
      ),
    ).toBe(42);
    expect(
      isStructureMovementDragEventSource(
        dragSourceEvent({
          getSourcePos: () => 42,
          sourcePos: 12,
        }),
      ),
    ).toBe(true);

    expect(
      sourcePosFromDragEvent(
        dragSourceEvent({
          getSourcePos: () => {
            throw new Error("disposed NodeView");
          },
          sourcePos: 12,
        }),
      ),
    ).toBe(12);
  });

  it("resolves a live structure source position before using rendered drag data", () => {
    const editor = makeEditor([block("stale"), block("current")]);
    const stalePos = nodePos(editor, TEST_BLOCK, "stale");
    const currentPos = nodePos(editor, TEST_BLOCK, "current");
    const currentDom = editor.view.nodeDOM(currentPos);
    if (!(currentDom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(currentDom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, currentPos)),
    );

    expect(resolveLiveMovementSourcePos(editor, stalePos, testBlockRegistry)).toBe(currentPos);
    editor.destroy();
  });

  it("renders a floating movement handle for the selected movement source", async () => {
    const editor = makeEditor([block("a"), block("b")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const { container } = renderMovementLayer(editor, <div data-testid="movement-layer-child" />);

    const movementLayer = screen.getByTestId("scaffold-editor-movement-layer");
    expect(movementLayer).toBeInTheDocument();
    expect(movementLayer.parentElement?.dataset.scaffoldEditorFloatingLayer).toBe("");
    expect(movementLayer.closest("[data-scaffold-overlay-host]")).not.toBeNull();
    expect(movementLayer.parentElement).not.toBe(document.body);
    expect(container.contains(movementLayer)).toBe(false);
    expect(container.contains(screen.getByTestId("movement-layer-child"))).toBe(true);
    expect(movementLayer.style.zIndex).toBe(String(zIndex.interactive));
    expect(
      document
        .querySelector("[data-authoring-move-handle]")
        ?.getAttribute("data-authoring-move-pos"),
    ).toBe(String(pos));
    const handle = document.querySelector("[data-authoring-move-handle]");
    expect(handle).toBeInstanceOf(HTMLElement);
    expect(handle?.getAttribute(AUTHORING_CHROME_ATTR)).toBe("handle");
    const floatingContent = handle?.parentElement;
    expect(floatingContent?.className).toContain("sc-editor-floating-content");
    await waitFor(() => {
      expect(floatingUiMock.offset).toHaveBeenCalledWith(8);
      expect((floatingContent as HTMLElement | null)?.style.left).toBe("151px");
      expect((floatingContent as HTMLElement | null)?.style.top).toBe("242px");
    });
    expect((handle as HTMLElement | null)?.style.left).toBe("");
    expect((handle as HTMLElement | null)?.style.top).toBe("");

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    handle?.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    editor.destroy();
  });

  it("keeps the selected movement handle across a transaction while focus is in its registered overlay host", async () => {
    const editor = makeEditor([block("a"), block("b")]);
    const ownerRoot = resolveAuthoringInteractionRoot(editor.view.dom);
    if (!(ownerRoot instanceof HTMLElement)) throw new Error("Expected owner root");
    const overlayHost = document.createElement("div");
    const overlayControl = document.createElement("button");
    overlayHost.append(overlayControl);
    ownerRoot.append(overlayHost);
    const unregisterOverlayHost = registerOverlayHostOwner(ownerRoot, overlayHost);

    try {
      const pos = nodePos(editor, TEST_BLOCK, "a");
      const dom = editor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");
      vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 20, 200, 80));
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
      );
      editor.view.dom.focus();
      renderMovementLayer(editor);

      expect(document.querySelector("[data-authoring-move-handle]")).not.toBeNull();
      overlayControl.focus();
      expect(document.activeElement).toBe(overlayControl);
      expect(document.querySelector("[data-authoring-move-handle]")).not.toBeNull();

      await act(async () => {
        editor.view.dispatch(editor.state.tr.setMeta("scaffold-test-render", true));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(document.querySelector("[data-authoring-move-handle]")).not.toBeNull();
      });
    } finally {
      unregisterOverlayHost();
      editor.destroy();
      ownerRoot.remove();
    }
  });

  it("positions the movement handle from the floating primitive instead of target rect", async () => {
    let updateFloatingPosition: (() => void) | null = null;
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: unknown, _floating: unknown, update: () => void) => {
        updateFloatingPosition = update;
        update();
        return vi.fn();
      },
    );
    const editor = makeEditor([block("a"), block("b")]);
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
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    renderMovementLayer(editor);

    const handle = await screen.findByRole("button", { name: "Move block" });
    const floatingContent = handle.parentElement;
    if (!(floatingContent instanceof HTMLElement)) {
      throw new Error("Expected floating content wrapper");
    }

    await waitFor(() => {
      expect(floatingContent.style.left).toBe("151px");
      expect(floatingContent.style.top).toBe("242px");
    });
    expect(handle.style.left).toBe("");
    expect(handle.style.top).toBe("");
    expect(floatingUiMock.computePosition).toHaveBeenCalledWith(
      dom,
      floatingContent,
      expect.objectContaining({
        placement: "left-start",
        strategy: "absolute",
      }),
    );

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
    await act(async () => {
      updateFloatingPosition?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(floatingContent.style.left).toBe("191px");
      expect(floatingContent.style.top).toBe("302px");
    });
    expect(handle.style.left).toBe("");
    expect(handle.style.top).toBe("");
    editor.destroy();
  });

  it("keeps the same floating subscription when rerendering the same movement anchor", async () => {
    const editor = makeEditor([block("a"), block("b")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const store = createInteractionStore();
    const rendered = render(
      <InteractionProvider store={store}>
        <EditorMovementLayer
          blockDefinitions={testBlockRegistry}
          editor={editor}
          surfaceVariants={testSurfaceVariants}
        >
          <div data-testid="movement-layer-child">initial</div>
        </EditorMovementLayer>
      </InteractionProvider>,
    );

    const handle = await screen.findByRole("button", { name: "Move block" });
    const floatingContent = handle.parentElement;
    if (!(floatingContent instanceof HTMLElement)) {
      throw new Error("Expected floating content wrapper");
    }
    await waitFor(() => {
      expect(floatingContent.style.left).toBe("151px");
    });
    const autoUpdateCallCount = floatingUiMock.autoUpdate.mock.calls.length;

    rendered.rerender(
      <InteractionProvider store={store}>
        <EditorMovementLayer
          blockDefinitions={testBlockRegistry}
          editor={editor}
          surfaceVariants={testSurfaceVariants}
        >
          <div data-testid="movement-layer-child">rerendered</div>
        </EditorMovementLayer>
      </InteractionProvider>,
    );

    expect(screen.getByTestId("movement-layer-child").textContent).toBe("rerendered");
    await Promise.resolve();
    expect(floatingUiMock.autoUpdate).toHaveBeenCalledTimes(autoUpdateCallCount);
    editor.destroy();
  });

  it("moves the selected block with the keyboard handle and announces status", async () => {
    const editor = makeEditor([block("a"), block("b"), block("c")]);
    const pos = nodePos(editor, TEST_BLOCK, "b");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    renderMovementLayer(editor);

    const handle = await screen.findByRole("button", { name: "Move block" });
    expect(handle.getAttribute("aria-keyshortcuts")).toBe("ArrowUp ArrowDown");
    expect(describedText(handle)).toBe("Press Arrow Up or Arrow Down to move this block.");

    fireEvent.keyDown(handle, { key: "ArrowUp" });

    await waitFor(() => {
      expect(idsInDocument(editor)).toEqual(["b", "a", "c"]);
      expect(screen.getByTestId("scaffold-movement-status").textContent).toBe("Moved block up.");
    });
    editor.destroy();
  });

  it("moves a contained item with the keyboard handle and announces status", async () => {
    const editor = makeEditor([containedChoices(["a", "b", "c"])]);
    const initialSourcePos = nodePos(editor, CONTAINED_CHOICE, "b");

    renderMovementLayer(
      editor,
      <ContainedMovementHandle
        getSourcePos={() => nodePos(editor, CONTAINED_CHOICE, "b")}
        label="choice"
        sourceKey="choice-b"
        sourcePos={initialSourcePos}
      />,
    );

    const handle = screen.getByRole("button", { name: "Move choice" });
    expect(handle.getAttribute("aria-keyshortcuts")).toBe("ArrowUp ArrowDown");
    expect(describedText(handle)).toBe("Press Arrow Up or Arrow Down to move this choice.");

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);

    fireEvent.keyDown(handle, { key: "ArrowUp" });

    await waitFor(() => {
      expect(containedChoiceIds(editor)).toEqual(["b", "a", "c"]);
      expect(screen.getByTestId("scaffold-movement-status").textContent).toBe("Moved choice up.");
    });
    editor.destroy();
  });

  it("prevents focus loss from structural movement handle mouse down", () => {
    const editor = makeEditor([block("a")]);

    renderMovementLayer(
      editor,
      <StructureMovementHandle label="section" sourceKey="section-a" sourcePos={3} />,
    );

    const handle = screen.getByRole("button", { name: "Move section" });
    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    editor.destroy();
  });

  it("suppresses movement handle chrome while resize owns the transient interaction", async () => {
    const editor = makeEditor([block("a")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    renderMovementLayer(editor);

    expect(document.querySelector("[data-authoring-move-handle]")).not.toBeNull();

    act(() => {
      setEditorResizeGestureActive(editor, true);
    });

    await waitFor(() => {
      expect(document.querySelector("[data-authoring-move-handle]")).toBeNull();
    });

    act(() => {
      setEditorResizeGestureActive(editor, false);
    });

    await waitFor(() => {
      expect(document.querySelector("[data-authoring-move-handle]")).not.toBeNull();
    });
    editor.destroy();
  });

  it("suppresses movement handle chrome while an explicit structural owner is active", () => {
    const editor = makeEditor([block("a"), grid([cell([block("b")])])]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const gridPos = nodePos(editor, "grid");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: { kind: InteractionTargetKind.Grid, pos: gridPos },
      }),
    );
    editor.view.dom.focus();

    renderMovementLayer(editor);

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(document.querySelector("[data-authoring-move-handle]")).toBeNull();
    editor.destroy();
  });

  it("begins and ends a gesture around a movement handle drag", async () => {
    const editor = makeEditor([block("a"), block("b")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    const beginTargets: unknown[] = [];
    let endedGestures = 0;
    const store = createInteractionStore({
      commandPorts: {
        beginGesture: (target) => {
          beginTargets.push(target);
          return true;
        },
        endGesture: () => {
          endedGestures += 1;
          return true;
        },
      },
    });

    render(
      <InteractionProvider store={store}>
        <AuthoringOverlayBoundary ownerRoot={resolveAuthoringInteractionRoot(editor.view.dom)}>
          <EditorMovementLayer
            blockDefinitions={testBlockRegistry}
            editor={editor}
            surfaceVariants={testSurfaceVariants}
          />
        </AuthoringOverlayBoundary>
      </InteractionProvider>,
    );

    const handle = await screen.findByRole("button", { name: "Move block" });
    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 30,
      clientY: 30,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(handle.ownerDocument, {
      clientX: 60,
      clientY: 60,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(beginTargets).toEqual([{ id: "a", kind: InteractionTargetKind.Block, pos }]);
    });

    fireEvent.pointerUp(handle.ownerDocument, {
      clientX: 60,
      clientY: 60,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(endedGestures).toBeGreaterThan(0);
    });
    editor.destroy();
  });

  it("suppresses movement handle chrome when authoring is read-only", () => {
    const editor = makeEditor([block("a")]);
    const pos = nodePos(editor, TEST_BLOCK, "a");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    editor.setEditable(false);

    renderMovementLayer(editor);

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(document.querySelector("[data-authoring-move-handle]")).toBeNull();
    editor.destroy();
  });

  it("renders a movement handle for the active block when the cursor is inside field content", () => {
    const editor = makeEditor([textBlock("Nested editor field")]);
    const pos = nodePos(editor, TEXT_BLOCK);
    const shell = editor.view.nodeDOM(pos);
    if (!(shell instanceof HTMLElement)) throw new Error("Expected block DOM");
    const dom = shell.querySelector('[data-authoring-frame="block"]');
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block anchor DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.commands.setTextSelection(textPos(editor, "editor") + 2);

    renderMovementLayer(editor);

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    const handle = document.querySelector("[data-authoring-move-handle]");
    expect(handle).toBeInstanceOf(HTMLElement);
    expect(handle?.getAttribute("data-authoring-move-pos")).toBe(String(pos));
    editor.destroy();
  });

  it("tracks the selected block frame when floating autoUpdate reports a resize", async () => {
    let updateFloatingPosition: (() => void) | null = null;
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: unknown, _floating: unknown, update: () => void) => {
        updateFloatingPosition = update;
        update();
        return vi.fn();
      },
    );
    const resizeObservers: Array<{
      callback: ResizeObserverCallback;
      targets: Element[];
    }> = [];
    class TestResizeObserver implements ResizeObserver {
      private readonly record: {
        callback: ResizeObserverCallback;
        targets: Element[];
      };

      constructor(callback: ResizeObserverCallback) {
        this.record = { callback, targets: [] };
        resizeObservers.push(this.record);
      }

      disconnect = vi.fn();
      observe = vi.fn((target: Element) => {
        this.record.targets.push(target);
      });
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const editor = makeEditor([framedBlock("framed")]);
    const pos = nodePos(editor, FRAMED_BLOCK, "framed");
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block DOM");
    const frame = dom.querySelector("[data-authoring-frame-wrapper]");
    const blockAnchor = dom.querySelector('[data-authoring-frame="block"]');
    if (!(frame instanceof HTMLElement)) throw new Error("Expected frame DOM");
    if (!(blockAnchor instanceof HTMLElement)) throw new Error("Expected block anchor DOM");

    let frameRect = {
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
    vi.spyOn(frame, "getBoundingClientRect").mockImplementation(() => frameRect);
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

    renderMovementLayer(editor);

    const handle = await screen.findByRole("button", { name: "Move block" });
    const floatingContent = handle.parentElement;
    expect(floatingContent?.className).toContain("sc-editor-floating-content");
    await waitFor(() => {
      expect((floatingContent as HTMLElement | null)?.style.left).toBe("151px");
      expect((floatingContent as HTMLElement | null)?.style.top).toBe("242px");
    });
    expect(handle.style.left).toBe("");
    expect(handle.style.top).toBe("");
    await waitFor(() => {
      expect(resizeObservers.some((observer) => observer.targets.includes(frame))).toBe(true);
    });

    frameRect = {
      bottom: 140,
      height: 100,
      left: 80,
      right: 200,
      top: 40,
      width: 120,
      x: 80,
      y: 40,
      toJSON: () => ({}),
    };
    await act(async () => {
      updateFloatingPosition?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect((floatingContent as HTMLElement | null)?.style.left).toBe("191px");
      expect((floatingContent as HTMLElement | null)?.style.top).toBe("262px");
    });
    editor.destroy();
  });

  it("hides movement chrome when the selected block anchor disappears after selection", async () => {
    const editor = makeEditor([textBlock("Nested editor field")]);
    const pos = nodePos(editor, TEXT_BLOCK);
    const shell = editor.view.nodeDOM(pos);
    if (!(shell instanceof HTMLElement)) throw new Error("Expected block DOM");
    const dom = shell.querySelector('[data-authoring-frame="block"]');
    if (!(dom instanceof HTMLElement)) throw new Error("Expected block anchor DOM");

    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 80,
      left: 40,
      right: 240,
      top: 20,
      width: 200,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    });
    editor.commands.setTextSelection(textPos(editor, "editor") + 2);

    renderMovementLayer(editor);
    expect(document.querySelector("[data-authoring-move-handle]")).not.toBeNull();

    dom.removeAttribute("data-authoring-frame");
    editor.view.dispatch(editor.state.tr.setMeta("scaffold-test-refresh", true));

    await waitFor(() => {
      expect(document.querySelector("[data-authoring-move-handle]")).toBeNull();
    });
    editor.destroy();
  });

  it("renders no movement handle when no movement source is selected", () => {
    const editor = makeEditor([{ type: "paragraph" }]);

    renderMovementLayer(editor);

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(document.querySelector("[data-authoring-move-handle]")).toBeNull();
    editor.destroy();
  });

  it("renders no movement handle when the selected source anchor is missing", () => {
    const editor = makeEditor([{ type: MISSING_ANCHOR_BLOCK, attrs: { id: "missing-anchor" } }]);
    const pos = nodePos(editor, MISSING_ANCHOR_BLOCK);

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    renderMovementLayer(editor);

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(document.querySelector("[data-authoring-move-handle]")).toBeNull();
    editor.destroy();
  });

  it("renders grid row indicators across the resolved grid lane", () => {
    render(
      <MovementDropIndicator
        candidate={movementCandidate(
          GridMovementTarget,
          movementRect({
            bottom: 180,
            height: 120,
            left: 40,
            right: 440,
            top: 60,
            width: 400,
          }),
          "after",
        )}
      />,
    );

    const frame = screen.getByTestId("scaffold-drop-indicator-frame");
    const indicator = screen.getByTestId("scaffold-drop-indicator");

    expect(frame.getAttribute("contenteditable")).toBe("false");
    expect(frame.style.left).toBe("40px");
    expect(frame.style.top).toBe("60px");
    expect(frame.style.width).toBe("400px");
    expect(frame.style.height).toBe("120px");
    expect(indicator.getAttribute("data-scaffold-drop-intent")).toBe("insert-after");
    expect(indicator.getAttribute("contenteditable")).toBe("false");
  });

  it("renders inside-cell indicators inside the resolved cell lane only", () => {
    render(
      <MovementDropIndicator
        candidate={movementCandidate(
          CellMovementTarget,
          movementRect({
            bottom: 140,
            height: 80,
            left: 260,
            right: 420,
            top: 60,
            width: 160,
          }),
          "inside",
        )}
      />,
    );

    const frame = screen.getByTestId("scaffold-drop-indicator-frame");
    const indicator = screen.getByTestId("scaffold-drop-indicator");

    expect(frame.getAttribute("contenteditable")).toBe("false");
    expect(frame.style.left).toBe("260px");
    expect(frame.style.top).toBe("60px");
    expect(frame.style.width).toBe("160px");
    expect(frame.style.height).toBe("80px");
    expect(indicator.getAttribute("data-scaffold-drop-intent")).toBe("insert-inside");
    expect(indicator.getAttribute("contenteditable")).toBe("false");
  });

  it("renders contained row indicators inside the resolved row lane", () => {
    render(
      <MovementDropIndicator
        candidate={containedMovementCandidate(
          movementRect({
            bottom: 96,
            height: 48,
            left: 80,
            right: 360,
            top: 48,
            width: 280,
          }),
        )}
      />,
    );

    const frame = screen.getByTestId("scaffold-drop-indicator-frame");
    const indicator = screen.getByTestId("scaffold-drop-indicator");

    expect(frame.getAttribute("contenteditable")).toBe("false");
    expect(frame.style.left).toBe("80px");
    expect(frame.style.top).toBe("48px");
    expect(frame.style.width).toBe("280px");
    expect(frame.style.height).toBe("48px");
    expect(indicator.getAttribute("data-scaffold-drop-intent")).toBe("move-contained-after");
    expect(indicator.getAttribute("contenteditable")).toBe("false");
  });
});

function resetFloatingUiMock(): void {
  floatingUiMock.autoUpdate.mockReset();
  floatingUiMock.autoUpdate.mockImplementation(
    (_reference: unknown, _floating: unknown, update: () => void) => {
      update();
      return vi.fn();
    },
  );
  floatingUiMock.computePosition.mockReset();
  floatingUiMock.computePosition.mockImplementation(floatingUiMock.computePositionFromAnchor);
  floatingUiMock.flip.mockReset();
  floatingUiMock.flip.mockImplementation((options: unknown) => ({ name: "flip", options }));
  floatingUiMock.hide.mockReset();
  floatingUiMock.hide.mockImplementation((options: unknown) => ({ name: "hide", options }));
  floatingUiMock.offset.mockReset();
  floatingUiMock.offset.mockImplementation((value: number) => ({ name: "offset", options: value }));
  floatingUiMock.shift.mockReset();
  floatingUiMock.shift.mockImplementation((options: unknown) => ({ name: "shift", options }));
  floatingUiMock.size.mockReset();
  floatingUiMock.size.mockImplementation((options: unknown) => ({ name: "size", options }));
}
