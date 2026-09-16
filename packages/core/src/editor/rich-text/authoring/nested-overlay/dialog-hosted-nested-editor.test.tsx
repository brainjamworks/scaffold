// @vitest-environment happy-dom

import { RowsIcon } from "@phosphor-icons/react";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import {
  readLayerEditingContextForState,
  requireLayerMutationAccessForState,
} from "@/document/authoring/layers/layer-editing-boundaries";
import { insertCatalogItemChecked } from "@/document/authoring/layers/insert-catalog-item";
import { createBlankLayer } from "@/document/model/layers/layer-construction";
import { LayerNode } from "@/document/model/layers/layer-node";
import {
  validateLayerContext,
  validateLayerIdentities,
} from "@/document/model/layers/layer-validation";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import { builtInBlockCapabilityRegistrations } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { createGridAuthoringNodes } from "@/editor/arrangements/grid/authoring/grid-nodes";
import { deleteGridAt } from "@/editor/arrangements/grid/model/grid-commands";
import { builtInLayoutAuthoringViews } from "@/editor/arrangements/layout/authoring/built-in-layout-views";
import { DefaultLayoutContent } from "@/editor/arrangements/layout/authoring/default-layout-content";
import { createLayoutAuthoringNodes } from "@/editor/arrangements/layout/authoring/layout-nodes";
import { createLayoutAuthoringViewRegistry } from "@/editor/arrangements/layout/authoring/layout-view-registry";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import { CalloutAuthoringExtension } from "@/editor/blocks/presentation/callout";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  resolveEditorFloatingLayerRoot,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import {
  createNestedRichTextEditor,
  type NestedRichTextEditorTarget,
} from "@/editor/prosemirror/nested-rich-text-editor";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { BlockStrip } from "@/editor/shell/chrome/BlockStrip";
import { Toolbar } from "@/editor/shell/chrome/Toolbar";
import { AuthoringContentChrome } from "@/editor/shell/authoring/AuthoringContentChrome";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { createSlashCommand, isSlashCommandActive } from "@/editor/suggestions/slash/SlashCommand";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";

import {
  useNestedRichTextEditor,
  type UseNestedRichTextEditorResult,
} from "./use-nested-rich-text-editor";
import { createNestedLayerAuthoringExtensions } from "./nested-layer-authoring";

const TARGET_NODE_NAME = "test_dialog_content_target";
const REACT_BLOCK_NODE_NAME = "test_dialog_react_block";
const coreInsertCatalog = createCoreScaffoldAuthoringComposition().catalogues.inDocument;
const ReactBlockContext = createContext("missing provider");
const outerEditors: Editor[] = [];
const DIALOG_LAYOUT_VARIANT = "dialog-content";
const FULL_CHROME_IDS = {
  firstCell: EmbeddedNodeIdSchema.parse("innercell001"),
  firstCellLayer: EmbeddedNodeIdSchema.parse("celllayer001"),
  firstCellParagraph: EmbeddedNodeIdSchema.parse("cellpara0001"),
  inactiveCellLayer: EmbeddedNodeIdSchema.parse("celllayer003"),
  inactiveCellParagraph: EmbeddedNodeIdSchema.parse("cellpara0003"),
  secondCell: EmbeddedNodeIdSchema.parse("innercell002"),
  secondCellLayer: EmbeddedNodeIdSchema.parse("celllayer002"),
  secondCellParagraph: EmbeddedNodeIdSchema.parse("cellpara0002"),
  section: EmbeddedNodeIdSchema.parse("innersect001"),
  sectionLayer: EmbeddedNodeIdSchema.parse("sectlayer001"),
  sectionParagraph: EmbeddedNodeIdSchema.parse("sectpara0001"),
} as const;
const dialogContentLayoutDefinition = {
  id: DIALOG_LAYOUT_VARIANT,
  title: "Dialog content",
  description: "Generic block composition inside a dialog",
  icon: RowsIcon,
  section: {
    label: "Section",
    addLabel: "Add section",
    compositionSlot: { kind: "direct" },
    create: () => ({
      type: "section",
      attrs: { id: createEmbeddedNodeId(), verticalPosition: "top", options: {} },
      content: [createBlankLayer()],
    }),
  },
  createContent: () => ({
    type: "layout",
    attrs: { id: createEmbeddedNodeId(), variant: DIALOG_LAYOUT_VARIANT, options: {} },
    content: [
      {
        type: "section",
        attrs: { id: createEmbeddedNodeId(), verticalPosition: "top", options: {} },
        content: [createBlankLayer()],
      },
    ],
  }),
} satisfies LayoutDefinition;
const fullChromeCapabilities = resolveScaffoldCapabilities({
  blockCapabilities: builtInBlockCapabilityRegistrations,
  layoutDefinitions: [...builtInLayoutDefinitions, dialogContentLayoutDefinition],
  surfaceDefinitions: [],
});
const fullChromeBlockRegistry = fullChromeCapabilities.blocks.registry;
const fullChromeSurfaceRegistry = fullChromeCapabilities.surfaces.registry;
const fullChromeLayoutAuthoringViews = createLayoutAuthoringViewRegistry(
  fullChromeCapabilities.layouts.registry,
  [...builtInLayoutAuthoringViews, { id: DIALOG_LAYOUT_VARIANT, layout: DefaultLayoutContent }],
);
const { layoutNode: FullChromeLayoutAuthoringNode, sectionNode: FullChromeSectionAuthoringNode } =
  createLayoutAuthoringNodes({
    registry: fullChromeCapabilities.layouts.registry,
    authoringViews: fullChromeLayoutAuthoringViews,
    blockDefinitions: fullChromeBlockRegistry,
  });
const {
  GridAuthoringNode: FullChromeGridAuthoringNode,
  CellAuthoringNode: FullChromeCellAuthoringNode,
} = createGridAuthoringNodes(fullChromeBlockRegistry);
const fullChromeOpenLayerByOwnerId = new Map([
  [FULL_CHROME_IDS.firstCell, FULL_CHROME_IDS.firstCellLayer],
  [FULL_CHROME_IDS.secondCell, FULL_CHROME_IDS.secondCellLayer],
  [FULL_CHROME_IDS.section, FULL_CHROME_IDS.sectionLayer],
]);
const inactiveFixtureOpenLayerByOwnerId = new Map([
  [FULL_CHROME_IDS.firstCell, FULL_CHROME_IDS.firstCellLayer],
  [FULL_CHROME_IDS.secondCell, FULL_CHROME_IDS.secondCellLayer],
]);

