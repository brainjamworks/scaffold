import { describe, expect, it } from "vite-plus/test";

import {
  assessmentResultStatusText,
  attemptCounterAccessibilityLabel,
  missingResponseDescriptionForInteraction,
} from "./action-accessibility";

describe("assessment action accessibility descriptions", () => {
  it("describes missing responses for choice interactions", () => {
    expect(missingResponseDescriptionForInteraction("single-select")).toBe(
      "Choose an answer before submitting.",
    );
    expect(missingResponseDescriptionForInteraction("multi-select")).toBe(
      "Choose at least one answer before submitting.",
    );
  });

  it("uses a generic missing response description for non-choice interactions", () => {
    expect(missingResponseDescriptionForInteraction("fill-blanks")).toBe(
      "Complete the response before submitting.",
    );
  });

  it("describes attempt counters with complete accessible labels", () => {
    expect(attemptCounterAccessibilityLabel({ attempts: 1, maxAttempts: null })).toBe(
      "Attempt 1 used.",
    );
    expect(attemptCounterAccessibilityLabel({ attempts: 1, maxAttempts: 3 })).toBe(
      "1 of 3 attempts used.",
    );
    expect(attemptCounterAccessibilityLabel({ attempts: 3, maxAttempts: 3 })).toBe(
      "Final attempt used.",
    );
  });

  it("describes submitted result status when correctness is available", () => {
    expect(assessmentResultStatusText(true)).toBe("Answer submitted. Correct.");
    expect(assessmentResultStatusText(false)).toBe("Answer submitted. Incorrect.");
    expect(assessmentResultStatusText(null)).toBeNull();
    expect(assessmentResultStatusText(undefined)).toBeNull();
  });
});
