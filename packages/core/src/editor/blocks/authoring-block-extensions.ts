import type { AnyExtension } from "@tiptap/core";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import { CategoriseAuthoringExtension } from "./assessment/categorise/categorise-authoring-extension";
import { DropdownAuthoringExtension } from "./assessment/dropdown/dropdown-authoring-extension";
import { FillBlanksAuthoringExtension } from "./assessment/fill-blanks/fill-blanks-authoring-extension";
import { createImageHotspotAuthoringExtension } from "./assessment/image-hotspot/image-hotspot-authoring-extension";
import { MatchingAuthoringExtension } from "./assessment/matching/matching-authoring-extension";
import { McqAuthoringExtension } from "./assessment/mcq/mcq-authoring-extension";
import { MultiselectAuthoringExtension } from "./assessment/multiselect/multiselect-authoring-extension";
import { QuizAuthoringExtension } from "./assessment/quiz/quiz-authoring-extension";
import { SequencingAuthoringExtension } from "./assessment/sequencing/sequencing-authoring-extension";
import { CodeBlockAuthoringExtension } from "./code/code-block/code-block-authoring-extension";
import { AnnotatedFigureAuthoringExtension } from "./figure-composition/annotated-figure/annotated-figure-authoring-extension";
import { GalleryAuthoringExtension } from "./figure-composition/gallery/gallery-authoring-extension";
import { TextWrapImageAuthoringExtension } from "./figure-composition/text-wrap-image/text-wrap-image-authoring-extension";
import { AudioBlockAuthoringExtension } from "./media/audio-block-authoring-extension";
import { ChartAuthoringExtension } from "./media/chart/chart-authoring-extension";
import { ImageBlockAuthoringExtension } from "./media/image-block-authoring-extension";
import { CalloutAuthoringExtension } from "./presentation/callout/callout-authoring-extension";
import { ChapterEpigraphAuthoringExtension } from "./presentation/chapter-epigraph/chapter-epigraph-authoring-extension";
import { ComparisonAuthoringExtension } from "./presentation/comparison/comparison-authoring-extension";
import { FlashcardAuthoringExtension } from "./presentation/flashcard/flashcard-authoring-extension";
import { MarginaliaAuthoringExtension } from "./presentation/marginalia/marginalia-authoring-extension";
import { PullQuoteAuthoringExtension } from "./presentation/pull-quote/pull-quote-authoring-extension";
import { RoadmapAuthoringExtension } from "./presentation/roadmap/roadmap-authoring-extension";
import { SidebarAuthoringExtension } from "./presentation/sidebar/sidebar-authoring-extension";
import { StatHighlightAuthoringExtension } from "./presentation/stat-highlight/stat-highlight-authoring-extension";
import { TimelineAuthoringExtension } from "./presentation/timeline/timeline-authoring-extension";
import { EmbedAuthoringExtension } from "./resources/embed/embed-authoring-extension";
import { PdfEmbedAuthoringExtension } from "./resources/pdf-embed/pdf-embed-authoring-extension";
import { ResourceLinkAuthoringExtension } from "./resources/resource-link/resource-link-authoring-extension";
import { ChecklistAuthoringExtension } from "./structured-content/checklist/checklist-authoring-extension";
import { GlossaryAuthoringExtension } from "./structured-content/glossary/glossary-authoring-extension";
import { KeyValueListAuthoringExtension } from "./structured-content/key-value-list/key-value-list-authoring-extension";
import { NumberedListAuthoringExtension } from "./structured-content/numbered-list/numbered-list-authoring-extension";
import { TableAuthoringExtension } from "./structured-content/table/table-authoring-extension";

export function createAuthoringBlockExtensions(
  blockDefinitions: BlockDefinitionLookup,
): readonly AnyExtension[] {
  return [
    CodeBlockAuthoringExtension,
    CalloutAuthoringExtension,
    ComparisonAuthoringExtension,
    FlashcardAuthoringExtension,
    CategoriseAuthoringExtension,
    DropdownAuthoringExtension,
    FillBlanksAuthoringExtension,
    createImageHotspotAuthoringExtension(blockDefinitions),
    MatchingAuthoringExtension,
    McqAuthoringExtension,
    MultiselectAuthoringExtension,
    QuizAuthoringExtension,
    SequencingAuthoringExtension,
    AnnotatedFigureAuthoringExtension,
    GalleryAuthoringExtension,
    TextWrapImageAuthoringExtension,
    AudioBlockAuthoringExtension,
    ChartAuthoringExtension,
    ImageBlockAuthoringExtension,
    EmbedAuthoringExtension,
    PdfEmbedAuthoringExtension,
    ResourceLinkAuthoringExtension,
    ChecklistAuthoringExtension,
    GlossaryAuthoringExtension,
    KeyValueListAuthoringExtension,
    NumberedListAuthoringExtension,
    TableAuthoringExtension,
    ChapterEpigraphAuthoringExtension,
    MarginaliaAuthoringExtension,
    PullQuoteAuthoringExtension,
    RoadmapAuthoringExtension,
    SidebarAuthoringExtension,
    StatHighlightAuthoringExtension,
    TimelineAuthoringExtension,
  ];
}
