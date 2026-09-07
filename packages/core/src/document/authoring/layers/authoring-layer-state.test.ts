import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vite-plus/test";

import type {
  DocumentItemActivation,
  DocumentTreeDefinitionLookup,
  DocumentTreeItem,
  DocumentTreeSnapshot,
} from "@/document/model/document-tree";
import { createSemanticActivationRegistry } from "@/document/semantic-target-interaction";
import { createDocumentAuthoringLifecycle } from "@/document/authoring/document-authoring-lifecycle";
import { EditorNavigationCoordinator } from "@/document/authoring/editor-navigation/editor-navigation";

import { AuthoringLayerState } from "./authoring-layer-state";

const IDS = {
  surface: id("surface00001"),
  region: id("region000001"),
  section: id("section00001"),
  cell: id("cell00000001"),
  grid: id("grid00000001"),
  outerLayer: id("outerlayer01"),
  outerSiblingLayer: id("outerlayer02"),
  regionLayer1: id("rlayer000001"),
  regionLayer2: id("rlayer000002"),
  regionLayer3: id("rlayer000003"),
  sectionLayer1: id("slayer000001"),
  sectionLayer2: id("slayer000002"),
  cellLayer1: id("clayer000001"),
  cellLayer2: id("clayer000002"),
  paragraph1: id("paragraph001"),
  paragraph2: id("paragraph002"),
  outerSiblingParagraph: id("paragraph003"),
  replacementParagraph: id("replacement1"),
  missing: id("missing00001"),
} as const;

