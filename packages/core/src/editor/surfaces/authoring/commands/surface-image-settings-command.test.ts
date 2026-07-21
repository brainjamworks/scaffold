// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { z } from "zod";
import { describe, expect, it, vi } from "vite-plus/test";

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

import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { defineSlideCompositionSurface } from "@/editor/surfaces/model/slide-composition-definition";
import type { RegisteredSlideCompositionSurfaceDefinition } from "@/editor/surfaces/model/slide-composition-definition";
import { slideImageContentSplitSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-image-content-split";
import { slideImageContentStackedSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-image-content-stacked";
import { slideDiptychSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-diptych";
import { slideTriptychSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-triptych";
import { defineSurfaceImageRoles } from "@/editor/surfaces/model/surface-owned-image";
import { setSurfaceOwnedImageChecked } from "./surface-image-settings-command";
import { DEFAULT_SURFACE_SETTINGS } from "@/editor/surfaces/model/surface-settings";

const registeredSlideCoverSurfaceDefinition = builtInSurfaceVariantRegistry.get("slide-cover");
if (!registeredSlideCoverSurfaceDefinition) {
  throw new Error("Expected the built-in slide-cover surface definition.");
}

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

const TestImageLayoutSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: z.object({ enabled: z.boolean() }).strict().default({ enabled: true }),
  orientation: z.enum(["default", "reversed"]).default("default"),
  proportion: z.enum(["equal", "one-third-two-thirds", "two-thirds-one-third"]).default("equal"),
  images: defineSurfaceImageRoles(["primary"]).default({}),
}).strict();

const testImageLayoutDefinition = defineSlideCompositionSurface({
  id: "test-phase-four-image-command",
  title: "Test image command",
  description: "Test-only image command fixture.",
  catalogue: {
    section: "image",
    order: 999,
    preview: {
      kind: "row",
      children: [
        { kind: "slot", role: "image" },
        { kind: "slot", role: "content" },
      ],
    },
  },
  slideComposition: {
    id: "image-content-split",
    title: "optional-default-on",
    regions: ["main"],
    imageSlots: ["primary"],
    orientation: { default: "default", options: ["default", "reversed"] },
    proportion: {
      default: "equal",
      options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
    },
  },
  settingsSchema: TestImageLayoutSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "test-phase-four-image-command",
      settings: TestImageLayoutSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS),
    },
    content: [
      { type: "slide_title" },
      {
        type: "region",
        attrs: { id: `${surfaceId}-main`, role: "main" },
        content: [{ type: "paragraph" }],
      },
    ],
  }),
});

function makeEditor({
  definition = testImageLayoutDefinition,
  settings,
  surfaceIds = ["surface-a"],
  variant = definition.id,
}: {
  definition?: RegisteredSlideCompositionSurfaceDefinition;
  settings?: Record<string, unknown>;
  surfaceIds?: readonly string[];
  variant?: string;
} = {}): Editor {
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
          attrs: { mode: "slideshow" },
          content: surfaceIds.map((surfaceId) => {
            const created = definition.createSurface({ surfaceId });
            return {
              ...created,
              attrs: {
                ...created.attrs,
                variant,
                settings: settings ?? created.attrs?.["settings"],
              },
            };
          }),
        },
      ],
    },
  });
}

function surface(editor: Editor): JSONContent {
  const course = editor.getJSON().content?.[0];
  const value = course?.content?.[0];
  if (!value) throw new Error("expected surface fixture");
  return value;
}

