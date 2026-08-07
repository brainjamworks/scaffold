import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import {
  createLayoutRegistry,
  type LayoutRegistry,
} from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createBlockRegistry, type BlockRegistry } from "@/editor/blocks/block-registry";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import {
  createSurfaceVariantRegistry,
  type SurfaceVariantRegistry,
} from "@/editor/surfaces/model/surface-variant-registry";
import type { SemanticDefinitionLookup } from "@/document/model/semantic-document";

import { createSemanticDefinitionLookup } from "./semantic-definition-lookup";

export interface ResolvedBlockCapabilities {
  readonly registry: BlockRegistry;
}

export interface ResolvedLayoutCapabilities {
  readonly registry: LayoutRegistry;
}

export interface ResolvedSurfaceCapabilities {
  readonly registry: SurfaceVariantRegistry;
}

export interface ResolvedScaffoldCapabilities {
  readonly blocks: ResolvedBlockCapabilities;
  readonly layouts: ResolvedLayoutCapabilities;
  readonly surfaces: ResolvedSurfaceCapabilities;
  readonly documentSemantics: SemanticDefinitionLookup;
}

export interface ResolveScaffoldCapabilitiesInput {
  readonly blockDefinitions: readonly BlockDefinition[];
  readonly layoutDefinitions: readonly LayoutDefinition[];
  readonly surfaceDefinitions: readonly SurfaceVariantDefinition[];
}

export function resolveScaffoldCapabilities({
  blockDefinitions,
  layoutDefinitions,
  surfaceDefinitions,
}: ResolveScaffoldCapabilitiesInput): ResolvedScaffoldCapabilities {
  const blocks = Object.freeze({
    registry: createBlockRegistry(blockDefinitions),
  });
  const layouts = Object.freeze({
    registry: createLayoutRegistry(layoutDefinitions),
  });
  const surfaces = Object.freeze({
    registry: createSurfaceVariantRegistry(surfaceDefinitions),
  });

  return Object.freeze({
    blocks,
    layouts,
    surfaces,
    documentSemantics: createSemanticDefinitionLookup({
      blocks: blocks.registry,
      layouts: layouts.registry,
      surfaces: surfaces.registry,
    }),
  });
}
