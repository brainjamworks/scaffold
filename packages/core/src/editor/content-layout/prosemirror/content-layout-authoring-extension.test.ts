// @vitest-environment happy-dom

import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection, Plugin, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createDocumentTreeSnapshotBuilder,
  type DocumentTreeSnapshotItemInput,
} from "@/document/model/document-tree/document-tree-snapshot-builder";
import type { EditorSelectionSnapshot } from "@/document/authoring/editor-navigation";
import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";
import { CONTENT_LAYOUT_ATTR } from "../model/content-layout-attribute";
import {
  ContentLayoutProjectionExtension,
  readContentLayoutProjectionDecorations,
  readContentLayoutProjectionDiagnostics,
} from "./content-layout-projection-extension";
import {
  ContentLayoutAuthoringExtension,
  readContentLayoutAuthoringState,
} from "./content-layout-authoring-extension";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;
const TEST_SELECTION_META = "content-layout-authoring-test-selection";

const IDS = {
  firstRegion: id("region000001"),
  secondRegion: id("region000002"),
  flowRegion: id("region000003"),
  first: id("child-000001"),
  second: id("child-000002"),
  third: id("child-000003"),
  fourth: id("child-000004"),
  inserted: id("child-000005"),
  replacement: id("child-000006"),
  innerRegion: id("region000004"),
  innerFirst: id("child-000007"),
  innerSecond: id("child-000008"),
  unrelated: id("child-000009"),
} as const;

const TestDocumentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "container*",
});

