// @vitest-environment happy-dom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { createElement, Fragment } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
  type LayoutCapability,
} from "@/composition/application/create-scaffold-application";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  EditorFloatingLayer,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import * as floatingPositioner from "@/editor/interactions/floating/overlay-floating-positioner";
import { createScaffoldDocumentContent } from "@/format/artifact";

import {
  getSlashCommandItems,
  createSlashCommand,
  insertSlashCommandItem,
  isSlashCommandActive,
  resolveSlashCommandPopupTarget,
} from "./SlashCommand";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const coreInsertCatalog = coreAuthoringComposition.catalogues.inDocument;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Object.defineProperty(window, "scrollX", {
    configurable: true,
    value: 0,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
  });
});

function catalogItem(id: string): InsertAction {
  const item = coreInsertCatalog.getById(id);
  if (!item) throw new Error(`Insert action "${id}" is not built in`);
  return item;
}

function makeEditor(items: readonly InsertAction[], ownerDocument: Document = document) {
  const ownerRoot = ownerDocument.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  const element = ownerDocument.createElement("div");
  ownerRoot.append(element);
  ownerDocument.body.append(ownerRoot);
  const slashCommand = createSlashCommand({
    blockDefinitions: coreAuthoringComposition.capabilities.blocks.registry,
    items,
    layoutDefinitions: coreAuthoringComposition.capabilities.layouts.registry,
    surfaceVariants: coreAuthoringComposition.capabilities.surfaces.registry,
  });
  const extensions = createCourseDocumentAuthoringExtensions({
    composition: coreAuthoringComposition,
    editable: true,
  }).filter((extension) => extension.name !== slashCommand.name);

  return new Editor({
    element,
    extensions: [...extensions, slashCommand],
    content: createScaffoldDocumentContent({ mode: "page" }),
  });
}

function makeApplicationEditor(
  application: ReturnType<typeof createScaffoldApplication>,
  content: JSONContent = createScaffoldDocumentContent({ mode: "page" }),
) {
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  const element = document.createElement("div");
  ownerRoot.append(element);
  document.body.append(ownerRoot);

  return new Editor({
    element,
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: application.authoring,
    }),
    content,
  });
}