afterEach(() => {
  cleanup();
  while (outerEditors.length > 0) {
    const editor = outerEditors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
  vi.restoreAllMocks();
});

describe("dialog-hosted nested editor", () => {
  it("keeps one outer-authoritative editor across dialog editing, sync, and reopen", async () => {
    const outerEditor = makeOuterEditor();
    const innerEditors: Editor[] = [];
    const latestResult: { current: UseNestedRichTextEditorResult | null } = { current: null };
    const observeResult = (result: UseNestedRichTextEditorResult) => {
      latestResult.current = result;
      if (result.editor && !innerEditors.includes(result.editor)) innerEditors.push(result.editor);
    };

    render(<DialogHostedNestedEditorHarness onResult={observeResult} outerEditor={outerEditor} />);

    const trigger = screen.getByRole("button", { name: "Edit nested content" });
    const outerEditorContent = screen.getByTestId("outer-editor-content");
    const outerTargetView = within(outerEditorContent).getByTestId("outer-target-node-view");

    expect(targetText(outerEditor)).toBe("Initial authority");
    expect(outerTargetView.childElementCount).toBe(0);
    expect(within(outerEditorContent).queryByTestId("dialog-react-block")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Nested content editor" })).toBeNull();

    await userEvent.click(trigger);

    const firstEditorDom = await screen.findByRole("textbox", {
      name: "Nested content editor",
    });
    await screen.findByText("Initial block · inherited workspace", {
      selector: "[data-testid='dialog-react-block']",
    });
    const firstInnerEditor = latestResult.current?.editor;
    if (!firstInnerEditor) throw new Error("Expected the first nested editor");

    expect(innerEditors.filter((editor) => !editor.isDestroyed)).toEqual([firstInnerEditor]);
    expect(screen.getAllByTestId("dialog-react-block")).toHaveLength(1);
    expect(within(outerEditorContent).queryByTestId("dialog-react-block")).toBeNull();
    expect(firstEditorDom).toBe(firstInnerEditor.view.dom);
    expect(firstInnerEditor.extensionManager.extensions.map(({ name }) => name)).not.toContain(
      "undoRedo",
    );
    expect(firstInnerEditor.extensionManager.extensions.map(({ name }) => name)).toContain(
      "nestedRichTextOuterHistoryBridge",
    );

    act(() => {
      firstInnerEditor.commands.setTextSelection("Initial authority".length + 1);
      firstInnerEditor.commands.insertContent(" edited");
    });
    expect(targetText(outerEditor)).toBe("Initial authority edited");

    act(() => {
      expect(firstInnerEditor.commands.undo()).toBe(true);
    });
    expect(targetText(outerEditor)).toBe("Initial authority");

    const outerTransactions = vi.fn();
    outerEditor.on("transaction", outerTransactions);
    act(() => {
      replaceTargetContent(outerEditor, "External authority", "External block");
      latestResult.current?.syncFromTarget({
        kind: "content",
        node: liveTargetNode(outerEditor),
      });
    });

    expect(firstInnerEditor.state.doc.firstChild?.textContent).toBe("External authority");
    expect(screen.getByTestId("dialog-react-block").textContent).toBe(
      "External block · inherited workspace",
    );
    expect(outerTransactions).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));

    await waitFor(() => expect(firstInnerEditor.isDestroyed).toBe(true));
    expect(innerEditors.filter((editor) => !editor.isDestroyed)).toHaveLength(0);
    expect(screen.queryByRole("textbox", { name: "Nested content editor" })).toBeNull();
    expect(screen.queryByTestId("dialog-react-block")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await userEvent.click(trigger);

    await screen.findByText("External block · inherited workspace", {
      selector: "[data-testid='dialog-react-block']",
    });
    const reopenedEditor = latestResult.current?.editor;
    if (!reopenedEditor) throw new Error("Expected a reopened nested editor");

    expect(reopenedEditor).not.toBe(firstInnerEditor);
    expect(reopenedEditor.state.doc.firstChild?.textContent).toBe("External authority");
    expect(innerEditors).toHaveLength(2);
    expect(innerEditors.filter((editor) => !editor.isDestroyed)).toEqual([reopenedEditor]);
    expect(screen.getAllByTestId("dialog-react-block")).toHaveLength(1);
    expect(within(outerEditorContent).queryByTestId("dialog-react-block")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));

    await waitFor(() => expect(reopenedEditor.isDestroyed).toBe(true));
    expect(innerEditors.every((editor) => editor.isDestroyed)).toBe(true);
    expect(screen.queryByTestId("dialog-react-block")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("runs isolated content authoring chrome through scoped overlays and outer history", async () => {
    mockAuthoringGeometry();

    const outerEditor = makeFullChromeOuterEditor();
    const innerEditors: Editor[] = [];
    const latestResult: { current: UseNestedRichTextEditorResult | null } = { current: null };
    const observeResult = (result: UseNestedRichTextEditorResult) => {
      latestResult.current = result;
      if (result.editor && !innerEditors.includes(result.editor)) innerEditors.push(result.editor);
    };

    render(<FullChromeDialogHarness onResult={observeResult} outerEditor={outerEditor} />);

    const trigger = screen.getByRole("button", { name: "Edit nested content" });
    await userEvent.click(trigger);

    const workspace = await screen.findByTestId("inner-authoring-workspace");
    const portalHost = screen.getByTestId("nested-portal-host");
    const firstInnerEditor = latestResult.current?.editor;
    if (!firstInnerEditor) throw new Error("Expected a nested content authoring editor");

    const outerStore = getInteractionFacadeStoreForEditor(outerEditor);
    const firstInnerStore = getInteractionFacadeStoreForEditor(firstInnerEditor);
    expect(firstInnerStore).not.toBe(outerStore);
    expect(firstInnerEditor.schema.nodes["courseDocument"]).toBeUndefined();
    expect(firstInnerEditor.schema.nodes["surface"]).toBeUndefined();
    expect(firstInnerEditor.schema.nodes["quiz"]).toBeUndefined();
    expect(firstInnerEditor.schema.nodes["mcq"]).toBeUndefined();
    expect(() => firstInnerEditor.state.doc.check()).not.toThrow();
    expect(validateLayerIdentities(firstInnerEditor.state.doc)).toEqual([]);
    expect(
      validateLayerContext({
        document: firstInnerEditor.state.doc,
        blockDefinitions: fullChromeBlockRegistry,
        layoutDefinitions: fullChromeCapabilities.layouts.registry,
      }),
    ).toEqual([]);
    const layerAccess = requireLayerMutationAccessForState(firstInnerEditor.state);
    expect(layerAccess.kind).toBe("implicit-authoring");
    if (layerAccess.kind !== "implicit-authoring") {
      throw new Error("Expected scoped Layer authoring access");
    }
    expect([...layerAccess.context.openLayerByOwnerId]).toEqual([
      [FULL_CHROME_IDS.firstCell, FULL_CHROME_IDS.firstCellLayer],
      [FULL_CHROME_IDS.secondCell, FULL_CHROME_IDS.secondCellLayer],
      [FULL_CHROME_IDS.section, FULL_CHROME_IDS.sectionLayer],
    ]);

    const outerFloatingRoot = await waitForAuthoringFloatingRoot(outerEditor);
    const firstInnerFloatingRoot = await waitForAuthoringFloatingRoot(firstInnerEditor);
    const overlayHost = portalHost.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(firstInnerFloatingRoot).not.toBe(outerFloatingRoot);
    expect(overlayHost).not.toBeNull();
    expect(firstInnerFloatingRoot.parentElement).toBe(overlayHost);
    expect(outerFloatingRoot.parentElement?.hasAttribute("data-scaffold-overlay-host")).toBe(true);
    expect(
      outerFloatingRoot.parentElement?.parentElement?.hasAttribute(
        "data-authoring-interaction-root",
      ),
    ).toBe(true);

    expect(within(workspace).getByRole("button", { name: "Content" })).toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "Containers" })).toBeInTheDocument();
    expect(within(workspace).queryByRole("button", { name: "Assessment" })).toBeNull();
    expect(workspace.textContent).not.toMatch(/quiz|surface/i);

    const calloutCountBeforeSlashInsert = countTargetNodes(outerEditor, "callout");
    act(() => {
      firstInnerEditor.commands.setTextSelection("Initial authority".length + 1);
      firstInnerEditor.view.focus();
      firstInnerEditor.commands.insertContent(" /");
    });
    expect(isSlashCommandActive(firstInnerEditor.state)).toBe(true);
    const slashFloatingRoot = await waitForAuthoringFloatingRoot(firstInnerEditor);
    await waitForElement(slashFloatingRoot, '[role="listbox"][aria-label="Insert block"]');

    act(() => {
      firstInnerEditor.commands.insertContent("callout");
    });
    const slashListbox = await waitForElement(
      slashFloatingRoot,
      '[role="listbox"][aria-label="Insert block"]',
    );
    const slashOptions = Array.from(slashListbox.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(slashOptions).toHaveLength(1);
    expect(slashOptions[0]?.getAttribute("aria-label")).toBe("Callout");
    expect(slashFloatingRoot.contains(slashListbox)).toBe(true);
    const slashCalloutOption = slashOptions[0];
    if (!slashCalloutOption) throw new Error("Missing restricted Slash Callout option");
    act(() => slashCalloutOption.click());
    await waitFor(() => expect(isSlashCommandActive(firstInnerEditor.state)).toBe(false));
    await waitFor(() => expect(slashListbox.isConnected).toBe(false));
    await waitFor(() => {
      expect(countTargetNodes(outerEditor, "callout")).toBe(calloutCountBeforeSlashInsert + 1);
    });
    await userEvent.click(within(workspace).getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(countTargetNodes(outerEditor, "callout")).toBe(calloutCountBeforeSlashInsert);
    });
    await userEvent.click(within(workspace).getByRole("button", { name: "Redo" }));
    await waitFor(() => {
      expect(countTargetNodes(outerEditor, "callout")).toBe(calloutCountBeforeSlashInsert + 1);
    });
    await userEvent.click(within(workspace).getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(countTargetNodes(outerEditor, "callout")).toBe(calloutCountBeforeSlashInsert);
    });
    act(() => {
      latestResult.current?.syncFromTarget({
        kind: "content",
        node: liveTargetNode(outerEditor),
      });
    });
    expect(countEditorNodes(firstInnerEditor, "callout")).toBe(calloutCountBeforeSlashInsert);
    expect(screen.getByRole("dialog", { name: "Nested content" })).toBeInTheDocument();

    activateEditorTarget(firstInnerEditor, "grid", "innergrid001");

    expect(interactionOwnerPluginKey.getState(firstInnerEditor.state)?.explicitOwner).toMatchObject(
      {
        id: "innergrid001",
        kind: "grid",
      },
    );
    expect(document.activeElement).toBe(firstInnerEditor.view.dom);
    const gridOptions = await within(firstInnerFloatingRoot).findByRole("button", {
      name: "Grid options",
    });
    expect(
      within(firstInnerFloatingRoot).getByRole("button", { name: "Add column" }),
    ).toBeInTheDocument();
    expect(within(outerFloatingRoot).queryByRole("button", { name: "Grid options" })).toBeNull();
    expect(interactionOwnerPluginKey.getState(outerEditor.state)?.explicitOwner).toBeNull();

    await userEvent.click(gridOptions);
    const gridBubble = await screen.findByRole("toolbar", { name: "Block actions" });
    expect(within(gridBubble).getByRole("combobox", { name: "Grid cells" })).toBeInTheDocument();
    expect(workspace.contains(gridBubble)).toBe(true);

    activateEditorTarget(firstInnerEditor, "cell", "innercell001");
    const cellOptions = await within(firstInnerFloatingRoot).findByRole("button", {
      name: "Cell options",
    });
    await userEvent.click(cellOptions);
    const cellBubble = await screen.findByRole("toolbar", { name: "Block actions" });
    expect(within(cellBubble).getByRole("button", { name: "Add column left" })).toBeInTheDocument();
    expect(within(cellBubble).getByRole("button", { name: "Delete cell" })).toBeInTheDocument();

    activateEditorTarget(firstInnerEditor, "layout", "innerlayout1");
    const layoutOptions = await within(firstInnerFloatingRoot).findByRole("button", {
      name: "Layout options",
    });
    await userEvent.click(layoutOptions);
    const layoutBubble = await screen.findByRole("toolbar", { name: "Block actions" });
    expect(
      within(layoutBubble).getByRole("button", { name: "Duplicate layout" }),
    ).toBeInTheDocument();
    expect(within(layoutBubble).getByRole("button", { name: "Delete layout" })).toBeInTheDocument();

    activateEditorTarget(firstInnerEditor, "block", "innercall001");
    const settingsLauncher = await waitForElement(workspace, '[aria-label="Open block settings"]');
    expect(settingsLauncher.closest('[role="toolbar"][aria-label="Block actions"]')).not.toBeNull();
    await userEvent.click(settingsLauncher);

    const settingsSheet = await screen.findByRole("dialog", { name: "Callout settings" });
    expect(portalHost.contains(settingsSheet)).toBe(true);
    const variantSelect = within(settingsSheet).getByRole("combobox", { name: "Variant" });
    expect(portalHost.contains(variantSelect)).toBe(true);
    expect(screen.getByRole("dialog", { name: "Callout settings" })).toBe(settingsSheet);
    expect(screen.getByRole("dialog", { name: "Nested content" })).toBeInTheDocument();

    await userEvent.click(variantSelect);
    const warningOption = await screen.findByRole("option", { name: "Warning" });
    expect(portalHost.contains(warningOption)).toBe(true);
    await userEvent.click(warningOption);
    expect(variantSelect).toHaveTextContent("Warning");
    fireEvent.click(within(settingsSheet).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Callout settings" })).toBeNull(),
    );
    expect(calloutVariant(outerEditor, "innercall001")).toBe("warning");
    await waitFor(() => expect(portalHost.closest('[aria-hidden="true"]')).toBeNull());
    act(() => {
      firstInnerEditor.commands.setTextSelection("Initial authority".length + 1);
      firstInnerEditor.view.focus();
    });

    const calloutCountBeforeInsert = countTargetNodes(outerEditor, "callout");
    const contentTrigger = within(workspace).getByRole("button", { name: "Content" });
    await userEvent.click(contentTrigger);
    const contentPopover = await waitForElement(portalHost, '[aria-label="Content blocks"]');
    expect(contentPopover.getAttribute("role")).toBe("dialog");
    expect(portalHost.contains(contentPopover)).toBe(true);
    expect(within(contentPopover).queryByText(/quiz|surface/i)).toBeNull();
    const calloutInsert = contentPopover.querySelector<HTMLButtonElement>(
      'button[aria-label="Callout"]',
    );
    expect(Boolean(calloutInsert)).toBe(true);
    expect(calloutInsert?.disabled).toBe(false);
    if (!calloutInsert) throw new Error("Missing enabled Callout insertion row");
    act(() => calloutInsert.click());

    await waitFor(() => {
      expect(countTargetNodes(outerEditor, "callout")).toBe(calloutCountBeforeInsert + 1);
    });
    await userEvent.click(contentTrigger);
    await waitFor(() => expect(contentPopover.isConnected).toBe(false));
    await userEvent.click(within(workspace).getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(countTargetNodes(outerEditor, "callout")).toBe(calloutCountBeforeInsert);
    });
    act(() => {
      latestResult.current?.syncFromTarget({
        kind: "content",
        node: liveTargetNode(outerEditor),
      });
    });

    const closingFloatingRoot = await waitForAuthoringFloatingRoot(firstInnerEditor);
    const closingEditorDom = firstInnerEditor.view.dom;
    activateEditorTarget(firstInnerEditor, "block", "innercall001");
    const reopenedSettingsLauncher = await waitForElement(
      workspace,
      '[aria-label="Open block settings"]',
    );
    act(() => reopenedSettingsLauncher.focus());
    expect(document.activeElement).toBe(reopenedSettingsLauncher);
    await userEvent.click(reopenedSettingsLauncher);
    await screen.findByRole("dialog", { name: "Callout settings" });

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Callout settings" })).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Nested content" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    await waitFor(() => expect(firstInnerEditor.isDestroyed).toBe(true));
    expect(document.activeElement).toBe(trigger);
    expect(closingFloatingRoot.isConnected).toBe(false);
    expect(portalHost.isConnected).toBe(false);
    expect(
      resolveEditorFloatingLayerRoot(
        { view: { dom: closingEditorDom } },
        AUTHORING_EDITOR_FLOATING_LAYER_KIND,
      ),
    ).toBeNull();
    expect(firstInnerStore.getState().commands.dismissInteraction()).toBe(false);
    expect(screen.queryByTestId("inner-authoring-workspace")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Callout settings" })).toBeNull();
    expect(outerFloatingRoot.isConnected).toBe(true);

    await userEvent.click(trigger);
    const reopenedWorkspace = await screen.findByTestId("inner-authoring-workspace");
    const reopenedEditor = latestResult.current?.editor;
    if (!reopenedEditor) throw new Error("Expected a fresh reopened authoring editor");
    const reopenedStore = getInteractionFacadeStoreForEditor(reopenedEditor);
    const reopenedFloatingRoot = await waitForAuthoringFloatingRoot(reopenedEditor);
    const reopenedOverlayHost = screen
      .getByTestId("nested-portal-host")
      .querySelector(":scope > [data-scaffold-overlay-host]");

    expect(reopenedEditor).not.toBe(firstInnerEditor);
    expect(reopenedStore).not.toBe(firstInnerStore);
    expect(reopenedFloatingRoot).not.toBe(closingFloatingRoot);
    expect(reopenedOverlayHost).not.toBeNull();
    expect(reopenedFloatingRoot.parentElement).toBe(reopenedOverlayHost);
    expect(interactionOwnerPluginKey.getState(reopenedEditor.state)?.explicitOwner).toBeNull();
    expect(interactionOwnerPluginKey.getState(reopenedEditor.state)?.menuOwner).toBeNull();
    expect(interactionOwnerPluginKey.getState(reopenedEditor.state)?.settingsOwner).toBeNull();
    expect(isSlashCommandActive(reopenedEditor.state)).toBe(false);
    expect(calloutVariant(outerEditor, "innercall001")).toBe("warning");
    expect(within(reopenedWorkspace).queryByRole("dialog")).toBeNull();
    expect(innerEditors.filter((editor) => !editor.isDestroyed)).toEqual([reopenedEditor]);

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    await waitFor(() => expect(reopenedEditor.isDestroyed).toBe(true));
    expect(innerEditors.every((editor) => editor.isDestroyed)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  }, 15_000);

  it("rejects an ordinary inactive-Layer edit before publishing it to the outer document", () => {
    const catalogItems = restrictedCatalogItems();
    const outerEditor = makeFullChromeOuterEditor(scopedInactiveLayerOuterDoc());
    const controller = createNestedRichTextEditor({
      outerEditor,
      target: contentTarget(outerEditor),
      extensions: makeFullChromeInnerExtensions(catalogItems, inactiveFixtureOpenLayerByOwnerId),
      editable: true,
    });
    try {
      const editor = controller.editor;
      const inactiveParagraphPos =
        findNodePosById(editor, FULL_CHROME_IDS.inactiveCellParagraph) + 1;
      const innerDocumentBefore = editor.state.doc;
      const outerDocumentBefore = outerEditor.state.doc;

      editor.view.dispatch(editor.state.tr.insertText("Changed ", inactiveParagraphPos));

      expect(editor.state.doc).toBe(innerDocumentBefore);
      expect(outerEditor.state.doc).toBe(outerDocumentBefore);
      expect(editor.state.doc.textContent).not.toContain("Changed Inactive content");
      expect(liveTargetNode(outerEditor).textContent).not.toContain("Changed Inactive content");

      const openParagraphPos = findNodePosById(outerEditor, FULL_CHROME_IDS.firstCellParagraph) + 1;
      outerEditor.view.dispatch(outerEditor.state.tr.insertText("Synced ", openParagraphPos));
      controller.syncFromTarget({ kind: "content", node: liveTargetNode(outerEditor) });
      expect(editor.state.doc.textContent).toContain("Synced Open content");
      expect(scopedOpenLayers(editor).get(FULL_CHROME_IDS.firstCell)).toBe(
        FULL_CHROME_IDS.firstCellLayer,
      );
    } finally {
      controller.destroy();
    }
  });

  it("reconciles new Cell Layer ownership through checked insertion, sync, undo, and redo", () => {
    const catalogItems = restrictedCatalogItems();
    const outerEditor = makeFullChromeOuterEditor(scopedEmptyLayerOuterDoc());
    const controller = createNestedRichTextEditor({
      outerEditor,
      target: contentTarget(outerEditor),
      extensions: makeFullChromeInnerExtensions(catalogItems, new Map()),
      editable: true,
    });
    const syncFromOuter = () => {
      controller.syncFromTarget({ kind: "content", node: liveTargetNode(outerEditor) });
    };
    try {
      const editor = controller.editor;
      expect(insertCatalogAction(editor, catalogItems, "grid")).toBe(true);
      editor.state.doc.check();
      const firstCell = findFirstNodeByType(editor, "cell");
      const cellId = EmbeddedNodeIdSchema.parse(firstCell.node.attrs["id"]);
      const layerId = EmbeddedNodeIdSchema.parse(firstCell.node.firstChild?.attrs["id"]);
      expect(scopedOpenLayers(editor).get(cellId)).toBe(layerId);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");

      expect(insertCatalogAction(editor, catalogItems, "callout")).toBe(true);
      expect(countEditorNodes(editor, "callout")).toBe(1);
      expect(countTargetNodes(outerEditor, "callout")).toBe(1);

      expect(editor.commands.undo()).toBe(true);
      syncFromOuter();
      expect(countEditorNodes(editor, "grid")).toBe(0);
      expect(countEditorNodes(editor, "callout")).toBe(0);
      expect(scopedOpenLayers(editor)).toEqual(new Map());

      expect(editor.commands.redo()).toBe(true);
      syncFromOuter();
      expect(countEditorNodes(editor, "grid")).toBe(1);
      expect(countEditorNodes(editor, "callout")).toBe(1);
      expect(scopedOpenLayers(editor).get(cellId)).toBe(layerId);
    } finally {
      controller.destroy();
    }
  });

  it("reopens after deleting an initially configured Grid owner", async () => {
    mockAuthoringGeometry();
    const outerEditor = makeFullChromeOuterEditor();
    const innerEditors: Editor[] = [];
    const latestResult: { current: UseNestedRichTextEditorResult | null } = { current: null };
    const observeResult = (result: UseNestedRichTextEditorResult) => {
      latestResult.current = result;
      if (result.editor && !innerEditors.includes(result.editor)) innerEditors.push(result.editor);
    };

    render(<FullChromeDialogHarness onResult={observeResult} outerEditor={outerEditor} />);
    const trigger = screen.getByRole("button", { name: "Edit nested content" });
    await userEvent.click(trigger);
    await screen.findByTestId("inner-authoring-workspace");
    const firstEditor = latestResult.current?.editor;
    if (!firstEditor) throw new Error("Expected the initial nested editor");

    act(() => {
      expect(deleteGridAt(firstEditor, findNodePosById(firstEditor, "innergrid001"))).toBe(true);
    });
    expect(countEditorNodes(firstEditor, "grid")).toBe(0);
    expect(countTargetNodes(outerEditor, "grid")).toBe(0);
    expect([...scopedOpenLayers(firstEditor)]).toEqual([
      [FULL_CHROME_IDS.section, FULL_CHROME_IDS.sectionLayer],
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    await waitFor(() => expect(firstEditor.isDestroyed).toBe(true));
    await userEvent.click(trigger);
    await screen.findByTestId("inner-authoring-workspace");
    const reopenedEditor = latestResult.current?.editor;
    if (!reopenedEditor) throw new Error("Expected the reopened nested editor");

    expect(reopenedEditor).not.toBe(firstEditor);
    expect(countEditorNodes(reopenedEditor, "grid")).toBe(0);
    expect([...scopedOpenLayers(reopenedEditor)]).toEqual([
      [FULL_CHROME_IDS.section, FULL_CHROME_IDS.sectionLayer],
    ]);
    act(() => {
      const sectionParagraphPos =
        findNodePosById(reopenedEditor, FULL_CHROME_IDS.sectionParagraph) + 1;
      reopenedEditor.view.dispatch(
        reopenedEditor.state.tr.insertText("Reopened ", sectionParagraphPos),
      );
    });
    expect(liveTargetNode(outerEditor).textContent).toContain("Reopened Layout section");

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    await waitFor(() => expect(reopenedEditor.isDestroyed).toBe(true));
    expect(innerEditors).toHaveLength(2);
    expect(innerEditors.every((editor) => editor.isDestroyed)).toBe(true);
  });
});

function mockAuthoringGeometry(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (isBoundaryGeometryElement(this)) {
        return DOMRect.fromRect({ height: 768, width: 1024, x: 0, y: 0 });
      }

      return DOMRect.fromRect({ height: 120, width: 480, x: 40, y: 80 });
    },
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      return isBoundaryGeometryElement(this) ? 1024 : 480;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return isBoundaryGeometryElement(this) ? 768 : 120;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function scrollWidth(this: HTMLElement) {
      return this.clientWidth;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.clientHeight;
    },
  );
}

