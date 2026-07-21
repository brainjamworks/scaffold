// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { Schema as ProseMirrorSchema } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useLayoutEffect, type ReactNode } from "react";

import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  AUTHORING_FRAME_ATTR,
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";
import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts as createInteractionOwnerCommandPortsWithLookup } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { publishInteractionOwnerSnapshot as publishInteractionOwnerSnapshotWithLookup } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveBlockChromeTargetDescriptor as resolveBlockChromeTargetDescriptorWithLookup } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { createAuthoringBlockExtensions } from "@/editor/blocks/authoring-block-extensions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { applySettingsSheetSettings } from "@/editor/shell/settings/sheets/ConfigurationSettingsSheet";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { InteractionSettingsSheetHost } from "@/editor/shell/settings/sheets/InteractionSettingsSheetHost";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";
import { createDisposableEditor, describeBlockContract } from "@/editor/testing";
import {
  QuizAttemptStateSchema,
  type QuizSettings,
  AssessmentProblemSnapshotSchema,
  AssessmentResultSchema,
  type AssessmentProblemSnapshot,
  type AssessmentResult,
  type QuizAttemptState,
} from "@scaffold/contracts";

import type { AssessmentPort } from "@/host/ports";
import { z } from "zod";

import {
  ASSESSMENT_QUESTION_CONTENT,
  COURSE_BLOCK_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { mcqResponseCodec } from "@/editor/blocks/assessment/mcq/assessment";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentChoicesGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group-runtime";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint-runtime";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentHintsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group-runtime";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentSummaryFeedbackRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback-runtime";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { SelectableChoiceBodyNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { SelectableChoiceAuthoringNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-authoring";
import { SelectableChoiceRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-runtime";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  AssessmentRuntimeProvider,
  useAssessmentStoreApi,
} from "@/runtime/assessment/AssessmentRuntimeProvider";
import {
  scopeAssessmentGroupId,
  scopeAssessmentProblemId,
} from "@/runtime/assessment/assessment-store";
import { useAssessmentProblemFacade } from "@/runtime/assessment/runtime-facade";
import { assessmentProblemOutcome, assessmentQuizOutcome } from "@/runtime/assessment/test-utils";
import type { AssessmentRegistrationInput, AssessmentStoreApi } from "@/runtime/assessment/types";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { CalloutAuthoringExtension } from "@/editor/blocks/presentation/callout";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { McqAuthoringExtension, McqRuntimeExtension } from "../mcq";
import { QuizNode } from "./node";
import { QuizAuthoringExtension, QuizRuntimeExtension } from "./index";
import { getQuizChildBlock } from "./quiz-authoring";

import "@/editor/blocks/presentation/callout/callout-definition";
import "../mcq/mcq-definition";
import "./quiz-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "quiz",
  catalogId: "quiz",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  resetScopedAssessmentTestState();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({
      height: 32,
      width: 96,
      x: 48,
      y: 48,
    }),
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    function mockClientRects(this: Element) {
      return [this.getBoundingClientRect()] as unknown as DOMRectList;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 1024 : 96;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 768 : 32;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function scrollWidth(this: HTMLElement) {
      return this.clientWidth;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.clientHeight;
    },
  );
});

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

interface ProblemSeed {
  [field: string]: unknown;
}

interface QuizSeed {
  [field: string]: unknown;
}

interface ScopedAssessmentSeed {
  problems?: Record<string, ProblemSeed>;
  quizzes?: Record<string, QuizSeed>;
}

let scopedAssessmentStore: AssessmentStoreApi | null = null;
let pendingProblems: Record<string, AssessmentProblemSnapshot> = {};
let pendingQuizzes: Record<string, QuizAttemptState> = {};
let pendingRegistrations: Record<string, AssessmentRegistrationInput> = {};

function resetScopedAssessmentTestState() {
  scopedAssessmentStore = null;
  pendingProblems = {};
  pendingQuizzes = {};
  pendingRegistrations = {};
}

function seedAssessmentStore(seed: ScopedAssessmentSeed) {
  for (const [problemId, raw] of Object.entries(seed.problems ?? {})) {
    const scopedId = scopedProblemId(problemId);
    const current = pendingProblems[scopedId];
    const response = recordValue(raw["response"]);
    const submitted = booleanValue(raw["submitted"], current?.submitted ?? false);
    const seededSubmissionResult = assessmentResultOrNull(raw["submissionResult"], null);
    pendingProblems[scopedId] = AssessmentProblemSnapshotSchema.parse({
      response:
        typeof response["choices"] === "string"
          ? { kind: "single-select", optionId: response["choices"] }
          : (current?.response ?? null),
      submitted,
      attemptNumber: numberValue(raw["attemptNumber"], current?.attemptNumber ?? 0),
      hintsShown: numberValue(raw["hintsShown"], current?.hintsShown ?? 0),
      checkResult: assessmentResultOrNull(
        raw["checkResult"],
        submitted
          ? (current?.checkResult ?? null)
          : (seededSubmissionResult ?? current?.checkResult ?? null),
      ),
      submissionResult: submitted
        ? (seededSubmissionResult ?? current?.submissionResult ?? assessmentResult({}))
        : null,
    });
  }

  for (const [authoredGroupId, raw] of Object.entries(seed.quizzes ?? {})) {
    if (raw["status"] === "not_started" || raw["attemptId"] === null) continue;
    const groupId = scopeAssessmentGroupId("artifact-1", authoredGroupId);
    const current = pendingQuizzes[groupId];
    const status = quizStatus(raw["status"], current?.status ?? "in_progress");
    const score = raw["score"] === null ? null : numberValue(raw["score"], current?.score ?? 0);
    const maxScore =
      raw["maxScore"] === null ? null : numberValue(raw["maxScore"], current?.maxScore ?? 0);
    const rawResults = recordValue(raw["resultsByTargetId"]);
    const resultsByTargetId = Object.fromEntries(
      Object.entries(rawResults).map(([targetId, result]) => [targetId, assessmentResult(result)]),
    );
    pendingQuizzes[groupId] = QuizAttemptStateSchema.parse({
      attemptId: stringValue(raw["attemptId"], current?.attemptId ?? `attempt-${authoredGroupId}`),
      groupId,
      status,
      currentTargetId:
        raw["currentTargetId"] === null
          ? null
          : stringValue(raw["currentTargetId"], current?.currentTargetId ?? null),
      submittedTargetIds: stringArrayValue(
        raw["submittedTargetIds"],
        current?.submittedTargetIds ?? [],
      ),
      startedAt: nullableStringValue(raw["startedAt"], current?.startedAt ?? null),
      finishedAt: nullableStringValue(raw["finishedAt"], current?.finishedAt ?? null),
      expiresAt: nullableStringValue(raw["expiresAt"], current?.expiresAt ?? null),
      score,
      maxScore,
      resultsByTargetId: {
        ...(current?.resultsByTargetId ?? {}),
        ...resultsByTargetId,
      },
      answerReviewAuthorized: booleanValue(
        raw["answerReviewAuthorized"],
        current?.answerReviewAuthorized ?? false,
      ),
    });
  }
}

function ScopedAssessmentHarness() {
  const store = useAssessmentStoreApi();
  useLayoutEffect(() => {
    scopedAssessmentStore = store;
    store?.setState({
      durable: { problems: pendingProblems, quizzes: pendingQuizzes },
      targetBindings: {},
    });
    return () => {
      if (scopedAssessmentStore === store) scopedAssessmentStore = null;
    };
  }, [store]);
  return (
    <>
      {Object.values(pendingRegistrations).map((registration) => (
        <ScopedProblemRegistration key={registration.problemId} registration={registration} />
      ))}
    </>
  );
}

function ScopedProblemRegistration({
  registration,
}: {
  registration: AssessmentRegistrationInput;
}) {
  useAssessmentProblemFacade(registration);
  return null;
}

function scopedProblemId(problemId: string) {
  return problemId.startsWith("artifact:")
    ? problemId
    : scopeAssessmentProblemId("artifact-1", problemId);
}

function recordValue(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).catch({}).parse(value);
}

function assessmentResultOrNull(value: unknown, fallback: AssessmentResult | null) {
  return value === null || value === undefined ? fallback : assessmentResult(value);
}

