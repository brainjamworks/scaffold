// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { RESIZE_GESTURE_ACTIVE_ATTR } from "@/editor/interactions/gesture/editor-resize-gesture";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  EditorFloatingLayer,
  resolveEditorFloatingLayerRoot,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import {
  AUTHORING_ANCHOR_ATTR,
  authoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import {
  AUTHORING_INTERACTION_ROOT_ATTR,
  resolveAuthoringInteractionRoot,
} from "@/editor/interactions/dom/authoring-root";
import {
  createInteractionChromeSlot,
  createInteractionOwnerSnapshot,
  InteractionChromeSlotReason,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createInteractionStore } from "@/editor/interactions/targets/facade/interaction-store";
import type { StructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { structuralMenuAnchorId } from "@/editor/interactions/interaction-bubble/structural-bubble-anchor";

import {
  resolveStructuralBubbleAnchorVirtualElement,
  resolveStructuralInteractionBubbleModel as resolveStructuralInteractionBubbleModelWithPort,
  resolveStructuralBubblePlacement,
  StructuralInteractionBubbleMenu,
} from "./StructuralInteractionBubbleMenu";
import {
  createStructuralInteractionBubbleRendererMap,
  type StructuralInteractionBubbleRenderer,
  type StructuralInteractionBubbleRendererBinding,
} from "@/editor/interactions/interaction-bubble";

const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: builtInBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});
let testRendererBindings: StructuralInteractionBubbleRendererBinding[] = [];

function createTestRendererMap() {
  return createStructuralInteractionBubbleRendererMap(testRendererBindings);
}

const resolveStructuralInteractionBubbleModel = (
  editor: Parameters<typeof resolveStructuralInteractionBubbleModelWithPort>[0],
  snapshot: Parameters<typeof resolveStructuralInteractionBubbleModelWithPort>[1],
) =>
  resolveStructuralInteractionBubbleModelWithPort(
    editor,
    snapshot,
    alignmentTargetPort,
    createTestRendererMap(),
  );

const TestGridNode = structuralNode("grid", "cell+");
const TestCellNode = structuralNode("cell", "paragraph+");
const TestRegionNode = structuralNode("region", "paragraph+");
const TestLayoutNode = structuralNode("layout", "section+");
const TestSectionNode = structuralNode("section", "paragraph+");

function structuralNode(name: string, content: string) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
        verticalPosition: { default: "top" },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-structural-host-${name}]` }];
    },

    renderHTML({ node, HTMLAttributes }) {
      return [
        "div",
        {
          ...HTMLAttributes,
          ...authoringFrameAttributes({
            frameKind: name as "grid" | "cell",
            id: node.attrs["id"],
            nodeType: name,
          }),
          [`data-v2-structural-host-${name}`]: "",
        },
        0,
      ];
    },
  });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanup();
  while (cleanups.length) cleanups.pop()?.();
  testRendererBindings = [];
});

function makeEditor(content: JSONContent): Editor {
  const root = document.createElement("div");
  root.setAttribute("data-testid", "authoring-root");
  root.setAttribute(AUTHORING_INTERACTION_ROOT_ATTR, "");
  const element = document.createElement("div");
  root.appendChild(element);
  document.body.appendChild(root);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldTextAlignExtension(["paragraph", "heading"]),
      TestGridNode,
      TestCellNode,
      TestRegionNode,
      TestLayoutNode,
      TestSectionNode,
    ],
    content,
  });
  cleanups.push(() => {
    editor.destroy();
    root.remove();
  });
  return editor;
}

function gridContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "cell text" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function twoGridContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
      {
        type: "grid",
        attrs: { id: "grid-b" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-b" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

function nodePosById(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing node ${id}`);
  return found;
}

function gridRef(editor: Editor, id: string): InteractionTargetRef {
  return {
    id,
    kind: InteractionTargetKind.Grid,
    pos: nodePosById(editor, id),
  };
}

function structuralRef(
  editor: Editor,
  kind:
    | typeof InteractionTargetKind.Cell
    | typeof InteractionTargetKind.Region
    | typeof InteractionTargetKind.Section,
  id: string,
): InteractionTargetRef {
  return { id, kind, pos: nodePosById(editor, id) };
}

function placementFor(kind: StructuralChromeTargetDescriptor["kind"]) {
  return resolveStructuralBubblePlacement({ kind } as StructuralChromeTargetDescriptor);
}

