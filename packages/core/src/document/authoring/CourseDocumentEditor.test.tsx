// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { EmbeddedNodeIdSchema, McqSettingsSchema, type EmbeddedNodeId } from "@scaffold/contracts";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
} from "@/composition/application/create-scaffold-application";
import type { SurfaceCapability } from "@/composition/application/surface-capability";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { fixtureCourseDocument } from "@/document/authoring/testing/course-document-fixture";
import { chartBlockDefinition } from "@/editor/blocks/media/chart/chart-definition";
import { getDocumentTreeForEditor } from "@/document/authoring/document-tree";
import { getEditorNavigationForEditor } from "@/document/authoring/editor-navigation";

import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { setCourseDesignOverride } from "@/theme/authoring/course-theme-commands";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { builtInCourseDesignThemeRegistry } from "@/theme/course/designs/registry";
import { CourseDocumentEditor } from "./CourseDocumentEditor.test-harness";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const FIRST_SLIDE_ID = createEmbeddedNodeId();
const SECOND_SLIDE_ID = createEmbeddedNodeId();
const THIRD_SLIDE_ID = createEmbeddedNodeId();
const MCQ_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00021");
const GALLERY_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00022");
const FIRST_SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");
const MCQ_BLOCK_ID = EmbeddedNodeIdSchema.parse("mcq000000001");
const GALLERY_BLOCK_ID = EmbeddedNodeIdSchema.parse("gallery00001");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createInitializedDocument(mode: "page" | "slideshow" = "page"): JSONContent {
  return mode === "slideshow"
    ? createScaffoldDocumentContent({ mode, initialCourseSectionTitle: "Slides" })
    : createScaffoldDocumentContent({ mode });
}

function createSlideshowDocumentWithSurfaces(surfaceIds: EmbeddedNodeId[]): JSONContent {
  return authoringSlideshowDocument(surfaceIds);
}

