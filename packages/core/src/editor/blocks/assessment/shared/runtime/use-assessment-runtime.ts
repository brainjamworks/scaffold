import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";
import type {
  AssessmentAnswerKey,
  AssessmentInteractionKind,
  AssessmentItemDetail,
  AssessmentProblemSnapshot,
  AssessmentResponseValue,
  AssessmentResult,
  AssessmentTargetSettings,
} from "@scaffold/contracts";

import {
  getBlockAttrSchema,
  type BlockAssessmentCapabilityDefinition,
  type BlockDefinition,
} from "@/editor/blocks/block-definition";

import { countAssessmentHints } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import type { AssessmentExperienceConfig } from "../model/assessment-capability";
import type { ProblemResponse } from "../model/assessment-response";
import {
  createPendingAssessmentInteractionRuntime,
  useAssessmentInteractionRuntime,
  type AssessmentInteractionRuntime,
} from "./assessment-interaction-runtime";
import {
  useAssessmentProblemFacadeById,
  type AssessmentProblemFacade,
} from "@/runtime/assessment/runtime-facade";
import {
  useAssessmentBlockSetup,
  type AssessmentBlockSetupConfig,
} from "./use-assessment-block-setup";

export type ChoiceMode = "single" | "multiple";

export interface AnswerReveal {
  answers: AssessmentAnswerKey;
}

export interface ProblemState extends AssessmentBlockSetupConfig {
  kind: AssessmentInteractionKind;
  choiceMode: ChoiceMode | null;
  maxSelect: number | null;
  groupName: string;
  legend: string;
  placeholder: string;
  response: ProblemResponse;
  submitted: boolean;
  attemptNumber: number;
  hintsShown: number;
  checkResult: AssessmentResult | null;
  submissionResult: AssessmentResult | null;
  revealedAnswer: AnswerReveal | null;
}

export interface ProblemScope {
  state: ProblemState;
  exhausted: boolean;
  canRetry: boolean;
  hasMoreHints: boolean;
  hasResponse: boolean;
  answerKeyVisible: boolean;
  canRevealAnswer: boolean;
  feedbackResult: AssessmentResult | null;
  officialResult: AssessmentResult | null;
  check: () => Promise<AssessmentResult | null>;
  submit: () => Promise<AssessmentResult | null>;
  reset: () => void;
  revealHint: () => void;
  revealAnswer: () => Promise<AnswerReveal | null>;
}

type SafeSchema<T> = {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
};

interface RuntimeAssessmentSettings {
  feedbackMode: "immediate" | "on_submit";
  isGraded: boolean;
  showAnswer: boolean;
  points: number;
  maxAttempts: number | null;
  maxSelect?: number | null;
}

interface UseAssessmentRuntimeArgs {
  definition: BlockDefinition;
  editor: Editor;
  getPos?: () => number | undefined;
  node: PMNode;
}

export interface AssessmentRuntimeProblemConfig extends AssessmentBlockSetupConfig {
  kind: AssessmentInteractionKind;
  choiceMode: ChoiceMode | null;
  maxSelect: number | null;
  groupName: string;
  legend: string;
  placeholder: string;
  experience: AssessmentExperienceConfig;
}

export interface AssessmentRuntimeController<
  K extends AssessmentInteractionKind = AssessmentInteractionKind,
> {
  problemId: string;
  problem: ProblemScope | null;
  hasUnsafeIdentity: boolean;
  problemConfig: AssessmentRuntimeProblemConfig;
  experience: BlockAssessmentCapabilityDefinition["experience"];
  interaction: AssessmentInteractionRuntime<K>;
  response: {
    value: ProblemResponse;
    setValue: (response: ProblemResponse) => void;
    projected: AssessmentResponseValue;
    hasValue: boolean;
  };
  actions: {
    check: () => Promise<AssessmentResult | null>;
    submit: () => Promise<AssessmentResult | null>;
    reset: () => void;
    revealHint: () => void;
    revealAnswer: () => Promise<AnswerReveal | null>;
  };
  feedback: {
    summary: AssessmentResult | null;
    items: Record<string, AssessmentItemDetail> | null;
  };
}

interface AssessmentRuntimeDefinition {
  assessment: BlockAssessmentCapabilityDefinition;
  settingsSchema: SafeSchema<RuntimeAssessmentSettings>;
}

