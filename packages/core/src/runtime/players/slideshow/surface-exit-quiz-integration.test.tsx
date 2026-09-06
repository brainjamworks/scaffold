// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, QuizAttemptStateSchema } from "@scaffold/contracts";
import type { QuizAttemptState } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createCoreScaffoldRuntimeComposition,
  type ScaffoldRuntimeComposition,
} from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import type { AssessmentPort } from "@/host/ports";
import {
  assessmentProblemOutcome,
  assessmentQuizOutcome,
  createAssessmentRuntimeTestRoot,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";
import {
  checkRuntimeDocumentReadiness,
  type PreparedCourseDocumentRuntimeRendererProps,
} from "@/runtime/renderer/CourseDocumentRuntimeRenderer";

import { SlideshowPlayer, type SlideshowPlayerProps } from "./SlideshowPlayer";
import type { SlideshowSurfaceRuntimeProgramSource } from "./slideshow-surface-runtime-composition";
import type { SurfaceExitEnvironment } from "./surface-exit-environment";
import type { SurfaceExitEnvironmentAvailability } from "./SurfaceExitEnvironmentProvider";

const BEFORE_SURFACE_ID = "slide_000001";
const QUIZ_SURFACE_ID = "slide_000002";
const AFTER_SURFACE_ID = "slide_000003";
const QUIZ_ID = "quiz00000001";
const QUESTION_1_ID = "questn_00001";
const QUESTION_2_ID = "questn_00002";
const SCOPED_QUIZ_ID = `artifact:artifact-1/group:${QUIZ_ID}`;
const surfaceExitEnvironmentProbe = vi.hoisted(() => ({
  availability: null as unknown,
  guardEnabledAtRender: [] as boolean[],
}));

vi.mock("../../renderer/CourseDocumentRuntimeRenderer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../renderer/CourseDocumentRuntimeRenderer")>();
  const { createElement } = await import("react");
  const { useSurfaceExitEnvironmentAvailability } =
    await import("./SurfaceExitEnvironmentProvider");

  return {
    ...actual,
    PreparedCourseDocumentRuntimeRenderer(props: PreparedCourseDocumentRuntimeRendererProps) {
      const availability = useSurfaceExitEnvironmentAvailability();
      surfaceExitEnvironmentProbe.availability = availability;
      return createElement(actual.PreparedCourseDocumentRuntimeRenderer, props);
    },
  };
});

