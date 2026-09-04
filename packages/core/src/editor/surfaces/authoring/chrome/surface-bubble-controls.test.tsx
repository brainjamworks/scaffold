// @vitest-environment happy-dom

import { TooltipProvider } from "@radix-ui/react-tooltip";
import { EmbeddedNodeIdSchema, type PresentationConfigurationV1 } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { MediaPort } from "@/host/ports/media";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import {
  ARRANGEMENT_CONTENT,
  ASSESSMENT_QUESTION_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createInteractionStore } from "@/editor/interactions/targets/facade/interaction-store";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { ShellLayoutProvider } from "@/editor/shell/layout/ShellLayoutProvider";
import { createShellLayoutStore } from "@/editor/shell/layout/shell-layout-store";
import type { SurfaceWorkspaceRequestPort } from "@/editor/shell/workspaces/surface-workspace-request";
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

const PRESENTATION_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");

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

const TestAssessmentQuestionNode = Node.create({
  name: "testAssessmentQuestion",
  group: ASSESSMENT_QUESTION_CONTENT,
  content: "paragraph*",
});

function renderWithFacade(
  children: ReactNode,
  media: MediaPort | null = null,
  workspaceRequest: SurfaceWorkspaceRequestPort | null = null,
) {
  const tree = (
    <InteractionProvider store={createInteractionStore()}>
      <TooltipProvider>{children}</TooltipProvider>
    </InteractionProvider>
  );
  let content = tree;
  if (workspaceRequest) {
    const store = createShellLayoutStore();
    store.setState({ openBottomPanel: workspaceRequest.open });
    content = <ShellLayoutProvider store={store}>{tree}</ShellLayoutProvider>;
  }
  return render(
    <ScaffoldServicesProvider ports={{ media }}>{content}</ScaffoldServicesProvider>,
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
  it("opens the Timeline and Interactions workspaces for the menu Surface", () => {
    const editor = createPresentationEditor();
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    const workspaceRequest = { open: vi.fn() };

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
      null,
      workspaceRequest,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Open interactions" }));

    expect(workspaceRequest.open.mock.calls).toEqual([
      ["timeline", PRESENTATION_SURFACE_ID],
      ["interactions", PRESENTATION_SURFACE_ID],
    ]);
    expect(screen.queryByRole("button", { name: /narration/i })).toBeNull();
    editor.destroy();
  });

  it("offers no workspace controls outside an authoring App", () => {
    const editor = createPresentationEditor();
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    expect(screen.queryByRole("button", { name: "Open timeline" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open interactions" })).toBeNull();
    expect(screen.getByRole("button", { name: "Duplicate slide" })).toBeInTheDocument();
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
      TestAssessmentQuestionNode,
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
