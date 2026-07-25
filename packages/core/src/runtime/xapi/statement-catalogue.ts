import { z } from "zod";

import type { AssessmentInteractionKind, AssessmentResult } from "@scaffold/contracts";
import {
  XapiIriSchema,
  XapiStatementDraftSchema,
  type XapiActivity,
  type XapiContextTemplate,
  type XapiInteractionType,
  type XapiIri,
  type XapiStatementDraft,
  type XapiVerb,
} from "../../host/ports/xapi";

function immutableVerb(id: XapiIri, display: string): XapiVerb {
  return Object.freeze({
    id,
    display: Object.freeze({ en: display }),
  });
}

export const XAPI_VERBS = Object.freeze({
  initialized: immutableVerb("http://adlnet.gov/expapi/verbs/initialized", "initialized"),
  answered: immutableVerb("http://adlnet.gov/expapi/verbs/answered", "answered"),
  interacted: immutableVerb("http://adlnet.gov/expapi/verbs/interacted", "interacted"),
  completed: immutableVerb("http://adlnet.gov/expapi/verbs/completed", "completed"),
  passed: immutableVerb("http://adlnet.gov/expapi/verbs/passed", "passed"),
  failed: immutableVerb("http://adlnet.gov/expapi/verbs/failed", "failed"),
  terminated: immutableVerb("http://adlnet.gov/expapi/verbs/terminated", "terminated"),
});

export const XAPI_ACTIVITY_TYPES = Object.freeze({
  course: "http://adlnet.gov/expapi/activities/course",
  quiz: "http://adlnet.gov/expapi/activities/assessment",
  assessmentQuestion: "http://adlnet.gov/expapi/activities/cmi.interaction",
  learnerActivity: "https://scaffold.ac/xapi/activity-types/learner-activity",
  hint: "https://scaffold.ac/xapi/activity-types/hint",
});

export const XAPI_EXTENSIONS = Object.freeze({
  assessmentAttemptNumber: "https://scaffold.ac/xapi/extensions/assessment-attempt-number",
  quizAttemptId: "https://scaffold.ac/xapi/extensions/quiz-attempt-id",
  learnerActivityKind: "https://scaffold.ac/xapi/extensions/learner-activity-kind",
  hintNumber: "https://scaffold.ac/xapi/extensions/hint-number",
});

const XAPI_LEARNER_ACTIVITY_KINDS = ["flashcard", "checklist"] as const;
export type XapiLearnerActivityKind = (typeof XAPI_LEARNER_ACTIVITY_KINDS)[number];

export function isXapiLearnerActivityKind(value: string): value is XapiLearnerActivityKind {
  return XAPI_LEARNER_ACTIVITY_KINDS.some((kind) => kind === value);
}

function requiredIdentity(name: string, value: string): string {
  if (typeof value !== "string" || !/\S/u.test(value)) {
    throw new Error(`${name} must be a non-blank string`);
  }
  return value;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function rootActivityId(value: XapiIri): XapiIri {
  return XapiIriSchema.parse(value);
}

function derivedActivityId(value: string): XapiIri {
  return XapiIriSchema.parse(value);
}

function createChildActivityId(
  kind: "quiz" | "assessment" | "learner-activity",
  rootId: XapiIri,
  localId: string,
): XapiIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/${kind}?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&id=${rfc3986Encode(requiredIdentity("localId", localId))}`,
  );
}

export function createQuizActivityId(rootId: XapiIri, quizId: string): XapiIri {
  return createChildActivityId("quiz", rootId, requiredIdentity("quizId", quizId));
}

export function createAssessmentActivityId(rootId: XapiIri, targetId: string): XapiIri {
  return createChildActivityId("assessment", rootId, requiredIdentity("targetId", targetId));
}

export function createLearnerActivityId(rootId: XapiIri, blockId: string): XapiIri {
  return createChildActivityId("learner-activity", rootId, requiredIdentity("blockId", blockId));
}

export function createHintActivityId(
  rootId: XapiIri,
  targetId: string,
  hintNumber: number,
): XapiIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/hint?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&id=${rfc3986Encode(
      requiredIdentity("targetId", targetId),
    )}&number=${positiveInteger("hintNumber", hintNumber)}`,
  );
}

function rootActivity(rootId: XapiIri, title?: string | null): XapiActivity {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  return {
    objectType: "Activity",
    id: rootActivityId(rootId),
    definition: {
      ...(normalizedTitle ? { name: { en: normalizedTitle } } : {}),
      type: XAPI_ACTIVITY_TYPES.course,
    },
  };
}

