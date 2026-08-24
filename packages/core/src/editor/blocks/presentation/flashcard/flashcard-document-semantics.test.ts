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
  it("publishes cards with persisted identity and privacy-safe ordinal labels", () => {
    const flashcardId = makeId("fl", 1);
    const firstCardId = makeId("ca", 1);
    const firstFrontId = makeId("fr", 1);
    const firstBackId = makeId("ba", 1);
    const frontParagraphId = makeId("pa", 1);
    const backParagraphId = makeId("pa", 2);
    const nestedBlockId = makeId("nb", 1);
    const nestedParagraphId = makeId("pa", 3);
    const secondCardId = makeId("ca", 2);
    const secondFrontId = makeId("fr", 2);
    const secondBackId = makeId("ba", 2);
    const secondFrontParagraphId = makeId("pa", 4);
    const secondBackParagraphId = makeId("pa", 5);
    const repeatedPrivateProse = "Repeated private face prose";
    const longPrivateProse = `Private ${"face content ".repeat(40)}`;
    const firstCard = card({
      id: firstCardId,
      frontId: firstFrontId,
      backId: firstBackId,
      front: [paragraph(frontParagraphId, repeatedPrivateProse)],
      back: [
        paragraph(backParagraphId, longPrivateProse),
        schema.node("nested_block", { id: nestedBlockId }, [
          paragraph(nestedParagraphId, "Private nested Block prose"),
        ]),
      ],
    });
    const secondCard = card({
      id: secondCardId,
      frontId: secondFrontId,
      backId: secondBackId,
      front: [paragraph(secondFrontParagraphId, repeatedPrivateProse)],
      back: [paragraph(secondBackParagraphId, "")],
    });
    const flashcard = schema.node(FLASHCARD_NODE, { id: flashcardId }, [firstCard, secondCard]);
    const doc = documentNode(flashcard);
    const snapshot = projectSemanticDocument({
      doc,
      courseStructure: requireCourseStructure(doc),
      definitions: definitions(),
      revision: 3,
    });

    expect(flashcardBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(flashcardId)).toMatchObject({
      kind: "block",
      label: "Flashcards",
      children: [{ id: firstCardId }, { id: secondCardId }],
    });
    for (const [index, cardId] of [firstCardId, secondCardId].entries()) {
      expect(snapshot.itemById.get(cardId)).toMatchObject({
        id: cardId,
        kind: "published-child",
        nodeType: FLASHCARD_CARD_NODE,
        label: `Card ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(cardId)).toBe(flashcardId);
      const current = requireNodeById(doc, cardId);
      expect(snapshot.locationById.get(cardId)).toMatchObject({
        id: cardId,
        nodeType: FLASHCARD_CARD_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "node", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: flashcardId,
        activationPath: [],
      });
    }
    const privateIds = [
      firstFrontId,
      firstBackId,
      frontParagraphId,
      backParagraphId,
      nestedBlockId,
      nestedParagraphId,
      secondFrontId,
      secondBackId,
      secondFrontParagraphId,
      secondBackParagraphId,
    ];
    for (const privateId of privateIds) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
      expect(
        snapshot.itemById
          .get(flashcardId)
          ?.children.some(({ id }) => id === privateId),
      ).toBe(false);
    }
    const publicDescriptions = [...snapshot.itemById.values()].map(({ label, summary }) => ({
      label,
      summary,
    }));
    const privacyBoundary = JSON.stringify({ publicDescriptions, diagnostics: snapshot.diagnostics });
    expect(privacyBoundary).not.toContain(repeatedPrivateProse);
    expect(privacyBoundary).not.toContain(longPrivateProse);
    expect(privacyBoundary).not.toContain("Private nested Block prose");
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects card additions, removals and reorder by persisted identity", () => {
    const flashcardId = makeId("fl", 2);
    const first = simpleCard(makeId("ca", 3), 3);
    const second = simpleCard(makeId("ca", 4), 4);
    const third = simpleCard(makeId("ca", 5), 5);
    const initial = projectCards(flashcardId, [first, second], 5);
    const added = projectCards(flashcardId, [first, second, third], 6);
    const changed = projectCards(flashcardId, [third, first], 7);

    expect(childIds(initial.snapshot, flashcardId)).toEqual([makeId("ca", 3), makeId("ca", 4)]);
    expect(childIds(added.snapshot, flashcardId)).toEqual([
      makeId("ca", 3),
      makeId("ca", 4),
      makeId("ca", 5),
    ]);
    expect(childIds(changed.snapshot, flashcardId)).toEqual([makeId("ca", 5), makeId("ca", 3)]);
    expect(changed.snapshot.itemById.has(makeId("ca", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("ca", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("ca", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("ca", 5))?.label).toBe("Card 1");
    expect(changed.snapshot.itemById.get(makeId("ca", 3))?.label).toBe("Card 2");
    for (const cardId of [makeId("ca", 5), makeId("ca", 3)]) {
      expect(changed.snapshot.itemById.get(cardId)?.id).toBe(cardId);
      expect(changed.snapshot.locationById.get(cardId)?.from).toBe(
        requireNodeById(changed.doc, cardId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });
});

function simpleCard(id: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return card({
    id,
    frontId: makeId("fr", ordinal),
    backId: makeId("ba", ordinal),
    front: [paragraph(makeId("pf", ordinal), `Private question ${ordinal}`)],
    back: [paragraph(makeId("pb", ordinal), `Private answer ${ordinal}`)],
  });
}

function projectCards(
  flashcardId: EmbeddedNodeId,
  cards: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(schema.node(FLASHCARD_NODE, { id: flashcardId }, cards));
  return {
    doc,
    snapshot: projectSemanticDocument({
      doc,
      courseStructure: requireCourseStructure(doc),
      definitions: definitions(),
      revision,
    }),
  };
}

function childIds(
  snapshot: ReturnType<typeof projectSemanticDocument>,
  ownerId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  return snapshot.itemById.get(ownerId)?.children.map(({ id }) => id) ?? [];
}

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

function requireNodeById(
  doc: ProseMirrorNode,
  id: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let found: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`Expected node ${id}.`);
  return found;
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
