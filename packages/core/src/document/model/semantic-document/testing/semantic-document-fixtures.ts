import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "../../course-structure/course-structure-projection";
import type { PublishedSemanticChild, SemanticChildProjectionInput } from "../definition";
import type { SemanticDefinitionLookup } from "../definition-lookup";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "block+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    courseSection: {
      group: "block",
      atom: true,
      attrs: { id: { default: null }, title: { default: null } },
    },
    surface: {
      group: "block",
      content: "block+",
      selectable: false,
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      selectable: false,
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    layout: {
      group: "block",
      content: "section+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    section: {
      content: "block+",
      attrs: { id: { default: null }, label: { default: null } },
    },
    grid: {
      group: "block",
      content: "cell+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    cell: {
      content: "block+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    owner_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    nested_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    assessment_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    throwing_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    scale_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    published_container: {
      group: "block",
      content: "block*",
      selectable: false,
      attrs: { id: { default: null } },
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    bulletList: {
      group: "block",
      content: "listItem+",
      attrs: { id: { default: null } },
    },
    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { id: { default: null } },
    },
    listItem: {
      content: "paragraph block*",
      attrs: { id: { default: null } },
    },
    blockquote: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null } },
    },
    codeBlock: {
      group: "block",
      content: "text*",
      marks: "",
      attrs: { id: { default: null } },
    },
  },
});

export interface SemanticFixtureCallbackCounts {
  layoutSection: number;
  ownerBlock: number;
  throwingBlock: number;
}

export interface RepresentativeSurfaceIds {
  readonly surface: EmbeddedNodeId;
  readonly region: EmbeddedNodeId;
  readonly layout: EmbeddedNodeId;
  readonly layoutSection: EmbeddedNodeId;
  readonly repeatedParagraphs: readonly [EmbeddedNodeId, EmbeddedNodeId];
  readonly listItem: EmbeddedNodeId;
  readonly grid: EmbeddedNodeId;
  readonly cells: readonly [EmbeddedNodeId, EmbeddedNodeId];
  readonly ownerBlock: EmbeddedNodeId;
  readonly publishedContainer: EmbeddedNodeId;
  readonly publishedParagraph: EmbeddedNodeId;
  readonly nestedBlock: EmbeddedNodeId;
  readonly assessmentBlock: EmbeddedNodeId;
  readonly privateAssessmentParagraph: EmbeddedNodeId;
  readonly throwingBlock: EmbeddedNodeId;
  readonly privateThrowingParagraph: EmbeddedNodeId;
}

export interface RepresentativeSemanticDocumentFixture {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: SemanticDefinitionLookup;
  readonly courseSectionId: EmbeddedNodeId | null;
  readonly surfaces: readonly RepresentativeSurfaceIds[];
  readonly callbackCounts: SemanticFixtureCallbackCounts;
}

export function createRepresentativeSemanticDocumentFixture(input: {
  readonly kind: "page" | "unsectioned-slideshow" | "sectioned-slideshow";
}): RepresentativeSemanticDocumentFixture {
  const callbackCounts: SemanticFixtureCallbackCounts = {
    layoutSection: 0,
    ownerBlock: 0,
    throwingBlock: 0,
  };
  const surfaceCount = input.kind === "page" ? 1 : 2;
  const surfaces = Array.from({ length: surfaceCount }, (_, index) =>
    representativeSurface(index + 1),
  );
  const courseSectionId = input.kind === "sectioned-slideshow" ? makeNodeId("cs", 1) : null;
  const courseChildren = [
    ...(courseSectionId
      ? [schema.node("courseSection", { id: courseSectionId, title: "Practice" })]
      : []),
    ...surfaces.map(({ node }) => node),
  ];
  const mode = input.kind === "page" ? "page" : "slideshow";
  const doc = documentNode(mode, courseChildren);

  return {
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions: representativeDefinitions(callbackCounts),
    courseSectionId,
    surfaces: Object.freeze(surfaces.map(({ ids }) => ids)),
    callbackCounts,
  };
}

export interface ScaleSemanticDocumentFixture {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: SemanticDefinitionLookup;
  readonly surfaceIds: readonly EmbeddedNodeId[];
  readonly blockIds: readonly EmbeddedNodeId[];
  readonly callbackCounts: SemanticFixtureCallbackCounts;
}

