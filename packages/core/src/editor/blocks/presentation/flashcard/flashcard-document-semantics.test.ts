import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure/course-structure-projection";
import {
  projectSemanticDocument,
  type SemanticChildProjectionInput,
  type SemanticDefinitionLookup,
} from "@/document/model/semantic-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
} from "./content";
import { flashcardBlockDefinition } from "./flashcard-definition";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "surface+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    surface: {
      content: "block+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    [FLASHCARD_NODE]: {
      group: "block",
      content: `${FLASHCARD_CARD_NODE}+`,
      attrs: { id: { default: null } },
    },
    [FLASHCARD_CARD_NODE]: {
      content: `${FLASHCARD_CARD_FRONT_NODE} ${FLASHCARD_CARD_BACK_NODE}`,
      attrs: { id: { default: null } },
    },
    [FLASHCARD_CARD_FRONT_NODE]: {
      content: "block+",
      attrs: { id: { default: null } },
    },
    [FLASHCARD_CARD_BACK_NODE]: {
      content: "block+",
      attrs: { id: { default: null } },
    },
    nested_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Flashcard document semantics", () => {
  it("publishes cards, faces, prose and recursively owned nested Blocks exactly once", () => {
    const flashcardId = makeId("fl", 1);
    const firstCardId = makeId("ca", 1);
    const firstFrontId = makeId("fr", 1);
    const firstBackId = makeId("ba", 1);
    const frontParagraphId = makeId("pa", 1);
    const emptyBackParagraphId = makeId("pa", 2);
    const nestedBlockId = makeId("nb", 1);
    const nestedParagraphId = makeId("pa", 3);
    const secondCardId = makeId("ca", 2);
    const secondFrontId = makeId("fr", 2);
    const secondBackId = makeId("ba", 2);
    const flashcard = schema.node(FLASHCARD_NODE, { id: flashcardId }, [
      card({
        id: firstCardId,
        frontId: firstFrontId,
        backId: firstBackId,
        front: [paragraph(frontParagraphId, "Question")],
        back: [
          paragraph(emptyBackParagraphId, ""),
          schema.node("nested_block", { id: nestedBlockId }, [
            paragraph(nestedParagraphId, "Nested answer"),
          ]),
        ],
      }),
      card({
        id: secondCardId,
        frontId: secondFrontId,
        backId: secondBackId,
        front: [paragraph(makeId("pa", 4), "Second question")],
        back: [paragraph(makeId("pa", 5), "Second answer")],
      }),
    ]);
    const doc = documentNode(flashcard);
    const snapshot = projectSemanticDocument({
      doc,
      courseStructure: requireCourseStructure(doc),
      definitions: definitions(),
      revision: 3,
    });

    expect(snapshot.itemById.get(flashcardId)?.children.map(({ id }) => id)).toEqual([
      firstCardId,
      secondCardId,
    ]);
    expect(snapshot.itemById.get(firstCardId)).toMatchObject({
      kind: "published-child",
      label: "Card 1",
    });
    expect(snapshot.itemById.get(secondCardId)?.label).toBe("Card 2");
    expect(snapshot.itemById.get(firstCardId)?.children.map(({ id }) => id)).toEqual([
      firstFrontId,
      firstBackId,
    ]);
    expect(snapshot.itemById.get(firstFrontId)?.label).toBe("Front");
    expect(snapshot.itemById.get(firstBackId)?.label).toBe("Back");
    expect(snapshot.itemById.get(firstFrontId)?.children.map(({ id }) => id)).toEqual([
      frontParagraphId,
    ]);
    expect(snapshot.itemById.get(firstBackId)?.children.map(({ id }) => id)).toEqual([
      emptyBackParagraphId,
      nestedBlockId,
    ]);
    expect(snapshot.itemById.get(emptyBackParagraphId)?.label).toBe("Paragraph");
    expect(snapshot.itemById.get(nestedBlockId)).toMatchObject({
      kind: "block",
      label: "Nested block",
    });
    expect(snapshot.itemById.get(nestedBlockId)?.children.map(({ id }) => id)).toEqual([
      nestedParagraphId,
    ]);

    const cardActivation = [{ ownerId: flashcardId, childId: firstCardId, ownerKind: "block" }];
    const backActivation = [
      ...cardActivation,
      { ownerId: flashcardId, childId: firstBackId, ownerKind: "block" },
    ];
    expect(snapshot.locationById.get(firstCardId)?.activationPath).toEqual(cardActivation);
    expect(snapshot.locationById.get(firstBackId)?.activationPath).toEqual(backActivation);
    expect(snapshot.locationById.get(nestedBlockId)?.activationPath).toEqual(backActivation);
    expect(snapshot.locationById.get(nestedParagraphId)?.activationPath).toEqual(backActivation);
    expect([...snapshot.itemById.keys()].filter((id) => id === nestedBlockId)).toHaveLength(1);
    expect(snapshot.diagnostics).toEqual([]);
  });
});

function card(input: {
  readonly id: EmbeddedNodeId;
  readonly frontId: EmbeddedNodeId;
  readonly backId: EmbeddedNodeId;
  readonly front: readonly ProseMirrorNode[];
  readonly back: readonly ProseMirrorNode[];
}): ProseMirrorNode {
  return schema.node(FLASHCARD_CARD_NODE, { id: input.id }, [
    schema.node(FLASHCARD_CARD_FRONT_NODE, { id: input.frontId }, input.front),
    schema.node(FLASHCARD_CARD_BACK_NODE, { id: input.backId }, input.back),
  ]);
}

function documentNode(flashcard: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [flashcard]),
      ]),
    ]),
  ]);
}

function paragraph(nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node("paragraph", { id: nodeId }, text ? [schema.text(text)] : []);
}

function definitions(): SemanticDefinitionLookup {
  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) => {
        if (nodeType === FLASHCARD_NODE) {
          return {
            nodeType,
            title: flashcardBlockDefinition.title,
            isAssessment: false,
            ...(flashcardBlockDefinition.documentSemantics
              ? { documentSemantics: flashcardBlockDefinition.documentSemantics }
              : {}),
          };
        }
        return nodeType === "nested_block"
          ? {
              nodeType,
              title: "Nested block",
              isAssessment: false,
              documentSemantics: {
                projectChildren: ({ helpers }: SemanticChildProjectionInput) =>
                  helpers.projectStandardRichText(),
              },
            }
          : undefined;
      },
    }),
    layouts: Object.freeze({ get: () => undefined }),
    surfaces: Object.freeze({
      get: (variant: string) => {
        const definition = builtInSurfaceVariantRegistry.get(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentSemantics
                ? { documentSemantics: definition.documentSemantics }
                : {}),
            }
          : undefined;
      },
    }),
  });
}

function requireCourseStructure(doc: ProseMirrorNode): ProjectedCourseStructure {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid Flashcard semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
