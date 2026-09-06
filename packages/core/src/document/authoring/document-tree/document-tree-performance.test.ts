// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import {
  DocumentOutline,
  DocumentOutlineRowViewport,
} from "@/editor/shell/outline/DocumentOutline";

import { getEditorNavigationForEditor } from "../editor-navigation";
import { DocumentTreeViewController } from "./document-tree-view-controller";
import { getDocumentTreeForEditor } from "./document-tree-storage";

const IDS = {
  course: id("perfcourse01"),
  surface: id("perfsurface1"),
  first: id("perfpara0001"),
  second: id("perfpara0002"),
} as const;

const editors: Editor[] = [];
const composition = createCoreScaffoldAuthoringComposition();

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  vi.restoreAllMocks();
});

describe("mounted document tree projection boundary", () => {
  it("replaces one complete snapshot per document edit and none for presentation activity", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const editor = createEditor();
    const tree = getDocumentTreeForEditor(editor);
    const navigation = getEditorNavigationForEditor(editor);
    const viewport = new DocumentOutlineRowViewport();
    const hierarchy = new DocumentTreeViewController({
      tree,
      navigation,
      origin: "document-outline",
      viewport,
    });
    const rendered = render(
      createElement(DocumentOutline, {
        tree,
        navigation,
        viewController: hierarchy,
        viewport,
      }),
    );
    const initialTree = tree.getSnapshot();
    let previousTree = initialTree;
    const replacements: number[] = [];
    const unsubscribe = tree.subscribe(() => {
      const snapshot = tree.getSnapshot();
      if (snapshot === previousTree) return;
      previousTree = snapshot;
      replacements.push(snapshot.revision);
    });

    const firstPosition = findNodePosition(editor, IDS.first) + 1;
    editor.view.dispatch(editor.state.tr.insertText("Typed ", firstPosition));
    expect(replacements).toEqual([1]);
    expect(tree.getSnapshot()).not.toBe(initialTree);

    const secondPosition = findNodePosition(editor, IDS.second) + 1;
    editor.view.dispatch(editor.state.tr.insertText("Edited ", secondPosition));
    expect(replacements).toEqual([1, 2]);

    const afterDocumentEdits = tree.getSnapshot();
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, secondPosition)),
    );
    expect(tree.getSnapshot()).toBe(afterDocumentEdits);

    const disclosure = rendered.getByRole("button", { name: "Show structure for Page" });
    fireEvent.click(disclosure);
    fireEvent.pointerMove(rendered.getByRole("tree", { name: "Page structure" }));
    fireEvent.scroll(rendered.getByRole("tree", { name: "Page structure" }));
    await hierarchy.reveal(IDS.second, {
      select: false,
      focus: false,
      expandAncestors: true,
    });
    await hierarchy.reveal(IDS.second, {
      select: false,
      focus: false,
      expandAncestors: true,
    });

    expect(tree.getSnapshot()).toBe(afterDocumentEdits);
    expect(replacements).toEqual([1, 2]);
    expect(scrollIntoView).toHaveBeenCalled();

    unsubscribe();
    hierarchy.destroy();
  });
});

function createEditor(): Editor {
  const editor = new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: pageDocument(),
  });
  editors.push(editor);
  return editor;
}

function pageDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: IDS.course, mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: IDS.surface, variant: "page-default" },
            content: [
              paragraph(IDS.first, "First paragraph"),
              paragraph(IDS.second, "Second paragraph"),
            ],
          },
        ],
      },
    ],
  };
}

function paragraph(paragraphId: EmbeddedNodeId, text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id: paragraphId },
    content: [{ type: "text", text }],
  };
}

function findNodePosition(editor: Editor, nodeId: EmbeddedNodeId): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, currentPosition) => {
    if (node.attrs["id"] !== nodeId) return true;
    position = currentPosition;
    return false;
  });
  if (position === null) throw new Error(`Expected node ${nodeId}`);
  return position;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
