import { describe, expect, it } from "vite-plus/test";

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  AssessmentResultSchema,
  type AssessmentFeedbackContent,
  type AssessmentResponseValue,
  type AssessmentTargetContract,
} from "@scaffold/contracts";

import { gradeAssessment } from "../src/index";

function richText(text: string): AssessmentFeedbackContent {
  return {
    kind: "rich-text",
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

const baseTarget = {
  schemaVersion: 2,
  targetId: EmbeddedNodeIdSchema.parse("target_00001"),
  blockId: EmbeddedNodeIdSchema.parse("block_000001"),
  blockType: "test",
  settings: {
    feedbackMode: "on_submit",
    isGraded: true,
    showAnswer: true,
    points: 1,
    maxAttempts: null,
  },
} satisfies Omit<AssessmentTargetContract, "interaction" | "assessment">;

const optionA = EmbeddedNodeIdSchema.parse("option_00001");
const optionB = EmbeddedNodeIdSchema.parse("option_00002");
const optionC = EmbeddedNodeIdSchema.parse("option_00003");
const matchItemA = EmbeddedNodeIdSchema.parse("item___00001");
const matchItemB = EmbeddedNodeIdSchema.parse("item___00002");
const matchTargetA = EmbeddedNodeIdSchema.parse("matcht_00001");
const matchTargetB = EmbeddedNodeIdSchema.parse("matcht_00002");
const blankA = EmbeddedNodeIdSchema.parse("blank_000001");
const blankB = EmbeddedNodeIdSchema.parse("blank_000002");
const hotspotA = EmbeddedDataIdSchema.parse("hotsp_000001");
const hotspotB = EmbeddedDataIdSchema.parse("hotsp_000002");
const markerA = EmbeddedDataIdSchema.parse("marker_00001");
const markerB = EmbeddedDataIdSchema.parse("marker_00002");
const staleMarker = EmbeddedDataIdSchema.parse("marker_99999");

type SpatialTarget = AssessmentTargetContract & {
  interaction: Extract<AssessmentTargetContract["interaction"], { kind: "spatial-placement" }>;
  assessment: Extract<AssessmentTargetContract["assessment"], { kind: "spatial-placement" }>;
};

function spatialTarget(): SpatialTarget {
  return {
    ...baseTarget,
    interaction: {
      kind: "spatial-placement",
      markers: [
        { id: markerA, label: "Marker A" },
        { id: markerB, label: "Marker B" },
      ],
    },
    assessment: {
      kind: "spatial-placement",
      gradingMode: "partial-credit",
      imageAspectRatio: 2,
      correctPlacements: [
        {
          markerId: markerA,
          geometry: { kind: "circle", centerX: 20, centerY: 20, radius: 5 },
        },
        {
          markerId: markerB,
          geometry: { kind: "circle", centerX: 80, centerY: 80, radius: 5 },
        },
      ],
      feedbackByMarkerId: {},
    },
  };
}

describe("@scaffold/grading primitive targets", () => {
  it("grades single-select targets", () => {
    const optionFeedback = richText("That is the correct option.");
    const summaryFeedback = richText("Review the worked answer.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "single-select",
        options: [{ id: optionA }, { id: optionB }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: optionB,
        feedbackByOptionId: { [optionB]: optionFeedback },
        summaryFeedback,
      },
    };

    const result = gradeAssessment(target, { kind: "single-select", optionId: optionB });

    expect(result).toEqual({
      score: { scaled: 1, raw: 1, min: 0, max: 1 },
      isCorrect: true,
      feedback: summaryFeedback,
      items: {
        [optionA]: { correct: false, expected: false, given: false },
        [optionB]: { correct: true, expected: true, given: true, feedback: optionFeedback },
      },
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("grades multi-select targets with wrong-pick penalty", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "multi-select",
        options: [{ id: optionA }, { id: optionB }, { id: optionC }],
        maxSelections: null,
      },
      assessment: {
        kind: "multi-select",
        correctOptionIds: [optionA, optionB],
        feedbackByOptionId: {},
      },
    };

    const result = gradeAssessment(target, {
      kind: "multi-select",
      optionIds: [optionA, optionC],
    });

    expect(result.score).toEqual({ scaled: 0, raw: 0, min: 0, max: 2 });
    expect(result.isCorrect).toBe(false);
  });

  it("grades sequence targets with positional partial credit", () => {
    const itemFeedback = richText("Check the middle position.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "sequence",
        items: [{ id: optionA }, { id: optionB }, { id: optionC }],
      },
      assessment: {
        kind: "sequence",
        correctOrder: [optionA, optionB, optionC],
        feedbackByItemId: { [optionB]: itemFeedback },
      },
    };

    const result = gradeAssessment(target, {
      kind: "sequence",
      orderedItemIds: [optionA, optionC, optionB],
    });

    expect(result.score).toEqual({ scaled: 1 / 3, raw: 1, min: 0, max: 3 });
    expect(result.isCorrect).toBe(false);
    expect(result.items[optionB]).toMatchObject({
      correct: false,
      expected: 1,
      given: 2,
      feedback: itemFeedback,
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("grades match and classify targets with item partial credit", () => {
    const itemFeedback = richText("Check the capital pairing.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "match",
        items: [{ id: matchItemA }, { id: matchItemB }],
        targets: [{ id: matchTargetA }, { id: matchTargetB }],
      },
      assessment: {
        kind: "match",
        correctPairs: [
          { itemId: matchItemA, targetId: matchTargetA },
          { itemId: matchItemB, targetId: matchTargetB },
        ],
        feedbackByItemId: { [matchItemB]: itemFeedback },
      },
    };

    const result = gradeAssessment(target, {
      kind: "match",
      pairs: [
        { itemId: matchItemA, targetId: matchTargetA },
        { itemId: matchItemB, targetId: matchTargetA },
      ],
    });

    expect(result.score).toEqual({ scaled: 0.5, raw: 1, min: 0, max: 2 });
    expect(result.isCorrect).toBe(false);
    expect(result.items[matchItemB]).toMatchObject({
      correct: false,
      expected: matchTargetB,
      given: matchTargetA,
      feedback: itemFeedback,
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("requires an exact unique current Matching mapping for correctness", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "match",
        items: [{ id: "fr" }, { id: "es" }],
        targets: [{ id: "paris" }, { id: "madrid" }],
      },
      assessment: {
        kind: "match",
        correctPairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "es", targetId: "madrid" },
        ],
        feedbackByItemId: {},
      },
    };

    expect(
      gradeAssessment(target, {
        kind: "match",
        pairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "es", targetId: "madrid" },
        ],
      }),
    ).toMatchObject({
      isCorrect: true,
      score: { scaled: 1, raw: 2, min: 0, max: 2 },
    });

    expect(
      gradeAssessment(target, {
        kind: "match",
        pairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "es", targetId: "madrid" },
          { itemId: "stale", targetId: "madrid" },
        ],
      }),
    ).toMatchObject({
      isCorrect: false,
      score: { scaled: 1, raw: 2, min: 0, max: 2 },
    });

    expect(
      gradeAssessment(target, {
        kind: "match",
        pairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "fr", targetId: "madrid" },
          { itemId: "es", targetId: "madrid" },
        ],
      }).isCorrect,
    ).toBe(false);

    expect(
      gradeAssessment(target, {
        kind: "match",
        pairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "es", targetId: "unknown" },
        ],
      }),
    ).toMatchObject({
      isCorrect: false,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
    });

    const duplicateExpected: AssessmentTargetContract = {
      ...target,
      assessment: {
        ...target.assessment,
        correctPairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "fr", targetId: "madrid" },
        ],
      },
    };
    expect(
      gradeAssessment(duplicateExpected, {
        kind: "match",
        pairs: [{ itemId: "fr", targetId: "paris" }],
      }).isCorrect,
    ).toBe(false);
  });

  it("requires an exact unique current Categorise mapping for correctness", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "classify",
        items: [{ id: "eagle" }, { id: "salmon" }],
        categories: [{ id: "birds" }, { id: "fish" }],
      },
      assessment: {
        kind: "classify",
        correctPlacements: [
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "salmon", categoryId: "fish" },
        ],
        feedbackByItemId: {},
      },
    };

    expect(
      gradeAssessment(target, {
        kind: "classify",
        placements: [
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "salmon", categoryId: "fish" },
        ],
      }),
    ).toMatchObject({
      isCorrect: true,
      score: { scaled: 1, raw: 2, min: 0, max: 2 },
    });

    expect(
      gradeAssessment(target, {
        kind: "classify",
        placements: [
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "salmon", categoryId: "fish" },
          { itemId: "stale", categoryId: "birds" },
        ],
      }),
    ).toMatchObject({
      isCorrect: false,
      score: { scaled: 1, raw: 2, min: 0, max: 2 },
    });

    expect(
      gradeAssessment(target, {
        kind: "classify",
        placements: [
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "eagle", categoryId: "fish" },
          { itemId: "salmon", categoryId: "fish" },
        ],
      }).isCorrect,
    ).toBe(false);

    expect(
      gradeAssessment(target, {
        kind: "classify",
        placements: [
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "salmon", categoryId: "unknown" },
        ],
      }),
    ).toMatchObject({
      isCorrect: false,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
    });

    const duplicateExpected: AssessmentTargetContract = {
      ...target,
      assessment: {
        ...target.assessment,
        correctPlacements: [
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "eagle", categoryId: "birds" },
        ],
      },
    };
    expect(
      gradeAssessment(duplicateExpected, {
        kind: "classify",
        placements: [{ itemId: "eagle", categoryId: "birds" }],
      }).isCorrect,
    ).toBe(false);
  });

  it("grades fill-blanks targets with answer normalization", () => {
    const blankFeedback = richText("Review the river name.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "fill-blanks",
        blanks: [{ id: blankA }, { id: blankB }],
      },
      assessment: {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: blankA,
            acceptedAnswers: ["Paris"],
            caseSensitive: false,
            trimWhitespace: true,
          },
          {
            blankId: blankB,
            acceptedAnswers: ["Seine"],
            caseSensitive: false,
            trimWhitespace: true,
          },
        ],
        feedbackByBlankId: { [blankB]: blankFeedback },
      },
    };

    const result = gradeAssessment(target, {
      kind: "fill-blanks",
      blanks: [
        { blankId: blankA, value: " paris " },
        { blankId: blankB, value: "Loire" },
      ],
    });

    expect(result).toMatchObject({
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      isCorrect: false,
      items: {
        [blankA]: { correct: true, expected: ["Paris"], given: " paris " },
        [blankB]: {
          correct: false,
          expected: ["Seine"],
          given: "Loire",
          feedback: blankFeedback,
        },
      },
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("rejects whitespace-only accepted answers while preserving significant raw whitespace", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "fill-blanks",
        blanks: [{ id: "empty" }, { id: "spaced" }, { id: "case" }],
      },
      assessment: {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: "empty",
            acceptedAnswers: ["   "],
            caseSensitive: false,
            trimWhitespace: false,
          },
          {
            blankId: "spaced",
            acceptedAnswers: [" Paris "],
            caseSensitive: true,
            trimWhitespace: false,
          },
          {
            blankId: "case",
            acceptedAnswers: ["I"],
            caseSensitive: false,
            trimWhitespace: true,
          },
        ],
        feedbackByBlankId: {},
      },
    };

    const result = gradeAssessment(target, {
      kind: "fill-blanks",
      blanks: [
        { blankId: "empty", value: "   " },
        { blankId: "spaced", value: "Paris" },
        { blankId: "case", value: "i" },
      ],
    });

    expect(result.items["empty"]?.correct).toBe(false);
    expect(result.items["spaced"]?.correct).toBe(false);
    expect(result.items["case"]?.correct).toBe(true);
  });

  it("grades spatial-hotspot targets", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "spatial-hotspot",
        hotspots: [
          {
            id: hotspotA,
            geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 10 },
          },
          {
            id: hotspotB,
            geometry: { kind: "circle", centerX: 20, centerY: 20, radius: 10 },
          },
        ],
        maxSelections: null,
      },
      assessment: {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: [hotspotA],
        feedbackByHotspotId: {},
      },
    };

    expect(
      gradeAssessment(target, {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: hotspotA, x: 50, y: 50 }],
      }),
    ).toMatchObject({ score: { scaled: 1, raw: 1, min: 0, max: 1 }, isCorrect: true });
  });

  it("grades spatial-hotspot partial credit from valid selections and all attempts", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "spatial-hotspot",
        hotspots: ["h1", "h2", "h3"].map((id, index) => ({
          id,
          geometry: { kind: "circle" as const, centerX: 20 + index * 30, centerY: 50, radius: 8 },
        })),
        maxSelections: null,
      },
      assessment: {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: ["h1", "h2"],
        feedbackByHotspotId: {},
      },
    };

    expect(
      gradeAssessment(target, {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: "h1", x: 20, y: 50 }],
      }),
    ).toMatchObject({
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      isCorrect: false,
    });
    expect(
      gradeAssessment(target, {
        kind: "spatial-hotspot",
        selections: [
          { hotspotId: "h1", x: 20, y: 50 },
          { hotspotId: "h3", x: 80, y: 50 },
        ],
      }),
    ).toMatchObject({
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      isCorrect: false,
    });
    expect(
      gradeAssessment(target, {
        kind: "spatial-hotspot",
        selections: [
          { hotspotId: "h1", x: 20, y: 50 },
          { hotspotId: "h2", x: 50, y: 50 },
          { hotspotId: null, x: 5, y: 5 },
        ],
      }),
    ).toMatchObject({
      score: { scaled: 2 / 3, raw: 2, min: 0, max: 3 },
      isCorrect: false,
    });
    expect(
      gradeAssessment(target, {
        kind: "spatial-hotspot",
        selections: [
          { hotspotId: "h1", x: 20, y: 50 },
          { hotspotId: "h1", x: 21, y: 50 },
          { hotspotId: "stale", x: 90, y: 90 },
        ],
      }),
    ).toMatchObject({
      score: { scaled: 1 / 3, raw: 1, min: 0, max: 3 },
      isCorrect: false,
    });
  });

  it("grades a spatial placement at its authored circle centre", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "spatial-placement",
        markers: [{ id: markerA, label: "Marker A" }],
      },
      assessment: {
        kind: "spatial-placement",
        gradingMode: "partial-credit",
        imageAspectRatio: 1,
        correctPlacements: [
          {
            markerId: markerA,
            geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 10 },
          },
        ],
        feedbackByMarkerId: {},
      },
    };

    const result = gradeAssessment(target, {
      kind: "spatial-placement",
      placements: [{ markerId: markerA, x: 50, y: 50 }],
    });

    expect(result).toEqual({
      score: { scaled: 1, raw: 1, min: 0, max: 1 },
      isCorrect: true,
      feedback: null,
      items: {
        [markerA]: { correct: true, expected: true, given: true },
      },
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("uses aspect-correct boundary geometry and equal partial credit for incomplete responses", () => {
    const result = gradeAssessment(spatialTarget(), {
      kind: "spatial-placement",
      placements: [{ markerId: markerA, x: 20, y: 30 }],
    });

    expect(result).toEqual({
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      isCorrect: false,
      feedback: null,
      items: {
        [markerA]: { correct: true, expected: true, given: true },
        [markerB]: { correct: false, expected: true, given: false },
      },
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("awards all-or-nothing only for exact complete all-correct coverage", () => {
    const target = spatialTarget();
    target.assessment.gradingMode = "all-or-nothing";

    expect(
      gradeAssessment(target, {
        kind: "spatial-placement",
        placements: [
          { markerId: markerA, x: 20, y: 20 },
          { markerId: markerB, x: 80, y: 80 },
        ],
      }),
    ).toMatchObject({
      score: { scaled: 1, raw: 1, min: 0, max: 1 },
      isCorrect: true,
    });

    expect(
      gradeAssessment(target, {
        kind: "spatial-placement",
        placements: [
          { markerId: markerA, x: 20, y: 20 },
          { markerId: markerB, x: 60, y: 60 },
        ],
      }),
    ).toMatchObject({
      score: { scaled: 0, raw: 0, min: 0, max: 1 },
      isCorrect: false,
    });
  });

  it("returns a normal zero incorrect result for an empty spatial interaction", () => {
    const target = spatialTarget();
    target.interaction.markers = [];
    target.assessment.imageAspectRatio = null;
    target.assessment.correctPlacements = [];
    target.assessment.gradingMode = "all-or-nothing";

    const result = gradeAssessment(target, {
      kind: "spatial-placement",
      placements: [],
    });

    expect(result).toEqual({
      score: { scaled: 0 },
      isCorrect: false,
      feedback: null,
      items: {},
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("preserves spatial marker and summary feedback", () => {
    const markerFeedback = richText("Move Marker B toward the lower-right target.");
    const summaryFeedback = richText("Review both marker positions.");
    const target = spatialTarget();
    target.assessment.feedbackByMarkerId = { [markerB]: markerFeedback };
    target.assessment.summaryFeedback = summaryFeedback;

    const result = gradeAssessment(target, {
      kind: "spatial-placement",
      placements: [
        { markerId: markerA, x: 20, y: 20 },
        { markerId: markerB, x: 60, y: 60 },
      ],
    });

    expect(result.feedback).toEqual(summaryFeedback);
    expect(result.items[markerB]).toEqual({
      correct: false,
      expected: true,
      given: false,
      feedback: markerFeedback,
    });
  });

  it("throws for duplicate or unknown spatial response marker identities", () => {
    const target = spatialTarget();

    expect(() =>
      gradeAssessment(target, {
        kind: "spatial-placement",
        placements: [
          { markerId: markerA, x: 20, y: 20 },
          { markerId: markerA, x: 21, y: 20 },
        ],
      }),
    ).toThrow(`duplicate spatial-placement response marker id: ${markerA}`);

    expect(() =>
      gradeAssessment(target, {
        kind: "spatial-placement",
        placements: [{ markerId: staleMarker, x: 20, y: 20 }],
      }),
    ).toThrow(`spatial-placement response references unknown marker: ${staleMarker}`);
  });

  it("throws for malformed spatial target identity and answer graphs", () => {
    const duplicateMarkers = spatialTarget();
    duplicateMarkers.interaction.markers = [
      { id: markerA, label: "Marker A" },
      { id: markerA, label: "Marker A duplicate" },
    ];
    expect(() =>
      gradeAssessment(duplicateMarkers, { kind: "spatial-placement", placements: [] }),
    ).toThrow(`duplicate spatial-placement interaction marker id: ${markerA}`);

    const duplicateAnswers = spatialTarget();
    duplicateAnswers.assessment.correctPlacements = [
      duplicateAnswers.assessment.correctPlacements[0]!,
      duplicateAnswers.assessment.correctPlacements[0]!,
    ];
    expect(() =>
      gradeAssessment(duplicateAnswers, { kind: "spatial-placement", placements: [] }),
    ).toThrow(`duplicate spatial-placement correct-placement marker id: ${markerA}`);

    const missingAnswer = spatialTarget();
    missingAnswer.assessment.correctPlacements = [missingAnswer.assessment.correctPlacements[0]!];
    expect(() =>
      gradeAssessment(missingAnswer, { kind: "spatial-placement", placements: [] }),
    ).toThrow(`spatial-placement answer is missing marker: ${markerB}`);

    const unknownAnswer = spatialTarget();
    unknownAnswer.assessment.correctPlacements = [
      ...unknownAnswer.assessment.correctPlacements,
      {
        markerId: staleMarker,
        geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 5 },
      },
    ];
    expect(() =>
      gradeAssessment(unknownAnswer, { kind: "spatial-placement", placements: [] }),
    ).toThrow(`spatial-placement answer references unknown marker: ${staleMarker}`);
  });

  it("throws for impossible spatial geometry and feedback relationships", () => {
    const missingAspectRatio = spatialTarget();
    missingAspectRatio.assessment.imageAspectRatio = null;
    expect(() =>
      gradeAssessment(missingAspectRatio, { kind: "spatial-placement", placements: [] }),
    ).toThrow("spatial-placement image aspect ratio must be finite and positive");

    const invalidEmptyAspectRatio = spatialTarget();
    invalidEmptyAspectRatio.interaction.markers = [];
    invalidEmptyAspectRatio.assessment.correctPlacements = [];
    invalidEmptyAspectRatio.assessment.imageAspectRatio = 0;
    expect(() =>
      gradeAssessment(invalidEmptyAspectRatio, {
        kind: "spatial-placement",
        placements: [],
      }),
    ).toThrow("spatial-placement image aspect ratio must be finite and positive");

    const unknownFeedback = spatialTarget();
    unknownFeedback.assessment.feedbackByMarkerId = {
      [staleMarker]: richText("Stale marker feedback."),
    };
    expect(() =>
      gradeAssessment(unknownFeedback, { kind: "spatial-placement", placements: [] }),
    ).toThrow(`spatial-placement feedback references unknown marker: ${staleMarker}`);

    expect(() =>
      gradeAssessment(spatialTarget(), {
        kind: "spatial-placement",
        placements: [{ markerId: markerA, x: Number.NaN, y: 20 }],
      }),
    ).toThrow(`spatial-placement response marker ${markerA} x must be finite and within 0..100`);
  });

  it("throws for a malformed spatial answer circle kind", () => {
    const target = spatialTarget();
    target.assessment.correctPlacements[0]!.geometry = {
      kind: "square",
      centerX: 20,
      centerY: 20,
      radius: 5,
    } as unknown as (typeof target.assessment.correctPlacements)[number]["geometry"];

    expect(() => gradeAssessment(target, { kind: "spatial-placement", placements: [] })).toThrow(
      `spatial-placement answer geometry must be a circle: ${markerA}`,
    );
  });

  it.each([
    { field: "centerX" as const, value: Number.NaN },
    { field: "centerY" as const, value: 101 },
  ])("throws for an invalid spatial answer $field coordinate", ({ field, value }) => {
    const target = spatialTarget();
    target.assessment.correctPlacements[0]!.geometry[field] = value;

    expect(() => gradeAssessment(target, { kind: "spatial-placement", placements: [] })).toThrow(
      `spatial-placement answer ${field} for marker ${markerA} must be finite and within 0..100`,
    );
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "throws for an invalid spatial answer radius %s",
    (radius) => {
      const target = spatialTarget();
      target.assessment.correctPlacements[0]!.geometry.radius = radius;

      expect(() => gradeAssessment(target, { kind: "spatial-placement", placements: [] })).toThrow(
        `spatial-placement answer radius must be finite and positive: ${markerA}`,
      );
    },
  );

  it("throws when spatial target and response kinds do not match", () => {
    expect(() =>
      gradeAssessment(spatialTarget(), { kind: "single-select", optionId: optionA }),
    ).toThrow(
      "gradeAssessment response kind mismatch: target is spatial-placement, response is single-select",
    );

    const mismatchedTarget = {
      ...spatialTarget(),
      interaction: {
        kind: "spatial-hotspot",
        hotspots: [],
        maxSelections: null,
      },
    } as unknown as AssessmentTargetContract;
    expect(() =>
      gradeAssessment(mismatchedTarget, { kind: "spatial-placement", placements: [] }),
    ).toThrow(
      "gradeAssessment target kind mismatch: assessment is spatial-placement, interaction is spatial-hotspot",
    );
  });

  it.each([null, undefined])("throws when the target is missing", (target) => {
    expect(() =>
      gradeAssessment(target as unknown as AssessmentTargetContract, {
        kind: "single-select",
        optionId: optionB,
      }),
    ).toThrow("gradeAssessment target is required");
  });

  it.each([null, undefined])("throws when the response is missing", (response) => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "single-select",
        options: [{ id: optionA }, { id: optionB }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: optionB,
        feedbackByOptionId: {},
      },
    };

    expect(() => gradeAssessment(target, response as unknown as AssessmentResponseValue)).toThrow(
      "gradeAssessment response is required",
    );
  });

  it("throws when the target interaction and assessment kinds are incompatible", () => {
    const target = {
      ...baseTarget,
      interaction: {
        kind: "multi-select",
        options: [{ id: optionA }, { id: optionB }],
        maxSelections: null,
      },
      assessment: {
        kind: "single-select",
        correctOptionId: optionB,
        feedbackByOptionId: {},
      },
    } as unknown as AssessmentTargetContract;

    expect(() => gradeAssessment(target, { kind: "single-select", optionId: optionB })).toThrow(
      "gradeAssessment target kind mismatch: assessment is single-select, interaction is multi-select",
    );
  });

  it("throws when the response kind is incompatible with the target", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "single-select",
        options: [{ id: optionA }, { id: optionB }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: optionB,
        feedbackByOptionId: {},
      },
    };

    expect(() => gradeAssessment(target, { kind: "multi-select", optionIds: [optionB] })).toThrow(
      "gradeAssessment response kind mismatch: target is single-select, response is multi-select",
    );
  });

  it("throws with the offending unknown assessment discriminator", () => {
    const target = {
      ...spatialTarget(),
      assessment: { kind: "unsupported-spatial-kind" },
    } as unknown as AssessmentTargetContract;

    expect(() => gradeAssessment(target, { kind: "spatial-placement", placements: [] })).toThrow(
      "gradeAssessment unsupported assessment kind: unsupported-spatial-kind",
    );
  });
});