const TestContainerNode = Node.create({
  name: "container",
  group: "container containerChild",
  content: "containerChild*",

  addAttributes() {
    return {
      id: { default: null },
      [CONTENT_LAYOUT_ATTR]: { default: FLOW },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", HTMLAttributes, 0];
  },
});

const TestChildNode = Node.create({
  name: "child",
  group: "block containerChild",
  atom: true,

  addAttributes() {
    return { id: { default: null } };
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

interface ContainerInput {
  readonly id: EmbeddedNodeId;
  readonly contentLayout: PresentationContentLayout;
  readonly children: readonly (ContainerInput | ChildInput)[];
}

interface ChildInput {
  readonly id: EmbeddedNodeId;
}

class TestDocumentTreeStore {
  #snapshot: ReturnType<typeof createSnapshot>;
  #listeners = new Set<() => void>();

  constructor(doc: ProseMirrorNode) {
    this.#snapshot = createSnapshot(doc, 0);
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  applyTransaction(transaction: Transaction, state: EditorState): void {
    if (!transaction.docChanged) return;
    this.#snapshot = createSnapshot(state.doc, this.#snapshot.revision + 1);
    for (const listener of this.#listeners) listener();
  }
}

class TestEditorNavigationController {
  #snapshot: EditorSelectionSnapshot = Object.freeze({ selectedId: null, selectionOrigin: null });
  #listeners = new Set<() => void>();

  get listenerCount(): number {
    return this.#listeners.size;
  }

  getSelectionSnapshot = (): EditorSelectionSnapshot => this.#snapshot;

  subscribeSelection = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  reportComponentSelection(selectedId: EmbeddedNodeId): void {
    if (
      this.#snapshot.selectedId === selectedId &&
      this.#snapshot.selectionOrigin === "component"
    ) {
      return;
    }
    this.#snapshot = Object.freeze({ selectedId, selectionOrigin: "component" });
    this.#publish();
  }

  publishEquivalentSnapshot(): void {
    this.#publish();
  }

  applyTransaction(transaction: Transaction, _state: EditorState): void {
    if (!transaction.docChanged && !transaction.selectionSet) return;

    const previous = this.#snapshot;
    const selectionMeta = transaction.getMeta(TEST_SELECTION_META) as
      | { readonly selectedId: EmbeddedNodeId | null }
      | undefined;
    const selectedId = selectionMeta === undefined ? previous.selectedId : selectionMeta.selectedId;
    const selectionOrigin =
      selectedId === null
        ? null
        : selectionMeta === undefined
          ? previous.selectionOrigin
          : ("editor" as const);

    if (selectedId === previous.selectedId && selectionOrigin === previous.selectionOrigin) {
      return;
    }

    this.#snapshot = Object.freeze({ selectedId, selectionOrigin });
    this.#publish();
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }
}

describe("ContentLayoutAuthoringExtension", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["Flow", [{ id: IDS.flowRegion, contentLayout: FLOW, children: [{ id: IDS.unrelated }] }]],
    ["empty Sequence", [{ id: IDS.firstRegion, contentLayout: SEQUENCE, children: [] }]],
    [
      "non-empty Sequence",
      [
        {
          id: IDS.firstRegion,
          contentLayout: SEQUENCE,
          children: [{ id: IDS.first }, { id: IDS.second }, { id: IDS.third }],
        },
      ],
    ],
  ] as const)(
    "bootstraps %s through one complete metadata-only batch",
    async (_name, containers) => {
      const editor = createEditor(containers);
      try {
        const beforeJSON = JSON.stringify(editor.state.doc.toJSON());
        const appendedTransactions = observeTransactions(editor);
        const macrotask = vi.fn();
        setTimeout(macrotask, 0);

        await flushMicrotasks();

        expect(macrotask).not.toHaveBeenCalled();
        expect(appendedTransactions).toHaveLength(1);
        expect(appendedTransactions[0]?.steps).toHaveLength(0);
        expect(appendedTransactions[0]?.docChanged).toBe(false);
        expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
        expect(JSON.stringify(editor.state.doc.toJSON())).toBe(beforeJSON);
        expect(editor.can().undo()).toBe(false);

        const state = readContentLayoutAuthoringState(editor.state);
        const container = state.containers.get(containers[0]!.id);
        if (containers[0]!.contentLayout === FLOW) {
          expect(container?.activeChildId).toBeNull();
          expect(container?.resolution).toBe("flow");
          expect(readContentLayoutProjectionDecorations(editor.state).find()).toHaveLength(0);
        } else if (containers[0]!.children.length === 0) {
          expect(container?.activeChildId).toBeNull();
          expect(container?.resolution).toBe("empty");
          expect(readContentLayoutProjectionDecorations(editor.state).find()).toHaveLength(0);
        } else {
          expect(container?.activeChildId).toBe(IDS.first);
          expect(container?.resolution).toBe("first-child");
          expect(decorationChildIds(editor.state)).toEqual([IDS.first, IDS.second, IDS.third]);
        }
        vi.runOnlyPendingTimers();
        expect(macrotask).toHaveBeenCalledOnce();
      } finally {
        editor.destroy();
      }
    },
  );

  it("publishes ordinary ProseMirror selection once without subscription double-publish", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      const appendedTransactions = observeAppendedTransactions(editor);
      selectNode(editor, IDS.second);
      await flushMicrotasks();

      expect(appendedTransactions).toHaveLength(1);
      expect(appendedTransactions[0]?.steps).toHaveLength(0);
      expect(editor.can().undo()).toBe(false);
      expect(readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)).toEqual(
        {
          containerId: IDS.firstRegion,
          directChildIds: [IDS.first, IDS.second],
          activeChildId: IDS.second,
          resolution: "selected",
        },
      );
      expect(decorationChildIds(editor.state)).toEqual([IDS.first, IDS.second]);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.second);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("publishes navigation-only selection changes without a document step or history entry", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      const beforeJSON = JSON.stringify(editor.state.doc.toJSON());
      const beforeSelection = editor.state.selection.toJSON();
      const transactions = observeTransactions(editor);
      const navigation = getTestNavigation(editor);

      navigation.reportComponentSelection(IDS.second);
      await flushMicrotasks();

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.steps).toHaveLength(0);
      expect(transactions[0]?.docChanged).toBe(false);
      expect(JSON.stringify(editor.state.doc.toJSON())).toBe(beforeJSON);
      expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
      expect(editor.can().undo()).toBe(false);
      expect(navigation.getSelectionSnapshot().selectedId).toBe(IDS.second);
      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.second);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.second);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("keeps first-child initialization when Flow becomes Sequence with a later navigation selection", async () => {
    const editor = await createFlowEditorWithLaterControllerSelection();
    try {
      const appendedTransactions = observeAppendedTransactions(editor);
      const transition = transitionToSequence(editor);

      expect(transition.docChanged).toBe(true);
      expect(transition.steps).toHaveLength(1);
      expect(readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)).toEqual(
        {
          containerId: IDS.firstRegion,
          directChildIds: [IDS.first, IDS.second],
          activeChildId: IDS.first,
          resolution: "first-child",
        },
      );
      expect(availableDecorationChildId(editor.state)).toBe(IDS.first);
      expect(appendedTransactions).toHaveLength(1);
      expect(appendedTransactions[0]?.steps).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("reconciles explicit selection when the tree source identity is unchanged", async () => {
    const editor = await createFlowEditorWithLaterControllerSelection();
    try {
      const appendedTransactions = observeAppendedTransactions(editor);
      transitionToSequence(editor);
      const tree = getTestTree(editor);
      const navigation = getTestNavigation(editor);
      const documentTree = tree.getSnapshot();
      appendedTransactions.length = 0;

      selectNode(editor, IDS.second);
      await flushMicrotasks();

      expect(tree.getSnapshot()).toBe(documentTree);
      expect(navigation.getSelectionSnapshot().selectedId).toBe(IDS.second);
      expect(appendedTransactions).toHaveLength(1);
      expect(appendedTransactions[0]?.steps).toHaveLength(0);
      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.second);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.second);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("does not republish a repeated selection after explicit reconciliation", async () => {
    const editor = await createFlowEditorWithLaterControllerSelection();
    try {
      const appendedTransactions = observeAppendedTransactions(editor);
      transitionToSequence(editor);
      appendedTransactions.length = 0;

      selectNode(editor, IDS.second);
      await flushMicrotasks();
      expect(appendedTransactions).toHaveLength(1);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.second);

      appendedTransactions.length = 0;
      selectNode(editor, IDS.second);
      await flushMicrotasks();

      expect(appendedTransactions).toHaveLength(0);
      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.second);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.second);
    } finally {
      editor.destroy();
    }
  });

  it("coalesces same-tick navigation selections to the final state", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      const transactions = observeTransactions(editor);
      const navigation = getTestNavigation(editor);

      navigation.reportComponentSelection(IDS.second);
      navigation.reportComponentSelection(IDS.first);
      await flushMicrotasks();

      expect(transactions).toHaveLength(1);
      expect(navigation.getSelectionSnapshot().selectedId).toBe(IDS.first);
      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.first);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.first);
    } finally {
      editor.destroy();
    }
  });

  it("deduplicates repeated equivalent navigation publications", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      const transactions = observeTransactions(editor);
      const navigation = getTestNavigation(editor);

      navigation.reportComponentSelection(IDS.second);
      await flushMicrotasks();
      expect(transactions).toHaveLength(1);

      transactions.length = 0;
      navigation.publishEquivalentSnapshot();
      navigation.publishEquivalentSnapshot();
      await flushMicrotasks();

      expect(transactions).toHaveLength(0);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.second);
    } finally {
      editor.destroy();
    }
  });

  it("keeps Flow-to-Sequence first-child initialization after unchanged metadata", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      const navigation = getTestNavigation(editor);
      navigation.reportComponentSelection(IDS.second);
      await flushMicrotasks();

      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.first);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.first);

      const appendedTransactions = observeAppendedTransactions(editor);
      editor.view.dispatch(editor.state.tr.setMeta("unrelated-metadata", true));
      await flushMicrotasks();

      expect(appendedTransactions).toHaveLength(0);
      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.first);
      expect(availableDecorationChildId(editor.state)).toBe(IDS.first);
    } finally {
      editor.destroy();
    }
  });

  it("retains independent active children for container and unrelated selections", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
      {
        id: IDS.secondRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.third }, { id: IDS.fourth }],
      },
      { id: IDS.flowRegion, contentLayout: FLOW, children: [{ id: IDS.unrelated }] },
    ]);
    try {
      await flushMicrotasks();
      selectNode(editor, IDS.second);
      selectNode(editor, IDS.firstRegion);
      selectNode(editor, IDS.unrelated);

      const state = readContentLayoutAuthoringState(editor.state);
      expect(state.containers.get(IDS.firstRegion)?.activeChildId).toBe(IDS.second);
      expect(state.containers.get(IDS.secondRegion)?.activeChildId).toBe(IDS.third);
      expect(state.containers.get(IDS.firstRegion)?.directChildIds).toEqual([
        IDS.first,
        IDS.second,
      ]);
      expect(state.containers.get(IDS.secondRegion)?.directChildIds).toEqual([
        IDS.third,
        IDS.fourth,
      ]);
      expect(availableDecorationChildId(editor.state, IDS.firstRegion)).toBe(IDS.second);
      expect(availableDecorationChildId(editor.state, IDS.secondRegion)).toBe(IDS.third);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("activates an inserted direct child from the replacement snapshot", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      const containerPosition = findNodePosition(editor, IDS.firstRegion);
      const insertPosition = containerPosition + 1;
      const childType = editor.state.schema.nodes.child;
      if (!childType) throw new Error("Expected the test child node type.");
      const transaction = editor.state.tr.insert(
        insertPosition,
        childType.create({ id: IDS.inserted }),
      );
      transaction.setSelection(NodeSelection.create(transaction.doc, insertPosition));
      transaction.setMeta(TEST_SELECTION_META, { selectedId: IDS.inserted });
      const appendedTransactions = observeAppendedTransactions(editor);

      editor.view.dispatch(transaction);

      expect(transaction.steps).toHaveLength(1);
      expect(appendedTransactions).toHaveLength(1);
      expect(appendedTransactions[0]?.steps).toHaveLength(0);
      expect(readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)).toEqual(
        {
          containerId: IDS.firstRegion,
          directChildIds: [IDS.inserted, IDS.first, IDS.second],
          activeChildId: IDS.inserted,
          resolution: "selected",
        },
      );
      expect(availableDecorationChildId(editor.state)).toBe(IDS.inserted);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    [
      "next",
      [IDS.first, IDS.second, IDS.third],
      IDS.second,
      [IDS.first, IDS.third],
      IDS.third,
      "next-after-delete",
    ],
    [
      "previous",
      [IDS.first, IDS.second, IDS.third],
      IDS.third,
      [IDS.first, IDS.second],
      IDS.second,
      "previous-after-delete",
    ],
    ["empty", [IDS.second], IDS.second, [], null, "empty"],
  ] as const)(
    "normalizes active deletion to the %s surviving state",
    async (_name, initialIds, activeId, survivingIds, expectedId, resolution) => {
      const editor = createEditor([
        {
          id: IDS.firstRegion,
          contentLayout: SEQUENCE,
          children: initialIds.map((idValue) => ({ id: idValue })),
        },
      ]);
      try {
        await flushMicrotasks();
        selectNode(editor, activeId);
        const activePosition = findNodePosition(editor, activeId);
        const activeNode = editor.state.doc.nodeAt(activePosition);
        if (!activeNode) throw new Error("Expected an active child node.");
        const transaction = editor.state.tr.delete(
          activePosition,
          activePosition + activeNode.nodeSize,
        );
        transaction.setMeta(TEST_SELECTION_META, { selectedId: IDS.firstRegion });
        const appendedTransactions = observeAppendedTransactions(editor);

        editor.view.dispatch(transaction);

        expect(appendedTransactions).toHaveLength(1);
        expect(appendedTransactions[0]?.steps).toHaveLength(0);
        expect(
          readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion),
        ).toEqual({
          containerId: IDS.firstRegion,
          directChildIds: survivingIds,
          activeChildId: expectedId,
          resolution,
        });
        expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
        if (expectedId === null) {
          expect(readContentLayoutProjectionDecorations(editor.state).find()).toHaveLength(0);
        } else {
          expect(availableDecorationChildId(editor.state)).toBe(expectedId);
        }
      } finally {
        editor.destroy();
      }
    },
  );

  it("uses the first current child when an entire old Sequence is replaced", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      selectNode(editor, IDS.second);
      const containerPosition = findNodePosition(editor, IDS.firstRegion);
      const container = editor.state.doc.nodeAt(containerPosition);
      const childType = editor.state.schema.nodes.child;
      if (!container || !childType) throw new Error("Expected the test container and child type.");
      const transaction = editor.state.tr.replaceWith(
        containerPosition + 1,
        containerPosition + 1 + container.content.size,
        childType.create({ id: IDS.replacement }),
      );
      transaction.setMeta(TEST_SELECTION_META, { selectedId: IDS.firstRegion });
      const appendedTransactions = observeAppendedTransactions(editor);

      editor.view.dispatch(transaction);

      expect(appendedTransactions).toHaveLength(1);
      expect(readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)).toEqual(
        {
          containerId: IDS.firstRegion,
          directChildIds: [IDS.replacement],
          activeChildId: IDS.replacement,
          resolution: "first-child",
        },
      );
      expect(availableDecorationChildId(editor.state)).toBe(IDS.replacement);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("returns a Sequence to ordinary Flow projection", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      selectNode(editor, IDS.second);
      const containerPosition = findNodePosition(editor, IDS.firstRegion);
      const containerType = editor.state.schema.nodes.container;
      if (!containerType) throw new Error("Expected the test container node type.");
      const transaction = editor.state.tr.setNodeMarkup(containerPosition, containerType, {
        id: IDS.firstRegion,
        [CONTENT_LAYOUT_ATTR]: FLOW,
      });
      transaction.setMeta(TEST_SELECTION_META, { selectedId: IDS.firstRegion });
      const appendedTransactions = observeAppendedTransactions(editor);

      editor.view.dispatch(transaction);

      expect(appendedTransactions).toHaveLength(1);
      expect(readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)).toEqual(
        {
          containerId: IDS.firstRegion,
          directChildIds: [IDS.first, IDS.second],
          activeChildId: null,
          resolution: "flow",
        },
      );
      expect(readContentLayoutProjectionDecorations(editor.state).find()).toHaveLength(0);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("coordinates independent and nested Sequence containers from one batch", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [
          { id: IDS.first },
          {
            id: IDS.innerRegion,
            contentLayout: SEQUENCE,
            children: [{ id: IDS.innerFirst }, { id: IDS.innerSecond }],
          },
        ],
      },
      {
        id: IDS.secondRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.third }, { id: IDS.fourth }],
      },
    ]);
    try {
      await flushMicrotasks();
      const appendedTransactions = observeAppendedTransactions(editor);
      selectNode(editor, IDS.innerSecond);

      expect(appendedTransactions).toHaveLength(1);
      const state = readContentLayoutAuthoringState(editor.state);
      expect(state.containers.get(IDS.firstRegion)?.activeChildId).toBe(IDS.innerRegion);
      expect(state.containers.get(IDS.innerRegion)?.activeChildId).toBe(IDS.innerSecond);
      expect(state.containers.get(IDS.secondRegion)?.activeChildId).toBe(IDS.third);
      expect(availableDecorationChildId(editor.state, IDS.firstRegion)).toBe(IDS.innerRegion);
      expect(availableDecorationChildId(editor.state, IDS.innerRegion)).toBe(IDS.innerSecond);
      expect(availableDecorationChildId(editor.state, IDS.secondRegion)).toBe(IDS.third);
      expect(decorationChildIds(editor.state)).toEqual([
        IDS.first,
        IDS.innerRegion,
        IDS.innerFirst,
        IDS.innerSecond,
        IDS.third,
        IDS.fourth,
      ]);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("does not append another transaction for its own publication metadata", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      const appendedTransactions = observeTransactions(editor);
      await flushMicrotasks();

      expect(appendedTransactions).toHaveLength(1);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("does not append for equivalent navigation and derived state", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }, { id: IDS.second }],
      },
    ]);
    try {
      await flushMicrotasks();
      selectNode(editor, IDS.first);
      const appendedTransactions = observeAppendedTransactions(editor);

      selectNode(editor, IDS.first);

      expect(appendedTransactions).toHaveLength(0);
      expect(
        readContentLayoutAuthoringState(editor.state).containers.get(IDS.firstRegion)
          ?.activeChildId,
      ).toBe(IDS.first);
      expect(readContentLayoutProjectionDiagnostics(editor.state)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("cancels the guarded bootstrap when the editor is destroyed", async () => {
    const editor = createEditor([
      {
        id: IDS.firstRegion,
        contentLayout: SEQUENCE,
        children: [{ id: IDS.first }],
      },
    ]);
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const tree = getTestTree(editor);
    const navigation = getTestNavigation(editor);
    try {
      navigation.reportComponentSelection(IDS.first);
      editor.destroy();
      await flushMicrotasks();

      expect(tree.listenerCount).toBe(0);
      expect(navigation.listenerCount).toBe(0);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      if (!editor.isDestroyed) editor.destroy();
    }
  });

  it("keeps missing required extensions observable as configuration defects", () => {
    expect(
      () =>
        new Editor({
          extensions: [
            TestDocumentNode,
            TestContainerNode,
            TestChildNode,
            StarterKit.configure({ document: false, trailingNode: false }),
            ContentLayoutAuthoringExtension,
          ],
          content: createDocument([
            { id: IDS.firstRegion, contentLayout: SEQUENCE, children: [{ id: IDS.first }] },
          ]),
        }),
    ).toThrow("Document authoring extension is not installed");

    expect(
      () =>
        new Editor({
          extensions: [
            TestDocumentNode,
            TestContainerNode,
            TestChildNode,
            StarterKit.configure({ document: false, trailingNode: false }),
            createTestDocumentAuthoringExtension(),
            ContentLayoutAuthoringExtension,
          ],
          content: createDocument([
            { id: IDS.firstRegion, contentLayout: SEQUENCE, children: [{ id: IDS.first }] },
          ]),
        }),
    ).toThrow("Content Layout Projection extension is not installed");
  });
});