describe("AuthoringLayerState", () => {
  it("opens Layers only for explicit authoring origins and preserves already-visible paths", async () => {
    const registry = createSemanticActivationRegistry();
    const state = new AuthoringLayerState({
      documentTree: ownerSnapshot(),
      activationRegistry: registry,
    });
    expect([...state.getSnapshot().openLayerByOwnerId]).toEqual([
      [IDS.region, IDS.regionLayer1],
      [IDS.section, IDS.sectionLayer1],
      [IDS.cell, IDS.cellLayer1],
    ]);
    expect(state.openAncestorsForTarget(ownerSnapshot(), IDS.missing)).toEqual({
      kind: "missing-target",
      targetId: IDS.missing,
    });

    const regionBinding = requireBinding(registry, IDS.region);
    await expect(
      regionBinding.activate(
        activationRequest(IDS.region, IDS.regionLayer1, "region", "configured-presentation"),
      ),
    ).resolves.toEqual({
      kind: "already-visible",
      ownerId: IDS.region,
      childId: IDS.regionLayer1,
    });
    for (const origin of [
      "author-preview",
      "configured-presentation",
      "learner-interaction-rule",
    ] as const) {
      await expect(
        regionBinding.activate(activationRequest(IDS.region, IDS.regionLayer2, "region", origin)),
      ).resolves.toEqual({
        kind: "refused",
        ownerId: IDS.region,
        childId: IDS.regionLayer2,
        reason: "hidden-layer-ancestor",
      });
      expect(state.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer1);
    }

    await expect(
      regionBinding.activate(
        activationRequest(IDS.region, IDS.regionLayer2, "region", "document-outline"),
      ),
    ).resolves.toEqual({
      kind: "revealed",
      ownerId: IDS.region,
      childId: IDS.regionLayer2,
    });
    expect(state.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer2);

    await expect(
      regionBinding.activate(
        activationRequest(IDS.region, IDS.missing, "region", "document-outline"),
      ),
    ).resolves.toEqual({
      kind: "unavailable",
      ownerId: IDS.region,
      childId: IDS.missing,
      reason: "child-missing",
    });
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      regionBinding.activate({
        ...activationRequest(IDS.region, IDS.regionLayer1, "region", "document-outline"),
        signal: cancelled.signal,
      }),
    ).resolves.toEqual({
      kind: "interrupted",
      ownerId: IDS.region,
      childId: IDS.regionLayer1,
    });
    await expect(
      regionBinding.activate(
        activationRequest(IDS.region, IDS.regionLayer1, "cell", "document-outline"),
      ),
    ).rejects.toThrow(
      `Layer activation owner "${IDS.region}" expected kind "region" but received "cell".`,
    );
  });

  it("reconciles deletion to preceding then following siblings and removes stale owners", async () => {
    const registry = createSemanticActivationRegistry();
    const state = new AuthoringLayerState({
      documentTree: ownerSnapshot(),
      activationRegistry: registry,
    });
    const regionBinding = requireBinding(registry, IDS.region);
    await regionBinding.activate(
      activationRequest(IDS.region, IDS.regionLayer3, "region", "presentation-timeline"),
    );

    state.reconcile(
      ownerSnapshot({
        regionLayers: [IDS.regionLayer1, IDS.regionLayer2],
        cellLayers: [IDS.cellLayer2],
      }),
    );
    expect(state.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer2);
    expect(state.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer2);
    expect(requireBinding(registry, IDS.region)).toBe(regionBinding);

    state.reconcile(ownerSnapshot({ regionLayers: [IDS.regionLayer2], includeCell: false }));
    expect(state.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer2);
    expect(state.getOpenLayerId(IDS.cell)).toBeNull();
    expect(registry.resolve(IDS.cell)).toEqual({
      kind: "unavailable",
      ownerId: IDS.cell,
      reason: "owner-unmounted",
    });
  });

  it("integrates with controller navigation, row selection, restored selection and disposal", async () => {
    let editorState = EditorState.create({ doc: candidateDocument(true) });
    const lifecycle = createDocumentAuthoringLifecycle(editorState, candidateDefinitions);
    const layers = lifecycle.editorNavigation.authoringLayers;
    const originalDocument = editorState.doc;
    expect(layers.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer1);

    lifecycle.editorNavigation.reportComponentSelection(IDS.regionLayer2);
    expect(layers.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer1);
    expect(editorState.doc).toBe(originalDocument);

    lifecycle.editorNavigation.setEditor({
      dispatch(transaction) {
        editorState = editorState.apply(transaction);
        lifecycle.applyTransaction(transaction, editorState);
      },
      focus() {},
    });
    lifecycle.editorNavigation.setEnvironment({
      presentSurface: async () => undefined,
      bringIntoView: async () => undefined,
      createActivationTransaction(location) {
        const selection = location.selectionTarget;
        if (selection.kind !== "text") throw new Error("Expected nearest Layer text content");
        return editorState.tr.setSelection(
          TextSelection.create(editorState.doc, selection.from, selection.to),
        );
      },
    });

    await expect(
      lifecycle.editorNavigation.showTarget(IDS.regionLayer2, {
        origin: "document-outline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "reached", id: IDS.regionLayer2 });
    expect(layers.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer2);
    expect(editorState.selection.from).toBe(findNode(editorState.doc, IDS.paragraph2).pos + 1);

    const deleted = candidateDocument(false);
    const deletion = editorState.tr.replaceWith(0, editorState.doc.content.size, deleted.content);
    editorState = editorState.apply(deletion);
    lifecycle.applyTransaction(deletion, editorState);
    expect(layers.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer1);

    const restored = candidateDocument(true);
    const restoration = editorState.tr.replaceWith(
      0,
      editorState.doc.content.size,
      restored.content,
    );
    const restoredParagraph = findNode(restoration.doc, IDS.paragraph2);
    restoration.setSelection(TextSelection.create(restoration.doc, restoredParagraph.pos + 1));
    editorState = editorState.apply(restoration);
    lifecycle.applyTransaction(restoration, editorState);
    expect(layers.getOpenLayerId(IDS.region)).toBe(IDS.regionLayer2);

    lifecycle.dispose();
    expect(lifecycle.targetInteractions.registry.resolve(IDS.region)).toEqual({
      kind: "unavailable",
      ownerId: IDS.region,
      reason: "owner-unmounted",
    });
  });

  it("opens nested content before editing and interrupts if its path changes during scroll", async () => {
    let editorState = EditorState.create({ doc: nestedCandidateDocument() });
    const lifecycle = createDocumentAuthoringLifecycle(editorState, candidateDefinitions);
    const navigation = lifecycle.editorNavigation;
    const layers = navigation.authoringLayers;
    let editingOuterLayer = false;
    let checkedBeforeScroll = false;
    let checkedBeforeSelection = false;
    let checkedBeforeFocus = false;
    let moveContentDuringScroll = false;
    let movedContent = false;
    let navigationDispatches = 0;
    let focusCount = 0;

    navigation.setEditor({
      dispatch(transaction) {
        if (editingOuterLayer) {
          expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer1);
          checkedBeforeSelection = true;
        }
        navigationDispatches += 1;
        editorState = editorState.apply(transaction);
        lifecycle.applyTransaction(transaction, editorState);
      },
      focus() {
        if (editingOuterLayer) {
          expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer1);
          checkedBeforeFocus = true;
        }
        focusCount += 1;
      },
    });
    navigation.setEnvironment({
      presentSurface: async () => undefined,
      bringIntoView: async (location) => {
        if (editingOuterLayer) {
          expect(location.id).toBe(IDS.paragraph1);
          expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer1);
          checkedBeforeScroll = true;
        }
        if (moveContentDuringScroll && !movedContent && location.id === IDS.paragraph1) {
          movedContent = true;
          const cellLocation = lifecycle.documentTree.getSnapshot().locationById.get(IDS.cell);
          if (!cellLocation) throw new Error("Expected nested Cell location");
          const paragraph = (paragraphId: EmbeddedNodeId, text: string) =>
            candidateSchema.node("paragraph", { id: paragraphId }, [candidateSchema.text(text)]);
          const replacement = editorState.tr.replaceWith(
            cellLocation.from + 1,
            cellLocation.to - 1,
            [
              candidateSchema.node("layer", { id: IDS.cellLayer1 }, [
                paragraph(IDS.replacementParagraph, "Replacement"),
              ]),
              candidateSchema.node("layer", { id: IDS.cellLayer2 }, [
                paragraph(IDS.paragraph1, "First"),
                paragraph(IDS.paragraph2, "Second"),
              ]),
            ],
          );
          expect(replacement.selectionSet).toBe(false);
          editorState = editorState.apply(replacement);
          lifecycle.applyTransaction(replacement, editorState);
        }
      },
      createActivationTransaction(location) {
        const selection = location.selectionTarget;
        if (selection.kind !== "text") throw new Error("Expected nearest Layer text content");
        return editorState.tr.setSelection(
          TextSelection.create(editorState.doc, selection.from, selection.to),
        );
      },
    });

    await expect(
      navigation.showTarget(IDS.paragraph2, { origin: "presentation-timeline" }),
    ).resolves.toEqual({ kind: "reached", id: IDS.paragraph2 });
    expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer2);

    editingOuterLayer = true;
    await expect(
      navigation.showTarget(IDS.outerLayer, {
        origin: "presentation-timeline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "reached", id: IDS.outerLayer });

    expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer1);
    expect(editorState.selection.from).toBe(findNode(editorState.doc, IDS.paragraph1).pos + 1);
    expect({ checkedBeforeScroll, checkedBeforeSelection, checkedBeforeFocus }).toEqual({
      checkedBeforeScroll: true,
      checkedBeforeSelection: true,
      checkedBeforeFocus: true,
    });

    editingOuterLayer = false;
    await expect(
      navigation.showTarget(IDS.paragraph2, { origin: "presentation-timeline" }),
    ).resolves.toEqual({ kind: "reached", id: IDS.paragraph2 });
    expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer2);

    const dispatchesBeforeInterruptedEdit = navigationDispatches;
    const focusesBeforeInterruptedEdit = focusCount;
    editingOuterLayer = true;
    moveContentDuringScroll = true;
    await expect(
      navigation.showTarget(IDS.outerLayer, {
        origin: "presentation-timeline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "interrupted", id: IDS.outerLayer });

    expect(movedContent).toBe(true);
    expect(lifecycle.documentTree.getSnapshot().parentById.get(IDS.paragraph1)).toBe(
      IDS.cellLayer2,
    );
    expect(layers.getOpenLayerId(IDS.cell)).toBe(IDS.cellLayer1);
    expect(navigation.getSelectionSnapshot()).toMatchObject({
      selectedId: IDS.paragraph2,
      selectionOrigin: "presentation-timeline",
    });
    expect(navigationDispatches).toBe(dispatchesBeforeInterruptedEdit);
    expect(focusCount).toBe(focusesBeforeInterruptedEdit);
    lifecycle.dispose();
  });

  it("interrupts fallback navigation when its owner moves under a hidden Layer", async () => {
    let editorState = EditorState.create({ doc: nestedCandidateDocument() });
    const lifecycle = createDocumentAuthoringLifecycle(editorState, candidateDefinitions);
    const layers = lifecycle.editorNavigation.authoringLayers;
    lifecycle.editorNavigation.reportComponentSelection(IDS.outerLayer);
    let navigationDispatches = 0;
    let focusCount = 0;
    let movedFallbackOwner = false;
    const navigation = new EditorNavigationCoordinator({
      targetInteractions: {
        activate: async (requestedId) => ({
          kind: "unavailable",
          requestedId,
          ownerId: IDS.cell,
          childId: IDS.cellLayer1,
          nearestReachableOwnerId: IDS.cell,
          reason: "temporarily-unavailable",
        }),
      },
      getDocumentTree: lifecycle.documentTree.getSnapshot,
      getCourseStructure: lifecycle.documentTree.getCourseStructure,
      editor: {
        dispatch() {
          navigationDispatches += 1;
        },
        focus() {
          focusCount += 1;
        },
      },
      environment: {
        presentSurface: async () => undefined,
        createActivationTransaction: () => editorState.tr,
        bringIntoView: async (location) => {
          expect(location.id).toBe(IDS.cell);
          const regionLocation = lifecycle.documentTree.getSnapshot().locationById.get(IDS.region);
          if (!regionLocation) throw new Error("Expected nested Region location");
          const paragraph = (paragraphId: EmbeddedNodeId, text: string) =>
            candidateSchema.node("paragraph", { id: paragraphId }, [candidateSchema.text(text)]);
          const replacement = editorState.tr.replaceWith(
            regionLocation.from + 1,
            regionLocation.to - 1,
            [
              candidateSchema.node("layer", { id: IDS.outerLayer }, [
                paragraph(IDS.replacementParagraph, "Replacement"),
              ]),
              candidateSchema.node("layer", { id: IDS.outerSiblingLayer }, [
                candidateSchema.node("grid", { id: IDS.grid }, [
                  candidateSchema.node("cell", { id: IDS.cell }, [
                    candidateSchema.node("layer", { id: IDS.cellLayer1 }, [
                      paragraph(IDS.paragraph1, "First"),
                    ]),
                    candidateSchema.node("layer", { id: IDS.cellLayer2 }, [
                      paragraph(IDS.paragraph2, "Second"),
                    ]),
                  ]),
                ]),
              ]),
            ],
          );
          expect(replacement.selectionSet).toBe(false);
          editorState = editorState.apply(replacement);
          lifecycle.applyTransaction(replacement, editorState);
          movedFallbackOwner = true;
        },
      },
    });

    await expect(
      navigation.showTarget(IDS.outerLayer, {
        origin: "document-outline",
        focusEditor: true,
      }),
    ).resolves.toEqual({ kind: "interrupted", id: IDS.outerLayer });

    const movedCell = lifecycle.documentTree.getSnapshot().locationById.get(IDS.cell);
    expect(movedFallbackOwner).toBe(true);
    expect(movedCell?.activationPath).toContainEqual({
      ownerId: IDS.region,
      childId: IDS.outerSiblingLayer,
      ownerKind: "region",
    });
    expect(layers.getOpenLayerId(IDS.region)).toBe(IDS.outerLayer);
    expect(navigationDispatches).toBe(0);
    expect(focusCount).toBe(0);
    navigation.dispose();
    lifecycle.dispose();
  });
});

const candidateSchema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "surface+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    surface: {
      content: "region+",
      selectable: false,
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      content: "layer+",
      selectable: false,
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    layer: {
      content: "(paragraph | grid)+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    grid: {
      content: "cell+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    cell: {
      content: "layer+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

const candidateDefinitions: DocumentTreeDefinitionLookup = Object.freeze({
  blocks: Object.freeze({ get: () => undefined }),
  layouts: Object.freeze({ get: () => undefined }),
  surfaces: Object.freeze({
    get: (variant: string) =>
      variant === "page-default" ? { id: variant, title: "Page" } : undefined,
  }),
});

function candidateDocument(includeSecondLayer: boolean): ProseMirrorNode {
  const paragraph = (paragraphId: EmbeddedNodeId, text: string) =>
    candidateSchema.node("paragraph", { id: paragraphId }, [candidateSchema.text(text)]);
  const layers = [
    candidateSchema.node("layer", { id: IDS.regionLayer1 }, [paragraph(IDS.paragraph1, "First")]),
  ];
  if (includeSecondLayer) {
    layers.push(
      candidateSchema.node("layer", { id: IDS.regionLayer2 }, [
        paragraph(IDS.paragraph2, "Second"),
      ]),
    );
  }
  return candidateSchema.node("doc", null, [
    candidateSchema.node("courseDocument", { id: id("course000001"), mode: "page" }, [
      candidateSchema.node("surface", { id: IDS.surface, variant: "page-default" }, [
        candidateSchema.node("region", { id: IDS.region, role: "main" }, layers),
      ]),
    ]),
  ]);
}

function nestedCandidateDocument(): ProseMirrorNode {
  const paragraph = (paragraphId: EmbeddedNodeId, text: string) =>
    candidateSchema.node("paragraph", { id: paragraphId }, [candidateSchema.text(text)]);
  return candidateSchema.node("doc", null, [
    candidateSchema.node("courseDocument", { id: id("course000001"), mode: "page" }, [
      candidateSchema.node("surface", { id: IDS.surface, variant: "page-default" }, [
        candidateSchema.node("region", { id: IDS.region, role: "main" }, [
          candidateSchema.node("layer", { id: IDS.outerLayer }, [
            candidateSchema.node("grid", { id: IDS.grid }, [
              candidateSchema.node("cell", { id: IDS.cell }, [
                candidateSchema.node("layer", { id: IDS.cellLayer1 }, [
                  paragraph(IDS.paragraph1, "First"),
                ]),
                candidateSchema.node("layer", { id: IDS.cellLayer2 }, [
                  paragraph(IDS.paragraph2, "Second"),
                ]),
              ]),
            ]),
          ]),
          candidateSchema.node("layer", { id: IDS.outerSiblingLayer }, [
            paragraph(IDS.outerSiblingParagraph, "Alternative"),
          ]),
        ]),
      ]),
    ]),
  ]);
}

function ownerSnapshot(
  options: {
    readonly regionLayers?: readonly EmbeddedNodeId[];
    readonly cellLayers?: readonly EmbeddedNodeId[];
    readonly includeCell?: boolean;
  } = {},
): DocumentTreeSnapshot {
  const regionLayers = options.regionLayers ?? [
    IDS.regionLayer1,
    IDS.regionLayer2,
    IDS.regionLayer3,
  ];
  const cellLayers = options.cellLayers ?? [IDS.cellLayer1, IDS.cellLayer2];
  const children = [
    treeItem(
      "region",
      IDS.region,
      regionLayers.map((layerId) => treeItem("layer", layerId)),
    ),
    treeItem("layout-section", IDS.section, [
      treeItem("layer", IDS.sectionLayer1),
      treeItem("layer", IDS.sectionLayer2),
    ]),
  ];
  if (options.includeCell !== false) {
    children.push(
      treeItem(
        "cell",
        IDS.cell,
        cellLayers.map((layerId) => treeItem("layer", layerId)),
      ),
    );
  }
  return createSnapshot([treeItem("surface", IDS.surface, children)]);
}

function treeItem(
  kind: DocumentTreeItem["kind"],
  itemId: EmbeddedNodeId,
  children: readonly DocumentTreeItem[] = [],
): DocumentTreeItem {
  return Object.freeze({
    id: itemId,
    kind,
    nodeType: kind === "layout-section" ? "section" : kind,
    definitionId: null,
    label: kind,
    summary: null,
    presentation: Object.freeze({ actionIds: [], disabledReason: null }),
    children: Object.freeze([...children]),
  });
}

function createSnapshot(roots: readonly DocumentTreeItem[]): DocumentTreeSnapshot {
  const itemById = new Map<EmbeddedNodeId, DocumentTreeItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const locationById = new Map();
  const visit = (item: DocumentTreeItem, parentId: EmbeddedNodeId | null): void => {
    itemById.set(item.id, item);
    parentById.set(item.id, parentId);
    locationById.set(item.id, {
      id: item.id,
      nodeType: item.nodeType,
      from: 0,
      to: 1,
      selectionTarget: { kind: "near", pos: 0 },
      surfaceId: IDS.surface,
      authoringAnchorId: null,
      activationPath: [],
    });
    for (const child of item.children) visit(child, item.id);
  };
  for (const root of roots) visit(root, null);
  return Object.freeze({
    revision: 0,
    mode: "page",
    roots: Object.freeze([...roots]),
    itemById,
    parentById,
    locationById,
    diagnostics: Object.freeze([]),
  });
}

function activationRequest(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  ownerKind: DocumentItemActivation["ownerKind"],
  origin: Parameters<ReturnType<typeof requireBinding>["activate"]>[0]["origin"],
) {
  return {
    requestedId: childId,
    relationship: { ownerId, childId, ownerKind },
    origin,
    causationId: "test",
    signal: new AbortController().signal,
  };
}

function requireBinding(
  registry: ReturnType<typeof createSemanticActivationRegistry>,
  ownerId: EmbeddedNodeId,
) {
  const resolution = registry.resolve(ownerId);
  if (resolution.kind !== "resolved") throw new Error(`Expected binding for "${ownerId}".`);
  return resolution.binding;
}

function findNode(
  doc: ProseMirrorNode,
  nodeId: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let found: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] === nodeId) found = { node, pos };
    return found === null;
  });
  if (!found) throw new Error(`Missing node "${nodeId}".`);
  return found;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
