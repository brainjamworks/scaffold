// @vitest-environment happy-dom

import { TooltipProvider } from "@radix-ui/react-tooltip";
import { EmbeddedNodeIdSchema, type PresentationConfigurationV1 } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { MediaPort } from "@/host/ports/media";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
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
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

import {
  SurfaceMenuBubbleContent,
  resolveSurfaceMenuSnapshot,
  surfaceMenuSnapshotHasControls,
} from "./surface-bubble-controls";

const PRESENTATION_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");

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
    const editor = createEditor("slideshow", ["surface00001", "surface00002"]);
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
    const editor = createEditor("slideshow", ["surface00001"]);
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

  it("keeps Surface options usable for a one-slide presentation", () => {
    const editor = createEditor("slideshow", ["surface00001"], {
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: [{ surfaceId: PRESENTATION_SURFACE_ID, durationMs: 0, actions: [] }],
    });
    const descriptor = surfaceDescriptor(editor, "surface00001");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    expect(() =>
      renderWithFacade(
        <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
      ),
    ).not.toThrow();

    expect(screen.getByRole("button", { name: "Delete slide" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Duplicate slide" })).toHaveProperty(
      "disabled",
      false,
    );

    editor.destroy();
  });

  it("duplicates the Surface identified by the menu snapshot instead of its transient position", () => {
    const editor = createEditor("slideshow", ["surface00001", "surface00002"]);
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
    const editor = createEditor("slideshow", ["surface00001", "surface00002"]);
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
    const editor = createEditor("page", ["surface00001"]);
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
    const editor = createEditor("slideshow", ["surface00001"]);
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
    const editor = createEditor("slideshow", [{ surfaceId: "surface00001", background: { color: "#161D77" } }]);
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

interface TestSurfaceSpec {
  readonly surfaceId: string;
  readonly background?: Record<string, unknown>;
}

function createSurfaceContent(
  mode: "page" | "slideshow",
  spec: string | TestSurfaceSpec,
): JSONContent {
  const { surfaceId, background } = typeof spec === "string" ? { surfaceId: spec } : spec;
  const definition =
    mode === "page" ? pageDefaultSurfaceDefinition : slideCoverSurfaceDefinition;
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
  }) as JSONContent;
  if (!background) return surface;

  const settings = surface.attrs?.["settings"];
  return {
    ...surface,
    attrs: {
      ...surface.attrs,
      settings: {
        ...(typeof settings === "object" && settings !== null && !Array.isArray(settings)
          ? settings
          : {}),
        background,
      },
    },
  };
}

/**
 * Builds a Course Document through the real authoring composition so structure
 * commands run against the shipped schema rather than a hand-written fixture.
 */
function createEditor(
  mode: "page" | "slideshow",
  surfaces: readonly (string | TestSurfaceSpec)[],
  presentation: PresentationConfigurationV1 | null = null,
): Editor {
  const surfaceContent = surfaces.map((spec) => createSurfaceContent(mode, spec));
  const content =
    mode === "slideshow"
      ? [
          {
            type: "courseSection",
            attrs: { id: "section00001", title: "Presentation" },
          },
          ...surfaceContent,
        ]
      : surfaceContent;

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
            mode,
            presentation,
            surfaceSize: "16x9",
            overflowMode: "fit",
          },
          content,
        },
      ],
    },
  });
}

function createPresentationEditor(presentation: PresentationConfigurationV1 | null = null): Editor {
  return createEditor("slideshow", [PRESENTATION_SURFACE_ID], presentation);
}

function readCourseChildren(editor: Editor): JSONContent[] {
  const children = editor.getJSON().content?.[0]?.content ?? [];
  return children.filter((child) => child.type === "surface");
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
