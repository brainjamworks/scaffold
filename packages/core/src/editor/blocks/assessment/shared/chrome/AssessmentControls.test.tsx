// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import type { ProblemScope } from "../runtime/use-assessment-runtime";
import {
  AuthoringAssessmentControls,
  RuntimeAssessmentControls,
} from "./AssessmentControls";

describe("assessment action adapter", () => {
  it("suppresses the authoring submit preview for immediate feedback", () => {
    const { container } = render(
      <AuthoringAssessmentControls feedbackMode="immediate" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a non-interactive announced Correct terminal state", () => {
    render(
      <RuntimeAssessmentControls
        problem={problemScope({ submitted: true, isCorrect: true })}
        maxAttempts={1}
      />,
    );

    const status = screen.getByRole("status", { name: "Correct" });
    expect(status.getAttribute("data-assessment-submission-status")).toBe("correct");
    expect(status).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a non-interactive Submitted terminal state after the final attempt", () => {
    render(
      <RuntimeAssessmentControls
        problem={problemScope({ submitted: true, exhausted: true, isCorrect: false })}
        maxAttempts={1}
      />,
    );

    const status = screen.getByRole("status", { name: "Submitted" });
    expect(status.getAttribute("data-assessment-submission-status")).toBe("submitted");
    expect(status).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

function problemScope({
  feedbackMode = "on_submit",
  submitted,
  exhausted = false,
  isCorrect,
}: {
  feedbackMode?: "immediate" | "on_submit";
  submitted: boolean;
  exhausted?: boolean;
  isCorrect: boolean;
}): ProblemScope {
  return {
    state: {
      feedbackMode,
      submitted,
      attemptNumber: submitted ? 1 : 0,
    },
    exhausted,
    canRetry: submitted && !exhausted && !isCorrect,
    hasResponse: true,
    officialResult: submitted
      ? {
          isCorrect,
          score: isCorrect ? 1 : 0,
          maxScore: 1,
          feedback: null,
          items: {},
        }
      : null,
    feedbackResult: null,
    submit: () => Promise.resolve(null),
    reset: () => {},
  } as unknown as ProblemScope;
}
