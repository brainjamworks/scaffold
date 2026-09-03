import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import {
  createLayoutRegistry,
  type LayoutRegistry,
} from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createBlockRegistry, type BlockRegistry } from "@/editor/blocks/block-registry";
import {
  createContentIdentityRewriteLookup,
  type ContentIdentityRewriteLookup,
  type ContentIdentityRewriteRegistration,
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
  readonly contentIdentity: {
    readonly rewrites: ContentIdentityRewriteLookup;
  };
  readonly documentSemantics: SemanticDefinitionLookup;
}

export interface ResolvableBlockCapability {
  readonly definition: BlockDefinition;
  readonly identityRewrites?: readonly ContentIdentityRewriteRegistration[];
}

export interface ResolveScaffoldCapabilitiesInput {
  readonly blockCapabilities: readonly ResolvableBlockCapability[];
  readonly layoutDefinitions: readonly LayoutDefinition[];
  readonly surfaceDefinitions: readonly SurfaceVariantDefinition[];
  readonly identityRewriteRegistrations?: readonly ContentIdentityRewriteRegistration[];
}

export function resolveScaffoldCapabilities({
  blockCapabilities,
  layoutDefinitions,
  surfaceDefinitions,
  identityRewriteRegistrations = [],
}: ResolveScaffoldCapabilitiesInput): ResolvedScaffoldCapabilities {
  const blocks = Object.freeze({
    registry: createBlockRegistry(blockCapabilities.map((capability) => capability.definition)),
  });
  const layouts = Object.freeze({
    registry: createLayoutRegistry(layoutDefinitions),
  });
  const surfaces = Object.freeze({
    registry: createSurfaceVariantRegistry(surfaceDefinitions),
  });
  const contentIdentity = Object.freeze({
    rewrites: createContentIdentityRewriteLookup([
      ...blockCapabilities.flatMap((capability) => capability.identityRewrites ?? []),
      ...identityRewriteRegistrations,
    ]),
  });

  return Object.freeze({
    blocks,
    layouts,
    surfaces,
    contentIdentity,
    documentSemantics: createSemanticDefinitionLookup({
      blocks: blocks.registry,
      layouts: layouts.registry,
      surfaces: surfaces.registry,
    }),
  });
}
