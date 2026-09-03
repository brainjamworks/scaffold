import { pageDefaultSurfaceConfiguration } from "../variants/page-default/binding";
import { slideCategoriseQuestionSurfaceConfiguration } from "../variants/slide-categorise-question/binding";
import { slideCoverSurfaceConfiguration } from "../variants/slide-cover/binding";
import { slideDragDropQuestionSurfaceConfiguration } from "../variants/slide-drag-drop-question/binding";
import { slideDropdownQuestionSurfaceConfiguration } from "../variants/slide-dropdown-question/binding";
import { slideFillBlanksQuestionSurfaceConfiguration } from "../variants/slide-fill-blanks-question/binding";
import { slideImageBandSurfaceConfiguration } from "../variants/slide-image-band/binding";
import { slideImageCoverSurfaceConfiguration } from "../variants/slide-image-cover/binding";
import { slideImageHotspotQuestionSurfaceConfiguration } from "../variants/slide-image-hotspot-question/binding";
import { slideMatchingQuestionSurfaceConfiguration } from "../variants/slide-matching-question/binding";
import { slideModuleCoverSurfaceConfiguration } from "../variants/slide-module-cover/binding";
import { slideMultipleChoiceQuestionSurfaceConfiguration } from "../variants/slide-multiple-choice-question/binding";
import { slideMultiselectQuestionSurfaceConfiguration } from "../variants/slide-multiselect-question/binding";
import { slideQuizSurfaceConfiguration } from "../variants/slide-quiz/binding";
import { slideSequencingQuestionSurfaceConfiguration } from "../variants/slide-sequencing-question/binding";
import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { isRegisteredSlideCompositionSurfaceDefinition } from "../model/slide-composition-definition";
import {
  createSurfaceAuthoringChromeResolver,
  createSurfaceAuthoringViewMap,
  type SurfaceAuthoringViewBinding,
} from "./surface-authoring-view-registry";
import { defineSlideCompositionSettingsConfiguration } from "./shared/surface-settings-configuration";
import { PageDefaultSurfaceAuthoringView } from "../variants/page-default/authoring";
import { SlideCategoriseQuestionSurfaceAuthoringView } from "../variants/slide-categorise-question/authoring";
import { SlideCoverSurfaceAuthoringView } from "../variants/slide-cover/authoring";
import { SlideDragDropQuestionSurfaceAuthoringView } from "../variants/slide-drag-drop-question/authoring";
import { SlideDropdownQuestionSurfaceAuthoringView } from "../variants/slide-dropdown-question/authoring";
import { SlideFillBlanksQuestionSurfaceAuthoringView } from "../variants/slide-fill-blanks-question/authoring";
import { SlideImageBandSurfaceAuthoringView } from "../variants/slide-image-band/authoring";
import { SlideImageCoverSurfaceAuthoringView } from "../variants/slide-image-cover/authoring";
import { SlideImageHotspotQuestionSurfaceAuthoringView } from "../variants/slide-image-hotspot-question/authoring";
import { SlideMatchingQuestionSurfaceAuthoringView } from "../variants/slide-matching-question/authoring";
import { SlideModuleCoverSurfaceAuthoringView } from "../variants/slide-module-cover/authoring";
import { SlideMultipleChoiceQuestionSurfaceAuthoringView } from "../variants/slide-multiple-choice-question/authoring";
import { SlideMultiselectQuestionSurfaceAuthoringView } from "../variants/slide-multiselect-question/authoring";
import { SlideQuizSurfaceAuthoringView } from "../variants/slide-quiz/authoring";
import { SlideSequencingQuestionSurfaceAuthoringView } from "../variants/slide-sequencing-question/authoring";
import { SlideCompositionSurfaceAuthoringView } from "../variants/slide-composition/authoring";

const SPECIALISED_SURFACE_AUTHORING_VIEWS = [
  {
    variantId: "page-default",
    component: PageDefaultSurfaceAuthoringView,
    configuration: pageDefaultSurfaceConfiguration,
  },
  {
    variantId: "slide-categorise-question",
    component: SlideCategoriseQuestionSurfaceAuthoringView,
    configuration: slideCategoriseQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-cover",
    component: SlideCoverSurfaceAuthoringView,
    configuration: slideCoverSurfaceConfiguration,
  },
  {
    variantId: "slide-drag-drop-question",
    component: SlideDragDropQuestionSurfaceAuthoringView,
    configuration: slideDragDropQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-dropdown-question",
    component: SlideDropdownQuestionSurfaceAuthoringView,
    configuration: slideDropdownQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-fill-blanks-question",
    component: SlideFillBlanksQuestionSurfaceAuthoringView,
    configuration: slideFillBlanksQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-image-band",
    component: SlideImageBandSurfaceAuthoringView,
    configuration: slideImageBandSurfaceConfiguration,
  },
  {
    variantId: "slide-image-cover",
    component: SlideImageCoverSurfaceAuthoringView,
    configuration: slideImageCoverSurfaceConfiguration,
  },
  {
    variantId: "slide-image-hotspot-question",
    component: SlideImageHotspotQuestionSurfaceAuthoringView,
    configuration: slideImageHotspotQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-matching-question",
    component: SlideMatchingQuestionSurfaceAuthoringView,
    configuration: slideMatchingQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-module-cover",
    component: SlideModuleCoverSurfaceAuthoringView,
    configuration: slideModuleCoverSurfaceConfiguration,
  },
  {
    variantId: "slide-multiple-choice-question",
    component: SlideMultipleChoiceQuestionSurfaceAuthoringView,
    configuration: slideMultipleChoiceQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-multiselect-question",
    component: SlideMultiselectQuestionSurfaceAuthoringView,
    configuration: slideMultiselectQuestionSurfaceConfiguration,
  },
  {
    variantId: "slide-quiz",
    component: SlideQuizSurfaceAuthoringView,
    configuration: slideQuizSurfaceConfiguration,
  },
  {
    variantId: "slide-sequencing-question",
    component: SlideSequencingQuestionSurfaceAuthoringView,
    configuration: slideSequencingQuestionSurfaceConfiguration,
  },
] as const satisfies readonly SurfaceAuthoringViewBinding[];

const SPECIALISED_SURFACE_AUTHORING_VIEWS_BY_ID: ReadonlyMap<string, SurfaceAuthoringViewBinding> =
  new Map(SPECIALISED_SURFACE_AUTHORING_VIEWS.map((binding) => [binding.variantId, binding]));

export const builtInSurfaceAuthoringViewBindings: readonly SurfaceAuthoringViewBinding[] =
  Object.freeze(
    builtInSurfaceVariantRegistry.definitions.map((definition) => {
      const specialised = SPECIALISED_SURFACE_AUTHORING_VIEWS_BY_ID.get(definition.id);
      if (specialised) return specialised;
      if (!isRegisteredSlideCompositionSurfaceDefinition(definition)) {
        throw new Error(`Surface variant "${definition.id}" has no built-in authoring binding.`);
      }
      return Object.freeze({
        variantId: definition.id,
        component: SlideCompositionSurfaceAuthoringView,
        configuration: defineSlideCompositionSettingsConfiguration(definition),
      });
    }),
  );

export const builtInSurfaceAuthoringViewMap = createSurfaceAuthoringViewMap({
  registry: builtInSurfaceVariantRegistry,
  bindings: builtInSurfaceAuthoringViewBindings,
});

export const builtInSurfaceAuthoringChromeResolver = createSurfaceAuthoringChromeResolver(
  builtInSurfaceAuthoringViewMap,
);
