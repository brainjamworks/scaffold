import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { SemanticDocumentControllerSnapshot } from "@/document/authoring/semantic-document/semantic-document-controller";
import type {
  SemanticDocumentSnapshot,
  SemanticItemKind,
} from "@/document/model/semantic-document/semantic-document-snapshot";
import {
  createSemanticSnapshotBuilder,
  type SemanticSnapshotItemInput,
} from "@/document/model/semantic-document/snapshot-builder";
import type { ContentLayoutAuthoringState } from "@/editor/content-layout/model/content-layout-authoring-state";
import type { StructuralActivationPlacementResolution } from "@/editor/interactions/targets/prosemirror/activation/structural-activation-placement";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";

import { resolveContentLayoutStructuralActivationPlacement } from "./content-layout-structural-activation-placement";

const dependencyMocks = vi.hoisted(() => ({
  getSemanticDocumentControllerForState: vi.fn(),
  readContentLayoutAuthoringState: vi.fn(),
}));

vi.mock("@/document/authoring/semantic-document/semantic-document-storage", () => ({
  getSemanticDocumentControllerForState: dependencyMocks.getSemanticDocumentControllerForState,
}));

vi.mock("../prosemirror/content-layout-authoring-extension", () => ({
  readContentLayoutAuthoringState: dependencyMocks.readContentLayoutAuthoringState,
}));

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const IDS = {
  target: id("target000001"),
  active: id("active000001"),
  sibling: id("sibling00001"),
  stale: id("stale0000001"),
  missing: id("missing00001"),
  outer: id("outer0000001"),
  inner: id("inner0000001"),
  outerChild: id("outerch00001"),
  innerChild: id("innerch00001"),
} as const;

const TEST_SCHEMA = new Schema({
  nodes: {
    doc: { content: "container*" },
    text: {},
    container: {
      attrs: { id: { default: null } },
      content: "containerChild*",
      group: "containerChild",
      toDOM: (node) => ["section", { "data-id": node.attrs["id"] }, 0],
    },
    child: {
      attrs: { id: { default: null } },
      atom: true,
      group: "containerChild",
      toDOM: (node) => ["div", { "data-id": node.attrs["id"] }],
    },
  },
});

