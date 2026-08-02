// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { createElement, Fragment } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type SurfaceCapability,
} from "@/composition/application/create-scaffold-application";
import { createScaffoldAuthoringCataloguesStorageExtension } from "@/composition/authoring/scaffold-authoring-catalogues-storage";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { validateCourseSurfaceLifecycle } from "@/document/model/validation";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { authoringSlideDividersPluginKey } from "./AuthoringSlideDividers";
import { AuthoringSlideDividers } from "./AuthoringSlideDividers";
import { SurfaceTemplatePicker, SurfaceTemplatePickerHost } from "./SurfaceTemplatePickerHost";
import { createSurfaceCreationCatalog } from "./surface-creation-catalog";
import { insertSurfaceTemplateAfterSurface } from "./surface-template-insertion";

const surfaceVariants = createSurfaceVariantRegistry(builtInSurfaceVariantDefinitions);

const editors: Editor[] = [];
const editorElements: HTMLElement[] = [];

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

const TestSectionArrangementNode = Node.create({
  name: "testSectionArrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const editor of editors.splice(0)) editor.destroy();
  for (const element of editorElements.splice(0)) element.remove();
  vi.restoreAllMocks();
});

describe("SurfaceTemplatePickerHost", () => {
  it("keeps cumulative Surface discovery and insertion isolated between simultaneous editors", async () => {
    const hostSurface = hostSurfaceCapability("plus-private-surface");
    const plusApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "plus-surface-picker",
          surfaces: [hostSurface],
        }),
      ],
    });
    const coreApplication = createScaffoldApplication();
    const plusEditor = createEditor(["plus-slide-1"], undefined, plusApplication);
    const coreEditor = createEditor(["core-slide-1"], undefined, coreApplication);
    const user = userEvent.setup();

    render(
      createElement(
        Fragment,
        null,
        createElement(SurfaceTemplatePickerHost, { editor: plusEditor }),
        createElement(SurfaceTemplatePickerHost, { editor: coreEditor }),
      ),
    );
    openPicker(coreEditor, "core-slide-1");
    openPicker(plusEditor, "plus-slide-1");

    const dialogs = await waitFor(() => {
      const mountedDialogs = Array.from(
        globalThis.document.body.querySelectorAll<HTMLElement>(
          ".sc-surface-template-picker-dialog",
        ),
      );
      expect(mountedDialogs).toHaveLength(2);
      return mountedDialogs;
    });
    const plusDialog = dialogs.find((dialog) =>
      dialog.textContent?.includes("Private Plus Surface"),
    );
    const coreDialog = dialogs.find(
      (dialog) => !dialog.textContent?.includes("Private Plus Surface"),
    );
    if (!plusDialog || !coreDialog) {
      throw new Error("Expected one isolated Plus Surface picker and one Core Surface picker.");
    }
    expect(dialogs.every((dialog) => dialog.textContent?.includes("Content"))).toBe(true);

    const hostSurfaceCard = within(plusDialog)
      .getByText("Private Plus Surface")
      .closest<HTMLButtonElement>("button");
    if (!hostSurfaceCard) throw new Error("Expected the private Plus Surface card.");
    await user.click(hostSurfaceCard);

    await waitFor(() => {
      expect(readSurfaceVariants(plusEditor.getJSON())).toEqual([
        "slide-cover",
        hostSurface.definition.id,
      ]);
    });
    expect(readSurfaceVariants(coreEditor.getJSON())).toEqual(["slide-cover"]);
    expect(
      globalThis.document.body.querySelectorAll(".sc-surface-template-picker-dialog"),
    ).toHaveLength(1);
  });

  it("groups labelled cards in explicit catalogue order", async () => {
    const { dialog } = await renderOpenPicker();
    const titleGroup = within(dialog).getByRole("region", { name: "Title layouts" });
    const contentGroup = within(dialog).getByRole("region", { name: "Content layouts" });
    const imageGroup = within(dialog).getByRole("region", { name: "Image layouts" });

    expect(within(titleGroup).getAllByRole("button")).toEqual([
      within(titleGroup).getByRole("button", { name: "Cover" }),
      within(titleGroup).getByRole("button", { name: "Module cover" }),
      within(titleGroup).getByRole("button", { name: "Image cover" }),
      within(titleGroup).getByRole("button", { name: "Image band" }),
    ]);
    expect(within(contentGroup).getAllByRole("button")).toEqual([
      within(contentGroup).getByRole("button", { name: "Content" }),
      within(contentGroup).getByRole("button", { name: "Two columns" }),
      within(contentGroup).getByRole("button", { name: "Three columns" }),
      within(contentGroup).getByRole("button", { name: "Two stacked" }),
      within(contentGroup).getByRole("button", { name: "Side title" }),
      within(contentGroup).getByRole("button", { name: "Centred stage" }),
      within(contentGroup).getByRole("button", { name: "Editorial" }),
    ]);
    expect(within(imageGroup).getAllByRole("button")).toEqual([
      within(imageGroup).getByRole("button", { name: "Image + content split" }),
      within(imageGroup).getByRole("button", { name: "Image + content stacked" }),
      within(imageGroup).getByRole("button", { name: "Full-bleed image" }),
      within(imageGroup).getByRole("button", { name: "Image backdrop + inset panel" }),
      within(imageGroup).getByRole("button", { name: "Diptych" }),
      within(imageGroup).getByRole("button", { name: "Triptych" }),
    ]);
    expect(
      within(dialog).getByText("Opening slide with a title and short description."),
    ).toBeInTheDocument();
  });

  it("renders recursive preview metadata as aria-hidden abstract geometry", async () => {
    await renderOpenPicker();
    const preview = globalThis.document.body.querySelector(
      '[data-surface-template-preview="slide-image-cover"]',
    );

    expect(preview?.getAttribute("aria-hidden")).toBe("true");
    expect(
      Array.from(preview?.querySelectorAll("[data-surface-template-preview-node]") ?? [], (node) =>
        node.getAttribute("data-surface-template-preview-node"),
      ),
    ).toEqual(["row", "column", "slot", "slot", "slot"]);
  });

  it("activates a card by keyboard, closes after insertion, and restores editor focus", async () => {
    const { dialog, editor, user } = await renderOpenPicker();
    const contentCard = within(dialog).getByRole("button", { name: "Content" });

    contentCard.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Choose slide template" })).toBeNull();
    });
    expect(readSurfaceVariants(editor.getJSON())).toEqual(["slide-cover", "slide-content"]);
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
  });

  it("keeps the picker open when insertion fails", async () => {
    const { dialog, editor, user } = await renderOpenPicker();
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
          type: "open-template-picker",
          afterSurfaceId: "missing-surface",
        }),
      );
    });

    await user.click(within(dialog).getByRole("button", { name: "Cover" }));

    expect(screen.getByRole("dialog", { name: "Choose slide template" })).toBeInTheDocument();
    expect(readSurfaceVariants(editor.getJSON())).toEqual(["slide-cover"]);
  });

  it("inserts the selected layout immediately after the requesting surface", async () => {
    const { dialog, editor, user } = await renderOpenPicker({
      afterSurfaceId: "slide-1",
      surfaceIds: ["slide-1", "slide-2"],
    });

    await user.click(within(dialog).getByRole("button", { name: "Content" }));

    expect(readSurfaceVariants(editor.getJSON())).toEqual([
      "slide-cover",
      "slide-content",
      "slide-cover",
    ]);
  });

  it("uses the variant ID for repeated insertion while allocating distinct stable instance IDs", () => {
    const editor = createEditor(["slide-1"]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: "slide-1",
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: "slide-1",
        variantId: "slide-content",
      }),
    ).toBe(true);

    const surfaces = readSurfaces(editor.getJSON());
    expect(surfaces.map(({ variant }) => variant)).toEqual([
      "slide-cover",
      "slide-content",
      "slide-content",
    ]);
    expect(new Set(surfaces.map(({ id }) => id)).size).toBe(3);
    expect(surfaces.slice(1).every(({ id }) => /^[0-9A-Z_a-z-]{12}$/.test(String(id)))).toBe(true);
    expect(
      validateCourseSurfaceLifecycle({
        content: editor.getJSON(),
        registry: surfaceVariants,
      }).ok,
    ).toBe(true);
  });

  it("shows later catalogue definitions without picker-specific changes", async () => {
    const expandedSurfaceVariants = createSurfaceVariantRegistry([
      ...builtInSurfaceVariantDefinitions,
      {
        id: "surface-picker-auto-expansion-test",
        modes: ["slideshow"],
        title: "Later content layout",
        description: "A later registered layout used to prove automatic picker expansion.",
        catalogue: {
          section: "content",
          order: 9_990,
          preview: { kind: "slot", role: "content" },
        },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: "surface-picker-auto-expansion-test" },
          content: [{ type: "paragraph" }],
        }),
      },
    ]);

    const { dialog } = await renderOpenPicker({ surfaceVariants: expandedSurfaceVariants });
    const contentGroup = within(dialog).getByRole("region", { name: "Content layouts" });

    const buttons = within(contentGroup).getAllByRole("button");
    expect(buttons.at(-1)).toBe(
      within(contentGroup).getByRole("button", { name: "Later content layout" }),
    );
  });
});

