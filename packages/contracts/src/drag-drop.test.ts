import { describe, expect, it } from "vite-plus/test";

import {
  DragDropCanvasDataSchema,
  DragDropPayloadSchema,
  DragDropPrivateAssessmentSchema,
  DragDropSettingsSchema,
  MarkerPresetIdSchema,
  MarkerVisualSchema,
  SpatialPlacementAssessmentSchema,
  SpatialPlacementCircleSchema,
  SpatialPlacementInteractionSchema,
  SpatialPlacementPointSchema,
  SpatialPlacementResponseSchema,
  type DragDropPayload,
} from "./drag-drop";

const feedback = {
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text: "Try farther east." }] }],
  },
};

const completePayload = {
  canvas: {
    image: { mode: "external" as const, src: "https://example.com/map.png", alt: "Map" },
    imageAspectRatio: 2,
    defaultMarkerVisual: { kind: "preset" as const, preset: "pin" as const },
    markers: [
      {
        id: "marker_00001",
        label: "Capital",
        visualOverride: null,
      },
      {
        id: "marker_00002",
        label: "Harbour",
        visualOverride: {
          kind: "custom" as const,
          source: { mode: "managed" as const, mediaId: "media-1" },
        },
      },
    ],
  },
  assessment: {
    correctPlacements: [
      {
        markerId: "marker_00001",
        geometry: { kind: "circle" as const, centerX: 0, centerY: 100, radius: 8 },
      },
      {
        markerId: "marker_00002",
        geometry: { kind: "circle" as const, centerX: 75, centerY: 25, radius: 12 },
      },
    ],
    feedbackByMarkerId: { marker_00001: feedback },
    summaryFeedback: feedback,
  },
};