describe("resolveContentLayoutStructuralActivationPlacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["Region", InteractionTargetKind.Region, "region"],
    ["Cell", InteractionTargetKind.Cell, "cell"],
    ["Layout Section", InteractionTargetKind.Section, "layout-section"],
  ] as const)(
    "retains the current direct child and exact snapshot location for a Sequence %s",
    (_label, targetKind, semanticKind) => {
      const fixture = createFixture(targetKind, semanticKind, SEQUENCE);
      const location = fixture.snapshot.locationById.get(IDS.active)!;

      const resolution = resolve(fixture);

      expect(resolution).toEqual({
        kind: "retain-active-child",
        activeChildId: IDS.active,
        activeRange: location,
        selectionTarget: location.selectionTarget,
      });
      expect(resolution.kind).toBe("retain-active-child");
      if (resolution.kind === "retain-active-child") {
        expect(resolution.activeRange).toBe(location);
        expect(resolution.selectionTarget).toBe(location.selectionTarget);
      }
      expect(Object.isFrozen(resolution)).toBe(true);
      expect(dependencyMocks.getSemanticDocumentControllerForState).toHaveBeenCalledOnce();
      expect(dependencyMocks.readContentLayoutAuthoringState).toHaveBeenCalledOnce();
    },
  );

  it("keeps a current Flow target on pointer placement without reading active state", () => {
    const fixture = createFixture(InteractionTargetKind.Region, "region", FLOW);
    dependencyMocks.readContentLayoutAuthoringState.mockImplementation(() => {
      throw new Error("Flow must not read Content Layout active state");
    });

    expect(resolve(fixture, false)).toEqual({ kind: "pointer-within-target" });
    expect(dependencyMocks.readContentLayoutAuthoringState).not.toHaveBeenCalled();
  });

  it.each([
    InteractionTargetKind.Grid,
    InteractionTargetKind.Layout,
    InteractionTargetKind.Surface,
  ])("keeps a non-eligible %s target on pointer placement", (kind) => {
    dependencyMocks.getSemanticDocumentControllerForState.mockImplementation(() => {
      throw new Error("Non-eligible targets must not read Semantic Snapshot state");
    });
    dependencyMocks.readContentLayoutAuthoringState.mockImplementation(() => {
      throw new Error("Non-eligible targets must not read Content Layout active state");
    });

    const resolution = resolveContentLayoutStructuralActivationPlacement({
      state: createEditorState([{ id: IDS.target, children: [{ id: IDS.active }] }]),
      target: { id: IDS.target, kind },
    });

    expect(resolution).toEqual({ kind: "pointer-within-target" });
    expect(dependencyMocks.getSemanticDocumentControllerForState).not.toHaveBeenCalled();
    expect(dependencyMocks.readContentLayoutAuthoringState).not.toHaveBeenCalled();
  });

  it.each([
    [SEQUENCE, FLOW, "pointer-within-target"],
    [FLOW, SEQUENCE, "retain-active-child"],
  ] as const)(
    "uses the nested target's nearest boundary state when the outer layout is %s and inner layout is %s",
    (outerLayout, innerLayout, expectedKind) => {
      const editorState = createEditorState([
        {
          id: IDS.outer,
          children: [{ id: IDS.inner, children: [{ id: IDS.innerChild }] }, { id: IDS.outerChild }],
        },
      ]);
      const snapshot = buildSnapshot(editorState.doc, [
        item(IDS.outer, null, "region", outerLayout),
        item(IDS.inner, IDS.outer, "layout-section", innerLayout),
        item(IDS.innerChild, IDS.inner, "rich-text"),
        item(IDS.outerChild, IDS.outer, "rich-text"),
      ]);
      const authoringState = createAuthoringState([
        [IDS.outer, [IDS.inner, IDS.outerChild], IDS.outerChild],
        [IDS.inner, [IDS.innerChild], innerLayout === SEQUENCE ? IDS.innerChild : null],
      ]);

      const resolution = resolve({
        editorState,
        snapshot,
        authoringState,
        target: { id: IDS.inner, kind: InteractionTargetKind.Section },
      });

      expect(resolution.kind).toBe(expectedKind);
      if (resolution.kind === "retain-active-child") {
        expect(resolution.activeChildId).toBe(IDS.innerChild);
      }
    },
  );

  it("returns target-unavailable when the stable target is missing from the current snapshot", () => {
    const fixture = createFixture(InteractionTargetKind.Region, "region", SEQUENCE);
    const itemById = new Map(fixture.snapshot.itemById);
    itemById.delete(IDS.target);

    expect(
      resolve({
        ...fixture,
        snapshot: Object.freeze({ ...fixture.snapshot, itemById }),
      }),
    ).toEqual(unavailable({ kind: "target-unavailable", targetId: IDS.target }));
  });

  it("returns target-unavailable when the target no longer has live document identity", () => {
    const fixture = createFixture(InteractionTargetKind.Region, "region", SEQUENCE);
    const editorState = createEditorState([
      { id: IDS.stale, children: [{ id: IDS.active }, { id: IDS.sibling }] },
    ]);

    expect(resolve({ ...fixture, editorState })).toEqual(
      unavailable({ kind: "target-unavailable", targetId: IDS.target }),
    );
  });

  it("returns target-unavailable when a Sequence has no current authoring active child", () => {
    const fixture = createFixture(InteractionTargetKind.Region, "region", SEQUENCE);
    const authoringState = createAuthoringState([[IDS.target, [IDS.active, IDS.sibling], null]]);

    expect(resolve({ ...fixture, authoringState })).toEqual(
      unavailable({ kind: "target-unavailable", targetId: IDS.target }),
    );
  });

  it("returns retained-child-unavailable for a stale authoring active child without guessing a sibling", () => {
    const fixture = createFixture(InteractionTargetKind.Cell, "cell", SEQUENCE);
    const authoringState = createAuthoringState([
      [IDS.target, [IDS.active, IDS.sibling], IDS.stale],
    ]);

    expect(resolve({ ...fixture, authoringState })).toEqual(
      unavailable({
        kind: "retained-child-unavailable",
        targetId: IDS.target,
        activeChildId: IDS.stale,
      }),
    );
  });

  it("returns retained-child-selection-unavailable when the active child's semantic location is missing", () => {
    const fixture = createFixture(InteractionTargetKind.Section, "layout-section", SEQUENCE);
    const locationById = new Map(fixture.snapshot.locationById);
    locationById.delete(IDS.active);

    expect(
      resolve({
        ...fixture,
        snapshot: Object.freeze({ ...fixture.snapshot, locationById }),
      }),
    ).toEqual(
      unavailable({
        kind: "retained-child-selection-unavailable",
        targetId: IDS.target,
        activeChildId: IDS.active,
      }),
    );
  });

  it("returns retained-child-selection-unavailable when the active location has stale document identity", () => {
    const fixture = createFixture(InteractionTargetKind.Region, "region", SEQUENCE);
    const editorState = createEditorState([
      { id: IDS.target, children: [{ id: IDS.stale }, { id: IDS.sibling }] },
    ]);

    expect(resolve({ ...fixture, editorState })).toEqual(
      unavailable({
        kind: "retained-child-selection-unavailable",
        targetId: IDS.target,
        activeChildId: IDS.active,
      }),
    );
  });

  it("returns retained-child-selection-unavailable for a malformed semantic selection target", () => {
    const fixture = createFixture(InteractionTargetKind.Region, "region", SEQUENCE);
    const locationById = new Map(fixture.snapshot.locationById);
    const activeLocation = locationById.get(IDS.active)!;
    locationById.set(
      IDS.active,
      Object.freeze({
        ...activeLocation,
        selectionTarget: Object.freeze({ kind: "near" as const, pos: activeLocation.to + 10 }),
      }),
    );

    expect(
      resolve({
        ...fixture,
        snapshot: Object.freeze({ ...fixture.snapshot, locationById }),
      }),
    ).toEqual(
      unavailable({
        kind: "retained-child-selection-unavailable",
        targetId: IDS.target,
        activeChildId: IDS.active,
      }),
    );
  });

  it("keeps an eligible target without a valid stable ID observable as a programming defect", () => {
    const state = createEditorState([{ id: IDS.target, children: [{ id: IDS.active }] }]);

    expect(() =>
      resolveContentLayoutStructuralActivationPlacement({
        state,
        target: { kind: InteractionTargetKind.Region },
      }),
    ).toThrowError("Content Layout structural activation requires a valid embedded node ID.");
  });
});

