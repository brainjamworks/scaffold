import { describe, expect, it } from "vite-plus/test";

import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { DocumentTreeSnapshot } from "./document-tree-snapshot";
import {
  APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES,
  DOCUMENT_TREE_LIFECYCLE_APPLICATION,
  projectDocumentTreeLifecycleDocument,
  requireDocumentTreeLifecycleNodeById,
} from "@/composition/application/testing/document-tree-lifecycle-fixtures";

describe("document tree exposure lifecycle", () => {
  it("enumerates the exact mounted approved member-family matrix", () => {
    expect(APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.map(({ key }) => key)).toEqual([
      "annotated-figure-annotations",
      "flashcard-cards",
      "gallery-items",
      "checklist-items",
      "comparison-rows",
      "glossary-entries",
      "key-value-rows",
      "numbered-list-items",
      "table-rows",
      "process-flow-steps",
      "roadmap-milestones",
      "timeline-entries",
    ]);

    const mountedProjectors =
      DOCUMENT_TREE_LIFECYCLE_APPLICATION.capabilities.blocks.registry.definitions
        .filter(({ documentTree }) => documentTree?.projectChildren !== undefined)
        .map(({ nodeType }) => nodeType)
        .sort();
    expect(
      APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.map(({ ownerNodeType }) => ownerNodeType).sort(),
    ).toEqual(mountedProjectors);
  });

  it.each(APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES)(
    "$label projects persisted owner/member identities through the mounted composition",
    (family) => {
      const doc = family.createDocument();
      const snapshot = projectDocumentTreeLifecycleDocument(doc, 1);

      expect(snapshot.diagnostics).toEqual([]);
      expect(requireDocumentTreeLifecycleNodeById(doc, family.ownerId).node.type.name).toBe(
        family.ownerNodeType,
      );
      expect(childIds(snapshot, family.ownerId)).toEqual([
        family.memberIds.first,
        family.memberIds.second,
      ]);
      expect(snapshot.itemById.get(family.ownerId)).toMatchObject({
        id: family.ownerId,
        kind: "block",
        nodeType: family.ownerNodeType,
      });

      for (const [ordinal, memberId] of [
        family.memberIds.first,
        family.memberIds.second,
      ].entries()) {
        const persisted = requireDocumentTreeLifecycleNodeById(doc, memberId);
        expect(persisted.node.type.name).toBe(family.memberNodeType);
        expect(snapshot.itemById.get(memberId)).toMatchObject({
          id: memberId,
          kind: "exposed-child",
          nodeType: family.memberNodeType,
          label: `${family.labelPrefix} ${ordinal + 1}`,
        });
        expect(snapshot.parentById.get(memberId)).toBe(family.ownerId);
        expect(snapshot.locationById.get(memberId)).toMatchObject({
          id: memberId,
          nodeType: family.memberNodeType,
          from: persisted.pos,
          to: persisted.pos + persisted.node.nodeSize,
        });
      }

      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.roots)).toBe(true);
      expect(Object.isFrozen(snapshot.itemById)).toBe(true);
      expect(Object.isFrozen(snapshot.parentById)).toBe(true);
      expect(Object.isFrozen(snapshot.locationById)).toBe(true);
      expect(Object.isFrozen(snapshot.locationById.get(family.memberIds.first))).toBe(true);
    },
  );

  it.each(APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES)(
    "$label preserves surviving identity and recomputes current order/location",
    (family) => {
      const baselineDoc = family.createDocument();
      const baseline = projectDocumentTreeLifecycleDocument(baselineDoc, 10);
      const baselineFirstLocation = baseline.locationById.get(family.memberIds.first);

      const addedDoc = family.createDocument({ members: ["first", "second", "added"] });
      const added = projectDocumentTreeLifecycleDocument(addedDoc, 11);
      expectCurrentFamily(addedDoc, added, family.ownerId, [
        family.memberIds.first,
        family.memberIds.second,
        family.memberIds.added,
      ]);
      expect(added.parentById.get(family.memberIds.first)).toBe(family.ownerId);
      expect(added.parentById.get(family.memberIds.second)).toBe(family.ownerId);

      const deletedDoc = family.createDocument({ members: ["first"] });
      const deleted = projectDocumentTreeLifecycleDocument(deletedDoc, 12);
      expectCurrentFamily(deletedDoc, deleted, family.ownerId, [family.memberIds.first]);
      expect(deleted.itemById.has(family.memberIds.second)).toBe(false);
      expect(deleted.parentById.has(family.memberIds.second)).toBe(false);
      expect(deleted.locationById.has(family.memberIds.second)).toBe(false);

      const reorderedDoc = family.createDocument({ members: ["second", "first"] });
      const reordered = projectDocumentTreeLifecycleDocument(reorderedDoc, 13);
      expectCurrentFamily(reorderedDoc, reordered, family.ownerId, [
        family.memberIds.second,
        family.memberIds.first,
      ]);
      expect(reordered.itemById.get(family.memberIds.second)?.label).toBe(
        `${family.labelPrefix} 1`,
      );
      expect(reordered.itemById.get(family.memberIds.first)?.label).toBe(`${family.labelPrefix} 2`);

      const movedDoc = family.createDocument({ ownerPosition: "after-sibling" });
      const moved = projectDocumentTreeLifecycleDocument(movedDoc, 14);
      expectCurrentFamily(movedDoc, moved, family.ownerId, [
        family.memberIds.first,
        family.memberIds.second,
      ]);
      expect(moved.locationById.get(family.ownerId)?.from).toBeGreaterThan(
        baseline.locationById.get(family.ownerId)?.from ?? Number.MAX_SAFE_INTEGER,
      );
      expect(moved.locationById.get(family.memberIds.first)?.from).toBeGreaterThan(
        baselineFirstLocation?.from ?? Number.MAX_SAFE_INTEGER,
      );
      expect(moved.locationById.get(family.memberIds.first)).not.toBe(baselineFirstLocation);
      expect(moved.itemById.get(family.memberIds.first)).not.toBe(
        baseline.itemById.get(family.memberIds.first),
      );
      expect(moved.parentById.get(family.memberIds.first)).toBe(family.ownerId);
      expect(moved.itemById.has(family.unrelatedSiblingId)).toBe(true);
      expect(moved.diagnostics).toEqual([]);

      for (const snapshot of [baseline, added, deleted, reordered, moved]) {
        expect(snapshot.parentById.get(family.unrelatedSiblingId)).toBe(
          family.unrelatedSiblingLayerId,
        );
        expect(snapshot.parentById.get(family.unrelatedSiblingLayerId)).toBe(
          family.unrelatedSiblingRegionId,
        );
      }
    },
  );
});

function childIds(
  snapshot: DocumentTreeSnapshot,
  ownerId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  return snapshot.itemById.get(ownerId)?.children.map(({ id }) => id) ?? [];
}

function expectCurrentFamily(
  doc: Parameters<typeof requireDocumentTreeLifecycleNodeById>[0],
  snapshot: DocumentTreeSnapshot,
  ownerId: EmbeddedNodeId,
  expectedMemberIds: readonly EmbeddedNodeId[],
): void {
  expect(snapshot.revision).toBeGreaterThan(0);
  expect(snapshot.diagnostics).toEqual([]);
  expect(childIds(snapshot, ownerId)).toEqual(expectedMemberIds);
  for (const memberId of expectedMemberIds) {
    const current = requireDocumentTreeLifecycleNodeById(doc, memberId);
    expect(snapshot.itemById.get(memberId)?.id).toBe(current.node.attrs["id"]);
    expect(snapshot.parentById.get(memberId)).toBe(ownerId);
    expect(snapshot.locationById.get(memberId)).toMatchObject({
      id: memberId,
      from: current.pos,
      to: current.pos + current.node.nodeSize,
    });
  }
}
