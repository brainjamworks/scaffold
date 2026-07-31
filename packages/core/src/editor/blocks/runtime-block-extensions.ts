import type { AnyExtension } from "@tiptap/core";

import { CategoriseRuntimeExtension } from "./assessment/categorise/categorise-runtime-extension";
import { DropdownRuntimeExtension } from "./assessment/dropdown/dropdown-runtime-extension";
import { FillBlanksRuntimeExtension } from "./assessment/fill-blanks/fill-blanks-runtime-extension";
import { ImageHotspotRuntimeExtension } from "./assessment/image-hotspot/image-hotspot-runtime-extension";
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

export interface BlockRuntimeBinding {
  readonly nodeType: string;
  readonly extension: AnyExtension;
}

export const builtInBlockRuntimeBindings: readonly BlockRuntimeBinding[] = Object.freeze(
  [
    { nodeType: "code_block", extension: CodeBlockRuntimeExtension },
    { nodeType: "callout", extension: CalloutRuntimeExtension },
    { nodeType: "comparison", extension: ComparisonRuntimeExtension },
    { nodeType: "flashcard", extension: FlashcardRuntimeExtension },
    { nodeType: "categorise", extension: CategoriseRuntimeExtension },
    { nodeType: "dropdown", extension: DropdownRuntimeExtension },
    { nodeType: "fill_blanks", extension: FillBlanksRuntimeExtension },
    { nodeType: "image_hotspot", extension: ImageHotspotRuntimeExtension },
    { nodeType: "matching", extension: MatchingRuntimeExtension },
    { nodeType: "mcq", extension: McqRuntimeExtension },
    { nodeType: "multiselect", extension: MultiselectRuntimeExtension },
    { nodeType: "quiz", extension: QuizRuntimeExtension },
    { nodeType: "sequencing", extension: SequencingRuntimeExtension },
    { nodeType: "annotated_figure", extension: AnnotatedFigureRuntimeExtension },
    { nodeType: "gallery", extension: GalleryRuntimeExtension },
    { nodeType: "text_wrap_image", extension: TextWrapImageRuntimeExtension },
    { nodeType: "audio_block", extension: AudioBlockRuntimeExtension },
    { nodeType: "chart_block", extension: ChartRuntimeExtension },
    { nodeType: "image_block", extension: ImageBlockRuntimeExtension },
    { nodeType: "embed", extension: EmbedRuntimeExtension },
    { nodeType: "pdf_embed", extension: PdfEmbedRuntimeExtension },
    { nodeType: "resource_link", extension: ResourceLinkRuntimeExtension },
    { nodeType: "checklist", extension: ChecklistRuntimeExtension },
    { nodeType: "glossary", extension: GlossaryRuntimeExtension },
    { nodeType: "key_value_list", extension: KeyValueListRuntimeExtension },
    { nodeType: "numbered_list", extension: NumberedListRuntimeExtension },
    { nodeType: "table", extension: TableRuntimeExtension },
    { nodeType: "chapter_epigraph", extension: ChapterEpigraphRuntimeExtension },
    { nodeType: "marginalia", extension: MarginaliaRuntimeExtension },
    { nodeType: "pull_quote", extension: PullQuoteRuntimeExtension },
    { nodeType: "roadmap", extension: RoadmapRuntimeExtension },
    { nodeType: "sidebar", extension: SidebarRuntimeExtension },
    { nodeType: "stat_highlight", extension: StatHighlightRuntimeExtension },
    { nodeType: "timeline", extension: TimelineRuntimeExtension },
  ].map((binding) => Object.freeze(binding)),
);

export const builtInBlockRuntimeExtensions: readonly AnyExtension[] = Object.freeze(
  builtInBlockRuntimeBindings.map(({ extension }) => extension),
);
