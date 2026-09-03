/**
 * Where a surface variant lives, by concern:
 *
 * - `model/templates/` holds variant *definitions* (what a variant persists:
 *   settings schema, fixed children, catalogue entry).
 * - `model/assessment/` holds surface-side assessment *node types* (the
 *   ProseMirror node names a variant's fixed children use).
 * - `variants/<id>/` holds the variant *presentation and binding*
 *   (`authoring.tsx`, `runtime.tsx`, `binding.ts`, `styles.css`).
 *
 * This registry joins the three: it lists every built-in definition, while
 * `authoring/surface-authoring-views.ts` and
 * `runtime/surface-runtime-views.ts` list the matching views and bindings.
 */
import { pageDefaultSurfaceDefinition } from "./templates/page-default";
import type { ContentIdentityRewriteRegistration } from "@/document/model/identity/clone-with-new-ids";
import { rewriteDragDropCopiedContent } from "@/editor/blocks/assessment/drag-drop/drag-drop-copy-identity";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "./assessment/surface-drag-drop-question-node";
import { slideCategoriseQuestionSurfaceDefinition } from "./templates/assessment/slide-categorise-question";
import { slideDropdownQuestionSurfaceDefinition } from "./templates/assessment/slide-dropdown-question";
import { slideDragDropQuestionSurfaceDefinition } from "./templates/assessment/slide-drag-drop-question";
import { slideFillBlanksQuestionSurfaceDefinition } from "./templates/assessment/slide-fill-blanks-question";
import { slideMatchingQuestionSurfaceDefinition } from "./templates/assessment/slide-matching-question";
import { slideImageHotspotQuestionSurfaceDefinition } from "./templates/assessment/slide-image-hotspot-question";
import { slideMultipleChoiceQuestionSurfaceDefinition } from "./templates/assessment/slide-multiple-choice-question";
import { slideMultiselectQuestionSurfaceDefinition } from "./templates/assessment/slide-multiselect-question";
import { slideQuizSurfaceDefinition } from "./templates/assessment/slide-quiz";
import { slideSequencingQuestionSurfaceDefinition } from "./templates/assessment/slide-sequencing-question";
import { slideCentredStageSurfaceDefinition } from "./templates/slide-centred-stage";
import { slideContentSurfaceDefinition } from "./templates/slide-content";
import { slideCoverSurfaceDefinition } from "./templates/slide-cover";
import { slideDiptychSurfaceDefinition } from "./templates/slide-diptych";
import { slideEditorialSurfaceDefinition } from "./templates/slide-editorial";
import { slideFullBleedImageSurfaceDefinition } from "./templates/slide-full-bleed-image";
import { slideImageBackdropPanelSurfaceDefinition } from "./templates/slide-image-backdrop-panel";
import { slideImageBandSurfaceDefinition } from "./templates/slide-image-band";
import { slideImageContentSplitSurfaceDefinition } from "./templates/slide-image-content-split";
import { slideImageContentStackedSurfaceDefinition } from "./templates/slide-image-content-stacked";
import { slideImageCoverSurfaceDefinition } from "./templates/slide-image-cover";
import { slideModuleCoverSurfaceDefinition } from "./templates/slide-module-cover";
import { slideSideTitleSurfaceDefinition } from "./templates/slide-side-title";
import { slideThreeColumnsSurfaceDefinition } from "./templates/slide-three-columns";
import { slideTriptychSurfaceDefinition } from "./templates/slide-triptych";
import { slideTwoColumnsSurfaceDefinition } from "./templates/slide-two-columns";
import { slideTwoStackedSurfaceDefinition } from "./templates/slide-two-stacked";
import type { SurfaceVariantDefinition } from "./surface-variant-definition";
import { createSurfaceVariantRegistry } from "./surface-variant-registry";

export interface BuiltInSurfaceCapabilityRegistration {
  readonly definition: SurfaceVariantDefinition;
  readonly identityRewrites?: readonly ContentIdentityRewriteRegistration[];
}

export const builtInSurfaceCapabilityRegistrations: readonly BuiltInSurfaceCapabilityRegistration[] =
  Object.freeze([
    { definition: pageDefaultSurfaceDefinition },
    { definition: slideCoverSurfaceDefinition },
    { definition: slideContentSurfaceDefinition },
    { definition: slideTwoColumnsSurfaceDefinition },
    { definition: slideTwoStackedSurfaceDefinition },
    { definition: slideSideTitleSurfaceDefinition },
    { definition: slideThreeColumnsSurfaceDefinition },
    { definition: slideCentredStageSurfaceDefinition },
    { definition: slideEditorialSurfaceDefinition },
    { definition: slideImageContentSplitSurfaceDefinition },
    { definition: slideImageContentStackedSurfaceDefinition },
    { definition: slideFullBleedImageSurfaceDefinition },
    { definition: slideImageBackdropPanelSurfaceDefinition },
    { definition: slideDiptychSurfaceDefinition },
    { definition: slideTriptychSurfaceDefinition },
    { definition: slideImageCoverSurfaceDefinition },
    { definition: slideImageBandSurfaceDefinition },
    { definition: slideModuleCoverSurfaceDefinition },
    { definition: slideCategoriseQuestionSurfaceDefinition },
    { definition: slideSequencingQuestionSurfaceDefinition },
    { definition: slideMatchingQuestionSurfaceDefinition },
    { definition: slideImageHotspotQuestionSurfaceDefinition },
    { definition: slideMultipleChoiceQuestionSurfaceDefinition },
    { definition: slideMultiselectQuestionSurfaceDefinition },
    { definition: slideDropdownQuestionSurfaceDefinition },
    {
      definition: slideDragDropQuestionSurfaceDefinition,
      identityRewrites: Object.freeze([
        Object.freeze({
          nodeType: SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
          rewrite: rewriteDragDropCopiedContent,
        }),
      ]),
    },
    { definition: slideFillBlanksQuestionSurfaceDefinition },
    { definition: slideQuizSurfaceDefinition },
  ]);

export const builtInSurfaceVariantDefinitions: readonly SurfaceVariantDefinition[] = Object.freeze(
  builtInSurfaceCapabilityRegistrations.map(({ definition }) => definition),
);

export const builtInSurfaceIdentityRewriteRegistrations: readonly ContentIdentityRewriteRegistration[] =
  Object.freeze(
    builtInSurfaceCapabilityRegistrations.flatMap(({ identityRewrites }) => identityRewrites ?? []),
  );

export const builtInSurfaceVariantRegistry = createSurfaceVariantRegistry(
  builtInSurfaceVariantDefinitions,
);