async function renderOpenPicker({
  afterSurfaceId = "slide-1",
  surfaceIds = ["slide-1"],
  surfaceVariants: pickerSurfaceVariants = surfaceVariants,
}: {
  afterSurfaceId?: string;
  surfaceIds?: readonly string[];
  surfaceVariants?: typeof surfaceVariants;
} = {}) {
  const user = userEvent.setup();
  const editorElement = globalThis.document.createElement("div");
  globalThis.document.body.append(editorElement);
  editorElements.push(editorElement);
  const editor = createEditor(surfaceIds, editorElement);

  render(
    createElement(SurfaceTemplatePicker, {
      editor,
      surfaceCreationCatalog: createSurfaceCreationCatalog(pickerSurfaceVariants),
      surfaceVariants: pickerSurfaceVariants,
    }),
  );
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId,
      }),
    );
  });
  const dialog = await screen.findByRole("dialog", { name: "Choose slide template" });

  return { dialog, editor, user };
}

function createEditor(
  surfaceIds: readonly string[],
  editorElement?: HTMLElement,
  application?: ReturnType<typeof createScaffoldApplication>,
): Editor {
  const element = editorElement ?? globalThis.document.createElement("div");
  if (!editorElement) {
    globalThis.document.body.append(element);
    editorElements.push(element);
  }
  const editor = new Editor({
    element,
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        heading: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      SlideTitleNode,
      SlideCoverSubtitleNode,
      TestArrangementNode,
      TestSectionArrangementNode,
      AuthoringSlideDividers,
      ...(application
        ? [
            createScaffoldCapabilitiesStorageExtension(application.capabilities),
            createScaffoldAuthoringCataloguesStorageExtension(application.authoring.catalogues),
          ]
        : []),
    ],
    content: slideshowDocument(surfaceIds),
  });
  editors.push(editor);
  return editor;
}

