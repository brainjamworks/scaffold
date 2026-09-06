// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  createDocumentTreeSnapshotBuilder,
  type DocumentTreeSnapshotItemInput,
} from "@/document/model/document-tree/document-tree-snapshot-builder";
import type { DocumentItemLocation } from "@/document/model/document-tree/document-item-location";
import { CONTENT_LAYOUT_ATTR } from "../model/content-layout-attribute";
import {
  ContentLayoutProjectionExtension,
  clearContentLayoutProjectionMeta,
  readContentLayoutProjectionDecorations,
  readContentLayoutProjectionDiagnostics,
  setContentLayoutProjectionBatchMeta,
  type ContentLayoutProjectionBatch,
} from "./content-layout-projection-extension";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const TestDocumentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "containerLike+",
});

const TestContainerNode = Node.create({
  name: "container",
  group: "containerLike",
  content: "child*",

  addAttributes() {
    return {
      id: { default: null },
      [CONTENT_LAYOUT_ATTR]: { default: SEQUENCE },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", HTMLAttributes, 0];
  },
});

const TestAlternateContainerNode = Node.create({
  name: "alternateContainer",
  group: "containerLike",
  content: "child*",

  addAttributes() {
    return {
      id: { default: null },
      [CONTENT_LAYOUT_ATTR]: { default: SEQUENCE },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", HTMLAttributes, 0];
  },
});

const TestChildNode = Node.create({
  name: "child",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

interface DocumentContainerFixture {
  readonly containerId: EmbeddedNodeId;
  readonly childIds: readonly EmbeddedNodeId[];
  readonly containerPos: number;
  readonly childPositions: readonly number[];
}

interface ProjectionContainerSpec {
  readonly containerId: EmbeddedNodeId;
  readonly contentLayout: PresentationContentLayout;
  readonly directChildIds: readonly EmbeddedNodeId[];
  readonly activeChildId: EmbeddedNodeId | null;
}

describe("ContentLayoutProjectionExtension", () => {
  it("does not decorate Flow or an empty Sequence", () => {
    const flowContainerId = id("region000001");
    const emptyContainerId = id("region000002");
    const emptyFlowContainerId = id("region000003");
    const childIds = [id("block0000001"), id("block0000002")] as const;
    const document = createEditorDocument([
      { containerId: flowContainerId, childIds, contentLayout: FLOW },
      { containerId: emptyFlowContainerId, childIds: [], contentLayout: FLOW },
      { containerId: emptyContainerId, childIds: [], contentLayout: SEQUENCE },
    ]);
    const editor = createEditor(document);

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId: flowContainerId,
          contentLayout: FLOW,
          directChildIds: childIds,
          activeChildId: null,
        },
        {
          containerId: emptyFlowContainerId,
          contentLayout: FLOW,
          directChildIds: [],
          activeChildId: null,
        },
        {
          containerId: emptyContainerId,
          contentLayout: SEQUENCE,
          directChildIds: [],
          activeChildId: null,
        },
      ]);
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("decorates a valid Sequence at snapshot-owned positions in source order", () => {
    const containerId = id("region000001");
    const childIds = [id("block0000001"), id("block0000002"), id("block0000003")] as const;
    const editor = createEditor(createEditorDocument([{ containerId, childIds }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: childIds,
          activeChildId: childIds[1],
        },
      ]);
      const state = applyBatch(editor.state, batch);
      const decorations = cachedDecorations(state);

      expect(decorations.map(({ from, to }) => [from, to])).toEqual(
        fixture[0]!.childPositions.map((position) => [position, position + 1]),
      );
      expect(decorations.map((decoration) => decoration.spec)).toEqual(
        childIds.map((childId, index) => ({
          containerId,
          state: {
            childId,
            availability: index === 1 ? "available" : "withheld",
            layoutParticipation: "shared-position",
            interaction: index === 1 ? "enabled" : "inert",
            accessibility: index === 1 ? "exposed" : "hidden",
          },
        })),
      );
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([]);
      expect(Object.isFrozen(decorations[0]?.spec)).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("keeps an independent valid container when another container is invalid", () => {
    const validContainerId = id("region000001");
    const invalidContainerId = id("region000002");
    const validChildId = id("block0000001");
    const invalidChildIds = [id("block0000002"), id("block0000003")] as const;
    const editor = createEditor(
      createEditorDocument([
        { containerId: validContainerId, childIds: [validChildId] },
        { containerId: invalidContainerId, childIds: invalidChildIds },
      ]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId: validContainerId,
          contentLayout: SEQUENCE,
          directChildIds: [validChildId],
          activeChildId: validChildId,
        },
        {
          containerId: invalidContainerId,
          contentLayout: SEQUENCE,
          directChildIds: invalidChildIds,
          activeChildId: null,
        },
      ]);
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state).map((decoration) => decoration.spec.containerId)).toEqual([
        validContainerId,
      ]);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        {
          kind: "projection-unavailable",
          containerId: invalidContainerId,
          issue: { kind: "missing-active-child", containerId: invalidContainerId },
        },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    [
      "missing active child",
      [{ childIds: [id("block0000001")] as const, activeChildId: null }],
      "missing-active-child",
    ],
    [
      "active child on empty Sequence",
      [{ childIds: [] as const, activeChildId: id("block0000001") }],
      "active-child-on-empty-sequence",
    ],
    [
      "active child outside the direct children",
      [{ childIds: [id("block0000001")] as const, activeChildId: id("block0000002") }],
      "active-child-not-direct",
    ],
  ] as const)("turns a Task 1 %s outcome into a local diagnostic", (_name, cases, issueKind) => {
    const containerId = id("region000001");
    const documentChildIds = cases[0]!.childIds;
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: documentChildIds }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: documentChildIds,
          activeChildId: cases[0]!.activeChildId,
        },
      ]);
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      const issue =
        issueKind === "missing-active-child"
          ? { kind: "missing-active-child" as const, containerId }
          : issueKind === "active-child-on-empty-sequence"
            ? {
                kind: "active-child-on-empty-sequence" as const,
                containerId,
                activeChildId: cases[0]!.activeChildId!,
              }
            : {
                kind: "active-child-not-direct" as const,
                containerId,
                activeChildId: cases[0]!.activeChildId!,
              };
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        { kind: "projection-unavailable", containerId, issue },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("turns duplicate direct-child identity into a local projection diagnostic", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = withDuplicateSnapshotChild(
        createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId, childId],
            activeChildId: childId,
          },
        ]),
        containerId,
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        {
          kind: "projection-unavailable",
          containerId,
          issue: { kind: "duplicate-direct-child-id", containerId, childId },
        },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("reports an exact ordered-child mismatch without partially decorating a container", () => {
    const containerId = id("region000001");
    const childIds = [id("block0000001"), id("block0000002")] as const;
    const editor = createEditor(createEditorDocument([{ containerId, childIds }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childIds[1], childIds[0]],
          activeChildId: childIds[0],
        },
      ]);
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        {
          kind: "snapshot-mismatch",
          containerId,
          reason: "ordered-direct-children-mismatch",
          expectedChildIds: childIds,
          actualChildIds: [childIds[1], childIds[0]],
        },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("reports a container publication and layout mismatch", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(
        fixture,
        [
          {
            containerId,
            contentLayout: FLOW,
            directChildIds: [childId],
            activeChildId: null,
          },
        ],
        { snapshotLayout: SEQUENCE },
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        {
          kind: "snapshot-mismatch",
          containerId,
          reason: "content-layout-mismatch",
          expectedLayout: SEQUENCE,
          actualLayout: FLOW,
        },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("rejects a stale Sequence source when the current container is Flow", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [childId], contentLayout: FLOW }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childId],
          activeChildId: childId,
        },
      ]);
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: containerId,
        reason: "document-node-content-layout-mismatch",
        position: fixture[0]!.containerPos,
        expectedLayout: SEQUENCE,
        actualLayout: FLOW,
      });
    } finally {
      editor.destroy();
    }
  });

  it("rejects a child when its semantic item and location node types disagree", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = withSnapshotLocationNodeType(
        createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId],
            activeChildId: childId,
          },
        ]),
        childId,
        "staleChild",
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: childId,
        reason: "location-node-type-mismatch",
        position: fixture[0]!.childPositions[0],
        expectedNodeType: "child",
        actualNodeType: "staleChild",
      });
    } finally {
      editor.destroy();
    }
  });

  it.each(["start", "end"] as const)(
    "rejects a child location touching the container %s boundary",
    (boundary) => {
      const containerId = id("region000001");
      const childId = id("block0000001");
      const editor = createEditor(
        createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
      );

      try {
        const fixture = documentFixtures(editor.state.doc);
        const containerFrom = fixture[0]!.containerPos;
        const containerTo = containerFrom + 2 + fixture[0]!.childIds.length;
        const childFrom = boundary === "start" ? containerFrom : containerTo - 1;
        const childTo = boundary === "start" ? containerFrom + 1 : containerTo;
        const batch = withSnapshotLocation(
          createBatch(fixture, [
            {
              containerId,
              contentLayout: SEQUENCE,
              directChildIds: [childId],
              activeChildId: childId,
            },
          ]),
          childId,
          { from: childFrom, to: childTo },
        );
        const state = applyBatch(editor.state, batch);

        expect(cachedDecorations(state)).toHaveLength(0);
        expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
          kind: "snapshot-location-unavailable",
          containerId,
          targetId: childId,
          reason: "location-outside-container",
          childFrom,
          childTo,
          containerFrom,
          containerTo,
        });
      } finally {
        editor.destroy();
      }
    },
  );

  it("rejects a moved child for its stale container while preserving an independent projection", () => {
    const staleContainerId = id("region000001");
    const movedContainerId = id("region000002");
    const validContainerId = id("region000003");
    const staleChildId = id("block0000001");
    const movedChildId = id("block0000002");
    const validChildId = id("block0000003");
    const editor = createEditor(
      createEditorDocument([
        { containerId: staleContainerId, childIds: [staleChildId], contentLayout: SEQUENCE },
        { containerId: movedContainerId, childIds: [movedChildId], contentLayout: SEQUENCE },
        { containerId: validContainerId, childIds: [validChildId], contentLayout: SEQUENCE },
      ]),
    );

    try {
      const fixtures = documentFixtures(editor.state.doc);
      const batch = withSnapshotChildParent(
        withSnapshotContainerChildren(
          createBatch(fixtures, [
            {
              containerId: staleContainerId,
              contentLayout: SEQUENCE,
              directChildIds: [staleChildId, movedChildId],
              activeChildId: staleChildId,
            },
            {
              containerId: validContainerId,
              contentLayout: SEQUENCE,
              directChildIds: [validChildId],
              activeChildId: validChildId,
            },
          ]),
          staleContainerId,
          [staleChildId, movedChildId],
        ),
        movedChildId,
        staleContainerId,
      );
      const state = applyBatch(editor.state, batch);
      const staleFixture = fixtures[0]!;
      const movedFixture = fixtures[1]!;
      const staleContainerTo = staleFixture.containerPos + 2 + staleFixture.childIds.length;

      expect(
        cachedDecorations(state).map((decoration) => [
          decoration.spec.containerId,
          decoration.spec.state.childId,
        ]),
      ).toEqual([[validContainerId, validChildId]]);
      expect(readContentLayoutDiagnosticsFor(state, staleContainerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId: staleContainerId,
        targetId: movedChildId,
        reason: "location-outside-container",
        childFrom: movedFixture.childPositions[0],
        childTo: movedFixture.childPositions[0]! + 1,
        containerFrom: staleFixture.containerPos,
        containerTo: staleContainerTo,
      });
    } finally {
      editor.destroy();
    }
  });

  it.each([
    ["container identity", "document-node-identity-mismatch"],
    ["container node type", "document-node-type-mismatch"],
    ["container range", "document-node-range-mismatch"],
  ] as const)("rejects a stale source when the current %s changes", (caseName, _reason) => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const actualContainerId = id("region000002");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childId],
          activeChildId: childId,
        },
      ]);
      const containerPosition = fixture[0]!.containerPos;
      const containerType = editor.state.schema.nodes.container;
      const alternateContainerType = editor.state.schema.nodes.alternateContainer;
      if (!containerType || !alternateContainerType) {
        throw new Error("Expected both container node types.");
      }

      const replacementBatch =
        caseName === "container range"
          ? withSnapshotLocationRange(batch, containerId, containerPosition + 2)
          : batch;
      const changedTransaction =
        caseName === "container identity"
          ? editor.state.tr.setNodeMarkup(containerPosition, containerType, {
              id: actualContainerId,
              contentLayout: SEQUENCE,
            })
          : caseName === "container node type"
            ? editor.state.tr.setNodeMarkup(containerPosition, alternateContainerType, {
                id: containerId,
                contentLayout: SEQUENCE,
              })
            : editor.state.tr;
      if (caseName === "container node type") {
        expect(changedTransaction.doc.nodeAt(containerPosition)?.type.name).toBe(
          "alternateContainer",
        );
      }
      const projectionTransaction = setContentLayoutProjectionBatchMeta(
        changedTransaction,
        replacementBatch,
      );

      const state = editor.state.apply(projectionTransaction);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual(
        caseName === "container identity"
          ? {
              kind: "snapshot-location-unavailable",
              containerId,
              targetId: containerId,
              reason: "document-node-identity-mismatch",
              position: containerPosition,
              expectedId: containerId,
              actualId: actualContainerId,
            }
          : caseName === "container node type"
            ? {
                kind: "snapshot-location-unavailable",
                containerId,
                targetId: containerId,
                reason: "document-node-type-mismatch",
                position: containerPosition,
                expectedNodeType: "container",
                actualNodeType: "alternateContainer",
              }
            : {
                kind: "snapshot-location-unavailable",
                containerId,
                targetId: containerId,
                reason: "document-node-range-mismatch",
                position: containerPosition,
                expectedFrom: containerPosition,
                expectedTo: containerPosition + 2,
                actualFrom: containerPosition,
                actualTo: containerPosition + 3,
              },
      );
    } finally {
      editor.destroy();
    }
  });

  it.each(["missing-location", "location-identity-mismatch", "invalid-location-range"] as const)(
    "reports a malformed current container snapshot location: %s",
    (reason) => {
      const containerId = id("region000001");
      const childId = id("block0000001");
      const editor = createEditor(
        createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
      );

      try {
        const fixture = documentFixtures(editor.state.doc);
        const batch = createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId],
            activeChildId: childId,
          },
        ]);
        const malformedBatch =
          reason === "missing-location"
            ? withoutSnapshotLocation(batch, containerId)
            : reason === "location-identity-mismatch"
              ? withSnapshotLocationIdentity(batch, containerId, childId)
              : withSnapshotLocationRange(batch, containerId, fixture[0]!.containerPos);
        const state = applyBatch(editor.state, malformedBatch);

        expect(cachedDecorations(state)).toHaveLength(0);
        expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual(
          reason === "missing-location"
            ? {
                kind: "snapshot-location-unavailable",
                containerId,
                targetId: containerId,
                reason,
              }
            : reason === "location-identity-mismatch"
              ? {
                  kind: "snapshot-location-unavailable",
                  containerId,
                  targetId: containerId,
                  reason,
                  position: fixture[0]!.containerPos,
                  expectedId: containerId,
                  actualId: childId,
                }
              : {
                  kind: "snapshot-location-unavailable",
                  containerId,
                  targetId: containerId,
                  reason,
                  actualFrom: fixture[0]!.containerPos,
                  actualTo: fixture[0]!.containerPos,
                },
        );
      } finally {
        editor.destroy();
      }
    },
  );

  it("reports a direct-child location order mismatch with index evidence", () => {
    const containerId = id("region000001");
    const childIds = [id("block0000001"), id("block0000002")] as const;
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds, contentLayout: SEQUENCE }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: childIds,
          activeChildId: childIds[0],
        },
      ]);
      const malformedBatch = withSnapshotLocationFrom(
        batch,
        childIds[1],
        fixture[0]!.childPositions[0]!,
      );
      const state = applyBatch(editor.state, malformedBatch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: childIds[1],
        reason: "location-order-mismatch",
        index: 1,
        position: fixture[0]!.childPositions[0],
        previousIndex: 0,
        previousPosition: fixture[0]!.childPositions[0],
        previousTargetId: childIds[0],
      });
    } finally {
      editor.destroy();
    }
  });

  it("reports child index mismatch with the known parent and item facts", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = withSnapshotChildParent(
        createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId],
            activeChildId: childId,
          },
        ]),
        childId,
        null,
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-mismatch",
        containerId,
        reason: "child-index-mismatch",
        childId,
        index: 0,
        expectedParentId: containerId,
        actualParentId: null,
        actualItemId: childId,
      });
    } finally {
      editor.destroy();
    }
  });

  it("retains a valid container when another container fails current-document validation", () => {
    const validContainerId = id("region000001");
    const invalidContainerId = id("region000002");
    const validChildId = id("block0000001");
    const invalidChildId = id("block0000002");
    const editor = createEditor(
      createEditorDocument([
        { containerId: validContainerId, childIds: [validChildId], contentLayout: SEQUENCE },
        { containerId: invalidContainerId, childIds: [invalidChildId], contentLayout: SEQUENCE },
      ]),
    );

    try {
      const fixtures = documentFixtures(editor.state.doc);
      const batch = createBatch(fixtures, [
        {
          containerId: validContainerId,
          contentLayout: SEQUENCE,
          directChildIds: [validChildId],
          activeChildId: validChildId,
        },
        {
          containerId: invalidContainerId,
          contentLayout: SEQUENCE,
          directChildIds: [invalidChildId],
          activeChildId: invalidChildId,
        },
      ]);
      const invalidContainerPosition = fixtures[1]!.containerPos;
      const containerType = editor.state.schema.nodes.container;
      if (!containerType) throw new Error("Expected the test container node type.");
      const changedTransaction = editor.state.tr.setNodeMarkup(
        invalidContainerPosition,
        containerType,
        { id: invalidContainerId, contentLayout: FLOW },
      );
      setContentLayoutProjectionBatchMeta(changedTransaction, batch);
      const state = editor.state.apply(changedTransaction);

      expect(cachedDecorations(state).map((decoration) => decoration.spec.containerId)).toEqual([
        validContainerId,
      ]);
      expect(readContentLayoutDiagnosticsFor(state, invalidContainerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId: invalidContainerId,
        targetId: invalidContainerId,
        reason: "document-node-content-layout-mismatch",
        position: invalidContainerPosition,
        expectedLayout: SEQUENCE,
        actualLayout: FLOW,
      });
    } finally {
      editor.destroy();
    }
  });

  it("keeps an initial document change undiagnosed before any source batch exists", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
    );

    try {
      const containerPosition = documentFixtures(editor.state.doc)[0]!.containerPos;
      const containerType = editor.state.schema.nodes.container;
      if (!containerType) throw new Error("Expected the test container node type.");
      const changedTransaction = editor.state.tr.setNodeMarkup(containerPosition, containerType, {
        id: containerId,
        contentLayout: FLOW,
      });
      const state = editor.state.apply(changedTransaction);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("copies the caller-owned batch at the metadata boundary", () => {
    const containerId = id("region000001");
    const childIds = [id("block0000001"), id("block0000002")] as const;
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds, contentLayout: SEQUENCE }]),
    );

    try {
      const fixture = documentFixtures(editor.state.doc);
      const sourceBatch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: childIds,
          activeChildId: childIds[0],
        },
      ]);
      const sourceDirectChildIds = [...sourceBatch.containers[0]!.directChildIds];
      const sourceContainers = [
        {
          ...sourceBatch.containers[0]!,
          directChildIds: sourceDirectChildIds,
        },
      ];
      const callerBatch = {
        snapshot: sourceBatch.snapshot,
        containers: sourceContainers,
      };
      const transaction = setContentLayoutProjectionBatchMeta(editor.state.tr, callerBatch);

      sourceDirectChildIds.reverse();
      sourceDirectChildIds[0] = id("block0000003");
      sourceContainers[0]!.containerId = id("region000002");
      sourceContainers[0]!.contentLayout = FLOW;
      sourceContainers[0]!.activeChildId = null;
      sourceContainers.length = 0;
      callerBatch.containers = [];

      const state = editor.state.apply(transaction);

      expect(cachedDecorations(state).map((decoration) => decoration.spec.state.childId)).toEqual(
        childIds,
      );
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    ["malformed metadata", "not projection metadata", "malformed-meta"],
    ["malformed batch", { type: "replace", batch: { containers: [] } }, "malformed-batch"],
  ] as const)("turns %s into a typed diagnostic", (_name, rawMeta, reason) => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [childId], contentLayout: SEQUENCE }]),
    );

    try {
      const state = editor.state.apply(
        editor.state.tr.setMeta("contentLayoutProjection$", rawMeta),
      );

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        { kind: "invalid-batch", containerId: null, reason },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("keeps an unexpected snapshot lookup defect observable as a throw", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childId],
          activeChildId: childId,
        },
      ]);
      const throwingItemIndex = Object.freeze({
        get() {
          throw new Error("unexpected snapshot lookup defect");
        },
      });
      const defectiveBatch = {
        ...batch,
        snapshot: {
          ...batch.snapshot,
          itemById: throwingItemIndex,
        },
      } as unknown as ContentLayoutProjectionBatch;

      expect(() => applyBatch(editor.state, defectiveBatch)).toThrow(
        "unexpected snapshot lookup defect",
      );
    } finally {
      editor.destroy();
    }
  });

  it("throws when diagnostics are read without the installed extension", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = new Editor({
      extensions: [
        TestDocumentNode,
        TestContainerNode,
        TestChildNode,
        TestAlternateContainerNode,
        StarterKit.configure({ document: false }),
      ],
      content: createEditorDocument([{ containerId, childIds: [childId] }]),
    });

    try {
      expect(() => readContentLayoutProjectionDiagnostics(editor.state)).toThrow(
        "Content Layout Projection extension is not installed",
      );
    } finally {
      editor.destroy();
    }
  });

  it("reports an input whose container is not published in the snapshot", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(
        fixture,
        [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId],
            activeChildId: childId,
          },
        ],
        { snapshotLayout: null },
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-mismatch",
        containerId,
        reason: "container-not-published",
      });
    } finally {
      editor.destroy();
    }
  });

  it("reports an input whose container is absent from the snapshot index", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = withoutSnapshotItem(
        createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId],
            activeChildId: childId,
          },
        ]),
        containerId,
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-mismatch",
        containerId,
        reason: "container-not-indexed",
      });
    } finally {
      editor.destroy();
    }
  });

  it("reports a missing current document node at the snapshot container position", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = withSnapshotLocation(
        createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [childId],
            activeChildId: childId,
          },
        ]),
        containerId,
        { from: 100, to: 101 },
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: containerId,
        reason: "document-node-missing",
        position: 100,
      });
    } finally {
      editor.destroy();
    }
  });

  it("reports an invalid current document content-layout attribute", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childId],
          activeChildId: childId,
        },
      ]);
      const containerType = editor.state.schema.nodes.container;
      if (!containerType) throw new Error("Expected the test container node type.");
      const transaction = editor.state.tr.setNodeMarkup(fixture[0]!.containerPos, containerType, {
        id: containerId,
        [CONTENT_LAYOUT_ATTR]: "invalid-layout",
      });
      setContentLayoutProjectionBatchMeta(transaction, batch);
      const state = editor.state.apply(transaction);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: containerId,
        reason: "document-node-content-layout-invalid",
        position: fixture[0]!.containerPos,
        expectedLayout: SEQUENCE,
        actualLayout: "invalid-layout",
      });
    } finally {
      editor.destroy();
    }
  });

  it("reports a missing child location", () => {
    const containerId = id("region000001");
    const childIds = [id("block0000001"), id("block0000002")] as const;
    const editor = createEditor(createEditorDocument([{ containerId, childIds }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = withoutSnapshotLocation(
        createBatch(fixture, [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: childIds,
            activeChildId: childIds[0],
          },
        ]),
        childIds[1],
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: childIds[1],
        reason: "missing-location",
      });
    } finally {
      editor.destroy();
    }
  });

  it("reports a wrong stable ID at the snapshot-owned document position", () => {
    const containerId = id("region000001");
    const expectedChildId = id("block0000001");
    const actualChildId = id("block0000002");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [actualChildId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(
        fixture,
        [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [expectedChildId],
            activeChildId: expectedChildId,
          },
        ],
        {
          snapshotChildIdsByContainer: [[containerId, [expectedChildId]]],
        },
      );
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutDiagnosticsFor(state, containerId)).toEqual({
        kind: "snapshot-location-unavailable",
        containerId,
        targetId: expectedChildId,
        reason: "document-node-identity-mismatch",
        position: fixture[0]!.childPositions[0],
        expectedId: expectedChildId,
        actualId: actualChildId,
      });
    } finally {
      editor.destroy();
    }
  });

  it("rejects duplicate container inputs without competing decorations", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const input: ProjectionContainerSpec = {
        containerId,
        contentLayout: SEQUENCE,
        directChildIds: [childId],
        activeChildId: childId,
      };
      const batch = createBatch(fixture, [input, input]);
      const state = applyBatch(editor.state, batch);

      expect(cachedDecorations(state)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(state)).toEqual([
        {
          kind: "snapshot-mismatch",
          containerId,
          reason: "duplicate-container-input",
          inputIndexes: [0, 1],
        },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("keeps replace and clear metadata out of document steps and portable JSON", () => {
    const containerId = id("region000001");
    const childIds = [id("block0000001"), id("block0000002")] as const;
    const editor = createEditor(createEditorDocument([{ containerId, childIds }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: childIds,
          activeChildId: childIds[0],
        },
      ]);
      const beforeJSON = JSON.stringify(editor.state.doc.toJSON());
      const beforeIds = stableIds(editor.state.doc);
      const replaceTransaction = setContentLayoutProjectionBatchMeta(editor.state.tr, batch);
      const projectedState = editor.state.apply(replaceTransaction);

      expect(replaceTransaction.steps).toHaveLength(0);
      expect(JSON.stringify(projectedState.doc.toJSON())).toBe(beforeJSON);
      expect(stableIds(projectedState.doc)).toEqual(beforeIds);

      const clearTransaction = clearContentLayoutProjectionMeta(projectedState.tr);
      const clearedState = projectedState.apply(clearTransaction);

      expect(clearTransaction.steps).toHaveLength(0);
      expect(JSON.stringify(clearedState.doc.toJSON())).toBe(beforeJSON);
      expect(stableIds(clearedState.doc)).toEqual(beforeIds);
      expect(cachedDecorations(clearedState)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(clearedState)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("clears cached projection and records stale source on an unaccompanied document change", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const childPosition = fixture[0]?.childPositions[0];
      if (childPosition === undefined) throw new Error("Expected a child position.");
      const childType = projectedStateSchemaNode(editor.state);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childId],
          activeChildId: childId,
        },
      ]);
      const projectedState = applyBatch(editor.state, batch);
      expect(cachedDecorations(projectedState)).toHaveLength(1);

      const changedTransaction = projectedState.tr.setNodeMarkup(childPosition, childType, {
        id: childId,
      });
      const staleState = projectedState.apply(changedTransaction);

      expect(changedTransaction.docChanged).toBe(true);
      expect(cachedDecorations(staleState)).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(staleState)).toEqual([
        {
          kind: "stale-source",
          containerId: null,
          previousRevision: batch.snapshot.revision,
        },
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("rebuilds against the result document for a same-transaction replacement", () => {
    const containerId = id("region000001");
    const firstChildId = id("block0000001");
    const secondChildId = id("block0000002");
    const insertedChildId = id("block0000003");
    const editor = createEditor(
      createEditorDocument([{ containerId, childIds: [firstChildId, secondChildId] }]),
    );

    try {
      const initialFixture = documentFixtures(editor.state.doc);
      const initialBatch = createBatch(initialFixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [firstChildId, secondChildId],
          activeChildId: firstChildId,
        },
      ]);
      const projectedState = applyBatch(editor.state, initialBatch);
      const childType = projectedState.schema.nodes.child;
      if (!childType) throw new Error("Expected the test child node type.");
      const initialChildPosition = initialFixture[0]?.childPositions[0];
      if (initialChildPosition === undefined) {
        throw new Error("Expected an initial child position.");
      }
      const insertedNode = childType.create({ id: insertedChildId });
      const changedTransaction = projectedState.tr.insert(initialChildPosition, insertedNode);
      const resultFixture = documentFixtures(changedTransaction.doc);
      const replacementBatch = createBatch(
        resultFixture,
        [
          {
            containerId,
            contentLayout: SEQUENCE,
            directChildIds: [insertedChildId, firstChildId, secondChildId],
            activeChildId: insertedChildId,
          },
        ],
        { revision: initialBatch.snapshot.revision + 1 },
      );
      setContentLayoutProjectionBatchMeta(changedTransaction, replacementBatch);
      const nextState = projectedState.apply(changedTransaction);

      expect(changedTransaction.steps).toHaveLength(1);
      expect(cachedDecorations(nextState).map(({ from, to }) => [from, to])).toEqual(
        resultFixture[0]!.childPositions.map((position) => [position, position + 1]),
      );
      expect(
        cachedDecorations(nextState).map((decoration) => decoration.spec.state.childId),
      ).toEqual([insertedChildId, firstChildId, secondChildId]);
      expect(readContentLayoutProjectionDiagnostics(nextState)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("freezes newly created diagnostic collections and records", () => {
    const containerId = id("region000001");
    const childId = id("block0000001");
    const editor = createEditor(createEditorDocument([{ containerId, childIds: [childId] }]));

    try {
      const fixture = documentFixtures(editor.state.doc);
      const batch = createBatch(fixture, [
        {
          containerId,
          contentLayout: SEQUENCE,
          directChildIds: [childId],
          activeChildId: null,
        },
      ]);
      const state = applyBatch(editor.state, batch);
      const diagnostics = readContentLayoutProjectionDiagnostics(state);

      expect(Object.isFrozen(diagnostics)).toBe(true);
      expect(Object.isFrozen(diagnostics[0])).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});

function projectedStateSchemaNode(state: EditorState) {
  const childType = state.schema.nodes.child;
  if (!childType) throw new Error("Expected the test child node type.");
  return childType;
}

function createEditor(document: Record<string, unknown>): Editor {
  return new Editor({
    extensions: [
      TestDocumentNode,
      TestContainerNode,
      TestAlternateContainerNode,
      TestChildNode,
      StarterKit.configure({ document: false, trailingNode: false }),
      ContentLayoutProjectionExtension,
    ],
    content: document,
  });
}

function createEditorDocument(
  containers: readonly {
    readonly containerId: EmbeddedNodeId;
    readonly childIds: readonly EmbeddedNodeId[];
    readonly contentLayout?: PresentationContentLayout;
  }[],
): Record<string, unknown> {
  return {
    type: "doc",
    content: containers.map(({ containerId, childIds, contentLayout = SEQUENCE }) => ({
      type: "container",
      attrs: { id: containerId, [CONTENT_LAYOUT_ATTR]: contentLayout },
      content: childIds.map((childId) => ({ type: "child", attrs: { id: childId } })),
    })),
  };
}

function documentFixtures(doc: ProseMirrorNode): readonly DocumentContainerFixture[] {
  const fixtures: DocumentContainerFixture[] = [];
  let containerPos = 0;
  doc.forEach((container) => {
    const containerId = id(String(container.attrs["id"]));
    const childIds = Object.freeze(
      Array.from({ length: container.childCount }, (_, index) =>
        id(String(container.child(index).attrs["id"])),
      ),
    );
    const childPositions = Object.freeze(
      childIds.map((_childId, index) => containerPos + 1 + index),
    );
    fixtures.push(
      Object.freeze({
        containerId,
        childIds,
        containerPos,
        childPositions,
      }),
    );
    containerPos += container.nodeSize;
  });
  return Object.freeze(fixtures);
}

function createBatch(
  documentFixturesValue: readonly DocumentContainerFixture[],
  inputs: readonly ProjectionContainerSpec[],
  options: {
    readonly revision?: number;
    readonly snapshotLayout?: PresentationContentLayout | null;
    readonly snapshotChildIdsByContainer?: readonly (readonly [
      EmbeddedNodeId,
      readonly EmbeddedNodeId[],
    ])[];
  } = {},
): ContentLayoutProjectionBatch {
  const builder = createDocumentTreeSnapshotBuilder({
    revision: options.revision ?? 1,
    mode: "slideshow",
  });
  for (const fixture of documentFixturesValue) {
    const input = inputs.find(({ containerId }) => containerId === fixture.containerId);
    const snapshotLayout =
      options.snapshotLayout === undefined
        ? (input?.contentLayout ?? FLOW)
        : options.snapshotLayout;
    builder.addItem({
      item: semanticItem(fixture.containerId, "region", "container", snapshotLayout),
      parentId: null,
      location: semanticLocation(
        fixture.containerId,
        "container",
        fixture.containerPos,
        fixture.containerPos + 2 + fixture.childIds.length,
      ),
    });
    const snapshotChildIds =
      options.snapshotChildIdsByContainer?.find(
        ([containerId]) => containerId === fixture.containerId,
      )?.[1] ?? fixture.childIds;
    for (const [childIndex, childId] of snapshotChildIds.entries()) {
      builder.addItem({
        item: semanticItem(childId, "block", "child", null),
        parentId: fixture.containerId,
        location: semanticLocation(
          childId,
          "child",
          fixture.childPositions[childIndex]!,
          fixture.childPositions[childIndex]! + 1,
        ),
      });
    }
  }
  const snapshot = builder.build();
  const containers = inputs.map((input) =>
    Object.freeze({
      containerId: input.containerId,
      contentLayout: input.contentLayout,
      directChildIds: Object.freeze([...input.directChildIds]),
      activeChildId: input.activeChildId,
    }),
  );
  return Object.freeze({ snapshot, containers: Object.freeze(containers) });
}

function semanticItem(
  idValue: EmbeddedNodeId,
  kind: DocumentTreeSnapshotItemInput["kind"],
  nodeType: string,
  contentLayout: PresentationContentLayout | null,
): DocumentTreeSnapshotItemInput {
  return {
    id: idValue,
    kind,
    nodeType,
    definitionId: kind === "region" ? null : "test-child",
    label: idValue,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: contentLayout === null ? null : { contentLayout },
  };
}

function semanticLocation(idValue: EmbeddedNodeId, nodeType: string, from: number, to: number) {
  return {
    id: idValue,
    nodeType,
    from,
    to,
    selectionTarget: { kind: "node" as const, pos: from },
    surfaceId: null,
    authoringAnchorId: null,
    activationPath: [],
  };
}

function withoutSnapshotLocation(
  batch: ContentLayoutProjectionBatch,
  locationId: EmbeddedNodeId,
): ContentLayoutProjectionBatch {
  const locations = [...batch.snapshot.locationById].filter(([idValue]) => idValue !== locationId);
  return Object.freeze({
    ...batch,
    snapshot: Object.freeze({
      ...batch.snapshot,
      locationById: readonlyMap(locations),
    }),
  });
}

function withSnapshotLocationRange(
  batch: ContentLayoutProjectionBatch,
  locationId: EmbeddedNodeId,
  to: number,
): ContentLayoutProjectionBatch {
  return withSnapshotLocation(batch, locationId, { to });
}

function withSnapshotLocationIdentity(
  batch: ContentLayoutProjectionBatch,
  locationId: EmbeddedNodeId,
  actualId: EmbeddedNodeId,
): ContentLayoutProjectionBatch {
  return withSnapshotLocation(batch, locationId, { id: actualId });
}

function withSnapshotLocationNodeType(
  batch: ContentLayoutProjectionBatch,
  locationId: EmbeddedNodeId,
  nodeType: string,
): ContentLayoutProjectionBatch {
  return withSnapshotLocation(batch, locationId, { nodeType });
}

function withSnapshotLocationFrom(
  batch: ContentLayoutProjectionBatch,
  locationId: EmbeddedNodeId,
  from: number,
): ContentLayoutProjectionBatch {
  return withSnapshotLocation(batch, locationId, { from });
}

function withSnapshotLocation(
  batch: ContentLayoutProjectionBatch,
  locationId: EmbeddedNodeId,
  update: Partial<Pick<DocumentItemLocation, "id" | "nodeType" | "from" | "to">>,
): ContentLayoutProjectionBatch {
  const locations: readonly (readonly [EmbeddedNodeId, DocumentItemLocation])[] = [
    ...batch.snapshot.locationById,
  ].map(([idValue, value]) =>
    idValue === locationId
      ? ([idValue, { ...value, ...update }] as const)
      : ([idValue, value] as const),
  );
  return Object.freeze({
    ...batch,
    snapshot: Object.freeze({
      ...batch.snapshot,
      locationById: readonlyMap(locations),
    }),
  });
}

function withoutSnapshotItem(
  batch: ContentLayoutProjectionBatch,
  itemId: EmbeddedNodeId,
): ContentLayoutProjectionBatch {
  const itemEntries = [...batch.snapshot.itemById].filter(([idValue]) => idValue !== itemId);
  return Object.freeze({
    ...batch,
    snapshot: Object.freeze({
      ...batch.snapshot,
      roots: Object.freeze(batch.snapshot.roots.filter((item) => item.id !== itemId)),
      itemById: readonlyMap(itemEntries),
    }),
  });
}

function withSnapshotContainerChildren(
  batch: ContentLayoutProjectionBatch,
  containerId: EmbeddedNodeId,
  childIds: readonly EmbeddedNodeId[],
): ContentLayoutProjectionBatch {
  const container = batch.snapshot.itemById.get(containerId);
  if (!container) throw new Error("Expected a snapshot container.");
  const children = childIds.map((childId) => {
    const child = batch.snapshot.itemById.get(childId);
    if (!child) throw new Error("Expected a snapshot child.");
    return child;
  });
  const updatedContainer = Object.freeze({
    ...container,
    children: Object.freeze(children),
  });
  const itemEntries = [...batch.snapshot.itemById].map(([idValue, item]) =>
    idValue === containerId ? ([idValue, updatedContainer] as const) : ([idValue, item] as const),
  );
  return Object.freeze({
    ...batch,
    snapshot: Object.freeze({
      ...batch.snapshot,
      roots: Object.freeze(
        batch.snapshot.roots.map((item) => (item.id === containerId ? updatedContainer : item)),
      ),
      itemById: readonlyMap(itemEntries),
    }),
  });
}

function withSnapshotChildParent(
  batch: ContentLayoutProjectionBatch,
  childId: EmbeddedNodeId,
  parentId: EmbeddedNodeId | null,
): ContentLayoutProjectionBatch {
  const parents = [...batch.snapshot.parentById].map(([idValue, value]) =>
    idValue === childId ? ([idValue, parentId] as const) : ([idValue, value] as const),
  );
  return Object.freeze({
    ...batch,
    snapshot: Object.freeze({
      ...batch.snapshot,
      parentById: readonlyMap(parents),
    }),
  });
}

function withDuplicateSnapshotChild(
  batch: ContentLayoutProjectionBatch,
  containerId: EmbeddedNodeId,
): ContentLayoutProjectionBatch {
  const container = batch.snapshot.itemById.get(containerId);
  const child = container?.children[0];
  if (!container || !child) throw new Error("Expected a container child.");
  return withSnapshotContainerChildren(batch, containerId, [child.id, child.id]);
}

function applyBatch(state: EditorState, batch: ContentLayoutProjectionBatch): EditorState {
  return state.apply(setContentLayoutProjectionBatchMeta(state.tr, batch));
}

function cachedDecorations(state: EditorState) {
  return readContentLayoutProjectionDecorations(state).find();
}

function readContentLayoutDiagnosticsFor(state: EditorState, containerId: EmbeddedNodeId) {
  return readContentLayoutProjectionDiagnostics(state).find(
    (diagnostic) => diagnostic.containerId === containerId,
  );
}

function stableIds(doc: ProseMirrorNode): readonly EmbeddedNodeId[] {
  const ids: EmbeddedNodeId[] = [];
  doc.forEach((container) => {
    ids.push(id(String(container.attrs["id"])));
    container.forEach((child) => ids.push(id(String(child.attrs["id"]))));
  });
  return ids;
}

function readonlyMap<Key, Value>(
  entries: readonly (readonly [Key, Value])[],
): ReadonlyMap<Key, Value> {
  const source = new Map(entries);
  let view: ReadonlyMap<Key, Value>;
  view = Object.freeze({
    get size() {
      return source.size;
    },
    get(key: Key) {
      return source.get(key);
    },
    has(key: Key) {
      return source.has(key);
    },
    forEach(
      callback: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
      thisArg?: unknown,
    ) {
      source.forEach((value, key) => callback.call(thisArg, value, key, view));
    },
    entries() {
      return source.entries();
    },
    keys() {
      return source.keys();
    },
    values() {
      return source.values();
    },
    [Symbol.iterator]() {
      return source[Symbol.iterator]();
    },
  });
  return view;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
