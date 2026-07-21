// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { CourseDocumentRuntimeRenderer } from "./CourseDocumentRuntimeRenderer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function slideshowDocumentContent(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "slide-1",
  });
  const courseDocument = content.content?.[0];

  if (!courseDocument) {
    throw new Error("runtime renderer test document is missing courseDocument");
  }

  courseDocument.attrs = {
    ...courseDocument.attrs,
    mode: "slideshow",
  };
  courseDocument.content = [
    {
      type: "surface",
      attrs: { id: "slide-1", variant: "slide-cover" },
      content: [paragraph("First slide content")],
    },
    {
      type: "surface",
      attrs: { id: "slide-2", variant: "slide-cover" },
      content: [paragraph("Second slide content")],
    },
    {
      type: "surface",
      attrs: { id: "slide-3", variant: "slide-cover" },
      content: [paragraph("Third slide content")],
    },
  ];

  return content;
}

function pageDocumentContent(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-page",
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("runtime renderer test page is missing its surface");
  }

  surface.content = [paragraph("Page content")];

  return content;
}

function surfaceById(surfaceId: string): HTMLElement {
  const surface = document.body.querySelector(`[data-surface-id="${surfaceId}"]`);

  if (!(surface instanceof HTMLElement)) {
    throw new Error(`surface ${surfaceId} was not rendered`);
  }

  return surface;
}