function openPicker(editor: Editor, afterSurfaceId: string): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(authoringSlideDividersPluginKey, {
        type: "open-template-picker",
        afterSurfaceId,
      }),
    );
  });
}

function hostSurfaceCapability(id: string): SurfaceCapability {
  return {
    definition: {
      id,
      modes: ["slideshow"],
      title: "Private Plus Surface",
      description: "A private Surface installed only in the Plus editor.",
      catalogue: {
        section: "content",
        order: 9_999,
        preview: { kind: "slot", role: "content" },
      },
      structurePolicy: {
        fixedChildren: [{ type: "paragraph" }],
        allowRootInsertion: false,
      },
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [{ type: "paragraph" }],
      }),
    },
    authoringView: { variantId: id, component: HostSurfaceView },
    runtimeView: { variantId: id, component: HostSurfaceView },
  };
}

function HostSurfaceView() {
  return null;
}

function slideshowDocument(surfaceIds: readonly string[]): JSONContent {
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
        content: surfaceIds.map((surfaceId) =>
          slideCoverSurfaceDefinition.createSurface({ surfaceId }),
        ),
      },
    ],
  };
}

function readSurfaceVariants(document: JSONContent): unknown[] {
  return readSurfaces(document).map(({ variant }) => variant);
}

function readSurfaces(document: JSONContent) {
  return (document.content?.[0]?.content ?? []).map((surface) => ({
    id: surface.attrs?.["id"],
    variant: surface.attrs?.["variant"],
  }));
}
