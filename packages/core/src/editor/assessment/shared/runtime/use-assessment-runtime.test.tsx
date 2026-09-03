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
import type { AssessmentLearningEventDefinition } from "@/runtime/learning-events/catalogue";

import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  SelectableChoiceBodyNode,
  SelectableChoiceNode,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import {
  useAssessmentRuntime,
  useAssessmentRuntimeById,
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeController,
  type AssessmentRuntimeProblemConfig,
} from "./use-assessment-runtime";
import { imageHotspotBlockDefinition } from "@/editor/blocks/assessment/image-hotspot/image-hotspot-definition";
import { mcqBlockDefinition } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { McqNode } from "@/editor/blocks/assessment/mcq/node";
import { mcqResponseCodec } from "@/editor/blocks/assessment/mcq/assessment";
import { imageHotspotResponseCodec } from "@/editor/assessment/image-hotspot/assessment";
import { InlineIconNode } from "@/editor/rich-text/inline-icon/model/InlineIconNode";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { MathBlockNode } from "@/editor/rich-text/math/model/MathBlock";
import { createVocabularyTermNode } from "@/editor/rich-text/vocabulary-term/model/VocabularyTermNode";
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
import { createTestNodeIdentityExtension } from "@/editor/testing";

const canonicalAssessmentResult = { feedback: null, items: {} };

const editors: Editor[] = [];
let scopedAssessmentStore: AssessmentStoreApi | null = null;

function ScopedStoreCapture() {
  scopedAssessmentStore = useAssessmentStoreApi();
  return null;
}

function learningEventDefinitionForKind(
  kind: AssessmentInteractionKind,
): AssessmentLearningEventDefinition {
  switch (kind) {
    case "single-select":
      return { interaction: { kind, options: [] } };
    case "multi-select":
      return { interaction: { kind, options: [], maxSelections: null } };
    case "sequence":
      return { interaction: { kind, items: [] } };
    case "match":
      return { interaction: { kind, items: [], targets: [] } };
    case "classify":
      return { interaction: { kind, items: [], categories: [] } };
    case "fill-blanks":
      return { interaction: { kind, blanks: [] } };
    case "spatial-hotspot":
      return {
        interaction: {
          kind,
          hotspots: [
            {
              id: "hotspot00001",
              label: "Target",
              geometry: { kind: "circle", centerX: 20, centerY: 20, radius: 8 },
            },
          ],
          maxSelections: null,
        },
      };
  }
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
      authoredBlockId: problemId,
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
        learningEventDefinition: learningEventDefinitionForKind(interactionKind),
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
      groupId: "quiz00000001",
      targetIds: ["target000001"],
      settings: {
        allowBacktracking: true,
        reviewTiming: "after_quiz" as const,
        reviewDetail,
        attemptsPerQuestion: 1 as const,
        isGraded: true,
        passingScore: null,
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
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createTestNodeIdentityExtension(),
      MismatchMcqNode,
    ],
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
      InlineIconNode,
      MathInlineNode,
      MathBlockNode,
      createVocabularyTermNode(),
      createTestNodeIdentityExtension(),
      McqNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: {
            id: "assess000001",
            assessment: {
              correctOptionId: "option000002",
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
            {
              type: "assessment_prompt",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "  What   is " },
                    { type: "inlineMath", attrs: { latex: "x^2" } },
                    { type: "text", text: " called? " },
                    {
                      type: "vocabTerm",
                      attrs: {
                        term: "square",
                        definition: "PRIVATE_VOCABULARY_DEFINITION",
                      },
                    },
                    { type: "hardBreak" },
                    {
                      type: "inlineIcon",
                      attrs: {
                        value: { kind: "emoji", value: "💡" },
                        size: "sm",
                      },
                    },
                  ],
                },
                { type: "horizontalRule" },
                {
                  type: "blockMath",
                  attrs: { id: "promptMath01", latex: "a^2 + b^2 = c^2" },
                },
              ],
            },
            {
              type: "assessment_choices_group",
              content: [richSelectableChoice("option000001"), selectableChoice("option000002")],
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

function richSelectableChoice(id: string) {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Formula " },
              { type: "inlineMath", attrs: { latex: "y^2" } },
              { type: "text", text: " means " },
              {
                type: "vocabTerm",
                attrs: {
                  term: "square",
                  definition: "PRIVATE_CHOICE_DEFINITION",
                },
              },
              { type: "hardBreak" },
              {
                type: "inlineIcon",
                attrs: {
                  value: { kind: "emoji", value: "✅" },
                  size: "sm",
                },
              },
            ],
          },
          {
            type: "blockMath",
            attrs: { id: "choiceMath01", latex: "y^2 = y × y" },
          },
        ],
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
      <button type="button" onClick={() => runtime.response.setValue({ choices: "option000002" })}>
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

