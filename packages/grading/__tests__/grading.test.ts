import { describe, expect, it } from "vite-plus/test";

import {
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
  schemaVersion: 1,
  targetId: "target-1",
  blockId: "target-1",
  blockType: "test",
  settings: {
    feedbackMode: "on_submit",
    isGraded: true,
    showAnswer: true,
    points: 1,
    maxAttempts: null,
  },
} satisfies Omit<AssessmentTargetContract, "interaction" | "assessment">;

describe("@scaffold/grading primitive targets", () => {
  it("grades single-select targets", () => {
    const optionFeedback = richText("That is the correct option.");
    const summaryFeedback = richText("Review the worked answer.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "single-select",
        options: [{ id: "a" }, { id: "b" }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "b",
        feedbackByOptionId: { b: optionFeedback },
        summaryFeedback,
      },
    };

    const result = gradeAssessment(target, { kind: "single-select", optionId: "b" });

    expect(result).toEqual({
      score: 1,
      maxScore: 1,
      isCorrect: true,
      feedback: summaryFeedback,
      items: {
        a: { correct: false, expected: false, given: false },
        b: { correct: true, expected: true, given: true, feedback: optionFeedback },
      },
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("grades multi-select targets with wrong-pick penalty", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "multi-select",
        options: [{ id: "a" }, { id: "b" }, { id: "c" }],
        maxSelections: null,
      },
      assessment: {
        kind: "multi-select",
        correctOptionIds: ["a", "b"],
        feedbackByOptionId: {},
      },
    };

    const result = gradeAssessment(target, {
      kind: "multi-select",
      optionIds: ["a", "c"],
    });

    expect(result.score).toBeCloseTo(0, 6);
    expect(result.isCorrect).toBe(false);
  });

  it("grades sequence targets with positional partial credit", () => {
    const itemFeedback = richText("Check the middle position.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "sequence",
        items: [{ id: "a" }, { id: "b" }, { id: "c" }],
      },
      assessment: {
        kind: "sequence",
        correctOrder: ["a", "b", "c"],
        feedbackByItemId: { b: itemFeedback },
      },
    };

    const result = gradeAssessment(target, {
      kind: "sequence",
      orderedItemIds: ["a", "c", "b"],
    });

    expect(result.score).toBeCloseTo(1 / 3, 6);
    expect(result.isCorrect).toBe(false);
    expect(result.items["b"]).toMatchObject({
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
        items: [{ id: "fr" }, { id: "es" }],
        targets: [{ id: "paris" }, { id: "madrid" }],
      },
      assessment: {
        kind: "match",
        correctPairs: [
          { itemId: "fr", targetId: "paris" },
          { itemId: "es", targetId: "madrid" },
        ],
        feedbackByItemId: { es: itemFeedback },
      },
    };

    const result = gradeAssessment(target, {
      kind: "match",
      pairs: [
        { itemId: "fr", targetId: "paris" },
        { itemId: "es", targetId: "paris" },
      ],
    });

    expect(result.score).toBe(0.5);
    expect(result.isCorrect).toBe(false);
    expect(result.items["es"]).toMatchObject({
      correct: false,
      expected: "madrid",
      given: "paris",
      feedback: itemFeedback,
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("grades fill-blanks targets with answer normalization", () => {
    const blankFeedback = richText("Review the river name.");
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "fill-blanks",
        blanks: [{ id: "b1" }, { id: "b2" }],
      },
      assessment: {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: "b1",
            acceptedAnswers: ["Paris"],
            caseSensitive: false,
            trimWhitespace: true,
          },
          {
            blankId: "b2",
            acceptedAnswers: ["Seine"],
            caseSensitive: false,
            trimWhitespace: true,
          },
        ],
        feedbackByBlankId: { b2: blankFeedback },
      },
    };

    const result = gradeAssessment(target, {
      kind: "fill-blanks",
      blanks: [
        { blankId: "b1", value: " paris " },
        { blankId: "b2", value: "Loire" },
      ],
    });

    expect(result).toMatchObject({
      score: 0.5,
      isCorrect: false,
      items: {
        b1: { correct: true, expected: ["Paris"], given: " paris " },
        b2: {
          correct: false,
          expected: ["Seine"],
          given: "Loire",
          feedback: blankFeedback,
        },
      },
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });

  it("grades spatial-hotspot targets", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "spatial-hotspot",
        hotspots: [
          {
            id: "h1",
            geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 10 },
          },
          {
            id: "h2",
            geometry: { kind: "circle", centerX: 20, centerY: 20, radius: 10 },
          },
        ],
        maxSelections: null,
      },
      assessment: {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: ["h1"],
        feedbackByHotspotId: {},
      },
    };

    expect(
      gradeAssessment(target, {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: "h1", x: 50, y: 50 }],
      }),
    ).toMatchObject({ score: 1, isCorrect: true });
  });

  it("returns a complete canonical zero result for a mismatched response", () => {
    const target: AssessmentTargetContract = {
      ...baseTarget,
      interaction: {
        kind: "single-select",
        options: [{ id: "a" }, { id: "b" }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "b",
        feedbackByOptionId: {},
      },
    };

    const result = gradeAssessment(target, { kind: "multi-select", optionIds: ["b"] });

    expect(result).toEqual({
      score: 0,
      maxScore: 1,
      isCorrect: false,
      feedback: null,
      items: {},
    });
    expect(AssessmentResultSchema.parse(result)).toEqual(result);
  });
});
