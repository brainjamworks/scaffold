// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  SurfaceFooterNode,
  SurfaceHeaderFooterSlotNode,
  SurfaceHeaderNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { DEFAULT_SURFACE_SETTINGS } from "@/editor/surfaces/model/surface-settings";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { SurfaceSettingsSchema } from "@/schemas/course-document";

import { applySurfaceSettings, setSurfaceSettingsChecked } from "./surface-settings-command";

const TestArrangementNode = Node.create({
  name: "surfaceAuthoringSettingsTestArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

function makeEditor(surfaceIds: readonly string[] = ["surface-a"]): Editor {
  return new Editor({
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
      SurfaceHeaderNode,
      SurfaceHeaderFooterSlotNode,
      SlideCoverSubtitleNode,
      SurfaceFooterNode,
      TestArrangementNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: surfaceIds.map((surfaceId) =>
            slideCoverSurfaceDefinition.createSurface({ surfaceId }),
          ),
        },
      ],
    },
  });
}

function surface(editor: Editor): JSONContent {
  const value = editor.getJSON().content?.[0]?.content?.[0];
  if (!value) throw new Error("Expected a surface fixture.");
  return value;
}

describe("surface authoring settings commands", () => {
  it("resolves the live surface and dispatches one checked settings transaction", () => {
    const editor = makeEditor();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const value = SurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      header: { enabled: true },
    });

    expect(
      setSurfaceSettingsChecked({
        editor,
        surfaceId: "surface-a",
        schema: SurfaceSettingsSchema,
        value,
      }),
    ).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(surface(editor).attrs?.["settings"]).toEqual(value);
    expect(surface(editor).content?.map((child) => child.type)).toEqual([
      "surface_header",
      "heading",
      "slide_cover_subtitle",
    ]);

    editor.destroy();
  });

  it("rejects invalid complete settings without dispatching", () => {
    const editor = makeEditor();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceSettingsChecked({
        editor,
        surfaceId: "surface-a",
        schema: SurfaceSettingsSchema,
        value: { background: { imagePosition: "middle" } },
      }).ok,
    ).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it.each([
    {
      label: "missing",
      create: () => makeEditor(),
      surfaceId: "missing",
      error: "The authoring target no longer exists.",
    },
    {
      label: "invalid",
      create: () => makeEditor(["surface-a", "surface-a"]),
      surfaceId: "surface-a",
      error: "The authoring target identity is invalid.",
    },
  ])("rejects a $label live target without dispatching", ({ create, surfaceId, error }) => {
    const editor = create();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceSettingsChecked({
        editor,
        surfaceId,
        schema: SurfaceSettingsSchema,
        value: DEFAULT_SURFACE_SETTINGS,
      }),
    ).toEqual({ ok: false, error });
    expect(dispatch).not.toHaveBeenCalled();

    editor.destroy();
  });

  it("rejects a destroyed editor target without dispatching", () => {
    const editor = makeEditor();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    editor.destroy();

    expect(
      setSurfaceSettingsChecked({
        editor,
        surfaceId: "surface-a",
        schema: SurfaceSettingsSchema,
        value: DEFAULT_SURFACE_SETTINGS,
      }),
    ).toEqual({ ok: false, error: "The authoring editor has been destroyed." });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("adapts only a live surface settings target without dispatching itself", () => {
    const editor = makeEditor();
    const target = createAuthoringNodeTarget(editor, {
      id: "surface-a",
      nodeType: "surface",
    }).read();
    if (!target) throw new Error("Expected a live surface target.");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const result = applySurfaceSettings({
      tr: editor.state.tr,
      target,
      attr: "data",
      schema: SurfaceSettingsSchema,
      value: DEFAULT_SURFACE_SETTINGS,
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "invalid_surface_settings_target",
        message: "Surface settings can only be applied to a surface settings attr.",
      },
    });
    expect(dispatch).not.toHaveBeenCalled();

    editor.destroy();
  });
});