vi.mock("@/editor/assessment/quiz/use-quiz-surface-exit-guard", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/editor/assessment/quiz/use-quiz-surface-exit-guard")
    >();

  return {
    ...actual,
    useQuizSurfaceExitGuard(input: Parameters<typeof actual.useQuizSurfaceExitGuard>[0]): void {
      actual.useQuizSurfaceExitGuard(input);
      surfaceExitEnvironmentProbe.guardEnabledAtRender.push(input.enabled);
    },
  };
});

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
let restoreFullscreenHarness: (() => void) | null = null;

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
  surfaceExitEnvironmentProbe.availability = null;
  surfaceExitEnvironmentProbe.guardEnabledAtRender.length = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  restoreFullscreenHarness?.();
  restoreFullscreenHarness = null;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Quiz Surface exit integration", () => {
  it("allows Presentation play and advance before blocking the actual Surface departure", async () => {
    const user = userEvent.setup();
    const onActiveSurfaceChange = vi.fn();
    const surfaceRuntimeProgramSource: SlideshowSurfaceRuntimeProgramSource = (surfaceId) =>
      surfaceId === QUIZ_SURFACE_ID
        ? {
            presentation: {
              autoAdvance: false,
              timeline: {
                surfaceId: QUIZ_SURFACE_ID as SurfaceId,
                durationMs: 50,
                cues: [],
                waits: [
                  {
                    kind: "manual-wait",
                    id: "quiz-presentation-wait" as PresentationWaitId,
                    atMs: 50,
                  },
                ],
                visualProgram: {
                  surfaceId: QUIZ_SURFACE_ID as SurfaceId,
                  durationMs: 50,
                  targetById: new Map(),
                  segments: [],
                },
              },
            },
          }
        : undefined;

    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <TestSlideshowPlayer
            composition={runtimeComposition}
            initialContent={initiallyActiveQuizSlideshowDocument()}
            surfaceRuntimeProgramSource={surfaceRuntimeProgramSource}
            onActiveSurfaceChange={onActiveSurfaceChange}
          />
        ),
      }),
    );

    await waitFor(() => expect(surfaceExitEnvironment().getSnapshot().status).toBe("blocked"));
    const next = buttonByName("Next slide");

    // Presentation transport is separate from Surface navigation, so Next stays out of it
    // until the Presentation completes (see "separate presentation controls from navigation").
    expect(next).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: "Play presentation" }));

    const continueControl = await screen.findByRole("button", { name: "Continue presentation" });
    expect(continueControl).toBeEnabled();
    expect(next).toBeDisabled();
    await user.click(continueControl);

    // The Presentation ran to completion; only the Quiz guard now holds the Surface.
    await waitFor(() => expect(next).toHaveAttribute("aria-describedby"));
    expect(next).toBeDisabled();
    await user.click(next);

    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");
    expect(onActiveSurfaceChange).toHaveBeenLastCalledWith(QUIZ_SURFACE_ID);
  });

  it("arms an initially active Quiz guard during the first controller render", async () => {
    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <TestSlideshowPlayer
            composition={runtimeComposition}
            initialContent={initiallyActiveQuizSlideshowDocument()}
          />
        ),
      }),
    );

    await waitFor(() =>
      expect(surfaceExitEnvironmentProbe.guardEnabledAtRender).not.toHaveLength(0),
    );
    expect(surfaceExitEnvironmentProbe.guardEnabledAtRender[0]).toBe(true);
    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: QUIZ_SURFACE_ID,
      blockers: [
        {
          reason: "quiz-not-complete",
          ownerId: SCOPED_QUIZ_ID,
          surfaceId: QUIZ_SURFACE_ID,
          attemptStatus: "not_started",
        },
      ],
    });
    const next = buttonByName("Next slide");
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");
  });

  it("allows arrival at an unstarted Quiz then blocks every real departure control", async () => {
    const user = userEvent.setup();
    const onActiveSurfaceChange = vi.fn();

    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <TestSlideshowPlayer
            composition={runtimeComposition}
            initialContent={quizSlideshowDocument()}
            onActiveSurfaceChange={onActiveSurfaceChange}
          />
        ),
      }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: "Introduction, Course Section 1 of 2",
      }),
    );
    await user.click(
      screen.getByRole("menuitemradio", { name: "Practice, Course Section 2 of 2" }),
    );

    await waitFor(() =>
      expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true"),
    );
    expect(await screen.findByRole("button", { name: "Start quiz" })).toBeInTheDocument();
    expect(onActiveSurfaceChange).toHaveBeenLastCalledWith(QUIZ_SURFACE_ID);

    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: QUIZ_SURFACE_ID,
      blockers: [
        {
          reason: "quiz-not-complete",
          ownerId: SCOPED_QUIZ_ID,
          surfaceId: QUIZ_SURFACE_ID,
          attemptStatus: "not_started",
        },
      ],
    });

    const courseSection = buttonByName("Practice, Course Section 2 of 2");
    const previous = buttonByName("Previous slide");
    const next = buttonByName("Next slide");
    await waitFor(() => expect(next).toBeDisabled());
    expect(courseSection).toBeDisabled();
    expect(previous).toBeDisabled();

    const explanation = screen.getByText("Complete this quiz before moving to another slide.");
    expect(explanation).toHaveClass("sc-sr-only");
    for (const control of [courseSection, previous, next]) {
      expect(control).toHaveAttribute("aria-describedby", explanation.id);
      fireEvent.click(control);
    }

    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");
    expect(onActiveSurfaceChange).toHaveBeenLastCalledWith(QUIZ_SURFACE_ID);
  });

  it("keeps in-progress Surface locks independent from question movement and fullscreen", async () => {
    const user = userEvent.setup();
    const host = createQuizHost();
    const fullscreen = installFullscreenHarness();
    const onActiveSurfaceChange = vi.fn();

    render(
      createAssessmentRuntimeTestRoot({
        assessment: host.port,
        children: (
          <TestSlideshowPlayer
            composition={runtimeComposition}
            initialContent={quizSlideshowDocument()}
            onActiveSurfaceChange={onActiveSurfaceChange}
          />
        ),
      }),
    );
    await arriveAtQuiz(user);

    await user.click(await screen.findByRole("button", { name: "Start quiz" }));
    await waitFor(() => expect(quizShell()).toHaveAttribute("data-quiz-status", "in_progress"));
    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: QUIZ_SURFACE_ID,
      blockers: [
        {
          reason: "quiz-not-complete",
          ownerId: SCOPED_QUIZ_ID,
          surfaceId: QUIZ_SURFACE_ID,
          attemptStatus: "in_progress",
        },
      ],
    });
    const surfaceControls = [
      buttonByName("Practice, Course Section 2 of 2"),
      buttonByName("Previous slide"),
      buttonByName("Next slide"),
    ];
    for (const control of surfaceControls) {
      expect(control).toBeDisabled();
      fireEvent.click(control);
    }
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");

    const activeSurfaceCallCount = onActiveSurfaceChange.mock.calls.length;
    const nextQuestion = await screen.findByRole("button", { name: "Next question" });
    expect(nextQuestion).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Answer one A" }));
    await waitFor(() => expect(nextQuestion).not.toBeDisabled());
    await user.click(nextQuestion);
    expect(quizShell()).toHaveAttribute("data-active-question-id", QUESTION_2_ID);

    await user.click(screen.getByRole("button", { name: "Previous question" }));
    expect(quizShell()).toHaveAttribute("data-active-question-id", QUESTION_1_ID);
    expect(onActiveSurfaceChange).toHaveBeenCalledTimes(activeSurfaceCallCount);
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    expect(fullscreen.requestFullscreen).toHaveBeenCalledOnce();
    await user.click(await screen.findByRole("button", { name: "Exit fullscreen" }));
    expect(fullscreen.exitFullscreen).toHaveBeenCalledOnce();
    expect(onActiveSurfaceChange).toHaveBeenCalledTimes(activeSurfaceCallCount);
    expect(surfaceExitEnvironment().getSnapshot()).toMatchObject({
      status: "blocked",
      blockers: [{ attemptStatus: "in_progress" }],
    });
  });

  it("reactively unlocks after completion without advancing until the learner asks", async () => {
    const user = userEvent.setup();
    const host = createQuizHost();
    const onActiveSurfaceChange = vi.fn();

    render(
      createAssessmentRuntimeTestRoot({
        assessment: host.port,
        children: (
          <TestSlideshowPlayer
            composition={runtimeComposition}
            initialContent={quizSlideshowDocument()}
            onActiveSurfaceChange={onActiveSurfaceChange}
          />
        ),
      }),
    );
    await arriveAtQuiz(user);
    await user.click(await screen.findByRole("button", { name: "Start quiz" }));
    await waitFor(() => expect(quizShell()).toHaveAttribute("data-quiz-status", "in_progress"));

    await user.click(screen.getByRole("radio", { name: "Answer one A" }));
    const nextQuestion = screen.getByRole("button", { name: "Next question" });
    await waitFor(() => expect(nextQuestion).not.toBeDisabled());
    await user.click(nextQuestion);
    await user.click(screen.getByRole("radio", { name: "Answer two A" }));
    const submitQuiz = await screen.findByRole("button", { name: "Submit quiz" });
    await waitFor(() => expect(submitQuiz).not.toBeDisabled());
    const activeSurfaceCallCount = onActiveSurfaceChange.mock.calls.length;

    await user.click(submitQuiz);

    await waitFor(() => expect(quizShell()).toHaveAttribute("data-quiz-status", "completed"));
    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: QUIZ_SURFACE_ID,
      blockers: [],
    });
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");
    expect(onActiveSurfaceChange).toHaveBeenCalledTimes(activeSurfaceCallCount);
    await waitFor(() => expect(buttonByName("Next slide")).not.toBeDisabled());
    expect(buttonByName("Previous slide")).not.toBeDisabled();
    expect(buttonByName("Practice, Course Section 2 of 2")).not.toBeDisabled();

    await user.click(buttonByName("Next slide"));
    await waitFor(() =>
      expect(surfaceById(AFTER_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true"),
    );
    expect(onActiveSurfaceChange).toHaveBeenLastCalledWith(AFTER_SURFACE_ID);
  });

  it("reactively unlocks on expiry and relocks for a new in-progress attempt", async () => {
    const user = userEvent.setup();
    const host = createQuizHost();
    let assessmentStore: AssessmentStoreApi | null = null;

    render(
      createAssessmentRuntimeTestRoot({
        assessment: host.port,
        onStore: (store) => {
          assessmentStore = store;
        },
        children: (
          <TestSlideshowPlayer
            composition={runtimeComposition}
            initialContent={quizSlideshowDocument()}
          />
        ),
      }),
    );
    await arriveAtQuiz(user);
    await user.click(await screen.findByRole("button", { name: "Start quiz" }));
    await waitFor(() => expect(quizShell()).toHaveAttribute("data-quiz-status", "in_progress"));
    await waitFor(() => expect(assessmentStore).not.toBeNull());
    const store = requireAssessmentStore(assessmentStore);

    host.setFinishStatus("expired");
    await act(async () => {
      await store.getState().expireQuizAttempt({ groupId: QUIZ_ID });
    });

    await waitFor(() => expect(quizShell()).toHaveAttribute("data-quiz-status", "expired"));
    expect(surfaceExitEnvironment().getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: QUIZ_SURFACE_ID,
      blockers: [],
    });
    expect(buttonByName("Next slide")).not.toBeDisabled();
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");

    await act(async () => {
      await store.getState().startQuizAttempt({ groupId: QUIZ_ID });
    });

    await waitFor(() =>
      expect(surfaceExitEnvironment().getSnapshot()).toMatchObject({
        status: "blocked",
        blockers: [{ attemptStatus: "in_progress", ownerId: SCOPED_QUIZ_ID }],
      }),
    );
    expect(quizShell()).toHaveAttribute("data-quiz-status", "in_progress");
    expect(buttonByName("Previous slide")).toBeDisabled();
    expect(buttonByName("Next slide")).toBeDisabled();
    expect(buttonByName("Practice, Course Section 2 of 2")).toBeDisabled();
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true");
  });
});

