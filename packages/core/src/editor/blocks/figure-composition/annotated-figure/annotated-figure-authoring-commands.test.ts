// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createAuthoringNodeTarget,
  type ResolvedAuthoringNode,
} from "@/editor/prosemirror/authoring-target";

import {
  addAnnotatedFigureAnnotationChecked,
  moveAnnotatedFigureAnnotationChecked,
  removeAnnotatedFigureAnnotationChecked,
  setAnnotatedFigureAnnotationPositionChecked,
} from "./annotated-figure-authoring-commands";
import { createAnnotatedFigureCanvasNode } from "./annotated-figure-canvas-shared";
import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";
import { createAnnotatedFigureNode } from "./node";
import { AnnotatedFigureLegendNode, createAnnotatedFigureAnnotationNode } from "./slots";
import { createTestNodeIdentityExtension } from "@/editor/testing";

const FIGURE_ID = "figure000001";
const ANNOTATION_A_ID = "annotate0001";
const ANNOTATION_B_ID = "annotate0002";
const ANNOTATION_C_ID = "annotate0003";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function makeEditor() {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createAnnotatedFigureCanvasNode(),
      createAnnotatedFigureAnnotationNode(),
      AnnotatedFigureLegendNode,
      createAnnotatedFigureNode(),
      createTestNodeIdentityExtension(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "annotated_figure",
          attrs: {
            id: FIGURE_ID,
            data: {
              type: "annotated_figure",
              source: { mode: "external", src: "https://example.com/map.png" },
              alt: "Map",
              captionDisplay: "list",
            },
          },
          content: [
            { type: "annotated_figure_canvas" },
            {
              type: "annotated_figure_legend",
              content: [
                {
                  type: "annotated_figure_annotation",
                  attrs: { id: ANNOTATION_A_ID, x: 10, y: 20 },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Alpha", marks: [{ type: "bold" }] }],
                    },
                  ],
                },
                {
                  type: "annotated_figure_annotation",
                  attrs: { id: ANNOTATION_B_ID, x: 70, y: 80 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Beta" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function ownerTarget(editor: Editor): ResolvedAuthoringNode {
  const target = createAuthoringNodeTarget(editor, {
    id: FIGURE_ID,
    nodeType: "annotated_figure",
  }).read();
  if (!target) throw new Error("Expected Annotated Figure owner.");
  return target;
}

describe("Annotated Figure v3 document model", () => {
  it("defines a fixed atom canvas and compound annotation structure", () => {
    const editor = makeEditor();
    const canvasType = editor.schema.nodes["annotated_figure_canvas"]!;
    const annotationType = editor.schema.nodes["annotated_figure_annotation"]!;
    const legendType = editor.schema.nodes["annotated_figure_legend"]!;
    const ownerType = editor.schema.nodes["annotated_figure"]!;

    expect(canvasType.spec.atom).toBe(true);
    expect(canvasType.spec.selectable).toBe(false);
    expect(canvasType.spec.draggable).toBe(false);
    expect(annotationType.spec.content).toBe("paragraph");
    expect(legendType.spec.content).toBe("annotated_figure_annotation*");
    expect(ownerType.spec.content).toBe("annotated_figure_canvas annotated_figure_legend");
  });

  it("resolves fixed children, live positions, and numbering from annotation order", () => {
    const editor = makeEditor();
    const model = resolveAnnotatedFigureModel(ownerTarget(editor));

    expect(model).not.toBeNull();
    expect(model?.data.captionDisplay).toBe("list");
    expect(editor.state.doc.nodeAt(model?.canvas.pos ?? -1)?.type.name).toBe(
      "annotated_figure_canvas",
    );
    expect(editor.state.doc.nodeAt(model?.legend.pos ?? -1)?.type.name).toBe(
      "annotated_figure_legend",
    );
    expect(
      model?.annotations.map(({ id, index, number, x, y, captionNode }) => ({
        id,
        index,
        number,
        x,
        y,
        caption: captionNode.textContent,
      })),
    ).toEqual([
      { id: ANNOTATION_A_ID, index: 0, number: 1, x: 10, y: 20, caption: "Alpha" },
      { id: ANNOTATION_B_ID, index: 1, number: 2, x: 70, y: 80, caption: "Beta" },
    ]);
  });

  it("rejects duplicate ids and malformed fixed content", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);
    const canvas = target.node.child(0);
    const legend = target.node.child(1);
    const duplicateLegend = legend.type.create(
      legend.attrs,
      Fragment.fromArray([
        legend.child(0),
        legend
          .child(1)
          .type.create({ ...legend.child(1).attrs, id: ANNOTATION_A_ID }, legend.child(1).content),
      ]),
    );
    const duplicateTarget = {
      ...target,
      node: target.node.type.create(
        target.node.attrs,
        Fragment.fromArray([canvas, duplicateLegend]),
      ),
    };
    const malformedTarget = {
      ...target,
      node: target.node.type.create(target.node.attrs, Fragment.from(legend)),
    };

    expect(resolveAnnotatedFigureModel(duplicateTarget)).toBeNull();
    expect(resolveAnnotatedFigureModel(malformedTarget)).toBeNull();
  });
});

describe("Annotated Figure checked authoring commands", () => {
  it("adds one complete annotation and clamps its position", () => {
    const editor = makeEditor();
    const result = addAnnotatedFigureAnnotationChecked({
      tr: editor.state.tr,
      target: ownerTarget(editor),
      annotationId: ANNOTATION_C_ID,
      x: -10,
      y: 120,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const model = resolveAnnotatedFigureModel({
      node: result.tr.doc.firstChild!,
      pos: 0,
    });
    expect(
      model?.annotations.map(({ id, x, y, captionNode }) => ({
        id,
        x,
        y,
        caption: captionNode.toJSON(),
      })),
    ).toContainEqual({
      id: ANNOTATION_C_ID,
      x: 0,
      y: 100,
      caption: expect.objectContaining({ type: "paragraph" }),
    });
  });

  it("removes and reorders complete annotation nodes without losing content", () => {
    const editor = makeEditor();
    const move = moveAnnotatedFigureAnnotationChecked({
      tr: editor.state.tr,
      target: ownerTarget(editor),
      annotationId: ANNOTATION_B_ID,
      direction: "before",
      relativeToId: ANNOTATION_A_ID,
    });
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    const movedModel = resolveAnnotatedFigureModel({ node: move.tr.doc.firstChild!, pos: 0 });
    expect(
      movedModel?.annotations.map(({ id, number, x, y, captionNode }) => ({
        id,
        number,
        x,
        y,
        caption: captionNode.textContent,
      })),
    ).toEqual([
      { id: ANNOTATION_B_ID, number: 1, x: 70, y: 80, caption: "Beta" },
      { id: ANNOTATION_A_ID, number: 2, x: 10, y: 20, caption: "Alpha" },
    ]);

    const remove = removeAnnotatedFigureAnnotationChecked({
      tr: move.tr,
      target: { status: "ready", node: move.tr.doc.firstChild!, pos: 0 },
      annotationId: ANNOTATION_A_ID,
    });
    expect(remove.ok).toBe(true);
    if (!remove.ok) return;
    expect(
      resolveAnnotatedFigureModel({ node: remove.tr.doc.firstChild!, pos: 0 })?.annotations.map(
        ({ id }) => id,
      ),
    ).toEqual([ANNOTATION_B_ID]);
  });

  it("changes only the selected annotation coordinates", () => {
    const editor = makeEditor();
    const result = setAnnotatedFigureAnnotationPositionChecked({
      tr: editor.state.tr,
      target: ownerTarget(editor),
      annotationId: ANNOTATION_A_ID,
      x: 42,
      y: 61,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const model = resolveAnnotatedFigureModel({ node: result.tr.doc.firstChild!, pos: 0 });
    expect(
      model?.annotations.map(({ id, x, y, captionNode }) => ({
        id,
        x,
        y,
        caption: captionNode.textContent,
      })),
    ).toEqual([
      { id: ANNOTATION_A_ID, x: 42, y: 61, caption: "Alpha" },
      { id: ANNOTATION_B_ID, x: 70, y: 80, caption: "Beta" },
    ]);
  });

  it("fails invalid requests without adding transaction steps", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);
    const transactions = Array.from({ length: 5 }, () => editor.state.tr);
    const results = [
      addAnnotatedFigureAnnotationChecked({
        tr: transactions[0]!,
        target,
        annotationId: ANNOTATION_A_ID,
        x: 50,
        y: 50,
      }),
      addAnnotatedFigureAnnotationChecked({
        tr: transactions[1]!,
        target,
        annotationId: "",
        x: 50,
        y: 50,
      }),
      removeAnnotatedFigureAnnotationChecked({
        tr: transactions[2]!,
        target,
        annotationId: "missing",
      }),
      moveAnnotatedFigureAnnotationChecked({
        tr: transactions[3]!,
        target,
        annotationId: ANNOTATION_A_ID,
        direction: "after",
        relativeToId: "missing",
      }),
      setAnnotatedFigureAnnotationPositionChecked({
        tr: transactions[4]!,
        target,
        annotationId: ANNOTATION_A_ID,
        x: Number.NaN,
        y: 50,
      }),
    ];

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(transactions.map((tr) => tr.steps.length)).toEqual([0, 0, 0, 0, 0]);
  });
});