function TargetRuntimeProbe({
  assessmentTargetId,
  configTargetId = assessmentTargetId,
}: {
  assessmentTargetId: string;
  configTargetId?: string;
}) {
  const config = useMemo<AssessmentRuntimeProblemConfig>(
    () => ({
      kind: "single-select",
      targetId: configTargetId,
      interactionKind: "single-select",
      learningEventDefinition: {
        interaction: {
          kind: "single-select",
          options: [{ id: "option000001", label: "First" }],
        },
      },
      choiceMode: "single",
      feedbackMode: "on_submit",
      maxAttempts: null,
      maxSelect: null,
      currentOptionIds: ["option000001"],
      responseName: `${assessmentTargetId}:response`,
      legend: "Choose one",
      placeholder: "",
      showAnswerEnabled: true,
      experience: pageAssessmentExperience,
      hintsTotal: 0,
      points: 1,
      isGraded: true,
      responseCodec: mcqResponseCodec,
    }),
    [assessmentTargetId, configTargetId],
  );
  const runtime = useAssessmentRuntimeForTarget({ assessmentTargetId, config });

  return <p data-testid="target-runtime-status">{runtime.problem ? "registered" : "pending"}</p>;
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
        <button type="button" onClick={() => interaction.select("option000002")}>
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
      <p data-testid="state-a">{interaction?.stateFor("option000001") ?? "none"}</p>
      <p data-testid="state-b">{interaction?.stateFor("option000002") ?? "none"}</p>
      <button type="button" onClick={() => interaction?.select("option000001")}>
        choose wrong
      </button>
      <button type="button" onClick={() => void runtime.actions.submit()}>
        submit
      </button>
      <button type="button" onClick={() => void runtime.actions.revealAnswer()}>
        reveal
      </button>
      <button type="button" onClick={() => void runtime.problem?.toggleAnswerView()}>
        show answer
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
            id: "click0000001",
            x: 20,
            y: 20,
            hotspotId: "hotspot00001",
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
  authoredBlockId: string,
  overrides: Partial<AssessmentProblemSnapshot>,
  revealed = false,
) {
  const problemId = scopeAssessmentProblemId("artifact-1", authoredBlockId);
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
                correctOptionId: "option000002",
                feedbackByOptionId: {},
              },
            },
          }
        : state.transient.revealedAnswers,
    },
  }));
}

