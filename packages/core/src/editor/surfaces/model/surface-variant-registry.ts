import type { JSONContent } from "@tiptap/core";

import type { CourseMode } from "@/schemas/course-document";

import {
  normalizeSurfaceDefinition,
  type CreateDefaultSurfaceForModeInput,
  type FixedSurfaceChild,
  type RegisteredSurfaceVariantCatalogueDefinition,
  type RegisteredSurfaceVariantDefinition,
  type SurfaceAlignmentDefinition,
  type SurfaceCatalogueEntry,
  type SurfaceVariantDefinition,
  type SurfaceStructurePolicy,
  type SurfaceTemplatePreviewNode,
} from "./surface-variant-definition";

export interface SurfaceVariantRegistry {
  readonly definitions: readonly RegisteredSurfaceVariantDefinition[];
  get(id: string): RegisteredSurfaceVariantDefinition | undefined;
  forMode(mode: CourseMode): readonly RegisteredSurfaceVariantDefinition[];
  defaultForMode(mode: CourseMode): RegisteredSurfaceVariantDefinition | undefined;
  createDefault(input: CreateDefaultSurfaceForModeInput): JSONContent;
}

export interface SurfaceVariantLookup {
  get(id: string): RegisteredSurfaceVariantDefinition | undefined;
}

const EMPTY_SURFACE_DEFINITIONS: readonly RegisteredSurfaceVariantDefinition[] = Object.freeze([]);
const SURFACE_VARIANT_REGISTRY_VALIDATION_ID = "surface-variant-registry-validation";

export function createSurfaceVariantRegistry(
  definitions: readonly SurfaceVariantDefinition[],
): SurfaceVariantRegistry {
  const normalizedDefinitions: RegisteredSurfaceVariantDefinition[] = [];
  const definitionsById = new Map<string, RegisteredSurfaceVariantDefinition>();
  const definitionsByMode = new Map<CourseMode, RegisteredSurfaceVariantDefinition[]>();
  const catalogueDefinitionIdsByPosition = new Map<string, string>();
  const defaultDefinitionsByMode = new Map<CourseMode, RegisteredSurfaceVariantDefinition>();

  for (const input of definitions) {
    if (input.id.trim().length === 0) {
      throw new Error(`Surface definition ID "${input.id}" must not be blank.`);
    }
    if (definitionsById.has(input.id)) {
      throw new Error(`Surface definition "${input.id}" is already registered.`);
    }

    const definition = createImmutableSurfaceDefinition(input);
    validateSurfaceFactory(definition);
    if (hasSurfaceCatalogue(definition)) {
      const cataloguePosition = `${definition.catalogue.section}:${definition.catalogue.order}`;
      const existingCatalogueDefinitionId = catalogueDefinitionIdsByPosition.get(cataloguePosition);
      if (existingCatalogueDefinitionId) {
        throw new Error(
          `Surface catalogue position "${cataloguePosition}" is already registered by "${existingCatalogueDefinitionId}".`,
        );
      }
      catalogueDefinitionIdsByPosition.set(cataloguePosition, definition.id);
    }

    for (const mode of definition.defaultForModes ?? []) {
      const existingDefault = defaultDefinitionsByMode.get(mode);
      if (existingDefault) {
        throw new Error(
          `Course mode "${mode}" already has default surface "${existingDefault.id}".`,
        );
      }
    }

    normalizedDefinitions.push(definition);
    definitionsById.set(definition.id, definition);

    for (const mode of definition.defaultForModes ?? []) {
      defaultDefinitionsByMode.set(mode, definition);
    }
    for (const mode of definition.modes) {
      const modeDefinitions = definitionsByMode.get(mode) ?? [];
      modeDefinitions.push(definition);
      definitionsByMode.set(mode, modeDefinitions);
    }
  }

  for (const mode of definitionsByMode.keys()) {
    if (!defaultDefinitionsByMode.has(mode)) {
      throw new Error(`Course mode "${mode}" has no default surface definition.`);
    }
  }

  const immutableDefinitions = Object.freeze([...normalizedDefinitions]);
  const immutableDefinitionsByMode = new Map<
    CourseMode,
    readonly RegisteredSurfaceVariantDefinition[]
  >();
  for (const [mode, modeDefinitions] of definitionsByMode) {
    immutableDefinitionsByMode.set(mode, Object.freeze([...modeDefinitions]));
  }

  return Object.freeze({
    definitions: immutableDefinitions,
    get: (id: string) => definitionsById.get(id),
    forMode: (mode: CourseMode) =>
      immutableDefinitionsByMode.get(mode) ?? EMPTY_SURFACE_DEFINITIONS,
    defaultForMode: (mode: CourseMode) => defaultDefinitionsByMode.get(mode),
    createDefault: (input: CreateDefaultSurfaceForModeInput) => {
      const definition = defaultDefinitionsByMode.get(input.mode);
      if (definition) return definition.createSurface(input);

      throw new Error(`No default surface definition registered for course mode "${input.mode}".`);
    },
  });
}

