import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  PresentationContentLayoutSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { projectCourseStructure } from "../course-structure/course-structure-projection";
import type { SemanticDefinitionLookup } from "./definition-lookup";
import { projectSemanticDocument } from "./project-semantic-document";

const IDS = {
  course: id("course000001"),
  courseSection: id("section00001"),
  surface: id("surface00001"),
  unavailableSurface: id("availsrf0001"),
  region: id("region000001"),
  before: id("before000001"),
  deepWrapper: id("deepwrap0001"),
  assessment: id("mcq000000001"),
  titleWrapper: id("titlewrap001"),
  titleParagraph: id("titlepara001"),
  instructionsWrapper: id("instrwrap001"),
  instructionsParagraph: id("instrpara001"),
  promptWrapper: id("promptwrp001"),
  promptParagraph: id("promptpar001"),
  choicesGroup: id("choicesgrp01"),
  choice: id("choice000001"),
  choiceBody: id("choicebody01"),
  choiceParagraph: id("choicepara01"),
  actionsGroup: id("actionsgrp01"),
  hintsGroup: id("hintsgroup01"),
  hintsParagraph: id("hintspara001"),
  feedback: id("feedback0001"),
  feedbackParagraph: id("feedpara0001"),
  after: id("after0000001"),
  unavailableBlock: id("availblk0001"),
  unavailableLayout: id("availlay0001"),
  opaqueParagraph: id("opaquepar001"),
  opaqueBlock: id("opaqueblk001"),
  opaqueLayout: id("opaquelyt001"),
  opaqueSurface: id("opaquesrf001"),
} as const;

const privateAssessmentIds = [
  IDS.titleWrapper,
  IDS.titleParagraph,
  IDS.instructionsWrapper,
  IDS.instructionsParagraph,
  IDS.promptWrapper,
  IDS.promptParagraph,
  IDS.choicesGroup,
  IDS.choice,
  IDS.choiceBody,
  IDS.choiceParagraph,
  IDS.actionsGroup,
  IDS.hintsGroup,
  IDS.hintsParagraph,
  IDS.feedback,
  IDS.feedbackParagraph,
] as const;

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
        contentLayout: {
          default: PresentationContentLayout.Flow,
          validate: (value: unknown) => PresentationContentLayoutSchema.parse(value),
        },
      },
    },
    deep_wrapper: blockContainer(),
    mcq: blockContainer(),
    assessment_title: blockContainer(),
    assessment_instructions: blockContainer(),
    assessment_prompt: blockContainer(),
    assessment_choices_group: blockContainer(),
    selectable_choice: blockContainer(),
    selectable_choice_body: blockContainer(),
    assessment_actions_group: blockContainer(),
    assessment_hints_group: blockContainer(),
    assessment_summary_feedback: blockContainer(),
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    unavailable_block: unavailableNodeSpec(),
    unavailable_layout: unavailableNodeSpec(),
    unavailable_surface: unavailableNodeSpec(),
  },
});

const definitions: SemanticDefinitionLookup = Object.freeze({
  blocks: Object.freeze({
    get: (nodeType: string) =>
      nodeType === "mcq"
        ? {
            nodeType: "mcq",
            title: "Multiple choice",
            isAssessment: true,
            documentSemantics: {
              presentation: { actionIds: ["reveal", "highlight"] },
              projectChildren: () => {
                throw new Error("Assessment child publication must remain closed.");
              },
            },
          }
        : undefined,
  }),
  layouts: Object.freeze({ get: (_variant: string) => undefined }),
  surfaces: Object.freeze({
    get: (variant: string) =>
      variant === "slide-content" || variant === "page-default"
        ? { id: variant, title: variant === "page-default" ? "Page" : "Slide" }
        : undefined,
  }),
});

