// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createSemanticDefinitionLookup } from "@/composition/model/semantic-definition-lookup";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  createSemanticDocumentExtension,
  getSemanticDocumentControllerForEditor,
} from "@/document/authoring/semantic-document";
import {
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/semantic-document/testing/semantic-activation-binding-test-extension";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { accordionPanelId } from "@/editor/arrangements/layout/accordion/accordion-components";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { paginatedPagePanelId } from "@/editor/arrangements/layout/paginated/paginated-components";
import { tabPanelId } from "@/editor/arrangements/layout/tabs/tabs-components";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { createTestNodeIdentityExtension } from "@/editor/testing";

import {
  getLayoutInteractionStoreState,
  type LayoutInteractionStoreState,
} from "./layout-interaction-store";
import { useLayoutSemanticActivationBinding } from "./use-layout-semantic-activation-binding";

const CASES = [
  {
    variant: "tabs",
    layoutId: "layoutTabs01",
    sectionIds: ["tabNav000001", "tabNav000002"],
  },
  {
    variant: "accordion",
    layoutId: "layoutAcc001",
    sectionIds: ["accNav000001", "accNav000002"],
  },
  {
    variant: "paginated",
    layoutId: "layoutPag001",
    sectionIds: ["pagNav000001", "pagNav000002"],
  },
] as const satisfies readonly LayoutNavigationCase[];

const editors: Editor[] = [];
const rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
const rangeBoundingRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);

beforeAll(() => {
  const rect = DOMRect.fromRect({ height: 16, width: 80, x: 0, y: 0 });
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: { configurable: true, value: () => rect },
    getClientRects: { configurable: true, value: () => [rect] },
  });
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

afterAll(() => {
  restoreProperty(Range.prototype, "getClientRects", rangeClientRectsDescriptor);
  restoreProperty(Range.prototype, "getBoundingClientRect", rangeBoundingRectDescriptor);
});