function createEditor(containers: readonly ContainerInput[]): Editor {
  return new Editor({
    extensions: [
      TestDocumentNode,
      TestContainerNode,
      TestChildNode,
      StarterKit.configure({ document: false, trailingNode: false }),
      createTestDocumentAuthoringExtension(),
      ContentLayoutProjectionExtension,
      ContentLayoutAuthoringExtension,
    ],
    content: createDocument(containers),
  });
}

async function createFlowEditorWithLaterControllerSelection(): Promise<Editor> {
  const editor = createEditor([
    {
      id: IDS.firstRegion,
      contentLayout: FLOW,
      children: [{ id: IDS.first }, { id: IDS.second }],
    },
  ]);
  await flushMicrotasks();
  getTestNavigation(editor).reportComponentSelection(IDS.second);
  await flushMicrotasks();
  return editor;
}

function transitionToSequence(editor: Editor): Transaction {
  const containerPosition = findNodePosition(editor, IDS.firstRegion);
  const containerType = editor.state.schema.nodes.container;
  if (!containerType) throw new Error("Expected the test container node type.");
  const transaction = editor.state.tr.setNodeMarkup(containerPosition, containerType, {
    id: IDS.firstRegion,
    [CONTENT_LAYOUT_ATTR]: SEQUENCE,
  });
  editor.view.dispatch(transaction);
  return transaction;
}

