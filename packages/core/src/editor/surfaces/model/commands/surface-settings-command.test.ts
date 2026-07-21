// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ZodTypeAny } from "zod";

import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  SurfaceFooterNode,
  SurfaceHeaderFooterSlotNode,
  SurfaceHeaderNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { SurfaceSettingsSchema } from "@/schemas/course-document";

import { DEFAULT_SURFACE_SETTINGS, readSurfaceVerticalPosition } from "../surface-settings";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";
import { slideContentSurfaceDefinition } from "../templates/slide-content";
import { slideSideTitleSurfaceDefinition } from "../templates/slide-side-title";
import { slideTwoColumnsSurfaceDefinition } from "../templates/slide-two-columns";
import { setSurfaceFooterEnabled, setSurfaceHeaderEnabled } from "./header-footer-commands";
import type { SurfaceVariantDefinition } from "../surface-variant-definition";
import {
  updateSurfaceSettingsChecked,
  setSurfaceVerticalPositionInTransaction,
} from "./surface-settings-command";
import { createSurfaceVariantRegistry } from "../surface-variant-registry";

const surfaceVariants = createSurfaceVariantRegistry([
  slideCoverSurfaceDefinition,
  slideContentSurfaceDefinition,
]);
const contentOnlySurfaceVariants = createSurfaceVariantRegistry([
  {
    ...slideContentSurfaceDefinition,
    defaultForModes: ["slideshow"],
  } satisfies SurfaceVariantDefinition,
]);

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

function makeEditor({
  content,
  mode = "slideshow",
  settings = DEFAULT_SURFACE_SETTINGS,
  variant,
}: {
  content: JSONContent[];
  mode?: "page" | "slideshow";
  settings?: Record<string, unknown>;
  variant: string;
}): Editor {
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
      SlideTitleNode,
      SurfaceHeaderNode,
      SurfaceHeaderFooterSlotNode,
      SlideCoverSubtitleNode,
      SurfaceFooterNode,
      TestArrangementNode,
      TestSectionArrangementNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode },
          content: [
            {
              type: "surface",
              attrs: {
                id: "surface-a",
                variant,
                settings,
              },
              content,
            },
          ],
        },
      ],
    },
  });
}

function surfaceContentTypes(editor: Editor): string[] {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = course?.content?.[0] as JSONContent | undefined;
  return surface?.content?.map((child) => child.type ?? "") ?? [];
}

function surfaceSettings(editor: Editor): Record<string, unknown> {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = course?.content?.[0] as JSONContent | undefined;
  return (surface?.attrs?.["settings"] as Record<string, unknown>) ?? {};
}

function surfaceContent(editor: Editor): JSONContent[] {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = course?.content?.[0] as JSONContent | undefined;
  return surface?.content ?? [];
}

function applySurfaceSettingsAndDispatch({
  editor,
  schema,
  value,
}: {
  editor: Editor;
  schema: ZodTypeAny;
  value: unknown;
}) {
  const result = updateSurfaceSettingsChecked({
    tr: editor.state.tr,
    surfaceId: "surface-a",
    schema,
    value,
  });
  if (result.ok) editor.view.dispatch(result.tr);
  return result.ok ? { ok: true as const } : result;
}

function headerFooterSlotPositions(
  editor: Editor,
  headerFooterType: "surface_header" | "surface_footer",
) {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = course?.content?.[0] as JSONContent | undefined;
  const headerFooter = surface?.content?.find((child) => child.type === headerFooterType);
  return headerFooter?.content?.map((child) => child.attrs?.["position"]) ?? [];
}

