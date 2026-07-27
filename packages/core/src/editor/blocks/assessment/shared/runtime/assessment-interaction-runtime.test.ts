import { describe, expect, it } from "vite-plus/test";

import type { ProblemScope } from "./use-assessment-runtime";
import { choiceStateForProblem } from "./assessment-interaction-runtime";

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
