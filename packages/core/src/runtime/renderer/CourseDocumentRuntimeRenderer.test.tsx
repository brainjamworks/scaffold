// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Extension, Node, type Editor as TiptapEditor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type BlockCapability,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { calloutBlockDefinition } from "@/editor/blocks/presentation/callout/callout-definition";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { SurfaceAuthoringViewProps } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import type { SurfaceRuntimeViewProps } from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { SurfaceRuntimeFrame } from "@/editor/surfaces/runtime/views/SurfaceRuntimeFrame";
import { createScaffoldDefaultTheme } from "@/theme/model";

import { CourseDocumentRuntimeRenderer } from "./CourseDocumentRuntimeRenderer";

const runtimeComposition = createCoreScaffoldRuntimeComposition();

const calloutInsertCatalog = createInsertCatalog(
  createBlockInsertActions([calloutBlockDefinition]),
);

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
    surfaceId: "slide_000001",
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
      attrs: { id: "slide_000001", variant: "slide-cover" },
      content: [paragraph("First slide content")],
    },
    {
      type: "surface",
      attrs: { id: "slide_000002", variant: "slide-cover" },
      content: [paragraph("Second slide content")],
    },
    {
      type: "surface",
      attrs: { id: "slide_000003", variant: "slide-cover" },
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

function tabsDocumentContent(): JSONContent {
  const content = pageDocumentContent();
  const surface = content.content?.[0]?.content?.[0];

  if (!surface) {
    throw new Error("runtime renderer tabs fixture is missing its surface");
  }

  surface.content = [
    {
      type: "layout",
      attrs: {
        id: "shared-layout",
        variant: "tabs",
        options: { label: "Topics", variant: "default" },
      },
      content: [
        {
          type: "section",
          attrs: { id: "first-topic", role: "tab-panel", verticalPosition: "top" },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "First topic resource",
                  marks: [{ type: "link", attrs: { href: "https://example.com/first-topic" } }],
                },
              ],
            },
          ],
        },
        {
          type: "section",
          attrs: { id: "second-topic", role: "tab-panel", verticalPosition: "top" },
          content: [paragraph("Second topic")],
        },
      ],
    },
  ];

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
  it("publishes named read-only document semantics without flattening nested controls", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-accessibility"
        initialContent={tabsDocumentContent()}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const runtimeDocument = screen.getByRole("document", { name: "Course content" });
    expect(runtimeDocument).toHaveAttribute("contenteditable", "false");
    expect(screen.queryByRole("textbox")).toBeNull();

    const link = screen.getByRole("link", { name: "First topic resource" });
    link.focus();
    expect(document.activeElement).toBe(link);

    const tabs = screen.getAllByRole("tab");
    tabs[1]!.focus();
    await user.keyboard("{Enter}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("starts a fresh editor when runtime composition identity changes", async () => {
    const surfaceVariant = "private-identity-surface";
    const firstBlock = privateRuntimeBlockCapability("first_private_runtime_block");
    const secondBlock = privateRuntimeBlockCapability("second_private_runtime_block");
    const firstComposition = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "first-private-runtime-identity",
          blocks: [firstBlock],
          surfaces: [privateRuntimeSurfaceCapability(surfaceVariant, "first")],
        }),
      ],
    }).runtime;
    const secondComposition = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "second-private-runtime-identity",
          blocks: [secondBlock],
          surfaces: [privateRuntimeSurfaceCapability(surfaceVariant, "second")],
        }),
      ],
    }).runtime;
    const initialContent = privateSurfaceDocumentContent(surfaceVariant);
    const readyEditors: TiptapEditor[] = [];
    const onReady = vi.fn((editor: TiptapEditor) => readyEditors.push(editor));
    const { rerender } = render(
      <CourseDocumentRuntimeRenderer
        composition={firstComposition}
        initialContent={initialContent}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(getScaffoldCapabilitiesForEditor(readyEditors[0]!)).toBe(firstComposition.capabilities);
    expect(readyEditors[0]?.schema.nodes[firstBlock.definition.nodeType]).toBeDefined();
    expect(readyEditors[0]?.schema.nodes[secondBlock.definition.nodeType]).toBeUndefined();
    expect(document.body.querySelector('[data-private-runtime-view="first"]')).not.toBeNull();

    rerender(
      <CourseDocumentRuntimeRenderer
        composition={firstComposition}
        initialContent={initialContent}
        onReady={onReady}
      />,
    );
    expect(onReady).toHaveBeenCalledTimes(1);

    rerender(
      <CourseDocumentRuntimeRenderer
        composition={secondComposition}
        initialContent={initialContent}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    expect(readyEditors[1]).not.toBe(readyEditors[0]);
    expect(readyEditors[0]?.isDestroyed).toBe(true);
    expect(getScaffoldCapabilitiesForEditor(readyEditors[1]!)).toBe(secondComposition.capabilities);
    expect(readyEditors[1]?.schema.nodes[secondBlock.definition.nodeType]).toBeDefined();
    expect(readyEditors[1]?.schema.nodes[firstBlock.definition.nodeType]).toBeUndefined();
    expect(readyEditors[1]?.state).not.toBe(readyEditors[0]?.state);
    expect(document.body.querySelector('[data-private-runtime-view="second"]')).not.toBeNull();
    expect(document.body.querySelector('[data-private-runtime-view="first"]')).toBeNull();
  });

  it("marks the visible surface and hides inactive surfaces", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={slideshowDocumentContent()}
        visibleSurfaceId="slide_000002"
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const inactiveSurface = surfaceById("slide_000001");
    const activeSurface = surfaceById("slide_000002");

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
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={slideshowDocumentContent()}
        surfaceStates={{
          slide_000001: "previous",
          slide_000002: "current",
          slide_000003: "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const previousSurface = surfaceById("slide_000001");
    const currentSurface = surfaceById("slide_000002");
    const nextSurface = surfaceById("slide_000003");

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
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        visibleSurfaceId="slide_000001"
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
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        visibleSurfaceId="slide_000002"
        onReady={onReady}
      />,
    );

    await waitFor(() =>
      expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-visible")).toBe("true"),
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
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        surfaceStates={{
          slide_000001: "current",
          slide_000002: "next",
          slide_000003: "hidden",
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
        composition={runtimeComposition}
        artifactId="artifact-renderer"
        initialContent={initialContent}
        surfaceStates={{
          slide_000001: "previous",
          slide_000002: "current",
          slide_000003: "next",
        }}
        onReady={onReady}
      />,
    );

    await waitFor(() =>
      expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-state")).toBe(
        "current",
      ),
    );

    expect(editor.getJSON()).toEqual(beforeStateChange);
  });

  it("preserves page rendering when no visible surface id is supplied", async () => {
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
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

  it("keeps layout interaction state isolated between mounted runtime sessions", async () => {
    const user = userEvent.setup();
    const onFirstReady = vi.fn();
    const onSecondReady = vi.fn();
    const content = tabsDocumentContent();

    render(
      <div>
        <div data-testid="first-runtime">
          <CourseDocumentRuntimeRenderer
            composition={runtimeComposition}
            artifactId="first-artifact"
            initialContent={content}
            onReady={onFirstReady}
          />
        </div>
        <div data-testid="second-runtime">
          <CourseDocumentRuntimeRenderer
            composition={runtimeComposition}
            artifactId="second-artifact"
            initialContent={content}
            onReady={onSecondReady}
          />
        </div>
      </div>,
    );

    await waitFor(() => {
      expect(onFirstReady).toHaveBeenCalledTimes(1);
      expect(onSecondReady).toHaveBeenCalledTimes(1);
    });

    const firstRuntime = within(screen.getByTestId("first-runtime"));
    const secondRuntime = within(screen.getByTestId("second-runtime"));
    const firstTabs = firstRuntime.getAllByRole("tab");
    const secondTabs = secondRuntime.getAllByRole("tab");

    expect(firstTabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(secondTabs[0]?.getAttribute("aria-selected")).toBe("true");

    await user.click(firstTabs[1]!);

    await waitFor(() => {
      expect(firstTabs[1]?.getAttribute("aria-selected")).toBe("true");
    });
    expect(secondTabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(secondTabs[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("renders v2 Gallery captions without authoring or settings chrome", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();

    render(
      <CourseDocumentRuntimeRenderer
        composition={runtimeComposition}
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
          composition={runtimeComposition}
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
  const item = calloutInsertCatalog.getById("callout");
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
          theme: createScaffoldDefaultTheme(),
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

function privateRuntimeBlockCapability(nodeType: string): BlockCapability {
  return {
    definition: { nodeType },
    authoringExtension: Extension.create({
      name: `${nodeType}_authoring_bundle`,
      addExtensions: () => [Node.create({ name: nodeType, group: "block", atom: true })],
    }),
    runtimeExtension: Extension.create({
      name: `${nodeType}_runtime_bundle`,
      addExtensions: () => [Node.create({ name: nodeType, group: "block", atom: true })],
    }),
  };
}

function privateRuntimeSurfaceCapability(id: string, viewId: string): SurfaceCapability {
  const RuntimeView = (props: SurfaceRuntimeViewProps) => (
    <SurfaceRuntimeFrame {...props} attributes={{ "data-private-runtime-view": viewId }} />
  );

  return {
    definition: {
      id,
      modes: ["page"],
      title: `Private ${viewId} Surface`,
      description: "Private Surface used to verify runtime view isolation",
      structurePolicy: {
        fixedChildren: [{ type: "paragraph" }],
        allowRootInsertion: true,
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [paragraph("Private composition identity")],
      }),
    },
    authoringView: { variantId: id, component: PrivateIdentitySurfaceAuthoringView },
    runtimeView: { variantId: id, component: RuntimeView },
  };
}

function PrivateIdentitySurfaceAuthoringView(_props: SurfaceAuthoringViewProps) {
  return null;
}

function privateSurfaceDocumentContent(variant: string): JSONContent {
  const content = pageDocumentContent();
  content.content![0]!.content = [
    {
      type: "surface",
      attrs: { id: "private-identity-surface-instance", variant, settings: {} },
      content: [paragraph("Private composition identity")],
    },
  ];
  return content;
}
