// @vitest-environment jsdom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";

import { createAuthoringSemanticNavigationEnvironment } from "./authoring-semantic-navigation-environment";
import {
  getSemanticDocumentControllerForEditor,
  semanticDocumentPluginKey,
  useSemanticDocumentControllerSnapshot,
} from "./semantic-document-storage";

const composition = createCoreScaffoldAuthoringComposition();

describe("SemanticDocumentController", () => {
  it("projects the initial page snapshot for one authoring editor", () => {
    const editor = createEditor(pageDocument("page"));

    try {
      expect(editor.extensionManager.extensions.map(({ name }) => name)).toContain(
        "semanticDocumentController",
      );
      expect(semanticDocumentPluginKey.get(editor.state)).toBeDefined();
      const controller = getSemanticDocumentControllerForEditor(editor);

      expect(controller.getSnapshot().semantics).toMatchObject({
        revision: 0,
        mode: "page",
      });
      expect(controller.getSnapshot().semantics.roots.map(({ id }) => id)).toEqual([
        testId("s", "page"),
      ]);
    } finally {
      editor.destroy();
    }
  });

  it("projects an unavailable Surface from the initial working ProseMirror document", () => {
    const editor = createEditor(unavailablePageWorkingDocument());

    try {
      const snapshot = getSemanticDocumentControllerForEditor(editor).getSnapshot().semantics;
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

      await expect(
        controller.select(unavailableSurfaceId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: unavailableSurfaceId });
      expect(controller.getSnapshot()).toMatchObject({
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
        controller.select(courseSectionId, { origin: "document-outline" }),
      ).resolves.toEqual({ kind: "reached", id: courseSectionId });
      expect(controller.getSnapshot()).toMatchObject({
        selectedId: courseSectionId,
        selectionOrigin: "document-outline",
      });
    } finally {
      editor.destroy();
    }
  });

  it("replaces semantics once for a document change and reuses them for selection-only work", () => {
    const editor = createEditor(pageDocument("live"));

    try {
      const controller = getSemanticDocumentControllerForEditor(editor);
      const initialSemantics = controller.getSnapshot().semantics;
      const textPosition = findNodePosition(editor, testId("p", "live")) + 1;

      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textPosition)),
      );
      expect(controller.getSnapshot().semantics).toBe(initialSemantics);

      editor.view.dispatch(editor.state.tr.insertText("Updated ", textPosition));
      expect(controller.getSnapshot().semantics).not.toBe(initialSemantics);
      expect(controller.getSnapshot().semantics.revision).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("publishes one atomic update for each document-changing transaction", () => {
    const editor = createEditor(pageDocument("push"));

    try {
      const controller = getSemanticDocumentControllerForEditor(editor);
      let updates = 0;
      const unsubscribe = controller.subscribe(() => {
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

  it("disposes controller subscriptions with the editor session", () => {
    const editor = createEditor(pageDocument("drop"));
    const controller = getSemanticDocumentControllerForEditor(editor);
    let updates = 0;
    controller.subscribe(() => {
      updates += 1;
    });
    const textPosition = findNodePosition(editor, testId("p", "drop")) + 1;
    const transaction = editor.state.tr.insertText("Ignored ", textPosition);
    const nextState = EditorState.create({ schema: editor.schema, doc: transaction.doc });

    editor.destroy();
    controller.applyTransaction(transaction, nextState);

    expect(updates).toBe(0);
    expect(controller.getSnapshot().semantics.revision).toBe(0);
  });

  it("exposes the live controller snapshot through a React subscription hook", () => {
    const editor = createEditor(pageDocument("hook"));

    try {
      const { result } = renderHook(() => useSemanticDocumentControllerSnapshot(editor));
      const initialSemantics = result.current.semantics;
      const textPosition = findNodePosition(editor, testId("p", "hook")) + 1;

      act(() => editor.view.dispatch(editor.state.tr.insertText("Hook ", textPosition)));

      expect(result.current.semantics).not.toBe(initialSemantics);
      expect(result.current.semantics.revision).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("keeps page and slideshow editor sessions isolated", () => {
    const pageEditor = createEditor(pageDocument("one"));
    const slideshowEditor = createEditor(slideshowDocument());

    try {
      const pageController = getSemanticDocumentControllerForEditor(pageEditor);
      const slideshowController = getSemanticDocumentControllerForEditor(slideshowEditor);

      expect(pageController).not.toBe(slideshowController);
      expect(pageController.getSnapshot().semantics.mode).toBe("page");
      expect(slideshowController.getSnapshot().semantics.mode).toBe("slideshow");
      expect(slideshowController.getSnapshot().semantics.roots.map(({ id }) => id)).toEqual([
        testId("s", "slide-one"),
        testId("s", "slide-two"),
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
      const controller = getSemanticDocumentControllerForEditor(editor);
      const selectedPosition = findNodePosition(editor, selectedId);
      const selectedNode = editor.state.doc.nodeAt(selectedPosition);
      if (!selectedNode) throw new Error("expected selected paragraph");

      controller.setSelectedId(selectedId);
      editor.view.dispatch(
        editor.state.tr.delete(selectedPosition, selectedPosition + selectedNode.nodeSize),
      );

      expect(controller.getSnapshot().selectedId).toBe(testId("s", "tree"));
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
  const controller = getSemanticDocumentControllerForEditor(editor);
  controller.setNavigationEditor({
    getState: () => editor.state,
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus: () => editor.commands.focus(),
  });
  controller.setNavigationEnvironment(
    createAuthoringSemanticNavigationEnvironment({
      getSnapshot: () => controller.getSnapshot().semantics,
      root: editor.view.dom,
      view: editor.view,
    }),
  );
  return controller;
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

function testId(kind: "c" | "p" | "s" | "x", value: string): EmbeddedNodeId {
  const normalized = value.replaceAll(/[^0-9A-Za-z_-]/g, "");
  return EmbeddedNodeIdSchema.parse(`${kind}${normalized}`.padEnd(12, "0").slice(0, 12));
}
