import { categoriseBlockDefinition } from "./assessment/categorise/categorise-definition";
import { dropdownBlockDefinition } from "./assessment/dropdown/dropdown-definition";
import { fillBlanksBlockDefinition } from "./assessment/fill-blanks/fill-blanks-definition";
import { imageHotspotBlockDefinition } from "./assessment/image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition } from "./assessment/matching/matching-definition";
import { mcqBlockDefinition } from "./assessment/mcq/mcq-definition";
import { multiselectBlockDefinition } from "./assessment/multiselect/multiselect-definition";
import { quizBlockDefinition } from "./assessment/quiz/quiz-definition";
import { sequencingBlockDefinition } from "./assessment/sequencing/sequencing-definition";
import { codeBlockDefinition } from "./code/code-block/code-block-definition";
import { annotatedFigureDefinition } from "./figure-composition/annotated-figure/annotated-figure-definition";
import { galleryDefinition } from "./figure-composition/gallery/gallery-definition";
import { textWrapImageDefinition } from "./figure-composition/text-wrap-image/text-wrap-image-definition";
import { audioBlockDefinition } from "./media/audio-block-definition";
import { chartBlockDefinition } from "./media/chart/chart-definition";
import { imageBlockDefinition } from "./media/image-block-definition";
import { calloutBlockDefinition } from "./presentation/callout/callout-definition";
import { chapterEpigraphBlockDefinition } from "./presentation/chapter-epigraph/chapter-epigraph-definition";
import { comparisonBlockDefinition } from "./presentation/comparison/comparison-definition";
import { flashcardBlockDefinition } from "./presentation/flashcard/flashcard-definition";
import { marginaliaBlockDefinition } from "./presentation/marginalia/marginalia-definition";
import { pullQuoteBlockDefinition } from "./presentation/pull-quote/pull-quote-definition";
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

export const builtInBlockDefinitions: readonly BlockDefinition[] = Object.freeze([
  codeBlockDefinition,
  calloutBlockDefinition,
  comparisonBlockDefinition,
  flashcardBlockDefinition,
  categoriseBlockDefinition,
  dropdownBlockDefinition,
  fillBlanksBlockDefinition,
  imageHotspotBlockDefinition,
  matchingBlockDefinition,
  mcqBlockDefinition,
  multiselectBlockDefinition,
  quizBlockDefinition,
  sequencingBlockDefinition,
  annotatedFigureDefinition,
  galleryDefinition,
  textWrapImageDefinition,
  audioBlockDefinition,
  chartBlockDefinition,
  imageBlockDefinition,
  embedBlockDefinition,
  pdfEmbedBlockDefinition,
  resourceLinkBlockDefinition,
  checklistBlockDefinition,
  glossaryBlockDefinition,
  keyValueListBlockDefinition,
  numberedListBlockDefinition,
  tableBlockDefinition,
  chapterEpigraphBlockDefinition,
  marginaliaBlockDefinition,
  pullQuoteBlockDefinition,
  roadmapBlockDefinition,
  sidebarBlockDefinition,
  statHighlightBlockDefinition,
  timelineBlockDefinition,
]);

export const builtInBlockRegistry = createBlockRegistry(builtInBlockDefinitions);