describe("semantic content boundaries", () => {
  it("keeps a mounted assessment as one item while surrounding Region prose remains public", () => {
    const assessment = node("mcq", IDS.assessment, {}, [
      node("assessment_title", IDS.titleWrapper, {}, [
        paragraph(IDS.titleParagraph, "Secret assessment title"),
      ]),
      node("assessment_instructions", IDS.instructionsWrapper, {}, [
        paragraph(IDS.instructionsParagraph, "Private instructions"),
      ]),
      node("assessment_prompt", IDS.promptWrapper, {}, [
        paragraph(IDS.promptParagraph, "Which answer is correct?"),
      ]),
      node("assessment_choices_group", IDS.choicesGroup, {}, [
        node("selectable_choice", IDS.choice, {}, [
          node("selectable_choice_body", IDS.choiceBody, {}, [
            paragraph(IDS.choiceParagraph, "The private correct answer"),
          ]),
        ]),
      ]),
      node("assessment_actions_group", IDS.actionsGroup, {}, [
        node("assessment_hints_group", IDS.hintsGroup, {}, [
          paragraph(IDS.hintsParagraph, "Private hint"),
        ]),
        node("assessment_summary_feedback", IDS.feedback, {}, [
          paragraph(IDS.feedbackParagraph, "Private feedback"),
        ]),
      ]),
    ]);
    const doc = documentNode("page", [
      node("surface", IDS.surface, { variant: "page-default" }, [
        node("region", IDS.region, { role: "main" }, [
          paragraph(IDS.before, "Before assessment"),
          node("deep_wrapper", IDS.deepWrapper, {}, [assessment]),
          paragraph(IDS.after, "After assessment"),
        ]),
      ]),
    ]);

    const snapshot = project(doc, courseStructureFor("page", [IDS.surface]));

    expect(snapshot.itemById.get(IDS.region)?.children.map(({ id: childId }) => childId)).toEqual([
      IDS.before,
      IDS.assessment,
      IDS.after,
    ]);
    expect(snapshot.itemById.get(IDS.assessment)).toMatchObject({
      kind: "block",
      label: "Multiple choice",
      presentation: { actionIds: [] },
      children: [],
    });
    expect(snapshot.locationById.has(IDS.assessment)).toBe(true);
    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.itemById.has(IDS.deepWrapper)).toBe(false);
    for (const privateId of privateAssessmentIds) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
  });

  it("projects every unavailable working root once without interpreting opaque original JSON", () => {
    const unavailableBlockOriginal = opaqueOriginal(
      "plus_quiz_v2",
      IDS.unavailableBlock,
      IDS.opaqueBlock,
    );
    const unavailableLayoutOriginal = opaqueOriginal(
      "layout",
      IDS.unavailableLayout,
      IDS.opaqueLayout,
      "plus.tabs-v2",
    );
    const unavailableSurfaceOriginal = opaqueOriginal(
      "surface",
      IDS.unavailableSurface,
      IDS.opaqueSurface,
      "plus.immersive-v3",
    );
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, { title: "Unavailable content" }),
      node("surface", IDS.surface, { variant: "slide-content" }, [
        node("region", IDS.region, { role: "main" }, [
          compatibilityNode(
            "unavailable_block",
            IDS.unavailableBlock,
            "plus_quiz_v2",
            unavailableBlockOriginal,
          ),
          compatibilityNode(
            "unavailable_layout",
            IDS.unavailableLayout,
            "plus.tabs-v2",
            unavailableLayoutOriginal,
          ),
        ]),
      ]),
      compatibilityNode(
        "unavailable_surface",
        IDS.unavailableSurface,
        "plus.immersive-v3",
        unavailableSurfaceOriginal,
      ),
    ]);

    const snapshot = project(
      doc,
      courseStructureFor("slideshow", [IDS.surface, IDS.unavailableSurface]),
    );

    expect(snapshot.roots.map(({ id: rootId }) => rootId)).toEqual([IDS.courseSection]);
    expect(snapshot.itemById.get(IDS.region)?.children.map(({ id: childId }) => childId)).toEqual([
      IDS.unavailableBlock,
      IDS.unavailableLayout,
    ]);
    expectUnavailableItem(doc, snapshot, IDS.unavailableBlock, {
      kind: "block",
      label: "Unavailable Block: plus_quiz_v2",
      nodeType: "unavailable_block",
      parentId: IDS.region,
      surfaceId: IDS.surface,
    });
    expectUnavailableItem(doc, snapshot, IDS.unavailableLayout, {
      kind: "layout",
      label: "Unavailable Layout: plus.tabs-v2",
      nodeType: "unavailable_layout",
      parentId: IDS.region,
      surfaceId: IDS.surface,
    });
    expectUnavailableItem(doc, snapshot, IDS.unavailableSurface, {
      kind: "surface",
      label: "Unavailable Surface: plus.immersive-v3",
      nodeType: "unavailable_surface",
      parentId: IDS.courseSection,
      surfaceId: IDS.unavailableSurface,
    });
    for (const opaqueId of [
      IDS.opaqueParagraph,
      IDS.opaqueBlock,
      IDS.opaqueLayout,
      IDS.opaqueSurface,
    ]) {
      expect(snapshot.itemById.has(opaqueId)).toBe(false);
      expect(snapshot.locationById.has(opaqueId)).toBe(false);
    }
    expect(JSON.stringify(snapshot)).not.toContain("opaque eligible-looking prose");
  });
});

function blockContainer() {
  return {
    group: "block",
    content: "block*",
    attrs: { id: { default: null } },
  } as const;
}

