import {
  resolveScaffoldCapabilities,
  type ResolvedScaffoldCapabilities,
} from "@/composition/model/resolved-scaffold-capabilities";
import { builtInLayoutAuthoringViews } from "@/editor/arrangements/layout/authoring/built-in-layout-views";
import type { LayoutViewRegistration } from "@/editor/arrangements/layout/authoring/layout-view-definition";
import {
  createLayoutAuthoringViewRegistry,
  type LayoutAuthoringViewRegistry,
} from "@/editor/arrangements/layout/authoring/layout-view-registry";
import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { builtInBlockAuthoringBindings } from "@/editor/blocks/authoring-block-extensions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { validateSurfaceVariantFactories } from "@/editor/surfaces/model/surface-variant-registry";

export interface ScaffoldAuthoringBlockComposition {
  readonly extensions: readonly AnyExtension[];
}

export interface ScaffoldAuthoringLayoutComposition {
  readonly views: LayoutAuthoringViewRegistry;
}

export interface ScaffoldAuthoringComposition {
  readonly capabilities: ResolvedScaffoldCapabilities;
  readonly blocks: ScaffoldAuthoringBlockComposition;
  readonly layouts: ScaffoldAuthoringLayoutComposition;
}

export function createScaffoldAuthoringComposition(
  capabilities: ResolvedScaffoldCapabilities,
  blockExtensions: readonly AnyExtension[],
  layoutViews: readonly LayoutViewRegistration[],
): ScaffoldAuthoringComposition {
  return Object.freeze({
    capabilities,
    blocks: Object.freeze({
      extensions: Object.freeze([...blockExtensions]),
    }),
    layouts: Object.freeze({
      views: createLayoutAuthoringViewRegistry(capabilities.layouts.registry, layoutViews),
    }),
  });
}

export function createCoreScaffoldAuthoringComposition(): ScaffoldAuthoringComposition {
  const capabilities = resolveScaffoldCapabilities({
    blockDefinitions: builtInBlockDefinitions,
    layoutDefinitions: builtInLayoutDefinitions,
  });
  validateSurfaceVariantFactories(builtInSurfaceVariantRegistry);

  return createScaffoldAuthoringComposition(
    capabilities,
    builtInBlockAuthoringBindings.map(({ extension }) => extension),
    builtInLayoutAuthoringViews,
  );
}
import type { AnyExtension } from "@tiptap/core";