function assessmentResult(value: unknown): AssessmentResult {
  const raw = recordValue(value);
  const rawItems = recordValue(raw["items"]);
  return AssessmentResultSchema.parse({
    isCorrect: booleanValue(raw["isCorrect"], false),
    score: numberValue(raw["score"], 0),
    maxScore: 1,
    feedback: null,
    items: Object.fromEntries(
      Object.entries(rawItems).map(([itemId, itemValue]) => {
        const item = recordValue(itemValue);
        return [
          itemId,
          {
            correct: booleanValue(item["correct"], false),
            ...(item["expected"] === undefined ? {} : { expected: item["expected"] }),
            ...(item["given"] === undefined ? {} : { given: item["given"] }),
          },
        ];
      }),
    ),
  });
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function stringValue(value: unknown, fallback: string | null): string {
  return typeof value === "string" ? value : (fallback ?? "");
}

function nullableStringValue(value: unknown, fallback: string | null) {
  return value === null ? null : typeof value === "string" ? value : fallback;
}

function stringArrayValue(value: unknown, fallback: readonly string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [...fallback];
}

function quizStatus(value: unknown, fallback: QuizAttemptState["status"]) {
  return value === "in_progress" || value === "completed" || value === "expired" ? value : fallback;
}

const TestAssessmentQuestionNode = Node.create({
  name: "test_assessment_question",
  group: ASSESSMENT_QUESTION_CONTENT,
  addAttributes() {
    return {
      id: { default: null },
      settings: {
        default: {
          feedbackMode: "on_submit",
          isGraded: true,
          showAnswer: true,
          points: 1,
          maxAttempts: null,
          legend: "Question response",
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-assessment-question": "" }];
  },
});

const TestRegionNode = Node.create({
  name: "region",
  group: "block",
  content: "(block | arrangement | section_arrangement)+",
  renderHTML() {
    return ["section", { "data-node": "region" }, 0];
  },
});

const testAssessmentQuestionSettingsSchema = z.object({
  feedbackMode: z.literal("on_submit").default("on_submit"),
  isGraded: z.boolean().default(true),
  showAnswer: z.boolean().default(true),
  points: z.number().default(1),
  maxAttempts: z.number().nullable().default(null),
  legend: z.string().default("Question response"),
});

const testAssessmentQuestionDefinition = defineBlock({
  nodeType: "test_assessment_question",
  configuration: createAssessmentConfiguration({
    schema: testAssessmentQuestionSettingsSchema,
    title: "Test quiz assessment question settings",
    defaultOpenSections: ["behaviour", "scoring"],
    sections: [{ id: "scoring", title: "Scoring" }],
    controls: [
      {
        kind: "number",
        name: "maxAttempts",
        label: "Max attempts",
        min: 1,
        step: 1,
        integer: true,
        emptyValue: null,
        placement: { sheet: { section: "behaviour" } },
      },
      {
        kind: "text",
        name: "legend",
        label: "Accessible response label",
        placement: { sheet: { section: "scoring" } },
      },
      {
        kind: "number",
        name: "points",
        label: "Points",
        min: 0,
        step: 1,
        placement: { sheet: { section: "scoring" } },
      },
    ],
  }),
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "single-select",
      experience: {
        submit: true,
        attempts: true,
        hints: false,
        showAnswer: true,
        summaryFeedback: false,
        perItemFeedback: false,
      },
      response: mcqResponseCodec,
      projection: {
        projectInteraction: () => ({
          kind: "single-select",
          options: [{ id: "a", label: "A" }],
        }),
        projectAssessment: () => ({
          kind: "single-select",
          correctOptionId: "a",
          feedbackByOptionId: {},
        }),
        projectLearnerNode: (node) => node,
      },
    }),
  },
});
const quizTestBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  testAssessmentQuestionDefinition,
]);

const publishInteractionOwnerSnapshot = (
  state: Parameters<typeof publishInteractionOwnerSnapshotWithLookup>[0],
  facade: Parameters<typeof publishInteractionOwnerSnapshotWithLookup>[1],
) =>
  publishInteractionOwnerSnapshotWithLookup(state, facade, {
    blockDefinitions: quizTestBlockRegistry,
  });

const resolveBlockChromeTargetDescriptor = (
  state: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup>[0],
  target: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup>[1],
) => resolveBlockChromeTargetDescriptorWithLookup(state, target, quizTestBlockRegistry);

const createInteractionOwnerCommandPorts = (
  view: Parameters<typeof createInteractionOwnerCommandPortsWithLookup>[0],
) => createInteractionOwnerCommandPortsWithLookup(view, quizTestBlockRegistry);