function arrangementMenuSnapshot(input: { target: InteractionTargetRef | null; visible: boolean }) {
  return createInteractionOwnerSnapshot({
    chromeSlots: {
      arrangementMenu: createInteractionChromeSlot({
        reason: input.visible
          ? InteractionChromeSlotReason.Allowed
          : InteractionChromeSlotReason.MissingTarget,
        target: input.target,
        visible: input.visible,
      }),
    },
  });
}

function registerTestGridRenderer(renderer: StructuralInteractionBubbleRenderer) {
  const binding = { kind: InteractionTargetKind.Grid, renderer } as const;
  testRendererBindings.push(binding);
  const unregister = () => {
    testRendererBindings = testRendererBindings.filter((candidate) => candidate !== binding);
  };
  return unregister;
}

function registerTestRenderer(
  kind:
    | typeof InteractionTargetKind.Region
    | typeof InteractionTargetKind.Cell
    | typeof InteractionTargetKind.Section,
  renderer: StructuralInteractionBubbleRenderer,
) {
  const binding = { kind, renderer } as const;
  testRendererBindings.push(binding);
  const unregister = () => {
    testRendererBindings = testRendererBindings.filter((candidate) => candidate !== binding);
  };
  return unregister;
}

function appendStructuralMenuTrigger(editor: Editor, id: string): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.setAttribute(
    AUTHORING_ANCHOR_ATTR,
    structuralMenuAnchorId(InteractionTargetKind.Grid, id) ?? "",
  );
  resolveAuthoringInteractionRoot(editor.view.dom).appendChild(trigger);
  cleanups.push(() => trigger.remove());
  return trigger;
}

function appendStructuralMenuTriggerWithin(root: Element, id: string): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.setAttribute(
    AUTHORING_ANCHOR_ATTR,
    structuralMenuAnchorId(InteractionTargetKind.Grid, id) ?? "",
  );
  root.appendChild(trigger);
  cleanups.push(() => trigger.remove());
  return trigger;
}

describe("StructuralInteractionBubbleMenu boundary", () => {
  it("appends the Tiptap bubble to the nearest ready authoring host", async () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <button type="button">{descriptor.id}</button>);
    const boundaryRoot = document.createElement("div");
    document.body.append(boundaryRoot);
    cleanups.push(() => boundaryRoot.remove());
    const store = createInteractionStore({
      snapshot: arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    });

    render(
      <OverlayBoundary container={boundaryRoot} kind="contained">
        <InteractionProvider store={store}>
          <StructuralInteractionBubbleMenu
            alignmentTargetPort={alignmentTargetPort}
            editor={editor}
            pluginKey="testStructuralBoundaryBubble"
            renderers={createTestRendererMap()}
          />
        </InteractionProvider>
      </OverlayBoundary>,
    );

    await waitFor(() => {
      const host = boundaryRoot.querySelector("[data-scaffold-overlay-host]");
      const bubble = boundaryRoot.querySelector("[data-scaffold-interaction-bubble]");
      expect(host).not.toBeNull();
      expect(bubble?.closest("[data-scaffold-overlay-host]")).toBe(host);
      expect(bubble?.parentElement?.hasAttribute("data-scaffold-bubble-toolbar-frame")).toBe(true);
      expect(
        bubble
          ?.closest("[data-scaffold-bubble-placement-ready]")
          ?.getAttribute("data-scaffold-bubble-placement-ready"),
      ).toBe("true");
    });
  });

  it("does not register a Tiptap bubble while its authoring boundary is pending", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <button type="button">{descriptor.id}</button>);
    const store = createInteractionStore({
      snapshot: arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    });
    const initialPluginCount = editor.state.plugins.length;

    render(
      <OverlayBoundary container={null} kind="contained">
        <InteractionProvider store={store}>
          <StructuralInteractionBubbleMenu
            alignmentTargetPort={alignmentTargetPort}
            editor={editor}
            pluginKey="testPendingStructuralBubble"
            renderers={createTestRendererMap()}
          />
        </InteractionProvider>
      </OverlayBoundary>,
    );

    expect(editor.state.plugins).toHaveLength(initialPluginCount);
  });
});

