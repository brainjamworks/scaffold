import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import {
  createLayoutRegistry,
  type LayoutRegistry,
} from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createBlockRegistry, type BlockRegistry } from "@/editor/blocks/block-registry";
import type {
  BlockDuplicationLookup,
  BlockDuplicationOperation,
} from "@/document/model/identity/clone-with-new-ids";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import {
  createSurfaceVariantRegistry,
  type SurfaceVariantRegistry,
} from "@/editor/surfaces/model/surface-variant-registry";
import type { SemanticDefinitionLookup } from "@/document/model/semantic-document";

import { createSemanticDefinitionLookup } from "./semantic-definition-lookup";

export interface ResolvedBlockCapabilities {
  readonly registry: BlockRegistry;
  readonly duplication: BlockDuplicationLookup;
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

export interface ResolvableBlockCapability {
  readonly definition: BlockDefinition;
  readonly duplication?: BlockDuplicationOperation;
}

export interface ResolveScaffoldCapabilitiesInput {
  readonly blockCapabilities: readonly ResolvableBlockCapability[];
  readonly layoutDefinitions: readonly LayoutDefinition[];
  readonly surfaceDefinitions: readonly SurfaceVariantDefinition[];
}

export function resolveScaffoldCapabilities({
  blockCapabilities,
  layoutDefinitions,
  surfaceDefinitions,
}: ResolveScaffoldCapabilitiesInput): ResolvedScaffoldCapabilities {
  const blocks = Object.freeze({
    registry: createBlockRegistry(blockCapabilities.map((capability) => capability.definition)),
    duplication: createBlockDuplicationLookup(blockCapabilities),
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

function createBlockDuplicationLookup(
  capabilities: readonly ResolvableBlockCapability[],
): BlockDuplicationLookup {
  const operationsByNodeType = new Map<string, BlockDuplicationOperation>();
  const mountedNodeTypes = new Set<string>();

  for (const capability of capabilities) {
    mountedNodeTypes.add(capability.definition.nodeType);
    if (capability.duplication) {
      operationsByNodeType.set(capability.definition.nodeType, capability.duplication);
    }
  }

  return Object.freeze({
    getByNodeType: (nodeType: string) => operationsByNodeType.get(nodeType),
    hasNodeType: (nodeType: string) => mountedNodeTypes.has(nodeType),
  });
}
