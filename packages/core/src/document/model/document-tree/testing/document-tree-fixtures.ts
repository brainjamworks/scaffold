import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  PresentationContentLayoutSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "../../course-structure/course-structure-projection";
import type { ExposedDocumentChild, DocumentTreeChildrenInput } from "../definition";
import type { DocumentTreeDefinitionLookup } from "../definition-lookup";

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
      attrs: {
        id: { default: null },
        role: { default: "main" },
        contentLayout: contentLayoutAttr(),
      },
    },
    layout: {
      group: "block",
      content: "section+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    section: {
      content: "block+",
      attrs: {
        id: { default: null },
        label: { default: null },
        contentLayout: contentLayoutAttr(),
      },
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
      attrs: { id: { default: null }, contentLayout: contentLayoutAttr() },
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

function contentLayoutAttr() {
  return {
    default: PresentationContentLayout.Flow,
    validate: (value: unknown) => PresentationContentLayoutSchema.parse(value),
  };
}

export interface DocumentTreeFixtureCallbackCounts {
  layoutSection: number;
  ownerBlock: number;
  assessmentBlock: number;
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

export interface RepresentativeDocumentTreeFixture {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: DocumentTreeDefinitionLookup;
  readonly courseSectionId: EmbeddedNodeId | null;
  readonly surfaces: readonly RepresentativeSurfaceIds[];
  readonly callbackCounts: DocumentTreeFixtureCallbackCounts;
}

export function createRepresentativeDocumentTreeFixture(input: {
  readonly kind: "page" | "slideshow";
}): RepresentativeDocumentTreeFixture {
  const callbackCounts: DocumentTreeFixtureCallbackCounts = {
    layoutSection: 0,
    ownerBlock: 0,
    assessmentBlock: 0,
    throwingBlock: 0,
  };
  const surfaceCount = input.kind === "page" ? 1 : 2;
  const surfaces = Array.from({ length: surfaceCount }, (_, index) =>
    representativeSurface(index + 1),
  );
  const courseSectionId = input.kind === "slideshow" ? makeNodeId("cs", 1) : null;
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

export interface ScaleDocumentTreeFixture {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: DocumentTreeDefinitionLookup;
  readonly surfaceIds: readonly EmbeddedNodeId[];
  readonly blockIds: readonly EmbeddedNodeId[];
  readonly callbackCounts: DocumentTreeFixtureCallbackCounts;
}

export interface NestedOwnerDocumentTreeFixture {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: DocumentTreeDefinitionLookup;
  readonly ownerIds: readonly EmbeddedNodeId[];
}

export function createScaleDocumentTreeFixture(input: {
  readonly surfaceCount: number;
  readonly blocksPerSurface: number;
}): ScaleDocumentTreeFixture {
  const callbackCounts: DocumentTreeFixtureCallbackCounts = {
    layoutSection: 0,
    ownerBlock: 0,
    assessmentBlock: 0,
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
  const doc = documentNode("slideshow", [
    schema.node("courseSection", { id: makeNodeId("cs", 1), title: "Scale" }),
    ...surfaces,
  ]);

  return {
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions: scaleDefinitions(callbackCounts),
    surfaceIds: Object.freeze(surfaceIds),
    blockIds: Object.freeze(blockIds),
    callbackCounts,
  };
}

export function createNestedOwnerDocumentTreeFixture(input: {
  readonly depth: number;
}): NestedOwnerDocumentTreeFixture {
  if (!Number.isSafeInteger(input.depth) || input.depth < 1) {
    throw new RangeError("Nested owner fixture depth must be a positive integer.");
  }

  const ownerIds = Array.from({ length: input.depth }, (_, index) => makeNodeId("no", index + 1));
  let owner = schema.node("owner_block", { id: ownerIds.at(-1) });
  for (let index = ownerIds.length - 2; index >= 0; index -= 1) {
    owner = schema.node("owner_block", { id: ownerIds[index] }, [owner]);
  }
  const surface = schema.node(
    "surface",
    {
      id: makeNodeId("sf", 1),
      variant: "nested-owner-surface",
    },
    [owner],
  );
  const doc = documentNode("page", [surface]);
  const definitions = lookup(
    new Map([
      [
        "owner_block",
        {
          nodeType: "owner_block",
          title: "Nested owner",
          isAssessment: false,
          documentTree: {
            projectChildren: ({ owner: currentOwner }) =>
              currentOwner.firstChild?.type.name === "owner_block"
                ? Object.freeze([{ relativePos: 0 }])
                : Object.freeze([]),
          },
        },
      ],
    ] as const),
    new Map(),
    new Map([
      ["nested-owner-surface", { id: "nested-owner-surface", title: "Nested owner Surface" }],
    ] as const),
  );

  return {
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions,
    ownerIds: Object.freeze(ownerIds),
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
  callbackCounts: DocumentTreeFixtureCallbackCounts,
): DocumentTreeDefinitionLookup {
  const blocks = new Map([
    [
      "owner_block",
      {
        nodeType: "owner_block",
        title: "Owner card",
        isAssessment: false,
        documentTree: {
          presentation: { actionIds: ["reveal"] },
          projectChildren: ({ owner }: { readonly owner: ProseMirrorNode }) => {
            callbackCounts.ownerBlock += 1;
            const children: ExposedDocumentChild[] = [];
            owner.descendants((node, relativePos) => {
              if (node.type.name === "published_container") {
                children.push({
                  relativePos,
                  treeRole: "exposed-child",
                  label: "Front",
                  presentation: { actionIds: ["emphasize"] },
                });
              } else if (node.type.name === "paragraph") {
                children.push({ relativePos, treeRole: "rich-text", label: node.textContent });
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
        documentTree: {
          describe: () => ({ label: "Safe assessment" }),
          presentation: { actionIds: ["reveal"] },
          projectChildren: ({ helpers }: DocumentTreeChildrenInput) => {
            callbackCounts.assessmentBlock += 1;
            return helpers.projectStandardRichText();
          },
        },
      },
    ],
    [
      "throwing_block",
      {
        nodeType: "throwing_block",
        title: "Throwing card",
        isAssessment: false,
        documentTree: {
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
        documentTree: { presentation: { actionIds: ["reveal"] } },
        section: {
          label: "Panel",
          documentTree: {
            presentation: { actionIds: ["reveal"] },
            projectChildren: ({ helpers }: DocumentTreeChildrenInput) => {
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
        documentTree: { presentation: { actionIds: ["reveal"] } },
      },
    ],
  ] as const);
  return lookup(blocks, layouts, surfaces);
}

function scaleDefinitions(
  callbackCounts: DocumentTreeFixtureCallbackCounts,
): DocumentTreeDefinitionLookup {
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
            documentTree: {
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
  blocks: ReadonlyMap<string, ReturnType<DocumentTreeDefinitionLookup["blocks"]["get"]>>,
  layouts: ReadonlyMap<string, ReturnType<DocumentTreeDefinitionLookup["layouts"]["get"]>>,
  surfaces: ReadonlyMap<string, ReturnType<DocumentTreeDefinitionLookup["surfaces"]["get"]>>,
): DocumentTreeDefinitionLookup {
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
  if (!courseStructure) throw new Error("Invalid document tree fixture Course Structure.");
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
