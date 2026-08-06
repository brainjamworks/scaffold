import {
  resolveScaffoldCapabilities,
  type ResolvedScaffoldCapabilities,
} from "@/composition/model/resolved-scaffold-capabilities";
import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInLayoutRuntimeViews } from "@/editor/arrangements/layout/runtime/built-in-layout-views";
import type { LayoutRuntimeViewRegistration } from "@/editor/arrangements/layout/runtime/layout-view-definition";
import {
  createLayoutRuntimeViewRegistry,
  type LayoutRuntimeViewRegistry,
} from "@/editor/arrangements/layout/runtime/layout-view-registry";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { builtInBlockRuntimeBindings } from "@/editor/blocks/runtime-block-extensions";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { validateSurfaceVariantFactories } from "@/editor/surfaces/model/surface-variant-registry";
import {
  createSurfaceRuntimeViewMap,
  type SurfaceRuntimeViewBinding,
  type SurfaceRuntimeViewMap,
} from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { builtInSurfaceRuntimeViewBindings } from "@/editor/surfaces/runtime/surface-runtime-views";

export interface ScaffoldRuntimeBlockComposition {
  readonly extensions: readonly AnyExtension[];
}

export interface ScaffoldRuntimeLayoutComposition {
  readonly views: LayoutRuntimeViewRegistry;
}

export interface ScaffoldRuntimeSurfaceComposition {
  readonly views: SurfaceRuntimeViewMap;
}

export interface ScaffoldRuntimeComposition {
  readonly capabilities: ResolvedScaffoldCapabilities;
  readonly blocks: ScaffoldRuntimeBlockComposition;
  readonly layouts: ScaffoldRuntimeLayoutComposition;
  readonly surfaces: ScaffoldRuntimeSurfaceComposition;
}

export function createScaffoldRuntimeComposition(
  capabilities: ResolvedScaffoldCapabilities,
  blockExtensions: readonly AnyExtension[],
  layoutViews: readonly LayoutRuntimeViewRegistration[],
  surfaceViews: readonly SurfaceRuntimeViewBinding[],
): ScaffoldRuntimeComposition {
  return Object.freeze({
    capabilities,
    blocks: Object.freeze({
      extensions: Object.freeze([...blockExtensions]),
    }),
    layouts: Object.freeze({
      views: createLayoutRuntimeViewRegistry(capabilities.layouts.registry, layoutViews),
    }),
    surfaces: Object.freeze({
      views: createSurfaceRuntimeViewMap({
        registry: capabilities.surfaces.registry,
        bindings: surfaceViews,
      }),
    }),
  });
}

export function createCoreScaffoldRuntimeComposition(): ScaffoldRuntimeComposition {
  const capabilities = resolveScaffoldCapabilities({
    blockDefinitions: builtInBlockDefinitions,
    layoutDefinitions: builtInLayoutDefinitions,
    surfaceDefinitions: builtInSurfaceVariantDefinitions,
  });
  validateSurfaceVariantFactories(capabilities.surfaces.registry);
  return createScaffoldRuntimeComposition(
    capabilities,
    builtInBlockRuntimeBindings.map(({ extension }) => extension),
    builtInLayoutRuntimeViews,
    builtInSurfaceRuntimeViewBindings,
  );
}
import type { AnyExtension } from "@tiptap/core";