interface Fixture {
  readonly editorState: EditorState;
  readonly snapshot: SemanticDocumentSnapshot;
  readonly authoringState: ContentLayoutAuthoringState;
  readonly target: InteractionTargetRef;
}

interface DocumentItem {
  readonly id: EmbeddedNodeId;
  readonly children?: readonly DocumentItem[];
}

interface TestSemanticItem {
  readonly id: EmbeddedNodeId;
  readonly parentId: EmbeddedNodeId | null;
  readonly kind: SemanticItemKind;
  readonly contentLayout?: typeof FLOW | typeof SEQUENCE;
}

function createFixture(
  targetKind: InteractionTargetRef["kind"],
  semanticKind: SemanticItemKind,
  contentLayout: typeof FLOW | typeof SEQUENCE,
): Fixture {
  const editorState = createEditorState([
    { id: IDS.target, children: [{ id: IDS.active }, { id: IDS.sibling }] },
  ]);
  const snapshot = buildSnapshot(editorState.doc, [
    item(IDS.target, null, semanticKind, contentLayout),
    item(IDS.active, IDS.target, "rich-text"),
    item(IDS.sibling, IDS.target, "rich-text"),
  ]);
  const authoringState = createAuthoringState([
    [IDS.target, [IDS.active, IDS.sibling], contentLayout === SEQUENCE ? IDS.active : null],
  ]);
  return {
    editorState,
    snapshot,
    authoringState,
    target: { id: IDS.target, kind: targetKind, pos: 999 },
  };
}

