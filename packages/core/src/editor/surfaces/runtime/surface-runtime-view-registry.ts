import type { ComponentType } from "react";

import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";
import type {
  RegisteredSurfaceRuntimeView,
  SurfaceRuntimeViewBinding,
  SurfaceRuntimeViewProps,
} from "../shared/surface-view-props";

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