function isBoundaryGeometryElement(element: HTMLElement): boolean {
  return (
    element.hasAttribute("data-authoring-interaction-root") ||
    element.hasAttribute("data-scaffold-overlay-host") ||
    element.getAttribute("data-testid") === "nested-portal-host" ||
    element === document.body ||
    element === document.documentElement
  );
}

interface DialogHostedNestedEditorHarnessProps {
  onResult: (result: UseNestedRichTextEditorResult) => void;
  outerEditor: Editor;
}

function DialogHostedNestedEditorHarness({
  onResult,
  outerEditor,
}: DialogHostedNestedEditorHarnessProps) {
  const [open, setOpen] = useState(false);
  const extensions = useMemo(() => makeInnerExtensions(), []);

  return (
    <ReactBlockContext.Provider value="inherited workspace">
      <EditorContent data-testid="outer-editor-content" editor={outerEditor} />
      <WorkspaceDialog.Root open={open} onOpenChange={setOpen}>
        <WorkspaceDialog.Trigger asChild>
          <button type="button">Edit nested content</button>
        </WorkspaceDialog.Trigger>
        <WorkspaceDialog.Content>
          <WorkspaceDialog.Header>
            <div>
              <WorkspaceDialog.Title>Nested content</WorkspaceDialog.Title>
              <WorkspaceDialog.Description>
                Edit the outer document content in a temporary nested editor.
              </WorkspaceDialog.Description>
            </div>
            <WorkspaceDialog.Close />
          </WorkspaceDialog.Header>
          <WorkspaceDialog.Body>
            {open ? (
              <NestedEditorWorkspace
                extensions={extensions}
                onResult={onResult}
                outerEditor={outerEditor}
              />
            ) : null}
          </WorkspaceDialog.Body>
        </WorkspaceDialog.Content>
      </WorkspaceDialog.Root>
    </ReactBlockContext.Provider>
  );
}