describe("resolveStructuralInteractionBubbleModel", () => {
  it.each([
    [InteractionTargetKind.Cell, "cell-a", gridContent()],
    [InteractionTargetKind.Section, "section-a", sectionContent()],
  ] as const)("shows common-only alignment for a %s without a renderer", (kind, id, content) => {
    const editor = makeEditor(content);
    if (kind === InteractionTargetKind.Section) {
      registerTestRenderer(kind, () => null);
    }
    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: structuralRef(editor, kind, id),
        visible: true,
      }),
    );

    expect(model).not.toBeNull();
    render(model?.content);
    expect(screen.getByRole("radiogroup", { name: "Horizontal alignment" })).toBeInTheDocument();
  });

  it("composes Region alignment with owner controls and one separator", () => {
    const editor = makeEditor(regionContent());
    registerTestRenderer(InteractionTargetKind.Region, () => (
      <button type="button">Owner control</button>
    ));
    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: structuralRef(editor, InteractionTargetKind.Region, "region-a"),
        visible: true,
      }),
    );

    const { container } = render(model?.content);
    expect(screen.getByRole("radiogroup", { name: "Horizontal alignment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Owner control" })).toBeInTheDocument();
    expect(container.querySelectorAll(".sc-menu-separator")).toHaveLength(1);
  });

  it("keeps both common Region axes without an owner renderer", async () => {
    const editor = makeEditor(regionContent());

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: structuralRef(editor, InteractionTargetKind.Region, "region-a"),
        visible: true,
      }),
    );

    expect(model).not.toBeNull();
    const { container } = render(model?.content);
    expect(screen.getByRole("radiogroup", { name: "Horizontal alignment" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Vertical alignment" })).toBeInTheDocument();
    expect(container.querySelectorAll(".sc-menu-separator")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: "Vertical alignment: Middle" }));
    expect(editor.state.doc.nodeAt(0)?.attrs["verticalPosition"]).toBe("middle");
    expect(editor.state.doc.nodeAt(0)?.child(0).attrs["textAlign"]).toBe("left");

    editor.view.dispatch(editor.state.tr.setNodeMarkup(3, undefined, { textAlign: "right" }));
    await waitFor(() => {
      expect(
        screen.getByRole("radiogroup", { name: "Horizontal alignment (mixed)" }),
      ).toBeInTheDocument();
    });
  });

  it("re-derives mixed alignment after document transactions", async () => {
    const editor = makeEditor(mixedCellContent());
    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: structuralRef(editor, InteractionTargetKind.Cell, "cell-a"),
        visible: true,
      }),
    );
    render(model?.content);

    expect(
      screen.getByRole("radiogroup", { name: "Horizontal alignment (mixed)" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("radio", { name: "Horizontal alignment (mixed): Right" }),
    );
    await waitFor(() => {
      expect(
        screen
          .getByRole("radio", { name: "Horizontal alignment: Right" })
          .getAttribute("aria-checked"),
      ).toBe("true");
    });
  });

  it("resolves a visible arrangement menu slot to a renderer-backed model", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => (
      <div data-testid="grid-menu-content">{descriptor.id}</div>
    ));

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    expect(model?.descriptor.id).toBe("grid-a");
    expect(model?.placement).toBe("top-start");
    expect(model?.targetKey).toBe(model?.descriptor.targetKey);
    expect(model).toMatchObject({ content: expect.anything() });
  });

  it("returns null while the arrangement menu slot is hidden", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    expect(
      resolveStructuralInteractionBubbleModel(
        editor,
        arrangementMenuSnapshot({
          target: gridRef(editor, "grid-a"),
          visible: false,
        }),
      ),
    ).toBeNull();
  });

  it("returns null for a stale slot target", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    expect(
      resolveStructuralInteractionBubbleModel(
        editor,
        arrangementMenuSnapshot({
          target: { id: "grid-gone", kind: InteractionTargetKind.Grid },
          visible: true,
        }),
      ),
    ).toBeNull();
  });

  it("keeps common Grid vertical alignment without a registered renderer", () => {
    const editor = makeEditor(gridContent());

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    expect(model).not.toBeNull();
    render(model?.content);
    expect(screen.getByRole("radiogroup", { name: "Vertical alignment" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Horizontal alignment" })).toBeNull();
  });

  it("keeps common Grid vertical alignment when its renderer reports no controls", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(() => null);

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    expect(model).not.toBeNull();
    render(model?.content);
    expect(screen.getByRole("radiogroup", { name: "Vertical alignment" })).toBeInTheDocument();
  });

  it("returns null while the editor is not editable", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);
    editor.setEditable(false);

    expect(
      resolveStructuralInteractionBubbleModel(
        editor,
        arrangementMenuSnapshot({
          target: gridRef(editor, "grid-a"),
          visible: true,
        }),
      ),
    ).toBeNull();
  });

  it("returns null while a resize gesture is active", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);
    editor.view.dom.setAttribute(RESIZE_GESTURE_ACTIVE_ATTR, "");

    expect(
      resolveStructuralInteractionBubbleModel(
        editor,
        arrangementMenuSnapshot({
          target: gridRef(editor, "grid-a"),
          visible: true,
        }),
      ),
    ).toBeNull();
  });

  it("supports replacing a registered renderer after unregistering", () => {
    const editor = makeEditor(gridContent());
    const unregister = registerTestGridRenderer(() => null);
    unregister();
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    expect(
      resolveStructuralInteractionBubbleModel(
        editor,
        arrangementMenuSnapshot({
          target: gridRef(editor, "grid-a"),
          visible: true,
        }),
      ),
    ).not.toBeNull();
  });

  it("rejects duplicate renderer bindings without mutating another map", () => {
    const firstRenderer: StructuralInteractionBubbleRenderer = () => null;
    const isolated = createStructuralInteractionBubbleRendererMap([
      { kind: InteractionTargetKind.Grid, renderer: firstRenderer },
    ]);

    expect(() =>
      createStructuralInteractionBubbleRendererMap([
        { kind: InteractionTargetKind.Grid, renderer: firstRenderer },
        { kind: InteractionTargetKind.Grid, renderer: () => null },
      ]),
    ).toThrow(/already bound/);
    expect(isolated.get(InteractionTargetKind.Grid)).toBe(firstRenderer);
  });
});

function regionContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "region",
        attrs: { id: "region-a", verticalPosition: "top" },
        content: [
          { type: "paragraph", attrs: { textAlign: "left" } },
          { type: "paragraph", attrs: { textAlign: "left" } },
        ],
      },
    ],
  };
}

function sectionContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "layout",
        attrs: { id: "layout-a" },
        content: [
          {
            type: "section",
            attrs: { id: "section-a" },
            content: [{ type: "paragraph", attrs: { textAlign: "center" } }],
          },
        ],
      },
    ],
  };
}

function mixedCellContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a" },
            content: [
              { type: "paragraph", attrs: { textAlign: "left" } },
              { type: "paragraph", attrs: { textAlign: "right" } },
            ],
          },
        ],
      },
    ],
  };
}

describe("resolveStructuralBubblePlacement", () => {
  it("restores the historical placement for each structural menu kind", () => {
    expect(placementFor(InteractionTargetKind.Grid)).toBe("top-start");
    expect(placementFor(InteractionTargetKind.Cell)).toBe("top-end");
    expect(placementFor(InteractionTargetKind.Layout)).toBe("top-end");
    expect(placementFor(InteractionTargetKind.Section)).toBe("top");
    expect(placementFor(InteractionTargetKind.Surface)).toBe("top-end");
    expect(placementFor(InteractionTargetKind.Region)).toBe("top-end");
  });
});