describe("quiz block skeleton", () => {
  it("declares a course block that contains assessment question children", () => {
    expect(QuizNode.config.group).toBe(`block ${COURSE_BLOCK_CONTENT}`);
    expect(QuizNode.config.content).toBe(`${ASSESSMENT_QUESTION_CONTENT}*`);
  });

  it("registers quiz as a stable-id block", () => {
    expect(builtInBlockRegistry.stableIdNodeTypes).toContain("quiz");
    expect(
      createAuthoringBlockExtensions(builtInBlockRegistry).map((extension) => extension.name),
    ).toContain("quiz_authoring_bundle");
  });

  it("registers quiz as a staged fill host for assessment questions", () => {
    expect(builtInBlockRegistry.getByNodeType("quiz")).toMatchObject({
      boundedPlacement: "fill",
      stagedBoundedHost: {
        childGroup: ASSESSMENT_QUESTION_CONTENT,
      },
    });
  });

  it("resolves portable quiz child definitions from an explicit registry", () => {
    const nodeType = "isolated_portable_quiz_child";
    const registry = createBlockRegistry([defineBlock({ nodeType })]);
    const schema = new ProseMirrorSchema({
      nodes: {
        doc: { content: "quiz" },
        quiz: { content: `${nodeType}+` },
        [nodeType]: { atom: true },
        text: { group: "inline" },
      },
    });
    const quiz = schema.node("quiz", null, [schema.node(nodeType)]);
    expect(
      getQuizChildBlock({
        blockDefinitions: registry,
        getPos: () => 0,
        index: 0,
        node: quiz,
      }),
    ).toMatchObject({
      definition: registry.getByNodeType(nodeType),
      nodeType,
      pos: 1,
    });
  });

  it.each([
    ["region", "region"],
    ["fill grid cell", "grid"],
    ["fill tabs section", "tabs"],
  ] as const)(
    "fills Quiz and its question stage inside a bounded %s",
    async (_label, placement) => {
      const editor = createQuizEditor({
        editable: true,
        content: quizMcqDocument("quiz-bounded", {
          placement,
          questionIds: ["question-a", "question-b"],
        }),
      });

      renderEditor(editor);
      await screen.findByTestId("quiz-stage-viewport");

      const quizFrame = findBlockFrame("quiz-bounded", true);
      const firstQuestionFrame = findBlockFrame("question-a", true);
      const secondQuestionFrame = findBlockFrame("question-b", true);

      expect(quizFrame?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(firstQuestionFrame?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(secondQuestionFrame?.getAttribute("data-bounded-placement")).toBe("fill");
      expect(
        screen
          .getByTestId("quiz-stage-viewport")
          .closest("[data-quiz-view-id]")
          ?.getAttribute("data-active-question-id"),
      ).toBe("question-a");

      editor.destroy();
    },
  );

  it("keeps Quiz and its question stage at natural height in flow placement", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: quizMcqDocument("quiz-flow", {
        placement: "flow",
        questionIds: ["question-a"],
      }),
    });

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-viewport");

    expect(findBlockFrame("quiz-flow", true)?.hasAttribute("data-bounded-placement")).toBe(false);
    expect(findBlockFrame("question-a", true)?.hasAttribute("data-bounded-placement")).toBe(false);

    editor.destroy();
  });

  it("uses the active assessment response lane as the only bounded scroll owner", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: quizMcqDocument("quiz-scroll-owner", {
        placement: "region",
        questionIds: ["question-a"],
      }),
    });

    renderEditor(editor);
    const stage = await screen.findByTestId("quiz-stage-viewport");
    const quizFrame = findBlockFrame("quiz-scroll-owner", true);
    const questionFrame = findBlockFrame("question-a", true);
    const shell = questionFrame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const lanes = questionFrame?.querySelectorAll<HTMLElement>("[data-assessment-bounded-scroll]");

    expect(quizFrame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(stage.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(lanes).toHaveLength(1);

    editor.destroy();
  });

  it("renders bounded review in required order with one question response lane", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-bounded-review": {
          attemptId: "attempt-bounded-review",
          status: "completed",
          currentTargetId: null,
          score: 1,
          maxScore: 2,
          answerReviewAuthorized: true,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: quizMcqDocument("quiz-bounded-review", {
        placement: "region",
        questionIds: ["question-a", "question-b"],
      }),
    });

    renderWithRuntime(editor);

    const context = await screen.findByTestId("quiz-answer-review-context");
    const completion = screen.getByTestId("quiz-completion-summary");
    const stage = screen.getByTestId("quiz-stage-viewport");
    const controls = screen.getByTestId("quiz-answer-review-controls");
    const container = context.parentElement;
    const quizFrame = findBlockFrame("quiz-bounded-review", false);
    const activeQuestionFrame = findBlockFrame("question-a", false);
    const children = [...(container?.children ?? [])];

    expect(quizFrame?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(activeQuestionFrame?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(children.indexOf(completion)).toBeLessThan(children.indexOf(context));
    expect(children.indexOf(context)).toBeLessThan(children.indexOf(stage));
    expect(children.indexOf(stage)).toBeLessThan(children.indexOf(controls));
    expect(activeQuestionFrame?.querySelectorAll("[data-assessment-bounded-scroll]")).toHaveLength(
      1,
    );
    expect(stage.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(controls.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("keeps completed review in document order outside bounded placement", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-flow-review": {
          attemptId: "attempt-flow-review",
          status: "completed",
          currentTargetId: null,
          score: 1,
          maxScore: 2,
          answerReviewAuthorized: true,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: quizMcqDocument("quiz-flow-review", {
        placement: "flow",
        questionIds: ["question-a", "question-b"],
      }),
    });

    renderWithRuntime(editor);

    const context = await screen.findByTestId("quiz-answer-review-context");
    const completion = screen.getByTestId("quiz-completion-summary");
    const stage = screen.getByTestId("quiz-stage-viewport");
    const controls = screen.getByTestId("quiz-answer-review-controls");
    const container = context.parentElement;
    const children = [...(container?.children ?? [])];

    expect(findBlockFrame("quiz-flow-review", false)?.hasAttribute("data-bounded-placement")).toBe(
      false,
    );
    expect(children.indexOf(completion)).toBeLessThan(children.indexOf(context));
    expect(children.indexOf(context)).toBeLessThan(children.indexOf(stage));
    expect(children.indexOf(stage)).toBeLessThan(children.indexOf(controls));

    editor.destroy();
  });

  it.each([
    ["bounded", "region", true],
    ["flow", "flow", false],
  ] as const)(
    "keeps the first-question picker local to Quiz in %s placement",
    async (_, placement, bounded) => {
      const quizId = `quiz-empty-${placement}`;
      const editor = createQuizEditor({
        editable: true,
        content: quizMcqDocument(quizId, {
          placement,
          questionIds: [],
        }),
      });

      renderEditor(editor);

      const picker = await screen.findByTestId("quiz-add-question-stage");
      const stage = screen.getByTestId("quiz-stage-viewport");
      expect(findBlockFrame(quizId, true)?.hasAttribute("data-bounded-placement")).toBe(bounded);
      expect(picker.parentElement).toBe(stage.parentElement);
      expect(picker.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
      expect(stage.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

      editor.destroy();
    },
  );

  it("creates empty quiz insert catalog content", () => {
    const quiz = builtInInsertCatalog.actions.find((item) => item.nodeType === "quiz");

    expect(quiz).toBeDefined();
    expect(quiz?.category).toBe("assessment");
    expect(quiz?.content()).toMatchObject({
      type: "quiz",
      attrs: {
        settings: {
          allowBacktracking: true,
          reviewTiming: "after_quiz",
          reviewDetail: "result_only",
          attemptsPerQuestion: 1,
          isGraded: true,
          timer: {
            enabled: false,
            durationSeconds: 0,
          },
        },
      },
    });
    expect(quiz?.content().content).toBeUndefined();
  });

  it("renders an inert node view shell without crashing", () => {
    const editor = new Editor({
      editable: true,
      content: {
        type: "doc",
        content: [{ type: "quiz" }],
      },
      extensions: [StarterKit.configure({ undoRedo: false }), TestAssessmentQuestionNode, QuizNode],
    });

    expect(editor.state.doc.firstChild?.type.name).toBe("quiz");

    editor.destroy();
  });

  it("renders an empty authoring add-question stage without inserting child content", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [{ type: "quiz" }],
      },
    });

    renderEditor(editor);

    expect(
      (await screen.findByTestId("quiz-add-question-stage")).getAttribute("contenteditable"),
    ).toBe("false");
    expect(screen.getByText("Pick a question type")).toBeInTheDocument();
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "quiz" }],
    });

    editor.destroy();
  });

  it("renders an empty runtime quiz as incomplete without crashing", async () => {
    const editor = createQuizEditor({
      editable: false,
      content: {
        type: "doc",
        content: [{ type: "quiz" }],
      },
    });

    renderEditor(editor);

    expect(
      (await screen.findByTestId("quiz-runtime-incomplete")).getAttribute("contenteditable"),
    ).toBe("false");
    expect(screen.getByText("This quiz is incomplete.")).toBeInTheDocument();

    editor.destroy();
  });

  it("shows a start state for a valid runtime quiz before the attempt starts", async () => {
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-start"),
    });

    renderWithRuntime(editor);

    expect(await screen.findByRole("button", { name: "Start quiz" })).toBeInTheDocument();
    expect(screen.queryByTestId("quiz-runtime-incomplete")).toBeNull();
    const quizShell = screen
      .getByTestId("quiz-stage-viewport")
      .closest("[data-quiz-view-id]") as HTMLElement | null;
    expect(quizShell?.getAttribute("data-quiz-status")).toBe("not_started");
    expect(quizShell?.getAttribute("data-active-question-id")).toBeNull();

    editor.destroy();
  });

  it("starts a runtime quiz attempt and shows the first returned question", async () => {
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-start-action"),
    });
    const port = quizPort({
      startAttempt: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: "attempt-started",
            groupId: args.groupId,
            currentTargetId: "question-a",
          }),
        ),
    });

    renderWithRuntime(editor, port);

    fireEvent.click(await screen.findByRole("button", { name: "Start quiz" }));

    await waitFor(() => {
      const quizShell = screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]") as HTMLElement | null;
      expect(quizShell?.getAttribute("data-quiz-status")).toBe("in_progress");
      expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-a");
    });
    editor.destroy();
  });

  it("resumes an in-progress runtime quiz at the stored current question", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-resume": {
          attemptId: "attempt-resume",
          status: "in_progress",
          currentTargetId: "question-b",
          submittedTargetIds: ["question-a"],
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-resume"),
    });

    renderWithRuntime(editor);

    await waitFor(() => {
      const quizShell = screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]") as HTMLElement | null;
      expect(quizShell?.getAttribute("data-quiz-status")).toBe("in_progress");
      expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-b");
    });
    expect(screen.queryByRole("button", { name: "Start quiz" })).toBeNull();

    editor.destroy();
  });

  it("enables after-quiz next only after the current question has a response", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-reviewable-nav": {
          attemptId: "attempt-reviewable",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-reviewable-nav"),
    });

    renderWithRuntime(editor);

    await waitFor(() => {
      const quizShell = screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]") as HTMLElement | null;
      expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-a");
    });

    const next = screen.getByRole("button", { name: "Next question" });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Submit quiz" })).toBeNull();

    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(next);
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-a");

    editor.destroy();
  });

  it("resets the newly active question response lane to the top", async () => {
    const user = userEvent.setup();
    seedAssessmentStore({
      quizzes: {
        "quiz-scroll-reset": {
          attemptId: "attempt-scroll-reset",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: quizMcqDocument("quiz-scroll-reset", {
        placement: "region",
        questionIds: ["question-a", "question-b"],
      }),
    });

    renderWithRuntime(editor);
    const next = await screen.findByRole("button", { name: "Next question" });
    const firstQuestionFrame = findBlockFrame("question-a", false);
    const secondQuestionFrame = findBlockFrame("question-b", false);
    const firstLane = firstQuestionFrame?.querySelector<HTMLElement>(
      "[data-assessment-bounded-scroll]",
    );
    const secondLane = secondQuestionFrame?.querySelector<HTMLElement>(
      "[data-assessment-bounded-scroll]",
    );

    expect(firstQuestionFrame?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(secondQuestionFrame?.getAttribute("data-bounded-placement")).toBe("fill");
    expect(firstLane).not.toBeNull();
    expect(secondLane).not.toBeNull();
    if (!firstLane || !secondLane) throw new Error("Expected both question response lanes");
    firstLane.scrollTop = 48;
    secondLane.scrollTop = 96;

    act(() => {
      setAssessmentResponse("artifact:artifact-1/block:question-a", "selected");
    });
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
    await user.click(next);

    await waitFor(() => {
      expect(
        screen
          .getByTestId("quiz-stage-viewport")
          .closest("[data-quiz-view-id]")
          ?.getAttribute("data-active-question-id"),
      ).toBe("question-b");
      expect(firstLane.scrollTop).toBe(48);
      expect(secondLane.scrollTop).toBe(0);
    });

    editor.destroy();
  });

  it("leaves response lane scroll untouched when Quiz is in natural flow", async () => {
    const user = userEvent.setup();
    seedAssessmentStore({
      quizzes: {
        "quiz-flow-scroll": {
          attemptId: "attempt-flow-scroll",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: quizMcqDocument("quiz-flow-scroll", {
        placement: "flow",
        questionIds: ["question-a", "question-b"],
      }),
    });

    renderWithRuntime(editor);
    const next = await screen.findByRole("button", { name: "Next question" });
    const secondQuestionFrame = findBlockFrame("question-b", false);
    const secondLane = secondQuestionFrame?.querySelector<HTMLElement>(
      "[data-assessment-bounded-scroll]",
    );

    expect(secondQuestionFrame?.hasAttribute("data-bounded-placement")).toBe(false);
    expect(secondLane).not.toBeNull();
    if (!secondLane) throw new Error("Expected the second question response lane");
    secondLane.scrollTop = 96;

    act(() => {
      setAssessmentResponse("artifact:artifact-1/block:question-a", "selected");
    });
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
    await user.click(next);

    await waitFor(() => {
      expect(
        screen
          .getByTestId("quiz-stage-viewport")
          .closest("[data-quiz-view-id]")
          ?.getAttribute("data-active-question-id"),
      ).toBe("question-b");
      expect(secondLane.scrollTop).toBe(96);
    });

    editor.destroy();
  });

  it("hides after-quiz previous navigation when backtracking is disabled", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-no-backtracking": {
          attemptId: "attempt-after-quiz",
          status: "in_progress",
          currentTargetId: "question-b",
        },
      },
    });
    registerQuizQuestionProblem("problem-b", "question-b");
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-no-backtracking", {
        allowBacktracking: false,
      }),
    });

    renderWithRuntime(editor);

    await screen.findByRole("button", { name: "Submit quiz" });
    expect(screen.queryByRole("button", { name: "Previous question" })).toBeNull();

    editor.destroy();
  });

  it("blocks after-quiz submission until every question has a response", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-reviewable-finish": {
          attemptId: "attempt-reviewable",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    registerQuizQuestionProblem("problem-b", "question-b");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    let received: unknown = null;
    const port = quizPort({
      finishAttempt: async (args) => {
        received = args;
        return canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            status: "completed",
            currentTargetId: null,
            submittedTargetIds: ["question-a", "question-b"],
            resultsByTargetId: {
              "question-a": { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
              "question-b": { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
            },
          }),
        );
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-reviewable-finish"),
    });

    renderWithRuntime(editor, port);

    expect(screen.queryByRole("button", { name: "Submit quiz" })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Next question" }));
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    const finish = await screen.findByRole("button", { name: "Submit quiz" });
    expect((finish as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      setAssessmentResponse("problem-b", "b");
    });
    await waitFor(() => expect((finish as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(finish);

    await waitFor(() => {
      expect(received).toMatchObject({
        attemptId: "attempt-reviewable",
        groupId: "artifact:artifact-1/group:quiz-reviewable-finish",
        responsesByTargetId: {
          "question-a": { kind: "single-select", optionId: "a" },
          "question-b": { kind: "single-select", optionId: "b" },
        },
      });
    });
    expect(screen.queryByRole("button", { name: "Submit quiz" })).toBeNull();
    expect(assessmentProblem("problem-a")?.submitted).toBe(true);
    expect(assessmentProblem("problem-b")?.submitted).toBe(true);

    editor.destroy();
  });

  it("disables locked question submit until the current required response exists", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-locked-disabled": {
          attemptId: "attempt-locked",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-locked-disabled", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor);

    const submit = await screen.findByRole("button", { name: "Submit answer" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));

    editor.destroy();
  });

  it("requires a response before after-each-answer submission", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-after-each-disabled": {
          attemptId: "attempt-after-each",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-after-each-disabled", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor);

    const submit = await screen.findByRole("button", { name: "Submit answer" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));

    editor.destroy();
  });

  it("submits a locked question and pauses before the next port target", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-locked-advance": {
          attemptId: "attempt-locked",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    let received: unknown = null;
    const port = quizPort({
      submitQuestion: async (args) => {
        received = args;
        return canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            currentTargetId: "question-b",
            submittedTargetIds: ["question-a"],
            resultsByTargetId: {
              "question-a": { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
            },
          }),
        );
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-locked-advance", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor, port);

    const submitAnswer = await screen.findByRole("button", { name: "Submit answer" });
    await waitFor(() => expect((submitAnswer as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submitAnswer);

    await waitFor(() => {
      expect(received).toMatchObject({
        attemptId: "attempt-locked",
        groupId: "artifact:artifact-1/group:quiz-locked-advance",
        targetId: "question-a",
        response: { kind: "single-select", optionId: "a" },
      });
      const quizShell = screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]") as HTMLElement | null;
      expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-a");
    });
    expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    editor.destroy();
  });

  it("keeps after-each-answer learners on the submitted question for review before next", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-after-each-review-pause": {
          attemptId: "attempt-after-each",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    const port = quizPort({
      submitQuestion: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            currentTargetId: "question-b",
            submittedTargetIds: ["question-a"],
            resultsByTargetId: {
              "question-a": { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
            },
            answerReviewAuthorized: true,
          }),
        ),
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-after-each-review-pause", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor, port);

    fireEvent.click(await screen.findByRole("button", { name: "Submit answer" }));

    await waitFor(() => {
      expect(
        screen
          .getByTestId("quiz-stage-viewport")
          .closest("[data-quiz-view-id]")
          ?.getAttribute("data-active-question-id"),
      ).toBe("question-a");
    });
    expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    editor.destroy();
  });

  it("does not allow response edits after after-each-answer review appears", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-after-each-readonly": {
          attemptId: "attempt-after-each",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    const port = quizPort({
      submitQuestion: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            currentTargetId: "question-b",
            submittedTargetIds: ["question-a"],
            resultsByTargetId: {
              "question-a": { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
            },
            answerReviewAuthorized: true,
          }),
        ),
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-after-each-readonly", {
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor, port);

    fireEvent.click(await screen.findByRole("button", { name: "Submit answer" }));
    await screen.findByRole("button", { name: "Next question" });
    act(() => {
      setAssessmentResponse("problem-a", "b");
    });

    expect(assessmentProblem("problem-a")?.response).toEqual({
      choices: "a",
    });

    editor.destroy();
  });

  it("allows a retry when an incorrect per-question answer has attempts remaining", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-after-each-retry": {
          attemptId: "attempt-after-each",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    const submittedResponses: unknown[] = [];
    const port = quizPort({
      submitQuestion: async (args) => {
        submittedResponses.push(args.response);
        return canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            currentTargetId: submittedResponses.length === 1 ? "question-a" : "question-b",
            submittedTargetIds: ["question-a"],
            resultsByTargetId: {
              "question-a":
                submittedResponses.length === 1
                  ? { ...canonicalAssessmentResult, isCorrect: false, score: 0 }
                  : { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
            },
            answerReviewAuthorized: true,
          }),
        );
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-after-each-retry", {
        reviewTiming: "after_each_answer",
        attemptsPerQuestion: 2,
      }),
    });

    renderWithRuntime(editor, port);

    expect(
      scopedAssessmentStore?.getState().transient.responseReady[
        scopeAssessmentProblemId("artifact-1", "problem-a")
      ],
    ).toBe(true);

    const retrySubmit = await screen.findByRole("button", { name: "Submit answer" });
    await waitFor(() => expect((retrySubmit as HTMLButtonElement).disabled).toBe(false), {
      timeout: 500,
    });
    fireEvent.click(retrySubmit);

    await waitFor(() => expect(submittedResponses).toHaveLength(1), { timeout: 500 });
    expect(assessmentProblem("problem-a")).toMatchObject({
      attemptNumber: 1,
      submitted: false,
      response: { choices: "a" },
      checkResult: { isCorrect: false, score: 0 },
      submissionResult: null,
    });

    const retry = await screen.findByRole("button", { name: "Try again" }, { timeout: 500 });
    expect((retry as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      setAssessmentResponse("problem-a", "b");
    });

    expect(assessmentProblem("problem-a")).toMatchObject({
      attemptNumber: 1,
      submitted: false,
      response: { choices: "b" },
      submissionResult: null,
    });
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false), {
      timeout: 500,
    });

    fireEvent.click(retry);

    await waitFor(
      () => {
        expect(submittedResponses).toEqual([
          { kind: "single-select", optionId: "a" },
          { kind: "single-select", optionId: "b" },
        ]);
        expect(screen.getByRole("button", { name: "Next question" })).toBeInTheDocument();
      },
      { timeout: 500 },
    );
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-a");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    editor.destroy();
  });

  it("keeps locked learners on the current question when submit fails", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-locked-failure": {
          attemptId: "attempt-locked",
          status: "in_progress",
          currentTargetId: "question-a",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    const port = quizPort({
      submitQuestion: async () => {
        throw new Error("locked");
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-locked-failure", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor, port);

    fireEvent.click(await screen.findByRole("button", { name: "Submit answer" }));

    await waitFor(() => {
      const quizShell = screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]") as HTMLElement | null;
      expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-a");
    });

    editor.destroy();
  });

  it("does not expose direct previous or next navigation in locked progression", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-locked-nav": {
          attemptId: "attempt-locked",
          status: "in_progress",
          currentTargetId: "question-b",
          submittedTargetIds: ["question-a"],
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-locked-nav", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByRole("button", { name: "Submit answer" });
    expect(screen.queryByRole("button", { name: "Previous question" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next question" })).toBeNull();
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    editor.destroy();
  });

  it("shows aggregate score for completed quizzes when results are visible", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-results-visible": {
          attemptId: "attempt-results",
          status: "completed",
          currentTargetId: null,
          score: 1,
          maxScore: 2,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-results-visible"),
    });

    renderWithRuntime(editor);

    await screen.findByText("1 / 2");

    editor.destroy();
  });

  it("suppresses aggregate score for completed quizzes when results are hidden", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-results-hidden": {
          attemptId: "attempt-results",
          status: "completed",
          currentTargetId: null,
          score: 1,
          maxScore: 2,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-results-hidden", {
        reviewDetail: "none",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByText("Quiz complete");
    expect(screen.queryByText("1 / 2")).toBeNull();

    editor.destroy();
  });

  it("allows staged read-only answer review after completion when answers are visible", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-answer-review": {
          attemptId: "attempt-review",
          status: "completed",
          currentTargetId: null,
          score: 2,
          maxScore: 2,
          answerReviewAuthorized: true,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-answer-review", {
        reviewDetail: "full_review",
      }),
    });

    renderWithRuntime(editor);

    const controls = await screen.findByTestId("quiz-answer-review-controls");
    const reviewContext = await screen.findByTestId("quiz-answer-review-context");
    const completion = screen.getByTestId("quiz-completion-summary");
    const stage = screen.getByTestId("quiz-stage-viewport");
    const containerChildren = [...(reviewContext.parentElement?.children ?? [])];

    expect(reviewContext.textContent).toBe("Reviewing answersQuestion 1 of 2");
    expect(controls.textContent).not.toContain("Reviewing");
    expect(containerChildren.indexOf(completion)).toBeLessThan(
      containerChildren.indexOf(reviewContext),
    );
    expect(containerChildren.indexOf(reviewContext)).toBeLessThan(containerChildren.indexOf(stage));
    expect(stage.closest("[data-quiz-view-id]")?.getAttribute("data-active-question-id")).toBe(
      "question-a",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(reviewContext.textContent).toBe("Reviewing answersQuestion 2 of 2");
    expect(stage.closest("[data-quiz-view-id]")?.getAttribute("data-active-question-id")).toBe(
      "question-b",
    );

    editor.destroy();
  });

  it("requests host-authorized quiz answer reveal for completed answer review", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-host-reveal": {
          attemptId: "attempt-review",
          status: "completed",
          currentTargetId: null,
          score: 2,
          maxScore: 2,
        },
      },
    });
    let received: unknown = null;
    const port = quizPort({
      revealAnswers: async (args) => {
        received = args;
        return canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            status: "completed",
            currentTargetId: null,
            score: 2,
            maxScore: 2,
            answerReviewAuthorized: true,
          }),
        );
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-host-reveal", {
        reviewDetail: "full_review",
      }),
    });

    renderWithRuntime(editor, port);

    await waitFor(() => {
      expect(received).toEqual({
        attemptId: "attempt-review",
        groupId: "artifact:artifact-1/group:quiz-host-reveal",
      });
    });
    await screen.findByTestId("quiz-answer-review-controls");
    expect(assessmentQuiz("quiz-host-reveal")?.answerReviewAuthorized).toBe(true);

    editor.destroy();
  });

  it("allows staged result-only review after completion without answer reveal", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-result-only-review": {
          attemptId: "attempt-review",
          status: "completed",
          currentTargetId: null,
          score: 2,
          maxScore: 2,
          answerReviewAuthorized: true,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-result-only-review", {
        reviewDetail: "result_only",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByTestId("quiz-answer-review-controls");
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-a");

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe("question-b");

    editor.destroy();
  });

  it("does not expose child answer reveal controls in result-only quiz review", async () => {
    hydrateCompletedQuizMcqReview("quiz-result-only-child-review", {
      answerReviewAuthorized: true,
      reviewDetail: "result_only",
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizMcqDocument("quiz-result-only-child-review", {
        reviewDetail: "result_only",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByTestId("quiz-answer-review-controls");
    expect(answerRevealButtonLabel()).toBeNull();
    expect(choiceDescription("a")).toBe("Submitted answer, incorrect");
    expect(choiceDescription("b")).toBeNull();

    editor.destroy();
  });

  it("does not expose child answer reveal controls when quiz review is hidden", async () => {
    hydrateCompletedQuizMcqReview("quiz-hidden-child-review", {
      answerReviewAuthorized: false,
      reviewDetail: "none",
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizMcqDocument("quiz-hidden-child-review", {
        reviewDetail: "none",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByText("Quiz complete");
    expect(answerRevealButtonLabel()).toBeNull();
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBeNull();

    editor.destroy();
  });

  it("reveals child answers in full quiz review without exposing standalone controls", async () => {
    hydrateCompletedQuizMcqReview("quiz-full-child-review", {
      answerReviewAuthorized: true,
      reviewDetail: "full_review",
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizMcqDocument("quiz-full-child-review", {
        reviewDetail: "full_review",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByTestId("quiz-answer-review-controls");
    expect(answerRevealButtonLabel()).toBeNull();
    expect(choiceDescription("a")).toBe("Submitted answer, incorrect");
    expect(choiceDescription("b")).toBe("Correct answer");

    editor.destroy();
  });

  it("suppresses staged answer review when results are hidden even if answers are visible", async () => {
    seedAssessmentStore({
      quizzes: {
        "quiz-results-hidden-answer-visible": {
          attemptId: "attempt-review",
          status: "completed",
          currentTargetId: null,
          score: 2,
          maxScore: 2,
        },
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-results-hidden-answer-visible", {
        reviewDetail: "none",
      }),
    });

    renderWithRuntime(editor);

    await screen.findByText("Quiz complete");
    expect(screen.queryByText("2 / 2")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-review-controls")).toBeNull();
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBeNull();

    editor.destroy();
  });

  it("shows the locked timer only after a timed locked attempt starts", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-18T08:00:00.000Z").getTime());
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-timer-start", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
        timer: { enabled: true, durationSeconds: 2 },
      }),
    });
    const port = quizPort({
      startAttempt: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: "attempt-timer",
            groupId: args.groupId,
            currentTargetId: "question-a",
            expiresAt: "2026-06-18T08:00:02.000Z",
          }),
        ),
    });

    renderWithRuntime(editor, port);

    expect(screen.queryByTestId("quiz-timer")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Start quiz" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("quiz-timer").textContent).toBe("00:02");

    editor.destroy();
  });

  it("continues a started timer while an enclosing tab panel is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    seedAssessmentStore({
      quizzes: {
        "quiz-hidden-timer": {
          attemptId: "attempt-hidden-timer",
          status: "in_progress",
          currentTargetId: "question-a",
          expiresAt: "2026-06-18T08:00:05.000Z",
        },
      },
    });
    const port = quizPort();
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-hidden-timer", {
        timer: { enabled: true, durationSeconds: 5 },
      }),
    });
    const view = renderWithRuntime(editor, port);

    expect((await screen.findByTestId("quiz-timer")).textContent).toBe("00:05");
    view.rerender(runtimeQuizTree(editor, port, true));

    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    expect(screen.getByTestId("quiz-timer").textContent).toBe("00:04");

    editor.destroy();
  });

  it("submits the current locked timer response on expiry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    seedAssessmentStore({
      quizzes: {
        "quiz-timer-submit": {
          attemptId: "attempt-timer",
          status: "in_progress",
          currentTargetId: "question-a",
          expiresAt: "2026-06-18T08:00:01.000Z",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    act(() => {
      setAssessmentResponse("problem-a", "a");
    });
    const submitted: string[] = [];
    const port = quizPort({
      submitQuestion: async (args) => {
        submitted.push(args.targetId);
        return canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            status: "expired",
            currentTargetId: args.targetId,
            submittedTargetIds: [args.targetId],
          }),
        );
      },
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-timer-submit", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
        timer: { enabled: true, durationSeconds: 1 },
      }),
    });

    renderWithRuntime(editor, port);
    expect((await screen.findByTestId("quiz-timer")).textContent).toBe("00:01");

    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    expect(submitted).toEqual(["question-a"]);
    expect(assessmentQuiz("quiz-timer-submit")?.status).toBe("expired");

    editor.destroy();
  });

  it("expires a locked timed quiz without submitting an empty current response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    seedAssessmentStore({
      quizzes: {
        "quiz-timer-empty": {
          attemptId: "attempt-timer",
          status: "in_progress",
          currentTargetId: "question-a",
          expiresAt: "2026-06-18T08:00:01.000Z",
        },
      },
    });
    registerQuizQuestionProblem("problem-a", "question-a");
    const submitted: string[] = [];
    const port = quizPort({
      submitQuestion: async (args) => {
        submitted.push(args.targetId);
        return canonicalQuizOutcome(attemptState({ status: "expired" }));
      },
      finishAttempt: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            status: "expired",
            currentTargetId: null,
          }),
        ),
    });
    const editor = createQuizEditor({
      editable: false,
      content: runtimeQuizDocument("quiz-timer-empty", {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
        timer: { enabled: true, durationSeconds: 1 },
      }),
    });

    renderWithRuntime(editor, port);
    expect((await screen.findByTestId("quiz-timer")).textContent).toBe("00:01");

    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
    });

    expect(submitted).toEqual([]);
    expect(assessmentQuiz("quiz-timer-empty")?.status).toBe("expired");

    editor.destroy();
  });

  it("lists only assessment question catalog entries in an empty quiz", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [{ type: "quiz" }],
      },
    });

    renderEditor(editor);
    await screen.findByTestId("quiz-add-question-stage");

    expect(screen.queryByRole("button", { name: /Multiple choice/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quiz" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Callout" })).toBeNull();

    editor.destroy();
  });

  it("inserts an MCQ catalog item as a direct quiz child", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [{ type: "quiz" }],
      },
    });

    renderEditor(editor);
    await screen.findByTestId("quiz-add-question-stage");

    const mcqButton = screen.queryByRole("button", { name: /Multiple choice/ });
    expect(mcqButton).toBeInTheDocument();
    if (!mcqButton) throw new Error("Multiple choice add option did not render");

    fireEvent.click(mcqButton);

    const quiz = editor.getJSON().content?.[0];
    const child = quiz?.content?.[0];
    expect(child?.type).toBe("mcq");
    const childAttrs = child && "attrs" in child ? child.attrs : undefined;
    expect(typeof childAttrs?.["id"]).toBe("string");
    expect(childAttrs?.["frame"]).toMatchObject({ align: "start" });
    expect(quiz?.content).toHaveLength(1);

    editor.destroy();
  });

  it("inherits alignment from an existing sibling when adding a quiz question", async () => {
    const content = quizMcqDocument("quiz-aligned-question", {
      placement: "flow",
      questionIds: ["question-a"],
    });
    const firstQuestion = content.content?.[0]?.content?.[0];
    if (!firstQuestion) throw new Error("Expected an existing quiz question");
    firstQuestion.attrs = {
      ...firstQuestion.attrs,
      frame: { align: "end", widthMode: "fill", widthPercent: 100 },
    };
    const editor = createQuizEditor({ editable: true, content });

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");
    fireEvent.click(screen.getByTestId("quiz-strip-add"));

    const mcqButton = screen.queryByRole("button", { name: /Multiple choice/ });
    expect(mcqButton).toBeInTheDocument();
    if (!mcqButton) throw new Error("Multiple choice add option did not render");
    fireEvent.click(mcqButton);

    const inserted = editor.getJSON().content?.[0]?.content?.[1];
    const insertedAttrs = inserted && "attrs" in inserted ? inserted.attrs : undefined;
    expect(insertedAttrs?.["frame"]).toMatchObject({ align: "end" });
    const insertedId = insertedAttrs?.["id"];
    expect(
      screen
        .getByTestId("quiz-stage-viewport")
        .closest("[data-quiz-view-id]")
        ?.getAttribute("data-active-question-id"),
    ).toBe(insertedId);

    editor.destroy();
  });

  it("undoes an aligned quiz question insertion as one authored change", async () => {
    const content = quizMcqDocument("quiz-undo-question", {
      placement: "flow",
      questionIds: ["question-a"],
    });
    const editor = createQuizEditor({ editable: true, content, undoRedo: true });

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");
    const beforeQuiz = editor.getJSON().content?.[0];
    fireEvent.click(screen.getByTestId("quiz-strip-add"));

    const mcqButton = screen.queryByRole("button", { name: /Multiple choice/ });
    expect(mcqButton).toBeInTheDocument();
    if (!mcqButton) throw new Error("Multiple choice add option did not render");
    fireEvent.click(mcqButton);

    expect(editor.getJSON().content?.[0]?.content).toHaveLength(2);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON().content?.[0]).toEqual(beforeQuiz);
    expect(editor.commands.undo()).toBe(false);

    editor.destroy();
  });

  it("marks the strip add-question popover as editor floating authoring chrome", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            content: [{ type: "test_assessment_question", attrs: { id: "question-a" } }],
          },
        ],
      },
    });

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");

    fireEvent.click(screen.getByTestId("quiz-strip-add"));

    const title = await screen.findByText("Pick a question type");
    const popover = title.closest(`[${AUTHORING_CHROME_ATTR}]`);
    expect(popover?.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);

    const mcqButton = screen.queryByRole("button", { name: /Multiple choice/ });
    expect(mcqButton).toBeInTheDocument();
    if (!mcqButton) throw new Error("Multiple choice add option did not render");

    fireEvent.click(mcqButton);

    const quiz = editor.getJSON().content?.[0];
    expect(quiz?.content).toHaveLength(2);
    expect(quiz?.content?.[1]?.type).toBe("mcq");

    editor.destroy();
  });

  it("keeps one active child stage selectable without changing document order", async () => {
    const user = userEvent.setup();
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            content: [
              { type: "test_assessment_question", attrs: { id: "question-a" } },
              { type: "test_assessment_question", attrs: { id: "question-b" } },
            ],
          },
        ],
      },
    });

    renderEditor(editor);
    await waitFor(
      () => {
        if (!screen.queryByTestId("quiz-stage-selector")) {
          throw new Error("quiz stage selector did not render");
        }
      },
      { timeout: 1000 },
    );

    const viewport = screen.queryByTestId("quiz-stage-viewport");
    expect(viewport).toBeInTheDocument();
    if (!viewport) return;
    const quizShell = viewport.closest("[data-quiz-view-id]") as HTMLElement | null;
    expect(quizShell).toBeInTheDocument();
    if (!quizShell) return;
    expect(screen.getByRole("button", { name: "Question 1" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(quizShell.getAttribute("data-active-question-index")).toBe("0");

    await user.click(screen.getByRole("button", { name: "Question 2" }));

    expect(screen.getByRole("button", { name: "Question 2" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(quizShell.getAttribute("data-active-question-index")).toBe("1");
    expect(editor.getJSON().content?.[0]?.content?.map((child) => child.type)).toEqual([
      "test_assessment_question",
      "test_assessment_question",
    ]);

    editor.destroy();
  });

  it("reorders questions from the strip and preserves projected target order", async () => {
    const content = quizMcqDocument("quiz-reorder", {
      placement: "flow",
      questionIds: ["question-a", "question-b"],
    });
    const firstQuestion = content.content?.[0]?.content?.[0];
    const secondQuestion = content.content?.[0]?.content?.[1];
    if (!firstQuestion || !secondQuestion) throw new Error("Expected two quiz questions");
    firstQuestion.attrs = {
      ...firstQuestion.attrs,
      frame: { align: "end", widthMode: "fill" },
    };
    secondQuestion.attrs = {
      ...secondQuestion.attrs,
      frame: { align: "center", widthMode: "fill" },
    };
    const editor = createQuizEditor({
      editable: true,
      content,
    });

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");

    const options = screen.getByRole("button", { name: "Question 2 options" });
    fireEvent.pointerDown(options);
    fireEvent.mouseDown(options);
    fireEvent.click(options);
    const moveEarlier = await screen.findByText("Move earlier", {}, { timeout: 1000 });
    fireEvent.click(moveEarlier);

    const quiz = editor.getJSON().content?.[0];
    expect(
      quiz?.content?.map((child) => ("attrs" in child ? child.attrs?.["id"] : undefined)),
    ).toEqual(["question-b", "question-a"]);
    const quizShell = screen
      .getByTestId("quiz-stage-viewport")
      .closest("[data-quiz-view-id]") as HTMLElement | null;
    expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-b");
    expect(projectAssessmentDocument(editor.getJSON()).groups[0]?.targetIds).toEqual([
      "question-b",
      "question-a",
    ]);
    expect(
      quiz?.content?.map((child) => ("attrs" in child ? child.attrs?.["frame"] : undefined)),
    ).toEqual([
      expect.objectContaining({ align: "center" }),
      expect.objectContaining({ align: "end" }),
    ]);

    editor.destroy();
  });

  it("opens active question settings from Quiz chrome while Quiz remains selected", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            attrs: { id: "quiz-question-settings" },
            content: [
              { type: "test_assessment_question", attrs: { id: "question-a" } },
              { type: "test_assessment_question", attrs: { id: "question-b" } },
            ],
          },
        ],
      },
    });
    const childPos = findNodePosition(editor, "test_assessment_question", "question-a");

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );
    const selectionOwnerBefore = publishInteractionOwnerSnapshot(editor.state, null).owners
      .selectionOwner.target;
    const quizDescriptorBefore = resolveBlockChromeTargetDescriptor(
      editor.state,
      selectionOwnerBefore,
    );
    expect(quizDescriptorBefore?.nodeType).toBe("quiz");
    expect(quizDescriptorBefore?.blockId).toBe("quiz-question-settings");
    const quizSurface = resolveAuthoringFrameElement(document.body, {
      frameKind: AuthoringFrameKind.Block,
      id: "quiz-question-settings",
    });
    expect(quizSurface?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("block");
    expect(quizSurface?.getAttribute("data-node")).toBe("quiz");
    expect(quizSurface?.getAttribute("data-id")).toBe("quiz-question-settings");

    const settingsButton = screen.queryByRole("button", {
      name: "Question settings",
    });
    expect(Boolean(settingsButton)).toBe(true);
    if (!settingsButton) return;

    fireEvent.click(settingsButton);

    const settingsOwner = interactionOwnerPluginKey.getState(editor.state)?.settingsOwner;
    expect(settingsOwner).toMatchObject({
      id: "question-a",
      kind: InteractionTargetKind.Block,
      pos: childPos,
    });
    const questionDescriptor = resolveBlockChromeTargetDescriptor(editor.state, settingsOwner);
    expect(questionDescriptor?.nodeType).toBe("test_assessment_question");

    const selectionOwnerAfter = publishInteractionOwnerSnapshot(editor.state, null).owners
      .selectionOwner.target;
    const quizDescriptorAfter = resolveBlockChromeTargetDescriptor(
      editor.state,
      selectionOwnerAfter,
    );
    expect(quizDescriptorAfter?.nodeType).toBe("quiz");
    expect(quizDescriptorAfter?.blockId).toBe("quiz-question-settings");

    editor.destroy();
  });

  it("duplicates only the active question from Quiz chrome", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            attrs: { id: "quiz-duplicate-question" },
            content: [
              { type: "test_assessment_question", attrs: { id: "question-a" } },
              { type: "test_assessment_question", attrs: { id: "question-b" } },
            ],
          },
        ],
      },
    });

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");

    const duplicateButton = screen.queryByRole("button", {
      name: "Duplicate question",
    });
    expect(Boolean(duplicateButton)).toBe(true);
    if (!duplicateButton) return;

    fireEvent.click(duplicateButton);

    const quiz = editor.getJSON().content?.[0];
    const childIds = quiz?.content?.map((child) =>
      "attrs" in child ? child.attrs?.["id"] : undefined,
    );
    expect(quiz?.type).toBe("quiz");
    expect(childIds).toHaveLength(3);
    expect(childIds?.[0]).toBe("question-a");
    expect(childIds?.[1]).not.toBe("question-a");
    expect(childIds?.[2]).toBe("question-b");

    editor.destroy();
  });

  it("deletes only the active question from Quiz chrome against a disposable editor fixture", async () => {
    const fixture = createDisposableQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            attrs: { id: "quiz-delete-question" },
            content: [
              { type: "test_assessment_question", attrs: { id: "question-a" } },
              { type: "test_assessment_question", attrs: { id: "question-b" } },
            ],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Keep after quiz" }],
          },
        ],
      },
    });
    const { editor } = fixture;

    renderEditor(editor);
    await screen.findByTestId("quiz-stage-selector");
    fireEvent.click(screen.getByRole("button", { name: "Question 2" }));

    const deleteButton = screen.queryByRole("button", {
      name: "Delete question",
    });
    expect(Boolean(deleteButton)).toBe(true);
    if (!deleteButton) return;

    fireEvent.click(deleteButton);

    const quiz = editor.getJSON().content?.[0];
    expect(fixture.topLevelNodeTypes()).toEqual(["quiz", "paragraph"]);
    expect(editor.state.doc.textContent).toContain("Keep after quiz");
    expect(quiz?.type).toBe("quiz");
    expect(
      quiz?.content?.map((child) => ("attrs" in child ? child.attrs?.["id"] : undefined)),
    ).toEqual(["question-a"]);
    const quizShell = screen
      .getByTestId("quiz-stage-viewport")
      .closest("[data-quiz-view-id]") as HTMLElement | null;
    expect(quizShell?.getAttribute("data-active-question-id")).toBe("question-a");

    fixture.destroy();
  });

  it("opens active question settings from Quiz chrome with managed fields disabled", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            attrs: { id: "quiz-child-settings-flow" },
            content: [
              {
                type: "test_assessment_question",
                attrs: {
                  id: "question-a",
                  settings: {
                    feedbackMode: "on_submit",
                    isGraded: true,
                    showAnswer: true,
                    points: 1,
                    maxAttempts: 2,
                    legend: "Question response",
                  },
                },
              },
            ],
          },
        ],
      },
    });

    render(
      <>
        <EditorContent editor={editor} />
        <InteractionProvider store={getQuizEditorFacadeStore(editor)}>
          <InteractionSettingsSheetHost
            blockDefinitions={quizTestBlockRegistry}
            editor={editor}
            surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
          />
        </InteractionProvider>
      </>,
    );
    await screen.findByTestId("quiz-stage-selector");

    fireEvent.click(screen.getByRole("button", { name: "Question settings" }));

    expect(screen.getByText("Test quiz assessment question settings")).toBeInTheDocument();
    expect(screen.queryAllByText("Managed by quiz").length).toBeGreaterThan(0);
    const feedbackMode = screen.queryByLabelText("Feedback mode") as HTMLSelectElement | null;
    const maxAttempts = screen.queryByLabelText("Max attempts") as HTMLInputElement | null;
    const showAnswer = screen.queryByRole("checkbox", {
      name: "Show answer",
    }) as HTMLButtonElement | null;
    const graded = screen.queryByRole("checkbox", {
      name: "Graded",
    }) as HTMLButtonElement | null;
    const points = screen.queryByLabelText("Points") as HTMLInputElement | null;
    const legend = screen.queryByLabelText("Accessible response label") as HTMLInputElement | null;

    expect(feedbackMode?.disabled).toBe(true);
    expect(maxAttempts?.disabled).toBe(true);
    expect(showAnswer?.disabled).toBe(true);
    expect(graded?.disabled).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "Required" })).toBeNull();
    expect(points?.disabled).toBe(false);
    expect(legend?.disabled).toBe(false);

    const childSheet = quizTestBlockRegistry.getByNodeType(
      "test_assessment_question",
    )?.settingsSheet;
    expect(childSheet).toBeDefined();
    if (!childSheet) return;
    expect(
      applySettingsSheetSettings({
        schema: childSheet.schema,
        attr: childSheet.attr,
        target: createAuthoringNodeTarget(editor, {
          id: "question-a",
          nodeType: "test_assessment_question",
        }),
        values: {
          ...firstQuizChildSettings(editor),
          points: 4,
          legend: "Updated response label",
        },
      }),
    ).toEqual({ ok: true });

    const settings = firstQuizChildSettings(editor);
    expect(settings).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 4,
      maxAttempts: 2,
      legend: "Updated response label",
    });
    expect(Object.hasOwn(settings, "inQuiz")).toBe(false);
    expect(Object.hasOwn(settings, "disabledByQuiz")).toBe(false);

    editor.destroy();
  });

  it("keeps Quiz settings targeted to Quiz instead of the active question", async () => {
    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            attrs: { id: "quiz-settings-target" },
            content: [{ type: "test_assessment_question", attrs: { id: "question-a" } }],
          },
        ],
      },
    });
    const childPos = findNodePosition(editor, "test_assessment_question", "question-a");

    render(
      <>
        <EditorContent editor={editor} />
        <InteractionProvider store={getQuizEditorFacadeStore(editor)}>
          <InteractionSettingsSheetHost
            blockDefinitions={quizTestBlockRegistry}
            editor={editor}
            surfaceAuthoringChrome={builtInSurfaceAuthoringChromeResolver}
          />
        </InteractionProvider>
      </>,
    );
    await screen.findByTestId("quiz-stage-selector");

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );
    const quizOwnerTarget = publishInteractionOwnerSnapshot(editor.state, null).owners
      .selectionOwner.target;
    expect(quizOwnerTarget).toMatchObject({
      id: "quiz-settings-target",
      kind: InteractionTargetKind.Block,
    });
    if (!quizOwnerTarget) return;

    createInteractionOwnerCommandPorts(editor.view).openSettings(quizOwnerTarget);

    await waitFor(() => {
      expect(Boolean(screen.queryByText("Quiz settings"))).toBe(true);
    });
    const settingsOwner = interactionOwnerPluginKey.getState(editor.state)?.settingsOwner;
    expect(settingsOwner?.id).toBe("quiz-settings-target");
    expect(resolveBlockChromeTargetDescriptor(editor.state, settingsOwner)?.nodeType).toBe("quiz");

    editor.destroy();
  });

  it("registers quiz settings controls through the configuration sheet pipeline", () => {
    const sheet = builtInBlockRegistry.getByNodeType("quiz")?.settingsSheet;

    expect(sheet).toMatchObject({
      attr: "settings",
      title: "Quiz settings",
      defaultOpenSections: ["behaviour"],
    });
    expect(
      sheet?.sections.flatMap((section) =>
        section.fields.map((field) => ({
          section: section.id,
          kind: field.kind,
          name: field.name,
          label: field.label,
          visibleWhen: field.visibleWhen,
        })),
      ),
    ).toMatchObject([
      {
        section: "behaviour",
        kind: "boolean",
        name: "allowBacktracking",
        label: "Allow backtracking",
      },
      {
        section: "behaviour",
        kind: "select",
        name: "reviewTiming",
        label: "Review timing",
      },
      {
        section: "behaviour",
        kind: "select",
        name: "reviewDetail",
        label: "Review detail",
      },
      {
        section: "behaviour",
        kind: "number",
        name: "attemptsPerQuestion",
        label: "Attempts per question",
        visibleWhen: { name: "reviewTiming", equals: "after_each_answer" },
      },
      {
        section: "scoring",
        kind: "boolean",
        name: "isGraded",
        label: "Graded",
      },
      {
        section: "timer",
        kind: "boolean",
        name: "timer.enabled",
        label: "Time limit",
      },
      {
        section: "timer",
        kind: "number",
        name: "timer.durationSeconds",
        label: "Duration",
      },
    ]);
  });

  it("saves dependent quiz settings through checked configuration writes", () => {
    const sheet = builtInBlockRegistry.getByNodeType("quiz")?.settingsSheet;
    expect(sheet).toBeDefined();
    if (!sheet) return;

    const editor = createQuizEditor({
      editable: true,
      content: {
        type: "doc",
        content: [
          {
            type: "quiz",
            attrs: {
              id: "quiz-settings",
              settings: {
                allowBacktracking: false,
                reviewTiming: "after_each_answer",
                reviewDetail: "result_only",
                attemptsPerQuestion: 1,
                isGraded: true,
                timer: { enabled: true, durationSeconds: 90 },
              },
            },
          },
        ],
      },
    });

    const result = applySettingsSheetSettings({
      schema: sheet.schema,
      attr: sheet.attr,
      target: createAuthoringNodeTarget(editor, {
        id: "quiz-settings",
        nodeType: "quiz",
      }),
      values: {
        allowBacktracking: true,
        reviewTiming: "after_quiz",
        reviewDetail: "none",
        attemptsPerQuestion: 1,
        isGraded: false,
        timer: { enabled: true, durationSeconds: 90 },
      },
    });

    expect(result).toEqual({ ok: true });
    expect(editor.getJSON().content?.[0]?.attrs?.["settings"]).toMatchObject({
      allowBacktracking: true,
      reviewTiming: "after_quiz",
      reviewDetail: "none",
      attemptsPerQuestion: 1,
      isGraded: false,
      timer: { enabled: true, durationSeconds: 90 },
    });

    editor.destroy();
  });
});