interface NestedEditorWorkspaceProps extends DialogHostedNestedEditorHarnessProps {
  extensions: Extensions;
}

function NestedEditorWorkspace({ extensions, onResult, outerEditor }: NestedEditorWorkspaceProps) {
  const target = useMemo(() => contentTarget(outerEditor), [outerEditor]);
  const result = useNestedRichTextEditor({
    editable: true,
    extensions,
    outerEditor,
    target,
  });

  useEffect(() => {
    onResult(result);
  }, [onResult, result]);

  useEffect(() => {
    const editor = result.editor;
    if (!editor || editor.isDestroyed) return;
    editor.view.dom.setAttribute("aria-label", "Nested content editor");
    editor.view.dom.setAttribute("aria-multiline", "true");
  }, [result.editor]);

  return <EditorContent data-testid="inner-editor-content" editor={result.editor} />;
}

function FullChromeDialogHarness({ onResult, outerEditor }: DialogHostedNestedEditorHarnessProps) {
  const [open, setOpen] = useState(false);
  const catalogItems = useMemo(() => restrictedCatalogItems(), []);
  const extensions = useMemo(() => makeFullChromeInnerExtensions(catalogItems), [catalogItems]);

  return (
    <ReactBlockContext.Provider value="inherited workspace">
      <AuthoringContentChrome
        blockDefinitions={fullChromeBlockRegistry}
        editable
        editor={outerEditor}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
        surfaceVariants={fullChromeSurfaceRegistry}
      >
        <EditorContent data-testid="outer-editor-content" editor={outerEditor} />
      </AuthoringContentChrome>
      <WorkspaceDialog.Root open={open} onOpenChange={setOpen}>
        <WorkspaceDialog.Trigger asChild>
          <button type="button">Edit nested content</button>
        </WorkspaceDialog.Trigger>
        <WorkspaceDialog.Content>
          <WorkspaceDialog.Header>
            <div>
              <WorkspaceDialog.Title>Nested content</WorkspaceDialog.Title>
              <WorkspaceDialog.Description>
                Edit the outer document content with full content authoring chrome.
              </WorkspaceDialog.Description>
            </div>
            <WorkspaceDialog.Close />
          </WorkspaceDialog.Header>
          <WorkspaceDialog.Body>
            {open ? (
              <ScopedFullChromeWorkspace
                catalogItems={catalogItems}
                extensions={extensions}
                onResult={onResult}
                outerEditor={outerEditor}
              />
            ) : null}
          </WorkspaceDialog.Body>
        </WorkspaceDialog.Content>
      </WorkspaceDialog.Root>
    </ReactBlockContext.Provider>
  );
}

