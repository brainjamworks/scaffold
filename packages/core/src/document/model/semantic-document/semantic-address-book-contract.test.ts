import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { MAX_SEMANTIC_LABEL_LENGTH } from "./semantic-labels";
import type { SemanticDocumentSnapshot, SemanticItem } from "./semantic-document-snapshot";
import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_APPLICATION,
  createCompleteSemanticLifecycleDocument,
  projectSemanticLifecycleDocument,
  requireLifecycleNodeById,
} from "@/composition/application/testing/semantic-publication-lifecycle-fixtures";

const SEMANTIC_ITEM_KEYS = [
  "children",
  "definitionId",
  "id",
  "kind",
  "label",
  "nodeType",
  "presentation",
  "presentationContainer",
  "summary",
] as const;

const BLOCK_MEMBER_INTERACTION_BY_OWNER_TYPE = new Map<string, "activation" | "anchor-only">([
  ["annotated_figure", "activation"],
  ["flashcard", "activation"],
  ["gallery", "activation"],
  ["checklist", "anchor-only"],
  ["comparison", "anchor-only"],
  ["glossary", "anchor-only"],
  ["key_value_list", "anchor-only"],
  ["numbered_list", "anchor-only"],
  ["table", "anchor-only"],
  ["process_flow", "activation"],
  ["roadmap", "activation"],
  ["timeline", "activation"],
]);
const VISUAL_MEMBER_OWNER_TYPES = new Set(["annotated_figure", "gallery"]);
const VISUAL_ACTION_IDS = ["reveal", "hide", "emphasize"] as const;

