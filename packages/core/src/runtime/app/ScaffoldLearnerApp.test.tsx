// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";

import { ScaffoldLearnerApp } from "./ScaffoldLearnerApp";

class ResizeObserverStub implements ResizeObserver {
  readonly observe = vi.fn((target: Element) => {
    if (!target.matches(".sc-slideshow-player__viewport, .sc-slideshow-player__stage")) return;
    this.callback(
      [{ target, contentRect: { width: 1024, height: 576 } } as ResizeObserverEntry],
      this,
    );
  });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function learnerDocumentWithText(text: string): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-learner",
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("learner app test document is missing its first surface");
  }

  surface.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ];

  return content;
}

function learnerDocumentWithMcq(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-mcq",
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("learner app test document is missing its first surface");
  }

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-runtime-only",
        assessment: {
          correctOptionId: "choice-b",
          feedbackByOptionId: {},
          summaryFeedback: null,
        },
        settings: {
          feedbackMode: "on_submit",
          isGraded: true,
          showAnswer: true,
          legend: "Choose a letter",
          points: 1,
          maxAttempts: null,
        },
      },
      content: [
        { type: "assessment_title", content: [{ type: "paragraph" }] },
        { type: "assessment_instructions", content: [{ type: "paragraph" }] },
        {
          type: "assessment_prompt",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Which letter comes second?" }],
            },
          ],
        },
        {
          type: "assessment_choices_group",
          content: [selectableChoice("choice-a", "A"), selectableChoice("choice-b", "B")],
        },
        {
          type: "assessment_actions_group",
          content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
        },
      ],
    },
  ];

  return content;
}

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}

function learnerDocumentForMode(mode: "slideshow" | "branching"): JSONContent {
  return createScaffoldDocumentContent({
    mode,
    surfaceId: `${mode}-surface`,
  });
}

function learnerBootstrap(
  overrides: Partial<ScaffoldLearnerBootstrap> = {},
): ScaffoldLearnerBootstrap {
  return {
    artifactId: "artifact-learner",
    title: "Learner artifact",
    mode: "page",
    learnerContent: learnerDocumentWithText("Projected learner content"),
    ...overrides,
  };
}

describe("ScaffoldLearnerApp", () => {
  it("renders projected learner content from learner bootstrap", async () => {
    render(<ScaffoldLearnerApp bootstrap={learnerBootstrap()} services={{}} />);

    expect(await screen.findByText("Projected learner content")).toBeInTheDocument();
    expect(screen.getByTestId("scaffold-runtime-host")).toBeInTheDocument();
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();

    const editableSurface = document.body.querySelector(".ProseMirror");
    expect(editableSurface?.getAttribute("contenteditable")).toBe("false");
  });

  it("renders slideshow learner content through the slideshow player", async () => {
    render(
      <ScaffoldLearnerApp
        bootstrap={learnerBootstrap({
          mode: "slideshow",
          learnerContent: learnerDocumentForMode("slideshow"),
        })}
        services={{}}
      />,
    );

    expect(
      (await screen.findByTestId("slideshow-player")).getAttribute("data-slideshow-sizing"),
    ).toBe("embedded");
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-runtime-unavailable")).toBeNull();
  });

  it("allows a two-axis host to request contained slideshow fitting", async () => {
    render(
      <ScaffoldLearnerApp
        bootstrap={learnerBootstrap({
          mode: "slideshow",
          learnerContent: learnerDocumentForMode("slideshow"),
        })}
        services={{}}
        slideshowSizing="contained"
      />,
    );

    expect(
      (await screen.findByTestId("slideshow-player")).getAttribute("data-slideshow-sizing"),
    ).toBe("contained");
  });

  it("renders an MCQ through runtime-only block registration", async () => {
    render(
      <ScaffoldLearnerApp
        bootstrap={learnerBootstrap({
          learnerContent: learnerDocumentWithMcq(),
        })}
        services={{}}
      />,
    );

    expect(await screen.findByText("Which letter comes second?")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
  });

  it("passes learner host services through the runtime provider", async () => {
    const load = vi.fn(async () => null);
    const services = {
      learnerActivity: {
        load,
        save: vi.fn(async ({ record }) => ({
          ...record,
          updatedAt: "2026-07-17T08:00:00Z",
        })),
      },
    } satisfies ScaffoldLearnerHostServices;

    render(
      <ScaffoldLearnerApp
        bootstrap={learnerBootstrap({ artifactId: "artifact-services" })}
        services={services}
      />,
    );

    await waitFor(() =>
      expect(load).toHaveBeenCalledWith({
        artifactId: "artifact-services",
      }),
    );
  });

  it("accepts a strict assessment snapshot while keeping activity state separate", async () => {
    render(
      <ScaffoldLearnerApp
        bootstrap={learnerBootstrap({
          initialLearnerState: {
            assessmentSnapshot: {
              snapshotVersion: 1,
              artifactId: "artifact-learner",
              problems: {
                "target-mcq-1": {
                  response: { kind: "single-select", optionId: "choice-1" },
                  submitted: true,
                  attemptNumber: 1,
                  hintsShown: 0,
                  checkResult: null,
                  submissionResult: {
                    isCorrect: true,
                    score: 1,
                    maxScore: 1,
                    feedback: null,
                    items: {},
                  },
                },
              },
              quizzes: {},
            },
            learnerActivitySnapshot: {
              snapshotVersion: 1,
              artifactId: "artifact-learner",
              activities: {
                "flashcard-1": {
                  activityKind: "flashcard",
                  data: { currentCard: 2 },
                  completed: false,
                  updatedAt: null,
                },
              },
            },
          },
        })}
        services={{}}
      />,
    );

    await screen.findByText("Projected learner content");
    expect(screen.getByTestId("page-player")).toBeInTheDocument();
  });

  it("passes unknown assessment input through the strict snapshot parser", () => {
    const bootstrap = learnerBootstrap();
    Object.defineProperty(bootstrap, "initialLearnerState", {
      value: {
        assessmentSnapshot: {
          snapshotVersion: 2,
          artifactId: "artifact-learner",
          problems: {},
          quizzes: {},
        },
      },
    });

    expect(() => render(<ScaffoldLearnerApp bootstrap={bootstrap} services={{}} />)).toThrow();
  });
});
