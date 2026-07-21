// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, it, expect, vi } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import {
  AUTHORING_FRAME_ATTR,
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { createDisposableEditor, describeBlockContract } from "@/editor/testing";
import {
  removeDirectChildSettingsItemChecked,
  updateDirectChildSettingsItemChecked,
} from "@/document/model/commands/content-collections";
import { ConfigurationSettingsSheet } from "@/editor/shell/settings/sheets/ConfigurationSettingsSheet";
import { EmptyScaffoldRichTextDocument } from "@/schemas/rich-text";

import "./gallery-definition";
import { GalleryAuthoringExtension } from "./gallery-authoring-extension";
import { GALLERY_NODE, emptyGalleryData } from "./content";
import { galleryDefinition, galleryItemsCollection } from "./gallery-definition";
import {
  useResolvedGalleryItems,
  type GalleryRawItem,
  type GalleryResolvedItem,
} from "./GalleryModel";
import { GalleryCarousel, GalleryGrid } from "./GallerySurface";
import { GalleryNode } from "./node";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function galleryFixture() {
  return {
    type: "gallery",
    attrs: {
      id: "block-gallery-proof",
      data: emptyGalleryData({
        caption: richText("Shared gallery caption", [{ type: "italic" }]),
      }),
    },
    content: [
      {
        type: "gallery_item",
        attrs: {
          id: "gallery-image-1",
          data: {
            image: {
              mode: "external",
              src: "https://example.com/image-1.jpg",
              alt: "First image",
            },
            caption: richText("First caption", [{ type: "bold" }]),
          },
        },
      },
      {
        type: "gallery_item",
        attrs: {
          id: "gallery-image-2",
          data: {
            image: {
              mode: "external",
              src: "https://example.com/image-2.jpg",
              alt: "Second image",
            },
            caption: richText("Second caption"),
          },
        },
      },
    ],
  };
}

function richText(text: string, marks?: JSONContent["marks"]): JSONContent & { type: "doc" } {
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

function galleryItemIds(editor: Editor): string[] {
  const gallery = editor.state.doc.firstChild;
  const ids: string[] = [];
  gallery?.forEach((child) => {
    if (child.type.name === "gallery_item") {
      ids.push(String(child.attrs["id"]));
    }
  });
  return ids;
}

function renderGalleryEditor(content: JSONContent = galleryFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([GALLERY_NODE]),
      GalleryAuthoringExtension,
    ],
    content: {
      type: "doc",
      content: [content],
    },
  });
  const { editor } = fixture;

  render(createElement(EditorContent, { editor }));

  return editor;
}

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "gallery",
  catalogId: "gallery",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

it("registers gallery as an atomic block", () => {
  expect((GalleryNode.config as { atom?: boolean }).atom).toBe(true);
  expect(galleryDefinition.boundedPlacement).toBe("fill");
});

it("resolves selected gallery blocks to their declared visual surface", async () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([GALLERY_NODE]),
      GalleryAuthoringExtension,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "gallery",
          attrs: {
            id: "block-gallery-proof",
            data: emptyGalleryData(),
          },
        },
      ],
    },
  });

  render(createElement(EditorContent, { editor }));

  await waitFor(() => {
    expect(
      document.body.querySelector(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-gallery-proof"]`,
      ),
    ).toBeInstanceOf(HTMLElement);
  });

  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));

  const selectionOwner = publishInteractionOwnerSnapshot(editor.state, null, {
    blockDefinitions: builtInBlockRegistry,
  }).owners.selectionOwner.target;
  const ownerDescriptor = resolveBlockChromeTargetDescriptor(
    editor.state,
    selectionOwner,
    builtInBlockRegistry,
  );
  expect(ownerDescriptor?.nodeType).toBe("gallery");
  expect(ownerDescriptor?.blockId).toBe("block-gallery-proof");

  const surface = resolveAuthoringFrameElement(document.body, {
    frameKind: AuthoringFrameKind.Block,
    id: "block-gallery-proof",
  });
  expect(surface?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("block");
  expect(surface?.getAttribute("data-node")).toBe("gallery");
  expect(surface?.getAttribute("data-definition")).toBe("gallery");
  expect(surface?.getAttribute("data-id")).toBe("block-gallery-proof");

  editor.destroy();
});

