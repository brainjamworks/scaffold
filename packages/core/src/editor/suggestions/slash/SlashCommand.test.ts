// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { createElement, Fragment } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
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
  const item = builtInInsertCatalog.getById(id);
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
    items,
    surfaceVariants: builtInSurfaceVariantRegistry,
  });
  const extensions = createCourseDocumentAuthoringExtensions({ editable: true }).filter(
    (extension) => extension.name !== slashCommand.name,
  );

  return new Editor({
    element,
    extensions: [...extensions, slashCommand],
    content: createScaffoldDocumentContent({ mode: "page" }),
  });
}

describe("SlashCommand popup destination", () => {
  it("resolves the registered authoring root for the same editor", async () => {
    const firstEditor = makeEditor(builtInInsertCatalog.actions);
    const secondEditor = makeEditor(builtInInsertCatalog.actions);
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
    const editor = makeEditor(builtInInsertCatalog.actions);
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
    const editor = makeEditor(builtInInsertCatalog.actions);
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
    const editor = makeEditor(builtInInsertCatalog.actions, ownerDocument);

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
  it("searches the explicitly supplied built-in catalog", () => {
    const editor = makeEditor(builtInInsertCatalog.actions);

    const results = getSlashCommandItems(editor, "callout", builtInInsertCatalog.actions);

    expect(results[0]?.id).toBe("callout");
    expect(results.map((item) => item.id)).toContain("callout");

    editor.destroy();
  });

  it("searches only the supplied item source", () => {
    const callout = catalogItem("callout");
    const chart = catalogItem("chart");
    const items = [callout, chart];
    const editor = makeEditor(items);

    const results = getSlashCommandItems(editor, "chart", items);

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
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
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