function quizActivity(rootId: XapiIri, quizId: string): XapiActivity {
  return {
    objectType: "Activity",
    id: createQuizActivityId(rootId, quizId),
    definition: { type: XAPI_ACTIVITY_TYPES.quiz },
  };
}

function interactionType(kind: AssessmentInteractionKind): XapiInteractionType {
  switch (kind) {
    case "single-select":
    case "multi-select":
    case "spatial-hotspot":
      return "choice";
    case "sequence":
      return "sequencing";
    case "match":
    case "classify":
      return "matching";
    case "fill-blanks":
      return "performance";
    default:
      throw new Error(`Unsupported assessment interaction kind: ${String(kind)}`);
  }
}

function assessmentActivity(
  rootId: XapiIri,
  targetId: string,
  kind?: AssessmentInteractionKind,
): XapiActivity {
  return {
    objectType: "Activity",
    id: createAssessmentActivityId(rootId, targetId),
    definition: {
      type: XAPI_ACTIVITY_TYPES.assessmentQuestion,
      ...(kind === undefined ? {} : { interactionType: interactionType(kind) }),
    },
  };
}

function learnerActivity(
  rootId: XapiIri,
  blockId: string,
  activityKind: XapiLearnerActivityKind,
): XapiActivity {
  if (!isXapiLearnerActivityKind(activityKind)) {
    throw new Error(`Unsupported learner activity kind: ${String(activityKind)}`);
  }
  return {
    objectType: "Activity",
    id: createLearnerActivityId(rootId, blockId),
    definition: {
      type: XAPI_ACTIVITY_TYPES.learnerActivity,
      extensions: {
        [XAPI_EXTENSIONS.learnerActivityKind]: activityKind,
      },
    },
  };
}

function parentContext(parent: XapiActivity): XapiContextTemplate {
  return {
    contextActivities: {
      parent: [parent],
    },
  };
}

function quizContext(rootId: XapiIri, quizId: string, attemptId: string): XapiContextTemplate {
  return {
    ...parentContext(quizActivity(rootId, quizId)),
    extensions: {
      [XAPI_EXTENSIONS.quizAttemptId]: requiredIdentity("attemptId", attemptId),
    },
  };
}

function validatedDraft(value: XapiStatementDraft): XapiStatementDraft {
  return XapiStatementDraftSchema.parse(value);
}

function validNormalizedResult(
  result: Pick<AssessmentResult, "isCorrect" | "score">,
): Pick<AssessmentResult, "isCorrect" | "score"> {
  if (
    typeof result.isCorrect !== "boolean" ||
    !Number.isFinite(result.score) ||
    result.score < 0 ||
    result.score > 1
  ) {
    throw new Error("Assessment result must contain a boolean outcome and normalized score");
  }
  return result;
}

export function buildInitializedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly title?: string | null;
}): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.initialized,
    object: rootActivity(input.rootActivityId, input.title),
  });
}

export function buildAnsweredStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly targetId: string;
  readonly interactionKind: AssessmentInteractionKind;
  readonly result: Pick<AssessmentResult, "isCorrect" | "score">;
  readonly attemptNumber: number;
  readonly quiz?: {
    readonly quizId: string;
    readonly attemptId: string;
  } | null;
}): XapiStatementDraft {
  const result = validNormalizedResult(input.result);
  const attemptNumber = positiveInteger("attemptNumber", input.attemptNumber);
  return validatedDraft({
    verb: XAPI_VERBS.answered,
    object: assessmentActivity(input.rootActivityId, input.targetId, input.interactionKind),
    result: {
      success: result.isCorrect,
      score: {
        scaled: result.score,
        raw: result.score,
        min: 0,
        max: 1,
      },
      extensions: {
        [XAPI_EXTENSIONS.assessmentAttemptNumber]: attemptNumber,
      },
    },
    context: input.quiz
      ? quizContext(input.rootActivityId, input.quiz.quizId, input.quiz.attemptId)
      : parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildHintInteractedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly targetId: string;
  readonly hintNumber: number;
}): XapiStatementDraft {
  const hintNumber = positiveInteger("hintNumber", input.hintNumber);
  return validatedDraft({
    verb: XAPI_VERBS.interacted,
    object: {
      objectType: "Activity",
      id: createHintActivityId(input.rootActivityId, input.targetId, hintNumber),
      definition: { type: XAPI_ACTIVITY_TYPES.hint },
    },
    result: {
      extensions: {
        [XAPI_EXTENSIONS.hintNumber]: hintNumber,
      },
    },
    context: parentContext(assessmentActivity(input.rootActivityId, input.targetId)),
  });
}

interface LearnerActivityStatementInput {
  readonly rootActivityId: XapiIri;
  readonly blockId: string;
  readonly activityKind: XapiLearnerActivityKind;
}

function learnerActivityStatementParts(input: LearnerActivityStatementInput): {
  readonly object: XapiActivity;
  readonly context: XapiContextTemplate;
} {
  return {
    object: learnerActivity(input.rootActivityId, input.blockId, input.activityKind),
    context: parentContext(rootActivity(input.rootActivityId)),
  };
}

export function buildLearnerActivityInteractedStatementDraft(
  input: LearnerActivityStatementInput,
): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.interacted,
    ...learnerActivityStatementParts(input),
  });
}

