// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";

import { createElementFloatingAnchor } from "./floating-anchor";
import { EditorFloatingContent } from "./EditorFloatingContent";
import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  EditorFloatingLayer,
  resolveEditorFloatingLayerRoot,
  subscribeEditorFloatingLayerRoot,
  type EditorFloatingLayerEditor,
} from "./EditorFloatingLayer";

const floatingPositionHookMock = vi.hoisted(() => ({
  applyDefaultPosition: (input: { floatingElement: HTMLElement | null }) => {
    if (!input.floatingElement) return;
    input.floatingElement.style.left = "32px";
    input.floatingElement.style.position = "absolute";
    input.floatingElement.style.top = "48px";
    input.floatingElement.style.visibility = "visible";
  },
  useEditorFloatingPosition: vi.fn(),
}));

vi.mock("./useEditorFloatingPosition", () => floatingPositionHookMock);

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  floatingPositionHookMock.useEditorFloatingPosition.mockReset();
  floatingPositionHookMock.useEditorFloatingPosition.mockImplementation(
    floatingPositionHookMock.applyDefaultPosition,
  );
});

describe("EditorFloatingLayer", () => {
  beforeEach(() => {
    floatingPositionHookMock.useEditorFloatingPosition.mockImplementation(
      floatingPositionHookMock.applyDefaultPosition,
    );
  });

  it("renders a portal root for one editor instance", async () => {
    const editor = createEditor();

    render(
      <EditorFloatingLayer editor={editor}>
        <div>editor child</div>
      </EditorFloatingLayer>,
    );

    await waitFor(() =>
      expect(editor.view.dom.ownerDocument.body.querySelector(layerSelector)).not.toBeNull(),
    );
    expect(screen.getByText("editor child").textContent).toBe("editor child");
  });

  it("renders floating content into the layer root", async () => {
    const editor = createEditor();
    const { anchor, visibilityRoot } = createVisibleAnchor();

    render(
      <EditorFloatingLayer editor={editor}>
        <EditorFloatingContent
          anchor={createElementFloatingAnchor(anchor, { root: visibilityRoot })}
          open
        >
          Floating content
        </EditorFloatingContent>
      </EditorFloatingLayer>,
    );

    await waitFor(() => expect(screen.queryByText("Floating content")).not.toBeNull());
    const layerRoot = editor.view.dom.ownerDocument.body.querySelector(layerSelector);
    expect(screen.getByText("Floating content").parentElement).toBe(layerRoot);
  });

  it("registers a named layer root for one editor instance", async () => {
    const firstEditor = createEditor();
    const secondEditor = createEditor();
    const { unmount } = render(
      <EditorFloatingLayer editor={firstEditor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
        <div>first editor child</div>
      </EditorFloatingLayer>,
    );

    const layerRoot = await waitUntilLayerRegistered(firstEditor);

    expect(layerRoot.getAttribute("data-scaffold-editor-floating-layer-kind")).toBe(
      AUTHORING_EDITOR_FLOATING_LAYER_KIND,
    );
    expect(resolveEditorFloatingLayerRoot(firstEditor, AUTHORING_EDITOR_FLOATING_LAYER_KIND)).toBe(
      layerRoot,
    );
    expect(
      resolveEditorFloatingLayerRoot(secondEditor, AUTHORING_EDITOR_FLOATING_LAYER_KIND),
    ).toBeNull();

    unmount();

    await waitFor(() =>
      expect(
        resolveEditorFloatingLayerRoot(firstEditor, AUTHORING_EDITOR_FLOATING_LAYER_KIND),
      ).toBeNull(),
    );
  });

  it("renders and registers the authoring root in the nearest ready overlay boundary", async () => {
    const outerContainer = document.createElement("div");
    const innerContainer = document.createElement("div");
    document.body.append(outerContainer, innerContainer);
    const outerEditor = createEditor();
    const innerEditor = createEditor();

    render(
      <OverlayBoundary container={outerContainer} kind="viewport">
        <EditorFloatingLayer editor={outerEditor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>outer editor child</div>
        </EditorFloatingLayer>
        <OverlayBoundary container={innerContainer} kind="viewport">
          <EditorFloatingLayer editor={innerEditor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
            <div>inner editor child</div>
          </EditorFloatingLayer>
        </OverlayBoundary>
      </OverlayBoundary>,
    );

    const outerRoot = await waitUntilLayerRegistered(outerEditor);
    const innerRoot = await waitUntilLayerRegistered(innerEditor);
    const outerHost = outerContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    const innerHost = innerContainer.querySelector(":scope > [data-scaffold-overlay-host]");

    expect(outerHost).not.toBeNull();
    expect(innerHost).not.toBeNull();
    expect(outerRoot.parentElement).toBe(outerHost);
    expect(innerRoot.parentElement).toBe(innerHost);
    expect(resolveEditorFloatingLayerRoot(outerEditor, AUTHORING_EDITOR_FLOATING_LAYER_KIND)).toBe(
      outerRoot,
    );
    expect(resolveEditorFloatingLayerRoot(innerEditor, AUTHORING_EDITOR_FLOATING_LAYER_KIND)).toBe(
      innerRoot,
    );
  });

  it("suppresses rendering and registration while the scoped host is pending", async () => {
    const editor = createEditor();
    const readyContainer = document.createElement("div");
    document.body.append(readyContainer);
    const { rerender } = render(
      <OverlayBoundary container={null} kind="viewport">
        <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>pending editor child</div>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );

    expect(screen.queryByText("pending editor child")).toBeNull();
    expect(document.body.querySelector(layerSelector)).toBeNull();
    expect(resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND)).toBeNull();

    rerender(
      <OverlayBoundary container={readyContainer} kind="viewport">
        <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>pending editor child</div>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );

    expect(await screen.findByText("pending editor child")).not.toBeNull();
    const readyHost = readyContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(readyHost).not.toBeNull();
    expect((await waitUntilLayerRegistered(editor)).parentElement).toBe(readyHost);
  });

  it("moves one registered root when the scoped host changes and cleans it up", async () => {
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    document.body.append(firstContainer, secondContainer);
    const editor = createEditor();
    const { rerender, unmount } = render(
      <OverlayBoundary container={firstContainer} kind="viewport">
        <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>editor child</div>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );

    const firstRoot = await waitUntilLayerRegistered(editor);
    const firstHost = firstContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(firstHost).not.toBeNull();
    expect(firstRoot.parentElement).toBe(firstHost);

    rerender(
      <OverlayBoundary container={secondContainer} kind="viewport">
        <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>editor child</div>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );

    const secondHost = secondContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(secondHost).not.toBeNull();
    await waitFor(() => {
      const currentRoot = resolveEditorFloatingLayerRoot(
        editor,
        AUTHORING_EDITOR_FLOATING_LAYER_KIND,
      );
      expect(currentRoot).not.toBe(firstRoot);
      expect(currentRoot?.parentElement).toBe(secondHost);
    });
    expect(firstContainer.querySelectorAll(layerSelector)).toHaveLength(0);
    expect(secondContainer.querySelectorAll(layerSelector)).toHaveLength(1);

    unmount();

    expect(secondContainer.querySelectorAll(layerSelector)).toHaveLength(0);
    expect(resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND)).toBeNull();
  });

  it("publishes pending when the current named root unregisters", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const editor = createEditor();
    const { rerender } = render(
      <OverlayBoundary container={container} kind="viewport">
        <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>editor child</div>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );
    const root = await waitUntilLayerRegistered(editor);
    const listener = vi.fn();
    const unsubscribe = subscribeEditorFloatingLayerRoot(
      editor,
      AUTHORING_EDITOR_FLOATING_LAYER_KIND,
      listener,
    );

    expect(root.isConnected).toBe(true);
    expect(listener).toHaveBeenCalledWith(root);

    rerender(
      <OverlayBoundary container={null} kind="viewport">
        <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
          <div>editor child</div>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );

    await waitFor(() => expect(listener).toHaveBeenLastCalledWith(null));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND)).toBeNull();

    unsubscribe();
  });

  it("uses the editor DOM owner document body when no scope is present", async () => {
    const ownerDocument = document.implementation.createHTMLDocument("editor owner");
    const editor = createEditor(ownerDocument);

    render(
      <EditorFloatingLayer editor={editor} kind={AUTHORING_EDITOR_FLOATING_LAYER_KIND}>
        <div>owner document editor child</div>
      </EditorFloatingLayer>,
    );

    const layerRoot = await waitUntilLayerRegistered(editor);
    expect(layerRoot.ownerDocument).toBe(ownerDocument);
    expect(layerRoot.parentElement).toBe(ownerDocument.body);
    expect(document.body.querySelector(layerSelector)).toBeNull();
  });

  it("does not render inline when no layer root is available", () => {
    const { anchor, visibilityRoot } = createVisibleAnchor();

    render(
      <EditorFloatingContent
        anchor={createElementFloatingAnchor(anchor, { root: visibilityRoot })}
        open
      >
        Missing root content
      </EditorFloatingContent>,
    );

    expect(screen.queryByText("Missing root content")).toBeNull();
  });

  it("keeps live floating content mounted but hidden when no visible position is available", async () => {
    floatingPositionHookMock.useEditorFloatingPosition.mockImplementation(() => {});
    const editor = createEditor();
    const { anchor, visibilityRoot } = createVisibleAnchor({
      anchorRect: new DOMRect(160, 10, 40, 40),
      rootRect: new DOMRect(0, 0, 100, 100),
    });

    render(
      <EditorFloatingLayer editor={editor}>
        <EditorFloatingContent
          anchor={createElementFloatingAnchor(anchor, { root: visibilityRoot })}
          open
        >
          Temporarily hidden content
        </EditorFloatingContent>
      </EditorFloatingLayer>,
    );

    await waitFor(() => expect(screen.queryByText("Temporarily hidden content")).not.toBeNull());
    const content = screen.getByText("Temporarily hidden content");
    expect(content.style.position).toBe("absolute");
    expect(content.style.visibility).toBe("hidden");
    expect(floatingPositionHookMock.useEditorFloatingPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true }),
    );
  });

  it("applies the hook position style to floating content", async () => {
    const editor = createEditor();
    const { anchor, visibilityRoot } = createVisibleAnchor();

    render(
      <EditorFloatingLayer editor={editor}>
        <EditorFloatingContent
          anchor={createElementFloatingAnchor(anchor, { root: visibilityRoot })}
          className="custom-content"
          open
          style={{ minWidth: 120 }}
        >
          Styled content
        </EditorFloatingContent>
      </EditorFloatingLayer>,
    );

    await waitFor(() => expect(screen.queryByText("Styled content")).not.toBeNull());
    const content = screen.getByText("Styled content");

    expect(content?.className).toContain("sc-editor-floating-content");
    expect(content?.className).toContain("custom-content");
    expect(content?.style.position).toBe("absolute");
    expect(content?.style.left).toBe("32px");
    expect(content?.style.top).toBe("48px");
    expect(content?.style.minWidth).toBe("120px");
  });
});