describe("SlashCommand popup destination", () => {
  it("resolves the registered authoring root for the same editor", async () => {
    const firstEditor = makeEditor(coreInsertCatalog.actions);
    const secondEditor = makeEditor(coreInsertCatalog.actions);
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);

    render(
      createElement(
        Fragment,
        null,
        renderScopedEditor(firstEditor, firstHost),
        renderScopedEditor(secondEditor, secondHost),
      ),
    );

    await waitFor(() => {
      expect(resolveSlashCommandPopupTarget(firstEditor)?.parentElement?.parentElement).toBe(
        firstHost,
      );
      expect(resolveSlashCommandPopupTarget(secondEditor)?.parentElement?.parentElement).toBe(
        secondHost,
      );
    });
    const firstRoot = requireSlashRoot(firstEditor);
    const secondRoot = requireSlashRoot(secondEditor);

    firstEditor.commands.focus("end");
    firstEditor.commands.insertContent("/");

    const menu = await waitForSlashMenu(firstRoot);
    const popup = menu.closest('[style*="z-index: 100"]');
    expect(popup?.parentElement).toBe(firstRoot);
    expect(secondRoot?.querySelector('[style*="z-index: 100"]')).toBeNull();
    expect(document.body.querySelector(':scope > [style*="z-index: 100"]')).toBeNull();

    firstEditor.destroy();
    secondEditor.destroy();
  });

  it("keeps an active popup in the current authoring root through replacement and reopen", async () => {
    const createPositionerSpy = vi.spyOn(floatingPositioner, "createOverlayFloatingPositioner");
    const editor = makeEditor(coreInsertCatalog.actions);
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    const rendered = render(renderScopedEditor(editor, firstHost));

    await waitFor(() => {
      expect(resolveSlashCommandPopupTarget(editor)?.parentElement?.parentElement).toBe(firstHost);
    });
    const firstRoot = requireSlashRoot(editor);
    editor.commands.focus("end");
    editor.commands.insertContent("/");

    const firstMenu = await waitForSlashMenu(firstRoot);
    const firstPopup = firstMenu.closest<HTMLElement>('[style*="z-index: 100"]');
    expect(firstPopup?.parentElement).toBe(firstRoot);
    expect(createPositionerSpy).toHaveBeenCalledTimes(1);

    rendered.rerender(renderScopedEditor(editor, secondHost));

    await waitFor(() => {
      const currentRoot = resolveSlashCommandPopupTarget(editor);
      expect(currentRoot).not.toBe(firstRoot);
      expect(currentRoot?.parentElement?.parentElement).toBe(secondHost);
    });
    const secondRoot = requireSlashRoot(editor);

    await waitFor(() => expect(firstPopup?.parentElement).toBe(secondRoot));
    expect(firstPopup?.isConnected).toBe(true);
    expect(requireSlashMenu(secondRoot)).toBe(firstMenu);

    editor.commands.insertContent("c");
    await waitFor(() => expect(firstPopup?.parentElement).toBe(secondRoot));
    expect(createPositionerSpy).toHaveBeenCalledTimes(1);

    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await waitFor(() => expect(firstPopup?.isConnected).toBe(false));

    editor.commands.insertContent(" /");
    const reopenedMenu = await waitForSlashMenu(secondRoot);
    const reopenedPopup = reopenedMenu.closest<HTMLElement>('[style*="z-index: 100"]');
    expect(reopenedPopup?.parentElement).toBe(secondRoot);
    expect(createPositionerSpy).toHaveBeenCalledTimes(2);

    editor.destroy();
    expect(reopenedPopup?.isConnected).toBe(false);
    rendered.unmount();
  });

  it("tracks an active popup through ready, pending, and replacement roots", async () => {
    const createPositioner = floatingPositioner.createOverlayFloatingPositioner;
    const placementUpdates: floatingPositioner.OverlayFloatingPlacementInput[] = [];
    const createPositionerSpy = vi
      .spyOn(floatingPositioner, "createOverlayFloatingPositioner")
      .mockImplementation((input) => {
        const positioner = createPositioner(input);
        return {
          ...positioner,
          update: (placementInput) => {
            placementUpdates.push(placementInput);
            positioner.update(placementInput);
          },
        };
      });
    const editor = makeEditor(coreInsertCatalog.actions);
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    const rendered = render(renderScopedEditor(editor, firstHost));

    await waitFor(() => {
      expect(resolveSlashCommandPopupTarget(editor)?.parentElement?.parentElement).toBe(firstHost);
    });
    const firstRoot = requireSlashRoot(editor);
    editor.commands.focus("end");
    editor.commands.insertContent("/");

    const menu = await waitForSlashMenu(firstRoot);
    const popup = menu.closest<HTMLElement>('[style*="z-index: 100"]');
    expect(popup?.parentElement).toBe(firstRoot);
    expect(createPositionerSpy).toHaveBeenCalledTimes(1);

    rendered.rerender(renderScopedEditor(editor, null));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).toBeNull());
    await waitFor(() => expect(placementUpdates.at(-1)?.environment).toBeNull());
    expect(isSlashCommandActive(editor.state)).toBe(true);
    expect(editor.view.dom.isConnected).toBe(true);
    expect(popup?.parentElement).toBeNull();
    expect(popup?.dataset.scaffoldOverlayPlaced).toBe("false");
    expect(document.body.querySelector(':scope > [style*="z-index: 100"]')).toBeNull();

    rendered.rerender(renderScopedEditor(editor, secondHost));

    await waitFor(() => {
      const currentRoot = resolveSlashCommandPopupTarget(editor);
      expect(currentRoot).not.toBe(firstRoot);
      expect(currentRoot?.parentElement?.parentElement).toBe(secondHost);
    });
    const secondRoot = requireSlashRoot(editor);
    await waitFor(() => expect(popup?.parentElement).toBe(secondRoot));
    expect(placementUpdates.at(-1)?.environment?.container).toBe(secondRoot);
    expect(popup?.isConnected).toBe(true);
    expect(requireSlashMenu(secondRoot)).toBe(menu);
    expect(createPositionerSpy).toHaveBeenCalledTimes(1);

    editor.destroy();
    expect(popup?.isConnected).toBe(false);
    rendered.unmount();
  });

  it("stays pending in the editor owner document without a registered boundary root", () => {
    const ownerDocument = document.implementation.createHTMLDocument("slash owner");
    const editor = makeEditor(coreInsertCatalog.actions, ownerDocument);

    expect(resolveSlashCommandPopupTarget(editor)).toBeNull();
    expect(resolveSlashCommandPopupTarget(editor)).not.toBe(document.body);

    editor.destroy();
  });

  it("preserves Suggestion keyboard selection and checked command insertion", async () => {
    const callout = catalogItem("callout");
    const editor = makeEditor([callout]);
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    editor.commands.focus("end");
    editor.commands.insertContent("/");
    await waitForSlashMenu(root);

    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

    await waitFor(() => expect(editorHasNode(editor, callout.nodeType)).toBe(true));
    expect(root.querySelector('[role="listbox"][aria-label="Insert block"]')).toBeNull();

    editor.destroy();
    rendered.unmount();
  });
});