export function buildLearnerActivityCompletedStatementDraft(
  input: LearnerActivityStatementInput,
): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.completed,
    ...learnerActivityStatementParts(input),
    result: { completion: true },
  });
}

const AuthoritativeInstantSchema = z.string().datetime({ offset: true });

function durationFromMilliseconds(milliseconds: number): string {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new Error("durationMs must be a non-negative safe integer");
  }
  const seconds = Math.floor(milliseconds / 1000);
  const remainingMilliseconds = milliseconds % 1000;
  if (remainingMilliseconds === 0) {
    return `PT${seconds}S`;
  }
  const fractionalSeconds = remainingMilliseconds.toString().padStart(3, "0").replace(/0+$/u, "");
  return `PT${seconds}.${fractionalSeconds}S`;
}

function elapsedDuration(startedAt: string | null, finishedAt: string | null): string | undefined {
  const parsedStart = AuthoritativeInstantSchema.safeParse(startedAt);
  const parsedFinish = AuthoritativeInstantSchema.safeParse(finishedAt);
  if (!parsedStart.success || !parsedFinish.success) return undefined;

  const startMilliseconds = Date.parse(parsedStart.data);
  const finishMilliseconds = Date.parse(parsedFinish.data);
  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(finishMilliseconds) ||
    finishMilliseconds < startMilliseconds
  ) {
    return undefined;
  }
  return durationFromMilliseconds(finishMilliseconds - startMilliseconds);
}

interface QuizStatementInput {
  readonly rootActivityId: XapiIri;
  readonly quizId: string;
  readonly attemptId: string;
}

function quizStatementParts(input: QuizStatementInput): {
  readonly object: XapiActivity;
  readonly context: XapiContextTemplate;
} {
  return {
    object: quizActivity(input.rootActivityId, input.quizId),
    context: {
      ...parentContext(rootActivity(input.rootActivityId)),
      extensions: {
        [XAPI_EXTENSIONS.quizAttemptId]: requiredIdentity("attemptId", input.attemptId),
      },
    },
  };
}

export function buildQuizCompletedStatementDraft(
  input: QuizStatementInput & {
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
  },
): XapiStatementDraft {
  const duration = elapsedDuration(input.startedAt, input.finishedAt);
  return validatedDraft({
    verb: XAPI_VERBS.completed,
    ...quizStatementParts(input),
    result: {
      completion: true,
      ...(duration === undefined ? {} : { duration }),
    },
  });
}

export function buildQuizSuccessStatementDraft(
  input: QuizStatementInput & {
    readonly successStatus: "passed" | "failed";
    readonly score: number;
    readonly maxScore: number;
  },
): XapiStatementDraft {
  if (input.successStatus !== "passed" && input.successStatus !== "failed") {
    throw new Error("successStatus must be passed or failed");
  }
  if (
    !Number.isFinite(input.score) ||
    !Number.isFinite(input.maxScore) ||
    input.maxScore <= 0 ||
    input.score < 0 ||
    input.score > input.maxScore
  ) {
    throw new Error("Quiz score must be within a positive authoritative score range");
  }
  const success = input.successStatus === "passed";
  return validatedDraft({
    verb: success ? XAPI_VERBS.passed : XAPI_VERBS.failed,
    ...quizStatementParts(input),
    result: {
      success,
      score: {
        scaled: input.score / input.maxScore,
        raw: input.score,
        min: 0,
        max: input.maxScore,
      },
    },
  });
}

export function buildTerminatedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly title?: string | null;
  readonly durationMs: number;
}): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.terminated,
    object: rootActivity(input.rootActivityId, input.title),
    result: { duration: durationFromMilliseconds(input.durationMs) },
  });
}