describe("drag-and-drop authored persisted contracts", () => {
  it("accepts an empty authored draft with a null image aspect ratio", () => {
    const draft = {
      canvas: {
        image: null,
        imageAspectRatio: null,
        defaultMarkerVisual: { kind: "preset", preset: "pin" },
        markers: [],
      },
      assessment: {
        correctPlacements: [],
        feedbackByMarkerId: {},
        summaryFeedback: null,
      },
    };

    expect(DragDropPayloadSchema.parse(draft)).toEqual(draft);
  });

  it("uses the settled preset IDs and managed media for custom visuals", () => {
    expect(MarkerPresetIdSchema.options).toEqual(["cross", "pin", "dot", "flag", "check"]);

    for (const preset of MarkerPresetIdSchema.options) {
      expect(MarkerVisualSchema.parse({ kind: "preset", preset })).toEqual({
        kind: "preset",
        preset,
      });
    }
    expect(
      MarkerVisualSchema.parse({
        kind: "custom",
        source: { mode: "managed", mediaId: "media-1" },
      }),
    ).toEqual({ kind: "custom", source: { mode: "managed", mediaId: "media-1" } });

    for (const visual of [
      { kind: "preset", preset: "component-name" },
      { kind: "custom", source: { mode: "external", src: "https://example.com/icon.png" } },
      { kind: "custom", source: { mode: "managed", mediaId: "media-1", svg: true } },
      { kind: "preset", preset: "pin", editorOnly: true },
    ]) {
      expect(MarkerVisualSchema.safeParse(visual).success).toBe(false);
    }
  });

  it("accepts and round-trips a complete authored graph without public answer geometry", () => {
    const parsed: DragDropPayload = DragDropPayloadSchema.parse(completePayload);
    const reparsed = DragDropPayloadSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
    expect(parsed.canvas.markers).toEqual(completePayload.canvas.markers);
    expect(
      DragDropCanvasDataSchema.safeParse({
        ...completePayload.canvas,
        markers: [
          {
            ...completePayload.canvas.markers[0],
            geometry: { kind: "circle", centerX: 20, centerY: 30, radius: 8 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("preserves markers and exact answers after the background is cleared", () => {
    const clearedBackgroundPayload = {
      ...completePayload,
      canvas: {
        ...completePayload.canvas,
        image: null,
      },
    };

    expect(DragDropPayloadSchema.parse(clearedBackgroundPayload)).toEqual(clearedBackgroundPayload);
  });

  it("preserves authored defaults and rejects unknown authored fields", () => {
    expect(
      DragDropCanvasDataSchema.parse({
        defaultMarkerVisual: { kind: "preset", preset: "dot" },
      }),
    ).toEqual({
      image: null,
      imageAspectRatio: null,
      defaultMarkerVisual: { kind: "preset", preset: "dot" },
      markers: [],
    });
    expect(DragDropPrivateAssessmentSchema.parse({})).toEqual({
      correctPlacements: [],
      feedbackByMarkerId: {},
      summaryFeedback: null,
    });
    expect(DragDropSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      gradingMode: "partial-credit",
      points: 1,
      maxAttempts: null,
    });

    expect(
      DragDropCanvasDataSchema.safeParse({ ...completePayload.canvas, extra: true }).success,
    ).toBe(false);
    expect(
      DragDropPrivateAssessmentSchema.safeParse({ ...completePayload.assessment, extra: true })
        .success,
    ).toBe(false);
    expect(DragDropSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
  });

  it("rejects duplicate marker identities and blank labels", () => {
    expect(
      DragDropCanvasDataSchema.safeParse({
        ...completePayload.canvas,
        markers: [completePayload.canvas.markers[0], completePayload.canvas.markers[0]],
      }).success,
    ).toBe(false);
    for (const label of ["", "   ", "\t\n"]) {
      expect(
        DragDropCanvasDataSchema.safeParse({
          ...completePayload.canvas,
          markers: [{ ...completePayload.canvas.markers[0], label }],
        }).success,
      ).toBe(false);
    }
  });

  it("allows a null aspect ratio only for an untouched empty draft", () => {
    expect(
      DragDropCanvasDataSchema.safeParse({
        ...completePayload.canvas,
        imageAspectRatio: null,
      }).success,
    ).toBe(false);
    expect(
      DragDropCanvasDataSchema.safeParse({
        ...completePayload.canvas,
        imageAspectRatio: null,
        markers: [],
      }).success,
    ).toBe(false);
    expect(
      DragDropPayloadSchema.safeParse({
        canvas: {
          image: null,
          imageAspectRatio: null,
          defaultMarkerVisual: { kind: "preset", preset: "pin" },
          markers: [],
        },
        assessment: {
          ...completePayload.assessment,
          correctPlacements: [completePayload.assessment.correctPlacements[0]],
          feedbackByMarkerId: {},
        },
      }).success,
    ).toBe(false);

    for (const imageAspectRatio of [0, -1, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(
        DragDropCanvasDataSchema.safeParse({
          ...completePayload.canvas,
          imageAspectRatio,
        }).success,
      ).toBe(false);
    }
  });

  it("requires exact answer coverage and current feedback references", () => {
    const missingAnswer = structuredClone(completePayload);
    missingAnswer.assessment.correctPlacements.pop();
    const extraAnswer = {
      ...structuredClone(completePayload),
      assessment: {
        ...structuredClone(completePayload.assessment),
        correctPlacements: [
          ...structuredClone(completePayload.assessment.correctPlacements),
          {
            markerId: "marker_00003",
            geometry: { kind: "circle" as const, centerX: 50, centerY: 50, radius: 10 },
          },
        ],
      },
    };
    const danglingFeedback = {
      ...structuredClone(completePayload),
      assessment: {
        ...structuredClone(completePayload.assessment),
        feedbackByMarkerId: { marker_00003: feedback },
      },
    };

    for (const payload of [missingAnswer, extraAnswer, danglingFeedback]) {
      expect(DragDropPayloadSchema.safeParse(payload).success).toBe(false);
    }
  });

  it("rejects duplicate private answers and malformed feedback identities", () => {
    expect(
      DragDropPrivateAssessmentSchema.safeParse({
        ...completePayload.assessment,
        correctPlacements: [
          completePayload.assessment.correctPlacements[0],
          completePayload.assessment.correctPlacements[0],
        ],
      }).success,
    ).toBe(false);
    expect(
      DragDropPrivateAssessmentSchema.safeParse({
        ...completePayload.assessment,
        feedbackByMarkerId: { short: feedback },
      }).success,
    ).toBe(false);
  });
});

describe("spatial-placement canonical schemas", () => {
  it("accepts finite boundary points and positive circles", () => {
    expect(SpatialPlacementPointSchema.parse({ x: 0, y: 100 })).toEqual({ x: 0, y: 100 });
    expect(
      SpatialPlacementCircleSchema.parse({ kind: "circle", centerX: 100, centerY: 0, radius: 100 }),
    ).toEqual({ kind: "circle", centerX: 100, centerY: 0, radius: 100 });

    for (const point of [
      { x: -1, y: 50 },
      { x: 101, y: 50 },
      { x: 50, y: Number.NaN },
      { x: Infinity, y: 50 },
    ]) {
      expect(SpatialPlacementPointSchema.safeParse(point).success).toBe(false);
    }
    for (const circle of [
      { kind: "circle", centerX: -1, centerY: 50, radius: 10 },
      { kind: "circle", centerX: 50, centerY: 101, radius: 10 },
      { kind: "circle", centerX: 50, centerY: 50, radius: 0 },
      { kind: "circle", centerX: 50, centerY: 50, radius: -1 },
      { kind: "circle", centerX: 50, centerY: 50, radius: Infinity },
    ]) {
      expect(SpatialPlacementCircleSchema.safeParse(circle).success).toBe(false);
    }
  });

  it("requires unique marker identities and non-blank labels", () => {
    expect(
      SpatialPlacementInteractionSchema.parse({
        kind: "spatial-placement",
        markers: [
          { id: "marker_00001", label: "Capital" },
          { id: "marker_00002", label: "Capital" },
        ],
      }),
    ).toEqual({
      kind: "spatial-placement",
      markers: [
        { id: "marker_00001", label: "Capital" },
        { id: "marker_00002", label: "Capital" },
      ],
    });
    expect(
      SpatialPlacementInteractionSchema.safeParse({
        kind: "spatial-placement",
        markers: [
          { id: "marker_00001", label: "Capital" },
          { id: "marker_00001", label: "Harbour" },
        ],
      }).success,
    ).toBe(false);
    expect(
      SpatialPlacementInteractionSchema.safeParse({
        kind: "spatial-placement",
        markers: [{ id: "marker_00001", label: "  " }],
      }).success,
    ).toBe(false);
  });

  it("accepts only positive resolved aspect ratios for non-empty answer keys", () => {
    expect(
      SpatialPlacementAssessmentSchema.parse({
        kind: "spatial-placement",
        gradingMode: "partial-credit",
        imageAspectRatio: null,
        correctPlacements: [],
        feedbackByMarkerId: {},
      }),
    ).toEqual({
      kind: "spatial-placement",
      gradingMode: "partial-credit",
      imageAspectRatio: null,
      correctPlacements: [],
      feedbackByMarkerId: {},
    });

    for (const imageAspectRatio of [null, 0, -1, Number.NaN, Infinity]) {
      expect(
        SpatialPlacementAssessmentSchema.safeParse({
          kind: "spatial-placement",
          gradingMode: "all-or-nothing",
          imageAspectRatio,
          correctPlacements: [completePayload.assessment.correctPlacements[0]],
          feedbackByMarkerId: {},
        }).success,
      ).toBe(false);
    }
  });

  it("preserves partial responses while rejecting duplicate or invalid placements", () => {
    const partial = {
      kind: "spatial-placement" as const,
      placements: [{ markerId: "marker_00001", x: 25, y: 75 }],
    };
    expect(
      SpatialPlacementResponseSchema.parse({ kind: "spatial-placement", placements: [] }),
    ).toEqual({ kind: "spatial-placement", placements: [] });
    expect(SpatialPlacementResponseSchema.parse(partial)).toEqual(partial);

    for (const response of [
      {
        kind: "spatial-placement",
        placements: [partial.placements[0], partial.placements[0]],
      },
      { kind: "spatial-placement", placements: [{ markerId: "short", x: 25, y: 75 }] },
      { kind: "spatial-placement", placements: [{ markerId: "marker_00001", x: -1, y: 75 }] },
      { kind: "spatial-placement", placements: [{ markerId: "marker_00001", x: 25, y: 101 }] },
      {
        kind: "spatial-placement",
        placements: [{ markerId: "marker_00001", x: Number.NaN, y: 75 }],
      },
      {
        kind: "spatial-placement",
        placements: [{ markerId: "marker_00001", x: 25, y: Infinity }],
      },
      { kind: "spatial-placement", placements: [{ ...partial.placements[0], correct: true }] },
    ]) {
      expect(SpatialPlacementResponseSchema.safeParse(response).success).toBe(false);
    }
  });
});