describe("CourseDocumentEditor", () => {
  it("mounts a host-added Surface inside a Course Section", async () => {
    const privateSurface = privateSurfaceCapability("private-assessment-surface");
    const application = createScaffoldApplication({
      packs: [defineScaffoldExtensionPack({ id: "private-authoring", surfaces: [privateSurface] })],
    });
    const content = createInitializedDocument("slideshow");
    const courseDocument = content.content?.[0];
    const surface = courseDocument?.content?.[0];
    if (!surface?.attrs) throw new Error("expected initialized Surface");
    surface.attrs["variant"] = privateSurface.definition.id;
    surface.attrs["settings"] = {};
    courseDocument?.content?.unshift(courseSection(FIRST_SECTION_ID, "Private content"));
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: application.authoring,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    expect(editor.storage.scaffoldCapabilities.capabilities).toBe(application.capabilities);
  });

  it("mounts a valid sectioned Slideshow", async () => {
    const content = authoringSlideshowDocument([FIRST_SLIDE_ID, SECOND_SLIDE_ID]);
    content.content?.[0]?.content?.unshift(courseSection(FIRST_SECTION_ID, "Introduction"));
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  it("canonicalizes portable document changes before reporting them", async () => {
    const content = createInitializedDocument();
    const onChange = vi.fn();
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onChange,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    if (!editor) throw new Error("CourseDocumentEditor did not provide an editor");
    onChange.mockClear();
    const getJSON = vi.spyOn(editor, "getJSON");

    editor.commands.insertContent("a");

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(editor));
    expect(getJSON).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "doc" }),
      [],
      expect.any(Object),
    );
  });

  it("preserves redo after undoing a course theme change", async () => {
    const content = createInitializedDocument();
    const onReady = vi.fn();

    render(
      createElement(
        StrictMode,
        null,
        createElement(CourseDocumentEditor, {
          composition: coreAuthoringComposition,
          source: { mode: "document", content },
          onReady,
        }),
      ),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    if (!editor) throw new Error("CourseDocumentEditor did not provide an editor");

    expect(
      setCourseDesignOverride(editor, "roundness", "square", builtInCourseDesignThemeRegistry),
    ).toBe(true);
    expect(editor.chain().focus().undo().run()).toBe(true);
    expect(editor.can().redo()).toBe(true);
  });

  it("mounts prepared portable content with one page surface", async () => {
    const content = createInitializedDocument();
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument");
    });

    const json = editor.getJSON();
    const courseDocument = json.content?.[0];
    const surface = courseDocument?.content?.[0];

    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    const editorRoot = screen.getByTestId("course-document-editor");
    await waitFor(() => {
      expect(editorRoot.querySelectorAll(":scope > [data-scaffold-overlay-host]")).toHaveLength(1);
    });
    expect(
      editorRoot.querySelector(".sc-authoring-chrome-root > [data-scaffold-overlay-host]"),
    ).toBeNull();
    expect(courseDocument?.attrs).toMatchObject({
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
    });
    expect(surface?.type).toBe("surface");
    expect(surface?.attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(editor.schema.nodes.mcq).toBeDefined();
    const uniqueIdExtension = editor.extensionManager.extensions.find(
      (extension: { name: string }) => extension.name === "uniqueID",
    );
    expect(uniqueIdExtension?.options.types).toBe("all");
    expect(uniqueIdExtension?.options.updateDocument).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "doc" }),
      [],
      expect.any(Object),
    );
  });

  it("renders initialized slideshow documents in slideshow mode", async () => {
    const content = createInitializedDocument("slideshow");
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs).toMatchObject({
        mode: "slideshow",
      });
    });
    expect(screen.getByRole("region", { name: "Slide canvas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Page canvas" })).toBeNull();
  });

  it("navigates to another current Surface through the contained shell without stealing focus", async () => {
    const content = createSlideshowDocumentWithSurfaces([FIRST_SLIDE_ID, SECOND_SLIDE_ID]);
    const onReady = vi.fn();

    render(
      createElement(
        "div",
        {
          className: "sc-editor-shell",
          "data-scroll-model": "contained",
          "data-testid": "contained-editor-shell",
        },
        createElement("button", { type: "button" }, "Outline target"),
        createElement(CourseDocumentEditor, {
          composition: coreAuthoringComposition,
          source: { mode: "document", content },
          onReady,
        }),
      ),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        document.querySelector(`[data-node="surface"][data-id="${SECOND_SLIDE_ID}"]`),
      ).not.toBeNull(),
    );
    const editor = onReady.mock.calls[0]?.[0];
    if (!editor) throw new Error("CourseDocumentEditor did not provide an editor");
    const documentTree = getDocumentTreeForEditor(editor);
    const navigation = getEditorNavigationForEditor(editor);
    const treeSnapshot = documentTree.getSnapshot();
    const location = treeSnapshot.locationById.get(SECOND_SLIDE_ID);
    if (!location) throw new Error("Expected second Surface semantic location");
    // Semantic navigation scrolls the Surface authoring frame — the element that
    // carries the `data-node`/`data-id` attrs — not the outer react-renderer wrapper
    // that `view.nodeDOM` returns.
    const target = document.querySelector<HTMLElement>(
      `[data-node="surface"][data-id="${location.id}"]`,
    );
    if (!target) throw new Error("Expected second Surface DOM target");
    target.getBoundingClientRect = () => testRect({ top: 500, bottom: 560 });
    const shell = screen.getByTestId("contained-editor-shell");
    shell.getBoundingClientRect = () => testRect({ top: 100, bottom: 400 });
    const scrollBy = vi.fn();
    Object.defineProperty(shell, "scrollBy", { configurable: true, value: scrollBy });
    const outlineTarget = screen.getByRole("button", { name: "Outline target" });
    outlineTarget.focus();

    const result = await navigation.showTarget(SECOND_SLIDE_ID, { origin: "document-outline" });

    expect(result).toEqual({ kind: "reached", id: SECOND_SLIDE_ID });
    // Contract update: 3d1f2948 changed vertical editor-navigation scrolling from
    // minimal edge-scroll (160) to centring the target — target centre 530 minus
    // viewport centre 250. Matches authoring-editor-navigation-environment.test.tsx.
    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 280 });
    expect(document.activeElement).toBe(outlineTarget);
    expect(documentTree.getSnapshot()).toBe(treeSnapshot);
  });

  it("renders authoring-only dividers after slideshow surfaces", async () => {
    const content = createSlideshowDocumentWithSurfaces([
      FIRST_SLIDE_ID,
      SECOND_SLIDE_ID,
      THIRD_SLIDE_ID,
    ]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(3);
    });
    expect(screen.getByRole("button", { name: "Add slide after slide 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add slide after slide 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add slide after slide 3" })).toBeInTheDocument();

    const surfaceIds = Array.from(
      globalThis.document.body.querySelectorAll('[data-node="surface"][data-id]'),
      (element) => element.getAttribute("data-id"),
    );
    expect(surfaceIds).toEqual([FIRST_SLIDE_ID, SECOND_SLIDE_ID, THIRD_SLIDE_ID]);
  });

  it("scopes slideshow transforms to each surface while dividers stay in document flow", async () => {
    const content = createSlideshowDocumentWithSurfaces([FIRST_SLIDE_ID, SECOND_SLIDE_ID]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const stages = globalThis.document.body.querySelectorAll("[data-authoring-surface-stage]");
    const surfaces = globalThis.document.body.querySelectorAll("[data-surface]");
    const dividers = screen.getAllByTestId("authoring-slide-divider");

    expect(stages).toHaveLength(2);
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.closest("[data-authoring-surface-stage]")).toBe(stages[0]);
    expect(surfaces[1]?.closest("[data-authoring-surface-stage]")).toBe(stages[1]);
    expect(dividers).toHaveLength(2);
    expect(dividers.every((divider) => !divider.closest("[data-authoring-surface-stage]"))).toBe(
      true,
    );
  });

  it("renders an authoring-only divider after a single slideshow surface", async () => {
    const content = createSlideshowDocumentWithSurfaces([FIRST_SLIDE_ID]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(1);
    });
    expect(screen.getByRole("button", { name: "Add slide after slide 1" })).toBeInTheDocument();
  });

  it("opens the slide template picker from the divider control", async () => {
    const user = userEvent.setup();
    const content = createSlideshowDocumentWithSurfaces([FIRST_SLIDE_ID]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    await user.click(screen.getByRole("button", { name: "Add slide after slide 1" }));

    // Contract update: da6f30ca renamed the picker's accessible name from
    // "Choose slide template" to "Choose a slide layout".
    const dialog = await screen.findByRole("dialog", { name: "Choose a slide layout" });
    // Contract update: da6f30ca restructured the picker. The two catalogue groups
    // are now tabs in a "Slide layout categories" tablist rather than two regions
    // rendered at once, each layout is a radio rather than a button, and inserting
    // is a separate "Add <title> slide" action.
    const categories = within(dialog).getByRole("tablist", { name: "Slide layout categories" });
    expect(within(categories).getByRole("tab", { name: "Title layouts" })).toBeInTheDocument();
    expect(within(categories).getByRole("tab", { name: "Content layouts" })).toBeInTheDocument();
    const layouts = within(dialog).getByRole("radiogroup", { name: "Title layouts" });
    expect(within(layouts).getByRole("radio", { name: "Cover" })).toBeInTheDocument();
    expect(
      globalThis.document.body.querySelector('[data-surface-template-preview="slide-cover"]'),
    ).toBeDefined();

    await user.click(within(layouts).getByRole("radio", { name: "Cover" }));
    await user.click(within(dialog).getByRole("button", { name: "Add Cover slide" }));

    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(2);
    });

    const courseChildren: JSONContent[] = editor.getJSON().content?.[0]?.content ?? [];
    const surfaces = courseChildren.filter((child) => child.type === "surface");
    expect(surfaces).toHaveLength(2);
    expect(surfaces.map((surface: JSONContent) => surface.attrs?.["variant"])).toEqual([
      "slide-cover",
      "slide-cover",
    ]);
    expect(screen.queryByRole("dialog", { name: "Choose a slide layout" })).toBeNull();
    expect(JSON.stringify(editor.getJSON())).not.toContain("authoring-slide-divider");
  });

  it("does not persist slideshow dividers into document JSON", async () => {
    const content = createSlideshowDocumentWithSurfaces([FIRST_SLIDE_ID, SECOND_SLIDE_ID]);
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    await waitFor(() => {
      expect(screen.getAllByTestId("authoring-slide-divider")).toHaveLength(2);
    });

    const json = editor.getJSON();
    const courseDocument = json.content?.[0];
    expect(courseDocument?.content?.map((node: JSONContent) => node.type)).toEqual([
      "courseSection",
      "surface",
      "surface",
    ]);
    expect(JSON.stringify(json)).not.toContain("authoring-slide-divider");
  });

  it("does not render slide dividers for page documents", async () => {
    const content = createInitializedDocument("page");
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId("authoring-slide-divider")).toBeNull();
    expect(globalThis.document.body.querySelector("[data-authoring-surface-stage]")).toBeNull();
  });

  it("mounts saved composite assessment content without invalid initial text selection warnings", async () => {
    const content = authoringDocumentWithMcq();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument");
    });

    expect(findFirstNodeOfType(editor.getJSON(), "mcq")?.type).toBe("mcq");
    expect(await screen.findByRole("button", { name: "Add choice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit 1 hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show feedback" })).toBeInTheDocument();
    expect(
      warn.mock.calls.some((args) =>
        args.some((arg) =>
          String(arg).includes(
            "TextSelection endpoint not pointing into a node with inline content",
          ),
        ),
      ),
    ).toBe(false);
  });

  it("mounts persisted v2 Gallery content without legacy authoring state", async () => {
    const content = authoringDocumentWithGallery();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    expect(await screen.findByText("Shared authoring caption")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open First gallery image fullscreen" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("First gallery image caption")).toBeNull();

    const gallery = findFirstNodeOfType(editor.getJSON(), "gallery");
    expect(gallery?.attrs?.["data"]).toEqual({
      type: "gallery",
      layout: "carousel",
      caption: richTextDocument("Shared authoring caption"),
    });
    expect(gallery?.content?.map((item: JSONContent) => item.attrs?.["id"])).toEqual([
      "galitem00001",
      "galitem00002",
    ]);
    expect(JSON.stringify(gallery)).not.toContain("showCaptions");
  });

  it("does not let UniqueID mutate readonly editor documents", async () => {
    const content = createInitializedDocument();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        editable: false,
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const editor = onReady.mock.calls[0]?.[0];
    const uniqueIdExtension = editor.extensionManager.extensions.find(
      (extension: { name: string }) => extension.name === "uniqueID",
    );

    expect(uniqueIdExtension?.options.updateDocument).toBe(false);
  });

  it("keeps the live editor mounted while its authoring view is suspended", async () => {
    const content = createInitializedDocument();
    const onReady = vi.fn();
    const { rerender } = render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    expect(editor.isEditable).toBe(true);
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();

    rerender(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
        suspended: true,
      }),
    );

    await waitFor(() => expect(editor.isEditable).toBe(true));
    expect(editor.isDestroyed).toBe(false);
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);

    rerender(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
        suspended: false,
      }),
    );

    await waitFor(() => expect(editor.isEditable).toBe(true));
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    expect(editor.isDestroyed).toBe(false);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("generates a stable id for an inserted addressable block", async () => {
    const content = createInitializedDocument();
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument");
    });

    // Contract update: addressable Blocks carry their stable id from the insert
    // catalogue's own `content()` factory (chart-definition.ts). The semantic
    // projection now validates ids while the transaction is applied, so it no
    // longer waits for UniqueID to backfill a raw id-less insert.
    const insertContent = chartBlockDefinition.insert?.content;
    if (!insertContent) throw new Error("Expected the Chart insert catalogue content factory");
    expect(editor.commands.insertContent(insertContent())).toBe(true);

    let chartId: unknown;
    editor.state.doc.descendants((node: ProseMirrorNode) => {
      if (node.type.name === "chart_block") {
        chartId = node.attrs["id"];
        return false;
      }
      return true;
    });

    expect(chartId).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    // The id is not merely well-formed: it addresses the Block semantically.
    const tree = getDocumentTreeForEditor(editor).getSnapshot();
    expect(tree.itemById.has(chartId as EmbeddedNodeId)).toBe(true);
  });
});

