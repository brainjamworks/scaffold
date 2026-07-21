// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { AUTHORING_ANCHOR_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { AUTHORING_INTERACTION_ROOT_ATTR } from "@/editor/interactions/dom/authoring-root";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { authoringSlideDividersPluginKey } from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import { AuthoringDocumentBlockStrip, AuthoringDocumentChrome } from "./AuthoringDocumentChrome";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

function createTestEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function createAuthoringEditor() {
  return new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
    }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

describe("AuthoringDocumentChrome", () => {
  it("binds the built-in insertion strip at document composition", () => {
    const editor = createTestEditor();

    render(<AuthoringDocumentBlockStrip editor={editor} />);

    expect(screen.getByLabelText("Insert block")).toBeInTheDocument();

    editor.destroy();
  });

  it("renders authoring chrome only for editable mounts", () => {
    const editor = createTestEditor();

    const { rerender } = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <div data-testid="editor-content" />
      </AuthoringDocumentChrome>,
    );

    expect(screen.getByTestId("scaffold-editor-movement-layer")).toBeInTheDocument();
    expect(
      screen.getByTestId("editor-content").closest(`[${AUTHORING_INTERACTION_ROOT_ATTR}]`),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-editor-resize-frame-layer")).toBeNull();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    rerender(
      <AuthoringDocumentChrome editable={false} editor={editor}>
        <div data-testid="editor-content" />
      </AuthoringDocumentChrome>,
    );

    expect(screen.queryByTestId("scaffold-editor-movement-layer")).toBeNull();
    expect(screen.queryByTestId("scaffold-editor-resize-frame-layer")).toBeNull();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    editor.destroy();
  });

  it("suppresses authoring chrome when the editor instance is read-only", () => {
    const editor = new Editor({
      editable: false,
      extensions: [StarterKit.configure({ undoRedo: false })],
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    render(
      <AuthoringDocumentChrome editable editor={editor}>
        <div data-testid="editor-content" />
      </AuthoringDocumentChrome>,
    );

    expect(screen.queryByTestId("scaffold-editor-movement-layer")).toBeNull();
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    editor.destroy();
  });

  it("renders active surface and region menu triggers in floating chrome", async () => {
    const editor = createAuthoringEditor();
    const documentJSON = createSlideshowDocumentJSON({
      regionId: "region-a",
      surfaceId: "surface-region-menu-smoke",
      text: "Region content",
    });
    editor.commands.setContent(documentJSON);
    editor.commands.setTextSelection(findParagraphTextPosition(editor, "Region content"));
    expect(
      publishInteractionOwnerSnapshot(editor.state, null, {
        blockDefinitions: builtInBlockRegistry,
      }).owners.contextOwners.region,
    ).toMatchObject({
      id: "region-a",
      kind: InteractionTargetKind.Region,
    });

    const rendered = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringDocumentChrome>,
    );

    const surface = await waitUntil(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-authoring-frame="surface"][data-id="surface-region-menu-smoke"]',
      );
      if (!element) throw new Error("Expected surface frame.");
      return element;
    });
    const region = await waitUntil(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-authoring-frame="region"][data-id="region-a"]',
      );
      if (!element) throw new Error("Expected region frame.");
      return element;
    });
    mockFloatingControlRect(editor.view.dom.parentElement, {
      height: 400,
      width: 600,
      x: 0,
      y: 0,
    });
    mockFloatingControlRect(surface, {
      height: 320,
      width: 520,
      x: 20,
      y: 20,
    });
    mockFloatingControlRect(region, {
      height: 220,
      width: 420,
      x: 60,
      y: 60,
    });
    editor.commands.focus();

    expect(document.body.querySelector("[data-surface-menu-trigger]")).toBeNull();
    expect(document.body.querySelector("[data-region-menu-trigger]")).toBeNull();

    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
    expect(
      ports.activateStructuralTarget({
        id: "surface-region-menu-smoke",
        kind: InteractionTargetKind.Surface,
        pos: nodePos(editor, "surface", "surface-region-menu-smoke"),
      }),
    ).toBe(true);

    const surfaceTrigger = await waitUntil(() => {
      const element = document.body.querySelector<HTMLButtonElement>(
        '[data-scaffold-editor-floating-layer-kind="authoring"] [data-surface-menu-trigger]',
      );
      if (!element) throw new Error("Expected floating surface menu trigger.");
      return element;
    });
    expect(surface.contains(surfaceTrigger)).toBe(false);
    expect(surfaceTrigger.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe(
      "surface-menu:surface-region-menu-smoke",
    );

    fireEvent.click(surfaceTrigger);

    await waitUntil(() => {
      expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
        id: "surface-region-menu-smoke",
        kind: InteractionTargetKind.Surface,
      });
    });
    expect(
      getInteractionFacadeStoreForEditor(editor).getState().snapshot.owners.menuOwner.target,
    ).toMatchObject({
      id: "surface-region-menu-smoke",
      kind: InteractionTargetKind.Surface,
    });

    expect(ports.dismissInteraction()).toBe(true);

    expect(
      ports.activateStructuralTarget({
        id: "region-a",
        kind: InteractionTargetKind.Region,
        pos: nodePos(editor, "region", "region-a"),
      }),
    ).toBe(true);

    const regionTrigger = await waitUntil(() => {
      const element = document.body.querySelector<HTMLButtonElement>(
        '[data-scaffold-editor-floating-layer-kind="authoring"] [data-region-menu-trigger]',
      );
      if (!element) throw new Error("Expected floating region menu trigger.");
      return element;
    });

    expect(region.contains(regionTrigger)).toBe(false);
    expect(regionTrigger.getAttribute(AUTHORING_ANCHOR_ATTR)).toBe("region-menu:region-a");

    fireEvent.click(regionTrigger);

    await waitUntil(() => {
      expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
        id: "region-a",
        kind: InteractionTargetKind.Region,
      });
    });
    expect(
      getInteractionFacadeStoreForEditor(editor).getState().snapshot.owners.menuOwner.target,
    ).toMatchObject({
      id: "region-a",
      kind: InteractionTargetKind.Region,
    });

    rendered.unmount();
    editor.destroy();
  });

  it("retains the Surface template picker in document chrome", async () => {
    const editor = createAuthoringEditor();
    editor.commands.setContent(
      createSlideshowDocumentJSON({
        regionId: "region-template-picker",
        surfaceId: "surface-template-picker",
        text: "Template picker content",
      }),
    );

    const rendered = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringDocumentChrome>,
    );

    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId: "surface-template-picker",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Choose slide template" }),
    ).toBeInTheDocument();

    rendered.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    editor.destroy();
  });

  it("does not refocus a destroyed editor after template picker teardown", async () => {
    const editor = createAuthoringEditor();
    editor.commands.setContent(
      createSlideshowDocumentJSON({
        regionId: "region-template-picker-teardown",
        surfaceId: "surface-template-picker-teardown",
        text: "Template picker teardown content",
      }),
    );
    const focus = vi.spyOn(editor.view, "focus");

    const rendered = render(
      <AuthoringDocumentChrome editable editor={editor}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringDocumentChrome>,
    );
    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId: "surface-template-picker-teardown",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Choose slide template" }),
    ).toBeInTheDocument();

    rendered.unmount();
    editor.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(focus).not.toHaveBeenCalled();
  });
});

function createSlideshowDocumentJSON({
  regionId,
  surfaceId,
  text,
}: {
  regionId: string;
  surfaceId: string;
  text: string;
}): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected slide content surface to include its main region.");

  region.attrs = { ...region.attrs, id: regionId };
  region.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ];

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
        },
        content: [surface],
      },
    ],
  };
}

function findParagraphTextPosition(editor: Editor, text: string): number {
  let textPosition: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return true;
    if (!node.textContent.includes(text)) return true;

    textPosition = pos + 1;
    return false;
  });

  if (textPosition === null) {
    throw new Error(`Expected paragraph containing "${text}".`);
  }

  return textPosition;
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

  if (found === null) throw new Error(`Expected ${type}${id ? `:${id}` : ""}.`);
  return found;
}

function mockFloatingControlRect(
  element: Element | null,
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
): void {
  if (!element) throw new Error("Expected element for floating control rect.");

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      DOMRect.fromRect({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      }),
  });
}

async function waitUntil<T>(assertion: () => T, timeoutMs = 1000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Timed out waiting for condition.");
}