const EMPTY_PROBLEM_RESPONSE: ProblemResponse = {};
const EMPTY_PROJECTED_RESPONSE: AssessmentResponseValue = {
  kind: "single-select",
  optionId: null,
};

export function useAssessmentRuntime({
  definition: blockDefinition,
  editor,
  getPos,
  node,
}: UseAssessmentRuntimeArgs): AssessmentRuntimeController {
  const nodeTypeName = node.type.name;
  const definition = useMemo(
    () => assessmentRuntimeDefinitionForBlock(blockDefinition, nodeTypeName),
    [blockDefinition, nodeTypeName],
  );
  const config = useMemo(() => createRuntimeProblemConfig(node, definition), [definition, node]);

  const setup = useAssessmentBlockSetup({
    config,
    editor,
    ...(getPos ? { getPos } : {}),
    node,
  });
  const runtime = useAssessmentRuntimeFacade({
    facade: setup.facade,
    fallbackConfig: config,
    hasUnsafeIdentity: setup.hasUnsafeIdentity,
    problemId: setup.problemId,
  });

  if (!runtime) {
    throw new Error("Assessment runtime could not build a parent runtime facade.");
  }

  return runtime;
}

export function useAssessmentRuntimeById(
  problemId: string | null | undefined,
): AssessmentRuntimeController | null;
export function useAssessmentRuntimeById<K extends AssessmentInteractionKind>(
  problemId: string | null | undefined,
  expectedKind: K,
): AssessmentRuntimeController<K> | null;
export function useAssessmentRuntimeById<K extends AssessmentInteractionKind>(
  problemId: string | null | undefined,
  expectedKind?: K,
): AssessmentRuntimeController<K> | null {
  const facade = useAssessmentProblemFacadeById(problemId, expectedKind);
  const runtime = useAssessmentRuntimeFacade<K>({
    facade,
    ...(expectedKind === undefined ? {} : { expectedKind }),
    hasUnsafeIdentity: false,
    problemId: facade.problemId ?? problemId ?? "",
  });

  return problemId ? runtime : null;
}

function useAssessmentRuntimeFacade<
  K extends AssessmentInteractionKind = AssessmentInteractionKind,
>({
  facade,
  expectedKind,
  fallbackConfig,
  hasUnsafeIdentity,
  problemId,
}: {
  facade: AssessmentProblemFacade;
  expectedKind?: K;
  fallbackConfig?: AssessmentRuntimeProblemConfig;
  hasUnsafeIdentity: boolean;
  problemId: string;
}): AssessmentRuntimeController<K> | null {
  const problemConfig = fallbackConfig ?? runtimeProblemConfigFromFacade(facade);
  const problem = useMemo(
    () => (problemConfig ? problemScopeFromFacade(facade, problemConfig) : null),
    [facade, problemConfig],
  );
  const interaction = useAssessmentInteractionRuntime(facade, problem, expectedKind);
  const fallbackInteraction = useMemo(
    () => (fallbackConfig ? createPendingAssessmentInteractionRuntime(fallbackConfig.kind) : null),
    [fallbackConfig],
  );
  const runtimeInteraction = (interaction ??
    fallbackInteraction) as AssessmentInteractionRuntime<K> | null;

  const responseValue = problem?.state.response ?? EMPTY_PROBLEM_RESPONSE;
  const responseCodec = problemConfig?.responseCodec;
  const projected = useMemo(
    () => responseCodec?.toContractResponse(responseValue) ?? EMPTY_PROJECTED_RESPONSE,
    [responseCodec, responseValue],
  );
  const feedbackSummary = problem?.officialResult ?? problem?.feedbackResult ?? null;

  return useMemo<AssessmentRuntimeController<K> | null>(() => {
    if (!problemConfig || !runtimeInteraction) return null;

    return {
      problemId,
      problem,
      hasUnsafeIdentity,
      problemConfig,
      experience: problem?.state.experience ?? problemConfig.experience,
      interaction: runtimeInteraction,
      response: {
        value: responseValue,
        setValue: (response: ProblemResponse) => {
          facade.actions.setLocalResponse(response);
        },
        projected,
        hasValue: responseCodec?.hasResponse(responseValue) ?? false,
      },
      actions: {
        check: () => problem?.check() ?? Promise.resolve(null),
        submit: () => problem?.submit() ?? Promise.resolve(null),
        reset: () => problem?.reset(),
        revealHint: () => problem?.revealHint(),
        revealAnswer: () => problem?.revealAnswer() ?? Promise.resolve(null),
      },
      feedback: {
        summary: feedbackSummary,
        items: feedbackSummary?.items ?? null,
      },
    };
  }, [
    feedbackSummary,
    facade.actions,
    hasUnsafeIdentity,
    problem,
    problemConfig,
    problemId,
    projected,
    responseValue,
    responseCodec,
    runtimeInteraction,
  ]);
}

