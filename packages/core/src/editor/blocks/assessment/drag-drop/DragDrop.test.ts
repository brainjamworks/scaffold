import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createDragDropCanvasNode, defaultDragDropCanvasData } from "./drag-drop-canvas-shared";
import { createDragDropNode, parseDragDropAuthoredQuestion } from "./node";

describe("Drag and Drop authored graph", () => {
  it("accepts the canonical empty draft", () => {
    const question = parseDragDropAuthoredQuestion(questionNode());

    expect(question.ownerId).toBe("dragdrop0001");
    expect(question.canvas).toEqual(defaultDragDropCanvasData());
    expect(question.ready).toBe(false);
  });

  it("materializes a complete immutable question", () => {
    const question = parseDragDropAuthoredQuestion(
      questionNode({
        canvas: {
          image: imageAttrs(),
          imageAspectRatio: 2,
          defaultMarkerVisual: { kind: "preset", preset: "pin" },
          markers: [
            { id: "marker000001", label: "London", visualOverride: null },
            {
              id: "marker000002",
              label: "Paris",
              visualOverride: { kind: "preset", preset: "flag" },
            },
          ],
        },
        assessment: {
          correctPlacements: [
            {
              markerId: "marker000001",
              geometry: { kind: "circle", centerX: 25, centerY: 30, radius: 5 },
            },
            {
              markerId: "marker000002",
              geometry: { kind: "circle", centerX: 75, centerY: 60, radius: 4 },
            },
          ],
          feedbackByMarkerId: {
            marker000002: richFeedback("Look farther north."),
          },
          summaryFeedback: null,
        },
      }),
    );

    expect(question.ready).toBe(true);
    expect(question.canvas.markers.map(({ id }) => id)).toEqual(["marker000001", "marker000002"]);
    expect(question.assessment.correctPlacements).toHaveLength(2);
  });

  it.each([
    ["wrong owner", { type: "paragraph", attrs: { id: "dragdrop0001" } }],
    ["blank owner identity", questionNode({ ownerId: "" })],
    [
      "missing canvas",
      questionNode({ content: shellContent().filter((node) => node.type !== "drag_drop_canvas") }),
    ],
    ["duplicate canvas", questionNode({ content: [...shellContent(), canvasNode()] })],
  ])("rejects malformed owner/child graph: %s", (_label, node) => {
    expect(() => parseDragDropAuthoredQuestion(node as JSONContent)).toThrow();
  });

  it.each([
    [
      "image without ratio",
      { image: imageAttrs(), imageAspectRatio: null, defaultMarkerVisual: preset(), markers: [] },
      emptyAssessment(),
    ],
    [
      "duplicate marker identities",
      readyCanvas([marker("marker000001", "One"), marker("marker000001", "Two")]),
      answers("marker000001"),
    ],
    ["marker without answer", readyCanvas([marker("marker000001", "One")]), emptyAssessment()],
    ["answer without marker", readyCanvas([]), answers("marker000001")],
    [
      "dangling feedback",
      readyCanvas([]),
      { ...emptyAssessment(), feedbackByMarkerId: { marker000001: richFeedback("No") } },
    ],
  ])("rejects malformed authored data: %s", (_label, canvas, assessment) => {
    expect(() => parseDragDropAuthoredQuestion(questionNode({ canvas, assessment }))).toThrow();
  });

  it("defines an atomic, non-selectable, non-draggable canvas in a fixed assessment shell", () => {
    expect(createDragDropCanvasNode().config).toMatchObject({
      name: "drag_drop_canvas",
      atom: true,
      selectable: false,
      draggable: false,
    });
    expect(createDragDropNode().config.content).toBe(
      "assessment_title assessment_instructions assessment_prompt drag_drop_canvas assessment_actions_group",
    );
  });
});

function questionNode({
  ownerId = "dragdrop0001",
  canvas = defaultDragDropCanvasData(),
  assessment = emptyAssessment(),
  content = shellContent(canvas),
}: {
  ownerId?: string;
  canvas?: unknown;
  assessment?: unknown;
  content?: JSONContent[];
} = {}): JSONContent {
  return {
    type: "drag_drop",
    attrs: { id: ownerId, settings: {}, assessment },
    content,
  };
}

function shellContent(canvas: unknown = defaultDragDropCanvasData()): JSONContent[] {
  return [
    { type: "assessment_title" },
    { type: "assessment_instructions" },
    { type: "assessment_prompt" },
    canvasNode(canvas),
    { type: "assessment_actions_group" },
  ];
}

function canvasNode(data: unknown = defaultDragDropCanvasData()): JSONContent {
  return { type: "drag_drop_canvas", attrs: { id: "canvas000001", data } };
}

function imageAttrs() {
  return {
    mode: "managed" as const,
    mediaId: "media0000001",
    alt: "Map",
  };
}

function preset() {
  return { kind: "preset" as const, preset: "dot" as const };
}

function marker(id: string, label: string) {
  return { id, label, visualOverride: null };
}

function readyCanvas(markers: ReturnType<typeof marker>[]) {
  return { image: imageAttrs(), imageAspectRatio: 2, defaultMarkerVisual: preset(), markers };
}

function answers(...markerIds: string[]) {
  return {
    correctPlacements: markerIds.map((markerId) => ({
      markerId,
      geometry: { kind: "circle" as const, centerX: 50, centerY: 50, radius: 5 },
    })),
    feedbackByMarkerId: {},
    summaryFeedback: null,
  };
}

function emptyAssessment() {
  return { correctPlacements: [], feedbackByMarkerId: {}, summaryFeedback: null };
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}
