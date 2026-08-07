// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import type { CourseStructureCommand } from "@/document/model/course-structure";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { authoringSlideDividersPluginKey } from "./AuthoringSlideDividers";
import { AuthoringSlideDividers } from "./AuthoringSlideDividers";
import { SurfaceTemplatePicker } from "./SurfaceTemplatePickerHost";
import { createSurfaceCreationCatalog } from "./surface-creation-catalog";
import { insertSurfaceTemplateAfterSurface } from "./surface-template-insertion";

const surfaceVariants = createSurfaceVariantRegistry(builtInSurfaceVariantDefinitions);
const FIRST_SURFACE_ID = createEmbeddedNodeId();
const SECOND_SURFACE_ID = createEmbeddedNodeId();
const THIRD_SURFACE_ID = createEmbeddedNodeId();
const FIRST_SECTION_ID = createEmbeddedNodeId();
const SECOND_SECTION_ID = createEmbeddedNodeId();

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
      afterSurfaceId: FIRST_SURFACE_ID,
      surfaceIds: [FIRST_SURFACE_ID, SECOND_SURFACE_ID],
    });

    await user.click(within(dialog).getByRole("button", { name: "Content" }));

    expect(readSurfaceVariants(editor.getJSON())).toEqual([
      "slide-cover",
      "slide-content",
      "slide-cover",
    ]);
  });

  it("inserts after an ordinary member inside its Course Section", () => {
    const editor = createSectionedEditor([
      courseSection(FIRST_SECTION_ID, "First"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SURFACE_ID }),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
      courseSection(SECOND_SECTION_ID, "Second"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: THIRD_SURFACE_ID }),
    ]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(readCourseChildIds(editor.getJSON())).toEqual([
      FIRST_SECTION_ID,
      FIRST_SURFACE_ID,
      expect.not.stringMatching(new RegExp(`${FIRST_SURFACE_ID}|${SECOND_SURFACE_ID}`)),
      SECOND_SURFACE_ID,
      SECOND_SECTION_ID,
      THIRD_SURFACE_ID,
    ]);
  });

  it("inserts before a following Course Section boundary", () => {
    const editor = createSectionedEditor([
      courseSection(FIRST_SECTION_ID, "First"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SURFACE_ID }),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
      courseSection(SECOND_SECTION_ID, "Second"),
      slideCoverSurfaceDefinition.createSurface({ surfaceId: THIRD_SURFACE_ID }),
    ]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: SECOND_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(readCourseChildIds(editor.getJSON())).toEqual([
      FIRST_SECTION_ID,
      FIRST_SURFACE_ID,
      SECOND_SURFACE_ID,
      expect.not.stringMatching(new RegExp(`${FIRST_SURFACE_ID}|${SECOND_SURFACE_ID}`)),
      SECOND_SECTION_ID,
      THIRD_SURFACE_ID,
    ]);
  });

  it("keeps template insertion as one undoable document transaction", () => {
    const editor = createSectionedEditor(
      [
        courseSection(FIRST_SECTION_ID, "First"),
        slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SURFACE_ID }),
        slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SURFACE_ID }),
      ],
      true,
    );
    const before = editor.getJSON();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    const after = editor.getJSON();
    expect(after).not.toEqual(before);
    expect(changedTransactions).toBe(1);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(changedTransactions).toBe(2);

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(after);
    expect(changedTransactions).toBe(3);
  });

  it("uses the variant ID for repeated insertion while allocating distinct stable instance IDs", () => {
    const editor = createEditor([FIRST_SURFACE_ID]);

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(true);
    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
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
  });

  it("submits the created Surface and stable destination to the installed Course Structure command", () => {
    const applyCommand = vi.fn<(command: CourseStructureCommand) => void>();
    const commandExtension = Extension.create({
      name: "courseStructureCommands",
      addCommands() {
        return {
          applyCourseStructureCommand: (command: CourseStructureCommand) => () => {
            applyCommand(command);
            return false;
          },
        };
      },
    });
    const editor = createEditor([FIRST_SURFACE_ID], undefined, commandExtension);
    const before = editor.getJSON();

    expect(
      insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
        afterSurfaceId: FIRST_SURFACE_ID,
        variantId: "slide-content",
      }),
    ).toBe(false);
    expect(applyCommand).toHaveBeenCalledOnce();
    expect(applyCommand).toHaveBeenCalledWith({
      type: "surface.insert",
      surface: expect.objectContaining({
        type: expect.objectContaining({ name: "surface" }),
        attrs: expect.objectContaining({ variant: "slide-content" }),
      }),
      destination: { afterSurfaceId: FIRST_SURFACE_ID },
    });
    expect(editor.getJSON()).toEqual(before);
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
  afterSurfaceId = FIRST_SURFACE_ID,
  surfaceIds = [FIRST_SURFACE_ID],
  surfaceVariants: pickerSurfaceVariants = surfaceVariants,
}: {
  afterSurfaceId?: string;
  surfaceIds?: readonly EmbeddedNodeId[];
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
  surfaceIds: readonly EmbeddedNodeId[],
  editorElement?: HTMLElement,
  courseStructureExtension = createCourseStructureCommandsExtension(),
): Editor {
  return createEditorForDocument(
    slideshowDocument(surfaceIds),
    editorElement,
    courseStructureExtension,
  );
}

function createSectionedEditor(children: readonly JSONContent[], withHistory = false): Editor {
  return createEditorForDocument(
    slideshowDocumentWithChildren(children),
    undefined,
    createCourseStructureCommandsExtension(),
    withHistory,
  );
}

function createEditorForDocument(
  content: JSONContent,
  editorElement?: HTMLElement,
  courseStructureExtension = createCourseStructureCommandsExtension(),
  withHistory = false,
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
        undoRedo: withHistory ? {} : false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      SlideTitleNode,
      SlideCoverSubtitleNode,
      TestArrangementNode,
      TestSectionArrangementNode,
      AuthoringSlideDividers,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      courseStructureExtension,
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function slideshowDocument(surfaceIds: readonly EmbeddedNodeId[]): JSONContent {
  return slideshowDocumentWithChildren(
    surfaceIds.map((surfaceId) => slideCoverSurfaceDefinition.createSurface({ surfaceId })),
  );
}

function slideshowDocumentWithChildren(children: readonly JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [...children],
      },
    ],
  };
}

function courseSection(id: EmbeddedNodeId, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}

function readCourseChildIds(document: JSONContent): unknown[] {
  return (document.content?.[0]?.content ?? []).map((child) => child.attrs?.["id"]);
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