function problemScopeFromFacade(
  facade: AssessmentProblemFacade,
  config: AssessmentRuntimeProblemConfig,
): ProblemScope | null {
  if (facade.status !== "registered") return null;
  const snapshot: AssessmentProblemSnapshot = facade.problem ?? {
    response: null,
    submitted: false,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submissionResult: null,
  };
  const response = isProblemResponse(facade.localResponse)
    ? facade.localResponse
    : EMPTY_PROBLEM_RESPONSE;
  const revealedAnswer = facade.revealedAnswer
    ? { answers: facade.revealedAnswer.answerKey }
    : null;
  const state: ProblemState = {
    ...config,
    response,
    submitted: snapshot.submitted,
    attemptNumber: snapshot.attemptNumber,
    hintsShown: snapshot.hintsShown,
    checkResult: snapshot.checkResult,
    submissionResult: snapshot.submissionResult,
    revealedAnswer,
  };
  const exhausted = config.maxAttempts !== null && snapshot.attemptNumber >= config.maxAttempts;
  const rawFeedbackResult = snapshot.checkResult ?? snapshot.submissionResult;
  const reviewPolicy = quizReviewPolicy(facade);
  const feedbackResult = reviewResultForPolicy(rawFeedbackResult, reviewPolicy);
  const officialResult = reviewResultForPolicy(snapshot.submissionResult, reviewPolicy);
  const answerKeyVisible =
    reviewPolicy.correctAnswersVisible &&
    ((config.feedbackMode === "immediate" && rawFeedbackResult !== null) ||
      (config.showAnswerEnabled && revealedAnswer !== null) ||
      Boolean(facade.quiz?.attempt?.answerReviewAuthorized && rawFeedbackResult));

  return {
    state,
    exhausted,
    canRetry: snapshot.submitted && !exhausted && snapshot.submissionResult?.isCorrect !== true,
    hasMoreHints: reviewPolicy.hintsVisible && snapshot.hintsShown < config.hintsTotal,
    hasResponse: facade.responseReady,
    answerKeyVisible,
    canRevealAnswer:
      reviewPolicy.correctAnswersVisible &&
      config.experience.showAnswer &&
      config.showAnswerEnabled,
    feedbackResult,
    officialResult,
    check: facade.actions.check,
    submit: facade.actions.submit,
    reset: () => {
      facade.actions.reset();
    },
    revealHint: () => {
      void facade.actions.revealHint();
    },
    revealAnswer: async () => {
      const reveal = await facade.actions.revealAnswer();
      return reveal ? { answers: reveal.answerKey } : null;
    },
  };
}

interface QuizReviewPolicy {
  resultVisible: boolean;
  authoredReviewVisible: boolean;
  correctAnswersVisible: boolean;
  hintsVisible: boolean;
}

const STANDALONE_REVIEW_POLICY: QuizReviewPolicy = {
  resultVisible: true,
  authoredReviewVisible: true,
  correctAnswersVisible: true,
  hintsVisible: true,
};

const HIDDEN_REVIEW_POLICY: QuizReviewPolicy = {
  resultVisible: false,
  authoredReviewVisible: false,
  correctAnswersVisible: false,
  hintsVisible: false,
};

function quizReviewPolicy(facade: AssessmentProblemFacade): QuizReviewPolicy {
  const quiz = facade.quiz;
  if (!quiz) return STANDALONE_REVIEW_POLICY;
  if (!quiz.attempt?.answerReviewAuthorized) return HIDDEN_REVIEW_POLICY;
  if (quiz.registration.settings.reviewDetail === "none") return HIDDEN_REVIEW_POLICY;
  if (quiz.registration.settings.reviewDetail === "result_only") {
    return {
      resultVisible: true,
      authoredReviewVisible: false,
      correctAnswersVisible: false,
      hintsVisible: false,
    };
  }
  return STANDALONE_REVIEW_POLICY;
}