function createQuizHost() {
  let attemptNumber = 0;
  let finishStatus: "completed" | "expired" = "completed";
  const port: AssessmentPort = {
    type: "runtime",
    submit: vi.fn(async () =>
      assessmentProblemOutcome({
        feedback: null,
        isCorrect: true,
        items: {},
        score: { scaled: 1 },
      }),
    ),
    quiz: {
      startAttempt: vi.fn(async ({ groupId }) => {
        attemptNumber += 1;
        return assessmentQuizOutcome(
          quizAttempt({
            attemptId: `attempt-${attemptNumber}`,
            groupId,
            status: "in_progress",
            currentTargetId: QUESTION_1_ID,
          }),
        );
      }),
      submitQuestion: vi.fn(async ({ attemptId, groupId, targetId }) =>
        assessmentQuizOutcome(
          quizAttempt({ attemptId, groupId, status: "in_progress", currentTargetId: targetId }),
        ),
      ),
      finishAttempt: vi.fn(async ({ attemptId, groupId }) =>
        assessmentQuizOutcome(
          quizAttempt({
            attemptId,
            groupId,
            status: finishStatus,
            currentTargetId: null,
            submittedTargetIds: [QUESTION_1_ID, QUESTION_2_ID],
          }),
        ),
      ),
    },
  };

  return {
    port,
    setFinishStatus(status: "completed" | "expired") {
      finishStatus = status;
    },
  };
}

