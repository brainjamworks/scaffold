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
  it("publishes only the Flashcard root while keeping every descendant private", () => {
    expect(flashcardBlockDefinition.documentSemantics).toBeUndefined();

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
    const firstCard = card({
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
    });
    const secondCard = card({
      id: secondCardId,
      frontId: secondFrontId,
      backId: secondBackId,
      front: [paragraph(makeId("pa", 4), "Second question")],
      back: [paragraph(makeId("pa", 5), "Second answer")],
    });
    const flashcard = schema.node(FLASHCARD_NODE, { id: flashcardId }, [firstCard, secondCard]);
    const doc = documentNode(flashcard);
    const snapshot = projectSemanticDocument({
      doc,
      courseStructure: requireCourseStructure(doc),
      definitions: definitions(),
      revision: 3,
    });
    const reorderedDoc = documentNode(
      schema.node(FLASHCARD_NODE, { id: flashcardId }, [secondCard, firstCard]),
    );
    const reorderedSnapshot = projectSemanticDocument({
      doc: reorderedDoc,
      courseStructure: requireCourseStructure(reorderedDoc),
      definitions: definitions(),
      revision: 4,
    });

    for (const current of [snapshot, reorderedSnapshot]) {
      expect(current.itemById.get(flashcardId)).toMatchObject({
        kind: "block",
        label: "Flashcards",
        children: [],
      });
      expect(current.locationById.get(flashcardId)?.activationPath).toEqual([]);
      expect(current.locationById.get(flashcardId)?.authoringAnchorId).toBeNull();
      for (const privateId of [
        firstCardId,
        firstFrontId,
        firstBackId,
        frontParagraphId,
        emptyBackParagraphId,
        nestedBlockId,
        nestedParagraphId,
        secondCardId,
        secondFrontId,
        secondBackId,
        makeId("pa", 4),
        makeId("pa", 5),
      ]) {
        expect(current.itemById.has(privateId)).toBe(false);
        expect(current.locationById.has(privateId)).toBe(false);
      }
      expect(current.diagnostics).toEqual([]);
    }
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