describe("resolveStructuralBubbleAnchorVirtualElement", () => {
  it("uses a frame-derived virtual trigger rect for grid menus", () => {
    const editor = makeEditor(gridContent());
    const trigger = appendStructuralMenuTrigger(editor, "grid-a");
    mockElementRect(trigger, new DOMRect(800, 900, 20, 36));
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      editor,
      model?.descriptor ?? null,
    );

    expect(virtualElement?.contextElement).not.toBe(trigger);
    expect(virtualElement?.contextElement.getAttribute("data-authoring-frame")).toBe("grid");
    expect(virtualElement?.contextElement.getAttribute("data-id")).toBe("grid-a");
    mockElementRect(virtualElement!.contextElement, new DOMRect(100, 120, 420, 280));
    expect(virtualElement?.getBoundingClientRect()).toMatchObject({
      height: 36,
      left: 90,
      top: 242,
      width: 20,
    });
  });

  it("anchors multiple grids to the active grid frame", () => {
    const editor = makeEditor(twoGridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-b"),
        visible: true,
      }),
    );

    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      editor,
      model?.descriptor ?? null,
    );

    expect(model?.descriptor.id).toBe("grid-b");
    expect(virtualElement?.contextElement.getAttribute("data-authoring-frame")).toBe("grid");
    expect(virtualElement?.contextElement.getAttribute("data-id")).toBe("grid-b");
  });

  it("scopes structural menu virtual anchors to the current authoring root", () => {
    const firstEditor = makeEditor(gridContent());
    const secondEditor = makeEditor(gridContent());
    appendStructuralMenuTrigger(firstEditor, "grid-a");
    appendStructuralMenuTrigger(secondEditor, "grid-a");
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    const model = resolveStructuralInteractionBubbleModel(
      secondEditor,
      arrangementMenuSnapshot({
        target: gridRef(secondEditor, "grid-a"),
        visible: true,
      }),
    );

    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      secondEditor,
      model?.descriptor ?? null,
    );

    expect(virtualElement?.contextElement.closest("[data-testid='authoring-root']")).toBe(
      resolveAuthoringInteractionRoot(secondEditor.view.dom),
    );
  });

  it("uses trigger dimensions from the active sibling root when structural ids are duplicated", () => {
    const firstEditor = makeEditor(gridContent());
    const secondEditor = makeEditor(gridContent());
    const firstTrigger = appendStructuralMenuTrigger(firstEditor, "grid-a");
    const secondTrigger = appendStructuralMenuTrigger(secondEditor, "grid-a");
    mockElementRect(firstTrigger, new DOMRect(800, 900, 96, 72));
    mockElementRect(secondTrigger, new DOMRect(300, 400, 20, 36));
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    const model = resolveStructuralInteractionBubbleModel(
      secondEditor,
      arrangementMenuSnapshot({
        target: gridRef(secondEditor, "grid-a"),
        visible: true,
      }),
    );
    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      secondEditor,
      model?.descriptor ?? null,
    );

    mockElementRect(virtualElement!.contextElement, new DOMRect(100, 120, 420, 280));
    expect(virtualElement?.getBoundingClientRect()).toMatchObject({
      height: 36,
      left: 90,
      top: 242,
      width: 20,
    });
  });

  it("ignores structural menu anchors from the editor floating layer", async () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);
    render(
      <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
        <div />
      </EditorFloatingLayer>,
    );
    const layerRoot = await waitUntilAuthoringLayer(editor);
    const trigger = appendStructuralMenuTriggerWithin(layerRoot, "grid-a");

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      editor,
      model?.descriptor ?? null,
    );

    expect(virtualElement?.contextElement).not.toBe(trigger);
    expect(virtualElement?.contextElement.getAttribute("data-authoring-frame")).toBe("grid");
    expect(virtualElement?.contextElement.getAttribute("data-id")).toBe("grid-a");
  });

  it("does not resolve unregistered body-level structural menu anchors", () => {
    const editor = makeEditor(gridContent());
    const strayTrigger = appendStructuralMenuTriggerWithin(document.body, "grid-a");
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      editor,
      model?.descriptor ?? null,
    );

    expect(virtualElement?.contextElement).not.toBe(strayTrigger);
    expect(virtualElement?.contextElement.getAttribute("data-authoring-frame")).toBe("grid");
  });

  it("uses fallback trigger dimensions when the portalled trigger is unavailable", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);

    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );

    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      editor,
      model?.descriptor ?? null,
    );

    expect(virtualElement?.contextElement.getAttribute("data-authoring-frame")).toBe("grid");
    expect(virtualElement?.contextElement.getAttribute("data-id")).toBe("grid-a");
    mockElementRect(virtualElement!.contextElement, new DOMRect(100, 120, 420, 280));
    expect(virtualElement?.getBoundingClientRect()).toMatchObject({
      height: 36,
      left: 90,
      top: 242,
      width: 20,
    });
  });

  it("keeps a pending virtual geometry read safe after editor teardown", () => {
    const editor = makeEditor(gridContent());
    registerTestGridRenderer(({ descriptor }) => <div>{descriptor.id}</div>);
    const model = resolveStructuralInteractionBubbleModel(
      editor,
      arrangementMenuSnapshot({
        target: gridRef(editor, "grid-a"),
        visible: true,
      }),
    );
    const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
      editor,
      model?.descriptor ?? null,
    );
    mockElementRect(virtualElement!.contextElement, new DOMRect(100, 120, 420, 280));

    editor.destroy();

    expect(() => virtualElement?.getBoundingClientRect()).not.toThrow();
  });

  it("returns null without a descriptor", () => {
    const editor = makeEditor(gridContent());

    expect(resolveStructuralBubbleAnchorVirtualElement(editor, null)).toBeNull();
  });
});

async function waitUntilAuthoringLayer(editor: Editor): Promise<HTMLElement> {
  let root: HTMLElement | null = null;
  await waitFor(() => {
    root = resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND);
    expect(root).not.toBeNull();
  });
  if (!root) throw new Error("Expected editor floating layer root to be registered.");
  return root;
}

function mockElementRect(element: Element, rect: DOMRectReadOnly): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}
