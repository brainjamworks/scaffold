import { describe, expect, it } from "vite-plus/test";

import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

type BlockPublicationClassification =
  | { readonly kind: "root-only" }
  | { readonly kind: "assessment-root-only" }
  | {
      readonly kind: "published-members";
      readonly childNodeTypes: readonly string[];
    };

interface LayoutPublicationClassification {
  readonly kind: "layout-sections";
  readonly hiddenSectionActivation: true;
}

interface SurfacePublicationClassification {
  readonly kind: "surface-owned-content";
  readonly ownedContent: "direct-rich-text" | "title" | "title-and-subtitle";
  readonly privateImplementation: "all-image-and-background-slots";
}

const BLOCK_PUBLICATION = {
  code_block: { kind: "root-only" },
  callout: { kind: "root-only" },
  comparison: { kind: "published-members", childNodeTypes: ["comparison_row"] },
  flashcard: { kind: "published-members", childNodeTypes: ["flashcard_card"] },
  categorise: { kind: "assessment-root-only" },
  dropdown: { kind: "assessment-root-only" },
  fill_blanks: { kind: "assessment-root-only" },
  image_hotspot: { kind: "assessment-root-only" },
  matching: { kind: "assessment-root-only" },
  mcq: { kind: "assessment-root-only" },
  multiselect: { kind: "assessment-root-only" },
  quiz: { kind: "assessment-root-only" },
  sequencing: { kind: "assessment-root-only" },
  annotated_figure: {
    kind: "published-members",
    childNodeTypes: ["annotated_figure_annotation"],
  },
  gallery: { kind: "published-members", childNodeTypes: ["gallery_item"] },
  text_wrap_image: { kind: "root-only" },
  audio_block: { kind: "root-only" },
  chart_block: { kind: "root-only" },
  image_block: { kind: "root-only" },
  embed: { kind: "root-only" },
  pdf_embed: { kind: "root-only" },
  resource_link: { kind: "root-only" },
  checklist: { kind: "published-members", childNodeTypes: ["checklist_item"] },
  glossary: { kind: "published-members", childNodeTypes: ["glossary_entry"] },
  key_value_list: { kind: "published-members", childNodeTypes: ["key_value_row"] },
  numbered_list: { kind: "published-members", childNodeTypes: ["numbered_list_item"] },
  table: { kind: "published-members", childNodeTypes: ["tableRow"] },
  chapter_epigraph: { kind: "root-only" },
  marginalia: { kind: "root-only" },
  pull_quote: { kind: "root-only" },
  process_flow: { kind: "published-members", childNodeTypes: ["process_flow_step"] },
  roadmap: { kind: "published-members", childNodeTypes: ["roadmap_milestone"] },
  sidebar: { kind: "root-only" },
  stat_highlight: { kind: "root-only" },
  timeline: { kind: "published-members", childNodeTypes: ["timeline_item"] },
} as const satisfies Readonly<Record<string, BlockPublicationClassification>>;

const LAYOUT_PUBLICATION = {
  accordion: { kind: "layout-sections", hiddenSectionActivation: true },
  paginated: { kind: "layout-sections", hiddenSectionActivation: true },
  tabs: { kind: "layout-sections", hiddenSectionActivation: true },
} as const satisfies Readonly<Record<string, LayoutPublicationClassification>>;

const SURFACE_PUBLICATION = {
  "page-default": surface("direct-rich-text"),
  "slide-cover": surface("title-and-subtitle"),
  "slide-content": surface("title"),
  "slide-two-columns": surface("title"),
  "slide-two-stacked": surface("title"),
  "slide-side-title": surface("title"),
  "slide-three-columns": surface("title"),
  "slide-centred-stage": surface("title"),
  "slide-editorial": surface("title"),
  "slide-image-content-split": surface("title"),
  "slide-image-content-stacked": surface("title"),
  "slide-full-bleed-image": surface("title"),
  "slide-image-backdrop-panel": surface("title"),
  "slide-diptych": surface("title"),
  "slide-triptych": surface("title"),
  "slide-image-cover": surface("title-and-subtitle"),
  "slide-image-band": surface("title-and-subtitle"),
  "slide-module-cover": surface("title-and-subtitle"),
} as const satisfies Readonly<Record<string, SurfacePublicationClassification>>;

describe("built-in semantic publication coverage", () => {
  it("classifies every exact mounted Block, Layout and Surface definition", () => {
    expectExactClassification(
      "Block node types",
      builtInBlockDefinitions.map(({ nodeType }) => nodeType),
      Object.keys(BLOCK_PUBLICATION),
    );
    expectExactClassification(
      "Layout definition ids",
      builtInLayoutDefinitions.map(({ id }) => id),
      Object.keys(LAYOUT_PUBLICATION),
    );
    expectExactClassification(
      "Surface definition ids",
      builtInSurfaceVariantDefinitions.map(({ id }) => id),
      Object.keys(SURFACE_PUBLICATION),
    );
  });

  it("keeps assessment definitions and Quiz at an explicit root-only privacy boundary", () => {
    const assessmentAndQuizNodeTypes = builtInBlockDefinitions
      .filter(
        (definition) =>
          definition.capabilities?.assessment !== undefined || definition.nodeType === "quiz",
      )
      .map(({ nodeType }) => nodeType);
    const classifiedAssessmentNodeTypes = Object.entries(BLOCK_PUBLICATION)
      .filter(([, classification]) => classification.kind === "assessment-root-only")
      .map(([nodeType]) => nodeType);

    expectExactClassification(
      "assessment and Quiz root-only boundaries",
      assessmentAndQuizNodeTypes,
      classifiedAssessmentNodeTypes,
    );
  });

  it("keeps approved member boundaries separate from current runtime implementation", () => {
    const runtimeBlockProjectors = builtInBlockDefinitions
      .filter((definition) => definition.documentSemantics?.projectChildren !== undefined)
      .map(({ nodeType }) => nodeType)
      .sort();
    const approvedMemberBoundaries = Object.entries(BLOCK_PUBLICATION)
      .filter(([, classification]) => classification.kind === "published-members")
      .map(([nodeType]) => nodeType)
      .sort();

    expect(runtimeBlockProjectors).toEqual([
      "annotated_figure",
      "checklist",
      "comparison",
      "flashcard",
      "gallery",
      "glossary",
      "key_value_list",
      "numbered_list",
      "process_flow",
      "table",
    ]);
    expect(approvedMemberBoundaries).toEqual([
      "annotated_figure",
      "checklist",
      "comparison",
      "flashcard",
      "gallery",
      "glossary",
      "key_value_list",
      "numbered_list",
      "process_flow",
      "roadmap",
      "table",
      "timeline",
    ]);
  });
});

function surface(
  ownedContent: SurfacePublicationClassification["ownedContent"],
): SurfacePublicationClassification {
  return {
    kind: "surface-owned-content",
    ownedContent,
    privateImplementation: "all-image-and-background-slots",
  };
}

function expectExactClassification(
  inventoryName: string,
  liveIdentities: readonly string[],
  classifiedIdentities: readonly string[],
): void {
  const live = new Set(liveIdentities);
  const classified = new Set(classifiedIdentities);
  const duplicates = liveIdentities.filter(
    (identity, index) => liveIdentities.indexOf(identity) !== index,
  );
  const missing = [...live].filter((identity) => !classified.has(identity)).sort();
  const stale = [...classified].filter((identity) => !live.has(identity)).sort();

  expect({ inventoryName, duplicates, missing, stale }).toEqual({
    inventoryName,
    duplicates: [],
    missing: [],
    stale: [],
  });
}