describe("setSurfaceOwnedImageChecked", () => {
  it.each([
    [slideDiptychSurfaceDefinition, ["primary", "secondary"]],
    [slideTriptychSurfaceDefinition, ["primary", "secondary", "tertiary"]],
  ] as const)(
    "clears one $id role while preserving every neighbouring role",
    (definition, roles) => {
      const created = definition.createSurface({ surfaceId: "surface-a" });
      const images = Object.fromEntries(
        roles.map((role) => [
          role,
          {
            imageUrl: `https://example.test/${role}.png`,
            imageAlt: `${role} description`,
            imagePosition: role === "primary" ? "top-left" : "bottom-right",
          },
        ]),
      );
      const settings = definition.settingsSchema.parse({
        ...(created.attrs?.["settings"] as Record<string, unknown>),
        images,
      }) as Record<string, unknown>;
      const editor = makeEditor({ definition, settings });
      const beforeContent = surface(editor).content;

      expect(
        setSurfaceOwnedImageChecked({
          editor,
          definition,
          surfaceId: "surface-a",
          role: roles[1],
          image: {},
        }),
      ).toEqual({ ok: true });
      expect(surface(editor).content).toEqual(beforeContent);
      expect(surface(editor).attrs?.["settings"]).toMatchObject({
        images: { ...images, [roles[1]]: {} },
      });

      editor.destroy();
    },
  );

  it.each([slideImageContentSplitSurfaceDefinition, slideImageContentStackedSurfaceDefinition])(
    "positions $id primary images without rewriting fixed content",
    (definition) => {
      const created = definition.createSurface({ surfaceId: "surface-a" });
      const settings = definition.settingsSchema.parse({
        ...(created.attrs?.["settings"] as Record<string, unknown>),
        orientation: "reversed",
        proportion: "two-thirds-one-third",
      }) as Record<string, unknown>;
      const editor = makeEditor({ definition, settings });
      const beforeContent = surface(editor).content;

      for (const imagePosition of [
        "top-left",
        "top-center",
        "top-right",
        "center-left",
        "center",
        "center-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ] as const) {
        expect(
          setSurfaceOwnedImageChecked({
            editor,
            definition,
            surfaceId: "surface-a",
            role: "primary",
            image: {
              imageUrl: "https://example.test/subject.png",
              imageAlt: "Positioned subject",
              ...(imagePosition === "center" ? {} : { imagePosition }),
            },
          }),
        ).toEqual({ ok: true });
        expect(surface(editor).content).toEqual(beforeContent);
        expect(surface(editor).attrs?.["settings"]).toMatchObject({
          orientation: "reversed",
          proportion: "two-thirds-one-third",
          images: {
            primary: {
              imageUrl: "https://example.test/subject.png",
              imageAlt: "Positioned subject",
              ...(imagePosition === "center" ? {} : { imagePosition }),
            },
          },
        });
      }

      editor.destroy();
    },
  );

  it("replaces one complete role value and dispatches once while preserving siblings", () => {
    const settings = TestImageLayoutSettingsSchema.parse({
      ...DEFAULT_SURFACE_SETTINGS,
      background: { color: "#161D77" },
      orientation: "reversed",
      images: {
        primary: {
          imageUrl: "https://example.test/old.png",
          imageAlt: "Old image",
          imagePosition: "top-left",
        },
      },
    });
    const editor = makeEditor({ settings });
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: testImageLayoutDefinition,
        surfaceId: "surface-a",
        role: "primary",
        image: { imageUrl: "https://example.test/new.png", imageAlt: "New image" },
      }),
    ).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(surface(editor).attrs?.["settings"]).toEqual({
      ...settings,
      images: {
        primary: { imageUrl: "https://example.test/new.png", imageAlt: "New image" },
      },
    });

    editor.destroy();
  });

  it("clears a role without removing the declared slot", () => {
    const editor = makeEditor({
      settings: TestImageLayoutSettingsSchema.parse({
        images: { primary: { imageUrl: "https://example.test/old.png" } },
      }),
    });

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: testImageLayoutDefinition,
        surfaceId: "surface-a",
        role: "primary",
        image: {},
      }),
    ).toEqual({ ok: true });
    expect(surface(editor).attrs?.["settings"]).toMatchObject({ images: { primary: {} } });

    editor.destroy();
  });

  it.each([
    ["missing target", { surfaceId: "missing", role: "primary", image: {} }],
    ["undeclared role", { surfaceId: "surface-a", role: "secondary", image: {} }],
    [
      "malformed image",
      { surfaceId: "surface-a", role: "primary", image: { imagePosition: "middle" } },
    ],
  ])("rejects %s without dispatching", (_label, input) => {
    const editor = makeEditor();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: testImageLayoutDefinition,
        ...input,
      }).ok,
    ).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("rejects a non-composition variant and invalid complete settings", () => {
    for (const { definition, editor } of [
      {
        definition: registeredSlideCoverSurfaceDefinition,
        editor: makeEditor({ variant: "slide-cover" }),
      },
      {
        definition: testImageLayoutDefinition,
        editor: makeEditor({
          settings: {
            ...TestImageLayoutSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS),
            orientation: "sideways",
          },
        }),
      },
    ]) {
      const before = editor.getJSON();
      const dispatch = vi.spyOn(editor.view, "dispatch");
      expect(
        setSurfaceOwnedImageChecked({
          editor,
          definition,
          surfaceId: "surface-a",
          role: "primary",
          image: { imageUrl: "https://example.test/new.png" },
        }).ok,
      ).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
      expect(editor.getJSON()).toEqual(before);
      editor.destroy();
    }
  });

  it("rejects a definition that does not match the persisted surface variant", () => {
    const editor = makeEditor();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: registeredSlideCoverSurfaceDefinition,
        surfaceId: "surface-a",
        role: "primary",
        image: { imageUrl: "https://example.test/new.png" },
      }).ok,
    ).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it.each([
    {
      label: "missing",
      editor: () => makeEditor(),
      surfaceId: "missing",
      error: 'Surface "missing" was not found.',
    },
    {
      label: "invalid",
      editor: () => makeEditor({ surfaceIds: ["surface-a", "surface-a"] }),
      surfaceId: "surface-a",
      error: "The authoring target identity is invalid.",
    },
  ])("rejects a $label live image target without dispatching", ({ editor: create, ...input }) => {
    const editor = create();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: testImageLayoutDefinition,
        surfaceId: input.surfaceId,
        role: "primary",
        image: {},
      }),
    ).toEqual({ ok: false, error: input.error });
    expect(dispatch).not.toHaveBeenCalled();

    editor.destroy();
  });

  it("rejects a destroyed editor image target without dispatching", () => {
    const editor = makeEditor();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    editor.destroy();

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: testImageLayoutDefinition,
        surfaceId: "surface-a",
        role: "primary",
        image: {},
      }),
    ).toEqual({ ok: false, error: "The authoring editor has been destroyed." });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("reconciles common header structure in the same dispatch", () => {
    const editor = makeEditor({
      settings: TestImageLayoutSettingsSchema.parse({ header: { enabled: true } }),
    });
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(
      setSurfaceOwnedImageChecked({
        editor,
        definition: testImageLayoutDefinition,
        surfaceId: "surface-a",
        role: "primary",
        image: { imageUrl: "https://example.test/new.png" },
      }),
    ).toEqual({ ok: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(surface(editor).content?.map((child) => child.type)).toEqual([
      "surface_header",
      "slide_title",
      "region",
    ]);

    editor.destroy();
  });
});
