import type { AnyExtension } from "@tiptap/core";

import { CategoriseAuthoringExtension } from "./assessment/categorise/categorise-authoring-extension";
import { DropdownAuthoringExtension } from "./assessment/dropdown/dropdown-authoring-extension";
import { FillBlanksAuthoringExtension } from "./assessment/fill-blanks/fill-blanks-authoring-extension";
import { ImageHotspotAuthoringExtension } from "./assessment/image-hotspot/image-hotspot-authoring-extension";
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

export interface BlockAuthoringBinding {
  readonly nodeType: string;
  readonly extension: AnyExtension;
}

export const builtInBlockAuthoringBindings: readonly BlockAuthoringBinding[] = Object.freeze(
  [
    { nodeType: "code_block", extension: CodeBlockAuthoringExtension },
    { nodeType: "callout", extension: CalloutAuthoringExtension },
    { nodeType: "comparison", extension: ComparisonAuthoringExtension },
    { nodeType: "flashcard", extension: FlashcardAuthoringExtension },
    { nodeType: "categorise", extension: CategoriseAuthoringExtension },
    { nodeType: "dropdown", extension: DropdownAuthoringExtension },
    { nodeType: "fill_blanks", extension: FillBlanksAuthoringExtension },
    { nodeType: "image_hotspot", extension: ImageHotspotAuthoringExtension },
    { nodeType: "matching", extension: MatchingAuthoringExtension },
    { nodeType: "mcq", extension: McqAuthoringExtension },
    { nodeType: "multiselect", extension: MultiselectAuthoringExtension },
    { nodeType: "quiz", extension: QuizAuthoringExtension },
    { nodeType: "sequencing", extension: SequencingAuthoringExtension },
    { nodeType: "annotated_figure", extension: AnnotatedFigureAuthoringExtension },
    { nodeType: "gallery", extension: GalleryAuthoringExtension },
    { nodeType: "text_wrap_image", extension: TextWrapImageAuthoringExtension },
    { nodeType: "audio_block", extension: AudioBlockAuthoringExtension },
    { nodeType: "chart_block", extension: ChartAuthoringExtension },
    { nodeType: "image_block", extension: ImageBlockAuthoringExtension },
    { nodeType: "embed", extension: EmbedAuthoringExtension },
    { nodeType: "pdf_embed", extension: PdfEmbedAuthoringExtension },
    { nodeType: "resource_link", extension: ResourceLinkAuthoringExtension },
    { nodeType: "checklist", extension: ChecklistAuthoringExtension },
    { nodeType: "glossary", extension: GlossaryAuthoringExtension },
    { nodeType: "key_value_list", extension: KeyValueListAuthoringExtension },
    { nodeType: "numbered_list", extension: NumberedListAuthoringExtension },
    { nodeType: "table", extension: TableAuthoringExtension },
    { nodeType: "chapter_epigraph", extension: ChapterEpigraphAuthoringExtension },
    { nodeType: "marginalia", extension: MarginaliaAuthoringExtension },
    { nodeType: "pull_quote", extension: PullQuoteAuthoringExtension },
    { nodeType: "roadmap", extension: RoadmapAuthoringExtension },
    { nodeType: "sidebar", extension: SidebarAuthoringExtension },
    { nodeType: "stat_highlight", extension: StatHighlightAuthoringExtension },
    { nodeType: "timeline", extension: TimelineAuthoringExtension },
  ].map((binding) => Object.freeze(binding)),
);

export const builtInBlockAuthoringExtensions: readonly AnyExtension[] = Object.freeze(
  builtInBlockAuthoringBindings.map(({ extension }) => extension),
);
