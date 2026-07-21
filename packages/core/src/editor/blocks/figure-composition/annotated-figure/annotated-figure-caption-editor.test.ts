// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createAnnotatedFigureCanvasNode } from "./annotated-figure-canvas-shared";
import {
  createAnnotatedFigureCaptionEditorExtensions,
  createAnnotatedFigureCaptionTarget,
} from "./annotated-figure-caption-editor";
import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";
import { createAnnotatedFigureNode } from "./node";
import { AnnotatedFigureLegendNode, createAnnotatedFigureAnnotationNode } from "./slots";

const editors: Editor[] = [];

afterEach(() => {
  while (editors.length > 0) {
    const editor = editors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
});

describe("Annotated Figure caption editor", () => {
  it("admits one paragraph with the complete caption inline vocabulary and no inner history", () => {
    const editor = track(
      new Editor({
        extensions: createAnnotatedFigureCaptionEditorExtensions(),
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Caption" }] }],
        },
      }),
    );

    expect(editor.schema.topNodeType.spec.content?.toString()).toBe("paragraph");
    expect(editor.extensionManager.extensions.map(({ name }) => name)).not.toContain("undoRedo");
    expect(editor.schema.nodes["heading"]).toBeUndefined();
    expect(editor.schema.nodes["bulletList"]).toBeUndefined();
    expect(editor.schema.nodes["hardBreak"]).toBeDefined();
    expect(editor.schema.nodes["inlineMath"]).toBeDefined();
    expect(editor.schema.nodes["inlineIcon"]).toBeDefined();
    expect(editor.schema.nodes["vocabTerm"]).toBeDefined();
    expect(editor.schema.marks["link"]).toBeDefined();
    expect(editor.schema.marks["underline"]).toBeDefined();
    expect(editor.schema.marks["highlight"]).toBeDefined();
    expect(editor.schema.marks["subscript"]).toBeDefined();
    expect(editor.schema.marks["superscript"]).toBeDefined();
    expect(editor.schema.marks["textStyle"]).toBeDefined();
  });

  it("turns Enter into a hard break without creating a second paragraph", () => {
    const editor = track(
      new Editor({
        extensions: createAnnotatedFigureCaptionEditorExtensions(),
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Caption" }] }],
        },
      }),
    );
    editor.commands.setTextSelection("Caption".length + 1);

    const handled = editor.view.someProp("handleKeyDown", (handler) =>
      handler(editor.view, new KeyboardEvent("keydown", { key: "Enter" })),
    );

    expect(handled).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: "text", text: "Caption" },
      { type: "hardBreak" },
    ]);
  });
});

describe("createAnnotatedFigureCaptionTarget", () => {
  it("re-resolves the annotation by stable ids after reorder and fails closed after deletion", () => {
    const editor = makeOuterEditor();
    const target = createAnnotatedFigureCaptionTarget({
      editor,
      figureId: "figure-one",
      annotationId: "annotation-two",
    });
    if (!target) throw new Error("Expected a live caption target");
    const initialPos = target.getPos();

    expect(target.node.attrs["id"]).toBe("annotation-two");
    expect(target.node.textContent).toBe("Second caption");
    expect(initialPos).toBeTypeOf("number");

    reverseAnnotations(editor);

    const reorderedPos = target.getPos();
    expect(reorderedPos).toBeTypeOf("number");
    expect(reorderedPos).not.toBe(initialPos);
    expect(editor.state.doc.nodeAt(reorderedPos!)?.attrs["id"]).toBe("annotation-two");

    const reorderedFigure = findFigure(editor);
    const reorderedModel = resolveAnnotatedFigureModel(reorderedFigure);
    const annotation = reorderedModel?.annotations.find(({ id }) => id === "annotation-two");
    if (!annotation) throw new Error("Expected reordered annotation");
    editor.view.dispatch(
      editor.state.tr.delete(annotation.pos, annotation.pos + annotation.node.nodeSize),
    );

    expect(target.getPos()).toBeUndefined();
  });

  it("returns null or an undefined position when identity or structure is invalid", () => {
    const editor = makeOuterEditor();

    expect(
      createAnnotatedFigureCaptionTarget({
        editor,
        figureId: "missing-figure",
        annotationId: "annotation-one",
      }),
    ).toBeNull();

    const target = createAnnotatedFigureCaptionTarget({
      editor,
      figureId: "figure-one",
      annotationId: "annotation-one",
    });
    if (!target) throw new Error("Expected a live caption target");
    const figure = findFigure(editor);
    const second = resolveAnnotatedFigureModel(figure)?.annotations[1];
    if (!second) throw new Error("Expected the second annotation");

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(second.pos, undefined, {
        ...second.node.attrs,
        id: "annotation-one",
      }),
    );

    expect(target.getPos()).toBeUndefined();
  });
});

function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

function makeOuterEditor(): Editor {
  return track(
    new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        createAnnotatedFigureCanvasNode(),
        createAnnotatedFigureAnnotationNode(),
        AnnotatedFigureLegendNode,
        createAnnotatedFigureNode(),
      ],
      content: outerDocument(),
    }),
  );
}

function outerDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "annotated_figure",
        attrs: {
          id: "figure-one",
          data: {
            type: "annotated_figure",
            source: null,
            alt: "",
            captionDisplay: "list",
          },
        },
        content: [
          { type: "annotated_figure_canvas" },
          {
            type: "annotated_figure_legend",
            content: [
              annotation("annotation-one", "First caption"),
              annotation("annotation-two", "Second caption"),
            ],
          },
        ],
      },
    ],
  };
}

function annotation(id: string, caption: string): JSONContent {
  return {
    type: "annotated_figure_annotation",
    attrs: { id, x: 50, y: 50 },
    content: [{ type: "paragraph", content: [{ type: "text", text: caption }] }],
  };
}

function findFigure(editor: Editor) {
  const node = editor.state.doc.firstChild;
  if (!node) throw new Error("Missing Annotated Figure");
  return { node, pos: 0 };
}

function reverseAnnotations(editor: Editor): void {
  const model = resolveAnnotatedFigureModel(findFigure(editor));
  if (!model) throw new Error("Missing Annotated Figure model");
  const [first, second] = model.annotations;
  if (!first || !second) throw new Error("Expected two annotations");

  editor.view.dispatch(
    editor.state.tr.replaceWith(
      model.legend.pos + 1,
      model.legend.pos + model.legend.node.nodeSize - 1,
      [second.node, first.node],
    ),
  );
}
