// @vitest-environment jsdom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildDocumentTree,
  type DocumentTreeDefinitionLookup,
} from "@/document/model/document-tree";
import { createRepresentativeDocumentTreeFixture } from "@/document/model/document-tree/testing/document-tree-fixtures";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createStructuralInteractionTargetActivationTransaction } from "@/editor/interactions/targets/prosemirror/activation/interaction-activation-dispatch";

import { createDocumentAuthoringLifecycle } from "../document-authoring-lifecycle";
import type { EditorNavigationController } from "./editor-navigation-controller";
import { getDocumentTreeForEditor } from "../document-tree";
import { getEditorNavigationForEditor } from "./editor-navigation-storage";
import {
  readEditorSelectionTransactionMeta,
  setEditorSelectionTransactionMeta,
  type EditorSelectionOrigin,
} from "./editor-selection-origin";
import { projectEditorSelection } from "./editor-selection-projection";

describe("projectEditorSelection", () => {
  it("prefers the selected structural node ID for a NodeSelection", () => {
    const context = createContext();
    const layoutId = context.fixture.surfaces[0]!.layout;
    const selection = NodeSelection.create(
      context.state.doc,
      findPosition(context.state.doc, layoutId),
    );

    expect(projectEditorSelection(selection, context.snapshot.itemById)).toBe(layoutId);
  });

  it("maps text carets and ranges through deepest published ancestors", () => {
    const context = createContext();
    const [firstParagraphId, secondParagraphId] = context.fixture.surfaces[0]!.repeatedParagraphs;
    const firstText = findPosition(context.state.doc, firstParagraphId) + 1;
    const secondText = findPosition(context.state.doc, secondParagraphId) + 2;

    expect(
      projectEditorSelection(
        TextSelection.create(context.state.doc, firstText),
        context.snapshot.itemById,
      ),
    ).toBe(firstParagraphId);
    expect(
      projectEditorSelection(
        TextSelection.create(context.state.doc, firstText, secondText),
        context.snapshot.itemById,
      ),
    ).toBe(firstParagraphId);
  });

  it("skips an unpublished leading paragraph and selects its published list item", () => {
    const context = createContext();
    const listItemId = context.fixture.surfaces[0]!.listItem;
    const listItem = findNode(context.state.doc, listItemId);
    const privateParagraphId = listItem.child(0).attrs["id"] as EmbeddedNodeId;
    const privateText = findPosition(context.state.doc, privateParagraphId) + 1;

    expect(context.snapshot.itemById.has(privateParagraphId)).toBe(false);
    expect(
      projectEditorSelection(
        TextSelection.create(context.state.doc, privateText),
        context.snapshot.itemById,
      ),
    ).toBe(listItemId);
  });

  it("keeps private assessment content at its published Block boundary", () => {
    const context = createContext();
    const { assessmentBlock, privateAssessmentParagraph } = context.fixture.surfaces[0]!;
    const privateText = findPosition(context.state.doc, privateAssessmentParagraph) + 1;

    expect(context.snapshot.itemById.has(privateAssessmentParagraph)).toBe(false);
    expect(
      projectEditorSelection(
        TextSelection.create(context.state.doc, privateText),
        context.snapshot.itemById,
      ),
    ).toBe(assessmentBlock);
  });

  it("uses membership probes without iterating semantic items or ranges", () => {
    const context = createContext();
    const paragraphId = context.fixture.surfaces[0]!.repeatedParagraphs[0];
    const textPosition = findPosition(context.state.doc, paragraphId) + 1;
    const has = vi.fn((id: EmbeddedNodeId) => context.snapshot.itemById.has(id));
    const index = {
      has,
      [Symbol.iterator]: () => {
        throw new Error("semantic item iteration is forbidden during selection projection");
      },
    } as unknown as ReadonlyMap<EmbeddedNodeId, unknown>;

    expect(
      projectEditorSelection(TextSelection.create(context.state.doc, textPosition), index),
    ).toBe(paragraphId);
    expect(has.mock.calls.length).toBeLessThanOrEqual(
      TextSelection.create(context.state.doc, textPosition).$from.depth + 2,
    );
  });
});

