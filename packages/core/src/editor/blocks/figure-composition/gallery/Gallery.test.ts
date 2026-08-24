// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { Extensions, JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
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
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  createSemanticActivationBindingTestExtension,
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/semantic-document/testing/semantic-activation-binding-test-extension";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
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
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { LearningEventPort } from "@/host/ports/learning-events";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import {
  LEARNING_EVENT_ACTIVITY_TYPES,
  LEARNING_EVENT_EXTENSIONS,
  createVisualCompositionActivityId,
  createVisualItemActivityId,
} from "@/runtime/learning-events/catalogue";
import { LearningEventRuntimeProvider } from "@/runtime/learning-events/LearningEventRuntimeProvider";
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

const coreRuntimeComposition = createCoreScaffoldRuntimeComposition();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function galleryFixture(layout: "carousel" | "grid" = "carousel") {
  return {
    type: "gallery",
    attrs: {
      id: "gallery_0001",
      data: emptyGalleryData({
        layout,
        caption: richText("Shared gallery caption", [{ type: "italic" }]),
      }),
    },
    content: [
      {
        type: "gallery_item",
        attrs: {
          id: "galleryimg01",
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
          id: "galleryimg02",
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

function renderGalleryEditor(
  content: JSONContent = galleryFixture(),
  extraExtensions: Extensions = [],
) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit,
      createScaffoldCapabilitiesStorageExtension(coreRuntimeComposition.capabilities),
      ...extraExtensions,
      UniqueID.configure({
        attributeName: "id",
        types: ["gallery", "gallery_item"],
        updateDocument: false,
      }),
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

function renderGalleryLearningEventRuntime(
  gallery: JSONContent,
  learningEventPort: LearningEventPort,
  visibleSurfaceId?: string,
) {
  const surfaceId = createEmbeddedNodeId();
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Gallery fixture is missing its Region.");
  region.content = [gallery];
  assignFixtureNodeIds(surface);

  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Gallery",
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Gallery fixture has no courseDocument.");
  const courseSection = courseDocument.content?.find((child) => child.type === "courseSection");
  if (!courseSection) throw new Error("Gallery fixture has no courseSection.");
  courseDocument.content = [courseSection, surface];

  render(
    createElement(ScaffoldServicesProvider, {
      ports: { learningEvents: learningEventPort },
      children: createElement(ScaffoldArtifactIdentityProvider, {
        artifactId: "gallery-artifact",
        children: createElement(LearningEventRuntimeProvider, {
          children: createElement(CourseDocumentRuntimeRenderer, {
            composition: coreRuntimeComposition,
            initialContent: content,
            productAccess: { scaffoldPlusAuthorized: false },
            visibleSurfaceId: visibleSurfaceId ?? surfaceId,
          }),
        }),
      }),
    }),
  );
}

function assignFixtureNodeIds(node: JSONContent): void {
  if (node.type !== "text") {
    node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
  }
  for (const child of node.content ?? []) assignFixtureNodeIds(child);
}

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "gallery",
  actionId: "gallery",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

it("registers gallery as an atomic block", () => {
  expect((GalleryNode.config as { atom?: boolean }).atom).toBe(true);
  expect(galleryDefinition.boundedPlacement).toBe("fill");
});

it("registers semantic activation and reveals the requested carousel item", async () => {
  const semanticHarness = createSemanticActivationBindingTestExtension();
  const editor = renderGalleryEditor(galleryFixture(), [semanticHarness.extension]);
  const ownerId = EmbeddedNodeIdSchema.parse("gallery_0001");
  const secondItemId = EmbeddedNodeIdSchema.parse("galleryimg02");
  const binding = await waitFor(() => {
    const resolution = semanticHarness.registry.resolve(ownerId);
    expect(resolution.kind).toBe("resolved");
    return requireSemanticActivationBinding(semanticHarness.registry, ownerId);
  });

  const activation = binding.activate(semanticActivationRequest(ownerId, secondItemId));
  await waitFor(() => {
    expect(screen.getByRole("img", { name: "Second image" })).toBeInTheDocument();
  });
  await expect(activation).resolves.toEqual({ kind: "revealed", ownerId, childId: secondItemId });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  editor.destroy();
});

it("resolves selected gallery blocks to their declared visual surface", async () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      UniqueID.configure({
        attributeName: "id",
        types: ["gallery", "gallery_item"],
        updateDocument: false,
      }),
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
            id: "gallery_0001",
            data: emptyGalleryData(),
          },
        },
      ],
    },
  });

  render(createElement(EditorContent, { editor }));

  await waitFor(() => {
    expect(
      document.body.querySelector(`[${AUTHORING_FRAME_ATTR}="block"][data-id="gallery_0001"]`),
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
  expect(ownerDescriptor?.blockId).toBe("gallery_0001");

  const surface = resolveAuthoringFrameElement(document.body, {
    frameKind: AuthoringFrameKind.Block,
    id: "gallery_0001",
  });
  expect(surface?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("block");
  expect(surface?.getAttribute("data-node")).toBe("gallery");
  expect(surface?.getAttribute("data-definition")).toBe("gallery");
  expect(surface?.getAttribute("data-id")).toBe("gallery_0001");

  editor.destroy();
});

it("renders the pilot block surface without legacy authoring attrs", async () => {
  const editor = renderGalleryEditor({
    type: "gallery",
    attrs: {
      id: "gallery_0001",
      data: emptyGalleryData(),
    },
  });

  const surface = await waitFor(() => {
    const element = document.body.querySelector<HTMLElement>(
      `[${AUTHORING_FRAME_ATTR}="block"][data-id="gallery_0001"]`,
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
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="gallery_0001"]`,
      ),
    ).toBeInstanceOf(HTMLElement);
  });
  const surface = document.body.querySelector<HTMLElement>(
    `[${AUTHORING_FRAME_ATTR}="block"][data-id="gallery_0001"]`,
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

it("uses ordinary labelled carousel picker buttons and preserves current state", async () => {
  const editor = renderGalleryEditor();

  const picker = await screen.findByRole("group", { name: "Gallery images" });
  const firstButton = within(picker).getByRole("button", { name: "Show image 1" });
  const secondButton = within(picker).getByRole("button", { name: "Show image 2" });

  expect(firstButton.getAttribute("aria-current")).toBe("true");
  expect(secondButton.getAttribute("aria-current")).toBeNull();
  expect(within(picker).queryByRole("tab")).toBeNull();

  fireEvent.click(secondButton);

  expect(firstButton.getAttribute("aria-current")).toBeNull();
  expect(secondButton.getAttribute("aria-current")).toBe("true");

  editor.destroy();
});

it("separates Course gallery composition from App-only author controls", async () => {
  const editor = renderGalleryEditor();

  const authoring = await waitFor(() => {
    const element = document.querySelector<HTMLElement>(
      '.sc-course-gallery[data-authoring-frame="block"]',
    );
    expect(element).toBeInstanceOf(HTMLElement);
    return element!;
  });
  expect(authoring.querySelector(".sc-course-gallery__thumb")).not.toBeNull();
  expect(authoring.querySelector(".sc-app-gallery__thumb-delete")).toHaveClass("sc-icon-button");
  expect(authoring.querySelector('[class^="sc-gallery"], [class*=" sc-gallery"]')).toBeNull();

  renderGalleryLearningEventRuntime(galleryFixture(), {
    rootActivityId: "https://lms.example.test/courses/gallery",
    accept: async () => undefined,
  });

  const runtime = await waitFor(() => {
    const element = document.querySelector<HTMLElement>(
      '.sc-course-gallery[data-runtime-frame="block"]',
    );
    expect(element).toBeInstanceOf(HTMLElement);
    return element!;
  });
  expect(runtime.querySelector('[class*="sc-app-gallery"]')).toBeNull();
  expect(runtime.querySelector('[class^="sc-gallery"], [class*=" sc-gallery"]')).toBeNull();

  editor.destroy();
});

it("uses an App-owned danger action for grid image removal", async () => {
  const editor = renderGalleryEditor(galleryFixture("grid"));

  const removeAction = await screen.findByRole("button", { name: "Remove image 1" });

  expect(removeAction).toHaveClass("sc-icon-button", "sc-app-gallery__tile-delete");
  expect(removeAction).toHaveAttribute("data-size", "sm");
  expect(removeAction).toHaveAttribute("data-variant", "danger");
  expect(removeAction).not.toHaveClass(
    "rt-IconButton",
    "sc-course-icon-action",
    "sc-course-gallery__delete",
  );

  editor.destroy();
});

it("uses an App-owned danger action for carousel thumbnail removal", async () => {
  const editor = renderGalleryEditor();

  const carouselRemoveAction = await screen.findByRole("button", { name: "Remove image 1" });
  const learnerThumbAction = screen.getByRole("button", { name: "Show image 1" });

  expect(learnerThumbAction).toHaveClass("sc-course-gallery__thumb");
  expect(carouselRemoveAction).toHaveClass("sc-icon-button", "sc-app-gallery__thumb-delete");
  expect(carouselRemoveAction).toHaveAttribute("data-size", "sm");
  expect(carouselRemoveAction).toHaveAttribute("data-variant", "danger");
  expect(carouselRemoveAction).not.toHaveClass(
    "rt-IconButton",
    "sc-course-icon-action",
    "sc-course-gallery__delete",
  );

  editor.destroy();
});

it("reports a carousel item only after its full-size stage image loads", () => {
  const onActiveItemLoad = vi.fn();
  const items: GalleryResolvedItem[] = [
    {
      key: "galleryimg01",
      alt: "First",
      caption: EmptyScaffoldRichTextDocument,
      url: "https://example.com/first.jpg",
      loading: false,
      error: null,
    },
  ];

  render(
    createElement(GalleryCarousel, {
      items,
      activeIndex: 0,
      activeItem: items[0]!,
      onSelect: () => undefined,
      onOpenLightbox: () => undefined,
      onActiveItemLoad,
    }),
  );

  expect(onActiveItemLoad).not.toHaveBeenCalled();
  fireEvent.load(screen.getByRole("img", { name: "First" }));
  expect(onActiveItemLoad).toHaveBeenCalledWith("galleryimg01");
});

it("reports each successfully displayed carousel item once per Learning Event reporter", async () => {
  const rootActivityId = "https://lms.example.test/courses/gallery";
  const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
  renderGalleryLearningEventRuntime(galleryFixture(), {
    rootActivityId,
    accept,
  });

  const firstStageImage = await screen.findByRole("img", { name: "First image" });
  expect(accept).not.toHaveBeenCalled();
  fireEvent.load(firstStageImage);
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));

  fireEvent.click(screen.getByRole("button", { name: "Show image 2" }));
  const secondStageImage = await screen.findByRole("img", { name: "Second image" });
  fireEvent.load(secondStageImage);
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(3));
  fireEvent.load(secondStageImage);
  expect(accept).toHaveBeenCalledTimes(3);

  expect(accept.mock.calls.map(([event]) => event.verb.display.en)).toStrictEqual([
    "initialized",
    "experienced",
    "experienced",
  ]);
  expect(accept.mock.calls[1]?.[0]).toMatchObject({
    verb: { display: { en: "experienced" } },
    object: {
      id: createVisualItemActivityId(rootActivityId, "gallery_0001", "galleryimg01"),
      definition: {
        type: LEARNING_EVENT_ACTIVITY_TYPES.visualItem,
        extensions: {
          [LEARNING_EVENT_EXTENSIONS.visualItemKind]: "gallery-image",
          [LEARNING_EVENT_EXTENSIONS.visualItemPosition]: 1,
          [LEARNING_EVENT_EXTENSIONS.visualItemCount]: 2,
        },
      },
    },
    context: {
      contextActivities: {
        parent: [
          {
            id: createVisualCompositionActivityId(rootActivityId, "gallery_0001"),
            definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.visualComposition },
          },
        ],
      },
    },
  });
  const serializedEvents = JSON.stringify(accept.mock.calls.slice(1));
  expect(serializedEvents).not.toContain("First image");
  expect(serializedEvents).not.toContain("image-1.jpg");
  expect(serializedEvents).not.toContain("First caption");
  expect(serializedEvents).not.toContain("Shared gallery caption");
});

it("reports grid items only after their active lightbox images load", async () => {
  const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
  renderGalleryLearningEventRuntime(galleryFixture("grid"), {
    rootActivityId: "https://lms.example.test/courses/gallery",
    accept,
  });

  const firstTileImage = await screen.findByRole("img", { name: "First image" });
  fireEvent.load(firstTileImage);
  expect(accept).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Open image (a) fullscreen: First image",
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Gallery viewer" });
  fireEvent.load(within(dialog).getByRole("img", { name: "First image" }));
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(2));

  fireEvent.click(within(dialog).getByRole("button", { name: "Next image" }));
  const secondLightboxImage = await within(dialog).findByRole("img", {
    name: "Second image",
  });
  fireEvent.load(secondLightboxImage);
  await waitFor(() => expect(accept).toHaveBeenCalledTimes(3));
});

it("does not report loaded gallery items on a non-presented runtime surface", async () => {
  const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
  renderGalleryLearningEventRuntime(
    galleryFixture(),
    {
      rootActivityId: "https://lms.example.test/courses/gallery",
      accept,
    },
    "another-surface",
  );

  await waitFor(() =>
    expect(document.querySelector(".sc-course-gallery__stage-image")).not.toBeNull(),
  );
  const hiddenStageImage = document.querySelector<HTMLImageElement>(
    ".sc-course-gallery__stage-image",
  );
  if (!hiddenStageImage) throw new Error("Expected a hidden-surface gallery stage image.");
  fireEvent.load(hiddenStageImage);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(accept).not.toHaveBeenCalled();
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
  const grid = container.querySelector<HTMLElement>(".sc-course-gallery__grid");

  expect(grid).not.toBeNull();
  act(() => resize?.(0, 400));
  expect(grid?.hasAttribute("data-gallery-grid-bounded")).toBe(false);

  act(() => resize?.(800, 400));
  expect(grid?.getAttribute("data-gallery-grid-bounded")).toBe("");
  expect(grid?.getAttribute("data-gallery-grid-layout")).toBe("3x2");
  expect(grid?.style.getPropertyValue("--sc-course-gallery-grid-columns")).toBe("3");
  expect(grid?.style.getPropertyValue("--sc-course-gallery-grid-rows")).toBe("2");

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
  const grid = container.querySelector<HTMLElement>(".sc-course-gallery__grid");

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
    container.querySelector(".sc-course-gallery__grid")?.getAttribute("data-gallery-grid-layout"),
  ).toBe("3x1");
});

it("labels carousel remove controls and removes the requested image", async () => {
  const editor = renderGalleryEditor();

  expect(await screen.findByRole("button", { name: "Show image 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show image 2" })).toBeInTheDocument();
  const dispatch = vi.spyOn(editor.view, "dispatch");

  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Show image 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show image 1" })).toBeInTheDocument();
  });

  expect(galleryItemIds(editor)).toEqual(["galleryimg02"]);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  expect(editor.state.selection.from).toBe(0);

  expect(editor.commands.undo()).toBe(true);
  expect(galleryItemIds(editor)).toEqual(["galleryimg01", "galleryimg02"]);

  editor.destroy();
});

it("edits the same stable children through generic collection settings", async () => {
  const editor = renderGalleryEditor();

  render(
    createElement(ConfigurationSettingsSheet, {
      editor,
      entry: galleryDefinition.settingsSheet!,
      nodeType: GALLERY_NODE,
      pos: 0,
      targetId: "gallery_0001",
      open: true,
      onOpenChange: () => undefined,
    }),
  );

  expect(await screen.findByRole("group", { name: "Image (a)" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Image (b)" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove Image (a)" }));

  await waitFor(() => {
    expect(galleryItemIds(editor)).toEqual(["galleryimg02"]);
    expect(screen.queryByRole("group", { name: "Image (b)" })).toBeNull();
  });

  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add image" }));

  await waitFor(() => {
    const ids = galleryItemIds(editor);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("galleryimg02");
    expect(ids[1]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
  });

  editor.destroy();
});

it("preserves canonical media identity and rejects stale collection writes", () => {
  const editor = renderGalleryEditor();
  const target = {
    ownerId: "gallery_0001",
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
    childId: "galleryimg01",
    value: managedValue,
  });

  expect(updated.ok).toBe(true);
  if (updated.ok) editor.view.dispatch(updated.tr);
  expect(editor.state.doc.firstChild?.firstChild?.attrs["data"]).toEqual(managedValue);
  expect(galleryItemIds(editor)[0]).toBe("galleryimg01");

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
      id: "stableitem01",
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
        id: "stableitem01",
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
      id: "gallery_0001",
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

  expect(galleryItemIds(editor)).toEqual(["galleryimg01"]);

  editor.destroy();
});