function getTestTree(editor: Editor): TestDocumentTreeStore {
  const lifecycle = documentAuthoringPluginKey.getState(editor.state);
  if (!lifecycle) throw new Error("Expected the test document authoring lifecycle.");
  return lifecycle.documentTree as unknown as TestDocumentTreeStore;
}

function getTestNavigation(editor: Editor): TestEditorNavigationController {
  const lifecycle = documentAuthoringPluginKey.getState(editor.state);
  if (!lifecycle) throw new Error("Expected the test document authoring lifecycle.");
  return lifecycle.editorNavigation as unknown as TestEditorNavigationController;
}

function createTestDocumentAuthoringExtension() {
  return Extension.create({
    name: "documentAuthoringLifecycle",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: documentAuthoringPluginKey,
          state: {
            init: (_config, state) => createTestDocumentAuthoringLifecycle(state.doc),
            apply: (transaction, lifecycle, _oldState, newState) => {
              lifecycle.applyTransaction(transaction, newState);
              return lifecycle;
            },
          },
        }),
      ];
    },
  });
}

function createTestDocumentAuthoringLifecycle(doc: ProseMirrorNode) {
  const documentTree = new TestDocumentTreeStore(doc);
  const editorNavigation = new TestEditorNavigationController();
  return {
    documentTree,
    editorNavigation,
    applyTransaction(transaction: Transaction, state: EditorState): void {
      documentTree.applyTransaction(transaction, state);
      editorNavigation.applyTransaction(transaction, state);
    },
    dispose(): void {},
  } as unknown as NonNullable<ReturnType<typeof documentAuthoringPluginKey.getState>>;
}