function hasSurfaceCatalogue(
  definition: RegisteredSurfaceVariantDefinition,
): definition is RegisteredSurfaceVariantCatalogueDefinition {
  return definition.catalogue !== undefined;
}

function validateSurfaceFactory(definition: RegisteredSurfaceVariantDefinition): void {
  const surface = definition.createSurface({ surfaceId: SURFACE_VARIANT_REGISTRY_VALIDATION_ID });
  if (surface.type !== "surface") {
    throw new Error(`Surface definition "${definition.id}" must create a surface node.`);
  }
  if (surface.attrs?.["id"] !== SURFACE_VARIANT_REGISTRY_VALIDATION_ID) {
    throw new Error(
      `Surface definition "${definition.id}" must create the requested surface instance id.`,
    );
  }
  if (surface.attrs?.["variant"] !== definition.id) {
    throw new Error(
      `Surface definition "${definition.id}" must create its own persisted surface variant.`,
    );
  }
  if (!definition.settingsSchema.safeParse(surface.attrs?.["settings"] ?? {}).success) {
    throw new Error(`Surface definition "${definition.id}" creates invalid default settings.`);
  }
}

function createImmutableSurfaceDefinition(
  input: SurfaceVariantDefinition,
): RegisteredSurfaceVariantDefinition {
  const definition = normalizeSurfaceDefinition(input);
  return Object.freeze({
    ...definition,
    modes: Object.freeze([...definition.modes]),
    ...(definition.defaultForModes
      ? { defaultForModes: Object.freeze([...definition.defaultForModes]) }
      : {}),
    ...(definition.catalogue
      ? { catalogue: createImmutableSurfaceCatalogue(definition.catalogue) }
      : {}),
    ...(definition.alignment
      ? { alignment: createImmutableSurfaceAlignment(definition.alignment) }
      : {}),
    ...(definition.structurePolicy
      ? { structurePolicy: createImmutableSurfaceStructurePolicy(definition.structurePolicy) }
      : {}),
  });
}

function createImmutableSurfaceCatalogue(catalogue: SurfaceCatalogueEntry): SurfaceCatalogueEntry {
  return Object.freeze({
    ...catalogue,
    preview: createImmutableSurfacePreview(catalogue.preview),
  });
}

function createImmutableSurfacePreview(
  preview: SurfaceTemplatePreviewNode,
): SurfaceTemplatePreviewNode {
  if (preview.kind === "slot") return Object.freeze({ ...preview });

  if (preview.kind === "overlay") {
    return Object.freeze({
      ...preview,
      base: createImmutableSurfacePreview(preview.base),
      overlay: createImmutableSurfacePreview(preview.overlay),
    });
  }

  return Object.freeze({
    ...preview,
    children: Object.freeze(preview.children.map(createImmutableSurfacePreview)),
    ...(preview.proportions ? { proportions: Object.freeze([...preview.proportions]) } : {}),
  });
}

function createImmutableSurfaceAlignment(
  alignment: SurfaceAlignmentDefinition,
): SurfaceAlignmentDefinition {
  return Object.freeze({
    ...alignment,
    ...(alignment.verticalContentPosition
      ? {
          verticalContentPosition: Object.freeze({ ...alignment.verticalContentPosition }),
        }
      : {}),
  });
}

function createImmutableSurfaceStructurePolicy(
  policy: SurfaceStructurePolicy,
): SurfaceStructurePolicy {
  return Object.freeze({
    ...policy,
    ...(policy.fixedChildren
      ? { fixedChildren: Object.freeze(policy.fixedChildren.map(createImmutableFixedSurfaceChild)) }
      : {}),
  });
}

function createImmutableFixedSurfaceChild(child: FixedSurfaceChild): FixedSurfaceChild {
  return Object.freeze({
    ...child,
    ...(child.attrs ? { attrs: Object.freeze({ ...child.attrs }) } : {}),
  });
}