it("renders the pilot block surface without legacy authoring attrs", async () => {
  const editor = renderGalleryEditor({
    type: "gallery",
    attrs: {
      id: "block-gallery-proof",
      data: emptyGalleryData(),
    },
  });

  const surface = await waitFor(() => {
    const element = document.body.querySelector<HTMLElement>(
      `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-gallery-proof"]`,
    );
    expect(element).toBeInstanceOf(HTMLElement);
    if (!(element instanceof HTMLElement)) {
      throw new Error("Expected gallery authoring frame");
    }
    return element;
  });

  expect(surface?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("block");
  expect(surface?.getAttribute("data-node")).toBe("gallery");
  expect(surface?.getAttribute("data-definition")).toBe("gallery");

  editor.destroy();
});

it("selects gallery from passive surface clicks through the shared surface activator", async () => {
  const editor = renderGalleryEditor();

  await waitFor(() => {
    expect(
      document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-gallery-proof"]`,
      ),
    ).toBeInstanceOf(HTMLElement);
  });
  const surface = document.body.querySelector<HTMLElement>(
    `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-gallery-proof"]`,
  );
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected gallery authoring frame");
  }

  fireEvent.mouseDown(surface);

  await waitFor(() => {
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(0);
  });

  editor.destroy();
});

it("labels carousel thumbnail tabs and preserves selected state", async () => {
  const editor = renderGalleryEditor();

  const firstTab = await screen.findByRole("tab", { name: "Image 1" });
  const secondTab = screen.getByRole("tab", { name: "Image 2" });

  expect(firstTab.getAttribute("aria-selected")).toBe("true");
  expect(secondTab.getAttribute("aria-selected")).toBe("false");

  fireEvent.click(secondTab);

  expect(firstTab.getAttribute("aria-selected")).toBe("false");
  expect(secondTab.getAttribute("aria-selected")).toBe("true");

  editor.destroy();
});