describe("Layout semantic navigation", () => {
  it.each(CASES)(
    "registers and unregisters the $variant binding while activating through owned state",
    async (testCase) => {
      const editor = makeEditor(testCase);
      const rendered = renderEditor(editor);
      const controller = getSemanticDocumentControllerForEditor(editor);
      const layoutId = testCase.layoutId as EmbeddedNodeId;
      const targetId = testCase.sectionIds[1] as EmbeddedNodeId;

      await waitFor(() => {
        expect(controller.semanticTargetInteractions.registry.resolve(layoutId).kind).toBe(
          "resolved",
        );
      });

      expect(controller.getSnapshot().semantics.locationById.get(targetId)?.activationPath).toEqual(
        [{ ownerId: layoutId, childId: targetId, ownerKind: "layout" }],
      );
      const binding = requireSemanticActivationBinding(
        controller.semanticTargetInteractions.registry,
        layoutId,
      );
      const authoredDocument = editor.getJSON();
      const click = vi.fn();
      document.addEventListener("click", click);
      const targetPanel = sectionPanel(testCase, targetId);
      expect(targetPanel.hidden).toBe(true);

      await expect(
        binding.activate(semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" })),
      ).resolves.toEqual({ kind: "revealed", ownerId: layoutId, childId: targetId });
      expect(visibleSectionId(testCase, getLayoutInteractionStoreState(editor))).toBe(targetId);
      expect(targetPanel.hidden).toBe(false);
      expect(controller.getSnapshot().semantics.itemById.get(targetId)?.id).toBe(targetId);
      controller.reportComponentSelection(targetId);
      expect(controller.getSnapshot()).toMatchObject({
        selectedId: targetId,
        selectionOrigin: "component",
      });
      await expect(
        binding.activate(semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" })),
      ).resolves.toEqual({ kind: "already-visible", ownerId: layoutId, childId: targetId });
      expect(click).not.toHaveBeenCalled();
      expect(editor.getJSON()).toEqual(authoredDocument);

      document.removeEventListener("click", click);
      act(() => rendered.unmount());
      expect(controller.semanticTargetInteractions.registry.resolve(layoutId)).toEqual({
        kind: "unavailable",
        ownerId: layoutId,
        reason: "owner-unmounted",
      });
    },
  );

  it("reports a directly activated tab as the current component selection", async () => {
    const user = userEvent.setup();
    const testCase = CASES[0];
    const editor = makeEditor(testCase);
    renderEditor(editor);
    const controller = getSemanticDocumentControllerForEditor(editor);

    await user.click(await screen.findByRole("tab", { name: "Second" }));

    expect(controller.getSnapshot()).toMatchObject({
      selectedId: testCase.sectionIds[1],
      selectionOrigin: "component",
    });
  });

  it("waits for the requested Section panel to commit visible before resolving", async () => {
    const testCase = CASES[0];
    const editor = makeEditor(testCase);
    const controller = getSemanticDocumentControllerForEditor(editor);
    const layoutId = testCase.layoutId as EmbeddedNodeId;
    const targetId = testCase.sectionIds[1] as EmbeddedNodeId;
    const layoutNode = findNode(editor.state.doc, layoutId);
    let requested = false;
    const visibilityState = { current: false };
    const targetPanel = editor.view.dom;
    targetPanel.id = `controlled-${layoutId}-${targetId}`;
    targetPanel.hidden = true;
    document.body.append(targetPanel);
    const outsideEditorDuplicate = document.createElement("div");
    outsideEditorDuplicate.id = targetPanel.id;
    document.body.prepend(outsideEditorDuplicate);
    const rendered = render(
      <ControlledSemanticBinding
        editor={editor}
        layoutId={layoutId}
        node={layoutNode}
        onReveal={() => {
          requested = true;
        }}
        visibilityState={visibilityState}
        visibilityElementId={targetPanel.id}
      />,
    );

    await waitFor(() => {
      expect(controller.semanticTargetInteractions.registry.resolve(layoutId).kind).toBe(
        "resolved",
      );
    });
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      layoutId,
    );
    let result: unknown;
    const activation = binding
      .activate(semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" }))
      .then((value) => {
        result = value;
        return value;
      });

    await Promise.resolve();
    expect(requested).toBe(true);
    expect(result).toBeUndefined();

    targetPanel.hidden = false;
    editor.view.dispatch(editor.state.tr.setMeta("semantic-visibility-test", true));
    await expect(activation).resolves.toEqual({
      kind: "revealed",
      ownerId: layoutId,
      childId: targetId,
    });
    act(() => rendered.unmount());
  });

  it("settles a pending reveal as owner-unmounted when its Layout root unmounts", async () => {
    const testCase = CASES[0];
    const editor = makeEditor(testCase);
    const controller = getSemanticDocumentControllerForEditor(editor);
    const layoutId = testCase.layoutId as EmbeddedNodeId;
    const targetId = testCase.sectionIds[1] as EmbeddedNodeId;
    const targetPanel = document.createElement("div");
    targetPanel.id = `unmount-${layoutId}-${targetId}`;
    targetPanel.hidden = true;
    editor.view.dom.append(targetPanel);
    const visibilityState = { current: false };
    let requested = false;
    const rendered = render(
      <ControlledSemanticBinding
        editor={editor}
        layoutId={layoutId}
        node={findNode(editor.state.doc, layoutId)}
        onReveal={() => {
          requested = true;
        }}
        visibilityState={visibilityState}
        visibilityElementId={targetPanel.id}
      />,
    );

    await waitFor(() => {
      expect(controller.semanticTargetInteractions.registry.resolve(layoutId).kind).toBe(
        "resolved",
      );
    });
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      layoutId,
    );
    const activation = binding.activate(
      semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" }),
    );
    await waitFor(() => expect(requested).toBe(true));

    act(() => rendered.unmount());

    await expect(activation).resolves.toEqual({
      kind: "unavailable",
      ownerId: layoutId,
      childId: targetId,
      reason: "owner-unmounted",
    });
    expect(controller.semanticTargetInteractions.registry.resolve(layoutId)).toEqual({
      kind: "unavailable",
      ownerId: layoutId,
      reason: "owner-unmounted",
    });
  });

  it("interrupts a superseded pending reveal without a stale second state change", async () => {
    const testCase = CASES[0];
    const editor = makeEditor(testCase);
    const controller = getSemanticDocumentControllerForEditor(editor);
    const layoutId = testCase.layoutId as EmbeddedNodeId;
    const targetId = testCase.sectionIds[1] as EmbeddedNodeId;
    const targetPanel = document.createElement("div");
    targetPanel.id = `superseded-${layoutId}-${targetId}`;
    targetPanel.hidden = true;
    editor.view.dom.append(targetPanel);
    const visibilityState = { current: false };
    const revealChild = vi.fn();
    const rendered = render(
      <ControlledSemanticBinding
        editor={editor}
        layoutId={layoutId}
        node={findNode(editor.state.doc, layoutId)}
        onReveal={revealChild}
        visibilityState={visibilityState}
        visibilityElementId={targetPanel.id}
      />,
    );

    await waitFor(() => {
      expect(controller.semanticTargetInteractions.registry.resolve(layoutId).kind).toBe(
        "resolved",
      );
    });
    const binding = requireSemanticActivationBinding(
      controller.semanticTargetInteractions.registry,
      layoutId,
    );
    const first = binding.activate(
      semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" }),
    );
    await waitFor(() => expect(revealChild).toHaveBeenCalledOnce());
    const currentAbort = new AbortController();
    const current = binding.activate(
      semanticActivationRequest(layoutId, targetId, {
        ownerKind: "layout",
        signal: currentAbort.signal,
      }),
    );

    await expect(first).resolves.toEqual({
      kind: "interrupted",
      ownerId: layoutId,
      childId: targetId,
    });
    currentAbort.abort();
    await expect(current).resolves.toEqual({
      kind: "interrupted",
      ownerId: layoutId,
      childId: targetId,
    });
    targetPanel.hidden = false;
    editor.view.dispatch(editor.state.tr.setMeta("stale-semantic-visibility-test", true));
    expect(revealChild).toHaveBeenCalledOnce();

    act(() => rendered.unmount());
  });

  it("returns temporarily-unavailable when committed visibility cannot be observed", async () => {
    const testCase = CASES[0];
    const editor = makeEditor(testCase);
    const controller = getSemanticDocumentControllerForEditor(editor);
    const layoutId = testCase.layoutId as EmbeddedNodeId;
    const targetId = testCase.sectionIds[1] as EmbeddedNodeId;
    const targetPanel = document.createElement("div");
    targetPanel.id = `temporary-${layoutId}-${targetId}`;
    targetPanel.hidden = true;
    editor.view.dom.append(targetPanel);
    const rendered = render(
      <ControlledSemanticBinding
        editor={editor}
        layoutId={layoutId}
        node={findNode(editor.state.doc, layoutId)}
        onReveal={() => undefined}
        visibilityState={{ current: false }}
        visibilityElementId={targetPanel.id}
      />,
    );

    await waitFor(() => {
      expect(controller.semanticTargetInteractions.registry.resolve(layoutId).kind).toBe(
        "resolved",
      );
    });
    const ownerWindow = editor.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) throw new Error("Missing editor owner window");
    const mutationObserverDescriptor = Object.getOwnPropertyDescriptor(
      ownerWindow,
      "MutationObserver",
    );
    Object.defineProperty(ownerWindow, "MutationObserver", {
      configurable: true,
      value: undefined,
    });

    try {
      const binding = requireSemanticActivationBinding(
        controller.semanticTargetInteractions.registry,
        layoutId,
      );
      await expect(
        binding.activate(semanticActivationRequest(layoutId, targetId, { ownerKind: "layout" })),
      ).resolves.toEqual({
        kind: "unavailable",
        ownerId: layoutId,
        childId: targetId,
        reason: "temporarily-unavailable",
      });
    } finally {
      restoreProperty(ownerWindow, "MutationObserver", mutationObserverDescriptor);
      act(() => rendered.unmount());
    }
  });
});

