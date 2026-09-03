import { describe, expect, it } from "vite-plus/test";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

import {
  builtInSurfaceVariantDefinitions,
  builtInSurfaceVariantRegistry,
} from "./built-in-surface-variant-definitions";
import {
  compareSurfaceCatalogueDefinitions,
  type RegisteredSurfaceVariantCatalogueDefinition,
} from "./surface-variant-definition";

const BUILT_IN_SURFACE_VARIANT_IDS = [
  "page-default",
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
] as const;

const BUILT_IN_SLIDESHOW_CATALOGUE_IDS = [
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
] as const;

describe("built-in surface variant definitions", () => {
  it("assembles the exact deterministic 28-variant production set", () => {
    expect(builtInSurfaceVariantDefinitions.map(({ id }) => id)).toEqual(
      BUILT_IN_SURFACE_VARIANT_IDS,
    );
    expect(builtInSurfaceVariantRegistry.definitions.map(({ id }) => id)).toEqual(
      BUILT_IN_SURFACE_VARIANT_IDS,
    );
    expect(Object.isFrozen(builtInSurfaceVariantDefinitions)).toBe(true);
    expect(Object.isFrozen(builtInSurfaceVariantRegistry)).toBe(true);
  });

  it("resolves the page and slideshow defaults", () => {
    expect(builtInSurfaceVariantRegistry.defaultForMode("page")?.id).toBe("page-default");
    expect(builtInSurfaceVariantRegistry.defaultForMode("slideshow")?.id).toBe("slide-cover");
  });

  it("preserves the canonical slideshow catalogue order", () => {
    const catalogue = builtInSurfaceVariantRegistry
      .forMode("slideshow")
      .filter(
        (definition): definition is RegisteredSurfaceVariantCatalogueDefinition =>
          definition.catalogue !== undefined,
      );
    catalogue.sort(compareSurfaceCatalogueDefinitions);

    expect(catalogue.map(({ id }) => id)).toEqual(BUILT_IN_SLIDESHOW_CATALOGUE_IDS);
    expect(catalogue.at(-1)?.catalogue.section).toBe("assessment");
  });

  it("preserves factory identity and validates every factory default", () => {
    for (const definition of builtInSurfaceVariantDefinitions) {
      const registered = builtInSurfaceVariantRegistry.get(definition.id);
      const surfaceId = createEmbeddedNodeId();
      const surface = definition.createSurface({ surfaceId });

      expect(registered?.createSurface).toBe(definition.createSurface);
      expect(surface.attrs?.["id"]).toBe(surfaceId);
      expect(surface.attrs?.["variant"]).toBe(definition.id);
      expect(registered?.settingsSchema.safeParse(surface.attrs?.["settings"] ?? {}).success).toBe(
        true,
      );
    }
  });

  it("keeps neutral definitions free of lane-specific fields", () => {
    for (const definition of builtInSurfaceVariantRegistry.definitions) {
      expect(definition).not.toHaveProperty("component");
      expect(definition).not.toHaveProperty("view");
      expect(definition).not.toHaveProperty("authoring");
      expect(definition).not.toHaveProperty("runtime");
      expect(definition).not.toHaveProperty("player");
      expect(definition).not.toHaveProperty("shell");
    }
  });

  it("declares semantic publication for every built-in Surface", () => {
    for (const definition of builtInSurfaceVariantRegistry.definitions) {
      expect(definition.documentSemantics?.projectChildren).toBeTypeOf("function");
    }
  });

  it("keeps specialized declarations as pure unregistered values", () => {
    const specializedIds = new Set([
      "page-default",
      "slide-cover",
      "slide-image-cover",
      "slide-image-band",
      "slide-module-cover",
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

    for (const definition of builtInSurfaceVariantDefinitions) {
      if (specializedIds.has(definition.id)) {
        expect(definition).not.toHaveProperty("nodeType");
      }
    }
  });
});