function privateSurfaceCapability(id: string): SurfaceCapability {
  const settingsSchema = z.object({}).strict();
  return {
    definition: {
      id,
      modes: ["slideshow"],
      title: "Private assessment Surface",
      description: "Private fixture Surface",
      settingsSchema,
      createSurface: ({ surfaceId }) => ({
        type: "surface",
        attrs: { id: surfaceId, variant: id, settings: {} },
        content: [{ type: "paragraph" }],
      }),
    },
    authoringView: { variantId: id, component: PrivateSurfaceView },
    runtimeView: { variantId: id, component: PrivateSurfaceView },
  };
}

function PrivateSurfaceView() {
  return null;
}

function authoringDocumentWithMcq(): JSONContent {
  return withCurrentNodeIds({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          requiresScaffoldPlus: false,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          {
            type: "surface",
            attrs: { id: MCQ_SURFACE_ID, variant: "page-default" },
            content: [
              {
                type: "mcq",
                attrs: {
                  id: MCQ_BLOCK_ID,
                  settings: McqSettingsSchema.parse({}),
                  assessment: {
                    correctOptionId: "choice000001",
                    summaryFeedback: null,
                    choiceFeedback: {},
                  },
                },
                content: [
                  {
                    type: "assessment_title",
                    content: [{ type: "paragraph" }],
                  },
                  {
                    type: "assessment_instructions",
                    content: [{ type: "paragraph" }],
                  },
                  {
                    type: "assessment_prompt",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Pick one" }],
                      },
                    ],
                  },
                  {
                    type: "assessment_choices_group",
                    content: [
                      {
                        type: "selectable_choice",
                        attrs: { id: "choice000001" },
                        content: [
                          {
                            type: "selectable_choice_body",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "A" }],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        type: "selectable_choice",
                        attrs: { id: "choice000002" },
                        content: [
                          {
                            type: "selectable_choice_body",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "B" }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "assessment_actions_group",
                    content: [
                      {
                        type: "assessment_hints_group",
                        content: [
                          {
                            type: "assessment_hint",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Use elimination." }],
                              },
                            ],
                          },
                        ],
                      },
                      { type: "assessment_summary_feedback" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
}

function authoringDocumentWithGallery(): JSONContent {
  return withCurrentNodeIds(
    fixtureCourseDocument({
      mode: "page",
      surfaces: [
        {
          type: "surface",
          attrs: { id: GALLERY_SURFACE_ID, variant: "page-default" },
          content: [
            {
              type: "gallery",
              attrs: {
                id: GALLERY_BLOCK_ID,
                data: {
                  type: "gallery",
                  layout: "carousel",
                  caption: richTextDocument("Shared authoring caption"),
                },
              },
              content: [
                galleryItem("galitem00001", "First gallery image", "first.jpg"),
                galleryItem("galitem00002", "Second gallery image", "second.jpg"),
              ],
            },
          ],
        },
      ],
    }),
  );
}

function galleryItem(id: string, alt: string, fileName: string): JSONContent {
  return {
    type: "gallery_item",
    attrs: {
      id,
      data: {
        image: { mode: "external", src: `https://example.com/${fileName}`, alt },
        caption: richTextDocument(`${alt} caption`),
      },
    },
  };
}

function richTextDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function authoringSlideshowDocument(surfaceIds: EmbeddedNodeId[]): JSONContent {
  return withCurrentNodeIds(
    fixtureCourseDocument({
      mode: "slideshow",
      surfaces: surfaceIds.map((surfaceId) =>
        slideCoverSurfaceDefinition.createSurface({ surfaceId }),
      ),
    }),
  );
}

function withCurrentNodeIds(document: JSONContent): JSONContent {
  const pending = [document];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type !== "doc" && node.type !== "text" && node.attrs?.["id"] === undefined) {
      node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
    }
    pending.push(...(node.content ?? []));
  }
  return document;
}

function courseSection(id: EmbeddedNodeId, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}

function findFirstNodeOfType(node: JSONContent | undefined, type: string): JSONContent | null {
  if (!node) return null;
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const match = findFirstNodeOfType(child, type);
    if (match) return match;
  }
  return null;
}

function testRect({ top, bottom }: { top: number; bottom: number }): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