const layerSelector = "[data-scaffold-editor-floating-layer]";

function createEditor(ownerDocument: Document = document): EditorFloatingLayerEditor {
  const dom = ownerDocument.createElement("div");
  ownerDocument.body.append(dom);
  return { view: { dom } };
}

async function waitUntilLayerRegistered(editor: EditorFloatingLayerEditor): Promise<HTMLElement> {
  let root: HTMLElement | null = null;
  await waitFor(() => {
    root = resolveEditorFloatingLayerRoot(editor, AUTHORING_EDITOR_FLOATING_LAYER_KIND);
    expect(root).not.toBeNull();
  });
  if (!root) throw new Error("Expected editor floating layer root to be registered.");
  return root;
}

function createVisibleAnchor({
  anchorRect = new DOMRect(20, 10, 50, 30),
  rootRect = new DOMRect(0, 0, 400, 300),
}: {
  anchorRect?: DOMRect;
  rootRect?: DOMRect;
} = {}) {
  const visibilityRoot = document.createElement("div");
  const anchor = document.createElement("button");
  visibilityRoot.append(anchor);
  document.body.append(visibilityRoot);

  mockRect(visibilityRoot, rootRect);
  mockRect(anchor, anchorRect);

  return { anchor, visibilityRoot };
}

function mockRect(element: Element, value: DOMRectReadOnly): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}
