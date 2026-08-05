import { describe, expect, it } from "vite-plus/test";

import type { ProblemScope } from "./use-assessment-runtime";
import {
  choiceStateForProblem,
  resolveMultiSelectChoiceChange,
} from "./assessment-interaction-runtime";

describe("choiceStateForProblem", () => {
  it("marks selected multiselect choices correct when the submitted overall result is correct", () => {
    const problem = {
      answerKeyVisible: false,
      feedbackResult: null,
      officialResult: { isCorrect: true, score: 1, maxScore: 1, feedback: null, items: {} },
      state: { submitted: true, revealedAnswer: null },
    } as ProblemScope;

    expect(
      choiceStateForProblem({
        choiceId: "a",
        kind: "multi-select",
        problem,
        selected: new Set(["a", "b"]),
      }),
    ).toBe("correct");
  });
});

describe("resolveMultiSelectChoiceChange", () => {
  it("refuses an N+1 selection without producing an unchanged response", () => {
    expect(
      resolveMultiSelectChoiceChange({
        choiceId: "c",
        currentOptionIds: ["a", "b", "c"],
        maxSelections: 2,
        selectedIds: ["a", "b"],
      }),
    ).toEqual({ changed: false, choices: null });
  });

  it("keeps over-limit current selections repairable and prunes stale ids on a real change", () => {
    expect(
      resolveMultiSelectChoiceChange({
        choiceId: "b",
        currentOptionIds: ["a", "b", "c"],
        maxSelections: 1,
        selectedIds: ["a", "b", "deleted-choice"],
      }),
    ).toEqual({ changed: true, choices: ["a"] });
  });
});