describe("EditorNavigationController selection", () => {
  it("attaches editor semantic intent to canonical structural activation without changing the document", () => {
    const context = createContext();
    const layoutId = context.fixture.surfaces[0]!.layout;
    const paragraphId = context.fixture.surfaces[0]!.repeatedParagraphs[0];
    const paragraphFrom = findPosition(context.state.doc, paragraphId);
    const paragraphNode = context.state.doc.nodeAt(paragraphFrom);
    if (!paragraphNode) throw new Error("Expected active paragraph");
    const state = context.state.apply(
      context.state.tr.setSelection(TextSelection.create(context.state.doc, paragraphFrom + 1)),
    );
    const controller = createNavigation(state, context.fixture.definitions);
    const documentBefore = state.doc.toJSON();

    const resolution = createStructuralInteractionTargetActivationTransaction(
      state,
      {
        id: layoutId,
        kind: InteractionTargetKind.Layout,
        pos: findPosition(state.doc, layoutId),
      },
      {
        kind: "retain-active-child",
        activeChildId: paragraphId,
        activeRange: { from: paragraphFrom, to: paragraphFrom + paragraphNode.nodeSize },
        selectionTarget: { kind: "text", from: paragraphFrom + 1, to: paragraphFrom + 1 },
      },
    );

    expect(resolution.kind).toBe("transaction");
    if (resolution.kind !== "transaction") throw new Error("Expected structural activation");
    expect(readEditorSelectionTransactionMeta(resolution.transaction)).toEqual({
      intendedId: layoutId,
      origin: "editor",
    });
    expect(resolution.transaction.docChanged).toBe(false);
    expect(resolution.transaction.selectionSet).toBe(false);
    expect(resolution.transaction.steps).toHaveLength(0);
    expect(resolution.transaction.doc.toJSON()).toEqual(documentBefore);
    controller.applySelectionTransaction(
      resolution.transaction,
      state.apply(resolution.transaction),
    );
    expectSelection(controller, layoutId, "editor");
  });

  it.each([undefined, "layout-a"])(
    "does not attach structural semantic intent for invalid stable ID %s",
    (targetId) => {
      const context = createContext();
      const layoutId = context.fixture.surfaces[0]!.layout;
      const target = {
        kind: InteractionTargetKind.Layout,
        pos: findPosition(context.state.doc, layoutId),
        ...(targetId === undefined ? {} : { id: targetId }),
      } as const;

      const resolution = createStructuralInteractionTargetActivationTransaction(
        context.state,
        target,
        { kind: "pointer-within-target" },
      );

      expect(resolution.kind).toBe("transaction");
      if (resolution.kind !== "transaction") throw new Error("Expected structural activation");
      expect(readEditorSelectionTransactionMeta(resolution.transaction)).toBeNull();
    },
  );

  it("records content-layout selection intent without changing the document", () => {
    const context = createContext();
    const controller = createNavigation(context.state, context.fixture.definitions);
    const paragraphId = context.fixture.surfaces[0]!.repeatedParagraphs[0];
    const transaction = context.state.tr.setSelection(
      TextSelection.create(context.state.doc, findPosition(context.state.doc, paragraphId) + 1),
    );
    setEditorSelectionTransactionMeta(transaction, {
      intendedId: paragraphId,
      origin: "content-layout",
    });

    const nextState = context.state.apply(transaction);
    controller.applySelectionTransaction(transaction, nextState);

    expect(transaction.docChanged).toBe(false);
    expectSelection(controller, paragraphId, "content-layout");
  });

  it.each(["content-layout", "document-outline", "presentation-timeline"] as const)(
    "preserves later %s intent over editor structural intent on one transaction",
    (origin) => {
      const context = createContext();
      const controller = createNavigation(context.state, context.fixture.definitions);
      const physicalParagraphId = context.fixture.surfaces[0]!.repeatedParagraphs[0];
      const intendedId = context.fixture.surfaces[0]!.publishedContainer;
      const transaction = context.state.tr.setSelection(
        TextSelection.create(
          context.state.doc,
          findPosition(context.state.doc, physicalParagraphId) + 1,
        ),
      );
      setEditorSelectionTransactionMeta(transaction, {
        intendedId: context.fixture.surfaces[0]!.layout,
        origin: "editor",
      });
      setEditorSelectionTransactionMeta(transaction, { intendedId, origin });

      controller.applySelectionTransaction(transaction, context.state.apply(transaction));

      expectSelection(controller, intendedId, origin);
    },
  );

  it("tracks component, controller and later editor origins without feedback", () => {
    const context = createContext();
    const controller = createNavigation(context.state, context.fixture.definitions);
    const componentId = context.fixture.surfaces[0]!.publishedContainer;
    const privateId = context.fixture.surfaces[0]!.privateAssessmentParagraph;

    controller.reportComponentSelection(componentId);
    expectSelection(controller, componentId, "component");

    controller.reportComponentSelection(privateId);
    expectSelection(controller, componentId, "component");

    const paragraphId = context.fixture.surfaces[0]!.repeatedParagraphs[0];
    const transaction = context.state.tr.setSelection(
      TextSelection.create(context.state.doc, findPosition(context.state.doc, paragraphId) + 1),
    );
    setEditorSelectionTransactionMeta(transaction, {
      intendedId: componentId,
      origin: "document-outline",
    });
    const controllerState = context.state.apply(transaction);
    controller.applySelectionTransaction(transaction, controllerState);
    expectSelection(controller, componentId, "document-outline");

    const secondParagraphId = context.fixture.surfaces[0]!.repeatedParagraphs[1];
    const editorTransaction = controllerState.tr.setSelection(
      TextSelection.create(
        controllerState.doc,
        findPosition(controllerState.doc, secondParagraphId) + 1,
      ),
    );
    controller.applySelectionTransaction(
      editorTransaction,
      controllerState.apply(editorTransaction),
    );
    expectSelection(controller, secondParagraphId, "editor");
  });

  it("keeps the current selected ID valid through move, split, join and deletion", () => {
    const movingId = makeId("p", "moving");
    const proseId = makeId("p", "prose");
    const surfaceId = makeId("s", "edits");
    const editor = createAuthoringEditor(surfaceId, [
      paragraphJson(proseId, "Split this prose"),
      paragraphJson(movingId, "Move me"),
    ]);

    try {
      const controller = getEditorNavigationForEditor(editor);
      controller.reportComponentSelection(movingId);
      const movingPosition = findPosition(editor.state.doc, movingId);
      const movingNode = editor.state.doc.nodeAt(movingPosition);
      if (!movingNode) throw new Error("expected moving paragraph");
      const prosePosition = findPosition(editor.state.doc, proseId);

      editor.view.dispatch(
        editor.state.tr
          .delete(movingPosition, movingPosition + movingNode.nodeSize)
          .insert(prosePosition, movingNode),
      );
      expect(controller.getSelectionSnapshot().selectedId).toBe(movingId);

      expect(editor.commands.setTextSelection(findPosition(editor.state.doc, proseId) + 6)).toBe(
        true,
      );
      expect(editor.commands.splitBlock()).toBe(true);
      expect(controller.getSelectionSnapshot().selectedId).toBe(
        projectEditorSelection(
          editor.state.selection,
          getDocumentTreeForEditor(editor).getSnapshot().itemById,
        ),
      );

      expect(editor.commands.joinBackward()).toBe(true);
      expect(controller.getSelectionSnapshot().selectedId).toBe(
        projectEditorSelection(
          editor.state.selection,
          getDocumentTreeForEditor(editor).getSnapshot().itemById,
        ),
      );

      controller.reportComponentSelection(movingId);
      const movedPosition = findPosition(editor.state.doc, movingId);
      const movedNode = editor.state.doc.nodeAt(movedPosition);
      if (!movedNode) throw new Error("expected moved paragraph");
      editor.view.dispatch(
        editor.state.tr.delete(movedPosition, movedPosition + movedNode.nodeSize),
      );
      expect(controller.getSelectionSnapshot().selectedId).toBe(surfaceId);
    } finally {
      editor.destroy();
    }
  });
});