describe("surface header/footer commands", () => {
  it("inserts and removes a header fixture with the invariant slot shape", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    let tr = editor.state.tr;
    expect(
      setSurfaceHeaderEnabled({
        tr,
        surfaceId: "surface-a",
        enabled: true,
      }),
    ).toEqual({ ok: true });
    editor.view.dispatch(tr);

    expect(surfaceContentTypes(editor)).toEqual([
      "surface_header",
      "heading",
      "slide_cover_subtitle",
    ]);
    expect(headerFooterSlotPositions(editor, "surface_header")).toEqual([
      "left",
      "center",
      "right",
    ]);

    tr = editor.state.tr;
    expect(
      setSurfaceHeaderEnabled({
        tr,
        surfaceId: "surface-a",
        enabled: false,
      }),
    ).toEqual({ ok: true });
    editor.view.dispatch(tr);

    expect(surfaceContentTypes(editor)).toEqual(["heading", "slide_cover_subtitle"]);

    editor.destroy();
  });

  it("inserts the footer fixture after surface content", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });
    const tr = editor.state.tr;

    expect(
      setSurfaceFooterEnabled({
        tr,
        surfaceId: "surface-a",
        enabled: true,
      }),
    ).toEqual({ ok: true });
    editor.view.dispatch(tr);

    expect(surfaceContentTypes(editor)).toEqual([
      "heading",
      "slide_cover_subtitle",
      "surface_footer",
    ]);
    expect(headerFooterSlotPositions(editor, "surface_footer")).toEqual([
      "left",
      "center",
      "right",
    ]);

    editor.destroy();
  });

  it("reports an unknown surface id without dispatching structural changes", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(
      setSurfaceHeaderEnabled({
        tr: editor.state.tr,
        surfaceId: "missing-surface",
        enabled: true,
      }),
    ).toEqual({
      ok: false,
      error: 'Surface "missing-surface" was not found.',
    });

    expect(surfaceContentTypes(editor)).toEqual(["heading", "slide_cover_subtitle"]);

    editor.destroy();
  });
});

