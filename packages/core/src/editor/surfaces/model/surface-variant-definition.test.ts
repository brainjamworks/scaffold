// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  builtInSurfaceVariantDefinitions,
  builtInSurfaceVariantRegistry,
} from "./built-in-surface-variant-definitions";
import {
  compareSurfaceCatalogueDefinitions,
  normalizeSurfaceDefinition,
  type FixedSurfaceChild,
  type RegisteredSurfaceVariantCatalogueDefinition,
  type SurfaceTemplatePreviewNode,
  type SurfaceVariantDefinition,
} from "./surface-variant-definition";
import { createSurfaceVariantRegistry } from "./surface-variant-registry";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
} from "./policies/surface-fixed-structure";
import { pageDefaultSurfaceDefinition } from "./templates/page-default";
import { slideCentredStageSurfaceDefinition } from "./templates/slide-centred-stage";
import { slideContentSurfaceDefinition } from "./templates/slide-content";
import { slideCoverSurfaceDefinition } from "./templates/slide-cover";
import { slideDiptychSurfaceDefinition } from "./templates/slide-diptych";
import { slideEditorialSurfaceDefinition } from "./templates/slide-editorial";
import { slideFullBleedImageSurfaceDefinition } from "./templates/slide-full-bleed-image";
import { slideImageBackdropPanelSurfaceDefinition } from "./templates/slide-image-backdrop-panel";
import { slideImageBandSurfaceDefinition } from "./templates/slide-image-band";
import { slideImageContentSplitSurfaceDefinition } from "./templates/slide-image-content-split";
import { slideImageContentStackedSurfaceDefinition } from "./templates/slide-image-content-stacked";
import { slideImageCoverSurfaceDefinition } from "./templates/slide-image-cover";
import { slideModuleCoverSurfaceDefinition } from "./templates/slide-module-cover";
import { slideSideTitleSurfaceDefinition } from "./templates/slide-side-title";
import { slideThreeColumnsSurfaceDefinition } from "./templates/slide-three-columns";
import { slideTriptychSurfaceDefinition } from "./templates/slide-triptych";
import { slideTwoColumnsSurfaceDefinition } from "./templates/slide-two-columns";
import { slideTwoStackedSurfaceDefinition } from "./templates/slide-two-stacked";
import {
  SurfaceFooterNode,
  SurfaceHeaderFooterSlotNode,
  SurfaceHeaderNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

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

function expectValidSurface(surface: JSONContent) {
  const editor = new Editor({
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
  });

  try {
    const node = editor.schema.nodeFromJSON(surface);
    expect(node.type.name).toBe("surface");
    expect(() => node.check()).not.toThrow();
  } finally {
    editor.destroy();
  }
}

function builtInSlideshowCatalogue(): RegisteredSurfaceVariantCatalogueDefinition[] {
  return builtInSurfaceVariantRegistry
    .forMode("slideshow")
    .filter(
      (definition): definition is RegisteredSurfaceVariantCatalogueDefinition =>
        definition.catalogue !== undefined,
    )
    .slice()
    .sort(compareSurfaceCatalogueDefinitions);
}

function expectFixedSurfaceStructure(
  definition: SurfaceVariantDefinition,
  fixedChildren: readonly FixedSurfaceChild[],
) {
  expect(definition.structurePolicy).toEqual({
    fixedChildren,
    allowRootInsertion: false,
  });
  expect(
    matchFixedSurfaceChildren(
      snapshotSurfaceStructureChildrenFromJSON(
        definition.createSurface({ surfaceId: "signature-test" }),
      ),
      fixedChildren,
    ),
  ).toEqual({ exact: true });
}

const TEST_CATALOGUE_PREVIEW: SurfaceTemplatePreviewNode = {
  kind: "column",
  gap: "small",
  children: [
    { kind: "slot", role: "title", emphasis: "strong" },
    {
      kind: "row",
      gap: "medium",
      proportions: [2, 1],
      children: [
        { kind: "slot", role: "content" },
        {
          kind: "overlay",
          base: { kind: "slot", role: "image" },
          overlay: { kind: "slot", role: "panel", emphasis: "quiet" },
          placement: "end",
        },
      ],
    },
  ],
};

function createCatalogueTestSurface({
  id,
  section,
  order,
  preview = TEST_CATALOGUE_PREVIEW,
}: {
  id: string;
  section: "title" | "content" | "image";
  order: number;
  preview?: SurfaceTemplatePreviewNode;
}) {
  return {
    id,
    modes: ["branching"],
    title: id,
    description: `Catalogue test surface ${id}.`,
    catalogue: { section, order, preview },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: id },
      content: [{ type: "paragraph" }],
    }),
  } satisfies SurfaceVariantDefinition;
}