function reviewResultForPolicy(
  result: AssessmentResult | null,
  policy: QuizReviewPolicy,
): AssessmentResult | null {
  if (!result || !policy.resultVisible) return null;
  if (policy.authoredReviewVisible && policy.correctAnswersVisible) return result;
  return {
    isCorrect: result.isCorrect,
    score: result.score,
    maxScore: result.maxScore,
    feedback: policy.authoredReviewVisible ? result.feedback : null,
    items: {},
  };
}

function isProblemResponse(value: unknown): value is ProblemResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runtimeProblemConfigFromFacade(
  facade: AssessmentProblemFacade,
): AssessmentRuntimeProblemConfig | undefined {
  const config = facade.config;
  const capability = facade.capability;
  const interactionKind = facade.interactionKind;
  const targetId = facade.targetId;
  if (!config || !capability || !interactionKind || !targetId) return undefined;
  const settings = config.settings;
  return {
    kind: interactionKind,
    targetId,
    interactionKind,
    choiceMode: choiceModeForInteraction(interactionKind),
    feedbackMode: settings.feedbackMode,
    maxAttempts: settings.maxAttempts,
    maxSelect: settings.maxSelections ?? null,
    groupName: `assessment-${facade.authoredProblemId}`,
    legend: settings.legend ?? settings.label ?? "",
    placeholder: settings.placeholder ?? "",
    showAnswerEnabled: settings.showAnswer,
    experience: config.experience,
    hintsTotal: config.hintsTotal,
    points: settings.points,
    isGraded: settings.isGraded,
    responseCodec: capability,
  };
}

function assessmentRuntimeDefinitionForBlock(
  definition: BlockDefinition,
  nodeTypeName: string,
): AssessmentRuntimeDefinition {
  if (definition.nodeType !== nodeTypeName) {
    throw new Error(
      `Assessment runtime received definition for "${definition.nodeType}", but the runtime node is "${nodeTypeName}".`,
    );
  }
  const assessment = definition?.capabilities?.assessment;
  if (!assessment) {
    throw new Error(
      `Assessment runtime requested for "${nodeTypeName}", but no assessment capability is registered.`,
    );
  }
  const settingsSchema = getBlockAttrSchema(definition, "settings");
  if (!settingsSchema) {
    throw new Error(
      `Assessment runtime requested for "${nodeTypeName}", but no settings attr schema is registered.`,
    );
  }
  return {
    assessment,
    settingsSchema: settingsSchema as SafeSchema<RuntimeAssessmentSettings>,
  };
}

function createRuntimeProblemConfig(
  node: PMNode,
  definition: AssessmentRuntimeDefinition,
): AssessmentRuntimeProblemConfig {
  const { assessment, settingsSchema } = definition;
  const settings = parseWithDefault<RuntimeAssessmentSettings>(
    settingsSchema,
    node.attrs["settings"],
  );
  const settingsProjection = assessment.projection.projectSettings?.(settings) as
    | Partial<AssessmentTargetSettings>
    | undefined;
  const blockId = String(node.attrs["id"] ?? "");
  const kind = assessment.interactionKind;

  return {
    kind,
    targetId: blockId,
    interactionKind: kind,
    choiceMode: choiceModeForInteraction(kind),
    feedbackMode: settings.feedbackMode,
    maxAttempts: settings.maxAttempts,
    maxSelect: settingsProjection?.maxSelections ?? settings.maxSelect ?? null,
    groupName: `${node.type.name.replaceAll("_", "-")}-${blockId || "pending"}`,
    legend: settingsProjection?.legend ?? settingsProjection?.label ?? "",
    placeholder: settingsProjection?.placeholder ?? "",
    showAnswerEnabled: settings.showAnswer,
    experience: assessment.experience,
    hintsTotal: countAssessmentHints(node),
    points: settings.points,
    isGraded: settings.isGraded,
    responseCodec: assessment.response,
  };
}

function choiceModeForInteraction(kind: AssessmentInteractionKind): ChoiceMode | null {
  if (kind === "single-select") return "single";
  if (kind === "multi-select") return "multiple";
  return null;
}

function parseWithDefault<T>(schema: SafeSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : schema.parse({});
}