describe("updateSurfaceSettingsChecked", () => {
  it("checks a supplied transaction without dispatching on invalid values", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "slide_cover_subtitle", content: [{ type: "paragraph" }] },
      ],
    });
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      updateSurfaceSettingsChecked({
        tr: editor.state.tr,
        surfaceId: "surface-a",
        schema: SurfaceSettingsSchema,
        value: { background: { imagePosition: "middle" } },
      }).ok,
    ).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("returns reconciled settings and structure without dispatching the editor", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "slide_cover_subtitle", content: [{ type: "paragraph" }] },
      ],
    });
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const surfacePos = nodePosition(editor, "surface");
    const nextSettings = SurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      header: { enabled: true },
      footer: { enabled: true },
    });

    const result = updateSurfaceSettingsChecked({
      tr: editor.state.tr,
      surfaceId: "surface-a",
      schema: SurfaceSettingsSchema,
      value: nextSettings,
    });

    expect(result.ok).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(surfaceContentTypes(editor)).toEqual(["heading", "slide_cover_subtitle"]);
    if (!result.ok) return;
    expect(result.tr.doc.textContent).toBe(editor.state.doc.textContent);
    const resultSurface = result.tr.doc.nodeAt(surfacePos);
    expect(resultSurface?.content.content.map((node) => node.type.name)).toEqual([
      "surface_header",
      "heading",
      "slide_cover_subtitle",
      "surface_footer",
    ]);

    editor.destroy();
  });

  it("persists Content title visibility without changing authored children", () => {
    const created = slideContentSurfaceDefinition.createSurface({ surfaceId: "surface-a" });
    const content = created.content ?? [];
    content[0] = {
      type: "slide_title",
      content: [{ type: "text", text: "Authored title" }],
    };
    const editor = makeEditor({
      variant: "slide-content",
      settings: created.attrs?.["settings"] as Record<string, unknown>,
      content,
    });
    const beforeContent = surfaceContent(editor);
    const nextSettings = slideContentSurfaceDefinition.settingsSchema.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      slideTitle: { enabled: false },
    });

    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: slideContentSurfaceDefinition.settingsSchema,
        value: nextSettings,
      }),
    ).toEqual({ ok: true });
    expect(surfaceSettings(editor)).toMatchObject({ slideTitle: { enabled: false } });
    expect(surfaceContent(editor)).toEqual(beforeContent);

    editor.destroy();
  });

  it("changes Two columns orientation and proportion without rewriting logical children", () => {
    const created = slideTwoColumnsSurfaceDefinition.createSurface({ surfaceId: "surface-a" });
    const editor = makeEditor({
      variant: slideTwoColumnsSurfaceDefinition.id,
      settings: created.attrs?.["settings"] as Record<string, unknown>,
      content: created.content ?? [],
    });
    const beforeContent = surfaceContent(editor);
    const nextSettings = slideTwoColumnsSurfaceDefinition.settingsSchema.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      orientation: "reversed",
      proportion: "two-thirds-one-third",
    });

    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: slideTwoColumnsSurfaceDefinition.settingsSchema,
        value: nextSettings,
      }),
    ).toEqual({ ok: true });
    expect(surfaceSettings(editor)).toMatchObject({
      orientation: "reversed",
      proportion: "two-thirds-one-third",
    });
    expect(surfaceContent(editor)).toEqual(beforeContent);

    editor.destroy();
  });

  it("strips legacy Side title proportion while preserving orientation and logical children", () => {
    const created = slideSideTitleSurfaceDefinition.createSurface({ surfaceId: "surface-a" });
    const editor = makeEditor({
      variant: slideSideTitleSurfaceDefinition.id,
      settings: created.attrs?.["settings"] as Record<string, unknown>,
      content: created.content ?? [],
    });
    const beforeContent = surfaceContent(editor);
    const nextSettings = slideSideTitleSurfaceDefinition.settingsSchema.parse({
      ...(created.attrs?.["settings"] as Record<string, unknown>),
      orientation: "reversed",
      proportion: "two-thirds-one-third",
    });

    expect(nextSettings).not.toHaveProperty("proportion");
    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: slideSideTitleSurfaceDefinition.settingsSchema,
        value: nextSettings,
      }),
    ).toEqual({ ok: true });
    expect(surfaceSettings(editor)).toMatchObject({ orientation: "reversed" });
    expect(surfaceSettings(editor)).not.toHaveProperty("proportion");
    expect(surfaceContent(editor)).toEqual(beforeContent);

    editor.destroy();
  });

  it("persists positioned backgrounds without losing sibling settings", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });
    const nextSettings = SurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      background: {
        color: "#161D77",
        imageUrl: "https://example.test/background.png",
        imageAlt: "Background image",
        imagePosition: "bottom-right",
      },
    });

    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: SurfaceSettingsSchema,
        value: nextSettings,
      }),
    ).toEqual({ ok: true });

    expect(surfaceSettings(editor)).toEqual(nextSettings);

    editor.destroy();
  });

  it("inserts and removes common surface header/footer nodes on cover slides", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      content: [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    const enabledSettings = SurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      header: { enabled: true },
      footer: { enabled: true },
    });

    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: SurfaceSettingsSchema,
        value: enabledSettings,
      }),
    ).toEqual({ ok: true });

    expect(surfaceContentTypes(editor)).toEqual([
      "surface_header",
      "heading",
      "slide_cover_subtitle",
      "surface_footer",
    ]);
    expect(headerFooterSlotPositions(editor, "surface_header")).toEqual([
      "left",
      "center",
      "right",
    ]);
    expect(headerFooterSlotPositions(editor, "surface_footer")).toEqual([
      "left",
      "center",
      "right",
    ]);
    expect(surfaceSettings(editor)).toMatchObject({
      header: { enabled: true },
      footer: { enabled: true },
    });

    const disabledSettings = SurfaceSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      header: { enabled: false },
      footer: { enabled: false },
    });

    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: SurfaceSettingsSchema,
        value: disabledSettings,
      }),
    ).toEqual({ ok: true });

    expect(surfaceContentTypes(editor)).toEqual(["heading", "slide_cover_subtitle"]);
    expect(surfaceSettings(editor)).toMatchObject({
      header: { enabled: false },
      footer: { enabled: false },
    });

    editor.destroy();
  });

  it("applies the same header and footer invariant to page surfaces", () => {
    const editor = makeEditor({
      mode: "page",
      variant: "page-default",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Page body" }],
        },
      ],
    });

    expect(
      applySurfaceSettingsAndDispatch({
        editor,
        schema: SurfaceSettingsSchema,
        value: SurfaceSettingsSchema.parse({
          ...DEFAULT_SURFACE_SETTINGS,
          header: { enabled: true },
          footer: { enabled: true },
        }),
      }),
    ).toEqual({ ok: true });

    expect(surfaceContentTypes(editor)).toEqual(["surface_header", "paragraph", "surface_footer"]);
    expect(headerFooterSlotPositions(editor, "surface_header")).toEqual([
      "left",
      "center",
      "right",
    ]);
    expect(headerFooterSlotPositions(editor, "surface_footer")).toEqual([
      "left",
      "center",
      "right",
    ]);

    editor.destroy();
  });
});