interface LayoutNavigationCase {
  readonly variant: "tabs" | "accordion" | "paginated";
  readonly layoutId: string;
  readonly sectionIds: readonly [string, string];
}

function ControlledSemanticBinding({
  editor,
  layoutId,
  node,
  onReveal,
  visibilityState,
  visibilityElementId,
}: {
  editor: Editor;
  layoutId: EmbeddedNodeId;
  node: ProseMirrorNode;
  onReveal: () => void;
  visibilityState: { current: boolean };
  visibilityElementId: string;
}) {
  useLayoutSemanticActivationBinding({
    editor,
    getPos: () => findNodePositionById(editor.state.doc, layoutId),
    isVisible: () => visibilityState.current,
    layoutId,
    node,
    revealChild: () => {
      visibilityState.current = true;
      onReveal();
    },
    visibilityElementId: () => visibilityElementId,
  });

  return null;
}

function makeEditor(testCase: LayoutNavigationCase): Editor {
  const semantics = createSemanticDefinitionLookup({
    blocks: builtInBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: builtInSurfaceVariantRegistry,
  });
  const capabilities = Object.freeze({
    blocks: Object.freeze({
      registry: builtInBlockRegistry,
      duplication: Object.freeze({
        getByNodeType: () => undefined,
        hasNodeType: (nodeType: string) =>
          builtInBlockRegistry.getByNodeType(nodeType) !== undefined,
      }),
    }),
    layouts: Object.freeze({ registry: builtInLayoutRegistry }),
    surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
    documentSemantics: semantics,
  });
  const editor = new Editor({
    extensions: [
      createTestNodeIdentityExtension(),
      createScaffoldCapabilitiesStorageExtension(capabilities),
      createSemanticDocumentExtension(semantics),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: documentContent(testCase),
  });
  editors.push(editor);
  return editor;
}

function findNode(doc: ProseMirrorNode, nodeId: EmbeddedNodeId): ProseMirrorNode {
  let found: ProseMirrorNode | null = null;
  doc.descendants((node) => {
    if (node.attrs["id"] !== nodeId) return true;
    found = node;
    return false;
  });
  if (!found) throw new Error(`Missing node ${nodeId}`);
  return found;
}

function findNodePositionById(doc: ProseMirrorNode, nodeId: EmbeddedNodeId): number | undefined {
  let found: number | undefined;
  doc.descendants((node, position) => {
    if (node.attrs["id"] !== nodeId) return true;
    found = position;
    return false;
  });
  return found;
}

function renderEditor(editor: Editor) {
  return render(createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })));
}

