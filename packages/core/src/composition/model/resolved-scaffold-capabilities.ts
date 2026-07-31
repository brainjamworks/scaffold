import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import {
  createLayoutRegistry,
  type LayoutRegistry,
} from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createBlockRegistry, type BlockRegistry } from "@/editor/blocks/block-registry";

export interface ResolvedBlockCapabilities {
  readonly registry: BlockRegistry;
}

export interface ResolvedLayoutCapabilities {
  readonly registry: LayoutRegistry;
}

export interface ResolvedScaffoldCapabilities {
  readonly blocks: ResolvedBlockCapabilities;
  readonly layouts: ResolvedLayoutCapabilities;
}

export interface ResolveScaffoldCapabilitiesInput {
  readonly blockDefinitions: readonly BlockDefinition[];
  readonly layoutDefinitions: readonly LayoutDefinition[];
}

export function resolveScaffoldCapabilities({
  blockDefinitions,
  layoutDefinitions,
}: ResolveScaffoldCapabilitiesInput): ResolvedScaffoldCapabilities {
  return Object.freeze({
    blocks: Object.freeze({
      registry: createBlockRegistry(blockDefinitions),
    }),
    layouts: Object.freeze({
      registry: createLayoutRegistry(layoutDefinitions),
    }),
  });
}
