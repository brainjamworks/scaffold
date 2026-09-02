// @vitest-environment happy-dom

import { TooltipProvider } from "@radix-ui/react-tooltip";
import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type PresentationConfigurationV1,
  type TimelineActionV1,
} from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { FilePickerResult } from "@/editor/media/authoring/picker/file-picker-modal";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createInteractionStore } from "@/editor/interactions/targets/facade/interaction-store";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  resolveStructuralChromeTargetDescriptor,
  type SurfaceChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

import {
  SurfaceMenuBubbleContent,
  resolveSurfaceMenuSnapshot,
  surfaceMenuSnapshotHasControls,
} from "./surface-bubble-controls";

const picker = vi.hoisted(() => ({
  result: null as FilePickerResult | null,
}));

const PRESENTATION_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");

vi.mock("@/editor/media/authoring/picker/LazyFilePickerModal", () => ({
  FilePickerModal: ({
    open,
    onResolved,
  }: {
    open: boolean;
    onResolved: (result: FilePickerResult) => boolean | void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          if (!picker.result) throw new Error("The test file picker has no result.");
          onResolved(picker.result);
        }}
      >
        Choose narration file
      </button>
    ) : null,
}));

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

function renderWithFacade(children: ReactNode) {
  return render(
    <InteractionProvider store={createInteractionStore()}>
      <TooltipProvider>{children}</TooltipProvider>
    </InteractionProvider>,
  );
}

function surfaceDescriptor(editor: Editor, surfaceId: string): SurfaceChromeTargetDescriptor {
  const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, {
    id: surfaceId,
    kind: InteractionTargetKind.Surface,
  });
  if (descriptor?.kind !== InteractionTargetKind.Surface) {
    throw new Error(`Could not resolve surface descriptor "${surfaceId}".`);
  }
  return descriptor;
}

describe("SurfaceMenuBubbleContent", () => {
  it("attaches and replaces one Surface narration source through the checked command", async () => {
    const editor = createPresentationEditor();
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    const narrationSnapshot = withoutDefaultActions(snapshot);
    const rendered = renderWithFacade(
      <SurfaceMenuBubbleContent
        descriptor={descriptor}
        editor={editor}
        snapshot={narrationSnapshot}
      />,
    );

    picker.result = {
      source: "url",
      mediaType: "audio",
      url: "https://example.test/intro.mp3",
    };
    fireEvent.click(screen.getByRole("button", { name: "Add narration" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose narration file" }));

    await waitFor(() =>
      expect(readSurfaceTimeline(editor, "surface00001")?.narration).toEqual({
        source: { mode: "external", src: "https://example.test/intro.mp3" },
      }),
    );

    rendered.rerender(
      <InteractionProvider store={createInteractionStore()}>
        <TooltipProvider>
          <SurfaceMenuBubbleContent
            descriptor={descriptor}
            editor={editor}
            snapshot={withoutDefaultActions(
              resolveSurfaceMenuSnapshot(editor, descriptor, builtInSurfaceAuthoringChromeResolver),
            )}
          />
        </TooltipProvider>
      </InteractionProvider>,
    );
    picker.result = {
      source: "browse",
      mediaType: "audio",
      browse: {
        id: "narration-2",
        url: "https://cdn.example.test/narration-2.mp3",
        mediaType: "audio",
        fileName: "narration-2.mp3",
        mimeType: "audio/mpeg",
        size: 42,
      },
    };
    fireEvent.click(screen.getByRole("button", { name: "Replace narration" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose narration file" }));

    await waitFor(() =>
      expect(readSurfaceTimeline(editor, "surface00001")?.narration).toEqual({
        source: { mode: "managed", mediaId: "narration-2" },
      }),
    );
    expect(screen.queryByRole("button", { name: /video/i })).toBeNull();
    editor.destroy();
  });

  it("removes narration without changing authored actions or duration", async () => {
    const action: TimelineActionV1 = {
      kind: "manual-wait",
      id: EmbeddedDataIdSchema.parse("wait00000001"),
      isEnabled: true,
      atMs: 2_000,
    };
    const editor = createPresentationEditor({
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: [
        {
          surfaceId: PRESENTATION_SURFACE_ID,
          durationMs: 8_000,
          narration: {
            source: { mode: "external", src: "https://example.test/intro.mp3" },
          },
          actions: [action],
        },
      ],
    });
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent
        descriptor={descriptor}
        editor={editor}
        snapshot={withoutDefaultActions(snapshot)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove narration" }));

    await waitFor(() => {
      expect(readSurfaceTimeline(editor, "surface00001")).toEqual({
        surfaceId: "surface00001",
        durationMs: 8_000,
        actions: [action],
      });
    });
    editor.destroy();
  });

  it("renders default slide actions before variant quick controls", () => {
    const editor = createEditor("slideshow", [
      surface("surface00001", "slide-cover"),
      surface("surface00002", "slide-cover"),
    ]);
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    expect(surfaceMenuSnapshotHasControls(snapshot)).toBe(true);

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    expect(screen.getByRole("button", { name: "Copy slide" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Duplicate slide" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: "Delete slide" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("radiogroup", { name: "Horizontal alignment" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Vertical position" })).toBeNull();
    expect(screen.getByRole("button", { name: "Background colour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open surface settings" })).toBeInTheDocument();

    editor.destroy();
  });

  it("disables deleting the final remaining slide", () => {
    const editor = createEditor("slideshow", [surface("surface00001", "slide-cover")]);
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    expect(screen.getByRole("button", { name: "Copy slide" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Duplicate slide" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: "Delete slide" })).toHaveProperty("disabled", true);

    editor.destroy();
  });

  it("duplicates the Surface identified by the menu snapshot instead of its transient position", () => {
    const editor = createEditor("slideshow", [
      surface("surface00001", "slide-cover"),
      surface("surface00002", "slide-cover"),
    ]);
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const resolved = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    const snapshot = resolved ? { ...resolved, surfacePos: 9999 } : null;

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    const duplicate = screen.getByRole("button", { name: "Duplicate slide" });
    expect(duplicate).toHaveProperty("disabled", false);
    fireEvent.click(duplicate);
    expect(readCourseChildren(editor).map((child) => child.attrs?.["id"])).toEqual([
      "surface00001",
      expect.not.stringMatching(/^surface0000[12]$/),
      "surface00002",
    ]);

    editor.destroy();
  });

  it("deletes the Surface identified by the menu snapshot instead of its transient position", () => {
    const editor = createEditor("slideshow", [
      surface("surface00001", "slide-cover"),
      surface("surface00002", "slide-cover"),
    ]);
    const descriptor = surfaceDescriptor(editor, "surface00002");
    const resolved = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    const snapshot = resolved ? { ...resolved, surfacePos: 9999 } : null;

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    const remove = screen.getByRole("button", { name: "Delete slide" });
    expect(remove).toHaveProperty("disabled", false);
    fireEvent.click(remove);
    expect(readCourseChildren(editor).map((child) => child.attrs?.["id"])).toEqual([
      "surface00001",
    ]);

    editor.destroy();
  });

  it("renders common surface controls for page surfaces", () => {
    const editor = createEditor("page", [surface("surface00001", "page-default")]);
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    expect(screen.queryByRole("button", { name: "Duplicate surface" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy surface" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy slide" })).toBeNull();
    expect(screen.getByRole("button", { name: "Background colour" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Horizontal alignment" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Vertical position" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open surface settings" })).toBeInTheDocument();

    editor.destroy();
  });

  it("updates surface background colour from the quick menu", async () => {
    const editor = createEditor("slideshow", [surface("surface00001", "slide-cover")]);
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Background colour" }));
    fireEvent.click(await screen.findByRole("button", { name: "Navy background" }));

    await waitFor(() => {
      expect(readSurfaceBackground(editor, "surface00001")).toEqual({
        color: "#161D77",
      });
    });

    editor.destroy();
  });

  it("resets empty surface backgrounds by removing the settings key", async () => {
    const editor = createEditor("slideshow", [
      surface("surface00001", "slide-cover", { color: "#161D77" }),
    ]);
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Background colour" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Use default background colour",
      }),
    );

    await waitFor(() => {
      expect(readSurfaceBackground(editor, "surface00001")).toBeUndefined();
    });

    editor.destroy();
  });
});

function createEditor(mode: "page" | "slideshow", surfaces: JSONContent[]): Editor {
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities: [],
    layoutDefinitions: [],
    surfaceDefinitions: [pageDefaultSurfaceDefinition, slideCoverSurfaceDefinition],
  });
  return new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      DocumentNode,
      StarterKit.configure({
        document: false,
        heading: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      SlideCoverSubtitleNode,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      TestSectionArrangementNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createCourseStructureCommandsExtension(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode },
          content: surfaces,
        },
      ],
    },
  });
}

function createPresentationEditor(presentation: PresentationConfigurationV1 | null = null): Editor {
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: createCoreScaffoldAuthoringComposition(),
    }),
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            id: "course000001",
            mode: "slideshow",
            presentation,
            surfaceSize: "16x9",
            overflowMode: "fit",
          },
          content: [
            {
              type: "courseSection",
              attrs: { id: "section00001", title: "Presentation" },
            },
            slideCoverSurfaceDefinition.createSurface({ surfaceId: PRESENTATION_SURFACE_ID }),
          ],
        },
      ],
    },
  });
}