function documentContent(testCase: LayoutNavigationCase): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceNav01", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: testCase.layoutId,
                  variant: testCase.variant,
                  options:
                    testCase.variant === "accordion"
                      ? { allowMultiple: false, label: "Sections" }
                      : { label: "Sections" },
                },
                content: testCase.sectionIds.map((sectionId, index) => ({
                  type: "section",
                  attrs: {
                    id: sectionId,
                    options: {
                      label: index === 0 ? "First" : "Second",
                      defaultOpen: index === 0,
                    },
                  },
                  content:
                    testCase.variant === "accordion"
                      ? [
                          {
                            type: "accordion_section_title",
                            attrs: { id: `accTitle000${index + 1}` },
                            content: [
                              {
                                type: "paragraph",
                                attrs: { id: `accTPara00${index + 1}` },
                                content: [{ type: "text", text: index === 0 ? "First" : "Second" }],
                              },
                            ],
                          },
                          {
                            type: "accordion_section_panel",
                            attrs: { id: `accPanel000${index + 1}` },
                            content: [
                              {
                                type: "paragraph",
                                attrs: { id: `accPPara00${index + 1}` },
                                content: [{ type: "text", text: index === 0 ? "First" : "Second" }],
                              },
                            ],
                          },
                        ]
                      : [
                          {
                            type: "paragraph",
                            attrs: { id: `${testCase.variant.slice(0, 3)}Txt00000${index + 1}` },
                            content: [{ type: "text", text: index === 0 ? "First" : "Second" }],
                          },
                        ],
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

function visibleSectionId(
  testCase: LayoutNavigationCase,
  state: LayoutInteractionStoreState,
): string | undefined {
  if (testCase.variant === "tabs") return state.activeTabByLayoutId[testCase.layoutId];
  if (testCase.variant === "paginated") return state.activePageByLayoutId[testCase.layoutId];
  return state.openAccordionSectionsByLayoutId[testCase.layoutId]?.[0];
}

function sectionPanel(testCase: LayoutNavigationCase, sectionId: string): HTMLElement {
  const panelId =
    testCase.variant === "tabs"
      ? tabPanelId(testCase.layoutId, sectionId)
      : testCase.variant === "paginated"
        ? paginatedPagePanelId(testCase.layoutId, sectionId)
        : accordionPanelId(testCase.layoutId, sectionId);
  const panel = document.getElementById(panelId);
  if (!(panel instanceof HTMLElement)) throw new Error(`Missing ${testCase.variant} panel`);
  return panel;
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}
