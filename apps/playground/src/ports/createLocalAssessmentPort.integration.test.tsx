// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@scaffold/core/format";
import { ScaffoldLearnerApp } from "@scaffold/core/runtime";

import { createLocalAssessmentPortFromProjection } from "./createLocalAssessmentPort";
import { LOCAL_ARTIFACT_ID } from "./local-artifact-id";
import { quizAssessmentProjection } from "./localAssessmentProjection.test-fixture";

class ResizeObserverStub implements ResizeObserver {
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Playground local assessment runtime composition", () => {
  it("runs an authored Quiz through the public scoped Core runtime", async () => {
    const user = userEvent.setup();
    const learnerContent = quizDocument();
    const assessmentProjection = quizAssessmentProjection({}, [
      { id: "mcq-1", correctOptionId: "a" },
    ]);

    render(
      <ScaffoldLearnerApp
        bootstrap={{
          artifactId: LOCAL_ARTIFACT_ID,
          title: "Local quiz",
          mode: "page",
          learnerContent,
        }}
        services={{
          assessment: createLocalAssessmentPortFromProjection(() => assessmentProjection),
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Start quiz" }));

    await waitFor(() => {
      const quiz = screen.getByTestId("quiz-stage-viewport").closest("[data-quiz-view-id]");
      expect(quiz?.getAttribute("data-quiz-status")).toBe("in_progress");
    });

    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    const submit = screen.getByRole("button", { name: "Submit quiz" });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await user.click(submit);

    expect(await screen.findByText("Quiz complete")).toBeInTheDocument();
    expect(screen.getByTestId("quiz-completion-summary").textContent).toContain("1 / 1");
  });
});

function quizDocument(): JSONContent {
  const document = createScaffoldDocumentContent({ mode: "page", surfaceId: "surface-quiz" });
  const surface = document.content?.[0]?.content?.[0];
  if (!surface) throw new Error("local quiz document is missing its surface");

  surface.content = [
    {
      type: "quiz",
      attrs: {
        id: "quiz-1",
        settings: {
          allowBacktracking: true,
          reviewTiming: "after_quiz",
          reviewDetail: "result_only",
          attemptsPerQuestion: 1,
          isGraded: true,
          timer: { enabled: false, durationSeconds: 0 },
        },
      },
      content: [mcqBlock()],
    },
  ];
  return document;
}

function mcqBlock(): JSONContent {
  return {
    type: "mcq",
    attrs: {
      id: "mcq-1",
      assessment: {
        correctOptionId: "a",
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        legend: "Choose one answer",
        points: 1,
        maxAttempts: null,
      },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "assessment_choices_group",
        content: [selectableChoice("a", "Alpha"), selectableChoice("b", "Beta")],
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    ],
  };
}