function setScopedQuizAttempt(overrides: Partial<QuizAttemptState>) {
  const groupId = scopeAssessmentGroupId("artifact-1", "quiz00000001");
  scopedAssessmentStore?.setState((state) => ({
    durable: {
      ...state.durable,
      quizzes: {
        ...state.durable.quizzes,
        [groupId]: {
          attemptId: "attempt-1",
          groupId,
          status: "in_progress",
          currentTargetId: "target000001",
          submittedTargetIds: [],
          startedAt: "2026-07-16T12:00:00.000Z",
          finishedAt: null,
          expiresAt: null,
          score: null,
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
  it("registers an already-built config with the target id as compatibility authoredBlockId", async () => {
    render(withAssessmentPort(<TargetRuntimeProbe assessmentTargetId="surfaceTarget01" />, null));

    await waitFor(() => {
      expect(screen.getByTestId("target-runtime-status")).toHaveTextContent("registered");
    });
    const registration =
      scopedAssessmentStore?.getState().registrations["artifact:artifact-1/block:surfaceTarget01"];
    expect(registration).toMatchObject({
      targetId: "surfaceTarget01",
      interactionKind: "single-select",
    });
  });

  it("keeps a Surface target/config identity mismatch observable", async () => {
    render(
      withAssessmentPort(
        <RuntimeErrorBoundary>
          <TargetRuntimeProbe
            assessmentTargetId="surfaceTarget01"
            configTargetId="differentTarget1"
          />
        </RuntimeErrorBoundary>,
        null,
      ),
    );

    expect(await screen.findByTestId("runtime-error")).toHaveTextContent(
      'Assessment runtime target "surfaceTarget01" does not match config target "differentTarget1".',
    );
  });

  it("registers a real question consumer in the artifact-scoped assessment store", async () => {
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: { scaled: 1 } },
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
      const registration =
        scopedAssessmentStore?.getState().registrations["artifact:artifact-1/block:assess000001"];
      expect(registration?.config.learningEventDefinition).toBeDefined();
    });
    const registration =
      scopedAssessmentStore?.getState().registrations["artifact:artifact-1/block:assess000001"];
    const learningEventDefinition = registration?.config.learningEventDefinition;
    expect(learningEventDefinition).toStrictEqual({
      activityDescription: "What is x^2 called? square 💡 a^2 + b^2 = c^2",
      interaction: {
        kind: "single-select",
        options: [
          { id: "option000001", label: "Formula y^2 means square ✅ y^2 = y × y" },
          { id: "option000002", label: "option000002" },
        ],
      },
    });
    expect(learningEventDefinition).not.toHaveProperty("type");
    expect(learningEventDefinition).not.toHaveProperty("interactionType");
    expect(learningEventDefinition).not.toHaveProperty("extensions");
    expect(learningEventDefinition).not.toHaveProperty("correctResponsesPattern");
    expect(JSON.stringify(learningEventDefinition)).not.toContain("PRIVATE_CHOICE_DEFINITION");
    expect(JSON.stringify(scopedAssessmentStore?.getState().registrations)).not.toContain(
      "PRIVATE_VOCABULARY_DEFINITION",
    );
  });

  it("rejects a definition whose node type does not match the runtime node", () => {
    const setup = makeMismatchEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: { scaled: 1 } },
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
        const result = { ...canonicalAssessmentResult, isCorrect: true, score: { scaled: 1 } };
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
            score: { scaled: 1 },
          },
          { response: args.response },
        );
      },
      revealAnswer: async (args) => {
        revealed = args;
        return {
          answerKey: {
            kind: "single-select",
            correctOptionId: "option000002",
            feedbackByOptionId: {},
          },
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

    expect(screen.getByTestId("problem-id").textContent).toBe(
      "artifact:artifact-1/block:assess000001",
    );
    expect(screen.getByTestId("kind").textContent).toBe("single-select");
    expect(screen.getByTestId("experience-hints").textContent).toBe("true");
    expect(screen.getByTestId("response-kind").textContent).toBe("single-select");

    await user.click(screen.getByText("choose"));

    await waitFor(() => {
      expect(screen.getByTestId("response-option").textContent).toBe("option000002");
    });
    expect(
      scopedAssessmentStore?.getState().transient.responseReady[
        scopeAssessmentProblemId("artifact-1", "assess000001")
      ],
    ).toBe(true);

    await user.click(screen.getByText("check"));
    await waitFor(() => {
      expect(checked).not.toBeNull();
      expect(
        scopedAssessmentStore?.getState().durable.problems[
          scopeAssessmentProblemId("artifact-1", "assess000001")
        ]?.checkResult?.isCorrect,
      ).toBe(true);
      expect(screen.getByTestId("summary-feedback").textContent).toBe("true");
    });

    await user.click(screen.getByText("submit"));
    await user.click(screen.getByText("reveal"));

    await waitFor(() => {
      expect(checked).toMatchObject({
        problemId: "artifact:artifact-1/block:assess000001",
        targetId: "assess000001",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option000002" },
      });
      expect(submitted).toMatchObject({
        problemId: "artifact:artifact-1/block:assess000001",
        targetId: "assess000001",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option000002" },
      });
      expect(revealed).toMatchObject({
        problemId: "artifact:artifact-1/block:assess000001",
        targetId: "assess000001",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option000002" },
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
          { ...canonicalAssessmentResult, isCorrect: true, score: { scaled: 1 } },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <RuntimeProbe {...setup} />
          <RuntimeByIdProbe problemId="assess000001" />
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
      expect(screen.getByTestId("response-option").textContent).toBe("option000002");
    });
  });

  it("reports a developer error when runtime-by-id expects the wrong interaction kind", async () => {
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: { scaled: 1 } },
          { response: args.response },
        ),
    };

    render(
      withAssessmentPort(
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <RuntimeProbe {...setup} />
          <RuntimeErrorBoundary>
            <RuntimeByIdProbe problemId="assess000001" expectedKind="spatial-hotspot" />
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

  it("keeps submitted choices visible until the learner switches to the correct answer", async () => {
    const user = userEvent.setup();
    const setup = makeEditor();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
            items: {
              option000001: { correct: false, expected: false, given: true },
              option000002: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "single-select",
          correctOptionId: "option000002",
          feedbackByOptionId: {},
        },
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
      expect(screen.getByTestId("state-a").textContent).toBe("incorrect");
      expect(screen.getByTestId("state-b").textContent).toBe("none");
    });

    await user.click(screen.getByText("show answer"));

    await waitFor(() => {
      expect(screen.getByTestId("state-a").textContent).toBe("none");
      expect(screen.getByTestId("state-b").textContent).toBe("correct");
    });

    await user.click(screen.getByText("show answer"));

    await waitFor(() => {
      expect(screen.getByTestId("state-a").textContent).toBe("incorrect");
      expect(screen.getByTestId("state-b").textContent).toBe("none");
    });
  });

  it("marks the answer key visible after an explicit reveal payload arrives", async () => {
    const problemId = "assess000002";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: { scaled: 0 } },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "single-select",
          correctOptionId: "option000002",
          feedbackByOptionId: {},
        },
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
          { authoredBlockId: problemId, targetId: problemId, interactionKind: "single-select" },
          { choices: "option000001" },
        );
    });

    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
    expect(screen.getByTestId("has-reveal-payload").textContent).toBe("false");

    await act(async () => {
      await scopedAssessmentStore?.getState().revealAnswer({
        authoredBlockId: problemId,
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
    const problemId = "assess000002";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      check: async (args) => {
        const result = {
          ...canonicalAssessmentResult,
          isCorrect: false,
          score: { scaled: 0 },
          items: {
            option000001: { correct: false, expected: false, given: true },
            option000002: { correct: false, expected: true, given: false },
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
          { ...canonicalAssessmentResult, isCorrect: false, score: { scaled: 0 } },
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
          { authoredBlockId: problemId, targetId: problemId, interactionKind: "single-select" },
          { choices: "option000001" },
        );
    });

    expect(screen.getByTestId("answer-key-visible").textContent).toBe("false");
    expect(screen.getByTestId("has-reveal-payload").textContent).toBe("false");

    await act(async () => {
      await scopedAssessmentStore?.getState().check({
        authoredBlockId: problemId,
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
    const problemId = "assess000002";
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
        {
          submissionResult: {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
          },
        },
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
    const problemId = "assess000002";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} targetId="target000001" hintsTotal={1} />
          <ScopedQuizRegistration reviewDetail="none" />
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
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
          },
        },
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
    const problemId = "assess000002";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} targetId="target000001" />
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
            score: { scaled: 0 },
            feedback: { kind: "rich-text", document: { type: "doc" } },
            items: {
              option000001: {
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
    const problemId = "assess000002";
    render(
      withAssessmentPort(
        <>
          <ScopedProblemRegistration problemId={problemId} targetId="target000001" />
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
            score: { scaled: 0 },
            feedback: { kind: "rich-text", document: { type: "doc" } },
            items: {
              option000001: {
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
    const problemId = "hotspotBlk01";
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
