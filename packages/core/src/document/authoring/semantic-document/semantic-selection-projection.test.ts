// @vitest-environment jsdom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import { projectSemanticDocument } from "@/document/model/semantic-document";
import { createRepresentativeSemanticDocumentFixture } from "@/document/model/semantic-document/testing/semantic-document-fixtures";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";

import { SemanticDocumentController } from "./semantic-document-controller";
import { getSemanticDocumentControllerForEditor } from "./semantic-document-storage";
import {
  setSemanticSelectionTransactionMeta,
  type SemanticSelectionOrigin,
} from "./semantic-selection-origin";
import { projectSemanticSelection } from "./semantic-selection-projection";

describe("projectSemanticSelection", () => {
  it("prefers the selected structural node ID for a NodeSelection", () => {
    const context = createContext();
    const layoutId = context.fixture.surfaces[0]!.layout;
    const selection = NodeSelection.create(
      context.state.doc,
      findPosition(context.state.doc, layoutId),
    );

    expect(projectSemanticSelection(selection, context.snapshot.itemById)).toBe(layoutId);
  });

  it("maps text carets and ranges through deepest published ancestors", () => {
    const context = createContext();
    const [firstParagraphId, secondParagraphId] = context.fixture.surfaces[0]!.repeatedParagraphs;
    const firstText = findPosition(context.state.doc, firstParagraphId) + 1;
    const secondText = findPosition(context.state.doc, secondParagraphId) + 2;

    expect(
      projectSemanticSelection(
        TextSelection.create(context.state.doc, firstText),
        context.snapshot.itemById,
      ),
    ).toBe(firstParagraphId);
    expect(
      projectSemanticSelection(
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
      projectSemanticSelection(
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
      projectSemanticSelection(
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
      projectSemanticSelection(TextSelection.create(context.state.doc, textPosition), index),
    ).toBe(paragraphId);
    expect(has.mock.calls.length).toBeLessThanOrEqual(
      TextSelection.create(context.state.doc, textPosition).$from.depth + 2,
    );
  });
});

describe("SemanticDocumentController selection", () => {
  it("tracks component, controller and later editor origins without feedback", () => {
    const context = createContext();
    const controller = new SemanticDocumentController({
      state: context.state,
      definitions: context.fixture.definitions,
    });
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
    setSemanticSelectionTransactionMeta(transaction, {
      intendedId: componentId,
      origin: "document-outline",
    });
    const controllerState = context.state.apply(transaction);
    controller.applyTransaction(transaction, controllerState);
    expectSelection(controller, componentId, "document-outline");

    const secondParagraphId = context.fixture.surfaces[0]!.repeatedParagraphs[1];
    const editorTransaction = controllerState.tr.setSelection(
      TextSelection.create(
        controllerState.doc,
        findPosition(controllerState.doc, secondParagraphId) + 1,
      ),
    );
    controller.applyTransaction(editorTransaction, controllerState.apply(editorTransaction));
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
      const controller = getSemanticDocumentControllerForEditor(editor);
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
      expect(controller.getSnapshot().selectedId).toBe(movingId);

      expect(editor.commands.setTextSelection(findPosition(editor.state.doc, proseId) + 6)).toBe(
        true,
      );
      expect(editor.commands.splitBlock()).toBe(true);
      expect(controller.getSnapshot().selectedId).toBe(
        projectSemanticSelection(
          editor.state.selection,
          controller.getSnapshot().semantics.itemById,
        ),
      );

      expect(editor.commands.joinBackward()).toBe(true);
      expect(controller.getSnapshot().selectedId).toBe(
        projectSemanticSelection(
          editor.state.selection,
          controller.getSnapshot().semantics.itemById,
        ),
      );

      controller.reportComponentSelection(movingId);
      const movedPosition = findPosition(editor.state.doc, movingId);
      const movedNode = editor.state.doc.nodeAt(movedPosition);
      if (!movedNode) throw new Error("expected moved paragraph");
      editor.view.dispatch(
        editor.state.tr.delete(movedPosition, movedPosition + movedNode.nodeSize),
      );
      expect(controller.getSnapshot().selectedId).toBe(surfaceId);
    } finally {
      editor.destroy();
    }
  });
});

function createContext() {
  const fixture = createRepresentativeSemanticDocumentFixture({ kind: "page" });
  const state = EditorState.create({ doc: fixture.doc });
  const snapshot = projectSemanticDocument({
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
  controller: SemanticDocumentController,
  selectedId: EmbeddedNodeId,
  selectionOrigin: SemanticSelectionOrigin,
): void {
  expect(controller.getSnapshot()).toMatchObject({ selectedId, selectionOrigin });
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
