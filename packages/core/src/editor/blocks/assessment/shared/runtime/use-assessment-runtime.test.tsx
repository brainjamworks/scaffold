// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Component, type ReactNode, useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import type {
  AssessmentInteractionKind,
  AssessmentProblemSnapshot,
  QuizAssessmentSettings,
  QuizAttemptState,
} from "@scaffold/contracts";
import type {
  AssessmentCheckRequest,
  AssessmentPort,
  AssessmentRevealRequest,
  AssessmentSubmitRequest,
} from "@/host/ports";

import { AssessmentChoicesGroupNode } from "../nodes/assessment-choices-group";
import { AssessmentActionsGroupNode } from "../nodes/assessment-actions-group";
import { AssessmentHintNode } from "../nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "../nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "../nodes/assessment-instructions";
import { AssessmentPromptNode } from "../nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "../nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "../nodes/assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SelectableChoiceBodyNode, SelectableChoiceNode } from "../nodes/selectable-choice";
import {
  useAssessmentRuntime,
  useAssessmentRuntimeById,
  type AssessmentRuntimeController,
} from "./use-assessment-runtime";
import { imageHotspotBlockDefinition } from "@/editor/blocks/assessment/image-hotspot/image-hotspot-definition";
import { mcqBlockDefinition } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { McqNode } from "@/editor/blocks/assessment/mcq/node";
import { mcqResponseCodec } from "@/editor/blocks/assessment/mcq/assessment";
import { imageHotspotResponseCodec } from "@/editor/blocks/assessment/image-hotspot/assessment";
import {
  AssessmentRuntimeProvider,
  useAssessmentStoreApi,
} from "@/runtime/assessment/AssessmentRuntimeProvider";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import {
  scopeAssessmentGroupId,
  scopeAssessmentProblemId,
} from "@/runtime/assessment/assessment-store";
import {
  useAssessmentProblemFacade,
  useAssessmentQuizFacade,
} from "@/runtime/assessment/runtime-facade";
import { assessmentProblemOutcome } from "@/runtime/assessment/test-utils";
import { pageAssessmentExperience } from "../model/assessment-capability";

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

const editors: Editor[] = [];
let scopedAssessmentStore: AssessmentStoreApi | null = null;

function ScopedStoreCapture() {
  scopedAssessmentStore = useAssessmentStoreApi();
  return null;
}

function ScopedProblemRegistration({
  interactionKind = "single-select",
  problemId,
  targetId = problemId,
  feedbackMode = "on_submit",
  hintsTotal = 0,
  showAnswer = true,
}: {
  interactionKind?: AssessmentInteractionKind;
  problemId: string;
  targetId?: string;
  feedbackMode?: "immediate" | "on_submit";
  hintsTotal?: number;
  showAnswer?: boolean;
}) {
  const response =
    interactionKind === "spatial-hotspot" ? imageHotspotResponseCodec : mcqResponseCodec;
  const registration = useMemo(
    () => ({
      problemId,
      targetId,
      interactionKind,
      response,
      config: {
        experience: pageAssessmentExperience,
        settings: {
          feedbackMode,
          isGraded: true,
          showAnswer,
          points: 1,
          maxAttempts: null,
        },
        hintsTotal,
      },
    }),
    [feedbackMode, hintsTotal, interactionKind, problemId, response, showAnswer, targetId],
  );
  useAssessmentProblemFacade(registration);
  return null;
}

function ScopedQuizRegistration({
  reviewDetail,
}: {
  reviewDetail: QuizAssessmentSettings["reviewDetail"];
}) {
  const registration = useMemo(
    () => ({
      groupId: "quiz-1",
      targetIds: ["target-1"],
      settings: {
        allowBacktracking: true,
        reviewTiming: "after_quiz" as const,
        reviewDetail,
        attemptsPerQuestion: 1 as const,
        isGraded: true,
        timer: { enabled: false, durationSeconds: 0 },
      },
    }),
    [reviewDetail],
  );
  useAssessmentQuizFacade(registration);
  return null;
}