function createSnapshot(doc: ProseMirrorNode, revision: number) {
  const builder = createDocumentTreeSnapshotBuilder({ revision, mode: "page" });

  doc.descendants((node, position, parent) => {
    if (node.type.name !== "container" && node.type.name !== "child") return true;

    const itemId = id(String(node.attrs["id"]));
    const parentId = parent?.type.name === "container" ? id(String(parent.attrs["id"])) : null;
    const isContainer = node.type.name === "container";
    const item: DocumentTreeSnapshotItemInput = {
      id: itemId,
      kind: isContainer ? "region" : "block",
      nodeType: node.type.name,
      definitionId: null,
      label: itemId,
      summary: null,
      presentation: { actionIds: [], disabledReason: null },
      presentationContainer: isContainer
        ? { contentLayout: node.attrs[CONTENT_LAYOUT_ATTR] as PresentationContentLayout }
        : null,
    };
    builder.addItem({
      item,
      parentId,
      location: {
        id: itemId,
        nodeType: node.type.name,
        from: position,
        to: position + node.nodeSize,
        selectionTarget: { kind: "node", pos: position },
        surfaceId: null,
        authoringAnchorId: null,
        activationPath: [],
      },
    });
    return true;
  });

  return builder.build();
}

function createDocument(containers: readonly ContainerInput[]) {
  return {
    type: "doc",
    content: containers.map((container) => createContainerJSON(container)),
  };
}

