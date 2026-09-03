import { describe, expect, it } from "vite-plus/test";

import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { createSurfaceVariantRegistry } from "../model/surface-variant-registry";
import type {
  SurfaceTemplatePreviewNode,
  SurfaceVariantDefinition,
} from "../model/surface-variant-definition";

import {
  createSurfaceCreationCatalog,
  type SurfaceCreationCatalog,
} from "./surface-creation-catalog";

describe("surface creation catalog", () => {
  it("projects catalogue metadata in deterministic section and position order", () => {
    const catalog = createSurfaceCreationCatalog(builtInSurfaceVariantRegistry);

    expect(catalog.forMode("slideshow").map(({ variantId }) => variantId)).toEqual([
      "slide-cover",
      "slide-module-cover",
      "slide-image-cover",
      "slide-image-band",
      "slide-content",
      "slide-two-columns",
      "slide-three-columns",
      "slide-two-stacked",
      "slide-side-title",
      "slide-centred-stage",
      "slide-editorial",
      "slide-image-content-split",
      "slide-image-content-stacked",
      "slide-full-bleed-image",
      "slide-image-backdrop-panel",
      "slide-diptych",
      "slide-triptych",
      "slide-categorise-question",
      "slide-sequencing-question",
      "slide-matching-question",
      "slide-image-hotspot-question",
      "slide-multiple-choice-question",
      "slide-multiselect-question",
      "slide-dropdown-question",
      "slide-drag-drop-question",
      "slide-fill-blanks-question",
      "slide-quiz",
    ]);
  });

  it("returns one shared frozen empty result for modes without catalogue entries", () => {
    const registry = createSurfaceVariantRegistry([
      createTestDefinition({ id: "page-default", defaultForModes: ["page"] }),
      createTestDefinition({ id: "page-hidden" }),
    ]);
    const catalog = createSurfaceCreationCatalog(registry);
    const pageEntries = catalog.forMode("page");
    const slideshowEntries = catalog.forMode("slideshow");

    expect(pageEntries).toEqual([]);
    expect(pageEntries).toBe(slideshowEntries);
    expect(pageEntries).toBe(catalog.forMode("page"));
    expect(Object.isFrozen(pageEntries)).toBe(true);
  });

  it("includes catalogue entries only in their declared course modes", () => {
    const registry = createSurfaceVariantRegistry([
      createCataloguedTestDefinition({ id: "page-catalogued", modes: ["page"] }),
    ]);
    const catalog = createSurfaceCreationCatalog(registry);

    expect(catalog.forMode("page").map(({ variantId }) => variantId)).toEqual(["page-catalogued"]);
    expect(catalog.forMode("slideshow")).toEqual([]);
  });

  it("places assessment entries after ordinary title, content, and image entries", () => {
    const registry = createSurfaceVariantRegistry([
      createCataloguedTestDefinition({
        id: "assessment-catalogue-test",
        modes: ["slideshow"],
        section: "assessment",
        defaultForModes: ["slideshow"],
      }),
      createCataloguedTestDefinition({
        id: "image-catalogue-test",
        modes: ["slideshow"],
        section: "image",
        defaultForModes: [],
      }),
      createCataloguedTestDefinition({
        id: "title-catalogue-test",
        modes: ["slideshow"],
        section: "title",
        defaultForModes: [],
      }),
      createCataloguedTestDefinition({
        id: "content-catalogue-test",
        modes: ["slideshow"],
        section: "content",
        defaultForModes: [],
      }),
    ]);

    expect(
      createSurfaceCreationCatalog(registry)
        .forMode("slideshow")
        .map(({ variantId }) => variantId),
    ).toEqual([
      "title-catalogue-test",
      "content-catalogue-test",
      "image-catalogue-test",
      "assessment-catalogue-test",
    ]);
  });

  it("owns recursively copied and frozen preview snapshots", () => {
    const sourcePreview = {
      kind: "overlay",
      placement: "centre",
      base: { kind: "slot", role: "image" },
      overlay: {
        kind: "row",
        children: [
          { kind: "slot", role: "title" },
          { kind: "slot", role: "content" },
        ],
        proportions: [1, 2],
      },
    } as const satisfies SurfaceTemplatePreviewNode;
    const definition = createCataloguedTestDefinition({
      id: "page-preview-copy",
      modes: ["page"],
      preview: sourcePreview,
    });
    const catalog = createSurfaceCreationCatalog(createSurfaceVariantRegistry([definition]));
    const [entry] = catalog.forMode("page");
    const copiedPreview = entry?.catalogue.preview;

    expect(entry).toBeDefined();
    expect(entry?.catalogue).not.toBe(definition.catalogue);
    expect(copiedPreview).not.toBe(sourcePreview);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.catalogue)).toBe(true);

    if (!copiedPreview || copiedPreview.kind !== "overlay") {
      throw new Error("Expected the copied preview to remain an overlay.");
    }
    if (copiedPreview.overlay.kind !== "row") {
      throw new Error("Expected the copied overlay to remain a row.");
    }

    expect(copiedPreview.base).not.toBe(sourcePreview.base);
    expect(copiedPreview.overlay).not.toBe(sourcePreview.overlay);
    expect(copiedPreview.overlay.children).not.toBe(sourcePreview.overlay.children);
    expect(copiedPreview.overlay.children[0]).not.toBe(sourcePreview.overlay.children[0]);
    expect(copiedPreview.overlay.proportions).not.toBe(sourcePreview.overlay.proportions);
    expect(Object.isFrozen(copiedPreview)).toBe(true);
    expect(Object.isFrozen(copiedPreview.base)).toBe(true);
    expect(Object.isFrozen(copiedPreview.overlay)).toBe(true);
    expect(Object.isFrozen(copiedPreview.overlay.children)).toBe(true);
    expect(Object.isFrozen(copiedPreview.overlay.children[0])).toBe(true);
    expect(Object.isFrozen(copiedPreview.overlay.proportions)).toBe(true);
  });

  it("does not execute Surface factories during construction or mode reads", () => {
    let createSurfaceCalls = 0;
    const registry = createSurfaceVariantRegistry([
      {
        id: "page-catalogued",
        modes: ["page"],
        defaultForModes: ["page"],
        title: "Catalogued page",
        description: "A catalogued page used to prove factory dormancy.",
        catalogue: {
          section: "content",
          order: 1,
          preview: { kind: "slot", role: "content" },
        },
        createSurface: ({ surfaceId }) => {
          createSurfaceCalls += 1;
          return {
            type: "surface",
            attrs: { id: surfaceId, variant: "page-catalogued", settings: {} },
          };
        },
      },
    ]);

    const catalog = createSurfaceCreationCatalog(registry);

    expect(createSurfaceCalls).toBe(0);

    catalog.forMode("page");
    catalog.forMode("slideshow");

    expect(createSurfaceCalls).toBe(0);
  });
});