export function createScaleSemanticDocumentFixture(input: {
  readonly surfaceCount: number;
  readonly blocksPerSurface: number;
}): ScaleSemanticDocumentFixture {
  const callbackCounts: SemanticFixtureCallbackCounts = {
    layoutSection: 0,
    ownerBlock: 0,
    throwingBlock: 0,
  };
  const blockIds: EmbeddedNodeId[] = [];
  const surfaceIds: EmbeddedNodeId[] = [];
  const surfaces = Array.from({ length: input.surfaceCount }, (_, surfaceIndex) => {
    const ordinal = surfaceIndex + 1;
    const surfaceId = makeNodeId("sf", ordinal);
    surfaceIds.push(surfaceId);
    const cells = Array.from({ length: 4 }, (_, cellIndex) => {
      const cellOrdinal = surfaceIndex * 4 + cellIndex + 1;
      const firstBlockIndex = Math.floor((cellIndex * input.blocksPerSurface) / 4);
      const nextBlockIndex = Math.floor(((cellIndex + 1) * input.blocksPerSurface) / 4);
      const blocks = Array.from({ length: nextBlockIndex - firstBlockIndex }, (_, localIndex) => {
        const blockOrdinal =
          surfaceIndex * input.blocksPerSurface + firstBlockIndex + localIndex + 1;
        const blockId = makeNodeId("bl", blockOrdinal);
        blockIds.push(blockId);
        return schema.node("scale_block", { id: blockId });
      });
      return schema.node("cell", { id: makeNodeId("ce", cellOrdinal) }, blocks);
    });
    const grid = schema.node("grid", { id: makeNodeId("gr", ordinal) }, cells);
    const paragraph = textblock("paragraph", makeNodeId("pa", ordinal), `Surface ${ordinal}`);
    const section = schema.node("section", { id: makeNodeId("ls", ordinal), label: "Panel" }, [
      paragraph,
      grid,
    ]);
    const layout = schema.node(
      "layout",
      { id: makeNodeId("ly", ordinal), variant: "scale-layout" },
      [section],
    );
    const region = schema.node("region", { id: makeNodeId("rg", ordinal), role: "main" }, [layout]);
    return schema.node("surface", { id: surfaceId, variant: "scale-surface" }, [region]);
  });
  const doc = documentNode("slideshow", surfaces);

  return {
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions: scaleDefinitions(callbackCounts),
    surfaceIds: Object.freeze(surfaceIds),
    blockIds: Object.freeze(blockIds),
    callbackCounts,
  };
}

export function countProseMirrorNodes(doc: ProseMirrorNode): number {
  let count = 1;
  doc.descendants(() => {
    count += 1;
  });
  return count;
}

function representativeSurface(ordinal: number): {
  readonly node: ProseMirrorNode;
  readonly ids: RepresentativeSurfaceIds;
} {
  const ids: RepresentativeSurfaceIds = {
    surface: makeNodeId("sf", ordinal),
    region: makeNodeId("rg", ordinal),
    layout: makeNodeId("ly", ordinal),
    layoutSection: makeNodeId("ls", ordinal),
    repeatedParagraphs: [makeNodeId("p1", ordinal), makeNodeId("p2", ordinal)],
    listItem: makeNodeId("li", ordinal),
    grid: makeNodeId("gr", ordinal),
    cells: [makeNodeId("c1", ordinal), makeNodeId("c2", ordinal)],
    ownerBlock: makeNodeId("ob", ordinal),
    publishedContainer: makeNodeId("pc", ordinal),
    publishedParagraph: makeNodeId("op", ordinal),
    nestedBlock: makeNodeId("nb", ordinal),
    assessmentBlock: makeNodeId("ab", ordinal),
    privateAssessmentParagraph: makeNodeId("ap", ordinal),
    throwingBlock: makeNodeId("tb", ordinal),
    privateThrowingParagraph: makeNodeId("tp", ordinal),
  };
  const listParagraphId = makeNodeId("lp", ordinal);
  const list = schema.node("bulletList", { id: makeNodeId("ul", ordinal) }, [
    schema.node("listItem", { id: ids.listItem }, [
      textblock("paragraph", listParagraphId, "First item"),
    ]),
  ]);
  const publishedContainer = schema.node("published_container", { id: ids.publishedContainer }, [
    textblock("paragraph", ids.publishedParagraph, "Owned prose"),
  ]);
  const ownerBlock = schema.node("owner_block", { id: ids.ownerBlock }, [
    publishedContainer,
    schema.node("nested_block", { id: ids.nestedBlock }),
  ]);
  const assessment = schema.node("assessment_block", { id: ids.assessmentBlock }, [
    textblock("paragraph", ids.privateAssessmentParagraph, "Correct answer: private"),
  ]);
  const grid = schema.node("grid", { id: ids.grid }, [
    schema.node("cell", { id: ids.cells[0] }, [ownerBlock]),
    schema.node("cell", { id: ids.cells[1] }, [assessment]),
  ]);
  const throwingBlock = schema.node("throwing_block", { id: ids.throwingBlock }, [
    textblock("paragraph", ids.privateThrowingParagraph, "Private feedback"),
  ]);
  const section = schema.node("section", { id: ids.layoutSection, label: "Panel" }, [
    textblock("heading", makeNodeId("hd", ordinal), "Welcome"),
    textblock("paragraph", ids.repeatedParagraphs[0], "Repeat"),
    textblock("paragraph", ids.repeatedParagraphs[1], "Repeat"),
    list,
    grid,
    throwingBlock,
  ]);
  const layout = schema.node("layout", { id: ids.layout, variant: "fixture-layout" }, [section]);
  const region = schema.node("region", { id: ids.region, role: "main" }, [layout]);
  const surface = schema.node("surface", { id: ids.surface, variant: "fixture-surface" }, [region]);
  return { node: surface, ids: Object.freeze(ids) };
}

