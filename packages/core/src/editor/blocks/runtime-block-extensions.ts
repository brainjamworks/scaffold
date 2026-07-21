import type { AnyExtension } from "@tiptap/core";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import { CategoriseRuntimeExtension } from "./assessment/categorise/categorise-runtime-extension";
import { DropdownRuntimeExtension } from "./assessment/dropdown/dropdown-runtime-extension";
import { FillBlanksRuntimeExtension } from "./assessment/fill-blanks/fill-blanks-runtime-extension";
import { createImageHotspotRuntimeExtension } from "./assessment/image-hotspot/image-hotspot-runtime-extension";
import { MatchingRuntimeExtension } from "./assessment/matching/matching-runtime-extension";
import { McqRuntimeExtension } from "./assessment/mcq/mcq-runtime-extension";
import { MultiselectRuntimeExtension } from "./assessment/multiselect/multiselect-runtime-extension";
import { QuizRuntimeExtension } from "./assessment/quiz/quiz-runtime-extension";
import { SequencingRuntimeExtension } from "./assessment/sequencing/sequencing-runtime-extension";
import { CodeBlockRuntimeExtension } from "./code/code-block/code-block-runtime-extension";
import { AnnotatedFigureRuntimeExtension } from "./figure-composition/annotated-figure/annotated-figure-runtime-extension";
import { GalleryRuntimeExtension } from "./figure-composition/gallery/gallery-runtime-extension";
import { TextWrapImageRuntimeExtension } from "./figure-composition/text-wrap-image/text-wrap-image-runtime-extension";
import { AudioBlockRuntimeExtension } from "./media/audio-block-runtime-extension";
import { ChartRuntimeExtension } from "./media/chart/chart-runtime-extension";
import { ImageBlockRuntimeExtension } from "./media/image-block-runtime-extension";
import { CalloutRuntimeExtension } from "./presentation/callout/callout-runtime-extension";
import { ChapterEpigraphRuntimeExtension } from "./presentation/chapter-epigraph/chapter-epigraph-runtime-extension";
import { ComparisonRuntimeExtension } from "./presentation/comparison/comparison-runtime-extension";
import { FlashcardRuntimeExtension } from "./presentation/flashcard/flashcard-runtime-extension";
import { MarginaliaRuntimeExtension } from "./presentation/marginalia/marginalia-runtime-extension";
import { PullQuoteRuntimeExtension } from "./presentation/pull-quote/pull-quote-runtime-extension";
import { RoadmapRuntimeExtension } from "./presentation/roadmap/roadmap-runtime-extension";
import { SidebarRuntimeExtension } from "./presentation/sidebar/sidebar-runtime-extension";
import { StatHighlightRuntimeExtension } from "./presentation/stat-highlight/stat-highlight-runtime-extension";
import { TimelineRuntimeExtension } from "./presentation/timeline/timeline-runtime-extension";
import { EmbedRuntimeExtension } from "./resources/embed/embed-runtime-extension";
import { PdfEmbedRuntimeExtension } from "./resources/pdf-embed/pdf-embed-runtime-extension";
import { ResourceLinkRuntimeExtension } from "./resources/resource-link/resource-link-runtime-extension";
import { ChecklistRuntimeExtension } from "./structured-content/checklist/checklist-runtime-extension";
import { GlossaryRuntimeExtension } from "./structured-content/glossary/glossary-runtime-extension";
import { KeyValueListRuntimeExtension } from "./structured-content/key-value-list/key-value-list-runtime-extension";
import { NumberedListRuntimeExtension } from "./structured-content/numbered-list/numbered-list-runtime-extension";
import { TableRuntimeExtension } from "./structured-content/table/table-runtime-extension";

export function createRuntimeBlockExtensions(
  blockDefinitions: BlockDefinitionLookup,
): readonly AnyExtension[] {
  return [
    CodeBlockRuntimeExtension,
    CalloutRuntimeExtension,
    ComparisonRuntimeExtension,
    FlashcardRuntimeExtension,
    CategoriseRuntimeExtension,
    DropdownRuntimeExtension,
    FillBlanksRuntimeExtension,
    createImageHotspotRuntimeExtension(blockDefinitions),
    MatchingRuntimeExtension,
    McqRuntimeExtension,
    MultiselectRuntimeExtension,
    QuizRuntimeExtension,
    SequencingRuntimeExtension,
    AnnotatedFigureRuntimeExtension,
    GalleryRuntimeExtension,
    TextWrapImageRuntimeExtension,
    AudioBlockRuntimeExtension,
    ChartRuntimeExtension,
    ImageBlockRuntimeExtension,
    EmbedRuntimeExtension,
    PdfEmbedRuntimeExtension,
    ResourceLinkRuntimeExtension,
    ChecklistRuntimeExtension,
    GlossaryRuntimeExtension,
    KeyValueListRuntimeExtension,
    NumberedListRuntimeExtension,
    TableRuntimeExtension,
    ChapterEpigraphRuntimeExtension,
    MarginaliaRuntimeExtension,
    PullQuoteRuntimeExtension,
    RoadmapRuntimeExtension,
    SidebarRuntimeExtension,
    StatHighlightRuntimeExtension,
    TimelineRuntimeExtension,
  ];
}
