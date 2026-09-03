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
import { SlideCategoriseQuestionSurfaceRuntimeView } from "../variants/slide-categorise-question/runtime";
import { SlideDropdownQuestionSurfaceRuntimeView } from "../variants/slide-dropdown-question/runtime";
import { SlideDragDropQuestionSurfaceRuntimeView } from "./variants/assessment/slide-drag-drop-question";
import { SlideFillBlanksQuestionSurfaceRuntimeView } from "./variants/assessment/slide-fill-blanks-question";
import { SlideMatchingQuestionSurfaceRuntimeView } from "../variants/slide-matching-question/runtime";
import { SlideImageHotspotQuestionSurfaceRuntimeView } from "../variants/slide-image-hotspot-question/runtime";
import { SlideMultipleChoiceQuestionSurfaceRuntimeView } from "./variants/assessment/slide-multiple-choice-question";
import { SlideMultiselectQuestionSurfaceRuntimeView } from "./variants/assessment/slide-multiselect-question";
import { SlideQuizSurfaceRuntimeView } from "./variants/assessment/slide-quiz";
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