function createQuizEditor({
  editable,
  content,
  undoRedo = false,
}: {
  editable: boolean;
  content: JSONContent;
  undoRedo?: boolean;
}) {
  return createDisposableQuizEditor({ editable, content, undoRedo }).editor;
}

function getQuizEditorFacadeStore(editor: Editor) {
  return getInteractionFacadeStoreForEditor(editor);
}

function createDisposableQuizEditor({
  editable,
  content,
  undoRedo = false,
}: {
  editable: boolean;
  content: JSONContent;
  undoRedo?: boolean;
}) {
  const fixture = createDisposableEditor({
    editable,
    content,
    extensions: [
      StarterKit.configure({ undoRedo: undoRedo ? {} : false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension(["quiz", "mcq", "callout"]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      editable ? AssessmentHintNode : AssessmentHintRuntimeNode,
      editable ? AssessmentChoicesGroupNode : AssessmentChoicesGroupRuntimeNode,
      editable ? AssessmentHintsGroupNode : AssessmentHintsGroupRuntimeNode,
      editable ? AssessmentSummaryFeedbackNode : AssessmentSummaryFeedbackRuntimeNode,
      editable ? AssessmentActionsGroupNode : AssessmentActionsGroupRuntimeNode,
      SelectableChoiceBodyNode,
      editable ? SelectableChoiceAuthoringNode : SelectableChoiceRuntimeNode,
      createScaffoldInteractionOwnerExtension(quizTestBlockRegistry),
      TestRegionNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      TestAssessmentQuestionNode,
      CalloutAuthoringExtension,
      editable ? McqAuthoringExtension : McqRuntimeExtension,
      editable ? QuizAuthoringExtension : QuizRuntimeExtension,
    ],
  });
  return fixture;
}

function renderWithRuntime(editor: Editor, assessment: AssessmentPort = quizPort()) {
  return render(runtimeQuizTree(editor, assessment));
}

function renderEditor(editor: Editor) {
  return render(assessmentRuntimeTree(<EditorContent editor={editor} />, null));
}

function assessmentRuntimeTree(children: ReactNode, assessment: AssessmentPort | null) {
  return (
    <ScaffoldServicesProvider ports={{ assessment }}>
      <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
        <AssessmentRuntimeProvider>
          <ScopedAssessmentHarness />
          {children}
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

function runtimeQuizTree(editor: Editor, assessment: AssessmentPort, hidden = false) {
  return (
    <div hidden={hidden}>
      {assessmentRuntimeTree(<EditorContent editor={editor} />, assessment)}
    </div>
  );
}

type QuizTestPlacement = "flow" | "region" | "grid" | "tabs";

function quizMcqDocument(
  quizId: string,
  {
    placement,
    questionIds,
  }: {
    placement: QuizTestPlacement;
    questionIds: string[];
  },
): JSONContent {
  const quiz: JSONContent = {
    type: "quiz",
    attrs: {
      id: quizId,
      settings: quizSettings(),
    },
    content: questionIds.map(mcqQuestion),
  };

  const content =
    placement === "flow"
      ? [quiz]
      : placement === "region"
        ? [region([quiz])]
        : placement === "grid"
          ? [region([{ type: "grid", attrs: { id: "grid-a" }, content: [cell([quiz])] }])]
          : [
              region([
                {
                  type: "layout",
                  attrs: { id: "layout-tabs", variant: "tabs" },
                  content: [
                    {
                      type: "section",
                      attrs: { id: "section-tabs", role: "tab-panel" },
                      content: [quiz],
                    },
                  ],
                },
              ]),
            ];

  return { type: "doc", content };
}

function region(content: JSONContent[]): JSONContent {
  return {
    type: "region",
    attrs: { id: "region-a" },
    content,
  };
}

function cell(content: JSONContent[]): JSONContent {
  return {
    type: "cell",
    attrs: { id: "cell-a" },
    content,
  };
}

function mcqQuestion(id: string): JSONContent {
  const firstChoiceId = `${id}-a`;
  const secondChoiceId = `${id}-b`;

  return {
    type: "mcq",
    attrs: {
      id,
      assessment: {
        correctOptionId: firstChoiceId,
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
        legend: "Question response",
      },
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "assessment_choices_group",
        content: [selectableChoice(firstChoiceId), selectableChoice(secondChoiceId)],
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function selectableChoice(id: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

function findBlockFrame(id: string, editable: boolean): HTMLElement | null {
  const frameAttribute = editable ? "data-authoring-frame" : "data-runtime-frame";
  return document.body.querySelector<HTMLElement>(`[${frameAttribute}="block"][data-id="${id}"]`);
}

function runtimeQuizDocument(quizId: string, settings: Partial<QuizSettings> = {}): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "quiz",
        attrs: {
          id: quizId,
          settings: {
            ...quizSettings(),
            ...settings,
            timer: {
              ...quizSettings().timer,
              ...settings.timer,
            },
          },
        },
        content: [
          { type: "test_assessment_question", attrs: { id: "question-a" } },
          { type: "test_assessment_question", attrs: { id: "question-b" } },
        ],
      },
    ],
  };
}

function runtimeQuizMcqDocument(quizId: string, settings: Partial<QuizSettings> = {}): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "quiz",
        attrs: {
          id: quizId,
          settings: {
            ...quizSettings(),
            ...settings,
            timer: {
              ...quizSettings().timer,
              ...settings.timer,
            },
          },
        },
        content: [
          {
            type: "mcq",
            attrs: {
              id: "question-a",
              assessment: {
                correctOptionId: "b",
                feedbackByOptionId: {},
                summaryFeedback: null,
              },
              settings: {
                feedbackMode: "on_submit",
                isGraded: true,
                showAnswer: true,
                points: 1,
                maxAttempts: null,
                legend: "Question response",
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
                content: [
                  {
                    type: "selectable_choice",
                    attrs: { id: "a" },
                    content: [
                      {
                        type: "selectable_choice_body",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Alpha" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "selectable_choice",
                    attrs: { id: "b" },
                    content: [
                      {
                        type: "selectable_choice_body",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Beta" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              { type: "assessment_hints_group" },
              { type: "assessment_summary_feedback" },
            ],
          },
        ],
      },
    ],
  };
}

function hydrateCompletedQuizMcqReview(
  quizId: string,
  {
    answerReviewAuthorized,
  }: {
    answerReviewAuthorized: boolean;
    reviewDetail: QuizSettings["reviewDetail"];
  },
) {
  seedAssessmentStore({
    problems: {
      "artifact:artifact-1/block:question-a": {
        response: { choices: "a" },
        submitted: true,
        attemptNumber: 1,
        submissionResult: {
          isCorrect: false,
          score: 0,
          items: {
            a: { correct: false, expected: false, given: true },
            b: { correct: true, expected: true, given: false },
          },
        },
      },
    },
    quizzes: {
      [quizId]: {
        attemptId: "attempt-review",
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["question-a"],
        score: 0,
        maxScore: 1,
        answerReviewAuthorized,
        resultsByTargetId: {
          "question-a": {
            isCorrect: false,
            score: 0,
            items: {
              a: { correct: false, expected: false, given: true },
              b: { correct: true, expected: true, given: false },
            },
          },
        },
      },
    },
  });
}

function choiceDescription(choiceId: string): string | null {
  const choice = document.body.querySelector<HTMLInputElement>(`input[value="${choiceId}"]`);
  const describedBy = choice?.getAttribute("aria-describedby");
  if (!describedBy) return null;
  return describedBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function answerRevealButtonLabel(): string | null {
  return (
    document.body
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Show correct answer"], button[aria-label="Correct answer revealed"]',
      )
      ?.getAttribute("aria-label") ?? null
  );
}

function quizSettings(): QuizSettings {
  return {
    allowBacktracking: true,
    reviewTiming: "after_quiz",
    reviewDetail: "result_only",
    attemptsPerQuestion: 1,
    isGraded: true,
    timer: { enabled: false, durationSeconds: 0 },
  };
}

function attemptState(overrides: Partial<QuizAttemptState> = {}): QuizAttemptState {
  return QuizAttemptStateSchema.parse({
    attemptId: "attempt-1",
    groupId: "quiz-1",
    status: "in_progress",
    currentTargetId: "question-a",
    submittedTargetIds: [],
    startedAt: "2026-06-18T08:00:00.000Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    maxScore: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
    ...overrides,
  });
}

function quizPort(quiz: Partial<NonNullable<AssessmentPort["quiz"]>> = {}): AssessmentPort {
  return {
    type: "runtime",
    submit: async () =>
      assessmentProblemOutcome({ ...canonicalAssessmentResult, isCorrect: true, score: 1 }),
    quiz: {
      startAttempt: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            groupId: args.groupId,
            currentTargetId: "mcq-1",
          }),
        ),
      submitQuestion: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            currentTargetId: args.targetId,
            submittedTargetIds: [args.targetId],
          }),
        ),
      finishAttempt: async (args) =>
        canonicalQuizOutcome(
          attemptState({
            attemptId: args.attemptId,
            groupId: args.groupId,
            status: "completed",
            currentTargetId: null,
          }),
        ),
      ...quiz,
    },
  };
}

function canonicalQuizOutcome(quizAttempt: QuizAttemptState) {
  const state = scopedAssessmentStore?.getState();
  const quizRegistration = Object.values(state?.quizRegistrations ?? {}).find(
    (candidate) => candidate.groupId === quizAttempt.groupId,
  );
  const problemsByTargetId: Record<string, AssessmentProblemSnapshot> = {};
  for (const [targetId, result] of Object.entries(quizAttempt.resultsByTargetId)) {
    const problemRegistration = Object.values(state?.registrations ?? {}).find(
      (candidate) => candidate.targetId === targetId,
    );
    if (!problemRegistration) continue;
    const current = state?.durable.problems[problemRegistration.problemId] ?? emptyProblemState();
    const attemptNumber = current.attemptNumber + 1;
    const retryable =
      quizRegistration?.settings.reviewTiming === "after_each_answer" &&
      (quizRegistration?.settings.attemptsPerQuestion ?? 0) > attemptNumber &&
      quizAttempt.status === "in_progress" &&
      quizAttempt.currentTargetId === targetId &&
      !result.isCorrect;
    problemsByTargetId[targetId] = retryable
      ? {
          ...current,
          attemptNumber,
          checkResult: result,
          submitted: false,
          submissionResult: null,
        }
      : {
          ...current,
          attemptNumber,
          checkResult: result,
          submitted: true,
          submissionResult: result,
        };
  }
  return assessmentQuizOutcome(quizAttempt, problemsByTargetId);
}

function emptyProblemState(): AssessmentProblemSnapshot {
  return {
    response: null,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submitted: false,
    submissionResult: null,
  };
}

function registerQuizQuestionProblem(problemId: string, targetId: string) {
  const authoredProblemId = unscopedProblemId(problemId);
  const registration: AssessmentRegistrationInput = {
    problemId: authoredProblemId,
    targetId,
    interactionKind: "single-select",
    response: mcqResponseCodec,
    config: {
      experience: pageAssessmentExperience,
      settings: {
        feedbackMode: "on_submit" as const,
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
      },
      hintsTotal: 0,
    },
  };
  pendingRegistrations[authoredProblemId] = registration;
  scopedAssessmentStore?.getState().register(registration);
}

function setAssessmentResponse(problemId: string, choiceId: string) {
  const authoredProblemId = unscopedProblemId(problemId);
  const registration =
    scopedAssessmentStore?.getState().registrations[
      scopeAssessmentProblemId("artifact-1", authoredProblemId)
    ];
  if (registration && scopedAssessmentStore) {
    scopedAssessmentStore.getState().setLocalResponse(
      {
        problemId: authoredProblemId,
        targetId: registration.targetId,
        interactionKind: registration.interactionKind,
      },
      { choices: choiceId },
    );
    return;
  }
  const scopedId = scopeAssessmentProblemId("artifact-1", authoredProblemId);
  const current = pendingProblems[scopedId];
  pendingProblems[scopedId] = AssessmentProblemSnapshotSchema.parse({
    response: { kind: "single-select", optionId: choiceId },
    submitted: current?.submitted ?? false,
    attemptNumber: current?.attemptNumber ?? 0,
    hintsShown: current?.hintsShown ?? 0,
    checkResult: null,
    submissionResult: null,
  });
}

function assessmentProblem(problemId: string) {
  const snapshot =
    scopedAssessmentStore?.getState().durable.problems[
      scopeAssessmentProblemId("artifact-1", unscopedProblemId(problemId))
    ];
  if (!snapshot) return undefined;
  return {
    ...snapshot,
    response:
      snapshot.response?.kind === "single-select"
        ? { choices: snapshot.response.optionId }
        : snapshot.response,
  };
}

function assessmentQuiz(groupId: string) {
  return scopedAssessmentStore?.getState().durable.quizzes[
    scopeAssessmentGroupId("artifact-1", groupId)
  ];
}

function unscopedProblemId(problemId: string) {
  const prefix = "artifact:artifact-1/block:";
  return problemId.startsWith(prefix)
    ? decodeURIComponent(problemId.slice(prefix.length))
    : problemId;
}

function findNodePosition(editor: Editor, nodeType: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;

    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Node not found: ${nodeType}`);
  return found;
}

function firstQuizChildSettings(editor: Editor): Record<string, unknown> {
  const quiz = editor.getJSON().content?.[0];
  const child = quiz?.content?.[0];
  return (
    (child && "attrs" in child
      ? (child.attrs?.["settings"] as Record<string, unknown> | undefined)
      : undefined) ?? {}
  );
}
