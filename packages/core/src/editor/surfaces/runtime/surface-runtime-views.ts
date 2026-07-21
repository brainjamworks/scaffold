import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { isRegisteredSlideCompositionSurfaceDefinition } from "../model/slide-composition-definition";
import {
  createSurfaceRuntimeViewMap,
  type SurfaceRuntimeViewBinding,
} from "./surface-runtime-view-registry";
import { PageDefaultSurfaceRuntimeView } from "./variants/page-default";
import { SlideCompositionSurfaceRuntimeView } from "./variants/slide-composition";
import { SlideCoverSurfaceRuntimeView } from "./variants/slide-cover";
import { SlideImageBandSurfaceRuntimeView } from "./variants/slide-image-band";
import { SlideImageCoverSurfaceRuntimeView } from "./variants/slide-image-cover";
import { SlideModuleCoverSurfaceRuntimeView } from "./variants/slide-module-cover";

const SPECIALISED_SURFACE_RUNTIME_VIEWS = [
  {
    variantId: "page-default",
    component: PageDefaultSurfaceRuntimeView,
  },
  {
    variantId: "slide-cover",
    component: SlideCoverSurfaceRuntimeView,
  },
  {
    variantId: "slide-image-cover",
    component: SlideImageCoverSurfaceRuntimeView,
  },
  {
    variantId: "slide-image-band",
    component: SlideImageBandSurfaceRuntimeView,
  },
  {
    variantId: "slide-module-cover",
    component: SlideModuleCoverSurfaceRuntimeView,
  },
] as const satisfies readonly SurfaceRuntimeViewBinding[];

const SPECIALISED_SURFACE_RUNTIME_VIEWS_BY_ID: ReadonlyMap<string, SurfaceRuntimeViewBinding> =
  new Map(SPECIALISED_SURFACE_RUNTIME_VIEWS.map((binding) => [binding.variantId, binding]));

export const builtInSurfaceRuntimeViewBindings: readonly SurfaceRuntimeViewBinding[] =
  Object.freeze(
    builtInSurfaceVariantRegistry.definitions.map((definition) => {
      const specialised = SPECIALISED_SURFACE_RUNTIME_VIEWS_BY_ID.get(definition.id);
      if (specialised) return specialised;
      if (!isRegisteredSlideCompositionSurfaceDefinition(definition)) {
        throw new Error(`Surface variant "${definition.id}" has no built-in runtime binding.`);
      }
      return Object.freeze({
        variantId: definition.id,
        component: SlideCompositionSurfaceRuntimeView,
      });
    }),
  );

export const builtInSurfaceRuntimeViewMap = createSurfaceRuntimeViewMap({
  registry: builtInSurfaceVariantRegistry,
  bindings: builtInSurfaceRuntimeViewBindings,
});