function resolve(fixture: Fixture, supplyAuthoringState = true) {
  const controllerSnapshot: SemanticDocumentControllerSnapshot = Object.freeze({
    semantics: fixture.snapshot,
    selectedId: null,
    selectionOrigin: null,
  });
  dependencyMocks.getSemanticDocumentControllerForState.mockReturnValue({
    getSnapshot: () => controllerSnapshot,
  });
  if (supplyAuthoringState) {
    dependencyMocks.readContentLayoutAuthoringState.mockReturnValue(fixture.authoringState);
  }

  return resolveContentLayoutStructuralActivationPlacement({
    state: fixture.editorState,
    target: fixture.target,
  });
}

function createEditorState(items: readonly DocumentItem[]): EditorState {
  return EditorState.create({
    schema: TEST_SCHEMA,
    doc: TEST_SCHEMA.node("doc", null, items.map(createDocumentNode)),
  });
}

function createDocumentNode(input: DocumentItem): ProseMirrorNode {
  const children = input.children?.map(createDocumentNode);
  return TEST_SCHEMA.node(
    children === undefined ? "child" : "container",
    { id: input.id },
    children,
  );
}

function buildSnapshot(
  doc: ProseMirrorNode,
  items: readonly TestSemanticItem[],
): SemanticDocumentSnapshot {
  const documentNodes = new Map<
    EmbeddedNodeId,
    { readonly node: ProseMirrorNode; readonly pos: number }
  >();
  doc.descendants((node, pos) => {
    const parsedId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
    if (parsedId.success) documentNodes.set(parsedId.data, { node, pos });
    return true;
  });

  const builder = createSemanticSnapshotBuilder({ revision: 1, mode: "page" });
  for (const testItem of items) {
    const documentNode = documentNodes.get(testItem.id);
    if (!documentNode) throw new Error(`Missing test document node ${testItem.id}.`);
    const semanticItem: SemanticSnapshotItemInput = {
      id: testItem.id,
      kind: testItem.kind,
      nodeType: documentNode.node.type.name,
      definitionId: null,
      label: testItem.id,
      summary: null,
      presentation: { actionIds: [], disabledReason: null },
      presentationContainer:
        testItem.contentLayout === undefined ? null : { contentLayout: testItem.contentLayout },
    };
    builder.addItem({
      item: semanticItem,
      parentId: testItem.parentId,
      location: {
        id: testItem.id,
        nodeType: documentNode.node.type.name,
        from: documentNode.pos,
        to: documentNode.pos + documentNode.node.nodeSize,
        selectionTarget: { kind: "node", pos: documentNode.pos },
        surfaceId: null,
        authoringAnchorId: null,
        activationPath: [],
      },
    });
  }
  return builder.build();
}

function createAuthoringState(
  entries: readonly (readonly [EmbeddedNodeId, readonly EmbeddedNodeId[], EmbeddedNodeId | null])[],
): ContentLayoutAuthoringState {
  return Object.freeze({
    containers: new Map(
      entries.map(([containerId, directChildIds, activeChildId]) => [
        containerId,
        Object.freeze({
          containerId,
          directChildIds: Object.freeze([...directChildIds]),
          activeChildId,
          resolution: activeChildId === null ? "flow" : "retained",
        }),
      ]),
    ),
    projectionInputs: Object.freeze([]),
  });
}

function item(
  itemId: EmbeddedNodeId,
  parentId: EmbeddedNodeId | null,
  kind: SemanticItemKind,
  contentLayout?: typeof FLOW | typeof SEQUENCE,
): TestSemanticItem {
  return {
    id: itemId,
    parentId,
    kind,
    ...(contentLayout === undefined ? {} : { contentLayout }),
  };
}

function unavailable(
  issue: Extract<
    StructuralActivationPlacementResolution,
    { readonly kind: "placement-unavailable" }
  >["issue"],
): StructuralActivationPlacementResolution {
  return { kind: "placement-unavailable", issue };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