interface ScopedFullChromeWorkspaceProps extends NestedEditorWorkspaceProps {
  catalogItems: readonly InsertAction[];
}

function ScopedFullChromeWorkspace({
  catalogItems,
  extensions,
  onResult,
  outerEditor,
}: ScopedFullChromeWorkspaceProps) {
  return (
    <FullChromeNestedEditorWorkspace
      catalogItems={catalogItems}
      extensions={extensions}
      onResult={onResult}
      outerEditor={outerEditor}
    />
  );
}

function FullChromeNestedEditorWorkspace({
  catalogItems,
  extensions,
  onResult,
  outerEditor,
}: ScopedFullChromeWorkspaceProps) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const target = useMemo(() => contentTarget(outerEditor), [outerEditor]);
  const result = useNestedRichTextEditor({
    editable: true,
    extensions,
    outerEditor,
    target,
  });

  useEffect(() => {
    onResult(result);
  }, [onResult, result]);

  useEffect(() => {
    const editor = result.editor;
    if (!editor || editor.isDestroyed) return;
    editor.view.dom.setAttribute("aria-label", "Nested content editor");
    editor.view.dom.setAttribute("aria-multiline", "true");
  }, [result.editor]);

  if (!result.editor) return null;

  return (
    <div data-testid="inner-authoring-workspace">
      <div data-testid="nested-portal-host" ref={setOverlayContainer} />
      <AuthoringContentChrome
        blockDefinitions={fullChromeBlockRegistry}
        editable
        editor={result.editor}
        overlayContainer={overlayContainer}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
        surfaceVariants={fullChromeSurfaceRegistry}
      >
        <Toolbar editor={result.editor} />
        <BlockStrip
          blockDefinitions={fullChromeBlockRegistry}
          editor={result.editor}
          items={catalogItems}
          layoutDefinitions={fullChromeCapabilities.layouts.registry}
          surfaceVariants={fullChromeSurfaceRegistry}
        />
        <EditorContent data-testid="inner-editor-content" editor={result.editor} />
      </AuthoringContentChrome>
    </div>
  );
}

