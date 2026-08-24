import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantDefinitions } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_AUTHORING_STATE,
  createSemanticLifecycleDocument,
  projectSemanticLifecycleDocument,
} from "./testing/semantic-publication-lifecycle-fixtures";

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

  it("matches every Block classification to its mounted publication behavior", () => {
    for (const definition of builtInBlockDefinitions) {
      const classification = requireBlockClassification(definition.nodeType);
      const isAssessment =
        definition.capabilities?.assessment !== undefined || definition.nodeType === "quiz";

      if (classification.kind === "root-only") {
        expect({ nodeType: definition.nodeType, isAssessment, projectChildren: definition.documentSemantics?.projectChildren }).toEqual({
          nodeType: definition.nodeType,
          isAssessment: false,
          projectChildren: undefined,
        });
        continue;
      }

      if (classification.kind === "assessment-root-only") {
        expect({ nodeType: definition.nodeType, isAssessment, projectChildren: definition.documentSemantics?.projectChildren }).toEqual({
          nodeType: definition.nodeType,
          isAssessment: true,
          projectChildren: undefined,
        });
        continue;
      }

      const family = APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.find(
        ({ ownerNodeType }) => ownerNodeType === definition.nodeType,
      );
      if (!family) throw new Error(`Missing approved fixture for ${definition.nodeType}.`);
      const snapshot = projectSemanticLifecycleDocument(family.createDocument(), 1);

      expect(typeof definition.documentSemantics?.projectChildren).toBe("function");
      expect(isAssessment).toBe(false);
      expect(
        [
          ...new Set(
            snapshot.itemById.get(family.ownerId)?.children.map(({ nodeType }) => nodeType),
          ),
        ],
      ).toEqual(classification.childNodeTypes);
    }
  });

  it("projects every mounted Block root exactly once when present", () => {
    for (const [definitionIndex, definition] of builtInBlockDefinitions.entries()) {
      const inserted = definition.insert?.content();
      if (!inserted || inserted.type !== definition.nodeType) {
        throw new Error(`Missing mounted insertion content for ${definition.nodeType}.`);
      }
      const ownerId = EmbeddedNodeIdSchema.parse(
        `blk${definitionIndex.toString().padStart(9, "0")}`,
      );
      const ownerJson = withPersistedIds(inserted, ownerId);
      const owner = SEMANTIC_LIFECYCLE_AUTHORING_STATE.schema.nodeFromJSON(ownerJson);
      const snapshot = projectSemanticLifecycleDocument(
        createSemanticLifecycleDocument([owner]),
        definitionIndex + 1,
      );

      expect(snapshot.itemById.get(ownerId)).toMatchObject({
        id: ownerId,
        kind: "block",
        nodeType: definition.nodeType,
        definitionId: definition.nodeType,
      });
      expect(
        [...snapshot.itemById.values()].filter(
          ({ id, nodeType }) => id === ownerId && nodeType === definition.nodeType,
        ),
      ).toHaveLength(1);
    }
  });

  it("matches every Layout classification to direct Section activation behavior", () => {
    const schema = SEMANTIC_LIFECYCLE_AUTHORING_STATE.schema;
    const ownerId = EmbeddedNodeIdSchema.parse("covr_0000001");
    const firstId = EmbeddedNodeIdSchema.parse("covr_0000002");
    const secondId = EmbeddedNodeIdSchema.parse("covr_0000003");
    const owner = schema.node("layout", { id: ownerId, variant: "tabs" }, [
      schema.node("section", { id: firstId }, [schema.node("paragraph")]),
      schema.node("section", { id: secondId }, [schema.node("paragraph")]),
    ]);

    for (const definition of builtInLayoutDefinitions) {
      const classification = LAYOUT_PUBLICATION[definition.id as keyof typeof LAYOUT_PUBLICATION];
      const projectChildren = definition.documentSemantics?.projectChildren;
      if (!classification || !projectChildren) {
        throw new Error(`Missing mounted Layout publication for ${definition.id}.`);
      }

      expect(
        projectChildren({
          definitionId: definition.id,
          helpers: emptyProjectionHelpers(),
          owner,
          ownerId,
        }),
      ).toEqual([
        {
          relativePos: 0,
          activation: [{ ownerId, childId: firstId, ownerKind: "layout" }],
        },
        {
          relativePos: owner.child(0).nodeSize,
          activation: [{ ownerId, childId: secondId, ownerKind: "layout" }],
        },
      ]);
    }
  });

  it("matches every Surface classification to its mounted content publication policy", () => {
    const ownerId = EmbeddedNodeIdSchema.parse("covr_0000004");
    const schema = SEMANTIC_LIFECYCLE_AUTHORING_STATE.schema;

    for (const definition of builtInSurfaceVariantDefinitions) {
      const classification = SURFACE_PUBLICATION[definition.id as keyof typeof SURFACE_PUBLICATION];
      const projectChildren = definition.documentSemantics?.projectChildren;
      if (!classification || !projectChildren) {
        throw new Error(`Missing mounted Surface publication for ${definition.id}.`);
      }
      const owner = schema.nodeFromJSON(definition.createSurface({ surfaceId: ownerId }));
      const standardRichTextRoots: Array<string | null> = [];
      const children = projectChildren({
        definitionId: definition.id,
        helpers: {
          ...emptyProjectionHelpers(),
          projectStandardRichText: (root) => {
            standardRichTextRoots.push(root?.type.name ?? null);
            return [];
          },
        },
        owner,
        ownerId,
      });
      const directlyPublishedNodeTypes = children.map(({ relativePos }) =>
        owner.nodeAt(relativePos)?.type.name,
      );

      expect({
        id: definition.id,
        directlyPublishedNodeTypes: [...new Set(directlyPublishedNodeTypes)],
        standardRichTextRoots: [...new Set(standardRichTextRoots)],
      }).toEqual(expectedSurfaceBehavior(definition.id, classification.ownedContent));
    }
  });
});

function requireBlockClassification(nodeType: string): BlockPublicationClassification {
  const classification = BLOCK_PUBLICATION[nodeType as keyof typeof BLOCK_PUBLICATION];
  if (!classification) throw new Error(`Missing Block publication classification for ${nodeType}.`);
  return classification;
}

function emptyProjectionHelpers() {
  return {
    projectDirectOwnedMembers: () => [],
    projectStandardRichText: () => [],
    projectStructuralChildren: () => [],
  };
}

function withPersistedIds(source: JSONContent, rootId: string): JSONContent {
  const root = JSON.parse(JSON.stringify(source)) as JSONContent;
  let descendantOrdinal = 1;
  const visit = (node: JSONContent, isRoot: boolean): void => {
    if (node.type !== "text") {
      const id = isRoot ? rootId : `dsc${descendantOrdinal.toString().padStart(9, "0")}`;
      node.attrs = { ...node.attrs, id };
      descendantOrdinal += 1;
    }
    for (const child of node.content ?? []) visit(child, false);
  };
  visit(root, true);
  return root;
}

function expectedSurfaceBehavior(
  id: string,
  ownedContent: SurfacePublicationClassification["ownedContent"],
) {
  if (ownedContent === "direct-rich-text") {
    return { id, directlyPublishedNodeTypes: [], standardRichTextRoots: [null] };
  }
  if (ownedContent === "title-and-subtitle") {
    return {
      id,
      directlyPublishedNodeTypes: ["heading"],
      standardRichTextRoots: ["slide_cover_subtitle"],
    };
  }
  return { id, directlyPublishedNodeTypes: ["slide_title"], standardRichTextRoots: [] };
}

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