describe("CourseDocumentRuntimeRenderer", () => {
  it("marks the visible surface and hides inactive surfaces", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={slideshowDocumentContent()}
        visibleSurfaceId="slide-2"
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const inactiveSurface = surfaceById("slide-1");
    const activeSurface = surfaceById("slide-2");

    expect(activeSurface.getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(activeSurface.hasAttribute("data-runtime-surface-hidden")).toBe(false);
    expect(activeSurface.hasAttribute("hidden")).toBe(false);
    expect(activeSurface.getAttribute("aria-hidden")).toBeNull();

    expect(inactiveSurface.getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(inactiveSurface.hasAttribute("hidden")).toBe(true);
    expect(inactiveSurface.getAttribute("aria-hidden")).toBe("true");
    expect(inactiveSurface.hasAttribute("data-runtime-surface-visible")).toBe(false);
  });

  it("marks runtime surface states and hides non-current surfaces", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={slideshowDocumentContent()}
        surfaceStates={{
          "slide-1": "previous",
          "slide-2": "current",
          "slide-3": "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const previousSurface = surfaceById("slide-1");
    const currentSurface = surfaceById("slide-2");
    const nextSurface = surfaceById("slide-3");

    expect(previousSurface.getAttribute("data-runtime-surface-state")).toBe("previous");
    expect(previousSurface.getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(previousSurface.getAttribute("aria-hidden")).toBe("true");
    expect(previousSurface.hasAttribute("hidden")).toBe(true);

    expect(currentSurface.getAttribute("data-runtime-surface-state")).toBe("current");
    expect(currentSurface.getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(currentSurface.hasAttribute("data-runtime-surface-hidden")).toBe(false);
    expect(currentSurface.hasAttribute("hidden")).toBe(false);
    expect(currentSurface.getAttribute("aria-hidden")).toBeNull();

    expect(nextSurface.getAttribute("data-runtime-surface-state")).toBe("next");
    expect(nextSurface.getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(nextSurface.getAttribute("aria-hidden")).toBe("true");
    expect(nextSurface.hasAttribute("hidden")).toBe(true);
  });

  it("updates visible surface markers without mutating document JSON", async () => {
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((readyEditor: TiptapEditor) => {
      readyEditors.push(readyEditor);
    });
    const initialContent = slideshowDocumentContent();
    const { rerender } = render(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={initialContent}
        visibleSurfaceId="slide-1"
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = readyEditors[0];
    if (!editor) {
      throw new Error("runtime renderer did not provide an editor");
    }
    const beforeVisibilityChange = editor.getJSON();

    rerender(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={initialContent}
        visibleSurfaceId="slide-2"
        onReady={onReady}
      />,
    );

    await waitFor(() =>
      expect(surfaceById("slide-2").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );

    expect(editor.getJSON()).toEqual(beforeVisibilityChange);
  });

  it("updates runtime surface state markers without mutating document JSON", async () => {
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((readyEditor: TiptapEditor) => {
      readyEditors.push(readyEditor);
    });
    const initialContent = slideshowDocumentContent();
    const { rerender } = render(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={initialContent}
        surfaceStates={{
          "slide-1": "current",
          "slide-2": "next",
          "slide-3": "hidden",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = readyEditors[0];
    if (!editor) {
      throw new Error("runtime renderer did not provide an editor");
    }
    const beforeStateChange = editor.getJSON();

    rerender(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={initialContent}
        surfaceStates={{
          "slide-1": "previous",
          "slide-2": "current",
          "slide-3": "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() =>
      expect(surfaceById("slide-2").getAttribute("data-runtime-surface-state")).toBe("current"),
    );

    expect(editor.getJSON()).toEqual(beforeStateChange);
  });

  it("preserves page rendering when no visible surface id is supplied", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-renderer"
        initialContent={pageDocumentContent()}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const surface = surfaceById("surface-page");

    expect(surface.hasAttribute("data-runtime-surface-hidden")).toBe(false);
    expect(surface.hasAttribute("data-runtime-surface-visible")).toBe(false);
    expect(surface.hasAttribute("hidden")).toBe(false);
    expect(surface.getAttribute("aria-hidden")).toBeNull();
  });

  it("renders v2 Gallery captions without authoring or settings chrome", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        artifactId="artifact-gallery"
        initialContent={galleryDocumentContent()}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(screen.getByText("Shared runtime caption")).toBeInTheDocument();
    expect(screen.queryByText("First runtime item caption")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove image/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open block settings" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open First runtime image fullscreen" }));
    const dialog = await screen.findByRole("dialog", { name: "Gallery viewer" });
    expect(within(dialog).getByText("First runtime item caption").tagName).toBe("STRONG");
  });

  it("renders persisted semantic alignment without authoring chrome", async () => {
    const initialContent = alignmentParityDocumentContent();
    const onRuntimeReady = vi.fn();

    const view = render(
      <div data-testid="alignment-runtime">
        <CourseDocumentRuntimeRenderer
          artifactId="artifact-alignment"
          initialContent={initialContent}
          onReady={onRuntimeReady}
        />
      </div>,
    );

    await waitFor(() => expect(onRuntimeReady).toHaveBeenCalledTimes(1));

    const runtime = view.getByTestId("alignment-runtime");
    const runtimeRegion = requiredElement(runtime, '[data-vertical-content-position="bottom"]');
    const runtimeText = requiredElement(runtime, '[data-text-align="right"]');
    const runtimeFrame = requiredElement(
      runtime,
      '[data-runtime-frame="block"][data-id="callout-alignment"]',
    );

    expect(runtimeRegion.getAttribute("data-vertical-content-position")).toBe("bottom");
    expect(runtimeText.getAttribute("data-text-align")).toBe("right");
    expect(runtimeFrame.style.width).toBe("60%");
    expect(runtimeFrame.style.marginLeft).toBe("auto");
    expect(runtimeFrame.style.marginRight).toBe("auto");
    expect(runtime.querySelector("[data-authoring-frame]")).toBeNull();
    expect(runtime.querySelector("[data-authoring-chrome]")).toBeNull();
    expect(runtime.querySelector('[contenteditable="true"]')).toBeNull();
  });
});

function alignmentParityDocumentContent(): JSONContent {
  const item = builtInInsertCatalog.getById("callout");
  if (!item) throw new Error("Callout catalog item is not registered");
  const callout = item.content() as JSONContent;

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-alignment", variant: "page-default" },
            content: [
              {
                type: "region",
                attrs: { id: "region-alignment", verticalPosition: "bottom" },
                content: [
                  paragraphWithAlignment("Aligned text", "right"),
                  {
                    ...callout,
                    attrs: {
                      ...callout.attrs,
                      id: "callout-alignment",
                      frame: { align: "center", widthMode: "percent", widthPercent: 60 },
                    },
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

function galleryDocumentContent(): JSONContent {
  const content = pageDocumentContent();
  const surface = content.content?.[0]?.content?.[0];
  if (!surface) throw new Error("Gallery runtime fixture is missing its surface");

  surface.content = [
    {
      type: "gallery",
      attrs: {
        id: "gallery-runtime",
        data: {
          type: "gallery",
          layout: "carousel",
          caption: richTextDocument("Shared runtime caption"),
        },
      },
      content: [
        {
          type: "gallery_item",
          attrs: {
            id: "gallery-runtime-item-1",
            data: {
              image: {
                mode: "external",
                src: "https://example.com/runtime-first.jpg",
                alt: "First runtime image",
              },
              caption: richTextDocument("First runtime item caption", [{ type: "bold" }]),
            },
          },
        },
      ],
    },
  ];

  return content;
}

function richTextDocument(text: string, marks?: JSONContent["marks"]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
      },
    ],
  };
}

function paragraphWithAlignment(text: string, textAlign: "left" | "center" | "right") {
  return {
    type: "paragraph",
    attrs: { textAlign },
    content: [{ type: "text", text }],
  } satisfies JSONContent;
}

function requiredElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing element ${selector}`);
  return element;
}