function makeOuterEditor(): Editor {
  const editor = new Editor({
    extensions: [StarterKit, makeTargetNode(), makeReactBlockNode()],
    content: outerDoc(),
  });
  outerEditors.push(editor);
  return editor;
}

function makeFullChromeOuterEditor(content: JSONContent = fullChromeOuterDoc()): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      createTestNodeIdentityExtension(),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension(["callout"]),
      createScaffoldCapabilitiesStorageExtension(fullChromeCapabilities),
      createScaffoldInteractionOwnerExtension(fullChromeBlockRegistry),
      FullChromeGridAuthoringNode,
      FullChromeCellAuthoringNode,
      LayerNode,
      FullChromeLayoutAuthoringNode,
      FullChromeSectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      CalloutAuthoringExtension,
      makeTargetNode(true),
      makeReactBlockNode(),
    ],
    content,
  });
  outerEditors.push(editor);
  return editor;
}

function makeInnerExtensions(): Extensions {
  return [StarterKit.configure({ undoRedo: false }), makeReactBlockNode()];
}

function makeFullChromeInnerExtensions(
  catalogItems: readonly InsertAction[],
  openLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId> = fullChromeOpenLayerByOwnerId,
): Extensions {
  return [
    makeContentDocumentNode(),
    StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
    createTestNodeIdentityExtension(),
    ExtendedParagraph,
    createRuntimeBlockFrameAttributesExtension(["callout"]),
    createScaffoldCapabilitiesStorageExtension(fullChromeCapabilities),
    createScaffoldInteractionOwnerExtension(fullChromeBlockRegistry),
    FullChromeGridAuthoringNode,
    FullChromeCellAuthoringNode,
    LayerNode,
    FullChromeLayoutAuthoringNode,
    FullChromeSectionAuthoringNode,
    AccordionSectionTitleNode,
    AccordionSectionPanelNode,
    CalloutAuthoringExtension,
    makeReactBlockNode(),
    ...createNestedLayerAuthoringExtensions({
      blockDefinitions: fullChromeBlockRegistry,
      layoutDefinitions: fullChromeCapabilities.layouts.registry,
      openLayerByOwnerId,
    }),
    createSlashCommand({
      blockDefinitions: fullChromeBlockRegistry,
      items: catalogItems,
      layoutDefinitions: fullChromeCapabilities.layouts.registry,
      surfaceVariants: fullChromeSurfaceRegistry,
    }),
  ];
}