function readSurfaceTimeline(editor: Editor, surfaceId: string) {
  const presentation = editor.getJSON().content?.[0]?.attrs?.["presentation"] as
    | { surfaces?: Array<Record<string, unknown>> }
    | null
    | undefined;
  return presentation?.surfaces?.find((surface) => surface["surfaceId"] === surfaceId);
}

function withoutDefaultActions(snapshot: ReturnType<typeof resolveSurfaceMenuSnapshot>) {
  if (!snapshot) return null;
  const { defaultActions: _defaultActions, ...rest } = snapshot;
  return rest;
}

function readCourseChildren(editor: Editor): JSONContent[] {
  return editor.getJSON().content?.[0]?.content ?? [];
}

function surface(id: string, variant: string, background?: Record<string, unknown>): JSONContent {
  const suffix = id.endsWith("2") ? "2" : "1";
  return {
    type: "surface",
    attrs: {
      id,
      settings: {
        ...(background ? { background } : {}),
      },
      variant,
    },
    content:
      variant === "slide-cover"
        ? [
            {
              type: "heading",
              attrs: { id: `heading0000${suffix}`, level: 1 },
              content: [{ type: "text", text: id }],
            },
            {
              type: "slide_cover_subtitle",
              attrs: { id: `subtitle000${suffix}` },
              content: [{ type: "paragraph", attrs: { id: `paragraph00${suffix}` } }],
            },
          ]
        : [
            {
              type: "paragraph",
              attrs: { id: `paragraph00${suffix}` },
              content: [{ type: "text", text: id }],
            },
          ],
  };
}

function readSurfaceBackground(editor: Editor, surfaceId: string): unknown {
  let background: unknown;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "surface" && node.attrs["id"] === surfaceId) {
      const settings = node.attrs["settings"];
      background =
        typeof settings === "object" && settings !== null && !Array.isArray(settings)
          ? settings["background"]
          : undefined;
      return false;
    }

    return true;
  });
  return background;
}
