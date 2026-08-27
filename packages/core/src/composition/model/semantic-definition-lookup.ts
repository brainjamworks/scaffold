import type {
  SemanticBlockDefinition,
  SemanticDefinitionLookup,
  SemanticLayoutDefinition,
  SemanticLayoutSectionDefinition,
  SemanticSurfaceDefinition,
} from "@/document/model/semantic-document";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockRegistry } from "@/editor/blocks/block-registry";
import type { SurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

export interface CreateSemanticDefinitionLookupInput {
  readonly blocks: BlockRegistry;
  readonly layouts: LayoutRegistry;
  readonly surfaces: SurfaceVariantRegistry;
}

export function createSemanticDefinitionLookup({
  blocks,
  layouts,
  surfaces,
}: CreateSemanticDefinitionLookupInput): SemanticDefinitionLookup {
  const semanticBlocks = new Map(
    blocks.definitions.map((definition) => [
      definition.nodeType,
      createSemanticBlockDefinition(definition),
    ]),
  );
  const semanticLayouts = new Map(
    layouts.definitions.map((definition) => [
      definition.id,
      createSemanticLayoutDefinition(definition),
    ]),
  );
  const semanticSurfaces = new Map(
    surfaces.definitions.map((definition) => [
      definition.id,
      createSemanticSurfaceDefinition(definition),
    ]),
  );

  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) => semanticBlocks.get(nodeType),
    }),
    layouts: Object.freeze({
      get: (variant: string) => semanticLayouts.get(variant),
    }),
    surfaces: Object.freeze({
      get: (variant: string) => semanticSurfaces.get(variant),
    }),
  });
}

function createSemanticBlockDefinition(
  definition: BlockRegistry["definitions"][number],
): SemanticBlockDefinition {
  return Object.freeze({
    nodeType: definition.nodeType,
    title: definition.title,
    isAssessment: definition.capabilities?.assessment !== undefined,
    ...(definition.documentSemantics ? { documentSemantics: definition.documentSemantics } : {}),
    ...(definition.control ? { control: definition.control } : {}),
  });
}

function createSemanticLayoutDefinition(
  definition: LayoutRegistry["definitions"][number],
): SemanticLayoutDefinition {
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    ...(definition.documentSemantics ? { documentSemantics: definition.documentSemantics } : {}),
    ...(definition.control ? { control: definition.control } : {}),
    ...(definition.section ? { section: createSemanticLayoutSection(definition.section) } : {}),
  });
}

function createSemanticLayoutSection(
  section: NonNullable<LayoutRegistry["definitions"][number]["section"]>,
): SemanticLayoutSectionDefinition {
  return Object.freeze({
    label: section.label,
    ...(section.documentSemantics ? { documentSemantics: section.documentSemantics } : {}),
  });
}

function createSemanticSurfaceDefinition(
  definition: SurfaceVariantRegistry["definitions"][number],
): SemanticSurfaceDefinition {
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    ...(definition.documentSemantics ? { documentSemantics: definition.documentSemantics } : {}),
    ...(definition.control ? { control: definition.control } : {}),
  });
}