function makeContentDocumentNode() {
  return Node.create({
    name: "doc",
    topNode: true,
    content: "(block | arrangement)+",
  });
}

function makeTargetNode(includeArrangements = false) {
  return Node.create({
    name: TARGET_NODE_NAME,
    group: "block",
    content: includeArrangements ? "(block | arrangement)+" : "block+",
    parseHTML() {
      return [{ tag: "section[data-test-dialog-content-target]" }];
    },
    renderHTML() {
      return ["section", { "data-test-dialog-content-target": "" }, 0];
    },
    addNodeView() {
      return () => {
        const dom = document.createElement("section");
        dom.dataset.testid = "outer-target-node-view";
        dom.textContent = "Nested content available";
        return { dom };
      };
    },
  });
}

function makeReactBlockNode() {
  return Node.create({
    name: REACT_BLOCK_NODE_NAME,
    group: "block",
    atom: true,
    addAttributes() {
      return {
        label: {
          default: "",
        },
      };
    },
    parseHTML() {
      return [{ tag: "article[data-test-dialog-react-block]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["article", { ...HTMLAttributes, "data-test-dialog-react-block": "" }];
    },
    addNodeView() {
      return ReactNodeViewRenderer(TestReactBlockNodeView);
    },
  });
}

function TestReactBlockNodeView({ node }: NodeViewProps) {
  const inheritedContext = useContext(ReactBlockContext);
  return (
    <NodeViewWrapper as="article" data-testid="dialog-react-block">
      {String(node.attrs["label"])} · {inheritedContext}
    </NodeViewWrapper>
  );
}

function outerDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Before" }],
      },
      {
        type: TARGET_NODE_NAME,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Initial authority" }],
          },
          {
            type: REACT_BLOCK_NODE_NAME,
            attrs: { label: "Initial block" },
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "After" }],
      },
    ],
  };
}

function fullChromeOuterDoc(): JSONContent {
  return fullChromeOuterDocWithTargetContent([
    {
      type: "paragraph",
      content: [{ type: "text", text: "Initial authority" }],
    },
    {
      type: REACT_BLOCK_NODE_NAME,
      attrs: { label: "Initial block" },
    },
    {
      type: "grid",
      attrs: { id: "innergrid001", columnWidths: [1, 1] },
      content: [
        {
          type: "cell",
          attrs: { id: FULL_CHROME_IDS.firstCell, verticalPosition: "top" },
          content: [
            layerWithParagraph(
              FULL_CHROME_IDS.firstCellLayer,
              FULL_CHROME_IDS.firstCellParagraph,
              "First cell",
            ),
          ],
        },
        {
          type: "cell",
          attrs: { id: FULL_CHROME_IDS.secondCell, verticalPosition: "top" },
          content: [
            layerWithParagraph(
              FULL_CHROME_IDS.secondCellLayer,
              FULL_CHROME_IDS.secondCellParagraph,
              "Second cell",
            ),
          ],
        },
      ],
    },
    {
      type: "layout",
      attrs: { id: "innerlayout1", variant: DIALOG_LAYOUT_VARIANT, options: {} },
      content: [
        {
          type: "section",
          attrs: {
            id: FULL_CHROME_IDS.section,
            verticalPosition: "top",
            options: {},
          },
          content: [
            layerWithParagraph(
              FULL_CHROME_IDS.sectionLayer,
              FULL_CHROME_IDS.sectionParagraph,
              "Layout section",
            ),
          ],
        },
      ],
    },
    calloutContent("innercall001"),
  ]);
}

function fullChromeOuterDocWithTargetContent(targetContent: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Before" }],
      },
      {
        type: TARGET_NODE_NAME,
        content: targetContent,
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "After" }],
      },
    ],
  };
}

