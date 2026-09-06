// @vitest-environment jsdom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import {
  APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES,
  DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE,
  createCompleteDocumentTreeLifecycleDocument,
} from "@/composition/application/testing/document-tree-lifecycle-fixtures";
import { insertSurfaceTemplateAfterSurface } from "@/editor/surfaces/authoring/surface-template-insertion";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { createAuthoringEditorNavigationEnvironment } from "./editor-navigation/authoring-editor-navigation-environment";
import {
  readEditorSelectionTransactionMeta,
  setEditorSelectionTransactionMeta,
} from "./editor-navigation/editor-selection-origin";
import { documentAuthoringPluginKey } from "./document-authoring-storage";
import { getDocumentTreeForEditor, useDocumentTreeSnapshot } from "./document-tree";
import { getEditorNavigationForEditor } from "./editor-navigation";

const composition = createCoreScaffoldAuthoringComposition();

describe("Document authoring owners", () => {
  it("projects the initial page snapshot for one authoring editor", () => {
    const editor = createEditor(pageDocument("page"));

    try {
      expect(editor.extensionManager.extensions.map(({ name }) => name)).toContain(
        "documentAuthoringLifecycle",
      );
      expect(documentAuthoringPluginKey.get(editor.state)).toBeDefined();
      const tree = getDocumentTreeForEditor(editor);

      expect(tree.getSnapshot()).toMatchObject({
        revision: 0,
        mode: "page",
      });
      expect(tree.getSnapshot().roots.map(({ id }) => id)).toEqual([testId("s", "page")]);
      expect(tree.getCourseStructure().kind).toBe("page");
      expect(tree.getControlCapabilities()).toBeDefined();
    } finally {
      editor.destroy();
    }
  });

  it("projects an unavailable Surface from the initial working ProseMirror document", () => {
    const editor = createEditor(unavailablePageWorkingDocument());

    try {
      const snapshot = getDocumentTreeForEditor(editor).getSnapshot();
      const unavailableSurfaceId = testId("s", "unavailable");

      expect(snapshot.roots.map(({ id }) => id)).toEqual([unavailableSurfaceId]);
      expect(snapshot.itemById.get(unavailableSurfaceId)).toMatchObject({
        id: unavailableSurfaceId,
        kind: "surface",
        nodeType: "unavailable_surface",
        definitionId: null,
        children: [],
      });
    } finally {
      editor.destroy();
    }
  });

  it("navigates to an unavailable Surface through the real authoring environment", async () => {
    const editor = createEditor(unavailablePageWorkingDocument());

    try {
      const controller = connectAuthoringNavigation(editor);
      const unavailableSurfaceId = testId("s", "unavailable");
      expect(
        editor.view.dom.querySelector(
          `[data-authoring-frame="surface"][data-id="${unavailableSurfaceId}"]`,
        ),
      ).not.toBeNull();

      await expect(
        controller.showTarget(unavailableSurfaceId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: unavailableSurfaceId });
      expect(controller.getSelectionSnapshot()).toMatchObject({
        selectedId: unavailableSurfaceId,
        selectionOrigin: "document-outline",
      });
    } finally {
      editor.destroy();
    }
  });

  it("navigates a Course Section whose first member is an unavailable Surface", async () => {
    const editor = createEditor(unavailableSectionedSlideshowWorkingDocument());

    try {
      const controller = connectAuthoringNavigation(editor);
      const courseSectionId = testId("x", "unavailable");

      await expect(
        controller.showTarget(courseSectionId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: courseSectionId });
      expect(controller.getSelectionSnapshot()).toMatchObject({
        selectedId: courseSectionId,
        selectionOrigin: "document-outline",
      });
    } finally {
      editor.destroy();
    }
  });

  it("clears mounted navigation so replayed setup cannot reuse a stale environment", async () => {
    const editor = createEditor(unavailableSectionedSlideshowWorkingDocument());

    try {
      const controller = connectAuthoringNavigation(editor);
      const courseSectionId = testId("x", "unavailable");

      controller.clearEnvironment();

      await expect(
        controller.showTarget(courseSectionId, { origin: "document-outline" }),
      ).rejects.toThrow("Authoring editor navigation environment is not mounted");

      connectAuthoringNavigation(editor);

      await expect(
        controller.showTarget(courseSectionId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: courseSectionId });
    } finally {
      editor.destroy();
    }
  });

  it("interrupts pending coordinated navigation for editor-origin semantic intent", async () => {
    const physicalId = testId("p", "intent-caret");
    const navigationId = testId("p", "intent-navigation");
    const semanticTargetId = testId("s", "intent");
    const editor = createEditor(
      pageDocument("intent", [
        paragraph(navigationId, "Navigation target"),
        paragraph(physicalId, "Physical caret"),
      ]),
    );
    const presentation = deferred<void>();

    try {
      const controller = getEditorNavigationForEditor(editor);
      editor.commands.setTextSelection(findNodePosition(editor, physicalId) + 1);
      controller.setEditor({
        dispatch: (transaction) => editor.view.dispatch(transaction),
        focus: () => editor.commands.focus(),
      });
      controller.setEnvironment({
        presentSurface: () => presentation.promise,
        createActivationTransaction: () =>
          editor.state.tr.setSelection(
            TextSelection.create(editor.state.doc, findNodePosition(editor, navigationId) + 1),
          ),
        bringIntoView: async () => undefined,
      });
      const pendingNavigation = controller.showTarget(navigationId, {
        origin: "document-outline",
      });
      const transaction = editor.state.tr;
      setEditorSelectionTransactionMeta(transaction, {
        intendedId: semanticTargetId,
        origin: "editor",
      });

      editor.view.dispatch(transaction);
      presentation.resolve();

      expect(transaction.selectionSet).toBe(false);
      expect(controller.getSelectionSnapshot()).toMatchObject({
        selectedId: semanticTargetId,
        selectionOrigin: "editor",
      });
      await expect(pendingNavigation).resolves.toEqual({
        kind: "interrupted",
        id: navigationId,
      });
    } finally {
      editor.destroy();
    }
  });

  it("preserves tagged navigation intent through a causally appended CellSelection", async () => {
    const session = createTableSelectionSession();

    try {
      const normalized = await navigateToFirstTableRow(session);

      expect(readEditorSelectionTransactionMeta(normalized)).toEqual({
        intendedId: session.firstRowId,
        origin: "document-outline",
      });
      expect(session.controller.getSelectionSnapshot()).toMatchObject({
        selectedId: session.firstRowId,
        selectionOrigin: "document-outline",
      });
    } finally {
      session.editor.destroy();
    }
  });

  it("treats an independently dispatched CellSelection as fresh editor intent", async () => {
    const session = createTableSelectionSession();

    try {
      const normalized = await navigateToFirstTableRow(session);
      session.editor.view.dispatch(session.editor.state.tr.setSelection(normalized.selection));

      expect(session.controller.getSelectionSnapshot()).toMatchObject({
        selectedId: session.secondRowId,
        selectionOrigin: "editor",
      });
    } finally {
      session.editor.destroy();
    }
  });

  it("prefers direct semantic metadata over appended transaction metadata", () => {
    const editor = createEditor(pageDocument("direct-meta"));

    try {
      const root = setEditorSelectionTransactionMeta(editor.state.tr, {
        intendedId: testId("p", "direct-meta"),
        origin: "document-outline",
      });
      const appended = editor.state.tr.setMeta("appendedTransaction", root);
      setEditorSelectionTransactionMeta(appended, {
        intendedId: testId("s", "direct-meta"),
        origin: "presentation-timeline",
      });

      expect(readEditorSelectionTransactionMeta(appended)).toEqual({
        intendedId: testId("s", "direct-meta"),
        origin: "presentation-timeline",
      });
    } finally {
      editor.destroy();
    }
  });

  it("inherits semantic metadata through multiple appended transaction levels", () => {
    const editor = createEditor(pageDocument("nested-meta"));

    try {
      const root = setEditorSelectionTransactionMeta(editor.state.tr, {
        intendedId: testId("p", "nested-meta"),
        origin: "document-outline",
      });
      const firstAppend = editor.state.tr.setMeta("appendedTransaction", root);
      const secondAppend = editor.state.tr.setMeta("appendedTransaction", firstAppend);

      expect(readEditorSelectionTransactionMeta(secondAppend)).toEqual({
        intendedId: testId("p", "nested-meta"),
        origin: "document-outline",
      });
    } finally {
      editor.destroy();
    }
  });

  it("ignores malformed appended transaction metadata", () => {
    const editor = createEditor(pageDocument("malformed-meta"));

    try {
      const transaction = editor.state.tr.setMeta("appendedTransaction", {
        getMeta: () => ({ intendedId: testId("p", "malformed-meta"), origin: "editor" }),
      });

      expect(readEditorSelectionTransactionMeta(transaction)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("stops safely when appended transaction metadata contains a cycle", () => {
    const editor = createEditor(pageDocument("cyclic-meta"));

    try {
      const first = editor.state.tr;
      const second = editor.state.tr;
      first.setMeta("appendedTransaction", second);
      second.setMeta("appendedTransaction", first);

      expect(readEditorSelectionTransactionMeta(first)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("replaces the tree once for a document change and reuses it for selection-only work", () => {
    const editor = createEditor(pageDocument("live"));

    try {
      const tree = getDocumentTreeForEditor(editor);
      const initialTree = tree.getSnapshot();
      const textPosition = findNodePosition(editor, testId("p", "live")) + 1;

      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textPosition)),
      );
      expect(tree.getSnapshot()).toBe(initialTree);

      editor.view.dispatch(editor.state.tr.insertText("Updated ", textPosition));
      expect(tree.getSnapshot()).not.toBe(initialTree);
      expect(tree.getSnapshot().revision).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("publishes one atomic update for each document-changing transaction", () => {
    const editor = createEditor(pageDocument("push"));

    try {
      const tree = getDocumentTreeForEditor(editor);
      let updates = 0;
      const unsubscribe = tree.subscribe(() => {
        updates += 1;
      });
      const textPosition = findNodePosition(editor, testId("p", "push")) + 1;

      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textPosition)),
      );
      expect(updates).toBe(0);

      editor.view.dispatch(editor.state.tr.insertText("First ", textPosition));
      expect(updates).toBe(1);

      unsubscribe();
      editor.view.dispatch(editor.state.tr.insertText("Second ", textPosition));
      expect(updates).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("atomically projects an inserted default Content Surface and Region", () => {
    const editor = createEditor(slideshowDocument());

    try {
      const tree = getDocumentTreeForEditor(editor);
      const initialItemIds = new Set(tree.getSnapshot().itemById.keys());
      let updates = 0;
      const unsubscribe = tree.subscribe(() => {
        updates += 1;
      });
      let inserted = false;

      expect(() => {
        inserted = insertSurfaceTemplateAfterSurface(editor, builtInSurfaceVariantRegistry, {
          afterSurfaceId: testId("s", "slide-one"),
          variantId: "slide-content",
        });
      }).not.toThrow();

      expect(inserted).toBe(true);
      expect(updates).toBe(1);
      const documentTree = tree.getSnapshot();
      expect(documentTree.revision).toBe(1);
      const insertedSurface = [...documentTree.itemById.values()].find(
        ({ id, kind }) => kind === "surface" && !initialItemIds.has(id),
      );
      expect(insertedSurface).toMatchObject({
        kind: "surface",
        nodeType: "surface",
        definitionId: "slide-content",
      });
      const insertedRegion = [...documentTree.itemById.values()].find(
        ({ id, kind }) =>
          kind === "region" && documentTree.parentById.get(id) === insertedSurface?.id,
      );
      expect(insertedRegion).toMatchObject({
        kind: "region",
        nodeType: "region",
        definitionId: null,
      });
      unsubscribe();
    } finally {
      editor.destroy();
    }
  });

  it("disposes tree subscriptions with the editor session", () => {
    const editor = createEditor(pageDocument("drop"));
    const tree = getDocumentTreeForEditor(editor);
    let updates = 0;
    tree.subscribe(() => {
      updates += 1;
    });
    const textPosition = findNodePosition(editor, testId("p", "drop")) + 1;
    const transaction = editor.state.tr.insertText("Ignored ", textPosition);
    const nextState = EditorState.create({ schema: editor.schema, doc: transaction.doc });

    editor.destroy();
    tree.updateDocument(nextState.doc);

    expect(updates).toBe(0);
    expect(tree.getSnapshot().revision).toBe(0);
  });

  it("exposes the live controller snapshot through a React subscription hook", () => {
    const editor = createEditor(pageDocument("hook"));

    try {
      const { result } = renderHook(() => useDocumentTreeSnapshot(editor));
      const initialTree = result.current;
      const textPosition = findNodePosition(editor, testId("p", "hook")) + 1;

      act(() => editor.view.dispatch(editor.state.tr.insertText("Hook ", textPosition)));

      expect(result.current).not.toBe(initialTree);
      expect(result.current.revision).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("keeps page and slideshow editor sessions isolated", () => {
    const pageEditor = createEditor(pageDocument("one"));
    const slideshowEditor = createEditor(slideshowDocument());

    try {
      const pageTree = getDocumentTreeForEditor(pageEditor);
      const slideshowTree = getDocumentTreeForEditor(slideshowEditor);

      expect(pageTree).not.toBe(slideshowTree);
      expect(pageTree.getSnapshot().mode).toBe("page");
      expect(slideshowTree.getSnapshot().mode).toBe("slideshow");
      expect(slideshowTree.getSnapshot().roots.map(({ id }) => id)).toEqual([
        testId("cs", "slides"),
      ]);
    } finally {
      pageEditor.destroy();
      slideshowEditor.destroy();
    }
  });

  it("falls back from a deleted selected item to its nearest surviving semantic ancestor", () => {
    const selectedId = testId("p", "selected");
    const editor = createEditor(
      pageDocument("tree", [
        paragraph(selectedId, "Selected"),
        paragraph(testId("p", "survivor"), "Survivor"),
      ]),
    );

    try {
      const controller = getEditorNavigationForEditor(editor);
      const selectedPosition = findNodePosition(editor, selectedId);
      const selectedNode = editor.state.doc.nodeAt(selectedPosition);
      if (!selectedNode) throw new Error("expected selected paragraph");

      controller.reportComponentSelection(selectedId);
      editor.view.dispatch(
        editor.state.tr.delete(selectedPosition, selectedPosition + selectedNode.nodeSize),
      );

      expect(controller.getSelectionSnapshot().selectedId).toBe(testId("s", "tree"));
    } finally {
      editor.destroy();
    }
  });
});

function createEditor(content: JSONContent): Editor {
  return new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content,
  });
}

function connectAuthoringNavigation(editor: Editor) {
  const controller = getEditorNavigationForEditor(editor);
  controller.setEditor({
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus: () => editor.commands.focus(),
  });
  controller.setEnvironment(
    createAuthoringEditorNavigationEnvironment({
      blockDefinitions: composition.capabilities.blocks.registry,
      getDocumentTree: () => getDocumentTreeForEditor(editor).getSnapshot(),
      root: editor.view.dom,
      view: editor.view,
    }),
  );
  return controller;
}

function createTableSelectionSession() {
  const table = APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES.find(({ key }) => key === "table-rows");
  if (!table) throw new Error("Expected the approved Table-row family.");
  const editor = new Editor({
    editable: true,
    extensions: DOCUMENT_TREE_LIFECYCLE_AUTHORING_STATE.extensions,
    content: createCompleteDocumentTreeLifecycleDocument().toJSON(),
  });
  const controller = getEditorNavigationForEditor(editor);
  controller.setEditor({
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus: () => undefined,
  });
  controller.setEnvironment({
    presentSurface: async () => undefined,
    createActivationTransaction: (location) => {
      if (location.selectionTarget.kind !== "node") {
        throw new Error("Expected the Table owner to use a node selection target.");
      }
      return editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, location.selectionTarget.pos),
      );
    },
    bringIntoView: async () => undefined,
  });
  return {
    editor,
    controller,
    firstRowId: table.memberIds.first,
    secondRowId: table.memberIds.second,
  };
}

async function navigateToFirstTableRow(
  session: ReturnType<typeof createTableSelectionSession>,
): Promise<Transaction> {
  const appendedTransactions: Transaction[] = [];
  session.editor.on("transaction", ({ appendedTransactions: appended }) => {
    appendedTransactions.push(...appended);
  });

  await expect(
    session.controller.showTarget(session.firstRowId, { origin: "document-outline" }),
  ).resolves.toEqual({ kind: "reached", id: session.firstRowId });

  const normalized = appendedTransactions.find(
    (transaction) => transaction.selection instanceof CellSelection,
  );
  if (!normalized) throw new Error("Expected a plugin-appended CellSelection.");
  return normalized;
}

function findNodePosition(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`expected node "${id}"`);
  return found;
}

function pageDocument(
  suffix: string,
  content: readonly JSONContent[] = [paragraph(testId("p", suffix), `${suffix} content`)],
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: testId("c", suffix), mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: testId("s", suffix), variant: "page-default" },
            content: [...content],
          },
        ],
      },
    ],
  };
}

function slideshowDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: testId("c", "slides"), mode: "slideshow" },
        content: [
          {
            type: "courseSection",
            attrs: { id: testId("cs", "slides"), title: "Introduction" },
          },
          {
            type: "surface",
            attrs: { id: testId("s", "slide-one"), variant: "slide-content" },
            content: [paragraph(testId("p", "slide-one"), "First slide")],
          },
          {
            type: "surface",
            attrs: { id: testId("s", "slide-two"), variant: "slide-content" },
            content: [paragraph(testId("p", "slide-two"), "Second slide")],
          },
        ],
      },
    ],
  };
}

function unavailablePageWorkingDocument(): JSONContent {
  const unavailableSurfaceId = testId("s", "unavailable");
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: testId("c", "unavailable"), mode: "page" },
        content: [unavailableSurface(unavailableSurfaceId)],
      },
    ],
  };
}

function unavailableSectionedSlideshowWorkingDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: testId("c", "unavailable-section"), mode: "slideshow" },
        content: [
          {
            type: "courseSection",
            attrs: { id: testId("x", "unavailable"), title: "Unavailable content" },
          },
          unavailableSurface(testId("s", "unavailable")),
        ],
      },
    ],
  };
}

function unavailableSurface(unavailableSurfaceId: EmbeddedNodeId): JSONContent {
  return {
    type: "unavailable_surface",
    attrs: {
      id: unavailableSurfaceId,
      capabilityId: "plus.private-surface",
      original: {
        type: "surface",
        attrs: { id: unavailableSurfaceId, variant: "plus.private-surface" },
        content: [
          {
            type: "private_child",
            attrs: { secret: "must remain opaque" },
          },
        ],
      },
    },
  };
}

function paragraph(id: EmbeddedNodeId, text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    content: [{ type: "text", text }],
  };
}

function testId(kind: "c" | "cs" | "p" | "s" | "x", value: string): EmbeddedNodeId {
  const normalized = value.replaceAll(/[^0-9A-Za-z_-]/g, "");
  return EmbeddedNodeIdSchema.parse(`${kind}${normalized}`.padEnd(12, "0").slice(0, 12));
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
