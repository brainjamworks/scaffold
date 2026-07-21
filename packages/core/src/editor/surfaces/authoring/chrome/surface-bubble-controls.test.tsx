// @vitest-environment happy-dom

import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
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
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";

import {
  SurfaceMenuBubbleContent,
  resolveSurfaceMenuSnapshot,
  surfaceMenuSnapshotHasControls,
} from "./surface-bubble-controls";

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
  it("renders default slide actions before variant quick controls", () => {
    const editor = createEditor("slideshow", [
      surface("surface-1", "slide-cover"),
      surface("surface-2", "slide-cover"),
    ]);
    const descriptor = surfaceDescriptor(editor, "surface-1");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );
    expect(surfaceMenuSnapshotHasControls(snapshot)).toBe(true);

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

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
    const editor = createEditor("slideshow", [surface("surface-1", "slide-cover")]);
    const descriptor = surfaceDescriptor(editor, "surface-1");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    expect(screen.getByRole("button", { name: "Duplicate slide" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: "Delete slide" })).toHaveProperty("disabled", true);

    editor.destroy();
  });

  it("renders common surface controls for page surfaces", () => {
    const editor = createEditor("page", [surface("surface-1", "page-default")]);
    const descriptor = surfaceDescriptor(editor, "surface-1");
    const snapshot = resolveSurfaceMenuSnapshot(
      editor,
      descriptor,
      builtInSurfaceAuthoringChromeResolver,
    );

    renderWithFacade(
      <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />,
    );

    expect(screen.queryByRole("button", { name: "Duplicate surface" })).toBeNull();
    expect(screen.getByRole("button", { name: "Background colour" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Horizontal alignment" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Vertical position" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open surface settings" })).toBeInTheDocument();

    editor.destroy();
  });

  it("updates surface background colour from the quick menu", async () => {
    const editor = createEditor("slideshow", [surface("surface-1", "slide-cover")]);
    const descriptor = surfaceDescriptor(editor, "surface-1");
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
      expect(readSurfaceBackground(editor, "surface-1")).toEqual({
        color: "#161D77",
      });
    });

    editor.destroy();
  });

  it("resets empty surface backgrounds by removing the settings key", async () => {
    const editor = createEditor("slideshow", [
      surface("surface-1", "slide-cover", { color: "#161D77" }),
    ]);
    const descriptor = surfaceDescriptor(editor, "surface-1");
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
      expect(readSurfaceBackground(editor, "surface-1")).toBeUndefined();
    });

    editor.destroy();
  });
});

function createEditor(mode: "page" | "slideshow", surfaces: JSONContent[]): Editor {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      TestSectionArrangementNode,
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

function surface(id: string, variant: string, background?: Record<string, unknown>): JSONContent {
  return {
    type: "surface",
    attrs: {
      id,
      settings: {
        ...(background ? { background } : {}),
      },
      variant,
    },
    content: [
      {
        type: "paragraph",
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
