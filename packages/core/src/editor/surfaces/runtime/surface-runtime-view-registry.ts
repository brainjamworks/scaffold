import type { NodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";

import type { RegisteredSurfaceVariantDefinition } from "../model/surface-variant-definition";
import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";

export interface SurfaceRuntimeViewProps extends NodeViewProps {
  readonly definition: RegisteredSurfaceVariantDefinition;
  readonly runtimeView: RegisteredSurfaceRuntimeView;
  readonly isEmpty: boolean;
  readonly variant: string;
}

export interface SurfaceRuntimeViewBinding {
  readonly variantId: string;
  readonly component: ComponentType<SurfaceRuntimeViewProps>;
}

export interface RegisteredSurfaceRuntimeView extends SurfaceRuntimeViewBinding {
  readonly nodeType: "surface";
}

export interface SurfaceRuntimeViewMap {
  get(variantId: string): RegisteredSurfaceRuntimeView | undefined;
}

type SurfaceRuntimeRegistry = Pick<SurfaceVariantRegistry, "definitions" | "get">;

export function createSurfaceRuntimeViewMap({
  registry,
  bindings,
}: {
  registry: SurfaceRuntimeRegistry;
  bindings: readonly SurfaceRuntimeViewBinding[];
}): SurfaceRuntimeViewMap {
  const viewsByVariantId = new Map<string, RegisteredSurfaceRuntimeView>();

  for (const binding of bindings) {
    if (viewsByVariantId.has(binding.variantId)) {
      throw new Error(`Surface variant "${binding.variantId}" is already bound for runtime.`);
    }
    if (!registry.get(binding.variantId)) {
      throw new Error(`Surface runtime variant "${binding.variantId}" is not registered.`);
    }
    viewsByVariantId.set(binding.variantId, normalizeSurfaceRuntimeView(binding));
  }

  for (const definition of registry.definitions) {
    if (!viewsByVariantId.has(definition.id)) {
      throw new Error(`Surface variant "${definition.id}" has no runtime view binding.`);
    }
  }

  return Object.freeze({
    get: (variantId: string) => viewsByVariantId.get(variantId),
  });
}

export function getSurfaceVariantFromAttrs(attrs: Record<string, unknown>): string | null {
  const variant = attrs["variant"];
  return typeof variant === "string" && variant.length > 0 ? variant : null;
}

function normalizeSurfaceRuntimeView(
  binding: SurfaceRuntimeViewBinding,
): RegisteredSurfaceRuntimeView {
  return Object.freeze({
    ...binding,
    nodeType: "surface",
  });
}
