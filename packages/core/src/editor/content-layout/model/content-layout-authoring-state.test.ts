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
import type { DocumentTreeSnapshot } from "@/document/model/document-tree/document-tree-snapshot";

import {
  deriveContentLayoutAuthoringState,
  type ContentLayoutAuthoringResolution,
  type ContentLayoutAuthoringState,
} from "./content-layout-authoring-state";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const IDS = {
  surface: id("surface00001"),
  firstRegion: id("region000001"),
  secondRegion: id("region000002"),
  flowRegion: id("region000003"),
  emptyRegion: id("region000004"),
  outerRegion: id("region000005"),
  atomicGrid: id("grid00000001"),
  innerCell: id("cell00000001"),
  flowCell: id("cell00000002"),
  layout: id("layout000001"),
  sequenceSection: id("section00001"),
  first: id("child-000001"),
  second: id("child-000002"),
  third: id("child-000003"),
  fourth: id("child-000004"),
  inserted: id("child-000005"),
  nested: id("nested-00001"),
  unrelated: id("unrelated001"),
} as const;

describe("deriveContentLayoutAuthoringState", () => {
  it("starts a new non-empty Sequence on its first direct child", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
      item(IDS.third, IDS.firstRegion, "rich-text"),
    ]);

    const state = derive(snapshot, null);

    expectContainer(
      state,
      IDS.firstRegion,
      [IDS.first, IDS.second, IDS.third],
      IDS.first,
      "first-child",
    );
  });

  it("bootstraps a new Sequence before selected non-first descendants can navigate it", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.second, "exposed-child"),
    ]);

    const state = derive(snapshot, IDS.nested);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.first, "first-child");
  });

  it("bootstraps a Flow-to-Sequence transition before selected descendants can navigate it", () => {
    const previousSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", FLOW),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.second, "exposed-child"),
    ]);
    const previousState = derive(previousSnapshot, IDS.nested);
    const sequenceSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.second, "exposed-child"),
    ]);

    const state = derive(sequenceSnapshot, IDS.nested, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.first, "first-child");
  });

  it.each([
    ["direct selection", IDS.second],
    ["nested selection", IDS.nested],
  ] as const)("activates the direct child for %s", (_name, selectedId) => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.second, "exposed-child"),
    ]);
    const previousState = derive(snapshot, IDS.first);

    const state = derive(snapshot, selectedId, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.second, "selected");
  });

  it("activates every Sequence ancestor on a selected path through an atomic container", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.outerRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.outerRegion, "rich-text"),
      item(IDS.atomicGrid, IDS.outerRegion, "grid"),
      item(IDS.innerCell, IDS.atomicGrid, "cell", SEQUENCE),
      item(IDS.second, IDS.innerCell, "rich-text"),
      item(IDS.third, IDS.innerCell, "block"),
      item(IDS.nested, IDS.third, "exposed-child"),
    ]);
    const previousState = derive(snapshot, IDS.first);

    const state = derive(snapshot, IDS.nested, previousState);

    expectContainer(
      state,
      IDS.outerRegion,
      [IDS.first, IDS.atomicGrid],
      IDS.atomicGrid,
      "selected",
    );
    expectContainer(state, IDS.innerCell, [IDS.second, IDS.third], IDS.third, "selected");
  });

  it("continues the selected path through a production-shaped Flow container", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.outerRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.outerRegion, "rich-text"),
      item(IDS.atomicGrid, IDS.outerRegion, "grid"),
      item(IDS.flowCell, IDS.atomicGrid, "cell", FLOW),
      item(IDS.layout, IDS.flowCell, "layout"),
      item(IDS.sequenceSection, IDS.layout, "layout-section", SEQUENCE),
      item(IDS.third, IDS.sequenceSection, "block"),
      item(IDS.nested, IDS.third, "exposed-child"),
    ]);
    const previousState = derive(snapshot, IDS.first);

    const state = derive(snapshot, IDS.nested, previousState);

    expectContainer(
      state,
      IDS.outerRegion,
      [IDS.first, IDS.atomicGrid],
      IDS.atomicGrid,
      "selected",
    );
    expectContainer(state, IDS.flowCell, [IDS.layout], null, "flow");
    expectContainer(state, IDS.sequenceSection, [IDS.third], IDS.third, "selected");
  });

  it("retains a Sequence active child when its container is selected", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
    ]);
    const initialState = derive(snapshot, null);
    const previousState = derive(snapshot, IDS.second, initialState);

    const state = derive(snapshot, IDS.firstRegion, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.second, "retained");
  });

  it("does not reset independent Sequence containers for unrelated selection", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
      item(IDS.secondRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.third, IDS.secondRegion, "rich-text"),
      item(IDS.fourth, IDS.secondRegion, "rich-text"),
      item(IDS.unrelated, IDS.surface, "rich-text"),
    ]);
    const initialState = derive(snapshot, null);
    const previousState = derive(snapshot, IDS.fourth, initialState);

    const state = derive(snapshot, IDS.unrelated, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.first, "retained");
    expectContainer(state, IDS.secondRegion, [IDS.third, IDS.fourth], IDS.fourth, "retained");
  });

  it("selecting one Sequence child does not reset another independent container", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
      item(IDS.secondRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.third, IDS.secondRegion, "rich-text"),
      item(IDS.fourth, IDS.secondRegion, "rich-text"),
    ]);
    const initialState = derive(snapshot, null);
    const previousState = derive(snapshot, IDS.fourth, initialState);

    const state = derive(snapshot, IDS.second, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.second, "selected");
    expectContainer(state, IDS.secondRegion, [IDS.third, IDS.fourth], IDS.fourth, "retained");
  });

  it("emits Flow and empty Sequence projection inputs in deterministic container order", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.flowRegion, IDS.surface, "region", FLOW),
      item(IDS.second, IDS.flowRegion, "rich-text"),
      item(IDS.emptyRegion, IDS.surface, "region", SEQUENCE),
    ]);
    const previousState = derive(snapshot, IDS.first);

    const state = derive(snapshot, null, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first], IDS.first, "retained");
    expectContainer(state, IDS.flowRegion, [IDS.second], null, "flow");
    expectContainer(state, IDS.emptyRegion, [], null, "empty");
    expect(state.projectionInputs).toEqual([
      {
        containerId: IDS.firstRegion,
        contentLayout: SEQUENCE,
        directChildIds: [IDS.first],
        activeChildId: IDS.first,
      },
      {
        containerId: IDS.flowRegion,
        contentLayout: FLOW,
        directChildIds: [IDS.second],
        activeChildId: null,
      },
      {
        containerId: IDS.emptyRegion,
        contentLayout: SEQUENCE,
        directChildIds: [],
        activeChildId: null,
      },
    ]);
  });

  it("preserves Semantic Snapshot document order when items are added out of order", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      atDocumentPosition(item(IDS.second, IDS.firstRegion, "rich-text"), 41),
      atDocumentPosition(item(IDS.first, IDS.firstRegion, "rich-text"), 31),
    ]);

    const state = derive(snapshot, null);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.second], IDS.first, "first-child");
  });

  it("activates an inserted child from a replacement snapshot without an insertion branch", () => {
    const previousSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
    ]);
    const initialState = derive(previousSnapshot, null);
    const previousState = derive(previousSnapshot, IDS.second, initialState);
    const replacementSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.inserted, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.inserted, "exposed-child"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
    ]);

    const state = derive(replacementSnapshot, IDS.nested, previousState);

    expectContainer(
      state,
      IDS.firstRegion,
      [IDS.first, IDS.inserted, IDS.second],
      IDS.inserted,
      "selected",
    );
  });

  it("honors insertion-shaped selection when an established empty Sequence gains a child", () => {
    const previousSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
    ]);
    const previousState = derive(previousSnapshot, null);
    const replacementSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.inserted, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.inserted, "exposed-child"),
    ]);

    const state = derive(replacementSnapshot, IDS.nested, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.inserted], IDS.inserted, "selected");
  });

  it("prefers the next surviving sibling over mapped selection of an old sibling", () => {
    const previousSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
      item(IDS.third, IDS.firstRegion, "rich-text"),
    ]);
    const initialState = derive(previousSnapshot, null);
    const previousState = derive(previousSnapshot, IDS.second, initialState);
    const replacementSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.third, IDS.firstRegion, "rich-text"),
    ]);

    const state = derive(replacementSnapshot, IDS.first, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.first, IDS.third], IDS.third, "next-after-delete");
  });

  it("allows a newly introduced selected child to win over deletion fallback", () => {
    const previousSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
      item(IDS.third, IDS.firstRegion, "rich-text"),
    ]);
    const initialState = derive(previousSnapshot, null);
    const previousState = derive(previousSnapshot, IDS.second, initialState);
    const replacementSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.inserted, IDS.firstRegion, "block"),
      item(IDS.nested, IDS.inserted, "exposed-child"),
      item(IDS.third, IDS.firstRegion, "rich-text"),
    ]);

    const state = derive(replacementSnapshot, IDS.nested, previousState);

    expectContainer(
      state,
      IDS.firstRegion,
      [IDS.first, IDS.inserted, IDS.third],
      IDS.inserted,
      "selected",
    );
  });

  it("starts a replacement Sequence on its first current child without selection", () => {
    const previousSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
      item(IDS.second, IDS.firstRegion, "rich-text"),
    ]);
    const initialState = derive(previousSnapshot, null);
    const previousState = derive(previousSnapshot, IDS.second, initialState);
    const replacementSnapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.inserted, IDS.firstRegion, "block"),
      item(IDS.third, IDS.firstRegion, "rich-text"),
    ]);

    const state = derive(replacementSnapshot, null, previousState);

    expectContainer(state, IDS.firstRegion, [IDS.inserted, IDS.third], IDS.inserted, "first-child");
  });

  it.each([
    [
      "first active child",
      IDS.first,
      [IDS.second, IDS.third, IDS.fourth],
      IDS.second,
      "next-after-delete",
    ],
    [
      "middle active child",
      IDS.second,
      [IDS.first, IDS.third, IDS.fourth],
      IDS.third,
      "next-after-delete",
    ],
    [
      "last active child",
      IDS.fourth,
      [IDS.first, IDS.second, IDS.third],
      IDS.third,
      "previous-after-delete",
    ],
    [
      "simultaneous removals with a next survivor",
      IDS.second,
      [IDS.first, IDS.fourth],
      IDS.fourth,
      "next-after-delete",
    ],
    [
      "simultaneous removals with only a previous survivor",
      IDS.third,
      [IDS.first, IDS.second],
      IDS.second,
      "previous-after-delete",
    ],
    ["final active child removal", IDS.second, [], null, "empty"],
  ] as const)(
    "normalizes deletion of the %s",
    (_name, activeId, survivingIds, expectedId, resolution) => {
      const previousSnapshot = buildSnapshot([
        item(IDS.surface, null, "surface"),
        item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
        item(IDS.first, IDS.firstRegion, "rich-text"),
        item(IDS.second, IDS.firstRegion, "rich-text"),
        item(IDS.third, IDS.firstRegion, "rich-text"),
        item(IDS.fourth, IDS.firstRegion, "rich-text"),
      ]);
      const initialState = derive(previousSnapshot, null);
      const previousState = derive(previousSnapshot, activeId, initialState);
      const replacementSnapshot = buildSnapshot([
        item(IDS.surface, null, "surface"),
        item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
        ...survivingIds.map((childId) => item(childId, IDS.firstRegion, "rich-text")),
      ]);

      const state = derive(replacementSnapshot, IDS.firstRegion, previousState);

      expectContainer(state, IDS.firstRegion, survivingIds, expectedId, resolution);
    },
  );

  it("freezes state records, arrays and the exposed container map", () => {
    const snapshot = buildSnapshot([
      item(IDS.surface, null, "surface"),
      item(IDS.firstRegion, IDS.surface, "region", SEQUENCE),
      item(IDS.first, IDS.firstRegion, "rich-text"),
    ]);

    const state = derive(snapshot, null);
    const container = state.containers.get(IDS.firstRegion);
    const projectionInput = state.projectionInputs[0];

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.containers)).toBe(true);
    expect("set" in state.containers).toBe(false);
    expect(Object.isFrozen(state.projectionInputs)).toBe(true);
    expect(Object.isFrozen(projectionInput)).toBe(true);
    expect(Object.isFrozen(projectionInput?.directChildIds)).toBe(true);
    expect(Object.isFrozen(container)).toBe(true);
    expect(Object.isFrozen(container?.directChildIds)).toBe(true);
  });
});