function representativeDefinitions(
  callbackCounts: SemanticFixtureCallbackCounts,
): SemanticDefinitionLookup {
  const blocks = new Map([
    [
      "owner_block",
      {
        nodeType: "owner_block",
        title: "Owner card",
        isAssessment: false,
        documentSemantics: {
          presentation: { actionIds: ["reveal"] },
          projectChildren: ({ owner }: { readonly owner: ProseMirrorNode }) => {
            callbackCounts.ownerBlock += 1;
            const children: PublishedSemanticChild[] = [];
            owner.descendants((node, relativePos) => {
              if (node.type.name === "published_container") {
                children.push({
                  relativePos,
                  semanticRole: "published-child",
                  label: "Front",
                  presentation: { actionIds: ["highlight"] },
                });
              } else if (node.type.name === "paragraph") {
                children.push({ relativePos, semanticRole: "rich-text", label: node.textContent });
              } else if (node.type.name === "nested_block") {
                children.push({ relativePos });
              }
              return true;
            });
            return children;
          },
        },
      },
    ],
    ["nested_block", { nodeType: "nested_block", title: "Nested card", isAssessment: false }],
    [
      "assessment_block",
      {
        nodeType: "assessment_block",
        title: "Assessment",
        isAssessment: true,
        documentSemantics: { presentation: { actionIds: ["reveal"] } },
      },
    ],
    [
      "throwing_block",
      {
        nodeType: "throwing_block",
        title: "Throwing card",
        isAssessment: false,
        documentSemantics: {
          projectChildren: () => {
            callbackCounts.throwingBlock += 1;
            throw new Error("private fixture payload");
          },
        },
      },
    ],
  ] as const);
  const layouts = new Map([
    [
      "fixture-layout",
      {
        id: "fixture-layout",
        title: "Fixture layout",
        documentSemantics: { presentation: { actionIds: ["reveal"] } },
        section: {
          label: "Panel",
          documentSemantics: {
            presentation: { actionIds: ["reveal"] },
            projectChildren: ({ helpers }: SemanticChildProjectionInput) => {
              callbackCounts.layoutSection += 1;
              return helpers.projectStandardRichText();
            },
          },
        },
      },
    ],
  ] as const);
  const surfaces = new Map([
    [
      "fixture-surface",
      {
        id: "fixture-surface",
        title: "Slide",
        documentSemantics: { presentation: { actionIds: ["enter"] } },
      },
    ],
  ] as const);
  return lookup(blocks, layouts, surfaces);
}

function scaleDefinitions(callbackCounts: SemanticFixtureCallbackCounts): SemanticDefinitionLookup {
  return lookup(
    new Map([
      ["scale_block", { nodeType: "scale_block", title: "Content block", isAssessment: false }],
    ]),
    new Map([
      [
        "scale-layout",
        {
          id: "scale-layout",
          title: "Columns",
          section: {
            label: "Panel",
            documentSemantics: {
              projectChildren: ({ helpers }) => {
                callbackCounts.layoutSection += 1;
                return helpers.projectStandardRichText();
              },
            },
          },
        },
      ],
    ]),
    new Map([["scale-surface", { id: "scale-surface", title: "Slide" }]]),
  );
}

function lookup(
  blocks: ReadonlyMap<string, ReturnType<SemanticDefinitionLookup["blocks"]["get"]>>,
  layouts: ReadonlyMap<string, ReturnType<SemanticDefinitionLookup["layouts"]["get"]>>,
  surfaces: ReadonlyMap<string, ReturnType<SemanticDefinitionLookup["surfaces"]["get"]>>,
): SemanticDefinitionLookup {
  return Object.freeze({
    blocks: Object.freeze({ get: (nodeType: string) => blocks.get(nodeType) }),
    layouts: Object.freeze({ get: (variant: string) => layouts.get(variant) }),
    surfaces: Object.freeze({ get: (variant: string) => surfaces.get(variant) }),
  });
}

function documentNode(
  mode: "page" | "slideshow",
  children: readonly ProseMirrorNode[],
): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeNodeId("cd", 1), mode }, children),
  ]);
}

function requireCourseStructure(doc: ProseMirrorNode): ProjectedCourseStructure {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid semantic document fixture Course Structure.");
  return courseStructure;
}

function textblock(type: string, id: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node(type, { id }, text.length === 0 ? [] : [schema.text(text)]);
}

function makeNodeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