describe("semantic presentation address book", () => {
  it("publishes the complete twelve-family hierarchy with exact persisted addresses", () => {
    const doc = createCompleteSemanticLifecycleDocument();
    const snapshot = projectSemanticLifecycleDocument(doc, 15);
    const surface = requireOnlyNodeOfType(doc, "surface");
    const region = requireOnlyNodeOfType(doc, "region");
    const expectedItemIds = new Set<EmbeddedNodeId>([surface.id, region.id]);

    expect(snapshot.revision).toBe(15);
    expect(snapshot.mode).toBe("page");
    expect(snapshot.roots.map(({ id }) => id)).toEqual([surface.id]);
    expect(childIds(snapshot, surface.id)).toEqual([region.id]);
    expect(childIds(snapshot, region.id)).toEqual(
      APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.map(({ ownerId }) => ownerId),
    );
    expect(new Set(BLOCK_MEMBER_INTERACTION_BY_OWNER_TYPE.keys())).toEqual(
      new Set(APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.map(({ ownerNodeType }) => ownerNodeType)),
    );
    expect(snapshot.diagnostics).toEqual([]);

    for (const family of APPROVED_SEMANTIC_MEMBER_FAMILY_CASES) {
      const definition = SEMANTIC_LIFECYCLE_APPLICATION.capabilities.blocks.registry.getByNodeType(
        family.ownerNodeType,
      );
      if (!definition) throw new Error(`Missing mounted definition for ${family.ownerNodeType}.`);
      const persistedOwner = requireLifecycleNodeById(doc, family.ownerId);
      const expectedOwnerLabel =
        family.ownerNodeType === "annotated_figure" ? "Annotated figure" : definition.title;

      expectedItemIds.add(family.ownerId);
      expect(countNodesOfType(doc, family.ownerNodeType)).toBe(1);
      expect(snapshot.itemById.get(family.ownerId)).toMatchObject({
        id: family.ownerId,
        kind: "block",
        nodeType: family.ownerNodeType,
        definitionId: family.ownerNodeType,
        label: expectedOwnerLabel,
        summary: null,
      });
      expect(snapshot.parentById.get(family.ownerId)).toBe(region.id);
      expect(snapshot.locationById.get(family.ownerId)).toMatchObject({
        id: family.ownerId,
        nodeType: family.ownerNodeType,
        from: persistedOwner.pos,
        to: persistedOwner.pos + persistedOwner.node.nodeSize,
        surfaceId: surface.id,
        authoringAnchorId: null,
        activationPath: [],
      });
      expect(childIds(snapshot, family.ownerId)).toEqual([
        family.memberIds.first,
        family.memberIds.second,
      ]);

      for (const [ordinal, memberId] of [
        family.memberIds.first,
        family.memberIds.second,
      ].entries()) {
        const persistedMember = requireLifecycleNodeById(doc, memberId);
        const item = requireItem(snapshot, memberId);
        const interaction = BLOCK_MEMBER_INTERACTION_BY_OWNER_TYPE.get(family.ownerNodeType);
        if (!interaction) {
          throw new Error(`Missing interaction classification for ${family.ownerNodeType}.`);
        }
        const expectedActivationPath =
          interaction === "activation"
            ? [{ ownerId: family.ownerId, childId: memberId, ownerKind: "block" }]
            : [];

        expectedItemIds.add(memberId);
        expect(item).toEqual({
          id: memberId,
          kind: "published-child",
          nodeType: family.memberNodeType,
          definitionId: family.ownerNodeType,
          label: `${family.labelPrefix} ${ordinal + 1}`,
          summary: null,
          presentation: {
            actionIds: VISUAL_MEMBER_OWNER_TYPES.has(family.ownerNodeType)
              ? VISUAL_ACTION_IDS
              : [],
            disabledReason: null,
          },
          presentationContainer: null,
          children: [],
        });
        expect(item.label.length).toBeLessThanOrEqual(MAX_SEMANTIC_LABEL_LENGTH);
        expect(snapshot.parentById.get(memberId)).toBe(family.ownerId);
        expect(snapshot.locationById.get(memberId)).toMatchObject({
          id: memberId,
          nodeType: family.memberNodeType,
          from: persistedMember.pos,
          to: persistedMember.pos + persistedMember.node.nodeSize,
          surfaceId: surface.id,
          authoringAnchorId: family.ownerId,
          activationPath: expectedActivationPath,
        });
        expect(Object.keys(item).sort()).toEqual(SEMANTIC_ITEM_KEYS);
      }
    }

    expect(new Set(snapshot.itemById.keys())).toEqual(expectedItemIds);
    expect(new Set(snapshot.parentById.keys())).toEqual(expectedItemIds);
    expect(new Set(snapshot.locationById.keys())).toEqual(expectedItemIds);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.itemById)).toBe(true);
  });

  it("keeps every genuinely persisted feature-private descendant out of public state", () => {
    const doc = createCompleteSemanticLifecycleDocument();
    const snapshot = projectSemanticLifecycleDocument(doc, 16);
    const publicChildIds = new Set(
      [...snapshot.itemById.values()].flatMap(({ children }) => children.map(({ id }) => id)),
    );
    const descriptions = JSON.stringify(
      [...snapshot.itemById.values()].map(({ label, summary }) => ({ label, summary })),
    );
    const diagnostics = JSON.stringify(snapshot.diagnostics);

    for (const family of APPROVED_SEMANTIC_MEMBER_FAMILY_CASES) {
      for (const privateId of family.privateDescendantIds) {
        expect(requireLifecycleNodeById(doc, privateId).node.attrs["id"]).toBe(privateId);
        expect(snapshot.itemById.has(privateId)).toBe(false);
        expect(snapshot.parentById.has(privateId)).toBe(false);
        expect(snapshot.locationById.has(privateId)).toBe(false);
        expect(publicChildIds.has(privateId)).toBe(false);
        expect(descriptions).not.toContain(privateId);
        expect(diagnostics).not.toContain(privateId);
      }
    }
  });

  it("grants visual actions only to mounted presentation-member families", () => {
    const snapshot = projectSemanticLifecycleDocument(
      createCompleteSemanticLifecycleDocument(),
      17,
    );
    const forbiddenFields = [
      "actions",
      "actor",
      "commands",
      "compiler",
      "duration",
      "events",
      "learnerState",
      "playback",
      "state",
      "timing",
    ];

    for (const family of APPROVED_SEMANTIC_MEMBER_FAMILY_CASES) {
      for (const memberId of [family.memberIds.first, family.memberIds.second]) {
        const item = requireItem(snapshot, memberId);
        expect(item.presentation).toEqual({
          actionIds: VISUAL_MEMBER_OWNER_TYPES.has(family.ownerNodeType)
            ? VISUAL_ACTION_IDS
            : [],
          disabledReason: null,
        });
        for (const field of forbiddenFields) expect(item).not.toHaveProperty(field);
      }
    }
  });
});

function requireItem(snapshot: SemanticDocumentSnapshot, id: EmbeddedNodeId): SemanticItem {
  const item = snapshot.itemById.get(id);
  if (!item) throw new Error(`Missing semantic item ${id}.`);
  return item;
}

function childIds(
  snapshot: SemanticDocumentSnapshot,
  ownerId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  return requireItem(snapshot, ownerId).children.map(({ id }) => id);
}

function requireOnlyNodeOfType(
  doc: ProseMirrorNode,
  nodeType: string,
): { readonly id: EmbeddedNodeId; readonly node: ProseMirrorNode; readonly pos: number } {
  const matches: Array<{
    readonly id: EmbeddedNodeId;
    readonly node: ProseMirrorNode;
    readonly pos: number;
  }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name === nodeType) {
      matches.push({ id: node.attrs["id"] as EmbeddedNodeId, node, pos });
    }
    return true;
  });
  if (matches.length !== 1)
    throw new Error(`Expected one ${nodeType}, received ${matches.length}.`);
  return matches[0]!;
}

function countNodesOfType(doc: ProseMirrorNode, nodeType: string): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === nodeType) count += 1;
    return true;
  });
  return count;
}
