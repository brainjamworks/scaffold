// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
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
import type { NestedRichTextEditorTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { BlockStrip } from "@/editor/shell/chrome/BlockStrip";
import { Toolbar } from "@/editor/shell/chrome/Toolbar";
import { AuthoringContentChrome } from "@/editor/shell/authoring/AuthoringContentChrome";
import { createSlashCommand, isSlashCommandActive } from "@/editor/suggestions/slash/SlashCommand";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";

import {
  useNestedRichTextEditor,
  type UseNestedRichTextEditorResult,
} from "./use-nested-rich-text-editor";

const TARGET_NODE_NAME = "test_dialog_content_target";
const REACT_BLOCK_NODE_NAME = "test_dialog_react_block";
const ReactBlockContext = createContext("missing provider");
const outerEditors: Editor[] = [];

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
    act(() => {
      latestResult.current?.syncFromTarget({
        kind: "content",
        node: liveTargetNode(outerEditor),
      });
    });
    expect(countEditorNodes(firstInnerEditor, "callout")).toBe(calloutCountBeforeSlashInsert);
    expect(screen.getByRole("dialog", { name: "Nested content" })).toBeInTheDocument();

    activateEditorTarget(firstInnerEditor, "grid", "inner-grid");

    expect(interactionOwnerPluginKey.getState(firstInnerEditor.state)?.explicitOwner).toMatchObject(
      {
        id: "inner-grid",
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

    activateEditorTarget(firstInnerEditor, "cell", "inner-cell-a");
    const cellOptions = await within(firstInnerFloatingRoot).findByRole("button", {
      name: "Cell options",
    });
    await userEvent.click(cellOptions);
    const cellBubble = await screen.findByRole("toolbar", { name: "Block actions" });
    expect(within(cellBubble).getByRole("button", { name: "Add column left" })).toBeInTheDocument();
    expect(within(cellBubble).getByRole("button", { name: "Delete cell" })).toBeInTheDocument();

    activateEditorTarget(firstInnerEditor, "layout", "inner-layout");
    const layoutOptions = await within(firstInnerFloatingRoot).findByRole("button", {
      name: "Layout options",
    });
    await userEvent.click(layoutOptions);
    const layoutBubble = await screen.findByRole("toolbar", { name: "Block actions" });
    expect(
      within(layoutBubble).getByRole("button", { name: "Duplicate layout" }),
    ).toBeInTheDocument();
    expect(within(layoutBubble).getByRole("button", { name: "Delete layout" })).toBeInTheDocument();

    activateEditorTarget(firstInnerEditor, "block", "inner-callout");
    const settingsLauncher = await waitForElement(workspace, '[aria-label="Open block settings"]');
    expect(settingsLauncher.closest('[role="toolbar"][aria-label="Block actions"]')).not.toBeNull();
    await userEvent.click(settingsLauncher);

    const settingsSheet = await screen.findByRole("dialog", { name: "Callout settings" });
    expect(portalHost.contains(settingsSheet)).toBe(true);
    const variantSelect = within(settingsSheet).getByRole("combobox", { name: "Variant" });
    await userEvent.click(variantSelect);
    const variantListbox = await screen.findByRole("listbox");
    expect(portalHost.contains(variantListbox)).toBe(true);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(screen.getByRole("dialog", { name: "Callout settings" })).toBe(settingsSheet);
    expect(screen.getByRole("dialog", { name: "Nested content" })).toBeInTheDocument();
    expect(document.activeElement).toBe(variantSelect);

    await userEvent.click(variantSelect);
    await userEvent.click(await screen.findByRole("option", { name: "Warning" }));
    await userEvent.click(within(settingsSheet).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Callout settings" })).toBeNull(),
    );
    expect(calloutVariant(outerEditor, "inner-callout")).toBe("warning");
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
    activateEditorTarget(firstInnerEditor, "block", "inner-callout");
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
    expect(calloutVariant(outerEditor, "inner-callout")).toBe("warning");
    expect(within(reopenedWorkspace).queryByRole("dialog")).toBeNull();
    expect(innerEditors.filter((editor) => !editor.isDestroyed)).toEqual([reopenedEditor]);

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    await waitFor(() => expect(reopenedEditor.isDestroyed).toBe(true));
    expect(innerEditors.every((editor) => editor.isDestroyed)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  }, 15_000);
});

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
        blockDefinitions={builtInBlockRegistry}
        editable
        editor={outerEditor}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
        surfaceVariants={builtInSurfaceVariantRegistry}
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
        blockDefinitions={builtInBlockRegistry}
        editable
        editor={result.editor}
        overlayContainer={overlayContainer}
        surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
        surfaceVariants={builtInSurfaceVariantRegistry}
      >
        <Toolbar editor={result.editor} />
        <BlockStrip
          blockDefinitions={builtInBlockRegistry}
          surfaceVariants={builtInSurfaceVariantRegistry}
          editor={result.editor}
          items={catalogItems}
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

function makeFullChromeOuterEditor(): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension(["callout"]),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      CalloutAuthoringExtension,
      makeTargetNode(true),
      makeReactBlockNode(),
    ],
    content: fullChromeOuterDoc(),
  });
  outerEditors.push(editor);
  return editor;
}

function makeInnerExtensions(): Extensions {
  return [StarterKit.configure({ undoRedo: false }), makeReactBlockNode()];
}

function makeFullChromeInnerExtensions(catalogItems: readonly InsertAction[]): Extensions {
  return [
    makeContentDocumentNode(),
    StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
    ExtendedParagraph,
    createRuntimeBlockFrameAttributesExtension(["callout"]),
    createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    GridAuthoringNode,
    CellAuthoringNode,
    LayoutAuthoringNode,
    SectionAuthoringNode,
    CalloutAuthoringExtension,
    makeReactBlockNode(),
    createSlashCommand({ items: catalogItems, surfaceVariants: builtInSurfaceVariantRegistry }),
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
          {
            type: "grid",
            attrs: { id: "inner-grid", columnWidths: [1, 1] },
            content: [
              {
                type: "cell",
                attrs: { id: "inner-cell-a", verticalPosition: "top" },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "First cell" }],
                  },
                ],
              },
              {
                type: "cell",
                attrs: { id: "inner-cell-b", verticalPosition: "top" },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Second cell" }],
                  },
                ],
              },
            ],
          },
          {
            type: "layout",
            attrs: { id: "inner-layout", variant: null, options: {} },
            content: [
              {
                type: "section",
                attrs: { id: "inner-section", verticalPosition: "top", options: {} },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Layout section" }],
                  },
                ],
              },
            ],
          },
          calloutContent("inner-callout"),
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "After" }],
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
  const items = builtInInsertCatalog.actions.filter((item) => allowedIds.has(item.id));
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
