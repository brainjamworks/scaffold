import { describe, expect, it } from "vite-plus/test";

import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { createSurfaceVariantRegistry } from "../model/surface-variant-registry";
import type { SurfaceVariantDefinition } from "../model/surface-variant-definition";

import { createSurfaceCreationCatalog } from "./surface-creation-catalog";

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
    ]);
  });

  it("omits registered variants without catalogue metadata", () => {
    const registry = createSurfaceVariantRegistry([
      createTestDefinition({ id: "page-default", defaultForModes: ["page"] }),
      createTestDefinition({ id: "page-hidden" }),
    ]);

    expect(createSurfaceCreationCatalog(registry).forMode("page")).toEqual([]);
  });

  it("owns frozen catalogue entry snapshots", () => {
    const catalog = createSurfaceCreationCatalog(builtInSurfaceVariantRegistry);
    const [entry] = catalog.forMode("slideshow");

    expect(entry).toBeDefined();
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.catalogue)).toBe(true);
    expect(Object.isFrozen(catalog.forMode("slideshow"))).toBe(true);
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
