import {
  resolveScaffoldCapabilities,
  type ResolvedScaffoldCapabilities,
} from "@/composition/model/resolved-scaffold-capabilities";
import type { ScaffoldAuthoringCatalogues } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import { builtInLayoutAuthoringViews } from "@/editor/arrangements/layout/authoring/built-in-layout-views";
import type { LayoutViewRegistration } from "@/editor/arrangements/layout/authoring/layout-view-definition";
import {
  createLayoutAuthoringViewRegistry,
  type LayoutAuthoringViewRegistry,
} from "@/editor/arrangements/layout/authoring/layout-view-registry";
import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { builtInBlockAuthoringBindings } from "@/editor/blocks/authoring-block-extensions";
import {
  createSurfaceAuthoringChromeResolver,
  createSurfaceAuthoringViewMap,
  type SurfaceAuthoringChromeResolver,
  type SurfaceAuthoringViewBinding,
  type SurfaceAuthoringViewMap,
} from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { builtInSurfaceAuthoringViewBindings } from "@/editor/surfaces/authoring/surface-authoring-views";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { validateSurfaceVariantFactories } from "@/editor/surfaces/model/surface-variant-registry";

import { createScaffoldAuthoringCatalogues } from "./scaffold-authoring-catalogues";

export interface ScaffoldAuthoringBlockComposition {
  readonly extensions: readonly AnyExtension[];
}

export interface ScaffoldAuthoringLayoutComposition {
  readonly views: LayoutAuthoringViewRegistry;
}

export interface ScaffoldAuthoringSurfaceComposition {
  readonly views: SurfaceAuthoringViewMap;
  readonly chrome: SurfaceAuthoringChromeResolver;
}

export interface ScaffoldAuthoringComposition {
  readonly capabilities: ResolvedScaffoldCapabilities;
  readonly blocks: ScaffoldAuthoringBlockComposition;
  readonly layouts: ScaffoldAuthoringLayoutComposition;
  readonly surfaces: ScaffoldAuthoringSurfaceComposition;
  readonly catalogues: ScaffoldAuthoringCatalogues;
}

export function createScaffoldAuthoringComposition(
  capabilities: ResolvedScaffoldCapabilities,
  blockExtensions: readonly AnyExtension[],
  layoutViews: readonly LayoutViewRegistration[],
  surfaceViews: readonly SurfaceAuthoringViewBinding[],
): ScaffoldAuthoringComposition {
  const views = createSurfaceAuthoringViewMap({
    registry: capabilities.surfaces.registry,
    bindings: surfaceViews,
  });

  return Object.freeze({
    capabilities,
    blocks: Object.freeze({
      extensions: Object.freeze([...blockExtensions]),
    }),
    layouts: Object.freeze({
      views: createLayoutAuthoringViewRegistry(capabilities.layouts.registry, layoutViews),
    }),
    surfaces: Object.freeze({
      views,
      chrome: createSurfaceAuthoringChromeResolver(views),
    }),
    catalogues: createScaffoldAuthoringCatalogues(capabilities),
  });
}

export function createCoreScaffoldAuthoringComposition(): ScaffoldAuthoringComposition {
  const capabilities = resolveScaffoldCapabilities({
    blockDefinitions: builtInBlockDefinitions,
    layoutDefinitions: builtInLayoutDefinitions,
    surfaceDefinitions: builtInSurfaceVariantDefinitions,
  });
  validateSurfaceVariantFactories(capabilities.surfaces.registry);

  return createScaffoldAuthoringComposition(
    capabilities,
    builtInBlockAuthoringBindings.map(({ extension }) => extension),
    builtInLayoutAuthoringViews,
    builtInSurfaceAuthoringViewBindings,
  );
}
import type { AnyExtension } from "@tiptap/core";