function renderScopedEditor(editor: Editor, host: HTMLElement | null) {
  const ownerRoot = editor.view.dom.parentElement;
  if (ownerRoot === null) throw new Error("Expected an authoring owner root.");

  return createElement(
    AuthoringOverlayBoundary,
    { children: null, container: host, ownerRoot },
    createElement(EditorContent, { editor }),
    createElement(EditorFloatingLayer, {
      children: null,
      editor,
      kind: AUTHORING_EDITOR_FLOATING_LAYER_KIND,
    }),
  );
}

function requireSlashRoot(editor: Editor): HTMLElement {
  const root = resolveSlashCommandPopupTarget(editor);
  if (root === null) throw new Error("Expected a registered Slash command root.");
  return root;
}

async function waitForSlashMenu(root: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(requireSlashMenu(root)).not.toBeNull());
  return requireSlashMenu(root);
}

function requireSlashMenu(root: HTMLElement): HTMLElement {
  const menu = root.querySelector<HTMLElement>('[role="listbox"][aria-label="Insert block"]');
  if (menu === null) throw new Error("Expected a Slash command menu.");
  return menu;
}

function editorHasNode(editor: Editor, nodeType: string): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) found = true;
  });
  return found;
}

describe("SlashCommand catalog inputs", () => {
  it("discovers and inserts a host Block only in its resolved application", async () => {
    const hostBlock = hostBlockCapability("host_slash_block");
    const plusApplication = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "host-slash-pack", blocks: [hostBlock] })],
    });
    const coreApplication = createScaffoldApplication();
    const plusEditor = makeApplicationEditor(plusApplication);
    const coreEditor = makeApplicationEditor(coreApplication);
    const plusHost = document.createElement("div");
    const coreHost = document.createElement("div");
    document.body.append(plusHost, coreHost);
    const rendered = render(
      createElement(
        Fragment,
        null,
        renderScopedEditor(plusEditor, plusHost),
        renderScopedEditor(coreEditor, coreHost),
      ),
    );

    await waitFor(() => {
      expect(resolveSlashCommandPopupTarget(plusEditor)).not.toBeNull();
      expect(resolveSlashCommandPopupTarget(coreEditor)).not.toBeNull();
    });
    const plusRoot = requireSlashRoot(plusEditor);
    const coreRoot = requireSlashRoot(coreEditor);

    plusEditor.commands.focus("end");
    plusEditor.commands.insertContent("/host-slash");
    coreEditor.commands.focus("end");
    coreEditor.commands.insertContent("/host-slash");

    await waitFor(() => {
      expect(plusRoot.querySelector('[aria-label="Host Slash Block"]')).not.toBeNull();
      expect(coreRoot.textContent).toContain("No block matches");
    });

    plusEditor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );

    await waitFor(() =>
      expect(editorHasNode(plusEditor, hostBlock.definition.nodeType)).toBe(true),
    );
    expect(editorHasNode(coreEditor, hostBlock.definition.nodeType)).toBe(false);

    plusEditor.destroy();
    coreEditor.destroy();
    rendered.unmount();
  });

  it("hides a host fill Block when its bounded region has sibling content", async () => {
    const hostBlock = hostBlockCapability("host_fill_slash_block", "fill");
    const application = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "host-fill-slash-pack", blocks: [hostBlock] })],
    });
    const editor = makeApplicationEditor(application, boundedRegionDocument());
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    setCursorInFirstEmptyParagraph(editor);
    expect(editor.commands.insertContent("/host-fill-slash")).toBe(true);
    expect(isSlashCommandActive(editor.state)).toBe(true);

    await waitFor(() => expect(root.textContent).toContain("No block matches"));

    expect(editorHasNode(editor, hostBlock.definition.nodeType)).toBe(false);
    expect(editor.state.doc.textContent).toContain("Existing region content");

    editor.destroy();
    rendered.unmount();
  });

  it("does not offer Grid when its bounded region has authored sibling content", async () => {
    const editor = makeApplicationEditor(createScaffoldApplication(), boundedRegionDocument());
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    setCursorInFirstEmptyParagraph(editor);
    expect(editor.commands.insertContent("/grid")).toBe(true);

    await waitFor(() => {
      expect(root.textContent).toContain("Table");
      expect(root.querySelector('[aria-label="Grid"]')).toBeNull();
    });
    expect(editor.state.doc.textContent).toContain("Existing region content");
    expect(editorHasNode(editor, "grid")).toBe(false);

    editor.destroy();
    rendered.unmount();
  });

  it("does not offer Grid when an installed fill Layout section has authored sibling content", async () => {
    const hostLayout = hostFillLayoutCapability("host-fill-slash-layout");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-fill-slash-layout-pack",
          layouts: [hostLayout],
        }),
      ],
    });
    const editor = makeApplicationEditor(
      application,
      fillLayoutSectionDocument(hostLayout.definition.id),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    setCursorInFirstEmptyParagraph(editor);
    expect(editor.commands.insertContent("/grid")).toBe(true);

    await waitFor(() => {
      expect(root.textContent).toContain("Table");
      expect(root.querySelector('[aria-label="Grid"]')).toBeNull();
    });
    expect(editor.state.doc.textContent).toContain("Authored section sibling");
    expect(editorHasNode(editor, "grid")).toBe(false);

    const grid = application.authoring.catalogues.inDocument.getById("grid");
    if (!grid) throw new Error("Expected the Grid action.");
    const before = editor.getJSON();
    const to = editor.state.selection.to;
    expect(
      insertSlashCommandItem(
        editor,
        { from: to - "/grid".length, to },
        grid,
        application.authoring.capabilities.blocks.registry,
        application.authoring.capabilities.layouts.registry,
        application.authoring.capabilities.surfaces.registry,
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
    rendered.unmount();
  });

  it("does not offer Grid inside a Grid cell", async () => {
    const editor = makeApplicationEditor(createScaffoldApplication(), gridCellDocument());
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    setCursorInFirstEmptyParagraph(editor);
    expect(editor.commands.insertContent("/grid")).toBe(true);

    await waitFor(() => {
      expect(root.textContent).toContain("Table");
      expect(root.querySelector('[aria-label="Grid"]')).toBeNull();
    });
    const outerGrid = firstNodeOfType(editor, "grid");
    expect(outerGrid?.childCount).toBe(2);
    expect(editor.state.doc.textContent).toContain("/grid");

    editor.destroy();
    rendered.unmount();
  });

  it("inserts Grid with Enter as the sole child of an otherwise-empty region", async () => {
    const grid = catalogItem("grid");
    const editor = makeApplicationEditor(createScaffoldApplication(), emptyBoundedRegionDocument());
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    setCursorInFirstEmptyParagraph(editor);
    expect(editor.commands.insertContent("/grid")).toBe(true);

    await waitFor(() => {
      expect(root.querySelector('[aria-label="Grid"]')).not.toBeNull();
    });
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));

    await waitFor(() => {
      const region = firstNodeOfType(editor, "region");
      expect(region?.childCount).toBe(1);
      expect(region?.firstChild?.type.name).toBe(grid.nodeType);
      expect(region?.firstChild?.childCount).toBe(2);
      expect(region?.textContent).not.toContain("/grid");
    });

    editor.destroy();
    rendered.unmount();
  });

  it("inserts Grid by mouse as the sole child of an otherwise-empty region", async () => {
    const grid = catalogItem("grid");
    const editor = makeApplicationEditor(createScaffoldApplication(), emptyBoundedRegionDocument());
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(renderScopedEditor(editor, host));

    await waitFor(() => expect(resolveSlashCommandPopupTarget(editor)).not.toBeNull());
    const root = requireSlashRoot(editor);
    setCursorInFirstEmptyParagraph(editor);
    expect(editor.commands.insertContent("/grid")).toBe(true);

    const gridButton = await waitFor(() => {
      const button = root.querySelector<HTMLElement>('[aria-label="Grid"]');
      expect(button).not.toBeNull();
      return button;
    });
    if (!gridButton) throw new Error("Expected the Grid Slash item.");
    fireEvent.click(gridButton);

    await waitFor(() => {
      const region = firstNodeOfType(editor, "region");
      expect(region?.childCount).toBe(1);
      expect(region?.firstChild?.type.name).toBe(grid.nodeType);
      expect(region?.firstChild?.childCount).toBe(2);
      expect(region?.textContent).not.toContain("/grid");
    });

    editor.destroy();
    rendered.unmount();
  });

  it("searches the explicitly supplied built-in catalog", () => {
    const editor = makeEditor(coreInsertCatalog.actions);
    editor.commands.focus("end");
    editor.commands.insertContent("/callout");

    const results = getSlashCommandItems(
      editor,
      "callout",
      coreInsertCatalog.actions,
      coreAuthoringComposition.capabilities.blocks.registry,
      coreAuthoringComposition.capabilities.layouts.registry,
      coreAuthoringComposition.capabilities.surfaces.registry,
    );

    expect(results[0]?.id).toBe("callout");
    expect(results.map((item) => item.id)).toContain("callout");

    editor.destroy();
  });

  it("searches only the supplied item source", () => {
    const callout = catalogItem("callout");
    const chart = catalogItem("chart");
    const items = [callout, chart];
    const editor = makeEditor(items);
    editor.commands.focus("end");
    editor.commands.insertContent("/chart");

    const results = getSlashCommandItems(
      editor,
      "chart",
      items,
      coreAuthoringComposition.capabilities.blocks.registry,
      coreAuthoringComposition.capabilities.layouts.registry,
      coreAuthoringComposition.capabilities.surfaces.registry,
    );

    expect(results.map((item) => item.id)).toEqual(["chart"]);

    editor.destroy();
  });

  it("inserts a supplied result through checked insertion", () => {
    const callout = catalogItem("callout");
    const editor = makeEditor([callout]);
    const range = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };

    const inserted = insertSlashCommandItem(
      editor,
      range,
      callout,
      coreAuthoringComposition.capabilities.blocks.registry,
      coreAuthoringComposition.capabilities.layouts.registry,
      coreAuthoringComposition.capabilities.surfaces.registry,
    );

    let hasCallout = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === callout.nodeType) hasCallout = true;
    });
    expect(inserted).toBe(true);
    expect(hasCallout).toBe(true);

    editor.destroy();
  });
});

