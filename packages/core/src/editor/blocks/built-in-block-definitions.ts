import { categoriseBlockDefinition } from "./assessment/categorise/categorise-definition";
import type {
  ContentIdentityRewrite,
  ContentIdentityRewriteRegistration,
} from "@/document/model/identity/clone-with-new-ids";
import { dropdownBlockDefinition } from "./assessment/dropdown/dropdown-definition";
import { dragDropBlockDefinition } from "./assessment/drag-drop/drag-drop-definition";
import { rewriteDragDropCopiedContent } from "./assessment/drag-drop/drag-drop-copy-identity";
import { fillBlanksBlockDefinition } from "./assessment/fill-blanks/fill-blanks-definition";
import { imageHotspotBlockDefinition } from "./assessment/image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition } from "./assessment/matching/matching-definition";
import { mcqBlockDefinition } from "./assessment/mcq/mcq-definition";
import { multiselectBlockDefinition } from "./assessment/multiselect/multiselect-definition";
import { quizBlockDefinition } from "./assessment/quiz/quiz-definition";
import { sequencingBlockDefinition } from "./assessment/sequencing/sequencing-definition";
import {
  rewriteCategoriseCopiedContent,
  rewriteDropdownCopiedContent,
  rewriteFillBlanksCopiedContent,
  rewriteImageHotspotCopiedContent,
  rewriteMatchingCopiedContent,
  rewriteMcqCopiedContent,
  rewriteMultiselectCopiedContent,
  rewriteSequencingCopiedContent,
} from "./assessment/shared/identity/copy-identity";
import { codeBlockDefinition } from "./code/code-block/code-block-definition";
import { annotatedFigureDefinition } from "./figure-composition/annotated-figure/annotated-figure-definition";
import { galleryDefinition } from "./figure-composition/gallery/gallery-definition";
import { textWrapImageDefinition } from "./figure-composition/text-wrap-image/text-wrap-image-definition";
import { audioBlockDefinition } from "./media/audio-block-definition";
import { chartBlockDefinition } from "./media/chart/chart-definition";
import { rewriteChartCopiedContent } from "./media/chart/chart-copy-identity";
import { imageBlockDefinition } from "./media/image-block-definition";
import { calloutBlockDefinition } from "./presentation/callout/callout-definition";
import { chapterEpigraphBlockDefinition } from "./presentation/chapter-epigraph/chapter-epigraph-definition";
import { comparisonBlockDefinition } from "./structured-content/comparison/comparison-definition";
import { flashcardBlockDefinition } from "./presentation/flashcard/flashcard-definition";
import { marginaliaBlockDefinition } from "./presentation/marginalia/marginalia-definition";
import { pullQuoteBlockDefinition } from "./presentation/pull-quote/pull-quote-definition";
import { processFlowBlockDefinition } from "./presentation/process-flow/process-flow-definition";
import { roadmapBlockDefinition } from "./presentation/roadmap/roadmap-definition";
import { sidebarBlockDefinition } from "./presentation/sidebar/sidebar-definition";
import { statHighlightBlockDefinition } from "./presentation/stat-highlight/stat-highlight-definition";
import { timelineBlockDefinition } from "./presentation/timeline/timeline-definition";
import { embedBlockDefinition } from "./resources/embed/embed-definition";
import { pdfEmbedBlockDefinition } from "./resources/pdf-embed/pdf-embed-definition";
import { resourceLinkBlockDefinition } from "./resources/resource-link/resource-link-definition";
import { tableBlockDefinition } from "./structured-content/table/table-definition";
import { checklistBlockDefinition } from "./structured-content/checklist/checklist-definition";
import { glossaryBlockDefinition } from "./structured-content/glossary/glossary-definition";
import { keyValueListBlockDefinition } from "./structured-content/key-value-list/key-value-list-definition";
import { numberedListBlockDefinition } from "./structured-content/numbered-list/numbered-list-definition";
import type { BlockDefinition } from "./block-definition";
import { createBlockRegistry } from "./block-registry";

interface BuiltInBlockCapabilityRegistration {
  readonly definition: BlockDefinition;
  readonly identityRewrites?: readonly ContentIdentityRewriteRegistration[];
}

function withIdentityRewrite(
  definition: BlockDefinition,
  rewrite: ContentIdentityRewrite,
): BuiltInBlockCapabilityRegistration {
  return {
    definition,
    identityRewrites: Object.freeze([Object.freeze({ nodeType: definition.nodeType, rewrite })]),
  };
}

export const builtInBlockCapabilityRegistrations: readonly BuiltInBlockCapabilityRegistration[] =
  Object.freeze(
    [
      { definition: codeBlockDefinition },
      { definition: calloutBlockDefinition },
      { definition: comparisonBlockDefinition },
      { definition: flashcardBlockDefinition },
      withIdentityRewrite(categoriseBlockDefinition, rewriteCategoriseCopiedContent),
      withIdentityRewrite(dropdownBlockDefinition, rewriteDropdownCopiedContent),
      withIdentityRewrite(dragDropBlockDefinition, rewriteDragDropCopiedContent),
      withIdentityRewrite(fillBlanksBlockDefinition, rewriteFillBlanksCopiedContent),
      withIdentityRewrite(imageHotspotBlockDefinition, rewriteImageHotspotCopiedContent),
      withIdentityRewrite(matchingBlockDefinition, rewriteMatchingCopiedContent),
      withIdentityRewrite(mcqBlockDefinition, rewriteMcqCopiedContent),
      withIdentityRewrite(multiselectBlockDefinition, rewriteMultiselectCopiedContent),
      { definition: quizBlockDefinition },
      withIdentityRewrite(sequencingBlockDefinition, rewriteSequencingCopiedContent),
      { definition: annotatedFigureDefinition },
      { definition: galleryDefinition },
      { definition: textWrapImageDefinition },
      { definition: audioBlockDefinition },
      withIdentityRewrite(chartBlockDefinition, rewriteChartCopiedContent),
      { definition: imageBlockDefinition },
      { definition: embedBlockDefinition },
      { definition: pdfEmbedBlockDefinition },
      { definition: resourceLinkBlockDefinition },
      { definition: checklistBlockDefinition },
      { definition: glossaryBlockDefinition },
      { definition: keyValueListBlockDefinition },
      { definition: numberedListBlockDefinition },
      { definition: tableBlockDefinition },
      { definition: chapterEpigraphBlockDefinition },
      { definition: marginaliaBlockDefinition },
      { definition: pullQuoteBlockDefinition },
      { definition: processFlowBlockDefinition },
      { definition: roadmapBlockDefinition },
      { definition: sidebarBlockDefinition },
      { definition: statHighlightBlockDefinition },
      { definition: timelineBlockDefinition },
    ].map((registration) => Object.freeze(registration)),
  );

export const builtInBlockDefinitions: readonly BlockDefinition[] = Object.freeze(
  builtInBlockCapabilityRegistrations.map(({ definition }) => definition),
);

export const builtInBlockRegistry = createBlockRegistry(builtInBlockDefinitions);