function scopedInactiveLayerOuterDoc(): JSONContent {
  return fullChromeOuterDocWithTargetContent([
    {
      type: "grid",
      attrs: { id: "inactivegrid1", columnWidths: [1, 1] },
      content: [
        {
          type: "cell",
          attrs: { id: FULL_CHROME_IDS.firstCell, verticalPosition: "top" },
          content: [
            layerWithParagraph(
              FULL_CHROME_IDS.firstCellLayer,
              FULL_CHROME_IDS.firstCellParagraph,
              "Open content",
            ),
            layerWithParagraph(
              FULL_CHROME_IDS.inactiveCellLayer,
              FULL_CHROME_IDS.inactiveCellParagraph,
              "Inactive content",
            ),
          ],
        },
        {
          type: "cell",
          attrs: { id: FULL_CHROME_IDS.secondCell, verticalPosition: "top" },
          content: [
            layerWithParagraph(
              FULL_CHROME_IDS.secondCellLayer,
              FULL_CHROME_IDS.secondCellParagraph,
              "Second cell",
            ),
          ],
        },
      ],
    },
  ]);
}

function scopedEmptyLayerOuterDoc(): JSONContent {
  return fullChromeOuterDocWithTargetContent([
    {
      type: "paragraph",
      attrs: { id: createEmbeddedNodeId() },
    },
  ]);
}

function layerWithParagraph(
  layerId: EmbeddedNodeId,
  paragraphId: EmbeddedNodeId,
  text: string,
): JSONContent {
  return {
    type: "layer",
    attrs: { id: layerId },
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphId },
        content: [{ type: "text", text }],
      },
    ],
  };
}

function calloutContent(id: string): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      {
        type: "callout_title",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Supporting note" }],
          },
        ],
      },
      {
        type: "callout_prompt",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Read this carefully" }],
          },
        ],
      },
    ],
  };
}

function contentTarget(
  outerEditor: Editor,
): Extract<NestedRichTextEditorTarget, { kind: "content" }> {
  return {
    kind: "content",
    getPos: () => findTargetPos(outerEditor),
    node: liveTargetNode(outerEditor),
  };
}

function liveTargetNode(outerEditor: Editor) {
  const node = outerEditor.state.doc.nodeAt(findTargetPos(outerEditor));
  if (!node) throw new Error("Missing dialog content target node");
  return node;
}

function findTargetPos(outerEditor: Editor): number {
  let targetPos: number | null = null;
  outerEditor.state.doc.descendants((node, pos) => {
    if (node.type.name !== TARGET_NODE_NAME) return true;
    targetPos = pos;
    return false;
  });
  if (targetPos === null) throw new Error("Missing dialog content target position");
  return targetPos;
}

function targetText(outerEditor: Editor): string {
  return liveTargetNode(outerEditor).textContent;
}

function replaceTargetContent(outerEditor: Editor, text: string, blockLabel: string): void {
  const targetPos = findTargetPos(outerEditor);
  const currentTarget = liveTargetNode(outerEditor);
  const paragraphType = outerEditor.schema.nodes["paragraph"];
  const reactBlockType = outerEditor.schema.nodes[REACT_BLOCK_NODE_NAME];
  if (!paragraphType || !reactBlockType) throw new Error("Missing dialog test schema nodes");

  const replacementTarget = currentTarget.type.create(currentTarget.attrs, [
    paragraphType.create(null, outerEditor.schema.text(text)),
    reactBlockType.create({ label: blockLabel }),
  ]);
  outerEditor.view.dispatch(
    outerEditor.state.tr.replaceWith(
      targetPos + 1,
      targetPos + currentTarget.nodeSize - 1,
      replacementTarget.content,
    ),
  );
}

function restrictedCatalogItems(): readonly InsertAction[] {
  const allowedIds = new Set(["callout", "grid"]);
  const items = coreInsertCatalog.actions.filter((item) => allowedIds.has(item.id));
  if (items.length !== allowedIds.size) {
    throw new Error("Expected Callout and Grid insert catalog items");
  }
  return items;
}

function activateEditorTarget(
  editor: Editor,
  kind: "block" | "cell" | "grid" | "layout",
  id: string,
): void {
  const pos = findNodePosById(editor, id);
  const commands = getInteractionFacadeStoreForEditor(editor).getState().commands;
  act(() => {
    if (kind === "block") {
      expect(editor.commands.setNodeSelection(pos)).toBe(true);
    }
    const activated =
      kind === "block"
        ? commands.selectObjectTarget({ id, kind, pos })
        : commands.activateStructuralTarget({ id, kind, pos });
    expect(activated).toBe(true);
    editor.view.focus();
  });
}

function findNodePosById(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing editor node ${id}`);
  return found;
}

async function waitForAuthoringFloatingRoot(editor: Editor): Promise<HTMLElement> {
  return waitFor(() => {
    const root = resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND);
    expect(root).not.toBeNull();
    if (!root) throw new Error("Missing authoring floating root");
    return root;
  });
}

async function waitForElement(root: ParentNode, selector: string): Promise<HTMLElement> {
  return waitFor(() => {
    const element = root.querySelector<HTMLElement>(selector);
    expect(Boolean(element)).toBe(true);
    if (!element) throw new Error(`Missing element for ${selector}`);
    return element;
  });
}

function countTargetNodes(outerEditor: Editor, nodeType: string): number {
  let count = 0;
  liveTargetNode(outerEditor).descendants((node) => {
    if (node.type.name === nodeType) count += 1;
  });
  return count;
}

function countEditorNodes(editor: Editor, nodeType: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) count += 1;
  });
  return count;
}

function insertCatalogAction(
  editor: Editor,
  catalogItems: readonly InsertAction[],
  actionId: string,
): boolean {
  const item = catalogItems.find((candidate) => candidate.id === actionId);
  if (!item) throw new Error(`Missing catalog item "${actionId}"`);
  return insertCatalogItemChecked(
    editor,
    item,
    fullChromeBlockRegistry,
    fullChromeCapabilities.layouts.registry,
    fullChromeSurfaceRegistry,
  );
}

function findFirstNodeByType(
  editor: Editor,
  nodeType: string,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let found: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== nodeType) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`Missing editor node type "${nodeType}"`);
  return found;
}

function scopedOpenLayers(editor: Editor): ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId> {
  const context = readLayerEditingContextForState(
    editor.state,
    fullChromeCapabilities.layouts.registry,
    fullChromeBlockRegistry,
  );
  if (!context) throw new Error("Missing scoped Layer editing context");
  return context.openLayerByOwnerId;
}

function calloutVariant(outerEditor: Editor, id: string): unknown {
  let variant: unknown;
  liveTargetNode(outerEditor).descendants((node) => {
    if (node.type.name !== "callout" || node.attrs["id"] !== id) return true;
    const data = node.attrs["data"];
    if (data && typeof data === "object" && "variant" in data) {
      variant = data.variant;
    }
    return false;
  });
  return variant;
}