function quizAttempt({
  attemptId,
  currentTargetId,
  groupId,
  status,
  submittedTargetIds = [],
}: {
  attemptId: string;
  currentTargetId: string | null;
  groupId: string;
  status: QuizAttemptState["status"];
  submittedTargetIds?: string[];
}): QuizAttemptState {
  const terminal = status !== "in_progress";
  return QuizAttemptStateSchema.parse({
    attemptId,
    groupId,
    status,
    currentTargetId,
    submittedTargetIds,
    startedAt: "2026-08-29T12:00:00.000Z",
    finishedAt: terminal ? "2026-08-29T12:05:00.000Z" : null,
    expiresAt: null,
    score: terminal ? { scaled: 1 } : null,
    successStatus: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
  });
}

async function arriveAtQuiz(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(
    await screen.findByRole("button", {
      name: "Introduction, Course Section 1 of 2",
    }),
  );
  await user.click(screen.getByRole("menuitemradio", { name: "Practice, Course Section 2 of 2" }));
  await waitFor(() =>
    expect(surfaceById(QUIZ_SURFACE_ID)).toHaveAttribute("data-runtime-surface-visible", "true"),
  );
}

function quizShell(): HTMLElement {
  const shell = screen.getByTestId("quiz-stage-viewport").closest("[data-quiz-view-id]");
  if (!(shell instanceof HTMLElement)) throw new Error("Quiz runtime shell was not rendered.");
  return shell;
}

