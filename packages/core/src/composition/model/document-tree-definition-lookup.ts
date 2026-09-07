import type {
  DocumentTreeBlockDefinition,
  DocumentTreeDefinitionLookup,
  DocumentTreeLayoutDefinition,
  DocumentTreeLayoutSectionDefinition,
  DocumentTreeSurfaceDefinition,
} from "@/document/model/document-tree";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockRegistry } from "@/editor/blocks/block-registry";
import type { SurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

export interface CreateDocumentTreeDefinitionLookupInput {
  readonly blocks: BlockRegistry;
  readonly layouts: LayoutRegistry;
  readonly surfaces: SurfaceVariantRegistry;
}

export function createDocumentTreeDefinitionLookup({
  blocks,
  layouts,
  surfaces,
}: CreateDocumentTreeDefinitionLookupInput): DocumentTreeDefinitionLookup {
  const documentTreeBlocks = new Map(
    blocks.definitions.map((definition) => [
      definition.nodeType,
      createDocumentTreeBlockDefinition(definition),
    ]),
  );
  const documentTreeLayouts = new Map(
    layouts.definitions.map((definition) => [
      definition.id,
      createDocumentTreeLayoutDefinition(definition),
    ]),
  );
  const documentTreeSurfaces = new Map(
    surfaces.definitions.map((definition) => [
      definition.id,
      createDocumentTreeSurfaceDefinition(definition),
    ]),
  );

  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) => documentTreeBlocks.get(nodeType),
    }),
    layouts: Object.freeze({
      get: (variant: string) => documentTreeLayouts.get(variant),
    }),
    surfaces: Object.freeze({
      get: (variant: string) => documentTreeSurfaces.get(variant),
    }),
  });
}

function createDocumentTreeBlockDefinition(
  definition: BlockRegistry["definitions"][number],
): DocumentTreeBlockDefinition {
  return Object.freeze({
    nodeType: definition.nodeType,
    title: definition.title,
    isAssessment: definition.capabilities?.assessment !== undefined,
    ...(definition.documentTree ? { documentTree: definition.documentTree } : {}),
    ...(definition.control ? { control: definition.control } : {}),
  });
}

function createDocumentTreeLayoutDefinition(
  definition: LayoutRegistry["definitions"][number],
): DocumentTreeLayoutDefinition {
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    ...(definition.documentTree ? { documentTree: definition.documentTree } : {}),
    ...(definition.control ? { control: definition.control } : {}),
    ...(definition.section ? { section: createDocumentTreeLayoutSection(definition.section) } : {}),
  });
}

function createDocumentTreeLayoutSection(
  section: NonNullable<LayoutRegistry["definitions"][number]["section"]>,
): DocumentTreeLayoutSectionDefinition {
  return Object.freeze({
    label: section.label,
    compositionSlot: Object.freeze({ ...section.compositionSlot }),
    ...(section.structure
      ? {
          structure: Object.freeze({
            ...section.structure,
            nodeTypes: Object.freeze([...section.structure.nodeTypes]) as readonly [
              string,
              ...string[],
            ],
          }),
        }
      : {}),
    ...(section.documentTree ? { documentTree: section.documentTree } : {}),
  });
}

function createDocumentTreeSurfaceDefinition(
  definition: SurfaceVariantRegistry["definitions"][number],
): DocumentTreeSurfaceDefinition {
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    ...(definition.documentTree ? { documentTree: definition.documentTree } : {}),
    ...(definition.control ? { control: definition.control } : {}),
  });
}
