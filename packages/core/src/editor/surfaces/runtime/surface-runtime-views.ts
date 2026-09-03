import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { isRegisteredSlideCompositionSurfaceDefinition } from "../model/slide-composition-definition";
import {
  createSurfaceRuntimeViewMap,
  type SurfaceRuntimeViewBinding,
} from "./surface-runtime-view-registry";
import { PageDefaultSurfaceRuntimeView } from "./variants/page-default";
import { SlideCompositionSurfaceRuntimeView } from "./variants/slide-composition";
import { SlideCoverSurfaceRuntimeView } from "../variants/slide-cover/runtime";
import { SlideImageBandSurfaceRuntimeView } from "../variants/slide-image-band/runtime";
import { SlideImageCoverSurfaceRuntimeView } from "../variants/slide-image-cover/runtime";
import { SlideModuleCoverSurfaceRuntimeView } from "../variants/slide-module-cover/runtime";
import { SlideCategoriseQuestionSurfaceRuntimeView } from "../variants/slide-categorise-question/runtime";
import { SlideDropdownQuestionSurfaceRuntimeView } from "../variants/slide-dropdown-question/runtime";
import { SlideDragDropQuestionSurfaceRuntimeView } from "../variants/slide-drag-drop-question/runtime";
import { SlideFillBlanksQuestionSurfaceRuntimeView } from "../variants/slide-fill-blanks-question/runtime";
import { SlideMatchingQuestionSurfaceRuntimeView } from "../variants/slide-matching-question/runtime";
import { SlideImageHotspotQuestionSurfaceRuntimeView } from "../variants/slide-image-hotspot-question/runtime";
import { SlideMultipleChoiceQuestionSurfaceRuntimeView } from "../variants/slide-multiple-choice-question/runtime";
import { SlideMultiselectQuestionSurfaceRuntimeView } from "../variants/slide-multiselect-question/runtime";
import { SlideQuizSurfaceRuntimeView } from "../variants/slide-quiz/runtime";
import { SlideSequencingQuestionSurfaceRuntimeView } from "../variants/slide-sequencing-question/runtime";

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
  {
    variantId: "slide-categorise-question",
    component: SlideCategoriseQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-sequencing-question",
    component: SlideSequencingQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-matching-question",
    component: SlideMatchingQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-image-hotspot-question",
    component: SlideImageHotspotQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-multiple-choice-question",
    component: SlideMultipleChoiceQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-multiselect-question",
    component: SlideMultiselectQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-dropdown-question",
    component: SlideDropdownQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-drag-drop-question",
    component: SlideDragDropQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-fill-blanks-question",
    component: SlideFillBlanksQuestionSurfaceRuntimeView,
  },
  {
    variantId: "slide-quiz",
    component: SlideQuizSurfaceRuntimeView,
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