function installFullscreenHarness() {
  const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenEnabled",
  );
  const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenElement",
  );
  const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
  const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "requestFullscreen",
  );
  let fullscreenElement: Element | null = null;
  const enterFullscreen = (element: Element) => {
    fullscreenElement = element;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  const requestFullscreen = vi.fn(async function requestFullscreen(this: HTMLElement) {
    enterFullscreen(this);
  });
  const exitFullscreen = vi.fn(async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });

  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: { configurable: true, value: exitFullscreen },
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
  restoreFullscreenHarness = () => {
    restoreProperty(document, "fullscreenEnabled", fullscreenEnabledDescriptor);
    restoreProperty(document, "fullscreenElement", fullscreenElementDescriptor);
    restoreProperty(document, "exitFullscreen", exitFullscreenDescriptor);
    restoreProperty(HTMLElement.prototype, "requestFullscreen", requestFullscreenDescriptor);
  };
  return { exitFullscreen, requestFullscreen };
}

function restoreProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}

function TestSlideshowPlayer(
  props: Omit<SlideshowPlayerProps, "preparedDocument" | "structure"> & {
    readonly composition: ScaffoldRuntimeComposition;
    readonly initialContent: JSONContent;
    readonly productAccess?: ScaffoldProductAccess;
  },
) {
  const { composition, initialContent, productAccess = coreProductAccess, ...playerProps } = props;
  normalizeRuntimeFixtureIds(initialContent);
  const readiness = checkRuntimeDocumentReadiness(initialContent, composition, productAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected a prepared Slideshow fixture, received ${readiness.status}.`);
  }
  const structure = projectCourseStructure(readiness.preparedDocument.content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow fixture.");
  }
  return (
    <SlideshowPlayer
      {...playerProps}
      artifactId="artifact-1"
      preparedDocument={readiness.preparedDocument}
      structure={structure}
    />
  );
}

function quizSlideshowDocument(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Introduction",
    surfaceId: BEFORE_SURFACE_ID,
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Quiz Slideshow fixture is missing its course document.");
  courseDocument.attrs = { ...courseDocument.attrs, mode: "slideshow" };
  courseDocument.content = [
    { type: "courseSection", attrs: { id: "section00001", title: "Introduction" } },
    slide(BEFORE_SURFACE_ID, [paragraph("Before the quiz")]),
    { type: "courseSection", attrs: { id: "section00002", title: "Practice" } },
    slide(QUIZ_SURFACE_ID, [quizNode()]),
    slide(AFTER_SURFACE_ID, [paragraph("After the quiz")]),
  ];
  return content;
}

function initiallyActiveQuizSlideshowDocument(): JSONContent {
  const content = quizSlideshowDocument();
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Quiz Slideshow fixture is missing its course document.");
  courseDocument.content = [
    { type: "courseSection", attrs: { id: "section00002", title: "Practice" } },
    slide(QUIZ_SURFACE_ID, [quizNode()]),
    slide(AFTER_SURFACE_ID, [paragraph("After the quiz")]),
    { type: "courseSection", attrs: { id: "section00001", title: "Introduction" } },
    slide(BEFORE_SURFACE_ID, [paragraph("Before the quiz")]),
  ];
  return content;
}

function slide(id: string, content: JSONContent[]): JSONContent {
  return { type: "surface", attrs: { id, variant: "slide-cover" }, content };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function quizNode(): JSONContent {
  return {
    type: "quiz",
    attrs: {
      id: QUIZ_ID,
      settings: {
        allowBacktracking: true,
        reviewTiming: "after_quiz",
        reviewDetail: "result_only",
        attemptsPerQuestion: 1,
        isGraded: true,
        passingScore: null,
        timer: { enabled: false, durationSeconds: 0 },
      },
    },
    content: [mcqQuestion(QUESTION_1_ID, "one"), mcqQuestion(QUESTION_2_ID, "two")],
  };
}

function mcqQuestion(id: string, ordinal: string): JSONContent {
  return {
    type: "mcq",
    attrs: {
      id,
      assessment: {
        correctOptionId: `choice_${ordinal}01`,
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
        legend: `Question ${ordinal}`,
      },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      {
        type: "assessment_prompt",
        content: [paragraph(`Question ${ordinal}`)],
      },
      {
        type: "assessment_choices_group",
        content: [
          selectableChoice(`choice_${ordinal}01`, `Answer ${ordinal} A`),
          selectableChoice(`choice_${ordinal}02`, `Answer ${ordinal} B`),
        ],
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
        content: [paragraph(text)],
      },
    ],
  };
}

function normalizeRuntimeFixtureIds(content: JSONContent): void {
  const seen = new Set<string>();
  const stack = [content];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      const id = node.attrs?.id;
      if (!EmbeddedNodeIdSchema.safeParse(id).success || seen.has(String(id))) {
        node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
      }
      seen.add(String(node.attrs?.id));
    }
    stack.push(...(node.content ?? []));
  }
}

function surfaceExitEnvironment(): SurfaceExitEnvironment {
  const availability =
    surfaceExitEnvironmentProbe.availability as SurfaceExitEnvironmentAvailability;
  if (availability.status !== "available") {
    throw new Error("Slideshow renderer did not receive the Surface Exit Environment.");
  }
  return availability.environment;
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Assessment runtime store was not mounted.");
  return store;
}

function surfaceById(surfaceId: string): HTMLElement {
  const surface = document.body.querySelector(`[data-node="surface"][data-id="${surfaceId}"]`);
  if (!(surface instanceof HTMLElement)) throw new Error(`Surface ${surfaceId} was not rendered.`);
  return surface;
}

function buttonByName(name: string): HTMLButtonElement {
  const button = screen.getByRole("button", { name });
  if (!(button instanceof HTMLButtonElement)) throw new Error(`${name} is not a button.`);
  return button;
}
