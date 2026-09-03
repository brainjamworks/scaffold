import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import {
  clearDragDropPlacements,
  fromDragDropContractResponse,
  hasDragDropResponse,
  removeDragDropPlacement,
  setDragDropPlacement,
  toDragDropContractResponse,
} from "./drag-drop-response-codec";
import {
  projectDragDropAssessment,
  projectDragDropInteraction,
  projectDragDropLearnerNode,
} from "./assessment";

const interaction = {
  kind: "spatial-placement" as const,
  markers: [
    { id: "marker000002", label: "Paris" },
    { id: "marker000001", label: "London" },
  ],
};

describe("Drag and Drop assessment projection", () => {
  it("projects ordered markers and private answers through separate boundaries", () => {
    const node = completeQuestion();

    expect(projectDragDropInteraction(node)).toEqual(interaction);
    expect(projectDragDropAssessment(node)).toMatchObject({
      kind: "spatial-placement",
      gradingMode: "all-or-nothing",
      imageAspectRatio: 2,
      correctPlacements: [
        {
          markerId: "marker000002",
          geometry: { kind: "circle", centerX: 75, centerY: 30, radius: 5 },
        },
        {
          markerId: "marker000001",
          geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
        },
      ],
    });
  });

  it("deeply redacts correct geometry and private feedback from the learner node", () => {
    const learner = projectDragDropLearnerNode(completeQuestion());
    const serialized = JSON.stringify(learner);

    expect(learner.attrs).not.toHaveProperty("assessment");
    expect(serialized).not.toContain("correctPlacements");
    expect(serialized).not.toContain("feedbackByMarkerId");
    expect(serialized).not.toContain("Private Paris feedback");
    expect(serialized).not.toContain("centerX");
    expect(serialized).not.toContain("radius");
    expect(serialized).toContain("marker000002");
    expect(serialized).toContain("Paris");
  });

  it("rejects projection of an incomplete authoring draft", () => {
    const draft = completeQuestion();
    draft.content![3]!.attrs = {
      id: "canvas000001",
      data: {
        image: null,
        imageAspectRatio: null,
        defaultMarkerVisual: { kind: "preset", preset: "dot" },
        markers: [],
      },
    };
    draft.attrs!["assessment"] = {
      correctPlacements: [],
      feedbackByMarkerId: {},
      summaryFeedback: null,
    };

    expect(() => projectDragDropInteraction(draft)).toThrow("not learner-ready");
  });
});

describe("Drag and Drop response codec", () => {
  it("canonicalizes placements in authored marker order", () => {
    const response = {
      placements: {
        marker000001: { x: 25, y: 60 },
        marker000002: { x: 75, y: 30 },
      },
    };

    expect(toDragDropContractResponse(response, interaction)).toEqual({
      kind: "spatial-placement",
      placements: [
        { markerId: "marker000002", x: 75, y: 30 },
        { markerId: "marker000001", x: 25, y: 60 },
      ],
    });
    expect(hasDragDropResponse(response, interaction)).toBe(true);
    expect(
      hasDragDropResponse({ placements: { marker000001: { x: 25, y: 60 } } }, interaction),
    ).toBe(false);
  });

  it("hydrates current markers and drops only obsolete marker identities", () => {
    expect(
      fromDragDropContractResponse(
        {
          kind: "spatial-placement",
          placements: [
            { markerId: "obsolete0001", x: 10, y: 20 },
            { markerId: "marker000001", x: 25, y: 60 },
          ],
        },
        interaction,
      ),
    ).toEqual({ placements: { marker000001: { x: 25, y: 60 } } });
  });

  it("keeps placement updates immutable and reset explicit", () => {
    const initial = { placements: { marker000001: { x: 25, y: 60 } } };
    const placed = setDragDropPlacement(initial, "marker000002", { x: 75, y: 30 }, interaction);
    const removed = removeDragDropPlacement(placed, "marker000001", interaction);

    expect(initial).toEqual({ placements: { marker000001: { x: 25, y: 60 } } });
    expect(placed).toEqual({
      placements: {
        marker000001: { x: 25, y: 60 },
        marker000002: { x: 75, y: 30 },
      },
    });
    expect(removed).toEqual({ placements: { marker000002: { x: 75, y: 30 } } });
    expect(clearDragDropPlacements()).toEqual({ placements: {} });
  });

  it.each([
    {
      kind: "spatial-placement",
      placements: [
        { markerId: "marker000001", x: 25, y: 60 },
        { markerId: "marker000001", x: 30, y: 65 },
      ],
    },
    {
      kind: "spatial-placement",
      placements: [{ markerId: "marker000001", x: Number.NaN, y: 60 }],
    },
    { kind: "single-select", optionId: null },
  ])("keeps malformed canonical responses observable", (response) => {
    expect(() => fromDragDropContractResponse(response as never, interaction)).toThrow();
  });
});

function completeQuestion(): JSONContent {
  return {
    type: "drag_drop",
    attrs: {
      id: "dragdrop0001",
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        gradingMode: "all-or-nothing",
        points: 2,
        maxAttempts: null,
        legend: "Place city markers",
      },
      assessment: {
        correctPlacements: [
          {
            markerId: "marker000002",
            geometry: { kind: "circle", centerX: 75, centerY: 30, radius: 5 },
          },
          {
            markerId: "marker000001",
            geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
          },
        ],
        feedbackByMarkerId: {
          marker000002: richFeedback("Private Paris feedback"),
        },
        summaryFeedback: richFeedback("Private summary feedback"),
      },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "drag_drop_canvas",
        attrs: {
          id: "canvas000001",
          data: {
            image: { mode: "managed", mediaId: "media0000001", alt: "Map" },
            imageAspectRatio: 2,
            defaultMarkerVisual: { kind: "preset", preset: "dot" },
            markers: [
              {
                id: "marker000002",
                label: "Paris",
                visualOverride: { kind: "preset", preset: "pin" },
              },
              { id: "marker000001", label: "London", visualOverride: null },
            ],
          },
        },
      },
      {
        type: "assessment_actions_group",
        content: [
          { type: "assessment_hints_group" },
          {
            type: "assessment_summary_feedback",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Private shell" }] }],
          },
        ],
      },
    ],
  };
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