function unavailableNodeSpec() {
  return {
    group: "block",
    atom: true,
    attrs: {
      id: { default: null },
      capabilityId: { default: null },
      original: { default: null },
    },
  } as const;
}

function documentNode(mode: "page" | "slideshow", children: readonly ProseMirrorNode[]) {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: IDS.course, mode }, children),
  ]);
}

function node(
  type: string,
  nodeId: EmbeddedNodeId,
  attrs: Readonly<Record<string, unknown>> = {},
  content: readonly ProseMirrorNode[] = [],
): ProseMirrorNode {
  return schema.node(type, { id: nodeId, ...attrs }, content);
}

function paragraph(nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node("paragraph", { id: nodeId }, [schema.text(text)]);
}

function compatibilityNode(
  type: "unavailable_block" | "unavailable_layout" | "unavailable_surface",
  nodeId: EmbeddedNodeId,
  capabilityId: string,
  original: Readonly<Record<string, unknown>>,
): ProseMirrorNode {
  return schema.node(type, { id: nodeId, capabilityId, original });
}

function opaqueOriginal(
  type: string,
  rootId: EmbeddedNodeId,
  nestedRootId: EmbeddedNodeId,
  variant?: string,
): Readonly<Record<string, unknown>> {
  const original: Record<string, unknown> = {
    type,
    attrs: { id: rootId, ...(variant ? { variant } : {}) },
    content: [
      {
        type: "region",
        attrs: { id: "opaquergn001" },
        content: [
          {
            type: "deep_wrapper",
            attrs: { id: "opaquewrp001" },
            content: [
              {
                type: "paragraph",
                attrs: { id: IDS.opaqueParagraph },
                content: [{ type: "text", text: "opaque eligible-looking prose" }],
              },
              {
                type: "mcq",
                attrs: { id: nestedRootId },
                content: [
                  {
                    type: "assessment_feedback",
                    attrs: { id: "opaquefdb001" },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "opaqueans001" },
                        content: [{ type: "text", text: "opaque correct answer" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  Object.defineProperty(original, "toJSON", {
    value: () => {
      throw new Error("Semantic projection must not stringify attrs.original.");
    },
  });
  return original;
}

function courseStructureFor(mode: "page" | "slideshow", surfaceIds: readonly EmbeddedNodeId[]) {
  const courseStructure = projectCourseStructure({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: IDS.course, mode },
        content: [
          ...(mode === "slideshow"
            ? [{ type: "courseSection", attrs: { id: IDS.courseSection, title: "Section" } }]
            : []),
          ...surfaceIds.map((surfaceId) => ({
            type: "surface",
            attrs: { id: surfaceId, variant: "canonical-only" },
          })),
        ],
      },
    ],
  });
  if (!courseStructure) throw new Error("Invalid test Course Structure.");
  return courseStructure;
}

function project(
  doc: ProseMirrorNode,
  courseStructure: NonNullable<ReturnType<typeof projectCourseStructure>>,
) {
  return projectSemanticDocument({ doc, courseStructure, definitions, revision: 1 });
}

function expectUnavailableItem(
  doc: ProseMirrorNode,
  snapshot: ReturnType<typeof projectSemanticDocument>,
  itemId: EmbeddedNodeId,
  expected: {
    readonly kind: "block" | "layout" | "surface";
    readonly label: string;
    readonly nodeType: string;
    readonly parentId: EmbeddedNodeId | null;
    readonly surfaceId: EmbeddedNodeId;
  },
): void {
  expect(snapshot.itemById.get(itemId)).toMatchObject({
    kind: expected.kind,
    label: expected.label,
    nodeType: expected.nodeType,
    definitionId: null,
    presentation: { actionIds: [], disabledReason: null },
    children: [],
  });
  expect(snapshot.parentById.get(itemId)).toBe(expected.parentId);
  const location = snapshot.locationById.get(itemId);
  expect(location).toMatchObject({
    id: itemId,
    nodeType: expected.nodeType,
    surfaceId: expected.surfaceId,
    authoringAnchorId: null,
    activationPath: [],
  });
  const actual = findNodeById(doc, itemId);
  expect(location?.from).toBe(actual.pos);
  expect(location?.to).toBe(actual.pos + actual.node.nodeSize);
  expect(location?.selectionTarget).toEqual({ kind: "node", pos: actual.pos });
}

function findNodeById(
  doc: ProseMirrorNode,
  itemId: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let result: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((candidate, pos) => {
    if (candidate.attrs["id"] !== itemId) return result === null;
    result = { node: candidate, pos };
    return false;
  });
  if (!result) throw new Error(`Missing test node ${itemId}.`);
  return result;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