interface TestItem {
  readonly id: EmbeddedNodeId;
  readonly parentId: EmbeddedNodeId | null;
  readonly kind: DocumentTreeSnapshotItemInput["kind"];
  readonly contentLayout?: typeof FLOW | typeof SEQUENCE;
  readonly documentFrom?: number;
}

function derive(
  snapshot: DocumentTreeSnapshot,
  selectedId: EmbeddedNodeId | null,
  previousState: ContentLayoutAuthoringState | null = null,
): ContentLayoutAuthoringState {
  return deriveContentLayoutAuthoringState({ snapshot, selectedId, previousState });
}

function expectContainer(
  state: ContentLayoutAuthoringState,
  containerId: EmbeddedNodeId,
  directChildIds: readonly EmbeddedNodeId[],
  activeChildId: EmbeddedNodeId | null,
  resolution: ContentLayoutAuthoringResolution,
): void {
  expect(state.containers.get(containerId)).toEqual({
    containerId,
    directChildIds,
    activeChildId,
    resolution,
  });
}

function item(
  itemId: EmbeddedNodeId,
  parentId: EmbeddedNodeId | null,
  kind: TestItem["kind"],
  contentLayout?: TestItem["contentLayout"],
): TestItem {
  return { id: itemId, parentId, kind, ...(contentLayout === undefined ? {} : { contentLayout }) };
}

function atDocumentPosition(testItem: TestItem, documentFrom: number): TestItem {
  return { ...testItem, documentFrom };
}

function buildSnapshot(items: readonly TestItem[]): DocumentTreeSnapshot {
  const builder = createDocumentTreeSnapshotBuilder({ revision: 1, mode: "page" });

  items.forEach(({ id: itemId, parentId, kind, contentLayout, documentFrom }, index) => {
    const from = documentFrom ?? index * 10 + 1;
    builder.addItem({
      item: {
        id: itemId,
        kind,
        nodeType: kind,
        definitionId: null,
        label: itemId,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
        presentationContainer: contentLayout === undefined ? null : { contentLayout },
      },
      parentId,
      location: {
        authoringAnchorId: null,
        id: itemId,
        nodeType: kind,
        from,
        to: from + 2,
        selectionTarget: { kind: "node", pos: from },
        surfaceId: null,
        activationPath: [],
      },
    });
  });

  return builder.build();
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