const MismatchMcqNode = Node.create({
  name: "mcq",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: "div[data-mismatch-mcq]" }];
  },
  renderHTML() {
    return ["div", { "data-mismatch-mcq": "" }];
  },
});

function makeMismatchEditor() {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), MismatchMcqNode],
    content: { type: "doc", content: [{ type: "mcq" }] },
  });
  editors.push(editor);
  const node = editor.state.doc.firstChild;
  if (!node) throw new Error("expected mismatch mcq node");
  return { editor, node, getPos: () => 0 };
}

function makeEditor() {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      McqNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: {
            id: "mcq-1",
            assessment: {
              correctOptionId: "b",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              legend: "Choose a letter",
              points: 3,
              maxAttempts: 2,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [selectableChoice("a"), selectableChoice("b")],
            },
            {
              type: "assessment_actions_group",
              content: [
                {
                  type: "assessment_hints_group",
                  content: [{ type: "assessment_hint", content: [{ type: "paragraph" }] }],
                },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);

  let node: PMNode | null = null;
  let pos: number | null = null;
  editor.state.doc.descendants((candidate, candidatePos) => {
    if (candidate.type.name !== "mcq") return true;
    node = candidate;
    pos = candidatePos;
    return false;
  });
  if (!node || pos === null) throw new Error("expected mcq node");

  return { editor, node, getPos: () => pos ?? undefined };
}

function selectableChoice(id: string) {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text: id }] }],
      },
    ],
  };
}

function RuntimeProbe({
  editor,
  getPos,
  node,
}: {
  editor: Editor;
  getPos: () => number | undefined;
  node: PMNode;
}) {
  const runtime = useAssessmentRuntime({
    definition: mcqBlockDefinition,
    editor,
    getPos,
    node,
  });

  return (
    <>
      <p data-testid="problem-id">{runtime.problemId}</p>
      <p data-testid="registered">{runtime.problem ? "registered" : "missing"}</p>
      <p data-testid="kind">{runtime.problemConfig.kind}</p>
      <p data-testid="experience-hints">{String(runtime.experience.hints)}</p>
      <p data-testid="response-kind">{runtime.response.projected.kind}</p>
      <p data-testid="response-option">
        {"optionId" in runtime.response.projected
          ? (runtime.response.projected.optionId ?? "")
          : ""}
      </p>
      <p data-testid="summary-feedback">{String(runtime.feedback.summary?.isCorrect ?? "")}</p>
      <button type="button" onClick={() => runtime.response.setValue({ choices: "b" })}>
        choose
      </button>
      <button type="button" onClick={() => void runtime.actions.check()}>
        check
      </button>
      <button type="button" onClick={() => void runtime.actions.submit()}>
        submit
      </button>
      <button type="button" onClick={() => void runtime.actions.revealAnswer()}>
        reveal
      </button>
    </>
  );
}

function MismatchedDefinitionProbe({
  editor,
  getPos,
  node,
}: {
  editor: Editor;
  getPos: () => number | undefined;
  node: PMNode;
}) {
  useAssessmentRuntime({
    definition: imageHotspotBlockDefinition,
    editor,
    getPos,
    node,
  });
  return null;
}

function RuntimeByIdProbe({
  expectedKind,
  problemId,
}: {
  expectedKind?: AssessmentInteractionKind;
  problemId: string;
}) {
  return expectedKind ? (
    <RuntimeByIdExpectedKindProbe expectedKind={expectedKind} problemId={problemId} />
  ) : (
    <RuntimeByIdAnyKindProbe problemId={problemId} />
  );
}

function RuntimeByIdAnyKindProbe({ problemId }: { problemId: string }) {
  const runtime = useAssessmentRuntimeById(problemId);

  return <RuntimeByIdResult runtime={runtime} />;
}