function hostBlockCapability(nodeType: string, boundedPlacement?: "fill"): BlockCapability {
  const title = nodeType
    .split("_")
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(" ");
  const createNode = () =>
    Node.create({
      name: nodeType,
      group: "block",
      atom: true,
      renderHTML: () => ["div", { "data-host-test-block": nodeType }],
    });

  return {
    definition: {
      nodeType,
      title,
      ...(boundedPlacement ? { boundedPlacement } : {}),
      insert: {
        id: nodeType.replaceAll("_", "-"),
        title,
        description: `Insert ${title}`,
        icon: CircleIcon,
        category: "content",
        content: () => ({ type: nodeType }),
      },
    },
    authoringExtension: createNode(),
    runtimeExtension: createNode(),
  };
}

function hostFillLayoutCapability(id: string): LayoutCapability {
  return {
    definition: {
      id,
      title: "Host Fill Layout",
      description: "Host-contributed fill Layout",
      icon: CircleIcon,
      boundedPlacement: "fill",
      createContent: () => ({
        type: "layout",
        attrs: { id: `${id}-instance`, variant: id },
        content: [
          {
            type: "section",
            attrs: { id: `${id}-section` },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    },
    authoringView: { id, layout: EmptyLayoutView },
    runtimeView: { id, component: EmptyLayoutView },
  };
}

function EmptyLayoutView() {
  return null;
}

function boundedRegionDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          {
            type: "surface",
            attrs: {
              id: "surface-host-fill",
              variant: "slide-content",
              settings: { slideTitle: { enabled: false } },
            },
            content: [
              { type: "slide_title" },
              {
                type: "region",
                attrs: { id: "region-host-fill", role: "main" },
                content: [
                  { type: "paragraph" },
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Existing region content" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function emptyBoundedRegionDocument(): JSONContent {
  const document = boundedRegionDocument();
  const region = document.content?.[0]?.content?.[0]?.content?.find(
    (node) => node.type === "region",
  );
  if (!region) throw new Error("Expected a bounded region.");
  region.content = [{ type: "paragraph" }];
  return document;
}

function fillLayoutSectionDocument(layoutId: string): JSONContent {
  const document = emptyBoundedRegionDocument();
  const region = document.content?.[0]?.content?.[0]?.content?.find(
    (node) => node.type === "region",
  );
  if (!region) throw new Error("Expected a bounded region.");
  region.content = [
    {
      type: "layout",
      attrs: { id: `${layoutId}-instance`, variant: layoutId },
      content: [
        {
          type: "section",
          attrs: { id: `${layoutId}-section` },
          content: [
            { type: "paragraph" },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Authored section sibling" }],
            },
          ],
        },
      ],
    },
  ];
  return document;
}

function gridCellDocument(): JSONContent {
  const document = emptyBoundedRegionDocument();
  const region = document.content?.[0]?.content?.[0]?.content?.find(
    (node) => node.type === "region",
  );
  if (!region) throw new Error("Expected a bounded region.");
  region.content = [
    {
      type: "grid",
      attrs: { id: "slash-grid", columnWidths: [1, 1] },
      content: [
        {
          type: "cell",
          attrs: { id: "slash-grid-cell-a" },
          content: [{ type: "paragraph" }],
        },
        {
          type: "cell",
          attrs: { id: "slash-grid-cell-b" },
          content: [{ type: "paragraph" }],
        },
      ],
    },
  ];
  return document;
}

function firstNodeOfType(editor: Editor, nodeType: string): ProseMirrorNode | null {
  let found: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== nodeType) return true;
    found = node;
    return false;
  });
  return found;
}

function setCursorInFirstEmptyParagraph(editor: Editor): void {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null) return false;
    if (node.type.name !== "paragraph" || node.content.size !== 0) return true;
    position = pos + 1;
    return false;
  });
  if (position === null) throw new Error("Expected an empty paragraph.");
  editor.commands.setTextSelection(position);
}