function createContainerJSON(container: ContainerInput): JSONContent {
  return {
    type: "container",
    attrs: { id: container.id, [CONTENT_LAYOUT_ATTR]: container.contentLayout },
    content: container.children.map((child) =>
      "children" in child ? createContainerJSON(child) : { type: "child", attrs: { id: child.id } },
    ),
  };
}

function observeAppendedTransactions(editor: Editor): Transaction[] {
  const appendedTransactions: Transaction[] = [];
  editor.on("transaction", ({ appendedTransactions: appended }) => {
    appendedTransactions.push(...appended);
  });
  return appendedTransactions;
}

function observeTransactions(editor: Editor): Transaction[] {
  const transactions: Transaction[] = [];
  editor.on("transaction", ({ transaction, appendedTransactions }) => {
    transactions.push(transaction, ...appendedTransactions);
  });
  return transactions;
}

function selectNode(editor: Editor, selectedId: EmbeddedNodeId): void {
  const position = findNodePosition(editor, selectedId);
  const transaction = editor.state.tr.setSelection(
    NodeSelection.create(editor.state.doc, position),
  );
  transaction.setMeta(TEST_SELECTION_META, { selectedId });
  editor.view.dispatch(transaction);
}

function findNodePosition(editor: Editor, targetId: EmbeddedNodeId): number {
  let result: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs["id"] !== targetId) return true;
    result = position;
    return false;
  });
  if (result === null) throw new Error(`Expected node ${targetId}.`);
  return result;
}

function decorationChildIds(state: EditorState): readonly EmbeddedNodeId[] {
  return readContentLayoutProjectionDecorations(state)
    .find()
    .map((decoration) => decoration.spec.state.childId);
}

function availableDecorationChildId(
  state: EditorState,
  containerId: EmbeddedNodeId = IDS.firstRegion,
): EmbeddedNodeId | null {
  return (
    readContentLayoutProjectionDecorations(state)
      .find()
      .find(
        (decoration) =>
          decoration.spec.containerId === containerId &&
          decoration.spec.state.availability === "available",
      )?.spec.state.childId ?? null
  );
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