function RuntimeByIdExpectedKindProbe({
  expectedKind,
  problemId,
}: {
  expectedKind: AssessmentInteractionKind;
  problemId: string;
}) {
  const runtime = useAssessmentRuntimeById(problemId, expectedKind);

  return <RuntimeByIdResult runtime={runtime} />;
}

function RuntimeByIdResult({ runtime }: { runtime: AssessmentRuntimeController | null }) {
  if (!runtime) return <p data-testid="by-id-status">missing</p>;

  const { interaction } = runtime;

  return (
    <>
      <p data-testid="by-id-status">ready</p>
      <p data-testid="by-id-kind">{interaction.kind}</p>
      <p data-testid="by-id-hints">{String(runtime.experience.hints)}</p>
      {interaction.kind === "single-select" ? (
        <button type="button" onClick={() => interaction.select("b")}>
          by-id choose
        </button>
      ) : null}
    </>
  );
}

function ChoiceDisclosureProbe({
  editor,
  getPos,
  node,
}: {
  editor: Editor;
  getPos: () => number | undefined;
  node: PMNode;
}) {
  const runtime = useAssessmentRuntime({
    definition: mcqBlockDefinition,
    editor,
    getPos,
    node,
  });
  const interaction = runtime.interaction.kind === "single-select" ? runtime.interaction : null;

  return (
    <>
      <p data-testid="registered">{runtime.problem ? "registered" : "missing"}</p>
      <p data-testid="state-a">{interaction?.stateFor("a") ?? "none"}</p>
      <p data-testid="state-b">{interaction?.stateFor("b") ?? "none"}</p>
      <button type="button" onClick={() => interaction?.select("a")}>
        choose wrong
      </button>
      <button type="button" onClick={() => void runtime.actions.submit()}>
        submit
      </button>
      <button type="button" onClick={() => void runtime.actions.revealAnswer()}>
        reveal
      </button>
    </>
  );
}

function HotspotByIdProbe({ problemId }: { problemId: string }) {
  const runtime = useAssessmentRuntimeById(problemId, "spatial-hotspot");
  const interaction = runtime?.interaction ?? null;

  return (
    <>
      <p data-testid="hotspot-kind">{interaction?.kind ?? "missing"}</p>
      <p data-testid="hotspot-click-count">{String(interaction?.clicks.length ?? 0)}</p>
      <p data-testid="hotspot-has-response">{String(runtime?.response.hasValue ?? false)}</p>
      <button
        type="button"
        onClick={() =>
          interaction?.addClick({
            id: "click-1",
            x: 20,
            y: 20,
            hotspotId: "h1",
          })
        }
      >
        add hotspot click
      </button>
    </>
  );
}

function RuntimeProblemVisibilityProbe({ problemId }: { problemId: string }) {
  const runtime = useAssessmentRuntimeById(problemId);
  const problem = runtime?.problem ?? null;

  return (
    <>
      <p data-testid="official-visible">{String((problem?.officialResult ?? null) !== null)}</p>
      <p data-testid="official-feedback">
        {String(
          Boolean(
            problem?.officialResult &&
            "feedback" in problem.officialResult &&
            problem.officialResult.feedback,
          ),
        )}
      </p>
      <p data-testid="official-expected">
        {String(
          Boolean(
            problem?.officialResult?.items &&
            Object.values(problem.officialResult.items).some((item) => "expected" in item),
          ),
        )}
      </p>
      <p data-testid="official-item-count">
        {String(Object.keys(problem?.officialResult?.items ?? {}).length)}
      </p>
      <p data-testid="answer-key-visible">{String(problem?.answerKeyVisible ?? false)}</p>
      <p data-testid="feedback-visible">{String((problem?.feedbackResult ?? null) !== null)}</p>
      <p data-testid="has-more-hints">{String(problem?.hasMoreHints ?? false)}</p>
      <p data-testid="has-reveal-payload">
        {String((problem?.state.revealedAnswer ?? null) !== null)}
      </p>
    </>
  );
}

class RuntimeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <p data-testid="runtime-error">{this.state.error.message}</p>;
    }

    return this.props.children;
  }
}

function withAssessmentPort(children: ReactNode, assessment: AssessmentPort | null) {
  return (
    <ScaffoldServicesProvider ports={{ assessment }}>
      <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
        <AssessmentRuntimeProvider>
          <ScopedStoreCapture />
          {children}
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

function setScopedProblem(
  authoredProblemId: string,
  overrides: Partial<AssessmentProblemSnapshot>,
  revealed = false,
) {
  const problemId = scopeAssessmentProblemId("artifact-1", authoredProblemId);
  scopedAssessmentStore?.setState((state) => ({
    durable: {
      ...state.durable,
      problems: {
        ...state.durable.problems,
        [problemId]: {
          response: null,
          submitted: false,
          attemptNumber: 0,
          hintsShown: 0,
          checkResult: null,
          submissionResult: null,
          ...overrides,
        },
      },
    },
    transient: {
      ...state.transient,
      revealedAnswers: revealed
        ? {
            ...state.transient.revealedAnswers,
            [problemId]: {
              answerKey: {
                kind: "single-select",
                correctOptionId: "b",
                feedbackByOptionId: {},
              },
            },
          }
        : state.transient.revealedAnswers,
    },
  }));
}

function setScopedQuizAttempt(overrides: Partial<QuizAttemptState>) {
  const groupId = scopeAssessmentGroupId("artifact-1", "quiz-1");
  scopedAssessmentStore?.setState((state) => ({
    durable: {
      ...state.durable,
      quizzes: {
        ...state.durable.quizzes,
        [groupId]: {
          attemptId: "attempt-1",
          groupId,
          status: "in_progress",
          currentTargetId: "target-1",
          submittedTargetIds: [],
          startedAt: "2026-07-16T12:00:00.000Z",
          finishedAt: null,
          expiresAt: null,
          score: null,
          maxScore: null,
          resultsByTargetId: {},
          answerReviewAuthorized: false,
          ...overrides,
        },
      },
    },
  }));
}

beforeEach(() => {
  scopedAssessmentStore = null;
});

afterEach(() => {
  cleanup();
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

describe("useAssessmentRuntime", () => {
  it("registers a real question consumer in the artifact-scoped assessment store", async () => {
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <AssessmentRuntimeProvider>
            <ScopedStoreCapture />
            <RuntimeProbe {...setup} />
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(
        scopedAssessmentStore?.getState().registrations["artifact:artifact-1/block:mcq-1"],
      ).toBeDefined();
    });
  });

  it("rejects a definition whose node type does not match the runtime node", () => {
    const setup = makeMismatchEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <RuntimeErrorBoundary>
            <MismatchedDefinitionProbe {...setup} />
          </RuntimeErrorBoundary>
        </ScaffoldArtifactIdentityProvider>,
        assessmentPort,
      ),
    );

    expect(screen.getByTestId("runtime-error").textContent).toContain(
      'received definition for "image_hotspot"',
    );
    expect(screen.getByTestId("runtime-error").textContent).toContain('runtime node is "mcq"');
  });

  it("builds MCQ runtime state from the settings schema and capability declarations", async () => {
    const user = userEvent.setup();
    const setup = makeEditor();
    let checked: AssessmentCheckRequest | null = null;
    let submitted: AssessmentSubmitRequest | null = null;
    let revealed: AssessmentRevealRequest | null = null;
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      check: async (args) => {
        checked = args;
        const result = { ...canonicalAssessmentResult, isCorrect: true, score: 1 };
        return assessmentProblemOutcome(result, {
          response: args.response,
          checkResult: result,
          submitted: false,
          submissionResult: null,
        });
      },
      submit: async (args) => {
        submitted = args;
        return assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: true,
            score: 1,
          },
          { response: args.response },
        );
      },
      revealAnswer: async (args) => {
        revealed = args;
        return {
          answerKey: { kind: "single-select", correctOptionId: "b", feedbackByOptionId: {} },
        };
      },
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <RuntimeProbe {...setup} />
        </ScaffoldArtifactIdentityProvider>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("registered").textContent).toBe("registered");
    });

    expect(screen.getByTestId("problem-id").textContent).toBe("artifact:artifact-1/block:mcq-1");
    expect(screen.getByTestId("kind").textContent).toBe("single-select");
    expect(screen.getByTestId("experience-hints").textContent).toBe("true");
    expect(screen.getByTestId("response-kind").textContent).toBe("single-select");

    await user.click(screen.getByText("choose"));

    await waitFor(() => {
      expect(screen.getByTestId("response-option").textContent).toBe("b");
    });
    expect(
      scopedAssessmentStore?.getState().transient.responseReady[
        scopeAssessmentProblemId("artifact-1", "mcq-1")
      ],
    ).toBe(true);

    await user.click(screen.getByText("check"));
    await waitFor(() => {
      expect(checked).not.toBeNull();
      expect(
        scopedAssessmentStore?.getState().durable.problems[
          scopeAssessmentProblemId("artifact-1", "mcq-1")
        ]?.checkResult?.isCorrect,
      ).toBe(true);
      expect(screen.getByTestId("summary-feedback").textContent).toBe("true");
    });

    await user.click(screen.getByText("submit"));
    await user.click(screen.getByText("reveal"));

    await waitFor(() => {
      expect(checked).toMatchObject({
        problemId: "artifact:artifact-1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "b" },
      });
      expect(submitted).toMatchObject({
        problemId: "artifact:artifact-1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "b" },
      });
      expect(revealed).toMatchObject({
        problemId: "artifact:artifact-1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "b" },
      });
    });
  });

  it("allows child NodeViews to attach to the registered runtime by problem id", async () => {
    const user = userEvent.setup();
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <RuntimeProbe {...setup} />
          <RuntimeByIdProbe problemId="mcq-1" />
        </ScaffoldArtifactIdentityProvider>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("registered").textContent).toBe("registered");
      expect(screen.getByTestId("by-id-status").textContent).toBe("ready");
    });

    expect(screen.getByTestId("by-id-kind").textContent).toBe("single-select");
    expect(screen.getByTestId("by-id-hints").textContent).toBe("true");

    await user.click(screen.getByText("by-id choose"));

    await waitFor(() => {
      expect(screen.getByTestId("response-option").textContent).toBe("b");
    });
  });

  it("reports a developer error when runtime-by-id expects the wrong interaction kind", async () => {
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <RuntimeProbe {...setup} />
          <RuntimeErrorBoundary>
            <RuntimeByIdProbe problemId="mcq-1" expectedKind="spatial-hotspot" />
          </RuntimeErrorBoundary>
        </ScaffoldArtifactIdentityProvider>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("registered").textContent).toBe("registered");
      expect(screen.getByTestId("runtime-error").textContent).toContain(
        'expected "spatial-hotspot"',
      );
      expect(screen.getByTestId("runtime-error").textContent).toContain(
        'registered "single-select"',
      );
    });
  });

  it("does not disclose unselected correct choices before explicit reveal in on-submit mode", async () => {
    const user = userEvent.setup();
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              a: { correct: false, expected: false, given: true },
              b: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: { kind: "single-select", correctOptionId: "b", feedbackByOptionId: {} },
      }),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <ChoiceDisclosureProbe {...setup} />
        </ScaffoldArtifactIdentityProvider>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("registered").textContent).toBe("registered");
    });

    await user.click(screen.getByText("choose wrong"));
    await user.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(screen.getByTestId("state-a").textContent).toBe("incorrect");
      expect(screen.getByTestId("state-b").textContent).toBe("none");
    });

    await user.click(screen.getByText("reveal"));

    await waitFor(() => {
      expect(screen.getByTestId("state-b").textContent).toBe("missed");
    });
  });

  it("marks the answer key visible after an explicit reveal payload arrives", async () => {
    const problemId = "p1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0 },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: { kind: "single-select", correctOptionId: "b", feedbackByOptionId: {} },
      }),
    };

    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} />
          <RuntimeProblemVisibilityProbe problemId={problemId} />
        </>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(
        scopedAssessmentStore?.getState().registrations[
          scopeAssessmentProblemId("artifact-1", problemId)
        ],
      ).toBeDefined();
    });
    act(() => {
      scopedAssessmentStore
        ?.getState()
        .setLocalResponse(
          { problemId, targetId: problemId, interactionKind: "single-select" },
          { choices: "a" },
        );
    });

    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
    expect(screen.getByTestId("has-reveal-payload").textContent).toBe("false");

    await act(async () => {
      await scopedAssessmentStore?.getState().revealAnswer({
        problemId,
        targetId: problemId,
        interactionKind: "single-select",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("answer-key-visible").textContent).toBe("true");
      expect(screen.getByTestId("has-reveal-payload").textContent).toBe("true");
    });
  });

  it("marks the answer key visible for immediate feedback without creating a reveal payload", async () => {
    const problemId = "p1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      check: async (args) => {
        const result = {
          ...canonicalAssessmentResult,
          isCorrect: false,
          score: 0,
          items: {
            a: { correct: false, expected: false, given: true },
            b: { correct: false, expected: true, given: false },
          },
        };
        return assessmentProblemOutcome(result, {
          response: args.response,
          checkResult: result,
          submitted: false,
          submissionResult: null,
        });
      },
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0 },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration
            problemId={problemId}
            feedbackMode="immediate"
            showAnswer={false}
          />
          <RuntimeProblemVisibilityProbe problemId={problemId} />
        </>,
        assessmentPort,
      ),
    );

    await waitFor(() => {
      expect(
        scopedAssessmentStore?.getState().registrations[
          scopeAssessmentProblemId("artifact-1", problemId)
        ],
      ).toBeDefined();
    });
    act(() => {
      scopedAssessmentStore
        ?.getState()
        .setLocalResponse(
          { problemId, targetId: problemId, interactionKind: "single-select" },
          { choices: "a" },
        );
    });

    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
    expect(screen.getByTestId("has-reveal-payload").textContent).toBe("false");

    await act(async () => {
      await scopedAssessmentStore?.getState().check({
        problemId,
        targetId: problemId,
        interactionKind: "single-select",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("answer-key-visible").textContent).toBe("true");
      expect(screen.getByTestId("has-reveal-payload").textContent).toBe("false");
    });
  });

  it("keeps standalone assessment visibility unchanged without a quiz policy", async () => {
    const problemId = "p1";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} hintsTotal={1} />
          <RuntimeProblemVisibilityProbe problemId={problemId} />
        </>,
        null,
      ),
    );
    await waitFor(() => expect(scopedAssessmentStore).not.toBeNull());
    act(() =>
      setScopedProblem(
        problemId,
        { submissionResult: { ...canonicalAssessmentResult, isCorrect: false, score: 0 } },
        true,
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("feedback-visible").textContent).toBe("true");
      expect(screen.getByTestId("has-more-hints").textContent).toBe("true");
      expect(screen.getByTestId("answer-key-visible").textContent).toBe("true");
    });
  });

  it("suppresses child feedback and hints when quiz results are hidden", () => {
    const problemId = "p1";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} targetId="target-1" hintsTotal={1} />
          <ScopedQuizRegistration reviewDetail="none" />
          <RuntimeProblemVisibilityProbe problemId={problemId} />
        </>,
        null,
      ),
    );
    act(() => {
      setScopedProblem(
        problemId,
        { submissionResult: { ...canonicalAssessmentResult, isCorrect: false, score: 0 } },
        true,
      );
      setScopedQuizAttempt({ status: "completed" });
    });

    expect(screen.getByTestId("feedback-visible").textContent).toBe("false");
    expect(screen.getByTestId("official-visible").textContent).toBe("false");
    expect(screen.getByTestId("has-more-hints").textContent).toBe("false");
    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
  });

  it("shows only result state when quiz review detail is result-only", () => {
    const problemId = "p1";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} targetId="target-1" />
          <ScopedQuizRegistration reviewDetail="result_only" />
          <RuntimeProblemVisibilityProbe problemId={problemId} />
        </>,
        null,
      ),
    );
    act(() => {
      setScopedProblem(
        problemId,
        {
          submissionResult: {
            isCorrect: false,
            score: 0,
            maxScore: 1,
            feedback: { kind: "rich-text", document: { type: "doc" } },
            items: {
              a: {
                correct: false,
                expected: false,
                given: true,
                feedback: { kind: "rich-text", document: { type: "doc" } },
              },
            },
          },
        },
        true,
      );
      setScopedQuizAttempt({ status: "completed", answerReviewAuthorized: true });
    });

    expect(screen.getByTestId("official-visible").textContent).toBe("true");
    expect(screen.getByTestId("official-feedback").textContent).toBe("false");
    expect(screen.getByTestId("official-expected").textContent).toBe("false");
    expect(screen.getByTestId("official-item-count").textContent).toBe("0");
    expect(screen.getByTestId("feedback-visible").textContent).toBe("true");
    expect(screen.getByTestId("has-reveal-payload").textContent).toBe("true");
    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
  });

  it("waits for quiz review authorization before full answer reveal", async () => {
    const problemId = "p1";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} targetId="target-1" />
          <ScopedQuizRegistration reviewDetail="full_review" />
          <RuntimeProblemVisibilityProbe problemId={problemId} />
        </>,
        null,
      ),
    );
    act(() => {
      setScopedProblem(
        problemId,
        {
          submissionResult: {
            isCorrect: false,
            score: 0,
            maxScore: 1,
            feedback: { kind: "rich-text", document: { type: "doc" } },
            items: {
              a: {
                correct: false,
                expected: false,
                given: true,
                feedback: { kind: "rich-text", document: { type: "doc" } },
              },
            },
          },
        },
        true,
      );
      setScopedQuizAttempt({ status: "completed" });
    });

    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
    expect(screen.getByTestId("official-visible").textContent).toBe("false");

    act(() => {
      setScopedQuizAttempt({ status: "completed", answerReviewAuthorized: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("official-visible").textContent).toBe("true");
      expect(screen.getByTestId("official-feedback").textContent).toBe("true");
      expect(screen.getByTestId("official-expected").textContent).toBe("true");
      expect(screen.getByTestId("answer-key-visible").textContent).toBe("true");
    });
  });

  it("exposes spatial hotspot click updates through the runtime-by-id interaction", async () => {
    const user = userEvent.setup();
    const problemId = "hs-1";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} interactionKind="spatial-hotspot" />
          <HotspotByIdProbe problemId={problemId} />
        </>,
        null,
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("hotspot-kind").textContent).toBe("spatial-hotspot"),
    );

    expect(screen.getByTestId("hotspot-kind").textContent).toBe("spatial-hotspot");
    expect(screen.getByTestId("hotspot-click-count").textContent).toBe("0");
    expect(screen.getByTestId("hotspot-has-response").textContent).toBe("false");

    await user.click(screen.getByText("add hotspot click"));

    await waitFor(() => {
      expect(screen.getByTestId("hotspot-click-count").textContent).toBe("1");
      expect(screen.getByTestId("hotspot-has-response").textContent).toBe("true");
    });
  });
});