function createContext() {
  const fixture = createRepresentativeDocumentTreeFixture({ kind: "page" });
  const state = EditorState.create({ doc: fixture.doc });
  const snapshot = buildDocumentTree({
    doc: fixture.doc,
    courseStructure: fixture.courseStructure,
    definitions: fixture.definitions,
    revision: 0,
  });
  return { fixture, state, snapshot };
}

function findPosition(doc: ProseMirrorNode, id: EmbeddedNodeId): number {
  let found: number | null = null;
  doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`expected node "${id}"`);
  return found;
}

function findNode(doc: ProseMirrorNode, id: EmbeddedNodeId): ProseMirrorNode {
  const node = doc.nodeAt(findPosition(doc, id));
  if (!node) throw new Error(`expected node "${id}"`);
  return node;
}

function expectSelection(
  controller: EditorNavigationController,
  selectedId: EmbeddedNodeId,
  selectionOrigin: EditorSelectionOrigin,
): void {
  expect(controller.getSelectionSnapshot()).toMatchObject({ selectedId, selectionOrigin });
}

function createNavigation(
  state: EditorState,
  definitions: DocumentTreeDefinitionLookup,
): EditorNavigationController {
  return createDocumentAuthoringLifecycle(state, definitions).editorNavigation;
}

function createAuthoringEditor(surfaceId: EmbeddedNodeId, content: readonly JSONContent[]): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  return new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: makeId("c", "edits"), mode: "page" },
          content: [
            {
              type: "surface",
              attrs: { id: surfaceId, variant: "page-default" },
              content: [...content],
            },
          ],
        },
      ],
    },
  });
}

function paragraphJson(id: EmbeddedNodeId, text: string): JSONContent {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

function makeId(kind: "c" | "p" | "s", value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(`${kind}${value}`.padEnd(12, "0").slice(0, 12));
}