describe("Surface vertical content position", () => {
  it("reads explicit capable values and normalizes missing or invalid data to the definition default", () => {
    expect(readSurfaceVerticalPosition(undefined, slideCoverSurfaceDefinition)).toBe("middle");
    expect(
      readSurfaceVerticalPosition({ verticalPosition: "sideways" }, slideCoverSurfaceDefinition),
    ).toBe("middle");
    expect(
      readSurfaceVerticalPosition({ verticalPosition: "top" }, slideCoverSurfaceDefinition),
    ).toBe("top");
    expect(
      readSurfaceVerticalPosition({ verticalPosition: "bottom" }, slideCoverSurfaceDefinition),
    ).toBe("bottom");
    expect(
      readSurfaceVerticalPosition({ verticalPosition: "bottom" }, slideContentSurfaceDefinition),
    ).toBeNull();
  });

  it("writes capable Surface state on the supplied transaction without dispatching", () => {
    const settings = {
      ...DEFAULT_SURFACE_SETTINGS,
      background: { color: "#161D77" },
    };
    const editor = makeEditor({
      variant: "slide-cover",
      settings,
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "slide_cover_subtitle", content: [{ type: "paragraph" }] },
      ],
    });
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const surfacePos = nodePosition(editor, "surface");

    const tr = setSurfaceVerticalPositionInTransaction(
      editor.state.tr,
      surfacePos,
      "bottom",
      surfaceVariants,
    );

    expect(tr).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(tr?.doc.nodeAt(surfacePos)?.attrs["settings"]).toEqual({
      ...settings,
      verticalPosition: "bottom",
    });
    expect(surfaceSettings(editor)).toEqual(settings);

    editor.destroy();
  });

  it("composes without dispatch and rejects unavailable, invalid, stale, and no-op writes", () => {
    const editor = makeEditor({
      variant: "slide-cover",
      settings: { ...DEFAULT_SURFACE_SETTINGS, verticalPosition: "top" },
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "slide_cover_subtitle", content: [{ type: "paragraph" }] },
      ],
    });
    const surfacePos = nodePosition(editor, "surface");
    const tr = setSurfaceVerticalPositionInTransaction(
      editor.state.tr,
      surfacePos,
      "bottom",
      surfaceVariants,
    );

    expect(tr?.doc.nodeAt(surfacePos)?.attrs["settings"]).toMatchObject({
      verticalPosition: "bottom",
    });
    expect(editor.state.doc.nodeAt(surfacePos)?.attrs["settings"]).toMatchObject({
      verticalPosition: "top",
    });
    expect(
      setSurfaceVerticalPositionInTransaction(
        editor.state.tr,
        surfacePos,
        "top",
        surfaceVariants,
      )?.doc.eq(editor.state.doc),
    ).toBe(true);
    expect(
      setSurfaceVerticalPositionInTransaction(editor.state.tr, 999, "middle", surfaceVariants),
    ).toBeNull();
    expect(
      setSurfaceVerticalPositionInTransaction(
        editor.state.tr,
        surfacePos,
        "sideways" as never,
        surfaceVariants,
      ),
    ).toBeNull();
    expect(
      setSurfaceVerticalPositionInTransaction(
        editor.state.tr,
        surfacePos,
        "bottom",
        contentOnlySurfaceVariants,
      ),
    ).toBeNull();

    editor.destroy();

    const unavailableEditor = makeEditor({
      variant: "slide-content",
      content: [
        { type: "slide_title" },
        { type: "region", attrs: { role: "main" }, content: [{ type: "paragraph" }] },
      ],
    });
    expect(
      setSurfaceVerticalPositionInTransaction(
        unavailableEditor.state.tr,
        nodePosition(unavailableEditor, "surface"),
        "bottom",
        surfaceVariants,
      ),
    ).toBeNull();
    unavailableEditor.destroy();
  });
});

function nodePosition(editor: Editor, type: string): number {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== type) return true;
    result = pos;
    return false;
  });
  if (result === null) throw new Error(`expected ${type}`);
  return result;
}
