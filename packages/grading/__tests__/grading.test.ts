import { describe, expect, it } from "vite-plus/test";

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  AssessmentResultSchema,
  type AssessmentFeedbackContent,
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

  it("returns a complete canonical zero result for a mismatched response", () => {
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

    const result = gradeAssessment(target, { kind: "multi-select", optionIds: [optionB] });

    expect(result).toEqual({
      score: { scaled: 0 },
      isCorrect: false,
      feedback: null,
      items: {},
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });
});