it("closes the gallery lightbox on Escape", async () => {
  const editor = renderGalleryEditor();

  const opener = await screen.findByRole("button", {
    name: "Open First image fullscreen",
  });
  fireEvent.click(opener);

  const dialog = await screen.findByRole("dialog", { name: "Gallery viewer" });
  fireEvent.keyDown(dialog, { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Gallery viewer" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  editor.destroy();
});

it("labels gallery lightbox navigation and announces image position", async () => {
  const editor = renderGalleryEditor();

  fireEvent.click(
    await screen.findByRole("button", {
      name: "Open First image fullscreen",
    }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Gallery viewer" });
  const caption = within(dialog).getByText("First caption");
  const status = screen.getByRole("status", { name: "Image 1 of 2" });

  expect(screen.getByRole("button", { name: "Previous image" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next image" })).toBeInTheDocument();
  expect(dialog.getAttribute("aria-describedby")).toContain(caption.id);
  expect(status.id).toMatch(/\S/);
  expect(within(dialog).getByText("First caption").tagName).toBe("STRONG");

  fireEvent.click(screen.getByRole("button", { name: "Next image" }));

  await waitFor(() => {
    expect(screen.getByRole("status", { name: "Image 2 of 2" })).toBeInTheDocument();
    expect(within(dialog).getByText("Second caption")).toBeInTheDocument();
  });

  editor.destroy();
});

it("renders one shared rich caption below the composition and no item caption in normal flow", async () => {
  const editor = renderGalleryEditor();

  const sharedCaption = await screen.findByText("Shared gallery caption");

  expect(sharedCaption.tagName).toBe("EM");
  expect(screen.queryByText("First caption")).toBeNull();
  expect(screen.queryByText("Second caption")).toBeNull();

  editor.destroy();
});

it("keeps carousel missing, loading, and error image states semantic", () => {
  const missingItem: GalleryResolvedItem = {
    key: "missing",
    alt: "",
    caption: EmptyScaffoldRichTextDocument,
    url: null,
    loading: false,
    error: null,
  };
  const loadingItem: GalleryResolvedItem = {
    ...missingItem,
    key: "loading",
    loading: true,
  };
  const errorItem: GalleryResolvedItem = {
    ...missingItem,
    key: "error",
    error: "Image unavailable",
  };

  const { rerender } = render(
    createElement(GalleryCarousel, {
      items: [missingItem],
      activeIndex: 0,
      activeItem: missingItem,
      onSelect: () => undefined,
      onOpenLightbox: () => undefined,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("No image");
  expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();

  rerender(
    createElement(GalleryCarousel, {
      items: [loadingItem],
      activeIndex: 0,
      activeItem: loadingItem,
      onSelect: () => undefined,
      onOpenLightbox: () => undefined,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("Loading image...");

  rerender(
    createElement(GalleryCarousel, {
      items: [errorItem],
      activeIndex: 0,
      activeItem: errorItem,
      onSelect: () => undefined,
      onOpenLightbox: () => undefined,
    }),
  );

  expect(screen.getByRole("alert").textContent).toBe("Image unavailable");
});

it("keeps unresolved grid images passive and semantic", () => {
  const missingItem: GalleryResolvedItem = {
    key: "missing",
    alt: "",
    caption: EmptyScaffoldRichTextDocument,
    url: null,
    loading: false,
    error: null,
  };
  const errorItem: GalleryResolvedItem = {
    key: "error",
    alt: "Broken image",
    caption: richText("Broken caption"),
    url: null,
    loading: false,
    error: "Image unavailable",
  };

  render(
    createElement(GalleryGrid, {
      items: [missingItem, errorItem],
      onTileClick: () => undefined,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("No image");
  expect(screen.getByRole("alert").textContent).toBe("Image unavailable");
  expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();
  expect(screen.queryByText("Broken caption")).toBeNull();
});

it("overlays derived references on populated grid image buttons", () => {
  const first: GalleryResolvedItem = {
    key: "first",
    alt: "First",
    caption: EmptyScaffoldRichTextDocument,
    url: "https://example.com/first.jpg",
    loading: false,
    error: null,
  };
  const missing: GalleryResolvedItem = {
    ...first,
    key: "missing",
    alt: "",
    url: null,
  };

  render(
    createElement(GalleryGrid, {
      items: [first, missing],
      onTileClick: () => undefined,
    }),
  );

  expect(
    screen.getByRole("button", { name: "Open image (a) fullscreen: First" }),
  ).toBeInTheDocument();
  expect(screen.getByText("(a)").getAttribute("aria-hidden")).toBe("true");
  expect(screen.queryByText("(b)")).toBeNull();
});

it("derives bounded tracks from the measured grid viewport and disconnects cleanly", () => {
  let resize: ((width: number, height: number) => void) | null = null;
  const disconnect = vi.fn();

  class TestResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resize = (width, height) => {
        callback(
          [
            {
              contentRect: { width, height },
            } as ResizeObserverEntry,
          ],
          this,
        );
      };
    }

    disconnect = disconnect;
    observe = vi.fn();
    unobserve = vi.fn();
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  const items = Array.from(
    { length: 4 },
    (_, index): GalleryResolvedItem => ({
      key: `item-${index}`,
      alt: `Image ${index + 1}`,
      caption: EmptyScaffoldRichTextDocument,
      url: `https://example.com/${index + 1}.jpg`,
      loading: false,
      error: null,
    }),
  );
  const { container, unmount } = render(
    createElement(
      "div",
      { "data-bounded-placement": "fill" },
      createElement(GalleryGrid, { items, onTileClick: () => undefined }),
    ),
  );
  const grid = container.querySelector<HTMLElement>(".sc-gallery__grid");

  expect(grid).not.toBeNull();
  act(() => resize?.(0, 400));
  expect(grid?.hasAttribute("data-gallery-grid-bounded")).toBe(false);

  act(() => resize?.(800, 400));
  expect(grid?.getAttribute("data-gallery-grid-bounded")).toBe("");
  expect(grid?.getAttribute("data-gallery-grid-layout")).toBe("3x2");
  expect(grid?.style.getPropertyValue("--sc-gallery-grid-columns")).toBe("3");
  expect(grid?.style.getPropertyValue("--sc-gallery-grid-rows")).toBe("2");

  unmount();
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it("does not observe or apply measured tracks outside bounded placement", () => {
  const construct = vi.fn();

  class TestResizeObserver implements ResizeObserver {
    constructor() {
      construct();
    }

    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  const { container } = render(
    createElement(GalleryGrid, {
      items: [
        {
          key: "one",
          alt: "One",
          caption: EmptyScaffoldRichTextDocument,
          url: "https://example.com/one.jpg",
          loading: false,
          error: null,
        },
      ],
      onTileClick: () => undefined,
    }),
  );
  const grid = container.querySelector<HTMLElement>(".sc-gallery__grid");

  expect(construct).not.toHaveBeenCalled();
  expect(grid?.hasAttribute("data-gallery-grid-bounded")).toBe(false);
  expect(grid?.getAttribute("style")).toBeNull();
});

it("derives bounded tracks from the effective narrow-container gap", () => {
  let resize: ((width: number, height: number) => void) | null = null;

  class TestResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resize = (width, height) => {
        callback(
          [
            {
              contentRect: { width, height },
            } as ResizeObserverEntry,
          ],
          this,
        );
      };
    }

    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    columnGap: "8px",
  } as CSSStyleDeclaration);
  const items = Array.from(
    { length: 3 },
    (_, index): GalleryResolvedItem => ({
      key: `item-${index}`,
      alt: `Image ${index + 1}`,
      caption: EmptyScaffoldRichTextDocument,
      url: `https://example.com/${index + 1}.jpg`,
      loading: false,
      error: null,
    }),
  );
  const { container } = render(
    createElement(
      "div",
      { "data-bounded-placement": "fill" },
      createElement(GalleryGrid, { items, onTileClick: () => undefined }),
    ),
  );

  act(() => resize?.(320, 210));

  expect(
    container.querySelector(".sc-gallery__grid")?.getAttribute("data-gallery-grid-layout"),
  ).toBe("3x1");
});

it("labels carousel remove controls and removes the requested image", async () => {
  const editor = renderGalleryEditor();

  expect(await screen.findByRole("tab", { name: "Image 1" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Image 2" })).toBeInTheDocument();
  const dispatch = vi.spyOn(editor.view, "dispatch");

  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));

  await waitFor(() => {
    expect(screen.queryByRole("tab", { name: "Image 2" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Image 1" })).toBeInTheDocument();
  });

  expect(galleryItemIds(editor)).toEqual(["gallery-image-2"]);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  expect(editor.state.selection.from).toBe(0);

  expect(editor.commands.undo()).toBe(true);
  expect(galleryItemIds(editor)).toEqual(["gallery-image-1", "gallery-image-2"]);

  editor.destroy();
});

it("edits the same stable children through generic collection settings", async () => {
  const editor = renderGalleryEditor();

  render(
    createElement(ConfigurationSettingsSheet, {
      editor,
      nodeType: GALLERY_NODE,
      pos: 0,
      targetId: "block-gallery-proof",
      open: true,
      onOpenChange: () => undefined,
    }),
  );

  expect(await screen.findByRole("group", { name: "Image (a)" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Image (b)" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove Image (a)" }));

  await waitFor(() => {
    expect(galleryItemIds(editor)).toEqual(["gallery-image-2"]);
    expect(screen.queryByRole("group", { name: "Image (b)" })).toBeNull();
  });

  fireEvent.click(screen.getByRole("button", { name: "Add image" }));

  await waitFor(() => {
    const ids = galleryItemIds(editor);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("gallery-image-2");
    expect(ids[1]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
  });

  editor.destroy();
});

it("preserves canonical media identity and rejects stale collection writes", () => {
  const editor = renderGalleryEditor();
  const target = {
    ownerId: "block-gallery-proof",
    ownerNodeType: GALLERY_NODE,
    childNodeType: galleryItemsCollection.childNodeType,
    attr: galleryItemsCollection.attr,
    schema: galleryItemsCollection.schema,
  };
  const managedValue = {
    image: { mode: "managed" as const, mediaId: "managed-image-1", alt: "Managed image" },
    caption: richText("Managed caption", [{ type: "italic" }]),
  };
  const updated = updateDirectChildSettingsItemChecked({
    tr: editor.state.tr,
    ...target,
    childId: "gallery-image-1",
    value: managedValue,
  });

  expect(updated.ok).toBe(true);
  if (updated.ok) editor.view.dispatch(updated.tr);
  expect(editor.state.doc.firstChild?.firstChild?.attrs["data"]).toEqual(managedValue);
  expect(galleryItemIds(editor)[0]).toBe("gallery-image-1");

  const before = editor.state.doc;
  const stale = removeDirectChildSettingsItemChecked({
    tr: editor.state.tr,
    ...target,
    childId: "stale-gallery-item",
  });

  expect(stale.ok).toBe(false);
  expect(stale.ok ? null : stale.issue.code).toBe("missing_collection_child");
  expect(editor.state.doc.eq(before)).toBe(true);

  editor.destroy();
});

it("re-resolves managed media when an existing child receives a new media id", async () => {
  const resolve = vi.fn(async (mediaId: string) => `https://cdn.example.com/${mediaId}.jpg`);
  const firstItems: GalleryRawItem[] = [
    {
      id: "stable-item",
      data: {
        image: { mode: "managed" as const, mediaId: "media-one", alt: "Managed" },
        caption: EmptyScaffoldRichTextDocument,
      },
    },
  ];
  const { result, rerender } = renderHook(
    ({ items }) => useResolvedGalleryItems(items, { resolve }),
    { initialProps: { items: firstItems } },
  );

  await waitFor(() => {
    expect(result.current[0]?.url).toBe("https://cdn.example.com/media-one.jpg");
  });

  rerender({
    items: [
      {
        id: "stable-item",
        data: {
          image: { mode: "managed" as const, mediaId: "media-two", alt: "Managed" },
          caption: EmptyScaffoldRichTextDocument,
        },
      },
    ],
  });

  await waitFor(() => {
    expect(result.current[0]?.url).toBe("https://cdn.example.com/media-two.jpg");
  });
  expect(resolve).toHaveBeenNthCalledWith(1, "media-one");
  expect(resolve).toHaveBeenNthCalledWith(2, "media-two");
});

it("labels grid remove controls and removes the requested image", async () => {
  const editor = renderGalleryEditor({
    ...galleryFixture(),
    attrs: {
      id: "block-gallery-proof",
      data: emptyGalleryData({ layout: "grid" }),
    },
  });

  expect(
    await screen.findByRole("button", {
      name: "Open image (a) fullscreen: First image",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Open image (b) fullscreen: Second image",
    }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove image 2" }));

  await waitFor(() => {
    expect(
      screen.queryByRole("button", {
        name: "Open image (b) fullscreen: Second image",
      }),
    ).toBeNull();
  });

  expect(galleryItemIds(editor)).toEqual(["gallery-image-1"]);

  editor.destroy();
});
