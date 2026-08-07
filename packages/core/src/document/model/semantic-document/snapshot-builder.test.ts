import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { SemanticProjectionDiagnostic } from "./projection-diagnostic";
import {
  SemanticSnapshotBuildError,
  createSemanticSnapshotBuilder,
  type SemanticSnapshotItemInput,
} from "./snapshot-builder";

const ROOT_ID = EmbeddedNodeIdSchema.parse("surface00001");
const CHILD_ID = EmbeddedNodeIdSchema.parse("block0000001");

describe("semantic snapshot builder", () => {
  it("builds exact root and child inverse indexes", () => {
    const builder = createSemanticSnapshotBuilder({ revision: 7, mode: "page" });

    builder.addItem({
      item: item(ROOT_ID, "surface", "surface", "Page"),
      parentId: null,
      location: location(ROOT_ID, "surface", 1, 20, { kind: "node", pos: 1 }, ROOT_ID),
    });
    builder.addItem({
      item: item(CHILD_ID, "block", "host_card", "Card"),
      parentId: ROOT_ID,
      location: location(CHILD_ID, "host_card", 2, 8, { kind: "node", pos: 2 }, ROOT_ID),
    });

    const snapshot = builder.build();

    expect(snapshot.roots.map(({ id }) => id)).toEqual([ROOT_ID]);
    expect(snapshot.roots[0]?.children.map(({ id }) => id)).toEqual([CHILD_ID]);
    expect(snapshot.itemById.get(CHILD_ID)).toBe(snapshot.roots[0]?.children[0]);
    expect(snapshot.parentById.get(ROOT_ID)).toBeNull();
    expect(snapshot.parentById.get(CHILD_ID)).toBe(ROOT_ID);
    expect(snapshot.locationById.get(CHILD_ID)?.surfaceId).toBe(ROOT_ID);
  });

  it("rejects duplicate item IDs", () => {
    const builder = createSemanticSnapshotBuilder({ revision: 1, mode: "page" });
    const input = {
      item: item(ROOT_ID, "surface", "surface", "Page"),
      parentId: null,
      location: location(ROOT_ID, "surface", 1, 20, { kind: "node", pos: 1 }, ROOT_ID),
    } as const;

    builder.addItem(input);

    expect(() => builder.addItem(input)).toThrowError(
      expect.objectContaining({ code: "duplicate-item-id", itemId: ROOT_ID }),
    );
  });

  it("rejects cycles and missing parent edges", () => {
    const cycle = createSemanticSnapshotBuilder({ revision: 1, mode: "page" });
    cycle.addItem({
      item: item(ROOT_ID, "surface", "surface", "Page"),
      parentId: CHILD_ID,
      location: location(ROOT_ID, "surface", 1, 20, { kind: "node", pos: 1 }, ROOT_ID),
    });
    cycle.addItem({
      item: item(CHILD_ID, "block", "host_card", "Card"),
      parentId: ROOT_ID,
      location: location(CHILD_ID, "host_card", 2, 8, { kind: "node", pos: 2 }, ROOT_ID),
    });

    expect(() => cycle.build()).toThrowError(
      expect.objectContaining({ code: "cyclic-parent-edge" }),
    );

    const missingParent = createSemanticSnapshotBuilder({ revision: 1, mode: "page" });
    missingParent.addItem({
      item: item(CHILD_ID, "block", "host_card", "Card"),
      parentId: ROOT_ID,
      location: location(CHILD_ID, "host_card", 2, 8, { kind: "node", pos: 2 }, ROOT_ID),
    });

    expect(() => missingParent.build()).toThrowError(
      expect.objectContaining({ code: "missing-parent", itemId: CHILD_ID }),
    );
  });

  it("rejects invalid ranges and selection targets", () => {
    const builder = createSemanticSnapshotBuilder({ revision: 1, mode: "page" });
    builder.addItem({
      item: item(ROOT_ID, "surface", "surface", "Page"),
      parentId: null,
      location: location(ROOT_ID, "surface", 5, 10, { kind: "text", from: 4, to: 7 }, ROOT_ID),
    });

    expect(() => builder.build()).toThrowError(
      expect.objectContaining({ code: "invalid-selection-target", itemId: ROOT_ID }),
    );
  });

  it("deeply freezes items, locations, diagnostics, arrays and read-only indexes", () => {
    const builder = createSemanticSnapshotBuilder({ revision: 3, mode: "slideshow" });
    const diagnostic = {
      code: "definition-callback-failed",
      ownerId: ROOT_ID,
      candidateId: null,
      ownerNodeType: "surface",
      candidateNodeType: null,
    } satisfies SemanticProjectionDiagnostic;

    builder.addItem({
      item: item(ROOT_ID, "surface", "surface", "Slide"),
      parentId: null,
      location: {
        ...location(ROOT_ID, "surface", 1, 20, { kind: "near", pos: 1 }, ROOT_ID),
        activationPath: [{ ownerId: ROOT_ID, childId: CHILD_ID, ownerKind: "surface" as const }],
      },
    });
    builder.addDiagnostic(diagnostic);

    const snapshot = builder.build();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.roots)).toBe(true);
    expect(Object.isFrozen(snapshot.roots[0])).toBe(true);
    expect(Object.isFrozen(snapshot.roots[0]?.presentation)).toBe(true);
    expect(Object.isFrozen(snapshot.roots[0]?.presentation.actionIds)).toBe(true);
    expect(Object.isFrozen(snapshot.locationById.get(ROOT_ID))).toBe(true);
    expect(Object.isFrozen(snapshot.locationById.get(ROOT_ID)?.activationPath)).toBe(true);
    expect(Object.isFrozen(snapshot.diagnostics)).toBe(true);
    expect(Object.isFrozen(snapshot.diagnostics[0])).toBe(true);
    expect(snapshot.itemById).not.toHaveProperty("set");
    expect(snapshot.parentById).not.toHaveProperty("delete");
    expect(() => (snapshot.roots as unknown as unknown[]).push("mutable")).toThrow();
  });

  it("uses a typed checked failure for malformed item identities", () => {
    const builder = createSemanticSnapshotBuilder({ revision: 1, mode: "page" });

    expect(() =>
      builder.addItem({
        item: item("invalid" as EmbeddedNodeId, "surface", "surface", "Page"),
        parentId: null,
        location: location(
          "invalid" as EmbeddedNodeId,
          "surface",
          1,
          20,
          { kind: "node", pos: 1 },
          null,
        ),
      }),
    ).toThrowError(SemanticSnapshotBuildError);
  });
});

function item(
  id: EmbeddedNodeId,
  kind: SemanticSnapshotItemInput["kind"],
  nodeType: string,
  label: string,
): SemanticSnapshotItemInput {
  return {
    id,
    kind,
    nodeType,
    definitionId: kind === "surface" ? "page-default" : nodeType,
    label,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
  };
}

function location(
  id: EmbeddedNodeId,
  nodeType: string,
  from: number,
  to: number,
  selectionTarget:
    | { readonly kind: "node"; readonly pos: number }
    | { readonly kind: "text"; readonly from: number; readonly to: number }
    | { readonly kind: "near"; readonly pos: number },
  surfaceId: EmbeddedNodeId | null,
) {
  return {
    id,
    nodeType,
    from,
    to,
    selectionTarget,
    surfaceId,
    activationPath: [],
  } as const;
}
