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

export interface ScaffoldRuntimeBlockComposition {
  readonly extensions: readonly AnyExtension[];
}

export interface ScaffoldRuntimeLayoutComposition {
  readonly views: LayoutRuntimeViewRegistry;
}

export interface ScaffoldRuntimeComposition {
  readonly capabilities: ResolvedScaffoldCapabilities;
  readonly blocks: ScaffoldRuntimeBlockComposition;
  readonly layouts: ScaffoldRuntimeLayoutComposition;
}

export function createScaffoldRuntimeComposition(
  capabilities: ResolvedScaffoldCapabilities,
  blockExtensions: readonly AnyExtension[],
  layoutViews: readonly LayoutRuntimeViewRegistration[],
): ScaffoldRuntimeComposition {
  return Object.freeze({
    capabilities,
    blocks: Object.freeze({
      extensions: Object.freeze([...blockExtensions]),
    }),
    layouts: Object.freeze({
      views: createLayoutRuntimeViewRegistry(capabilities.layouts.registry, layoutViews),
    }),
  });
}

export function createCoreScaffoldRuntimeComposition(): ScaffoldRuntimeComposition {
  return createScaffoldRuntimeComposition(
    resolveScaffoldCapabilities({
      blockDefinitions: builtInBlockDefinitions,
      layoutDefinitions: builtInLayoutDefinitions,
    }),
    builtInBlockRuntimeBindings.map(({ extension }) => extension),
    builtInLayoutRuntimeViews,
  );
}
import type { AnyExtension } from "@tiptap/core";