function createTestDefinition({
  id,
  defaultForModes,
}: {
  id: string;
  defaultForModes?: readonly ["page"];
}): SurfaceVariantDefinition {
  return {
    id,
    modes: ["page"],
    ...(defaultForModes ? { defaultForModes } : {}),
    title: id,
    description: id,
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: id, settings: {} },
    }),
  };
}

function createCataloguedTestDefinition({
  id,
  modes,
  section = "content",
  defaultForModes,
  preview = { kind: "slot", role: "content" },
}: {
  id: string;
  modes: SurfaceVariantDefinition["modes"];
  section?: NonNullable<SurfaceVariantDefinition["catalogue"]>["section"];
  defaultForModes?: SurfaceVariantDefinition["defaultForModes"];
  preview?: SurfaceTemplatePreviewNode;
}): SurfaceVariantDefinition {
  return {
    id,
    modes,
    defaultForModes: defaultForModes ?? modes,
    title: id,
    description: id,
    catalogue: {
      section,
      order: 1,
      preview,
    },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: id, settings: {} },
    }),
  };
}

// oxlint-disable-next-line no-constant-condition -- compile-time contract assertions must not run.
if (false) {
  const catalog = {} as SurfaceCreationCatalog;
  // @ts-expect-error -- The catalogue contract must not permit replacing its mode projection.
  catalog.forMode = () => [];
}
