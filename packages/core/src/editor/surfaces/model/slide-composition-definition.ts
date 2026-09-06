import type { ZodTypeAny } from "zod";
import { z } from "zod";

import {
  normalizeSurfaceDefinition,
  type FixedSurfaceChild,
  type RegisteredSurfaceVariantDefinition,
  type SurfaceVariantDefinition,
} from "./surface-variant-definition";
import { matchFixedSurfaceChildren } from "./policies/surface-fixed-structure";
import {
  CANONICAL_COMPOSITION_POLICIES,
  assertCreateSurfaceMatchesFixedChildren,
  createClosedSlideCompositionSettingsSchema,
  createCompositionSettingsProbe,
  createParsedSlideCompositionSurface,
  validateCanonicalComposition,
  validateCompositionCapabilities,
  validateCompositionDefaults,
  validateSettingsSchemaCapabilities,
} from "./slide-composition-validation";
import {
  SlideCompositionCatalogueStagingSchema,
  SlideCompositionMetadataSchema,
  type RegisteredSurfaceCatalogue,
  type SlideCompositionMetadata,
  type SurfaceCatalogueInput,
} from "./slide-composition-schema";
import { createSurfaceDocumentTree } from "./surface-document-tree";

export type SlideCompositionStructurePolicy = {
  readonly fixedChildren: readonly FixedSurfaceChild[];
  readonly allowRootInsertion: false;
};

export type DefineSlideCompositionSurfaceInput = Omit<
  SurfaceVariantDefinition,
  "catalogue" | "modes" | "settingsSchema" | "structurePolicy"
> & {
  catalogue: SurfaceCatalogueInput;
  slideComposition: z.input<typeof SlideCompositionMetadataSchema>;
  settingsSchema: ZodTypeAny;
  structurePolicy: SlideCompositionStructurePolicy;
};

export type RegisteredSlideCompositionSurfaceDefinition = Omit<
  RegisteredSurfaceVariantDefinition,
  "catalogue" | "modes" | "settingsSchema" | "structurePolicy"
> & {
  readonly modes: readonly ["slideshow"];
  readonly catalogue: RegisteredSurfaceCatalogue;
  readonly slideComposition: SlideCompositionMetadata;
  readonly settingsSchema: ZodTypeAny;
  readonly structurePolicy: SlideCompositionStructurePolicy;
};

const SLIDESHOW_MODES: readonly ["slideshow"] = Object.freeze(["slideshow"]);

export function defineSlideCompositionSurface(
  definition: DefineSlideCompositionSurfaceInput,
): RegisteredSlideCompositionSurfaceDefinition {
  const parsedCatalogue = SlideCompositionCatalogueStagingSchema.parse(definition.catalogue);
  const catalogue = Object.freeze({
    ...definition.catalogue,
    section: parsedCatalogue.section,
    order: parsedCatalogue.order,
  });
  const slideComposition = SlideCompositionMetadataSchema.parse(definition.slideComposition);
  const structurePolicy = createImmutableStructurePolicy(definition.structurePolicy);
  const definitionId = definition.id;
  const sourceCreateSurface = definition.createSurface;
  const sourceSettingsSchema = definition.settingsSchema;
  const compositionPolicy = CANONICAL_COMPOSITION_POLICIES[slideComposition.id];
  const expectedCatalogueSection = compositionPolicy.catalogueSection;
  if (catalogue.section !== expectedCatalogueSection) {
    throw new Error(
      `Slide composition "${slideComposition.id}" must be catalogued in the "${expectedCatalogueSection}" section.`,
    );
  }
  const expectedFixedChildren: readonly FixedSurfaceChild[] = [
    { type: "slide_title" },
    ...slideComposition.regions.map((role) => ({ type: "region", attrs: { role } })),
  ];
  const fixedChildrenMatch = matchFixedSurfaceChildren(
    structurePolicy.fixedChildren,
    expectedFixedChildren,
  );
  if (!fixedChildrenMatch.exact) {
    throw new Error(
      `Slide composition definition "${definition.id}" fixedChildren do not match its declared title and region roles.`,
    );
  }
  validateCanonicalComposition(slideComposition);
  validateCompositionCapabilities(slideComposition);
  const settingsProbe = createCompositionSettingsProbe(slideComposition);
  validateSettingsSchemaCapabilities(
    definition.id,
    slideComposition,
    sourceSettingsSchema,
    settingsProbe,
  );
  const settingsSchema = createClosedSlideCompositionSettingsSchema(
    definition.id,
    slideComposition,
    sourceSettingsSchema,
  );
  validateSettingsSchemaCapabilities(
    definition.id,
    slideComposition,
    settingsSchema,
    settingsProbe,
  );

  const createSurface: SurfaceVariantDefinition["createSurface"] = (input) => {
    const surface = createParsedSlideCompositionSurface(
      definitionId,
      sourceCreateSurface,
      settingsSchema,
      input,
    );
    validateCompositionDefaults(definitionId, slideComposition, surface.attrs?.["settings"]);
    assertCreateSurfaceMatchesFixedChildren(definitionId, surface, structurePolicy.fixedChildren);
    return surface;
  };

  const surfaceDefinition = {
    ...definition,
    catalogue,
    createSurface,
    documentTree:
      definition.documentTree ??
      createSurfaceDocumentTree({ ownedRichTextNodeTypes: ["slide_title"] }),
    slideComposition,
    modes: SLIDESHOW_MODES,
    settingsSchema,
    structurePolicy,
  };
  const normalized = normalizeSurfaceDefinition(surfaceDefinition);

  if (!isRegisteredSlideCompositionSurfaceDefinition(normalized)) {
    throw new Error(`Slide composition definition "${definition.id}" is incomplete.`);
  }
  return Object.freeze(normalized);
}

export function isRegisteredSlideCompositionSurfaceDefinition(
  definition: RegisteredSurfaceVariantDefinition,
): definition is RegisteredSlideCompositionSurfaceDefinition {
  if (!("catalogue" in definition) || !("slideComposition" in definition)) return false;

  const catalogueResult = SlideCompositionCatalogueStagingSchema.safeParse(definition.catalogue);
  const slideCompositionResult = SlideCompositionMetadataSchema.safeParse(
    definition.slideComposition,
  );
  const structurePolicy = definition.structurePolicy;

  return (
    catalogueResult.success &&
    slideCompositionResult.success &&
    definition.modes.length === 1 &&
    definition.modes[0] === "slideshow" &&
    definition.settingsSchema !== undefined &&
    structurePolicy?.allowRootInsertion === false &&
    Array.isArray(structurePolicy.fixedChildren)
  );
}

function createImmutableStructurePolicy(
  policy: SlideCompositionStructurePolicy,
): SlideCompositionStructurePolicy {
  const fixedChildren = Object.freeze(
    policy.fixedChildren.map((child) =>
      Object.freeze({
        type: child.type,
        ...(child.attrs ? { attrs: Object.freeze({ ...child.attrs }) } : {}),
      }),
    ),
  );
  return Object.freeze({ fixedChildren, allowRootInsertion: false });
}