describe("surface definitions", () => {
  it("uses fixed signatures as the only constrained slideshow structure policy", () => {
    for (const definition of builtInSurfaceVariantRegistry.forMode("slideshow")) {
      expect(definition.structurePolicy?.fixedChildren).toBeDefined();
      expect(Object.keys(definition.structurePolicy ?? {}).sort()).toEqual([
        "allowRootInsertion",
        "fixedChildren",
      ]);
    }
  });

  it("declares middle-default finite stacks on exactly the capable surface variants", () => {
    expect(
      builtInSurfaceVariantRegistry.definitions
        .filter((definition) => definition.alignment?.verticalContentPosition !== undefined)
        .map((definition) => [definition.id, definition.alignment?.verticalContentPosition]),
    ).toEqual([
      ["slide-cover", { behavior: "finite-direct-stack", default: "middle" }],
      ["slide-image-cover", { behavior: "finite-direct-stack", default: "middle" }],
      ["slide-image-band", { behavior: "finite-direct-stack", default: "middle" }],
    ]);
  });

  it("creates valid page-default surface content", () => {
    const surface = pageDefaultSurfaceDefinition.createSurface({
      surfaceId: "surface-1",
    });

    expect(surface).toEqual({
      type: "surface",
      attrs: { id: "surface-1", variant: "page-default" },
      content: [{ type: "paragraph" }],
    });
    expect(pageDefaultSurfaceDefinition.modes).toEqual(["page"]);
    expect(Object.hasOwn(pageDefaultSurfaceDefinition, "structurePolicy")).toBe(false);
    expect(Object.hasOwn(pageDefaultSurfaceDefinition, "catalogue")).toBe(false);
    expect(Object.hasOwn(pageDefaultSurfaceDefinition, "templatePreview")).toBe(false);
    expectValidSurface(surface);
  });

  it("creates valid slide-cover surface content", () => {
    const surface = slideCoverSurfaceDefinition.createSurface({
      surfaceId: "surface-1",
    });

    expect(surface).toEqual({
      type: "surface",
      attrs: {
        id: "surface-1",
        variant: "slide-cover",
        settings: {
          header: { enabled: false },
          footer: { enabled: false },
        },
      },
      content: [
        { type: "heading", attrs: { level: 1, textAlign: "left" } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        },
      ],
    });
    expect(slideCoverSurfaceDefinition.modes).toEqual(["slideshow"]);
    expectFixedSurfaceStructure(slideCoverSurfaceDefinition, [
      { type: "heading", attrs: { level: 1 } },
      { type: "slide_cover_subtitle" },
    ]);
    expectValidSurface(surface);
  });

  it("creates valid slide-content surface content", () => {
    const surface = slideContentSurfaceDefinition.createSurface({
      surfaceId: "surface-1",
    });

    expect(surface).toEqual({
      type: "surface",
      attrs: {
        id: "surface-1",
        variant: "slide-content",
        settings: {
          header: { enabled: false },
          footer: { enabled: false },
          slideTitle: { enabled: true },
        },
      },
      content: [
        { type: "slide_title" },
        {
          type: "region",
          attrs: { role: "main" },
          content: [{ type: "paragraph" }],
        },
      ],
    });
    expect(slideContentSurfaceDefinition.modes).toEqual(["slideshow"]);
    expect(slideContentSurfaceDefinition.slideComposition).toEqual({
      id: "content",
      title: "optional-default-on",
      regions: ["main"],
      imageSlots: [],
    });
    expect(slideContentSurfaceDefinition.structurePolicy).toEqual({
      fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
      allowRootInsertion: false,
    });
    expectValidSurface(surface);
  });

  it("allows broad arrangements inside regions without making regions arrangements", () => {
    const editor = new Editor({
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
    });

    try {
      expect(editor.schema.nodes.region?.spec.group).toBeUndefined();
      expect(editor.schema.nodes.region?.spec.content).toBe("(block | arrangement)+");
      const arrangement = editor.schema.nodes.testArrangement?.create();
      const sectionArrangement = editor.schema.nodes.testSectionArrangement?.create();
      expect(arrangement).toBeDefined();
      expect(sectionArrangement).toBeDefined();
      expect(() => editor.schema.nodes.region?.createChecked(null, [arrangement!])).not.toThrow();
      expect(() =>
        editor.schema.nodes.region?.createChecked(null, [sectionArrangement!]),
      ).toThrow();
    } finally {
      editor.destroy();
    }
  });

  it.each([
    [
      slideTwoColumnsSurfaceDefinition,
      "slide-two-columns",
      20,
      "two-columns",
      ["primary", "secondary"],
      true,
      "equal",
    ],
    [
      slideTwoStackedSurfaceDefinition,
      "slide-two-stacked",
      40,
      "two-stacked",
      ["primary", "secondary"],
      true,
      "equal",
    ],
    [
      slideSideTitleSurfaceDefinition,
      "slide-side-title",
      50,
      "side-title",
      ["main"],
      false,
      undefined,
    ],
  ] as const)(
    "declares %s with its exact reversible two-region contract",
    (definition, id, order, composition, roles, optionalTitle, proportion) => {
      const surface = definition.createSurface({ surfaceId: id });
      const settings = surface.attrs?.["settings"] as Record<string, unknown>;

      expect(definition.id).toBe(id);
      expect(definition.catalogue).toMatchObject({ section: "content", order });
      expect(definition.slideComposition).toMatchObject({ id: composition, regions: roles });
      expect(definition.structurePolicy.fixedChildren).toEqual([
        { type: "slide_title" },
        ...roles.map((role) => ({ type: "region", attrs: { role } })),
      ]);
      expect(settings).toMatchObject({ orientation: "default" });
      expect(settings["proportion"]).toBe(proportion);
      expect(Object.hasOwn(settings, "slideTitle")).toBe(optionalTitle);
      expect(
        definition.settingsSchema.safeParse({ ...settings, orientation: "sideways" }).success,
      ).toBe(false);
      if (proportion) {
        expect(
          definition.settingsSchema.safeParse({ ...settings, proportion: "quarter" }).success,
        ).toBe(false);
      } else {
        const legacySettings = definition.settingsSchema.parse({
          ...settings,
          proportion: "one-third-two-thirds",
        });
        expect(Object.hasOwn(legacySettings, "proportion")).toBe(false);
      }
    },
  );

  it("declares the background-owned full-bleed image overlay", () => {
    const surface = slideFullBleedImageSurfaceDefinition.createSurface({
      surfaceId: "full-bleed",
    });
    expect(slideFullBleedImageSurfaceDefinition.catalogue).toMatchObject({
      section: "image",
      order: 30,
      preview: { kind: "overlay", placement: "start" },
    });
    expect(slideFullBleedImageSurfaceDefinition.slideComposition).toEqual({
      id: "full-bleed-image",
      title: "optional-default-off",
      regions: [],
      imageSlots: [],
    });
    expect(slideFullBleedImageSurfaceDefinition.structurePolicy.fixedChildren).toEqual([
      { type: "slide_title" },
    ]);
    expect(surface.attrs?.["settings"]).toMatchObject({
      slideTitle: { enabled: false },
    });
    expect(surface.attrs?.["settings"]).not.toHaveProperty("images");
    expectValidSurface(surface);
  });

  it("declares the reversible backdrop panel overlay", () => {
    const surface = slideImageBackdropPanelSurfaceDefinition.createSurface({
      surfaceId: "backdrop-panel",
    });
    expect(slideImageBackdropPanelSurfaceDefinition.catalogue).toMatchObject({
      section: "image",
      order: 40,
      preview: { kind: "overlay", placement: "end" },
    });
    expect(slideImageBackdropPanelSurfaceDefinition.slideComposition).toMatchObject({
      id: "image-backdrop-panel",
      title: "optional-default-on",
      regions: ["main"],
      imageSlots: [],
    });
    expect(slideImageBackdropPanelSurfaceDefinition.structurePolicy.fixedChildren).toEqual([
      { type: "slide_title" },
      { type: "region", attrs: { role: "main" } },
    ]);
    expect(surface.attrs?.["settings"]).toMatchObject({
      slideTitle: { enabled: true },
      orientation: "default",
      proportion: "one-third-two-thirds",
    });
    expect(surface.attrs?.["settings"]).not.toHaveProperty("images");
    expectValidSurface(surface);
  });

  it.each([
    [slideDiptychSurfaceDefinition, "slide-diptych", 50, ["primary", "secondary"]],
    [slideTriptychSurfaceDefinition, "slide-triptych", 60, ["primary", "secondary", "tertiary"]],
  ] as const)(
    "declares %s with an exact fixed gallery role map",
    (definition, id, order, roles) => {
      const surface = definition.createSurface({ surfaceId: id });
      const settings = surface.attrs?.["settings"] as Record<string, unknown>;
      expect(definition.catalogue).toMatchObject({ section: "image", order });
      expect(definition.slideComposition).toEqual({
        id: id === "slide-diptych" ? "diptych" : "triptych",
        title: "optional-default-on",
        regions: [],
        imageSlots: roles,
      });
      expect(definition.structurePolicy.fixedChildren).toEqual([{ type: "slide_title" }]);
      expect(settings).toMatchObject({
        slideTitle: { enabled: true },
        images: Object.fromEntries(roles.map((role) => [role, {}])),
      });
      expect(
        definition.settingsSchema.safeParse({
          ...settings,
          images: { ...(settings["images"] as Record<string, unknown>), extra: {} },
        }).success,
      ).toBe(false);
      expectValidSurface(surface);
    },
  );

  it.each([
    [
      slideThreeColumnsSurfaceDefinition,
      "slide-three-columns",
      30,
      "three-columns",
      ["primary", "secondary", "tertiary"],
      false,
    ],
    [
      slideCentredStageSurfaceDefinition,
      "slide-centred-stage",
      60,
      "centred-stage",
      ["main"],
      false,
    ],
    [
      slideEditorialSurfaceDefinition,
      "slide-editorial",
      70,
      "editorial",
      ["primary", "secondary", "tertiary"],
      true,
    ],
  ] as const)(
    "declares %s with its exact distinctive Content contract",
    (definition, id, order, composition, roles, orientation) => {
      const surface = definition.createSurface({ surfaceId: id });
      const settings = surface.attrs?.["settings"] as Record<string, unknown>;

      expect(definition.id).toBe(id);
      expect(definition.catalogue).toMatchObject({ section: "content", order });
      expect(definition.slideComposition).toMatchObject({ id: composition, regions: roles });
      expect(definition.structurePolicy.fixedChildren).toEqual([
        { type: "slide_title" },
        ...roles.map((role) => ({ type: "region", attrs: { role } })),
      ]);
      expect(Object.hasOwn(settings, "orientation")).toBe(orientation);
      expect(Object.hasOwn(settings, "proportion")).toBe(false);
    },
  );

  it("declares exactly the seven approved Content compositions without a 2x2 variant", () => {
    const content = builtInSlideshowCatalogue().filter(
      (definition) => definition.catalogue.section === "content",
    );

    expect(content.map((definition) => definition.id)).toEqual([
      "slide-content",
      "slide-two-columns",
      "slide-three-columns",
      "slide-two-stacked",
      "slide-side-title",
      "slide-centred-stage",
      "slide-editorial",
    ]);
    expect(new Set(content.map((definition) => definition.id)).size).toBe(7);
    expect(content.some((definition) => definition.id.includes("2x2"))).toBe(false);
  });

  it.each([
    [
      slideImageContentSplitSurfaceDefinition,
      "slide-image-content-split",
      10,
      "image-content-split",
      "row",
    ],
    [
      slideImageContentStackedSurfaceDefinition,
      "slide-image-content-stacked",
      20,
      "image-content-stacked",
      "column",
    ],
  ] as const)(
    "declares %s with one strict primary image and stable main content",
    (definition, id, order, composition, previewKind) => {
      const surface = definition.createSurface({ surfaceId: id });
      const settings = surface.attrs?.["settings"] as Record<string, unknown>;

      expect(definition.id).toBe(id);
      expect(definition.catalogue).toMatchObject({
        section: "image",
        order,
        preview: { kind: previewKind },
      });
      expect(definition.slideComposition).toEqual({
        id: composition,
        title: "optional-default-on",
        regions: ["main"],
        imageSlots: ["primary"],
        orientation: { default: "default", options: ["default", "reversed"] },
        proportion: {
          default: "equal",
          options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
        },
      });
      expect(definition.structurePolicy.fixedChildren).toEqual([
        { type: "slide_title" },
        { type: "region", attrs: { role: "main" } },
      ]);
      expect(settings).toMatchObject({
        slideTitle: { enabled: true },
        orientation: "default",
        proportion: "equal",
        images: { primary: {} },
      });
      expect(
        definition.settingsSchema.safeParse({ ...settings, images: { primary: {}, extra: {} } })
          .success,
      ).toBe(false);
      expectValidSurface(surface);
    },
  );

  it("creates valid slide-image-cover surface content", () => {
    const surface = slideImageCoverSurfaceDefinition.createSurface({
      surfaceId: "surface-1",
    });

    expect(surface).toEqual({
      type: "surface",
      attrs: {
        id: "surface-1",
        variant: "slide-image-cover",
        settings: {
          header: { enabled: false },
          footer: { enabled: false },
          image: {},
          imageSide: "right",
        },
      },
      content: [
        { type: "heading", attrs: { level: 1, textAlign: "left" } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        },
      ],
    });
    expect(slideImageCoverSurfaceDefinition.modes).toEqual(["slideshow"]);
    expectFixedSurfaceStructure(slideImageCoverSurfaceDefinition, [
      { type: "heading", attrs: { level: 1 } },
      { type: "slide_cover_subtitle" },
    ]);
    expectValidSurface(surface);
  });

  it("creates valid slide-image-band surface content", () => {
    const surface = slideImageBandSurfaceDefinition.createSurface({
      surfaceId: "surface-1",
    });

    expect(surface).toEqual({
      type: "surface",
      attrs: {
        id: "surface-1",
        variant: "slide-image-band",
        settings: {
          header: { enabled: false },
          footer: { enabled: false },
          image: {},
        },
      },
      content: [
        { type: "heading", attrs: { level: 1, textAlign: "left" } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        },
      ],
    });
    expect(slideImageBandSurfaceDefinition.modes).toEqual(["slideshow"]);
    expectFixedSurfaceStructure(slideImageBandSurfaceDefinition, [
      { type: "heading", attrs: { level: 1 } },
      { type: "slide_cover_subtitle" },
    ]);
    expectValidSurface(surface);
  });

  it("creates valid slide-module-cover surface content", () => {
    const surface = slideModuleCoverSurfaceDefinition.createSurface({
      surfaceId: "surface-1",
    });

    expect(surface).toEqual({
      type: "surface",
      attrs: {
        id: "surface-1",
        variant: "slide-module-cover",
      },
      content: [
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        },
        { type: "heading", attrs: { level: 1, textAlign: "left" } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
        },
      ],
    });
    expect(slideModuleCoverSurfaceDefinition.modes).toEqual(["slideshow"]);
    expectFixedSurfaceStructure(slideModuleCoverSurfaceDefinition, [
      { type: "slide_cover_subtitle" },
      { type: "heading", attrs: { level: 1 } },
      { type: "slide_cover_subtitle" },
      { type: "slide_cover_subtitle" },
    ]);
    expectValidSurface(surface);
  });

  it("rejects a mismatched fixed structure during normalization", () => {
    const definitionId = "surface-definition-fixed-mismatch-test";

    expect(() =>
      normalizeSurfaceDefinition({
        id: definitionId,
        modes: ["page"],
        title: "Mismatched fixed surface",
        description: "Test definition whose factory disagrees with its signature.",
        structurePolicy: {
          fixedChildren: [{ type: "heading", attrs: { level: 1 } }],
        },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: definitionId },
          content: [{ type: "paragraph" }],
        }),
      }),
    ).toThrow(
      `Surface definition "${definitionId}" createSurface result does not match its declared fixedChildren signature.`,
    );
  });

  it("resolves definitions by id", () => {
    for (const definition of builtInSurfaceVariantDefinitions) {
      expect(builtInSurfaceVariantRegistry.get(definition.id)).toMatchObject(definition);
    }
    expect(builtInSurfaceVariantRegistry.get("missing")).toBeUndefined();
  });

  it("resolves surface definitions by course mode", () => {
    expect(
      builtInSurfaceVariantRegistry.forMode("page").map((definition) => definition.id),
    ).toEqual(["page-default"]);
    expect(
      builtInSurfaceVariantRegistry.forMode("slideshow").map((definition) => definition.id),
    ).toEqual([
      "slide-cover",
      "slide-content",
      "slide-two-columns",
      "slide-two-stacked",
      "slide-side-title",
      "slide-three-columns",
      "slide-centred-stage",
      "slide-editorial",
      "slide-image-content-split",
      "slide-image-content-stacked",
      "slide-full-bleed-image",
      "slide-image-backdrop-panel",
      "slide-diptych",
      "slide-triptych",
      "slide-image-cover",
      "slide-image-band",
      "slide-module-cover",
    ]);
  });

  it("catalogues the existing slideshow definitions in canonical groups and order", () => {
    const catalogue = builtInSlideshowCatalogue();

    expect(
      catalogue.map((definition) => ({
        id: definition.id,
        title: definition.title,
        section: definition.catalogue.section,
        order: definition.catalogue.order,
      })),
    ).toEqual([
      { id: "slide-cover", title: "Cover", section: "title", order: 10 },
      { id: "slide-module-cover", title: "Module cover", section: "title", order: 20 },
      { id: "slide-image-cover", title: "Image cover", section: "title", order: 30 },
      { id: "slide-image-band", title: "Image band", section: "title", order: 40 },
      { id: "slide-content", title: "Content", section: "content", order: 10 },
      { id: "slide-two-columns", title: "Two columns", section: "content", order: 20 },
      { id: "slide-three-columns", title: "Three columns", section: "content", order: 30 },
      { id: "slide-two-stacked", title: "Two stacked", section: "content", order: 40 },
      { id: "slide-side-title", title: "Side title", section: "content", order: 50 },
      { id: "slide-centred-stage", title: "Centred stage", section: "content", order: 60 },
      { id: "slide-editorial", title: "Editorial", section: "content", order: 70 },
      {
        id: "slide-image-content-split",
        title: "Image + content split",
        section: "image",
        order: 10,
      },
      {
        id: "slide-image-content-stacked",
        title: "Image + content stacked",
        section: "image",
        order: 20,
      },
      { id: "slide-full-bleed-image", title: "Full-bleed image", section: "image", order: 30 },
      {
        id: "slide-image-backdrop-panel",
        title: "Image backdrop + inset panel",
        section: "image",
        order: 40,
      },
      { id: "slide-diptych", title: "Diptych", section: "image", order: 50 },
      { id: "slide-triptych", title: "Triptych", section: "image", order: 60 },
    ]);
    expect(
      catalogue
        .filter(({ catalogue: entry }) => entry.section === "image")
        .map((definition) => definition.id),
    ).toEqual([
      "slide-image-content-split",
      "slide-image-content-stacked",
      "slide-full-bleed-image",
      "slide-image-backdrop-panel",
      "slide-diptych",
      "slide-triptych",
    ]);
  });

  it("describes the canonical existing compositions with abstract previews", () => {
    expect(
      builtInSlideshowCatalogue().map((definition) => ({
        id: definition.id,
        preview: definition.catalogue.preview,
      })),
    ).toEqual([
      {
        id: "slide-cover",
        preview: {
          kind: "column",
          gap: "small",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "label", emphasis: "quiet" },
          ],
        },
      },
      {
        id: "slide-module-cover",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "label", emphasis: "quiet" },
            {
              kind: "column",
              gap: "small",
              children: [
                { kind: "slot", role: "title", emphasis: "strong" },
                { kind: "slot", role: "label" },
                { kind: "slot", role: "label", emphasis: "quiet" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-image-cover",
        preview: {
          kind: "row",
          gap: "medium",
          proportions: [2, 1],
          children: [
            {
              kind: "column",
              gap: "small",
              children: [
                { kind: "slot", role: "title", emphasis: "strong" },
                { kind: "slot", role: "label", emphasis: "quiet" },
              ],
            },
            { kind: "slot", role: "image" },
          ],
        },
      },
      {
        id: "slide-image-band",
        preview: {
          kind: "column",
          gap: "medium",
          proportions: [1, 1],
          children: [
            { kind: "slot", role: "image" },
            {
              kind: "column",
              gap: "small",
              children: [
                { kind: "slot", role: "title", emphasis: "strong" },
                { kind: "slot", role: "label", emphasis: "quiet" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-content",
        preview: {
          kind: "column",
          gap: "medium",
          proportions: [1, 3],
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "content" },
          ],
        },
      },
      {
        id: "slide-two-columns",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            {
              kind: "row",
              gap: "medium",
              proportions: [1, 1],
              children: [
                { kind: "slot", role: "content" },
                { kind: "slot", role: "content" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-three-columns",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            {
              kind: "row",
              gap: "medium",
              proportions: [1, 1, 1],
              children: [
                { kind: "slot", role: "content" },
                { kind: "slot", role: "content" },
                { kind: "slot", role: "content" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-two-stacked",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "content" },
            { kind: "slot", role: "content" },
          ],
        },
      },
      {
        id: "slide-side-title",
        preview: {
          kind: "row",
          gap: "medium",
          proportions: [1, 4],
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "content" },
          ],
        },
      },
      {
        id: "slide-centred-stage",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "content", emphasis: "quiet" },
          ],
        },
      },
      {
        id: "slide-editorial",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            {
              kind: "row",
              gap: "medium",
              proportions: [2, 1],
              children: [
                { kind: "slot", role: "content" },
                {
                  kind: "column",
                  gap: "medium",
                  children: [
                    { kind: "slot", role: "content" },
                    { kind: "slot", role: "content" },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        id: "slide-image-content-split",
        preview: {
          kind: "row",
          gap: "medium",
          proportions: [1, 1],
          children: [
            { kind: "slot", role: "image" },
            {
              kind: "column",
              gap: "small",
              children: [
                { kind: "slot", role: "title", emphasis: "strong" },
                { kind: "slot", role: "content" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-image-content-stacked",
        preview: {
          kind: "column",
          gap: "medium",
          proportions: [1, 1],
          children: [
            { kind: "slot", role: "image" },
            {
              kind: "column",
              gap: "small",
              children: [
                { kind: "slot", role: "title", emphasis: "strong" },
                { kind: "slot", role: "content" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-full-bleed-image",
        preview: {
          kind: "overlay",
          base: { kind: "slot", role: "image" },
          overlay: { kind: "slot", role: "title", emphasis: "strong" },
          placement: "start",
        },
      },
      {
        id: "slide-image-backdrop-panel",
        preview: {
          kind: "overlay",
          base: { kind: "slot", role: "image" },
          overlay: {
            kind: "column",
            gap: "small",
            children: [
              { kind: "slot", role: "title", emphasis: "strong" },
              { kind: "slot", role: "panel" },
            ],
          },
          placement: "end",
        },
      },
      {
        id: "slide-diptych",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            {
              kind: "row",
              gap: "medium",
              proportions: [1, 1],
              children: [
                { kind: "slot", role: "image" },
                { kind: "slot", role: "image" },
              ],
            },
          ],
        },
      },
      {
        id: "slide-triptych",
        preview: {
          kind: "column",
          gap: "medium",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            {
              kind: "row",
              gap: "medium",
              proportions: [1, 1, 1],
              children: [
                { kind: "slot", role: "image" },
                { kind: "slot", role: "image" },
                { kind: "slot", role: "image" },
              ],
            },
          ],
        },
      },
    ]);
  });

  it("sorts catalogue definitions by fixed section order and explicit entry order", () => {
    const definitions = [
      createCatalogueTestSurface({
        id: "surface-catalogue-image-30-test",
        section: "image",
        order: 1030,
      }),
      createCatalogueTestSurface({
        id: "surface-catalogue-content-20-test",
        section: "content",
        order: 1020,
      }),
      {
        ...createCatalogueTestSurface({
          id: "surface-catalogue-title-10-test",
          section: "title",
          order: 1010,
        }),
        defaultForModes: ["branching"] as const,
      },
      createCatalogueTestSurface({
        id: "surface-catalogue-content-10-test",
        section: "content",
        order: 1010,
      }),
    ];
    const registry = createSurfaceVariantRegistry(definitions);

    expect(
      registry
        .forMode("branching")
        .filter(
          (definition): definition is RegisteredSurfaceVariantCatalogueDefinition =>
            definition.catalogue !== undefined,
        )
        .slice()
        .sort(compareSurfaceCatalogueDefinitions)
        .map((definition) => definition.id),
    ).toEqual([
      "surface-catalogue-title-10-test",
      "surface-catalogue-content-10-test",
      "surface-catalogue-content-20-test",
      "surface-catalogue-image-30-test",
    ]);
  });

  it("omits definitions without catalogue metadata", () => {
    expect(
      builtInSurfaceVariantRegistry
        .forMode("page")
        .filter((definition) => definition.catalogue !== undefined),
    ).toEqual([]);
  });

  it("rejects duplicate catalogue section and order positions", () => {
    const first = {
      ...createCatalogueTestSurface({
        id: "surface-catalogue-duplicate-first-test",
        section: "content",
        order: 910,
      }),
      defaultForModes: ["branching"] as const,
    };
    const second = createCatalogueTestSurface({
      id: "surface-catalogue-duplicate-second-test",
      section: "content",
      order: 910,
    });

    expect(() => createSurfaceVariantRegistry([first, second])).toThrow(
      'Surface catalogue position "content:910" is already registered by "surface-catalogue-duplicate-first-test".',
    );
  });

  it("rejects catalogue metadata without a preview", () => {
    const definitionId = "surface-catalogue-missing-preview-test";

    expect(() =>
      normalizeSurfaceDefinition({
        id: definitionId,
        modes: ["branching"],
        title: "Missing preview",
        description: "Catalogue test surface without a preview.",
        // @ts-expect-error Runtime normalization must reject untyped inputs too.
        catalogue: { section: "content", order: 920 },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: definitionId },
          content: [{ type: "paragraph" }],
        }),
      }),
    ).toThrow(`Surface definition "${definitionId}" has an invalid catalogue preview.`);
  });

  it.each([
    {
      name: "unknown slot role",
      order: 930,
      preview: { kind: "slot", role: "video" },
    },
    {
      name: "unknown container kind",
      order: 931,
      preview: { kind: "stack", children: [] },
    },
    {
      name: "extra container property",
      order: 932,
      preview: { kind: "row", children: [], align: "centre" },
    },
    {
      name: "empty row",
      order: 933,
      preview: { kind: "row", children: [] },
    },
    {
      name: "mismatched proportions",
      order: 934,
      preview: {
        kind: "column",
        children: [{ kind: "slot", role: "content" }],
        proportions: [],
      },
    },
    {
      name: "zero proportion",
      order: 935,
      preview: {
        kind: "row",
        children: [{ kind: "slot", role: "content" }],
        proportions: [0],
      },
    },
    {
      name: "negative proportion",
      order: 936,
      preview: {
        kind: "row",
        children: [{ kind: "slot", role: "content" }],
        proportions: [-1],
      },
    },
  ])("rejects invalid catalogue preview node: $name", ({ order, preview }) => {
    const definitionId = `surface-catalogue-invalid-preview-${order}-test`;

    expect(() =>
      normalizeSurfaceDefinition({
        id: definitionId,
        modes: ["branching"],
        title: "Invalid preview",
        description: "Catalogue test surface with an invalid preview node.",
        // @ts-expect-error Runtime normalization must reject untyped inputs too.
        catalogue: { section: "image", order, preview },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: definitionId },
          content: [{ type: "paragraph" }],
        }),
      }),
    ).toThrow(`Surface definition "${definitionId}" has an invalid catalogue preview.`);
  });

  it("creates default surfaces for page and slideshow modes", () => {
    expect(
      builtInSurfaceVariantRegistry.createDefault({ mode: "page", surfaceId: "surface-1" }),
    ).toEqual(pageDefaultSurfaceDefinition.createSurface({ surfaceId: "surface-1" }));
    expect(
      builtInSurfaceVariantRegistry.createDefault({
        mode: "slideshow",
        surfaceId: "surface-1",
      }),
    ).toEqual(slideCoverSurfaceDefinition.createSurface({ surfaceId: "surface-1" }));
  });

  it("rejects modes without a built-in default surface", () => {
    expect(() =>
      builtInSurfaceVariantRegistry.createDefault({
        mode: "branching",
        surfaceId: "surface-1",
      }),
    ).toThrow('No default surface definition registered for course mode "branching".');
  });
});
